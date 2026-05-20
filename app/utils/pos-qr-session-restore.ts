/**
 * Phase 2D-B3.2: POS V3 QR session-buffer restore logic.
 *
 * Extracted into a standalone injectable function so that the restore flow
 * can be tested behaviorally in a Node environment without mounting the Vue
 * component or requiring jsdom / @vue/test-utils.
 *
 * index.vue onMounted wires Nuxt's window.sessionStorage and $fetch;
 * tests inject Map-backed stubs and plain async functions.
 */

/** The tab-scoped sessionStorage key used by both index.vue and the QR container. */
export const QR_SESSION_BUFFER_KEY =
  "hopnic:pos-v3:future-booking-qr-session:v1";

/** Discriminated-union outcome returned by runQrSessionRestore. */
export type QrSessionRestoreOutcome<TDetail> =
  | { kind: "restored"; detail: TDetail; activeAttempt: unknown }
  | { kind: "cleared"; reason: QrSessionClearReason }
  | { kind: "skipped" }; // no buffer present in storage

export type QrSessionClearReason =
  | "invalid_buffer" // malformed JSON, wrong shape, or expired resumeUntil
  | "booking_fetch_error" // server unreachable when fetching booking detail
  | "booking_not_restorable" // booking is no longer draft/unpaid
  | "no_active_attempt" // server explicitly confirmed: no active QR attempt exists
  | "active_fetch_error"; // server unreachable when fetching active attempt

export interface QrSessionRestoreOpts<TDetail> {
  /** sessionStorage adapter — injected for testability */
  storage: Pick<Storage, "getItem" | "removeItem">;
  /** Async fetch of booking detail for the buffered bookingId */
  fetchDetail: (bookingId: string) => Promise<TDetail>;
  /** Async fetch of the active QR attempt for the bookingId */
  fetchActiveAttempt: (
    bookingId: string,
  ) => Promise<{ attempt: unknown | null }>;
  /** Return true only when the booking state permits QR restore */
  isRestorable: (detail: TDetail) => boolean;
  /** Injectable clock for deterministic testing (defaults to Date.now) */
  now?: () => number;
}

/**
 * Reads the session buffer, validates it against the server, and returns
 * a discriminated outcome.  All clearing is done via storage.removeItem
 * so the caller never needs to touch storage directly.
 *
 * Callers (onMounted in index.vue) must only mutate Vue state when
 * outcome.kind === "restored".
 */
export async function runQrSessionRestore<TDetail>(
  opts: QrSessionRestoreOpts<TDetail>,
): Promise<QrSessionRestoreOutcome<TDetail>> {
  const {
    storage,
    fetchDetail,
    fetchActiveAttempt,
    isRestorable,
    now = () => Date.now(),
  } = opts;

  // ── 1. Read buffer ────────────────────────────────────────────────────────
  let raw: string | null;
  try {
    raw = storage.getItem(QR_SESSION_BUFFER_KEY);
  } catch {
    return { kind: "skipped" }; // private-browsing / SSR guard
  }
  if (!raw) return { kind: "skipped" };

  // ── 2. Parse ──────────────────────────────────────────────────────────────
  let buffer: Record<string, unknown>;
  try {
    buffer = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    storage.removeItem(QR_SESSION_BUFFER_KEY);
    return { kind: "cleared", reason: "invalid_buffer" };
  }

  // ── 3. Validate shape and expiry ──────────────────────────────────────────
  if (
    !buffer ||
    buffer.version !== 1 ||
    buffer.flow !== "future_booking_qr_deposit" ||
    buffer.paymentMethod !== "promptpay_qr" ||
    typeof buffer.bookingId !== "string" ||
    !buffer.bookingId ||
    typeof buffer.resumeUntil !== "string" ||
    now() > new Date(buffer.resumeUntil as string).getTime()
  ) {
    storage.removeItem(QR_SESSION_BUFFER_KEY);
    return { kind: "cleared", reason: "invalid_buffer" };
  }

  const bookingId = buffer.bookingId as string;

  // ── 4. Fetch booking detail ───────────────────────────────────────────────
  let detail: TDetail;
  try {
    detail = await fetchDetail(bookingId);
  } catch {
    storage.removeItem(QR_SESSION_BUFFER_KEY);
    return { kind: "cleared", reason: "booking_fetch_error" };
  }

  // ── 5. Validate booking is still restorable ───────────────────────────────
  if (!isRestorable(detail)) {
    storage.removeItem(QR_SESSION_BUFFER_KEY);
    return { kind: "cleared", reason: "booking_not_restorable" };
  }

  // ── 6. Check for an active QR attempt (server-authoritative) ─────────────
  let activeAttempt: unknown;
  try {
    const { attempt } = await fetchActiveAttempt(bookingId);
    if (!attempt) {
      storage.removeItem(QR_SESSION_BUFFER_KEY);
      return { kind: "cleared", reason: "no_active_attempt" };
    }
    activeAttempt = attempt;
  } catch {
    storage.removeItem(QR_SESSION_BUFFER_KEY);
    return { kind: "cleared", reason: "active_fetch_error" };
  }

  // ── All checks passed ─────────────────────────────────────────────────────
  return { kind: "restored", detail, activeAttempt };
}
