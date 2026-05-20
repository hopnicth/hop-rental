import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { asPaymentNonEmptyString } from "~~/server/utils/payment-core";
import {
  mapPosQrAttemptResponse,
  POS_QR_ATTEMPT_SELECT,
  applyPosRentalQrGatewayResult,
} from "~~/server/utils/pos-rental-qr-booking-deposit";
import { retrieveOmiseCharge } from "~~/server/utils/omise";
import { BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE } from "~~/server/utils/admin-rental-booking-deposit-confirmation-document";

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
 * Phase 2D-B2.1: Active live-charge reconciliation for all pending/finalizing attempts.
 *
 * Primary finalization path: Omise webhook → retrieveOmiseCharge → applyPosRentalQrGatewayResult.
 * Poll is the webhook-miss fallback: performs live charge reconciliation for every
 * pending/finalizing attempt that has a gateway_charge_id, regardless of whether
 * the QR window has expired.
 *
 * Reconciliation trigger (runs when both conditions are true):
 *   1. status IN ('pending', 'finalizing')
 *   2. gateway_charge_id is present (i.e. charge was created at Omise)
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
 *   Local expiry is applied only when the window has closed and no Omise charge exists.
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

  // "requires_action" is included for recovery: a PromptPay charge may have been
  // incorrectly mapped to requires_action by an earlier mapper version. Live
  // reconciliation re-evaluates the charge and corrects the status.
  const LIVE_RECON_STATUSES = ["pending", "finalizing", "requires_action"];
  if (LIVE_RECON_STATUSES.includes(currentStatus)) {
    if (gatewayChargeId) {
      // ── Active live-charge reconciliation (webhook-miss fallback) ─────────
      // Runs for ALL pending/finalizing attempts with a known Omise charge ID,
      // whether the QR window is still open or has already expired.
      // This is the primary recovery path when the Omise webhook was not
      // delivered (e.g. dev environment, transient network failure, missed retry).
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
    } else if (currentStatus === "pending" && isExpiredWindow) {
      // ── Local expiry: no gateway_charge_id AND window closed (edge case) ────
      // No Omise charge to verify and the QR has expired. Safe to expire locally.
      // Should not occur for promptpay_qr attempts in normal operation.
      await adminClient
        .from("pos_rental_payment_attempts")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .eq("id", paymentAttemptId)
        .eq("status", "pending");
      attempt = { ...attempt, status: "expired" };
    }
  }

  const finalStatus = asText(attempt.status);
  const baseResponse = mapPosQrAttemptResponse(attempt);

  if (finalStatus !== "paid") {
    return baseResponse;
  }

  // ── B7: Enrich paid response with BDC document data ──────────────────────────
  // The BDC is issued synchronously by the finalizer before the attempt reaches
  // 'paid'. This lookup is conditional (paid only), read-only, and never creates
  // or mutates documents. Failure must never block the paid poll response.
  let document: {
    officialDocumentId: string | null;
    documentNo: string | null;
    issuanceStatus: string | null;
  } | null = null;

  try {
    const { data: taskData } = await adminClient
      .from("pos_document_issuance_tasks")
      .select("id, status, official_document_id")
      .eq("rental_booking_id", bookingId)
      .eq("document_type", BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE)
      .maybeSingle();

    if (taskData) {
      const task = taskData as AnyRecord;
      const officialDocumentId = asText(task.official_document_id) || null;
      let documentNo: string | null = null;

      if (officialDocumentId) {
        const { data: docData } = await adminClient
          .from("official_documents")
          .select("document_no")
          .eq("id", officialDocumentId)
          .maybeSingle();
        if (docData) {
          documentNo = asText((docData as AnyRecord).document_no) || null;
        }
      }

      document = {
        officialDocumentId,
        documentNo,
        issuanceStatus: asText(task.status) || null,
      };
    }
  } catch {
    // Document lookup failure must never block the paid poll response.
    // document remains null; UI shows the fallback Booking Detail link.
  }

  return { ...baseResponse, document };
});
