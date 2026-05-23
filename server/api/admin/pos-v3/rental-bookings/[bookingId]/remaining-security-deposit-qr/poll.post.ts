import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { asPaymentNonEmptyString } from "~~/server/utils/payment-core";
import {
  mapPosQrAttemptResponse,
  POS_QR_ATTEMPT_SELECT,
} from "~~/server/utils/pos-rental-qr-booking-deposit";
import { retrieveOmiseCharge } from "~~/server/utils/omise";
import { applyPosRentalQrRemainingDepositGatewayResult } from "~~/server/utils/pos-rental-qr-remaining-deposit";

/**
 * POST /api/admin/pos-v3/rental-bookings/[bookingId]/remaining-security-deposit-qr/poll
 *
 * Polls current remaining security deposit QR attempt status.
 * Uses live-charge reconciliation as a webhook-miss fallback (same pattern as booking-deposit poll).
 * On paid: updates rental_bookings deposit fields. Does NOT return BDC document data.
 */

const BOOKING_SELECT =
  "id, deposit_amount, deposit_paid_amount, deposit_payment_status, booking_deposit_payment_status, booking_deposit_paid_amount, currency_code, pos_branch_id, pos_staff_user_id";

const LIVE_RECON_STATUSES = ["pending", "finalizing", "requires_action"];

type AnyRecord = Record<string, unknown>;

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const bookingId = asText(event.context.params?.bookingId);
  if (!bookingId) throw createError({ statusCode: 422, statusMessage: "bookingId is required" });

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const paymentAttemptId = asPaymentNonEmptyString(body.paymentAttemptId);
  if (!paymentAttemptId) throw createError({ statusCode: 422, statusMessage: "paymentAttemptId is required" });

  // Load attempt — ownership guard: rental_booking_id + purpose must match
  const { data: attemptData, error: attemptError } = await adminClient
    .from("pos_rental_payment_attempts")
    .select(POS_QR_ATTEMPT_SELECT)
    .eq("id", paymentAttemptId)
    .eq("rental_booking_id", bookingId)
    .eq("payment_method", "promptpay_qr")
    .eq("payment_purpose", "remaining_security_deposit")
    .maybeSingle();

  if (attemptError) throw createError({ statusCode: 500, statusMessage: attemptError.message });
  if (!attemptData) throw createError({ statusCode: 404, statusMessage: "QR payment attempt not found" });

  let attempt = attemptData as AnyRecord;

  // Live-charge reconciliation (webhook-miss fallback)
  const currentStatus = asText(attempt.status);
  const gatewayChargeId = asText(attempt.gateway_charge_id);
  const expiresAtStr = typeof attempt.expires_at === "string" ? attempt.expires_at : null;
  const isExpiredWindow = expiresAtStr !== null && new Date(expiresAtStr).getTime() <= Date.now();

  if (LIVE_RECON_STATUSES.includes(currentStatus)) {
    if (gatewayChargeId) {
      try {
        const liveCharge = await retrieveOmiseCharge(event, gatewayChargeId);
        const attemptBookingId = asText(attempt.rental_booking_id);
        const { data: posBooking } = await adminClient
          .from("rental_bookings").select(BOOKING_SELECT).eq("id", attemptBookingId).maybeSingle();
        if (posBooking) {
          const reconResult = await applyPosRentalQrRemainingDepositGatewayResult({
            client: adminClient,
            posAttempt: attempt,
            booking: posBooking as AnyRecord,
            result: liveCharge,
          });
          attempt = { ...attempt, status: reconResult.attemptStatus };
        }
      } catch {
        // Reconciliation threw — return current status unchanged. Payment may have succeeded.
      }
    } else if (currentStatus === "pending" && isExpiredWindow) {
      // Local expiry: no gateway_charge_id and window closed
      await adminClient
        .from("pos_rental_payment_attempts")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .eq("id", paymentAttemptId)
        .eq("status", "pending");
      attempt = { ...attempt, status: "expired" };
    }
  }

  // No BDC document enrichment for remaining security deposit
  return mapPosQrAttemptResponse(attempt);
});
