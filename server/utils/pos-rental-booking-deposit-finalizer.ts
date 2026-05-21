import { recordBookingDepositHeldBalanceCollection } from "~~/server/utils/rental-held-balance-events";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";
import type { BookingDepositSourceType } from "~~/server/utils/rental-held-balance-events";
import {
  issueBookingDepositConfirmationDocument,
  BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
} from "~~/server/utils/admin-rental-booking-deposit-confirmation-document";

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

/** Best-effort document issuance result — always present when status === 'confirmed'. */
export interface PosBookingDepositDocumentResult {
  status: "issued" | "failed";
  taskId: string | null;
  officialDocumentId: string | null;
  documentNo: string | null;
  alreadyIssued: boolean;
  errorCode: string | null;
  errorMessage: string | null;
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
  /** Best-effort document issuance result. Present when status === 'confirmed'. */
  document?: PosBookingDepositDocumentResult;
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
  // Capture the returned event row — its .id is the canonical FK used by
  // pos_document_issuance_tasks and official_documents (source_id).
  const heldBalanceEvent = await recordBookingDepositHeldBalanceCollection({
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

  // ── Step 5: Best-effort document issuance ─────────────────────────────────
  // Phase B — ISOLATED from Phase A. Document failure MUST NOT revert booking
  // confirmation, payment status, or the held-balance event.
  let taskId: string | null = null;
  let documentResult: PosBookingDepositDocumentResult = {
    status: "failed",
    taskId: null,
    officialDocumentId: null,
    documentNo: null,
    alreadyIssued: false,
    errorCode: "DOCUMENT_ISSUANCE_NOT_ATTEMPTED",
    errorMessage: null,
  };

  try {
    const docType = BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE;
    const heldEventId = text(heldBalanceEvent.id);

    // ── 5a: Create issuance task row (idempotent: reload on 23505 race) ──────
    const { data: insertedTask, error: insertTaskErr } = await adminClient
      .from("pos_document_issuance_tasks")
      .insert({
        document_type: docType,
        rental_booking_id: bookingId,
        held_balance_event_id: heldEventId,
        payment_source_type: POS_BOOKING_DEPOSIT_SOURCE_TYPE,
        payment_source_id: attemptId,
        status: "pending",
        attempt_count: 0,
        last_attempted_at: null,
      })
      .select("id, status, official_document_id, attempt_count")
      .single();

    let task: AnyRecord | null = null;
    if (insertTaskErr) {
      if (insertTaskErr.code === "23505") {
        // Concurrent request already created the task row — reload it
        const { data: existing } = await adminClient
          .from("pos_document_issuance_tasks")
          .select("id, status, official_document_id, attempt_count")
          .eq("held_balance_event_id", heldEventId)
          .eq("document_type", docType)
          .maybeSingle();
        task = (existing as AnyRecord | null) ?? null;
      }
      // Any other error (e.g. table not yet migrated, schema cache miss) —
      // task tracking is unavailable. Best-effort: proceed to document issuance
      // with task = null. official_documents remains the canonical record.
    } else {
      task = insertedTask as AnyRecord;
    }

    taskId = task ? text(task.id) : null;

    // ── 5b: Short-circuit if task already successfully issued ────────────────
    // Idempotent replay: booking was confirmed earlier, document was already
    // issued by a prior run. Return the stable issued state immediately.
    if (task && text(task.status) === "issued") {
      documentResult = {
        status: "issued",
        taskId,
        officialDocumentId: text(task.official_document_id) || null,
        documentNo: null,
        alreadyIssued: true,
        errorCode: null,
        errorMessage: null,
      };
    } else {
      // ── 5c: Track attempt ──────────────────────────────────────────────────
      const attemptNow = new Date().toISOString();
      if (taskId) {
        await adminClient
          .from("pos_document_issuance_tasks")
          .update({
            last_attempted_at: attemptNow,
            attempt_count: Number(task?.attempt_count ?? 0) + 1,
          })
          .eq("id", taskId);
      }

      // ── 5d: Issue document via A3 utility ──────────────────────────────────
      const issueResult = await issueBookingDepositConfirmationDocument({
        client: adminClient as any,
        heldBalanceEvent,
        booking,
        staffUserId,
        branchId,
      });

      // ── 5e: Update task to issued ──────────────────────────────────────────
      if (taskId) {
        await adminClient
          .from("pos_document_issuance_tasks")
          .update({
            status: "issued",
            official_document_id: issueResult.document.id,
            issued_at: issueResult.document.issuedAt ?? attemptNow,
            error_code: null,
            error_message: null,
          })
          .eq("id", taskId);
      }

      documentResult = {
        status: "issued",
        taskId,
        officialDocumentId: issueResult.document.id,
        documentNo: issueResult.document.documentNo,
        alreadyIssued: issueResult.alreadyIssued,
        errorCode: null,
        errorMessage: null,
      };
    }
  } catch (docErr: unknown) {
    // Document failure is ISOLATED. Booking stays confirmed, payment stays paid.
    const errMsg = docErr instanceof Error ? docErr.message : String(docErr);
    const errCode =
      typeof docErr === "object" && docErr !== null && "statusCode" in docErr
        ? `HTTP_${(docErr as { statusCode: unknown }).statusCode}`
        : "DOCUMENT_ISSUANCE_FAILED";

    if (taskId) {
      try {
        await adminClient
          .from("pos_document_issuance_tasks")
          .update({
            status: "failed",
            error_code: errCode,
            error_message: errMsg,
          })
          .eq("id", taskId);
      } catch {
        // ignore — task status update is also best-effort
      }
    }

    documentResult = {
      status: "failed",
      taskId,
      officialDocumentId: null,
      documentNo: null,
      alreadyIssued: false,
      errorCode: errCode,
      errorMessage: errMsg,
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
    document: documentResult,
  };
}
