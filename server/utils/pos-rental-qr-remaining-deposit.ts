import { createError } from "h3";
import {
  toGatewayAmount,
  normalizeCurrency,
} from "~~/server/utils/payment-core";
import type { NormalizedGatewayCharge } from "~~/server/utils/omise";
import { recordRentalHeldBalanceEvent } from "~~/server/utils/rental-held-balance-events";
import { recordPaymentAlert } from "~~/server/utils/payments";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function money(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export interface ApplyPosQrRemainingDepositGatewayResultOutput {
  attemptStatus: string;
  finalizerStatus?: "paid" | "paid_confirm_failed";
}

/**
 * Finalize remaining security deposit QR after gateway confirms paid.
 *
 * Owns:
 *   1. Record remaining_security_deposit_collection held-balance event (idempotent)
 *   2. Update rental_bookings: deposit_payment_status=paid, deposit_paid_amount,
 *      deposit_payment_method=qr_transfer (DB-valid value for rental_bookings CHECK constraint),
 *      deposit_paid_at.
 *      Note: pos_rental_payment_attempts.payment_method retains 'promptpay_qr' for precise
 *      method tracking; rental_bookings.deposit_payment_method uses 'qr_transfer' which is
 *      the only QR/PromptPay value allowed by the DB CHECK constraint.
 *   3. On failure: update attempt to paid_confirm_failed
 *
 * Does NOT: call confirmRentalBooking, issue BDC, change booking status.
 */
async function finalizeRemainingSecurityDepositQr(input: {
  client: AnyClient;
  booking: AnyRecord;
  attemptId: string;
  amount: number;
  paymentMethod: string;
  branchId: string;
  staffUserId: string;
  idempotencyKey: string;
}): Promise<{ status: "paid" | "paid_confirm_failed"; warnings: string[] }> {
  const {
    client,
    booking,
    attemptId,
    amount,
    paymentMethod,
    branchId,
    staffUserId,
    idempotencyKey,
  } = input;
  const bookingId = text(booking.id);
  const currencyCode = text(booking.currency_code) || "THB";
  const now = new Date().toISOString();
  const warnings: string[] = [];
  let failed = false;

  try {
    await recordRentalHeldBalanceEvent({
      client,
      rentalBookingId: bookingId,
      eventType: "remaining_security_deposit_collection",
      amount,
      currencyCode,
      sourceType: "pos_rental_payment_attempt",
      sourceId: attemptId,
      paymentMethod,
      branchId,
      staffUserId,
      idempotencyKey,
      metadata: {
        source: "pos_v3_remaining_security_deposit_promptpay_qr",
        bookingChannel: "admin_pos_v3",
      },
    });
  } catch {
    failed = true;
    warnings.push("Held balance event recording failed");
  }

  // Bug 1 fix: rental_bookings.deposit_payment_method must use 'qr_transfer' — the DB
  // CHECK constraint allows: cash | qr_transfer | bank_transfer | card | other.
  // 'promptpay_qr' is the precise payment_method stored in pos_rental_payment_attempts;
  // the booking-level field uses the settlement-facing label 'qr_transfer'.
  const { error: updateError } = await client
    .from("rental_bookings")
    .update({
      deposit_paid_amount: amount,
      deposit_payment_status: "paid",
      deposit_payment_method: "qr_transfer",
      deposit_paid_at: now,
    })
    .eq("id", bookingId);

  if (updateError) {
    failed = true;
    warnings.push("Booking update failed");
  }

  if (failed) {
    await client
      .from("pos_rental_payment_attempts")
      .update({
        status: "paid_confirm_failed",
        confirm_failed_at: now,
        confirm_failure_reason: warnings.join("; "),
      })
      .eq("id", attemptId);
    return { status: "paid_confirm_failed", warnings };
  }
  return { status: "paid", warnings: [] };
}

/**
 * Apply Omise gateway result for POS V3 remaining security deposit QR.
 * Called by Omise webhook handler and stale-poll reconciliation.
 *
 * Same state machine as applyPosRentalQrGatewayResult (pos-rental-qr-booking-deposit.ts)
 * but delegates to finalizeRemainingSecurityDepositQr instead of finalizePosRentalBookingDeposit.
 *
 * Does NOT: issue BDC, call confirmRentalBooking, change booking status.
 */
export async function applyPosRentalQrRemainingDepositGatewayResult(input: {
  client: AnyClient;
  posAttempt: AnyRecord;
  booking: AnyRecord;
  result: NormalizedGatewayCharge;
}): Promise<ApplyPosQrRemainingDepositGatewayResultOutput> {
  const { client, posAttempt, booking, result } = input;
  const attemptId = text(posAttempt.id);
  const currentStatus = text(posAttempt.status);
  const mappedStatus = result.status;

  // 0. Late payment recovery: locally expired + gateway paid
  const isLatePaymentOnExpired =
    currentStatus === "expired" && mappedStatus === "paid";
  if (isLatePaymentOnExpired) {
    try {
      await recordPaymentAlert(client, {
        bookingId: text(posAttempt.rental_booking_id),
        kind: "late_payment_on_locally_expired_qr_attempt",
        audience: "admin",
        severity: "critical",
        message:
          "Remaining security deposit QR charge paid at gateway after local attempt " +
          "marked expired. Finalization proceeding idempotently.",
        metadata: {
          attemptId,
          gatewayChargeId: text(posAttempt.gateway_charge_id),
          paymentPurpose: "remaining_security_deposit",
        },
      });
    } catch {
      // Alert failure must never block finalization.
    }
  }

  // 1. Skip permanently-terminal attempts (except late-payment recovery)
  const TERMINAL = [
    "paid",
    "paid_confirm_failed",
    "expired",
    "failed",
    "cancelled",
  ];
  if (!isLatePaymentOnExpired && TERMINAL.includes(currentStatus)) {
    return { attemptStatus: currentStatus };
  }
  // 1b. Preserve finalizing + non-paid (contradictory signal — manual review)
  if (currentStatus === "finalizing" && mappedStatus !== "paid") {
    return { attemptStatus: "finalizing" };
  }

  // 2. Assert amount/currency match
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

  // 3. Non-paid results — update status directly
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

  // 4a. Transition → finalizing (idempotent: skip if already there)
  if (currentStatus !== "finalizing") {
    await client
      .from("pos_rental_payment_attempts")
      .update({ status: "finalizing" })
      .eq("id", attemptId);
  }

  // 4b. Remaining-deposit-specific finalizer (no BDC, no confirmRentalBooking)
  const finalizerResult = await finalizeRemainingSecurityDepositQr({
    client,
    booking,
    attemptId,
    amount: money(posAttempt.amount),
    paymentMethod: "promptpay_qr",
    branchId: text(posAttempt.branch_id),
    staffUserId: text(posAttempt.staff_user_id),
    idempotencyKey: text(posAttempt.idempotency_key),
  });

  // 4c/d. Apply finalizer outcome
  if (finalizerResult.status === "paid_confirm_failed") {
    return {
      attemptStatus: "paid_confirm_failed",
      finalizerStatus: "paid_confirm_failed",
    };
  }

  await client
    .from("pos_rental_payment_attempts")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", attemptId);

  return { attemptStatus: "paid", finalizerStatus: "paid" };
}
