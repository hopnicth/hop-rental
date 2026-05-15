import { createError } from "h3";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

export type CartCheckoutStateValue =
  | "none"
  | "active_unpaid"
  | "expired"
  | "paid_or_finalized"
  | "blocked_review";

export type CartCheckoutState = {
  state: CartCheckoutStateValue;
  sessionId: string | null;
  checkoutKind: "mixed" | "rental_deposit_only" | "sale_only" | null;
  sessionStatus: string | null;
  attemptId: string | null;
  attemptStatus: string | null;
  method: "promptpay" | "credit_card" | null;
  expiresAt: string | null;
  saleItemCartLineIds: string[];
  bookingIds: string[];
  shippingIncluded: boolean;
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
  "voided",
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

function asKind(
  value: unknown,
): "mixed" | "rental_deposit_only" | "sale_only" | null {
  return value === "mixed" ||
    value === "rental_deposit_only" ||
    value === "sale_only"
    ? value
    : null;
}

function asMethod(value: unknown): "promptpay" | "credit_card" | null {
  return value === "promptpay" || value === "credit_card" ? value : null;
}

function metadata(row: AnyRecord): AnyRecord {
  return row.metadata &&
    typeof row.metadata === "object" &&
    !Array.isArray(row.metadata)
    ? (row.metadata as AnyRecord)
    : {};
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

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

function blank(): CartCheckoutState {
  return {
    state: "none",
    sessionId: null,
    checkoutKind: null,
    sessionStatus: null,
    attemptId: null,
    attemptStatus: null,
    method: null,
    expiresAt: null,
    saleItemCartLineIds: [],
    bookingIds: [],
    shippingIncluded: false,
  };
}

function rank(state: CartCheckoutStateValue): number {
  return {
    blocked_review: 5,
    active_unpaid: 4,
    paid_or_finalized: 3,
    expired: 2,
    none: 1,
  }[state];
}

function sortTimestamp(session: AnyRecord, attempt: AnyRecord | null): number {
  const raw =
    asString(attempt?.updated_at) ??
    asString(attempt?.created_at) ??
    asString(session.updated_at) ??
    asString(session.created_at) ??
    asString(session.expires_at);
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function newestAttempt(attempts: AnyRecord[]): AnyRecord | null {
  return (
    [...attempts].sort((a, b) => {
      const bMs = new Date(asString(b.created_at) ?? 0).getTime() || 0;
      const aMs = new Date(asString(a.created_at) ?? 0).getTime() || 0;
      return bMs - aMs;
    })[0] ?? null
  );
}

function allocationAttempt(
  allocations: AnyRecord[],
  attempts: AnyRecord[],
): AnyRecord | null {
  const linkedIds = new Set(
    allocations
      .map((row) => asString(row.mixed_payment_attempt_id))
      .filter(Boolean),
  );
  return (
    attempts.find((row) => linkedIds.has(String(row.id))) ??
    newestAttempt(attempts)
  );
}

function classify(input: {
  session: AnyRecord;
  allocations: AnyRecord[];
  attempt: AnyRecord | null;
}): CartCheckoutStateValue {
  const sessionStatus = asString(input.session.status);
  const attemptStatus = asString(input.attempt?.status);
  const allocationStatuses = input.allocations.map((row) =>
    asString(row.status),
  );

  if (
    REVIEW_STATUSES.has(String(sessionStatus)) ||
    REVIEW_STATUSES.has(String(attemptStatus)) ||
    allocationStatuses.some((status) => REVIEW_STATUSES.has(String(status)))
  )
    return "blocked_review";

  if (
    PAID_STATUSES.has(String(sessionStatus)) ||
    PAID_STATUSES.has(String(attemptStatus)) ||
    allocationStatuses.some((status) => PAID_STATUSES.has(String(status)))
  )
    return "paid_or_finalized";

  if (
    ACTIVE_SESSION_STATUSES.has(String(sessionStatus)) &&
    isFuture(input.session.expires_at) &&
    (!input.attempt ||
      (ACTIVE_ATTEMPT_STATUSES.has(String(attemptStatus)) &&
        (!asString(input.attempt.expires_at) ||
          isFuture(input.attempt.expires_at))))
  )
    return "active_unpaid";

  if (
    EXPIRED_STATUSES.has(String(sessionStatus)) ||
    EXPIRED_STATUSES.has(String(attemptStatus)) ||
    allocationStatuses.some((status) => EXPIRED_STATUSES.has(String(status))) ||
    isExpired(input.attempt?.expires_at) ||
    isExpired(input.session.expires_at)
  )
    return "expired";

  return "expired";
}

export async function getCartCheckoutState(input: {
  client: AnyClient;
  userId: string;
  cartId?: string | null;
  saleCartLineIds?: string[];
  bookingIds?: string[];
}): Promise<CartCheckoutState> {
  const cartId = asString(input.cartId);
  const requestedSaleLineIds = new Set(unique(input.saleCartLineIds ?? []));
  const requestedBookingIds = new Set(unique(input.bookingIds ?? []));

  const { data: sessions, error: sessionError } = await input.client
    .from("mixed_checkout_sessions")
    .select("*")
    .eq("user_id", input.userId);
  if (sessionError) {
    throw createError({ statusCode: 500, statusMessage: sessionError.message });
  }

  const sessionRows = (sessions ?? []) as AnyRecord[];
  if (sessionRows.length === 0) return blank();
  const sessionIds = unique(sessionRows.map((row) => asString(row.id)));

  const allocationResult = await input.client
    .from("mixed_payment_allocations")
    .select("*")
    .in("mixed_checkout_session_id", sessionIds);
  if (allocationResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: allocationResult.error.message,
    });
  }

  const attemptResult = await input.client
    .from("mixed_payment_attempts")
    .select("*")
    .in("mixed_checkout_session_id", sessionIds);
  if (attemptResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: attemptResult.error.message,
    });
  }

  const allocations = (allocationResult.data ?? []) as AnyRecord[];
  const attempts = (attemptResult.data ?? []) as AnyRecord[];
  const allocationsBySession = new Map<string, AnyRecord[]>();
  for (const allocation of allocations) {
    const key = String(allocation.mixed_checkout_session_id ?? "");
    allocationsBySession.set(key, [
      ...(allocationsBySession.get(key) ?? []),
      allocation,
    ]);
  }
  const attemptsBySession = new Map<string, AnyRecord[]>();
  for (const attempt of attempts) {
    const key = String(attempt.mixed_checkout_session_id ?? "");
    attemptsBySession.set(key, [
      ...(attemptsBySession.get(key) ?? []),
      attempt,
    ]);
  }

  const candidates: Array<CartCheckoutState & { sortMs: number }> = [];
  for (const session of sessionRows) {
    if (NEUTRAL_SESSION_STATUSES.has(String(session.status ?? ""))) continue;
    const sessionId = String(session.id ?? "");
    const sessionAllocations = allocationsBySession.get(sessionId) ?? [];
    const saleItemCartLineIds = unique(
      sessionAllocations
        .filter((row) => row.allocation_type === "sale_product")
        .map((row) => asString(metadata(row).cartLineId)),
    );
    const bookingIds = unique(
      sessionAllocations
        .filter((row) => row.allocation_type === "booking_deposit")
        .map(
          (row) =>
            asString(row.rental_booking_id) ??
            asString(row.target_id) ??
            asString(metadata(row).bookingId),
        ),
    );
    const relevantByCart = Boolean(cartId && session.cart_id === cartId);
    const relevantBySale = saleItemCartLineIds.some((id) =>
      requestedSaleLineIds.has(id),
    );
    const relevantByBooking = bookingIds.some((id) =>
      requestedBookingIds.has(id),
    );
    if (!relevantByCart && !relevantBySale && !relevantByBooking) continue;

    const sessionAttempts = attemptsBySession.get(sessionId) ?? [];
    const attempt = allocationAttempt(sessionAllocations, sessionAttempts);
    candidates.push({
      state: classify({ session, allocations: sessionAllocations, attempt }),
      sessionId,
      checkoutKind: asKind(session.checkout_kind),
      sessionStatus: asString(session.status),
      attemptId: asString(attempt?.id),
      attemptStatus: asString(attempt?.status),
      method: asMethod(attempt?.method),
      expiresAt: asString(attempt?.expires_at) ?? asString(session.expires_at),
      saleItemCartLineIds,
      bookingIds,
      shippingIncluded: sessionAllocations.some(
        (row) => row.allocation_type === "shipping",
      ),
      sortMs: sortTimestamp(session, attempt),
    });
  }

  const selected = candidates.sort(
    (a, b) => rank(b.state) - rank(a.state) || b.sortMs - a.sortMs,
  )[0];
  if (!selected) return blank();
  const { sortMs: _sortMs, ...state } = selected;
  return state;
}
