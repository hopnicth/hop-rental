import { createError } from "h3";
import {
  asNonEmptyString,
  isPayableOrderPaymentStatus,
  normalizeCurrency,
  toGatewayAmount,
  type PaymentAttemptStatus,
} from "~~/server/utils/payment-core";
import type { NormalizedGatewayCharge } from "~~/server/utils/omise";

type AnyClient = { from: (table: string) => any };
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

export function buildPaymentReturnUri(event: { node: { req: { headers: any } } }, orderId: string): string {
  const proto = event.node.req.headers["x-forwarded-proto"] ?? "http";
  const host = event.node.req.headers["x-forwarded-host"] ?? event.node.req.headers.host;
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
    paymentAttemptId?: string | null;
    kind: string;
    audience: "admin" | "user";
    severity: "info" | "warning" | "error" | "critical";
    message: string;
    metadata?: Record<string, unknown>;
  },
) {
  await client.from("payment_alerts").insert({
    order_id: input.orderId ?? null,
    payment_attempt_id: input.paymentAttemptId ?? null,
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
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });

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

export function assertGatewayAmountMatches(order: AnyRecord, charge: AnyRecord): void {
  const expectedAmount = toGatewayAmount(order.grand_total);
  const actualAmount = Number(charge.amount);
  const expectedCurrency = normalizeCurrency(order.currency_code);
  const actualCurrency = normalizeCurrency(charge.currency);
  if (actualAmount !== expectedAmount || actualCurrency !== expectedCurrency) {
    throw createError({ statusCode: 409, statusMessage: "PAYMENT_AMOUNT_MISMATCH" });
  }
}

export function shouldExpireAttempt(attempt: AnyRecord, now = new Date()): boolean {
  const status = String(attempt.status ?? "");
  const expiresAt = asNonEmptyString(attempt.expires_at);
  return (
    attempt.method === "promptpay" &&
    (status === "pending" || status === "requires_action" || status === "created") &&
    !!expiresAt &&
    new Date(expiresAt).getTime() <= now.getTime()
  );
}

export function terminalPaymentStatus(status: unknown): status is PaymentAttemptStatus {
  return status === "paid" || status === "failed" || status === "expired" || status === "cancelled" || status === "refunded";
}