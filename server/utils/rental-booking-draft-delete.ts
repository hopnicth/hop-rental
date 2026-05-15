import { createError } from "h3";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

const ACTIVE_ATTEMPT_STATUSES = new Set([
  "created",
  "pending",
  "requires_action",
  "finalizing",
]);
const ACTIVE_SESSION_STATUSES = new Set([
  "validated",
  "payment_created",
  "finalizing",
]);
const PROTECTED_ALLOCATION_STATUSES = new Set([
  "paid",
  "finalized",
  "paid_confirm_failed",
  "admin_review_required",
  "refunded",
  "partial_refunded",
]);

function hasFiniteExpiry(value: unknown): boolean {
  if (!value) return false;
  return Number.isFinite(new Date(String(value)).getTime());
}

function isFuture(value: unknown, nowMs = Date.now()): boolean {
  if (!value) return false;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) && ms > nowMs;
}

function attemptBlocksSession(attempt: AnyRecord): boolean {
  if (!ACTIVE_ATTEMPT_STATUSES.has(String(attempt.status))) return false;
  return hasFiniteExpiry(attempt.expires_at)
    ? isFuture(attempt.expires_at)
    : true;
}

function isActiveSession(session: AnyRecord, attempts: AnyRecord[]): boolean {
  if (!ACTIVE_SESSION_STATUSES.has(String(session.status))) return false;
  if (!isFuture(session.expires_at)) return false;
  const sessionAttempts = attempts.filter(
    (row) => row.mixed_checkout_session_id === session.id,
  );
  if (sessionAttempts.length === 0) return true;
  return sessionAttempts.some(attemptBlocksSession);
}

function isActiveAttempt(attempt: AnyRecord, sessions: AnyRecord[]): boolean {
  const status = String(attempt.status);
  if (!ACTIVE_ATTEMPT_STATUSES.has(status)) return false;
  if (hasFiniteExpiry(attempt.expires_at)) return isFuture(attempt.expires_at);
  const session = sessions.find(
    (row) => row.id === attempt.mixed_checkout_session_id,
  );
  return session
    ? ACTIVE_SESSION_STATUSES.has(String(session.status)) &&
        isFuture(session.expires_at)
    : false;
}

export async function deleteDraftRentalBooking(input: {
  client: AnyClient;
  bookingId: string;
  userId: string;
}) {
  const { client, bookingId, userId } = input;
  const { data: booking, error: bookingError } = await client
    .from("rental_bookings")
    .select("id,user_id,status,booking_deposit_payment_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError)
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  if (!booking)
    throw createError({ statusCode: 404, statusMessage: "BOOKING_NOT_FOUND" });
  if (booking.user_id !== userId)
    throw createError({
      statusCode: 403,
      statusMessage: "BOOKING_ACCESS_DENIED",
    });
  if (booking.status !== "draft")
    throw createError({ statusCode: 409, statusMessage: "BOOKING_NOT_DRAFT" });
  if (String(booking.booking_deposit_payment_status ?? "unpaid") !== "unpaid")
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_DEPOSIT_NOT_UNPAID",
    });

  const { data: allocations, error: allocationError } = await client
    .from("mixed_payment_allocations")
    .select("*")
    .eq("rental_booking_id", bookingId);
  if (allocationError)
    throw createError({
      statusCode: 500,
      statusMessage: allocationError.message,
    });

  const allocationRows = (allocations ?? []) as AnyRecord[];
  const sessionIds = [
    ...new Set(
      allocationRows
        .map((row) => String(row.mixed_checkout_session_id ?? ""))
        .filter(Boolean),
    ),
  ];
  let sessions: AnyRecord[] = [];
  let attempts: AnyRecord[] = [];
  if (sessionIds.length > 0) {
    const sessionResult = await client
      .from("mixed_checkout_sessions")
      .select("*")
      .in("id", sessionIds);
    if (sessionResult.error)
      throw createError({
        statusCode: 500,
        statusMessage: sessionResult.error.message,
      });
    sessions = (sessionResult.data ?? []) as AnyRecord[];
    const attemptResult = await client
      .from("mixed_payment_attempts")
      .select("*")
      .in("mixed_checkout_session_id", sessionIds);
    if (attemptResult.error)
      throw createError({
        statusCode: 500,
        statusMessage: attemptResult.error.message,
      });
    attempts = (attemptResult.data ?? []) as AnyRecord[];
  }

  if (
    allocationRows.some((row) =>
      PROTECTED_ALLOCATION_STATUSES.has(String(row.status)),
    )
  )
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_DELETE_BLOCKED_PAID_ALLOCATION",
    });
  if (
    sessions.some((session) => isActiveSession(session, attempts)) ||
    attempts.some((attempt) => isActiveAttempt(attempt, sessions))
  )
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_DELETE_BLOCKED_ACTIVE_CHECKOUT",
    });

  const cleanup = {
    voidedAllocations: allocationRows.length,
    expiredAttempts: 0,
    expiredSessions: 0,
  };
  if (allocationRows.length > 0) {
    await client
      .from("mixed_payment_allocations")
      .update({ status: "voided", failure_code: "BOOKING_DRAFT_DELETED" })
      .eq("rental_booking_id", bookingId);
    await client
      .from("mixed_payment_allocations")
      .delete()
      .eq("rental_booking_id", bookingId);
  }
  for (const attempt of attempts) {
    if (ACTIVE_ATTEMPT_STATUSES.has(String(attempt.status))) {
      cleanup.expiredAttempts += 1;
      await client
        .from("mixed_payment_attempts")
        .update({ status: "expired" })
        .eq("id", attempt.id);
    }
  }
  for (const session of sessions) {
    if (ACTIVE_SESSION_STATUSES.has(String(session.status))) {
      cleanup.expiredSessions += 1;
      await client
        .from("mixed_checkout_sessions")
        .update({ status: "expired" })
        .eq("id", session.id);
    }
  }

  const { error: deleteError } = await client
    .from("rental_bookings")
    .delete()
    .eq("id", bookingId)
    .eq("status", "draft");
  if (deleteError)
    throw createError({ statusCode: 500, statusMessage: deleteError.message });
  return { ok: true, deletedBookingId: bookingId, cleanup };
}
