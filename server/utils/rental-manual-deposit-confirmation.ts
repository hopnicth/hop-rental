/**
 * Manual bank-transfer booking-deposit confirmation.
 *
 * An admin who has reviewed an offline bank-transfer slip records the booking
 * deposit and confirms the booking. This is the authoritative server path for
 * the manual flow and deliberately reuses the existing Model B infrastructure:
 *
 *  - The booking deposit is recorded as a HELD-BALANCE LIABILITY via
 *    recordRentalHeldBalanceEvent (event_type 'booking_deposit_collection').
 *    It is NEVER revenue and NEVER touches rental_booking_payment_lines / VAT.
 *  - The booking is confirmed ONLY through confirmRentalBooking() — the status
 *    transition + availability/overlap guard live there; this module never sets
 *    rental_bookings.status directly.
 *  - No Omise / QR / payment_attempts. The held-balance source_type is
 *    'manual_admin_confirmation' (free-text source; not a gateway attempt).
 *
 * Idempotency: the held-balance event is keyed by (source_type, source_id,
 * event_type) with source_id = bookingId, so a replay resolves to the existing
 * event without creating a duplicate money row. An already-confirmed booking is
 * returned as-is (alreadyConfirmed: true) instead of re-confirming.
 */
import { createError } from "h3";
import {
  BOOKING_DEPOSIT_COLLECTION_EVENT,
  recordRentalHeldBalanceEvent,
} from "~~/server/utils/rental-held-balance-events";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

/** Held-balance source_type for an admin-verified manual bank transfer. */
export const MANUAL_BOOKING_DEPOSIT_SOURCE_TYPE = "manual_admin_confirmation";

/** Where the admin saw the proof. Evidence channel, not a payment gateway. */
export const MANUAL_DEPOSIT_PAYMENT_CHANNELS = [
  "uploaded_slip",
  "line_slip",
  "whatsapp_slip",
  "manual",
] as const;
export type ManualDepositPaymentChannel =
  (typeof MANUAL_DEPOSIT_PAYMENT_CHANNELS)[number];

export function isManualDepositPaymentChannel(
  value: unknown,
): value is ManualDepositPaymentChannel {
  return (
    typeof value === "string" &&
    (MANUAL_DEPOSIT_PAYMENT_CHANNELS as readonly string[]).includes(value)
  );
}

/** Booking statuses this operation accepts (draft confirms; confirmed is idempotent). */
const CONFIRMABLE_OR_CONFIRMED = new Set(["draft", "confirmed"]);

function asMoney(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : 0;
}

export interface RecordManualBookingDepositInput {
  adminClient: AnyClient;
  bookingId: string;
  adminUserId: string;
  amount: number;
  paymentChannel: ManualDepositPaymentChannel;
  depositSlipId?: string | null;
  externalReference?: string | null;
  adminNote?: string | null;
}

export interface RecordManualBookingDepositResult {
  booking: AnyRecord;
  heldBalanceEventId: string;
  depositSlipReviewed: boolean;
  alreadyConfirmed: boolean;
}

/**
 * Record a manually-verified booking deposit and confirm the booking.
 *
 * Order: validate → record held-balance liability (idempotent) → mark booking
 * deposit paid (guarded) → mark the slip reviewed (optional) → confirm via
 * confirmRentalBooking (only when still draft). Throws on a non-confirmable
 * booking and propagates the availability/overlap 409 from confirmation.
 */
export async function recordManualBookingDeposit(
  input: RecordManualBookingDepositInput,
): Promise<RecordManualBookingDepositResult> {
  const { adminClient, bookingId, adminUserId } = input;

  const amount = asMoney(input.amount);
  if (amount <= 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "DEPOSIT_AMOUNT_REQUIRED",
    });
  }
  if (!isManualDepositPaymentChannel(input.paymentChannel)) {
    throw createError({
      statusCode: 422,
      statusMessage: "DEPOSIT_PAYMENT_CHANNEL_INVALID",
    });
  }

  // ── Load booking (status + currency for the event) ────────────────────────
  const { data: booking, error: bookingError } = await adminClient
    .from("rental_bookings")
    .select("id, user_id, status, currency_code")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    console.error(
      "[rental] manual deposit booking read failed",
      bookingError.message,
    );
    throw createError({ statusCode: 500, statusMessage: "BOOKING_READ_FAILED" });
  }
  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: "Booking not found" });
  }

  const status = String((booking as AnyRecord).status ?? "");
  if (!CONFIRMABLE_OR_CONFIRMED.has(status)) {
    // cancelled / picked_up / returned / no_show — never confirmable here.
    throw createError({
      statusCode: 422,
      statusMessage: "BOOKING_NOT_CONFIRMABLE",
    });
  }

  // ── Optional: the slip must belong to this booking ────────────────────────
  const depositSlipId =
    typeof input.depositSlipId === "string" && input.depositSlipId.trim()
      ? input.depositSlipId.trim()
      : null;
  if (depositSlipId) {
    const { data: slip, error: slipError } = await adminClient
      .from("rental_booking_deposit_slips")
      .select("id, rental_booking_id")
      .eq("id", depositSlipId)
      .maybeSingle();
    if (slipError) {
      console.error("[rental] manual deposit slip read failed", slipError.message);
      throw createError({ statusCode: 500, statusMessage: "SLIP_READ_FAILED" });
    }
    if (
      !slip ||
      String((slip as AnyRecord).rental_booking_id ?? "") !== String(bookingId)
    ) {
      throw createError({ statusCode: 404, statusMessage: "Slip not found" });
    }
  }

  // ── Record the held-balance liability (idempotent on source_id=bookingId) ──
  const externalReference =
    typeof input.externalReference === "string" && input.externalReference.trim()
      ? input.externalReference.trim()
      : null;
  const adminNote =
    typeof input.adminNote === "string" && input.adminNote.trim()
      ? input.adminNote.trim()
      : null;

  const heldBalanceEvent = await recordRentalHeldBalanceEvent({
    client: adminClient,
    rentalBookingId: String(bookingId),
    eventType: BOOKING_DEPOSIT_COLLECTION_EVENT,
    amount,
    currencyCode: String((booking as AnyRecord).currency_code ?? "THB"),
    sourceType: MANUAL_BOOKING_DEPOSIT_SOURCE_TYPE,
    sourceId: String(bookingId),
    paymentMethod: "bank_transfer",
    staffUserId: adminUserId,
    idempotencyKey: `manual_booking_deposit:${bookingId}`,
    metadata: {
      source: MANUAL_BOOKING_DEPOSIT_SOURCE_TYPE,
      payment_channel: input.paymentChannel,
      deposit_slip_id: depositSlipId,
      external_reference: externalReference,
      admin_note: adminNote,
    },
  });

  // ── Mark booking deposit paid (guarded → idempotent no-op when already paid) ─
  const now = new Date().toISOString();
  const { error: depositUpdateError } = await adminClient
    .from("rental_bookings")
    .update({
      booking_deposit_payment_status: "paid",
      booking_deposit_paid_amount: amount,
      booking_deposit_paid_at: now,
    })
    .eq("id", bookingId)
    .eq("booking_deposit_payment_status", "unpaid");
  if (depositUpdateError) {
    console.error(
      "[rental] manual deposit field update failed",
      depositUpdateError.message,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "BOOKING_DEPOSIT_UPDATE_FAILED",
    });
  }

  // ── Optional: mark the reviewed slip ──────────────────────────────────────
  let depositSlipReviewed = false;
  if (depositSlipId) {
    const { error: reviewError } = await adminClient
      .from("rental_booking_deposit_slips")
      .update({
        status: "reviewed",
        reviewed_by: adminUserId,
        reviewed_at: now,
        review_note: adminNote,
      })
      .eq("id", depositSlipId)
      .eq("rental_booking_id", bookingId);
    if (reviewError) {
      // Non-fatal: the deposit is recorded; slip status is metadata only.
      console.error(
        "[rental] manual deposit slip review update failed",
        reviewError.message,
      );
    } else {
      depositSlipReviewed = true;
    }
  }

  // ── Confirm (draft only) via the authoritative writer ─────────────────────
  if (status === "confirmed") {
    return {
      booking: booking as AnyRecord,
      heldBalanceEventId: String((heldBalanceEvent as AnyRecord).id ?? ""),
      depositSlipReviewed,
      alreadyConfirmed: true,
    };
  }

  const confirmed = await confirmRentalBooking({
    adminClient,
    bookingId,
    userId: adminUserId,
    skipUserOwnershipCheck: true,
    requireBookingDepositPaid: true,
  });

  return {
    booking: confirmed,
    heldBalanceEventId: String((heldBalanceEvent as AnyRecord).id ?? ""),
    depositSlipReviewed,
    alreadyConfirmed: false,
  };
}
