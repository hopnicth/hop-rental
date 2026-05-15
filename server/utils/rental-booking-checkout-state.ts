import { createError } from "h3";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

export type DraftBookingCheckoutState = {
  bookingId: string;
  state:
    | "none"
    | "active_unpaid"
    | "expired"
    | "paid_or_finalized"
    | "blocked_review";
  sessionId: string | null;
  sessionStatus: string | null;
  attemptId: string | null;
  attemptStatus: string | null;
  method: "promptpay" | "credit_card" | null;
  expiresAt: string | null;
  allocationStatus: string | null;
};

const ACTIVE_SESSION_STATUSES = new Set(["validated", "payment_created"]);
const ACTIVE_ATTEMPT_STATUSES = new Set([
  "created",
  "pending",
  "requires_action",
]);
const EXPIRED_STATUSES = new Set([
  "expired",
  "failed",
  "cancelled",
  "refunded",
]);
const PAID_STATUSES = new Set(["paid", "finalized"]);
const REVIEW_STATUSES = new Set([
  "partial_finalized",
  "finalization_failed",
  "paid_confirm_failed",
  "admin_review_required",
]);
const NEUTRAL_SESSION_STATUSES = new Set(["cancelled"]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isFuture(value: unknown, nowMs = Date.now()): boolean {
  const raw = asString(value);
  if (!raw) return false;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) && ms > nowMs;
}

function isExpired(value: unknown, nowMs = Date.now()): boolean {
  const raw = asString(value);
  if (!raw) return false;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) && ms <= nowMs;
}

function method(value: unknown): "promptpay" | "credit_card" | null {
  return value === "promptpay" || value === "credit_card" ? value : null;
}

function blank(bookingId: string): DraftBookingCheckoutState {
  return {
    bookingId,
    state: "none",
    sessionId: null,
    sessionStatus: null,
    attemptId: null,
    attemptStatus: null,
    method: null,
    expiresAt: null,
    allocationStatus: null,
  };
}

function classify(input: {
  bookingId: string;
  allocation: AnyRecord;
  session: AnyRecord | null;
  attempt: AnyRecord | null;
}): DraftBookingCheckoutState {
  const { bookingId, allocation, session, attempt } = input;
  const sessionStatus = asString(session?.status);
  const attemptStatus = asString(attempt?.status);
  const allocationStatus = asString(allocation.status);
  const expiresAt =
    asString(attempt?.expires_at) ?? asString(session?.expires_at);
  const result: DraftBookingCheckoutState = {
    bookingId,
    state: "expired",
    sessionId: asString(allocation.mixed_checkout_session_id),
    sessionStatus,
    attemptId: asString(attempt?.id ?? allocation.mixed_payment_attempt_id),
    attemptStatus,
    method: method(attempt?.method),
    expiresAt,
    allocationStatus,
  };

  if (
    REVIEW_STATUSES.has(String(allocationStatus)) ||
    REVIEW_STATUSES.has(String(sessionStatus)) ||
    REVIEW_STATUSES.has(String(attemptStatus))
  )
    result.state = "blocked_review";
  else if (
    PAID_STATUSES.has(String(allocationStatus)) ||
    PAID_STATUSES.has(String(sessionStatus)) ||
    PAID_STATUSES.has(String(attemptStatus))
  )
    result.state = "paid_or_finalized";
  else if (
    session &&
    ACTIVE_SESSION_STATUSES.has(String(sessionStatus)) &&
    isFuture(session.expires_at) &&
    (!attempt ||
      (ACTIVE_ATTEMPT_STATUSES.has(String(attemptStatus)) &&
        (!asString(attempt.expires_at) || isFuture(attempt.expires_at))))
  )
    result.state = "active_unpaid";
  else if (
    EXPIRED_STATUSES.has(String(allocationStatus)) ||
    EXPIRED_STATUSES.has(String(sessionStatus)) ||
    EXPIRED_STATUSES.has(String(attemptStatus)) ||
    isExpired(attempt?.expires_at) ||
    isExpired(session?.expires_at)
  )
    result.state = "expired";
  return result;
}

function rank(state: DraftBookingCheckoutState["state"]): number {
  return {
    blocked_review: 5,
    paid_or_finalized: 4,
    active_unpaid: 3,
    expired: 2,
    none: 1,
  }[state];
}

export async function getDraftRentalBookingCheckoutStates(input: {
  client: AnyClient;
  userId: string;
  bookingIds: string[];
}) {
  const bookingIds = [...new Set(input.bookingIds.filter(Boolean))].slice(
    0,
    100,
  );
  if (bookingIds.length === 0) return { ok: true, states: {} };

  const { data: bookings, error: bookingError } = await input.client
    .from("rental_bookings")
    .select("id")
    .eq("user_id", input.userId)
    .eq("status", "draft")
    .in("id", bookingIds);
  if (bookingError)
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  const ownedIds = new Set(
    (bookings ?? []).map((row: AnyRecord) => String(row.id)),
  );
  if (ownedIds.size === 0) return { ok: true, states: {} };

  const { data: allocations, error: allocationError } = await input.client
    .from("mixed_payment_allocations")
    .select("*")
    .in("rental_booking_id", [...ownedIds]);
  if (allocationError)
    throw createError({
      statusCode: 500,
      statusMessage: allocationError.message,
    });

  const allocationRows = (allocations ?? []) as AnyRecord[];
  const sessionIds = [
    ...new Set(
      allocationRows
        .map((row) => asString(row.mixed_checkout_session_id))
        .filter(Boolean) as string[],
    ),
  ];
  let sessions: AnyRecord[] = [];
  let attempts: AnyRecord[] = [];
  if (sessionIds.length > 0) {
    const sessionResult = await input.client
      .from("mixed_checkout_sessions")
      .select("*")
      .in("id", sessionIds);
    if (sessionResult.error)
      throw createError({
        statusCode: 500,
        statusMessage: sessionResult.error.message,
      });
    sessions = (sessionResult.data ?? []) as AnyRecord[];
    const attemptResult = await input.client
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
  const sessionById = new Map(sessions.map((row) => [String(row.id), row]));
  const attemptsBySession = new Map<string, AnyRecord[]>();
  for (const attempt of attempts) {
    const key = String(attempt.mixed_checkout_session_id ?? "");
    attemptsBySession.set(key, [
      ...(attemptsBySession.get(key) ?? []),
      attempt,
    ]);
  }

  const states: Record<string, DraftBookingCheckoutState> = {};
  for (const bookingId of ownedIds) states[bookingId] = blank(bookingId);
  for (const allocation of allocationRows) {
    const bookingId = String(allocation.rental_booking_id ?? "");
    if (!ownedIds.has(bookingId)) continue;
    const sessionId = String(allocation.mixed_checkout_session_id ?? "");
    const session = sessionById.get(sessionId) ?? null;
    if (NEUTRAL_SESSION_STATUSES.has(String(session?.status ?? ""))) continue;
    const sessionAttempts = attemptsBySession.get(sessionId) ?? [];
    const attempt =
      sessionAttempts.find(
        (row) => row.id === allocation.mixed_payment_attempt_id,
      ) ??
      sessionAttempts[0] ??
      null;
    const next = classify({ bookingId, allocation, session, attempt });
    if (rank(next.state) >= rank(states[bookingId].state))
      states[bookingId] = next;
  }
  return { ok: true, states };
}
