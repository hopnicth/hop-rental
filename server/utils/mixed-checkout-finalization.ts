import { createError } from "h3";
import {
  normalizeCurrency,
  toGatewayAmount,
} from "~~/server/utils/payment-core";
import type { NormalizedGatewayCharge } from "~~/server/utils/omise";
import {
  applyOrderInventory,
  recordPaymentAlert,
} from "~~/server/utils/payments";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";
import {
  bookingDepositMethodToLegacyDepositMethod,
  computeBookingDepositLinesFromBooking,
} from "~~/server/utils/rental-booking-deposit-payment";

type AnyRecord = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc?: (fn: string, args?: AnyRecord) => Promise<{ error: unknown }>;
};

export const MIXED_PAYMENT_ATTEMPT_SELECT =
  "id, mixed_checkout_session_id, user_id, gateway, method, status, amount, currency_code, idempotency_key, gateway_charge_id, gateway_source_id, gateway_authorize_uri, qr_image_url, expires_at, failure_code, failure_message, metadata, raw_gateway_response, created_at, updated_at";
export const MIXED_CHECKOUT_SESSION_SELECT =
  "id, user_id, cart_id, sale_order_id, status, checkout_kind, currency_code, amount_total, sale_subtotal_amount, shipping_amount, booking_deposit_total_amount, idempotency_key, validation_snapshot, allocation_plan_snapshot, expires_at, created_at, updated_at";
export const MIXED_PAYMENT_ALLOCATION_SELECT =
  "id, mixed_checkout_session_id, mixed_payment_attempt_id, user_id, allocation_type, target_type, target_id, order_id, order_line_id, rental_booking_id, amount, currency_code, tax_category, wht_rate, wht_amount, status, paid_at, finalized_at, failure_code, failure_message, metadata, created_at, updated_at";

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}
function nowIso() {
  return new Date().toISOString();
}
function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err ?? "UNKNOWN_ERROR");
}

function isCancelledMixedSession(session: AnyRecord) {
  return String(session.status ?? "") === "cancelled";
}

function metadata(row: AnyRecord): AnyRecord {
  return row.metadata &&
    typeof row.metadata === "object" &&
    !Array.isArray(row.metadata)
    ? (row.metadata as AnyRecord)
    : {};
}

function saleCartLineFromAllocation(
  allocation: AnyRecord,
): { productId: string; skuId: string } | null {
  if (allocation.allocation_type !== "sale_product") return null;
  const meta = metadata(allocation);
  const productId =
    typeof meta.productId === "string" && meta.productId
      ? meta.productId
      : null;
  const skuId =
    typeof meta.skuId === "string" && meta.skuId
      ? meta.skuId
      : typeof allocation.target_id === "string" && allocation.target_id
        ? allocation.target_id
        : null;
  return productId && skuId ? { productId, skuId } : null;
}

async function clearMixedCheckoutSaleCartItems(input: {
  client: AnyClient;
  session: AnyRecord;
  allocations: AnyRecord[];
}) {
  const cartId =
    typeof input.session.cart_id === "string" && input.session.cart_id
      ? input.session.cart_id
      : null;
  const userId =
    typeof input.session.user_id === "string" && input.session.user_id
      ? input.session.user_id
      : null;
  if (!cartId || !userId) return;
  const saleLines = [
    ...new Map(
      input.allocations
        .map(saleCartLineFromAllocation)
        .filter(Boolean)
        .map((line) => [`${line!.productId}:${line!.skuId}`, line!] as const),
    ).values(),
  ];
  if (saleLines.length === 0) return;
  try {
    const { data: cart } = await input.client
      .from("carts")
      .select("id,user_id")
      .eq("id", cartId)
      .maybeSingle();
    if (!cart || String(cart.user_id ?? "") !== userId) return;
    for (const line of saleLines)
      await input.client
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .eq("product_id", line.productId)
        .eq("sku_id", line.skuId);
    await input.client
      .from("carts")
      .update({ updated_at: nowIso() })
      .eq("id", cartId);
  } catch {
    // Cart cleanup is best-effort; payment finalization must remain authoritative.
  }
}

export function assertMixedGatewayAmountMatches(input: {
  attempt: AnyRecord;
  allocations: AnyRecord[];
  charge: AnyRecord;
}) {
  const attemptAmount = money(input.attempt.amount);
  const allocationSum = money(
    input.allocations.reduce((sum, row) => sum + money(row.amount), 0),
  );
  const actualAmount = Number(input.charge.amount);
  const actualCurrency = normalizeCurrency(input.charge.currency);
  const expectedCurrency = normalizeCurrency(input.attempt.currency_code);
  if (
    Math.abs(attemptAmount - allocationSum) > 0.01 ||
    actualAmount !== toGatewayAmount(attemptAmount) ||
    actualCurrency !== expectedCurrency
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: "MIXED_PAYMENT_AMOUNT_MISMATCH",
    });
  }
}

async function recordMixedAlertOnce(
  client: AnyClient,
  input: {
    kind: string;
    message: string;
    severity: "warning" | "error" | "critical" | "info";
    sessionId: string;
    attemptId: string;
    allocationId?: string | null;
    orderId?: string | null;
    bookingId?: string | null;
    metadata?: AnyRecord;
  },
) {
  const q = client
    .from("payment_alerts")
    .select("id")
    .eq("mixed_checkout_session_id", input.sessionId)
    .eq("mixed_payment_attempt_id", input.attemptId)
    .eq("kind", input.kind)
    .eq("audience", "admin");
  if (input.allocationId)
    q.eq("mixed_payment_allocation_id", input.allocationId);
  const existing = await q.maybeSingle?.();
  if (existing?.data) return;
  await recordPaymentAlert(client, {
    kind: input.kind,
    audience: "admin",
    severity: input.severity,
    message: input.message,
    orderId: input.orderId,
    bookingId: input.bookingId,
    mixedCheckoutSessionId: input.sessionId,
    mixedPaymentAttemptId: input.attemptId,
    mixedPaymentAllocationId: input.allocationId ?? null,
    metadata: input.metadata ?? {},
  });
}

async function recordPaidAfterCancelAlert(input: {
  client: AnyClient;
  session: AnyRecord;
  attempt: AnyRecord;
  result: NormalizedGatewayCharge;
}) {
  await recordMixedAlertOnce(input.client, {
    kind: "mixed_payment_paid_after_cancel",
    severity: "critical",
    sessionId: String(input.session.id),
    attemptId: String(input.attempt.id),
    message:
      "Gateway reported a paid mixed checkout charge after the user cancelled the checkout session. No allocations were finalized; staff review/refund handling is required.",
    metadata: { gatewayChargeId: input.result.gatewayChargeId },
  });
}

async function markAmountMismatch(input: {
  client: AnyClient;
  session: AnyRecord;
  attempt: AnyRecord;
  reason: string;
  metadata?: AnyRecord;
}) {
  await input.client
    .from("mixed_payment_attempts")
    .update({
      status: "finalization_failed",
      failure_code: "MIXED_PAYMENT_AMOUNT_MISMATCH",
      failure_message: input.reason,
    })
    .eq("id", input.attempt.id);
  await input.client
    .from("mixed_checkout_sessions")
    .update({ status: "finalization_failed" })
    .eq("id", input.session.id);
  await recordMixedAlertOnce(input.client, {
    kind: "mixed_payment_amount_mismatch",
    severity: "critical",
    sessionId: String(input.session.id),
    attemptId: String(input.attempt.id),
    message:
      "Mixed checkout gateway amount/currency did not match attempt amount or allocation sum. No allocations were finalized.",
    metadata: input.metadata,
  });
}

async function finalizeSaleAllocations(input: {
  client: AnyClient;
  session: AnyRecord;
  attempt: AnyRecord;
  allocations: AnyRecord[];
}) {
  const saleAllocations = input.allocations.filter(
    (a) =>
      a.allocation_type === "sale_product" || a.allocation_type === "shipping",
  );
  if (saleAllocations.length === 0) return true;
  try {
    const orderId = String(
      input.session.sale_order_id ?? saleAllocations[0]?.order_id ?? "",
    );
    if (!orderId) throw new Error("MIXED_SALE_ORDER_MISSING");
    const { data: order, error } = await input.client
      .from("orders")
      .select("id, user_id, status, payment_status, grand_total, currency_code")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("MIXED_SALE_ORDER_MISSING");
    if (order.payment_status !== "paid") {
      await input.client
        .from("orders")
        .update({
          payment_status: "paid",
          status: "confirmed",
          mixed_payment_attempt_id: input.attempt.id,
        })
        .eq("id", order.id)
        .neq("payment_status", "paid");
      await applyOrderInventory(
        input.client,
        String(order.id),
        String(input.attempt.id),
      );
    }
    for (const allocation of saleAllocations) {
      if (allocation.status !== "finalized")
        await input.client
          .from("mixed_payment_allocations")
          .update({
            status: "finalized",
            finalized_at: nowIso(),
            failure_code: null,
            failure_message: null,
          })
          .eq("id", allocation.id);
    }
    return true;
  } catch (err) {
    const reason = errorMessage(err);
    for (const allocation of saleAllocations) {
      await input.client
        .from("mixed_payment_allocations")
        .update({
          status: "admin_review_required",
          failure_code: "MIXED_SALE_FINALIZATION_FAILED",
          failure_message: reason,
        })
        .eq("id", allocation.id)
        .neq("status", "finalized");
      await recordMixedAlertOnce(input.client, {
        kind: "mixed_sale_finalization_failed",
        severity: "critical",
        sessionId: String(input.session.id),
        attemptId: String(input.attempt.id),
        allocationId: String(allocation.id),
        orderId: String(
          allocation.order_id ?? input.session.sale_order_id ?? "",
        ),
        message:
          "Mixed checkout sale allocation could not be finalized. Staff review required.",
        metadata: { reason },
      });
    }
    return false;
  }
}

async function finalizeBookingAllocation(input: {
  client: AnyClient;
  session: AnyRecord;
  attempt: AnyRecord;
  allocation: AnyRecord;
}) {
  if (input.allocation.status === "finalized") return true;
  const bookingId = String(
    input.allocation.rental_booking_id ?? input.allocation.target_id ?? "",
  );
  try {
    const { data: booking, error } = await input.client
      .from("rental_bookings")
      .select(
        "id, user_id, status, asset_id, sku_id, start_date, end_date, rental_days, hub_id, daily_rate, weekly_rate, monthly_rate, rental_total, deposit_amount, currency_code, pricing_breakdown, booking_deposit_payment_status, booking_deposit_paid_amount, booking_deposit_paid_at, booking_deposit_payment_attempt_id, booking_deposit_mixed_allocation_id",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("RENTAL_BOOKING_NOT_FOUND");
    const { bookingDeposit } = computeBookingDepositLinesFromBooking({
      booking,
    });
    if (
      Math.abs(
        money(input.allocation.amount) - money(bookingDeposit.grossAmount),
      ) > 0.01
    )
      throw new Error("BOOKING_DEPOSIT_AMOUNT_MISMATCH");
    if (
      booking.status !== "confirmed" ||
      booking.booking_deposit_mixed_allocation_id !== input.allocation.id
    ) {
      await input.client
        .from("rental_bookings")
        .update({
          booking_deposit_payment_status: "paid",
          booking_deposit_paid_amount: money(input.allocation.amount),
          booking_deposit_paid_at: nowIso(),
          booking_deposit_mixed_allocation_id: input.allocation.id,
          deposit_paid_amount: money(input.allocation.amount),
          deposit_payment_method: bookingDepositMethodToLegacyDepositMethod(
            input.attempt.method,
          ),
          booking_deposit_confirm_failed_at: null,
          booking_deposit_confirm_failure_reason: null,
        })
        .eq("id", booking.id);
      if (booking.status !== "confirmed")
        await confirmRentalBooking({
          adminClient: input.client,
          bookingId: String(booking.id),
          userId: String(booking.user_id),
          requireBookingDepositPaid: true,
        });
    }
    await input.client
      .from("mixed_payment_allocations")
      .update({
        status: "finalized",
        paid_at: input.allocation.paid_at ?? nowIso(),
        finalized_at: nowIso(),
        failure_code: null,
        failure_message: null,
      })
      .eq("id", input.allocation.id);
    return true;
  } catch (err) {
    const reason = errorMessage(err);
    await input.client
      .from("mixed_payment_allocations")
      .update({
        status: "paid_confirm_failed",
        failure_code: "MIXED_BOOKING_CONFIRM_FAILED",
        failure_message: reason,
      })
      .eq("id", input.allocation.id)
      .neq("status", "finalized");
    if (bookingId)
      await input.client
        .from("rental_bookings")
        .update({
          booking_deposit_payment_status: "paid_confirm_failed",
          booking_deposit_confirm_failed_at: nowIso(),
          booking_deposit_confirm_failure_reason: reason,
        })
        .eq("id", bookingId)
        .neq("status", "confirmed");
    await recordMixedAlertOnce(input.client, {
      kind: "mixed_booking_confirm_failed",
      severity: "critical",
      sessionId: String(input.session.id),
      attemptId: String(input.attempt.id),
      allocationId: String(input.allocation.id),
      bookingId,
      message:
        "Mixed checkout Booking Deposit was paid, but rental booking confirmation failed. Staff review/refund required.",
      metadata: { reason },
    });
    return false;
  }
}

export async function applyMixedCheckoutGatewayResult(input: {
  client: AnyClient;
  session: AnyRecord;
  attempt: AnyRecord;
  result: NormalizedGatewayCharge;
}) {
  const { client, session, attempt, result } = input;
  if (isCancelledMixedSession(session)) {
    if (result.status === "paid") {
      await recordPaidAfterCancelAlert({ client, session, attempt, result });
    }
    return {
      ok: true,
      status: "cancelled",
      cancelled: true,
      finalized: false,
    };
  }
  const { data: refreshedAllocations, error: allocationError } = await client
    .from("mixed_payment_allocations")
    .select(MIXED_PAYMENT_ALLOCATION_SELECT)
    .eq("mixed_checkout_session_id", session.id);
  if (allocationError)
    throw createError({
      statusCode: 500,
      statusMessage: allocationError.message,
    });
  const allocations = refreshedAllocations ?? [];
  const baseAttemptUpdate = {
    gateway_charge_id: result.gatewayChargeId,
    gateway_source_id: result.gatewaySourceId,
    gateway_authorize_uri: result.authorizeUri,
    qr_image_url: result.qrImageUrl,
    expires_at: result.expiresAt ?? attempt.expires_at ?? null,
    failure_code: result.failureCode,
    failure_message: result.failureMessage,
    raw_gateway_response: result.raw,
  };
  if (result.status !== "paid") {
    await client
      .from("mixed_payment_attempts")
      .update({ ...baseAttemptUpdate, status: result.status })
      .eq("id", attempt.id);
    return { ok: true, status: result.status, finalized: false };
  }
  try {
    assertMixedGatewayAmountMatches({
      attempt,
      allocations,
      charge: result.raw,
    });
  } catch (err) {
    await markAmountMismatch({
      client,
      session,
      attempt,
      reason: errorMessage(err),
      metadata: { gatewayChargeId: result.gatewayChargeId },
    });
    return { ok: true, amountMismatch: true, finalized: false };
  }

  // TODO: Current mixed finalization lock is application-level/monotonic. Before high-volume production, upgrade to a DB advisory lock or RPC transaction for stronger concurrency guarantees.
  if (
    ["finalized", "partial_finalized"].includes(String(attempt.status)) ||
    ["finalized", "partial_finalized"].includes(String(session.status))
  ) {
    await clearMixedCheckoutSaleCartItems({ client, session, allocations });
    return { ok: true, replay: true, finalized: true };
  }
  await client
    .from("mixed_payment_attempts")
    .update({ ...baseAttemptUpdate, status: "finalizing" })
    .eq("id", attempt.id);
  await client
    .from("mixed_checkout_sessions")
    .update({ status: "finalizing" })
    .eq("id", session.id);
  await client
    .from("mixed_payment_allocations")
    .update({ status: "paid", paid_at: nowIso() })
    .eq("mixed_checkout_session_id", session.id)
    .eq("status", "payment_pending");

  const saleOk = await finalizeSaleAllocations({
    client,
    session,
    attempt,
    allocations,
  });
  if (saleOk)
    await clearMixedCheckoutSaleCartItems({ client, session, allocations });
  const bookingResults = [];
  for (const allocation of allocations.filter(
    (a) => a.allocation_type === "booking_deposit",
  ))
    bookingResults.push(
      await finalizeBookingAllocation({ client, session, attempt, allocation }),
    );
  const allOk = saleOk && bookingResults.every(Boolean);
  const finalStatus = allOk ? "finalized" : "partial_finalized";
  await client
    .from("mixed_payment_attempts")
    .update({ status: finalStatus })
    .eq("id", attempt.id);
  await client
    .from("mixed_checkout_sessions")
    .update({ status: finalStatus })
    .eq("id", session.id);
  return {
    ok: true,
    finalized: allOk,
    partialFinalized: !allOk,
    status: finalStatus,
  };
}
