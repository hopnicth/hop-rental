import { createError, defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { expireOmiseCharge, retrieveOmiseCharge } from "~~/server/utils/omise";
import { POS_QR_ATTEMPT_SELECT } from "~~/server/utils/pos-rental-qr-booking-deposit";
import { asPaymentNonEmptyString } from "~~/server/utils/payment-core";

/**
 * POST /api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-qr/cancel
 *
 * Phase 2D-B4: Staff-initiated cancel of an active PromptPay QR Booking Deposit attempt.
 *
 * Eligible cancel statuses: pending | requires_action.
 * NOT eligible: finalizing | paid | paid_confirm_failed | expired | failed | cancelled.
 *
 * Safety contract (fail-closed):
 *   - Does NOT cancel the booking draft.
 *   - Does NOT touch money / accounting / document chains.
 *   - Does NOT create held balance or run finalization.
 *   - If gateway expire fails without proving the QR is already dead, local state
 *     is NOT updated — prevents hiding a still-live QR the customer may be scanning.
 *   - Idempotent: once an attempt is terminal, repeated calls return
 *     { cancelled: false, reason: "no_cancelable_attempt" }.
 */

/** Statuses staff may explicitly cancel. */
const CANCELABLE_STATUSES = ["pending", "requires_action"];

/**
 * Gateway statuses that prove the charge is dead and not paid.
 * Returned by retrieveOmiseCharge when expireOmiseCharge throws.
 */
const GATEWAY_DEAD_STATUSES = ["expired", "failed", "cancelled"];

const BOOKING_SELECT =
  "id, status, booking_deposit_payment_status, pos_branch_id";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function assertPosBranchAccess(input: {
  adminClient: AnyClient;
  platformRole: string;
  userId: string;
  branchId: string;
}) {
  if (input.platformRole === "super_admin") return;
  const { data, error } = await input.adminClient
    .from("admin_user_branch_access")
    .select("branch_id")
    .eq("user_id", input.userId)
    .eq("branch_id", input.branchId)
    .eq("can_pos", true)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({
      statusCode: 403,
      statusMessage: "No POS access for selected branch",
    });
}

export default defineEventHandler(async (event) => {
  const {
    adminClient,
    userId: staffUserId,
    platformRole,
  } = await requirePlatformAdmin(event);
  const bookingId = asText(event.context.params?.bookingId);
  if (!bookingId)
    throw createError({ statusCode: 422, statusMessage: "bookingId is required" });

  // ── 1. Validate booking and branch access ────────────────────────────────────
  const { data: bookingData, error: bookingError } = await adminClient
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError)
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  if (!bookingData)
    throw createError({ statusCode: 404, statusMessage: "Rental booking not found" });
  const booking = bookingData as AnyRecord;
  const posBranchId = asText(booking.pos_branch_id);
  if (!posBranchId)
    throw createError({
      statusCode: 422,
      statusMessage: "Booking is not a POS V3 booking",
    });
  await assertPosBranchAccess({
    adminClient,
    platformRole,
    userId: staffUserId,
    branchId: posBranchId,
  });

  // ── 2. Find the most recent cancelable attempt ───────────────────────────────
  const { data: attemptData, error: attemptError } = await adminClient
    .from("pos_rental_payment_attempts")
    .select(POS_QR_ATTEMPT_SELECT)
    .eq("rental_booking_id", bookingId)
    .eq("payment_method", "promptpay_qr")
    .eq("payment_purpose", "booking_deposit")
    .in("status", CANCELABLE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (attemptError)
    throw createError({ statusCode: 500, statusMessage: attemptError.message });

  // ── 3. No cancelable attempt — safe non-destructive response ─────────────────
  if (!attemptData) {
    return { cancelled: false, reason: "no_cancelable_attempt" };
  }

  const attempt = attemptData as AnyRecord;
  const attemptId = asText(attempt.id);
  const gatewayChargeId = asPaymentNonEmptyString(attempt.gateway_charge_id);

  // ── 4. Gateway cancellation (fail-closed) ────────────────────────────────────
  // No gateway_charge_id: charge was never submitted to Omise (charge creation
  // failed after local attempt insert). Safe to cancel locally without gateway call.
  if (gatewayChargeId) {
    let gatewayConfirmedDead = false;
    try {
      await expireOmiseCharge(event, gatewayChargeId);
      gatewayConfirmedDead = true;
    } catch {
      // Expire failed. Retrieve to check if charge is already dead at Omise.
      try {
        const liveCharge = await retrieveOmiseCharge(event, gatewayChargeId);
        if (GATEWAY_DEAD_STATUSES.includes(liveCharge.status)) {
          gatewayConfirmedDead = true;
        }
      } catch {
        // Both expire and retrieve failed — state unknown; fail closed.
      }
    }
    if (!gatewayConfirmedDead) {
      throw createError({ statusCode: 502, statusMessage: "GATEWAY_CANCEL_FAILED" });
    }
  }

  // ── 5. Mark attempt as cancelled ─────────────────────────────────────────────
  // Only updates attempt status; never touches booking, held balance, or documents.
  await adminClient
    .from("pos_rental_payment_attempts")
    .update({ status: "cancelled" })
    .eq("id", attemptId);

  return { cancelled: true, paymentAttemptId: attemptId };
});
