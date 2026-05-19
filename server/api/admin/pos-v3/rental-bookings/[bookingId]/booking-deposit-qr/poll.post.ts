import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { asPaymentNonEmptyString } from "~~/server/utils/payment-core";
import {
  mapPosQrAttemptResponse,
  POS_QR_ATTEMPT_SELECT,
  applyPosRentalQrGatewayResult,
} from "~~/server/utils/pos-rental-qr-booking-deposit";
import { retrieveOmiseCharge } from "~~/server/utils/omise";

type AnyRecord = Record<string, unknown>;

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Booking fields required by the stale-reconciliation finalizer path.
 * Mirrors the webhook's rental_bookings select so finalizePosRentalBookingDeposit
 * receives all fields it needs.
 */
const STALE_RECON_BOOKING_SELECT =
  "id, user_id, walk_in_phone, status, asset_id, asset_name, booker_name, sku_id, start_date, end_date, rental_days, hub_id, deposit_amount, currency_code, booking_deposit_payment_status, booking_deposit_paid_amount, pos_branch_id, pos_staff_user_id";

/**
 * Admin QR polling/status endpoint for POS V3 Booking Deposit QR.
 *
 * Phase 2D-B2: Stale reconciliation before local expiry.
 *
 * Primary finalization path: Omise webhook → retrieveOmiseCharge → applyPosRentalQrGatewayResult.
 * Polling is for UI status display only and must NOT become an always-on provider polling loop.
 *
 * Stale reconciliation trigger (runs only when both conditions are true):
 *   1. status IN ('pending', 'finalizing') AND expires_at is past
 *   2. gateway_charge_id is present (i.e. charge exists at Omise)
 *
 * Reconciliation behavior:
 *   1. Call retrieveOmiseCharge(event, gatewayChargeId) — authoritative live status
 *   2. Pass to applyPosRentalQrGatewayResult — shared helper handles all transitions
 *   3. Return updated attempt status to the UI
 *
 * Retrieve failure behavior:
 *   If retrieveOmiseCharge() throws, the attempt is NOT marked expired.
 *   Current status is returned as-is (safe: payment may have succeeded at Omise).
 *
 * No-charge-ID edge case:
 *   Should not occur for promptpay_qr in normal operation.
 *   Local expiry is applied (no Omise charge to verify).
 */
export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const bookingId = asText(event.context.params?.bookingId);
  if (!bookingId)
    throw createError({
      statusCode: 422,
      statusMessage: "bookingId is required",
    });

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const paymentAttemptId = asPaymentNonEmptyString(body.paymentAttemptId);
  if (!paymentAttemptId)
    throw createError({
      statusCode: 422,
      statusMessage: "paymentAttemptId is required",
    });

  // Load attempt — ownership guard: rental_booking_id must match route bookingId
  const { data: attemptData, error: attemptError } = await adminClient
    .from("pos_rental_payment_attempts")
    .select(POS_QR_ATTEMPT_SELECT)
    .eq("id", paymentAttemptId)
    .eq("rental_booking_id", bookingId)
    .eq("payment_method", "promptpay_qr")
    .maybeSingle();

  if (attemptError)
    throw createError({ statusCode: 500, statusMessage: attemptError.message });
  if (!attemptData)
    throw createError({
      statusCode: 404,
      statusMessage: "QR payment attempt not found",
    });

  let attempt = attemptData as AnyRecord;

  // ── Stale reconciliation / local expiry ──────────────────────────────────────
  const currentStatus = asText(attempt.status);
  const expiresAtStr =
    typeof attempt.expires_at === "string" ? attempt.expires_at : null;
  const isExpiredWindow =
    expiresAtStr !== null && new Date(expiresAtStr).getTime() <= Date.now();
  const gatewayChargeId = asText(attempt.gateway_charge_id);

  const STALE_RECON_STATUSES = ["pending", "finalizing"];
  if (STALE_RECON_STATUSES.includes(currentStatus) && isExpiredWindow) {
    if (gatewayChargeId) {
      // ── Stale reconciliation: authoritative live charge check ─────────────
      // Only for stale attempts with a known Omise charge ID.
      // Prevents marking an attempt expired when the customer already paid at
      // Omise (e.g. webhook missed or live-charge retrieval failed transiently).
      try {
        const liveCharge = await retrieveOmiseCharge(event, gatewayChargeId);
        const attemptBookingId = asText(attempt.rental_booking_id);
        const { data: posBooking } = await adminClient
          .from("rental_bookings")
          .select(STALE_RECON_BOOKING_SELECT)
          .eq("id", attemptBookingId)
          .maybeSingle();
        if (posBooking) {
          const reconResult = await applyPosRentalQrGatewayResult({
            client: adminClient,
            posAttempt: attempt,
            booking: posBooking as AnyRecord,
            result: liveCharge,
          });
          attempt = { ...attempt, status: reconResult.attemptStatus };
        }
        // If posBooking is null: unexpected edge case — status unchanged (safe fallback).
      } catch {
        // retrieveOmiseCharge or reconciliation threw.
        // Safe: do NOT mark expired. Return current status unchanged.
        // Payment may have succeeded at Omise — local expiry here would be incorrect.
      }
    } else if (currentStatus === "pending") {
      // ── Local expiry: no gateway_charge_id (edge case) ─────────────────────
      // No Omise charge to verify. Safe to expire locally.
      // Should not occur for promptpay_qr attempts in normal operation.
      await adminClient
        .from("pos_rental_payment_attempts")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .eq("id", paymentAttemptId)
        .eq("status", "pending");
      attempt = { ...attempt, status: "expired" };
    }
  }

  return mapPosQrAttemptResponse(attempt);
});
