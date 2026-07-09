/**
 * Manual bank-transfer booking-deposit confirmation.
 *
 * An admin who has reviewed an offline bank-transfer slip records the booking
 * deposit and confirms the booking. This is the authoritative server path for
 * the manual flow and deliberately reuses the existing Model B infrastructure:
 *
 *  - The booking deposit (HELD-BALANCE LIABILITY, event_type
 *    'booking_deposit_collection') + deposit-paid fields + draft→confirmed are
 *    recorded ATOMICALLY by the migration-119 RPC f_confirm_rental_booking_deposit
 *    (source_type 'manual_admin_confirmation', p_attempt_id null). The deposit is
 *    NEVER revenue and NEVER touches rental_booking_payment_lines / VAT; the
 *    availability/overlap guard (mig-058) runs inside the RPC's confirm step, so
 *    this module never sets rental_bookings.status directly.
 *  - No Omise / QR / payment_attempts. The held-balance source_type is
 *    'manual_admin_confirmation' (free-text source; not a gateway attempt).
 *
 * Idempotency: the held-balance event is keyed by (source_type, source_id,
 * event_type) with source_id = bookingId, so a replay resolves to the existing
 * event without creating a duplicate money row. An already-confirmed booking is
 * returned as-is (alreadyConfirmed: true) instead of re-confirming.
 */
import { createError } from "h3";
import { mapDepositRpcErrorStatus } from "~~/server/utils/pos-rental-booking-deposit-finalizer";

type AnyRecord = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: any; error: any }>;
};

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
 * Order: validate → (optional) slip ownership guard → atomic money core + confirm
 * via the migration-119 RPC (held-balance event + deposit-paid fields +
 * draft→confirmed, idempotent) → mark the slip reviewed (optional, OUTSIDE the
 * money txn). Throws on a non-confirmable booking, maps RPC RAISE codes to HTTP
 * status, and surfaces a genuine availability/overlap conflict as 409.
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

  // ── Atomic money core + confirm via the migration-119 RPC ─────────────────
  // held-balance event (source_type 'manual_admin_confirmation', source_id =
  // bookingId; idempotent) + deposit-paid fields + draft→confirmed, in a SINGLE
  // transaction. Replaces the former non-atomic W2'→W3'→confirmRentalBooking
  // sequence (ratification audit F4 / G2).
  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    "f_confirm_rental_booking_deposit",
    {
      p_booking_id: String(bookingId),
      p_source_type: MANUAL_BOOKING_DEPOSIT_SOURCE_TYPE,
      p_source_id: String(bookingId),
      p_attempt_id: null,
      p_amount: amount,
      p_currency_code: String((booking as AnyRecord).currency_code ?? "THB"),
      p_payment_method: "bank_transfer",
      p_branch_id: null,
      p_staff_user_id: adminUserId,
      p_idempotency_key: `manual_booking_deposit:${bookingId}`,
      p_event_metadata: {
        source: MANUAL_BOOKING_DEPOSIT_SOURCE_TYPE,
        payment_channel: input.paymentChannel,
        deposit_slip_id: depositSlipId,
        external_reference: externalReference,
        admin_note: adminNote,
      },
    },
  );
  if (rpcError) {
    const msg =
      typeof rpcError.message === "string" && rpcError.message
        ? rpcError.message
        : "DEPOSIT_CONFIRM_FAILED";
    throw createError({
      statusCode: mapDepositRpcErrorStatus(msg),
      statusMessage: msg,
    });
  }
  const rpc = (rpcData ?? {}) as AnyRecord;
  if (String(rpc.status) === "paid_confirm_failed") {
    // Money core recorded, but a genuine overlap conflict blocks confirmation.
    throw createError({
      statusCode: 409,
      statusMessage: String(rpc.confirm_failure_reason ?? "RENTAL_BOOKING_CONFLICT"),
    });
  }
  const heldBalanceEventId = String(rpc.held_balance_event_id ?? "");

  // ── Optional: mark the reviewed slip (metadata only; OUTSIDE the money txn,
  //     best-effort; guarded by migration 118) ───────────────────────────────
  const now = new Date().toISOString();
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

  return {
    booking: { ...(booking as AnyRecord), status: "confirmed" },
    heldBalanceEventId,
    depositSlipReviewed,
    alreadyConfirmed: rpc.idempotent === true,
  };
}
