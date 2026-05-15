import { createError } from "h3";
import {
  asPaymentNonEmptyString,
  isPayableOrderPaymentStatus,
  normalizeCurrency,
  toGatewayAmount,
  type PaymentAttemptStatus,
} from "~~/server/utils/payment-core";
import type { NormalizedGatewayCharge } from "~~/server/utils/omise";

type QueryError = { message?: string; code?: string; details?: string } | null;
type WriteResult = { error: QueryError };
type SingleResult = Promise<{ data: AnyRecord | null; error: QueryError }>;
type SelectRequest = {
  eq(column: string, value: unknown): SelectRequest;
  maybeSingle(): SingleResult;
};
type UpdateRequest = {
  eq(column: string, value: unknown): UpdateRequest;
  neq(column: string, value: unknown): Promise<WriteResult>;
  select(columns: string): { single(): SingleResult };
};
type DeleteRequest = {
  eq(column: string, value: unknown): Promise<WriteResult>;
};
type TableClient = {
  insert(payload: unknown): Promise<WriteResult>;
  update(payload: Record<string, unknown>): UpdateRequest;
  select(columns: string): SelectRequest;
  delete(): DeleteRequest;
};
type AnyClient = {
  from: (table: string) => TableClient;
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<WriteResult>;
};
type AnyRecord = Record<string, unknown>;

export const PAYMENT_ATTEMPT_SELECT =
  "id, order_id, user_id, gateway, method, status, amount, currency_code, idempotency_key, gateway_charge_id, gateway_source_id, gateway_authorize_uri, qr_image_url, expires_at, failure_code, failure_message, raw_gateway_response, created_at, updated_at";

export function assertOrderPayable(order: AnyRecord): void {
  if (order.payment_status === "paid") {
    throw createError({ statusCode: 409, statusMessage: "ORDER_ALREADY_PAID" });
  }
  if (!isPayableOrderPaymentStatus(order.payment_status)) {
    throw createError({ statusCode: 422, statusMessage: "ORDER_NOT_PAYABLE" });
  }
}

export function buildPaymentReturnUri(
  event: { node: { req: { headers: Record<string, string | undefined> } } },
  orderId: string,
): string {
  const proto = event.node.req.headers["x-forwarded-proto"] ?? "http";
  const host =
    event.node.req.headers["x-forwarded-host"] ?? event.node.req.headers.host;
  return `${proto}://${host}/payment/result?orderId=${encodeURIComponent(orderId)}`;
}

export function mapAttemptResponse(attempt: AnyRecord) {
  return {
    paymentAttemptId: String(attempt.id),
    orderId: String(attempt.order_id),
    method: attempt.method,
    status: attempt.status,
    amount: Number(attempt.amount) || 0,
    currency: normalizeCurrency(attempt.currency_code),
    redirectUrl: attempt.gateway_authorize_uri ?? null,
    qrImageUrl: attempt.qr_image_url ?? null,
    expiresAt: attempt.expires_at ?? null,
  };
}

export async function recordPaymentAlert(
  client: AnyClient,
  input: {
    orderId?: string | null;
    bookingId?: string | null;
    paymentAttemptId?: string | null;
    rentalBookingPaymentAttemptId?: string | null;
    mixedCheckoutSessionId?: string | null;
    mixedPaymentAttemptId?: string | null;
    mixedPaymentAllocationId?: string | null;
    kind: string;
    audience: "admin" | "user";
    severity: "info" | "warning" | "error" | "critical";
    message: string;
    metadata?: Record<string, unknown>;
  },
) {
  await client.from("payment_alerts").insert({
    order_id: input.orderId ?? null,
    booking_id: input.bookingId ?? null,
    payment_attempt_id: input.paymentAttemptId ?? null,
    rental_booking_payment_attempt_id:
      input.rentalBookingPaymentAttemptId ?? null,
    mixed_checkout_session_id: input.mixedCheckoutSessionId ?? null,
    mixed_payment_attempt_id: input.mixedPaymentAttemptId ?? null,
    mixed_payment_allocation_id: input.mixedPaymentAllocationId ?? null,
    kind: input.kind,
    audience: input.audience,
    severity: input.severity,
    message: input.message,
    metadata: input.metadata ?? {},
  });
}

export async function applyGatewayResult(
  client: AnyClient,
  input: {
    order: AnyRecord;
    attempt: AnyRecord;
    result: NormalizedGatewayCharge;
  },
) {
  const { order, attempt, result } = input;
  const status = result.status;
  const update: Record<string, unknown> = {
    status,
    gateway_charge_id: result.gatewayChargeId,
    gateway_source_id: result.gatewaySourceId,
    gateway_authorize_uri: result.authorizeUri,
    qr_image_url: result.qrImageUrl,
    expires_at: result.expiresAt ?? attempt.expires_at ?? null,
    failure_code: result.failureCode,
    failure_message: result.failureMessage,
    raw_gateway_response: result.raw,
  };

  const { data: updated, error } = await client
    .from("payment_attempts")
    .update(update)
    .eq("id", attempt.id)
    .select(PAYMENT_ATTEMPT_SELECT)
    .single();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });

  if (status === "paid" && order.payment_status !== "paid") {
    await client
      .from("orders")
      .update({ payment_status: "paid", status: "confirmed" })
      .eq("id", order.id)
      .neq("payment_status", "paid");
    await recordPaymentAlert(client, {
      orderId: String(order.id),
      paymentAttemptId: String(attempt.id),
      kind: "payment_success",
      audience: "user",
      severity: "info",
      message: "Payment completed successfully.",
    });
    await applyOrderInventory(client, String(order.id), String(attempt.id));
    await clearUserCartAfterPayment(client, order);
  }

  if (status === "failed" || status === "expired") {
    await recordPaymentAlert(client, {
      orderId: String(order.id),
      paymentAttemptId: String(attempt.id),
      kind: status === "expired" ? "payment_expired" : "payment_failed",
      audience: "user",
      severity: "warning",
      message: status === "expired" ? "Payment expired." : "Payment failed.",
    });
  }

  return updated as AnyRecord;
}

/**
 * Idempotent inventory deduction triggered after a paid transition.
 * Failures are surfaced as admin alerts but never block the payment flow.
 */
export async function applyOrderInventory(
  client: AnyClient,
  orderId: string,
  paymentAttemptId: string,
): Promise<void> {
  try {
    if (typeof client.rpc !== "function") return;
    const { error } = await client.rpc("f_apply_order_inventory", {
      p_order_id: orderId,
    });
    if (error) {
      await recordPaymentAlert(client, {
        orderId,
        paymentAttemptId,
        kind: "inventory_apply_failed",
        audience: "admin",
        severity: "critical",
        message: `Inventory hook failed: ${error.message ?? "unknown error"}`,
        metadata: { code: error.code, details: error.details },
      });
    }
  } catch (err) {
    await recordPaymentAlert(client, {
      orderId,
      paymentAttemptId,
      kind: "inventory_apply_failed",
      audience: "admin",
      severity: "critical",
      message: `Inventory hook threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
    }).catch(() => {});
  }
}

/**
 * Empty the buyer's persistent cart after a paid transition. The cart row
 * itself is preserved and updated_at is bumped so client hydration trusts the
 * cleared DB state over any stale localStorage snapshot.
 */
async function clearUserCartAfterPayment(
  client: AnyClient,
  order: AnyRecord,
): Promise<void> {
  const userId = order.user_id ? String(order.user_id) : null;
  if (!userId) return;
  try {
    const { data: cartRow } = await client
      .from("carts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const cartId = cartRow?.id ? String(cartRow.id) : null;
    if (!cartId) return;

    await client.from("cart_items").delete().eq("cart_id", cartId);
    await client
      .from("carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", cartId);
  } catch {
    // Cart clearing is best-effort; the client polling loop will reconcile.
  }
}

export function assertGatewayAmountMatches(
  order: AnyRecord,
  charge: AnyRecord,
): void {
  const expectedAmount = toGatewayAmount(order.grand_total);
  const actualAmount = Number(charge.amount);
  const expectedCurrency = normalizeCurrency(order.currency_code);
  const actualCurrency = normalizeCurrency(charge.currency);
  if (actualAmount !== expectedAmount || actualCurrency !== expectedCurrency) {
    throw createError({
      statusCode: 409,
      statusMessage: "PAYMENT_AMOUNT_MISMATCH",
    });
  }
}

export function shouldExpireAttempt(
  attempt: AnyRecord,
  now = new Date(),
): boolean {
  const status = String(attempt.status ?? "");
  const expiresAt = asPaymentNonEmptyString(attempt.expires_at);
  return (
    attempt.method === "promptpay" &&
    (status === "pending" ||
      status === "requires_action" ||
      status === "created") &&
    !!expiresAt &&
    new Date(expiresAt).getTime() <= now.getTime()
  );
}

export function terminalPaymentStatus(
  status: unknown,
): status is PaymentAttemptStatus {
  return (
    status === "paid" ||
    status === "failed" ||
    status === "expired" ||
    status === "cancelled" ||
    status === "refunded"
  );
}
