import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
  issueBookingDepositConfirmationDocument,
} from "~~/server/utils/admin-rental-booking-deposit-confirmation-document";
import { BOOKING_DEPOSIT_COLLECTION_EVENT } from "~~/server/utils/rental-held-balance-events";

type Row = Record<string, unknown>;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const BOOKING_SELECT =
  "id, status, booking_deposit_payment_status, currency_code, start_date, end_date, rental_days, user_id, walk_in_phone, hub_id, pos_branch_id, asset_id, asset_name, booker_name";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Booking id is required",
    });
  }

  // ── Step 1: Load booking + eligibility guard ─────────────────────────────
  const { data: bookingData, error: bookingErr } = await adminClient
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingErr)
    throw createError({ statusCode: 500, statusMessage: bookingErr.message });
  if (!bookingData)
    throw createError({ statusCode: 404, statusMessage: "Booking not found" });

  const booking = bookingData as Row;
  const bStatus = text(booking.status);
  const depositStatus = text(booking.booking_deposit_payment_status);

  if (
    bStatus !== "confirmed" ||
    !["paid", "paid_confirm_failed"].includes(depositStatus)
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: "BOOKING_NOT_ELIGIBLE_FOR_DOCUMENT_RETRY",
    });
  }

  // ── Step 2: Load existing task ───────────────────────────────────────────
  const { data: taskData, error: taskErr } = await adminClient
    .from("pos_document_issuance_tasks")
    .select(
      "id, status, official_document_id, held_balance_event_id, attempt_count",
    )
    .eq("rental_booking_id", bookingId)
    .eq("document_type", BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE)
    .maybeSingle();
  if (taskErr)
    throw createError({ statusCode: 500, statusMessage: taskErr.message });

  const taskRow = taskData as Row | null;

  // Short-circuit if already issued
  if (taskRow && text(taskRow.status) === "issued") {
    return {
      alreadyIssued: true,
      officialDocumentId: text(taskRow.official_document_id) || null,
    };
  }

  // ── Step 3: Resolve held balance event ───────────────────────────────────
  let heldBalanceEvent: Row | null = null;
  const heldEventIdFromTask = taskRow
    ? text(taskRow.held_balance_event_id)
    : "";

  if (heldEventIdFromTask) {
    const { data: evtById, error: e1 } = await adminClient
      .from("rental_held_balance_events")
      .select(
        "id, event_type, amount, currency_code, occurred_at, source_type, source_id, payment_method, branch_id",
      )
      .eq("id", heldEventIdFromTask)
      .maybeSingle();
    if (e1) throw createError({ statusCode: 500, statusMessage: e1.message });
    heldBalanceEvent = (evtById as Row | null) ?? null;
  }

  if (!heldBalanceEvent) {
    // Canonical missing-task lookup: payment-method agnostic.
    // Queries rental_held_balance_events by rental_booking_id + event_type so
    // it works for cash, future QR, online, and any non-POS booking deposit path.
    const { data: evtByBooking, error: e2 } = await adminClient
      .from("rental_held_balance_events")
      .select(
        "id, event_type, amount, currency_code, occurred_at, source_type, source_id, payment_method, branch_id",
      )
      .eq("rental_booking_id", bookingId)
      .eq("event_type", BOOKING_DEPOSIT_COLLECTION_EVENT)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e2) throw createError({ statusCode: 500, statusMessage: e2.message });
    heldBalanceEvent = (evtByBooking as Row | null) ?? null;
  }

  if (!heldBalanceEvent) {
    throw createError({
      statusCode: 422,
      statusMessage: "HELD_BALANCE_EVENT_NOT_FOUND",
    });
  }

  const heldEventId = text(heldBalanceEvent.id);

  // ── Step 4: Create task if missing ──────────────────────────────────────
  let taskId = taskRow ? text(taskRow.id) : "";
  let currentAttemptCount = taskRow ? Number(taskRow.attempt_count ?? 0) : 0;

  if (!taskId) {
    const { data: newTask, error: insertErr } = await adminClient
      .from("pos_document_issuance_tasks")
      .insert({
        document_type: BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
        rental_booking_id: bookingId,
        held_balance_event_id: heldEventId,
        // Mirror the held-balance event's own source — agnostic to payment method.
        payment_source_type: text(heldBalanceEvent.source_type) || null,
        payment_source_id: text(heldBalanceEvent.source_id) || null,
        status: "pending",
        attempt_count: 0,
        last_attempted_at: null,
      })
      .select("id, attempt_count")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        // Race condition — reload existing task
        const { data: existing } = await adminClient
          .from("pos_document_issuance_tasks")
          .select("id, status, official_document_id, attempt_count")
          .eq("rental_booking_id", bookingId)
          .eq("document_type", BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE)
          .maybeSingle();
        const ex = existing as Row | null;
        if (ex && text(ex.status) === "issued") {
          return {
            alreadyIssued: true,
            officialDocumentId: text(ex.official_document_id) || null,
          };
        }
        taskId = ex ? text(ex.id) : "";
        currentAttemptCount = ex ? Number(ex.attempt_count ?? 0) : 0;
      } else {
        throw createError({
          statusCode: 500,
          statusMessage: insertErr.message,
        });
      }
    } else {
      const nt = newTask as Row;
      taskId = text(nt.id);
      currentAttemptCount = Number(nt.attempt_count ?? 0);
    }
  }

  // ── Step 5: Update attempt tracking ─────────────────────────────────────
  const attemptNow = new Date().toISOString();
  if (taskId) {
    await adminClient
      .from("pos_document_issuance_tasks")
      .update({
        last_attempted_at: attemptNow,
        attempt_count: currentAttemptCount + 1,
        status: "pending",
      })
      .eq("id", taskId);
  }

  // ── Step 6: Issue document ───────────────────────────────────────────────
  const branchId =
    text(heldBalanceEvent.branch_id) ||
    text(booking.pos_branch_id) ||
    text(booking.hub_id) ||
    null;

  try {
    const issueResult = await issueBookingDepositConfirmationDocument({
      client: adminClient as never,
      heldBalanceEvent,
      booking,
      staffUserId: userId,
      branchId,
    });

    // ── Step 7: Mark task as issued ────────────────────────────────────
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

    return {
      alreadyIssued: issueResult.alreadyIssued,
      officialDocumentId: issueResult.document.id,
      documentNo: issueResult.document.documentNo,
    };
  } catch (docErr) {
    const errMsg = docErr instanceof Error ? docErr.message : String(docErr);
    const errCode =
      typeof docErr === "object" && docErr !== null && "statusCode" in docErr
        ? `HTTP_${(docErr as { statusCode: unknown }).statusCode}`
        : "DOCUMENT_ISSUANCE_FAILED";

    if (taskId) {
      await adminClient
        .from("pos_document_issuance_tasks")
        .update({
          status: "failed",
          error_code: errCode,
          error_message: errMsg,
        })
        .eq("id", taskId);
    }

    throw createError({
      statusCode: 500,
      statusMessage: `DOCUMENT_ISSUANCE_FAILED: ${errMsg}`,
    });
  }
});
