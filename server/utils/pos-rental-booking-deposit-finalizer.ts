import { createError } from "h3";
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
type AnyClient = {
  from(table: string): any;
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: any; error: any }>;
};

/**
 * Map an f_confirm_rental_booking_deposit (migration 119) RAISE message to an
 * HTTP status. Shared by the POS finalizer and the manual-deposit path.
 * HELD_BALANCE_EVENT_WRITE_FAILED / BOOKING_CONFIRM_NO_ROW / unknown → 500 (retryable).
 */
export function mapDepositRpcErrorStatus(message: string): number {
  if (message.includes("RENTAL_BOOKING_NOT_FOUND")) return 404;
  if (message.includes("BOOKING_NOT_DRAFT")) return 409;
  if (message.includes("BOOKING_DEPOSIT_UNEXPECTED_STATUS")) return 409;
  if (message.includes("BOOKING_DEPOSIT_AMOUNT_MISMATCH")) return 422;
  if (message.includes("BOOKING_DEPOSIT_AMOUNT_INVALID")) return 422;
  if (message.includes("BOOKING_DEPOSIT_SOURCE_TYPE_INVALID")) return 422;
  return 500;
}

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
 *   1. Delegate the ATOMIC money core + confirm to the migration-119 RPC
 *      f_confirm_rental_booking_deposit (source_type 'pos_rental_payment_attempt'):
 *      held-balance event + deposit-paid fields + attempt→paid + draft→confirmed,
 *      all in a SINGLE transaction. Idempotent / crash-recovery re-entrant.
 *   2. Map RPC RAISE codes → thrown HTTP errors (see mapDepositRpcErrorStatus).
 *   3. On a genuine overlap conflict the RPC returns paid_confirm_failed (money
 *      core kept); this function surfaces that status and does NOT throw.
 *   4. W5 (OUTSIDE the money txn): best-effort issuance of the Booking Deposit
 *      Confirmation document. A non-23505 task-insert error is surfaced as
 *      document.status='failed' (never silently swallowed — finding-12 fix).
 *
 * Does NOT own (must be handled by the caller):
 *   - Payment attempt creation (pos_rental_payment_attempts INSERT) — payment-method-specific
 *   - Request validation (idempotency key, amount, paymentMethod guard)
 *   - Cash-only / QR-only request guards
 *   - Idempotency pre-check and insert race-condition handling
 *   - HTTP response mapping / status codes
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

  // ── Steps 1–4: ATOMIC money core + confirm via the migration-119 RPC ───────
  // f_confirm_rental_booking_deposit runs held-balance event + deposit-paid
  // fields + attempt→paid + draft→confirmed in a SINGLE transaction. Fixes the
  // W1→W2 crash gap (deep audit P2.5) and finding 11 (unchecked W3). The RPC
  // is idempotent/re-entrant, so a same-key retry after a crash completes here.
  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    "f_confirm_rental_booking_deposit",
    {
      p_booking_id: bookingId,
      p_source_type: POS_BOOKING_DEPOSIT_SOURCE_TYPE,
      p_source_id: attemptId,
      p_attempt_id: attemptId,
      p_amount: amount,
      p_currency_code: currencyCode,
      p_payment_method: paymentMethod,
      p_branch_id: branchId,
      p_staff_user_id: staffUserId,
      p_idempotency_key: idempotencyKey,
      p_event_metadata: { bookingChannel: "admin_pos_v3", staffUserId },
    },
  );
  if (rpcError) {
    const msg = text(rpcError.message) || "DEPOSIT_CONFIRM_FAILED";
    throw createError({
      statusCode: mapDepositRpcErrorStatus(msg),
      statusMessage: msg,
    });
  }
  const rpc = (rpcData ?? {}) as AnyRecord;

  // paid_confirm_failed: the RPC kept the money core (held event + deposit paid
  // + attempt flagged); a genuine overlap conflict needs manual review.
  if (text(rpc.status) === "paid_confirm_failed") {
    return {
      status: "paid_confirm_failed",
      bookingDepositPaidAmount: amount,
      currencyCode,
      warnings: ["BOOKING_CONFIRMATION_FAILED_MANUAL_REVIEW_REQUIRED"],
    };
  }

  // Load the held-balance event row (created atomically by the RPC) for the
  // isolated best-effort document step below (W5). Its .id is the doc source_id.
  const { data: heldBalanceEvent } = await adminClient
    .from("rental_held_balance_events")
    .select("*")
    .eq("id", text(rpc.held_balance_event_id))
    .single();

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
      } else {
        // FINDING 12 FIX: do NOT swallow a non-23505 task-insert error. Throw
        // into the isolated W5 catch below so the document result surfaces as
        // status:'failed' with the error code/message — the booking stays
        // confirmed and the retry endpoint can recreate the task later.
        throw createError({
          statusCode: 500,
          statusMessage: text(insertTaskErr.message) || "DOC_TASK_INSERT_FAILED",
        });
      }
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
