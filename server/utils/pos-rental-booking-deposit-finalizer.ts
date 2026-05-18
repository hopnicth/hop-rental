import { recordBookingDepositHeldBalanceCollection } from "~~/server/utils/rental-held-balance-events";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";
import type { BookingDepositSourceType } from "~~/server/utils/rental-held-balance-events";

// The canonical POS payment attempt source type for held-balance events.
// Shared between cash (Phase 2B) and future QR (Phase 2C+).
export const POS_BOOKING_DEPOSIT_SOURCE_TYPE =
  "pos_rental_payment_attempt" as const satisfies BookingDepositSourceType;

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface PosBookingDepositFinalizerInput {
  /** Supabase admin client */
  adminClient: AnyClient;
  /** Loaded rental_bookings row — must be the authoritative booking state at the time of finalization */
  booking: AnyRecord;
  /** pos_rental_payment_attempts.id that was already created by the caller (payment-method-specific) */
  attemptId: string;
  /** Authoritative collected amount validated by the caller */
  amount: number;
  /** Payment method string used for held-balance event metadata (e.g. 'cash', future 'promptpay') */
  paymentMethod: string;
  /** Branch where payment was collected */
  branchId: string;
  /** Staff user who processed the payment */
  staffUserId: string;
  /** Idempotency key carried through to the held-balance event record */
  idempotencyKey: string;
}

export interface PosBookingDepositFinalizationResult {
  status: "confirmed" | "paid_confirm_failed";
  bookingDepositPaidAmount: number;
  currencyCode: string;
  /** Present when status === 'confirmed' */
  booking?: {
    id: string;
    status: string;
    bookingDepositPaymentStatus: string;
    bookingDepositPaidAmount: number;
    currencyCode: string;
  };
  /** Present when status === 'paid_confirm_failed' */
  warnings?: string[];
}

/**
 * Shared POS Booking Deposit post-payment finalization core.
 *
 * Owns (payment-method-agnostic business finalization):
 *   1. Record booking_deposit_collection held-balance event via
 *      recordBookingDepositHeldBalanceCollection() — idempotent/replay safe
 *   2. Update rental_bookings deposit paid fields
 *   3. Transition booking draft → confirmed via strict event-backed confirmRentalBooking()
 *   4. On confirmation failure: flag both pos_rental_payment_attempts and rental_bookings
 *      as paid_confirm_failed and return that status (does NOT throw)
 *
 * Does NOT own (must be handled by the caller):
 *   - Payment attempt creation (pos_rental_payment_attempts INSERT) — payment-method-specific
 *   - Request validation (idempotency key, amount, paymentMethod guard)
 *   - Cash-only / QR-only request guards
 *   - Idempotency pre-check and insert race-condition handling
 *   - HTTP response mapping / status codes
 *   - Document issuance (Phase 2C-A3, to be added in the future)
 */
export async function finalizePosRentalBookingDeposit(
  input: PosBookingDepositFinalizerInput,
): Promise<PosBookingDepositFinalizationResult> {
  const {
    adminClient,
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

  // ── Step 1: Record canonical held-balance event ───────────────────────────
  // Model B: Booking Deposit is a held liability until Return Settlement.
  // recordBookingDepositHeldBalanceCollection is idempotent — a unique-violation
  // replay resolves to the existing matching event without error.
  await recordBookingDepositHeldBalanceCollection({
    client: adminClient,
    booking,
    amount,
    sourceType: POS_BOOKING_DEPOSIT_SOURCE_TYPE,
    sourceId: attemptId,
    paymentMethod,
    branchId,
    staffUserId,
    idempotencyKey,
    metadata: { bookingChannel: "admin_pos_v3", staffUserId },
  });

  // ── Step 2: Update booking deposit paid fields ────────────────────────────
  // Guarded by booking_deposit_payment_status = 'unpaid' to be idempotent on
  // repeated calls (already-paid row is a no-op update, not an error here).
  await adminClient
    .from("rental_bookings")
    .update({
      booking_deposit_payment_status: "paid",
      booking_deposit_paid_amount: amount,
      booking_deposit_paid_at: now,
      booking_deposit_pos_attempt_id: attemptId,
    })
    .eq("id", bookingId)
    .eq("booking_deposit_payment_status", "unpaid");

  // ── Step 3: Strict event-backed booking confirmation ─────────────────────
  // confirmRentalBooking loads a fresh booking snapshot, validates deposit paid
  // and verifies the held-balance event exists before transitioning to confirmed.
  let confirmError: unknown = null;
  try {
    await confirmRentalBooking({
      adminClient,
      bookingId,
      userId: text(booking.user_id),
      skipUserOwnershipCheck: true,
      requireBookingDepositPaid: true,
      requireBookingDepositHeldBalanceEvent: {
        sourceType: POS_BOOKING_DEPOSIT_SOURCE_TYPE,
        sourceId: attemptId,
      },
    });
  } catch (err) {
    confirmError = err;
  }

  // ── Step 4: Handle confirmation failure (paid_confirm_failed) ─────────────
  // Cash is physically collected but booking confirmation failed — flag both
  // the attempt and the booking for manual review. Does NOT undo collection.
  if (confirmError) {
    const reason =
      confirmError instanceof Error
        ? confirmError.message
        : String(confirmError);
    const failedAt = new Date().toISOString();

    await adminClient
      .from("pos_rental_payment_attempts")
      .update({
        status: "paid_confirm_failed",
        confirm_failed_at: failedAt,
        confirm_failure_reason: reason,
      })
      .eq("id", attemptId);

    await adminClient
      .from("rental_bookings")
      .update({
        booking_deposit_payment_status: "paid_confirm_failed",
        booking_deposit_confirm_failed_at: failedAt,
        booking_deposit_confirm_failure_reason: reason,
      })
      .eq("id", bookingId);

    return {
      status: "paid_confirm_failed",
      bookingDepositPaidAmount: amount,
      currencyCode,
      warnings: ["BOOKING_CONFIRMATION_FAILED_MANUAL_REVIEW_REQUIRED"],
    };
  }

  return {
    status: "confirmed",
    bookingDepositPaidAmount: amount,
    currencyCode,
    booking: {
      id: bookingId,
      status: "confirmed",
      bookingDepositPaymentStatus: "paid",
      bookingDepositPaidAmount: amount,
      currencyCode,
    },
  };
}
