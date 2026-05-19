import { createError } from "h3";
import {
  toGatewayAmount,
  normalizeCurrency,
} from "~~/server/utils/payment-core";
import type { NormalizedGatewayCharge } from "~~/server/utils/omise";
import { finalizePosRentalBookingDeposit } from "~~/server/utils/pos-rental-booking-deposit-finalizer";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

export const POS_QR_ATTEMPT_SELECT =
  "id, rental_booking_id, payment_purpose, payment_method, amount, currency_code, status, gateway, gateway_charge_id, gateway_source_id, qr_image_url, expires_at, expired_at, idempotency_key, branch_id, staff_user_id, created_at";

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function money(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

/** Maps a pos_rental_payment_attempts QR row to the stable UI response contract. */
export function mapPosQrAttemptResponse(attempt: AnyRecord) {
  return {
    paymentAttemptId: String(attempt.id),
    qrImageUrl: (attempt.qr_image_url as string | null) ?? null,
    amount: money(attempt.amount),
    currency: normalizeCurrency(attempt.currency_code),
    expiresAt: (attempt.expires_at as string | null) ?? null,
    status: text(attempt.status),
  };
}

export interface ApplyPosQrGatewayResultOutput {
  /** Final attempt status after applying the result. */
  attemptStatus: string;
  /** Present when the shared finalizer was invoked (paid path only). */
  finalizerStatus?: "confirmed" | "paid_confirm_failed";
}

/**
 * Shared gateway result application for POS V3 QR Booking Deposit.
 * Called by the Omise webhook handler and the stale-poll reconciliation path.
 *
 * Responsibilities:
 *   1. Skip permanently-terminal attempts (paid, paid_confirm_failed, expired, failed, cancelled)
 *   1b. Preserve 'finalizing' + non-paid gateway result (no downgrade — manual review needed)
 *   2. Assert gateway amount/currency matches stored attempt
 *   3. Non-paid results (pending only) → update attempt status directly
 *   4. Paid result (pending or finalizing recovery):
 *        a. Transition attempt → 'finalizing' ONLY if currently 'pending' (skip if already there)
 *        b. Call finalizePosRentalBookingDeposit() — idempotent, safe to replay
 *        c. Finalizer confirmed → update attempt → 'paid'
 *        d. Finalizer paid_confirm_failed → finalizer already updated attempt; return that status
 *
 * 'finalizing' recovery rationale:
 *   A 'finalizing' attempt indicates a prior paid charge was already confirmed.
 *   If the process crashed before finalization completed, a subsequent webhook replay
 *   or stale-poll reconciliation can safely re-enter via the paid path because
 *   finalizePosRentalBookingDeposit() is idempotent (held-balance event + booking update
 *   are both replay-safe via unique constraint guards).
 *
 * Does NOT own: payment_events linkage, loading booking from DB, HTTP response mapping.
 */
export async function applyPosRentalQrGatewayResult(input: {
  client: AnyClient;
  posAttempt: AnyRecord;
  booking: AnyRecord;
  result: NormalizedGatewayCharge;
}): Promise<ApplyPosQrGatewayResultOutput> {
  const { client, posAttempt, booking, result } = input;
  const attemptId = text(posAttempt.id);
  const currentStatus = text(posAttempt.status);
  const mappedStatus = result.status;

  // ── 1. Skip permanently-terminal attempts ────────────────────────────────
  const TERMINAL = [
    "paid",
    "paid_confirm_failed",
    "expired",
    "failed",
    "cancelled",
  ];
  if (TERMINAL.includes(currentStatus)) {
    return { attemptStatus: currentStatus };
  }

  // ── 1b. Finalizing + non-paid gateway result — preserve, no downgrade ─────
  // 'finalizing' means a paid charge was already confirmed by a prior call.
  // If the live gateway now returns non-paid (e.g. expired/failed), that is a
  // contradictory signal — do not downgrade. Return current status for manual review.
  if (currentStatus === "finalizing" && mappedStatus !== "paid") {
    return { attemptStatus: "finalizing" };
  }

  // ── 2. Assert amount/currency match ───────────────────────────────────────
  const expectedGatewayAmount = toGatewayAmount(money(posAttempt.amount));
  const actualGatewayAmount = Number(result.raw.amount ?? 0);
  const expectedCurrency = normalizeCurrency(posAttempt.currency_code);
  const actualCurrency = normalizeCurrency(result.raw.currency);
  if (
    actualGatewayAmount !== expectedGatewayAmount ||
    actualCurrency !== expectedCurrency
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: "PAYMENT_AMOUNT_MISMATCH",
    });
  }

  // ── 3. Non-paid terminal/intermediate states ──────────────────────────────
  if (mappedStatus !== "paid") {
    const update: AnyRecord = { status: mappedStatus };
    if (mappedStatus === "expired")
      update.expired_at = new Date().toISOString();
    await client
      .from("pos_rental_payment_attempts")
      .update(update)
      .eq("id", attemptId);
    return { attemptStatus: mappedStatus };
  }

  // ── 4a. Paid: transition → finalizing (skip if already there) ────────────
  // Recovery path: if currentStatus is already 'finalizing', the transition
  // was already recorded by the prior run — skip the write to stay idempotent.
  if (currentStatus !== "finalizing") {
    await client
      .from("pos_rental_payment_attempts")
      .update({ status: "finalizing" })
      .eq("id", attemptId);
  }

  // ── 4b. Delegate to shared payment-method-agnostic finalizer ──────────────
  const finalizerResult = await finalizePosRentalBookingDeposit({
    adminClient: client,
    booking,
    attemptId,
    amount: money(posAttempt.amount),
    paymentMethod: "promptpay_qr",
    branchId: text(posAttempt.branch_id),
    staffUserId: text(posAttempt.staff_user_id),
    idempotencyKey: text(posAttempt.idempotency_key),
  });

  // ── 4c/d. Apply finalizer outcome ─────────────────────────────────────────
  if (finalizerResult.status === "paid_confirm_failed") {
    // finalizer already updated the attempt to paid_confirm_failed internally
    return {
      attemptStatus: "paid_confirm_failed",
      finalizerStatus: "paid_confirm_failed",
    };
  }

  await client
    .from("pos_rental_payment_attempts")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", attemptId);

  return { attemptStatus: "paid", finalizerStatus: "confirmed" };
}
