/**
 * Mixed post-payment cancel orchestration (design §A case 5, T3 walk 5 — B4).
 *
 * Wrapper-only: NO cross-domain transaction exists. Each leg's money is its
 * own RPC transaction — rental leg FIRST (annex #3: it races the no-show
 * cron; 129/130 machinery via companyCancelRentalBooking), then the sale leg
 * (128 via cancelSaleOrder), then session bookkeeping. Documents remain the
 * per-leg wrappers' concern (T4-core).
 *
 * Resume (the resumeSettledReturn mirror): idempotent + re-entrant, keyed on
 * the mixed session. On re-invocation each committed leg is
 * VERIFIED-AND-SKIPPED — the stored cancellation reason must equal the
 * resubmitted reason, else 409 MIXED_CANCEL_PENDING_MISMATCH — and only the
 * missing legs run. A crash between legs leaves a VISIBLE half state (rental
 * cancelled, order live) that the next invocation completes; never silent.
 *
 * §F: one operation per leg, logged by the reused wrappers themselves
 * (company_cancel for the rental leg, sale_cancel_paid for the sale leg).
 * The orchestration result reports the per-leg outcome.
 *
 * Bookkeeping choice (stated): the session flips to 'cancelled'; FINALIZED
 * allocations are NOT voided — they are the immutable record of money that
 * really moved; the refund rows are the new truth. ('voided' allocations
 * belong to the pre-payment cancel path only, mixed-checkout-cancellation.)
 */
import { createError } from "h3";
import { asUuidOrNull } from "~~/server/utils/kyc-documents";
import { companyCancelRentalBooking } from "~~/server/utils/admin-rental-booking-cancel";
import { cancelSaleOrder } from "~~/server/utils/admin-sale-order-cancel";

type Row = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc?: (
    name: string,
    params: Row,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function cancelMixedPostPaymentPair(input: {
  client: AnyClient;
  rawSessionId: unknown;
  actorUserId: string;
  actorRole: string;
  reason: unknown;
  refundBankName?: unknown;
  refundBankAccountNumber?: unknown;
  refundBankAccountName?: unknown;
  refundContactPhone?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const sessionId = asUuidOrNull(input.rawSessionId);
  if (!sessionId)
    throw createError({ statusCode: 404, statusMessage: "Session not found" });
  const reason = text(input.reason);
  if (!reason)
    throw createError({
      statusCode: 422,
      statusMessage: "Cancellation reason is required",
    });

  const { data: session, error: sessionError } = await input.client
    .from("mixed_checkout_sessions")
    .select("id, status, checkout_kind")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError)
    throw createError({ statusCode: 500, statusMessage: sessionError.message });
  if (!session)
    throw createError({ statusCode: 404, statusMessage: "Session not found" });

  // Resolve the pair from finalized allocations (booking + order legs).
  const { data: allocations, error: allocError } = await input.client
    .from("mixed_payment_allocations")
    .select("id, allocation_type, rental_booking_id, order_id, status")
    .eq("mixed_checkout_session_id", sessionId);
  if (allocError)
    throw createError({ statusCode: 500, statusMessage: allocError.message });
  const allocRows = (allocations ?? []) as Row[];
  const bookingId = text(
    allocRows.find((a) => a.allocation_type === "booking_deposit")
      ?.rental_booking_id,
  );
  const orderId = text(
    allocRows.find((a) => a.allocation_type === "sale_product")?.order_id,
  );
  if (!bookingId || !orderId)
    throw createError({
      statusCode: 409,
      statusMessage: "MIXED_PAIR_INCOMPLETE: session lacks a booking+order pair",
    });

  const legs: Record<string, string> = {};
  const passthrough = {
    client: input.client,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    reason,
    refundBankName: input.refundBankName,
    refundBankAccountNumber: input.refundBankAccountNumber,
    refundBankAccountName: input.refundBankAccountName,
    refundContactPhone: input.refundContactPhone,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  };

  // ── RENTAL LEG FIRST (annex #3) ──────────────────────────
  const { data: booking } = await input.client
    .from("rental_bookings")
    .select("id, status, cancellation_reason")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking)
    throw createError({ statusCode: 404, statusMessage: "Booking not found" });
  if ((booking as Row).status === "cancelled") {
    // Verified-and-skipped: the stored leg must match the resubmission.
    if (text((booking as Row).cancellation_reason) !== reason)
      throw createError({
        statusCode: 409,
        statusMessage:
          "MIXED_CANCEL_PENDING_MISMATCH: rental leg committed with a different reason",
      });
    legs.rental = "skipped_already_cancelled";
  } else {
    await companyCancelRentalBooking({ ...passthrough, rawBookingId: bookingId });
    legs.rental = "cancelled";
  }

  // ── SALE LEG ─────────────────────────────────────────────
  const { data: order } = await input.client
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order)
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  if ((order as Row).status === "cancelled") {
    const { data: saleRefund } = await input.client
      .from("sale_order_refunds")
      .select("reason")
      .eq("order_id", orderId)
      .maybeSingle();
    if (saleRefund && text((saleRefund as Row).reason) !== reason)
      throw createError({
        statusCode: 409,
        statusMessage:
          "MIXED_CANCEL_PENDING_MISMATCH: sale leg committed with a different reason",
      });
    legs.sale = "skipped_already_cancelled";
  } else {
    await cancelSaleOrder({ ...passthrough, rawOrderId: orderId });
    legs.sale = "cancelled";
  }

  // ── SESSION BOOKKEEPING (after both legs committed) ──────
  let sessionStatus = text((session as Row).status);
  if (sessionStatus !== "cancelled") {
    const { error: flipError } = await input.client
      .from("mixed_checkout_sessions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (flipError)
      throw createError({ statusCode: 500, statusMessage: flipError.message });
    sessionStatus = "cancelled";
  }

  return {
    ok: true,
    sessionId,
    bookingId,
    orderId,
    legs,
    sessionStatus,
  };
}
