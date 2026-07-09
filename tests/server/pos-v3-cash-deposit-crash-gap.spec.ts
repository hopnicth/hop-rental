/**
 * Tests: POS V3 cash Booking-Deposit — W1 → W2 crash gap (REPRODUCTION)
 *
 * Reproduces the HIGH finding tagged "pending reproduction test" in
 * docs/audit/2026-07-09-pos-v3-deep-audit.md §P2.5 / finding 4, against the
 * REAL endpoint + REAL finalizer:
 *   server/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-payments.post.ts
 *   server/utils/pos-rental-booking-deposit-finalizer.ts
 *
 * Scenario: the cash deposit flow crashes AFTER W1 (attempt INSERT as
 * "paid", endpoint :201-220) but BEFORE W2 completes (held-balance event,
 * finalizer :112-123 — NOT wrapped in try/catch, so a throw propagates out
 * → 500). Cash is physically captured, but the booking is left draft/unpaid
 * with zero held-balance events, and BOTH recovery routes fail:
 *   - same-key retry: the idempotency pre-check (:150-168) returns the stored
 *     "paid" attempt WITHOUT re-running the finalizer → booking stays draft.
 *   - new-key retry: the booking is still `unpaid` (W3 never ran) so it passes
 *     the guards, but a second "paid" booking_deposit insert hits the partial
 *     unique index `idx_pos_rental_payment_attempts_one_paid_deposit`
 *     (migration 087:41-43) → 23505 → the endpoint's 23505 handler (:222-243)
 *     finds no attempt for the NEW key → 409 IDEMPOTENCY_KEY_AMOUNT_CONFLICT.
 *     (Audit said "→ 500"; the real code path returns 409 — the stuck-state
 *     conclusion is unchanged; noted for accuracy.)
 *
 * FAITHFULNESS / TRADEOFF (per task item 2): the two DB uniqueness rules are
 * SIMULATED in the mock client — the partial unique index (one paid deposit
 * per booking) and the (rental_booking_id, idempotency_key) unique. The code
 * actually under test is the REAL endpoint + REAL finalizer control flow and
 * its 23505 / idempotency handlers; the simulated 23505 is anchored to a real
 * schema fact asserted below (migration 087). A live-local-DB integration test
 * would exercise the physical index directly, but the existing tests/server
 * harness is mock-only (no DB connection in `vitest run`) and the endpoint's
 * recovery logic — the thing the audit's claim hinges on — is fully exercised
 * here.
 *
 * Covers:
 *  A. Characterization (GREEN today) — documents the exact broken mechanism
 *     with TODO(mig-119) notes: crash leaves attempt paid + booking draft +
 *     zero events; same-key retry no-finalizes; new-key retry 23505-conflicts.
 *  B. Reproduction (RED today, flips GREEN with mig-119) — after the money is
 *     captured, a retry MUST recover the booking to a consistent state without
 *     manual DB surgery. Fails today; proves the stuck state.
 *  C. Schema anchor — migration 087 really defines the one-paid partial unique
 *     index that backs the simulated 23505.
 *
 * MIG-119 FLIP: test B is marked `it.fails(...)` so the suite is GREEN today
 * (B is genuinely red) and turns RED the moment mig-119 fixes recovery —
 * whoever lands mig-119 MUST change B from `it.fails` to a normal `it(...)`
 * (and revisit block A's characterization assertions) in that same commit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockState = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  platformRole: "staff" as string,
  branchAccess: true,
  // W2 fault injection: when true, the held-balance write crashes (non-idempotent).
  heldBalanceCrash: false,
  heldBalanceCallCount: 0,
  heldBalanceSuccessCount: 0,
  // In-memory store modelling the two real unique constraints on
  // pos_rental_payment_attempts (migration 087).
  store: {
    booking: null as Record<string, unknown> | null,
    attempts: [] as Record<string, unknown>[],
    bookingUpdates: [] as Record<string, unknown>[],
    attemptUpdates: [] as Record<string, unknown>[],
  },
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/rental-booking-availability", () => ({
  assertRentalBookingAvailability: vi.fn(async () => {
    /* drafts never conflict in this scenario */
  }),
}));

// W2 boundary — the fault-injection point.
vi.mock("~~/server/utils/rental-held-balance-events", () => ({
  recordBookingDepositHeldBalanceCollection: vi.fn(
    async (input: Record<string, unknown>) => {
      mockState.heldBalanceCallCount += 1;
      if (mockState.heldBalanceCrash) {
        // A non-idempotent mid-write failure (e.g. connection reset). The
        // finalizer does NOT catch this, so it propagates out of the endpoint.
        throw new Error("HELD_BALANCE_WRITE_CRASH");
      }
      mockState.heldBalanceSuccessCount += 1;
      return {
        id: "event-1",
        event_type: "booking_deposit_collection",
        amount: input.amount,
        currency_code: "THB",
        source_type: input.sourceType,
        source_id: input.sourceId,
        payment_method: input.paymentMethod ?? "cash",
        occurred_at: new Date().toISOString(),
      };
    },
  ),
}));

// Reached only if W2 succeeds (it never does in the crash scenario).
vi.mock("~~/server/utils/rental-booking-confirmation", () => ({
  confirmRentalBooking: vi.fn(async () => ({
    id: "booking-1",
    status: "confirmed",
  })),
}));

vi.mock(
  "~~/server/utils/admin-rental-booking-deposit-confirmation-document",
  () => ({
    issueBookingDepositConfirmationDocument: vi.fn(async () => ({
      document: { id: "doc-1", status: "issued" },
      alreadyIssued: false,
    })),
    BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE:
      "rental_booking_deposit_confirmation",
  }),
);

vi.mock("~~/app/utils/rental-payment-lines", () => ({
  calculateBookingDepositDueNow: vi.fn(() => 200),
}));

/** Simple resolved chain (select/eq/single/maybeSingle/await). */
function qr(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}

/**
 * Stateful admin client that faithfully models the endpoint's reads/writes
 * plus the two real unique constraints on pos_rental_payment_attempts.
 */
vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    userId: "staff-1",
    platformRole: mockState.platformRole,
    adminClient: {
      from: (table: string) => {
        if (table === "admin_user_branch_access")
          return qr({
            data: mockState.branchAccess ? { branch_id: "branch-hq" } : null,
            error: null,
          });

        if (table === "rental_bookings") {
          return {
            select: () => qr({ data: mockState.store.booking, error: null }),
            update: (payload: Record<string, unknown>) => {
              mockState.store.bookingUpdates.push({ ...payload });
              if (mockState.store.booking)
                Object.assign(mockState.store.booking, payload);
              return qr({ data: null, error: null });
            },
          };
        }

        if (table === "pos_rental_payment_attempts") {
          return {
            // findExistingPosAttempt — filter by (rental_booking_id, idempotency_key)
            select: () => {
              const filters: Record<string, unknown> = {};
              const chain: Record<string, unknown> = {
                eq: (col: string, val: unknown) => {
                  filters[col] = val;
                  return chain;
                },
                maybeSingle: async () => {
                  const found = mockState.store.attempts.find(
                    (a) =>
                      a.rental_booking_id === filters.rental_booking_id &&
                      a.idempotency_key === filters.idempotency_key,
                  );
                  return {
                    data: found
                      ? {
                          id: found.id,
                          amount: found.amount,
                          status: found.status,
                          paid_at: found.paid_at ?? null,
                          confirm_failed_at: found.confirm_failed_at ?? null,
                          confirm_failure_reason:
                            found.confirm_failure_reason ?? null,
                        }
                      : null,
                    error: null,
                  };
                },
              };
              return chain;
            },
            // W1 — INSERT attempt, enforcing the two real unique constraints.
            insert: (payload: Record<string, unknown>) => {
              const bookingId = payload.rental_booking_id;
              const dupKey = mockState.store.attempts.some(
                (a) =>
                  a.rental_booking_id === bookingId &&
                  a.idempotency_key === payload.idempotency_key,
              );
              const isPaidDeposit =
                payload.status === "paid" &&
                payload.payment_purpose === "booking_deposit";
              // idx_pos_rental_payment_attempts_one_paid_deposit (mig 087:41-43)
              const dupPaidDeposit =
                isPaidDeposit &&
                mockState.store.attempts.some(
                  (a) =>
                    a.rental_booking_id === bookingId &&
                    a.status === "paid" &&
                    a.payment_purpose === "booking_deposit",
                );
              if (dupKey || dupPaidDeposit) {
                return {
                  select: () => ({
                    single: async () => ({
                      data: null,
                      error: {
                        code: "23505",
                        message: dupPaidDeposit
                          ? "idx_pos_rental_payment_attempts_one_paid_deposit"
                          : "pos_rental_payment_attempts_rental_booking_id_idempotency_key_key",
                      },
                    }),
                  }),
                };
              }
              const row = {
                id: `attempt-${mockState.store.attempts.length + 1}`,
                ...payload,
              };
              mockState.store.attempts.push(row);
              return {
                select: () => ({
                  single: async () => ({
                    data: {
                      id: row.id,
                      amount: row.amount,
                      status: row.status,
                    },
                    error: null,
                  }),
                }),
              };
            },
            update: (payload: Record<string, unknown>) => {
              mockState.store.attemptUpdates.push({ ...payload });
              return qr({ data: null, error: null });
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  }),
}));

const endpoint = (
  await import(
    "../../server/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-payments.post"
  )
).default;

const event = { context: { params: { bookingId: "booking-1" } } };

function baseBooking() {
  return {
    id: "booking-1",
    user_id: null,
    walk_in_phone: "0812345678",
    status: "draft",
    asset_id: "asset-1",
    sku_id: null,
    start_date: "2099-05-21",
    end_date: "2099-05-24",
    rental_days: 3,
    hub_id: "branch-hq",
    deposit_amount: 5000,
    currency_code: "THB",
    booking_deposit_payment_status: "unpaid",
    booking_deposit_paid_amount: 0,
    pos_branch_id: "branch-hq",
    pos_staff_user_id: "staff-1",
  };
}

/** Invoke the real endpoint; return {result} on success or {error} on throw. */
async function callCashDeposit(idempotencyKey: string) {
  mockState.body = { idempotencyKey, amount: 200, paymentMethod: "cash" };
  try {
    const result = await endpoint(event);
    return { result: result as Record<string, unknown>, error: null };
  } catch (error) {
    return { result: null, error: error as { statusCode?: number } & Error };
  }
}

describe("POS V3 cash Booking-Deposit — W1→W2 crash gap", () => {
  beforeEach(() => {
    mockState.platformRole = "super_admin"; // skip branch-access lookup noise
    mockState.branchAccess = true;
    mockState.heldBalanceCrash = false;
    mockState.heldBalanceCallCount = 0;
    mockState.heldBalanceSuccessCount = 0;
    mockState.store = {
      booking: baseBooking(),
      attempts: [],
      bookingUpdates: [],
      attemptUpdates: [],
    };
  });

  // ── A. CHARACTERIZATION (green today) — documents the broken mechanism ──────
  // TODO(mig-119): once the finalizer is atomic (single RPC) AND a same-key cash
  // retry re-enters finalization, these assertions describe behaviour that must
  // change; this block is expected to be revisited alongside the fix.

  it("A1 — crash after W1 leaves attempt 'paid', booking draft/unpaid, zero held-balance events", async () => {
    mockState.heldBalanceCrash = true; // W2 throws
    const { result, error } = await callCashDeposit("pay-key-1");

    // The endpoint rejects (finalizer does not catch the W2 crash).
    expect(result).toBeNull();
    expect(error).toBeTruthy();

    // W1 committed: exactly one attempt, recorded as 'paid' (money captured).
    expect(mockState.store.attempts).toHaveLength(1);
    expect(mockState.store.attempts[0]).toMatchObject({
      rental_booking_id: "booking-1",
      payment_purpose: "booking_deposit",
      payment_method: "cash",
      status: "paid",
    });
    // W2 never succeeded → zero held-balance events.
    expect(mockState.heldBalanceSuccessCount).toBe(0);
    // W3/W4 never ran → booking still draft & unpaid.
    expect(mockState.store.booking?.status).toBe("draft");
    expect(mockState.store.booking?.booking_deposit_payment_status).toBe(
      "unpaid",
    );
    expect(mockState.store.bookingUpdates).toHaveLength(0);
  });

  it("A2 — same-key retry returns the stored 'paid' attempt WITHOUT finalizing; booking stays draft", async () => {
    mockState.heldBalanceCrash = true;
    await callCashDeposit("pay-key-1"); // crash
    const callsAfterCrash = mockState.heldBalanceCallCount;

    // Retry with the SAME idempotency key after the transient fault clears.
    mockState.heldBalanceCrash = false;
    const { result, error } = await callCashDeposit("pay-key-1");

    expect(error).toBeNull();
    // Idempotency pre-check short-circuits: returns the stored attempt as-is.
    expect(result).toMatchObject({ status: "paid", idempotent: true });
    // Finalizer was NOT re-invoked (held-balance mock call count unchanged).
    expect(mockState.heldBalanceCallCount).toBe(callsAfterCrash);
    // Booking is still stuck in draft — no recovery.
    expect(mockState.store.booking?.status).toBe("draft");
    expect(mockState.store.attempts).toHaveLength(1);
  });

  it("A3 — new-key retry hits the one-paid partial unique index (23505) → 409 conflict; booking stays draft", async () => {
    mockState.heldBalanceCrash = true;
    await callCashDeposit("pay-key-1"); // crash, attempt#1 paid

    // Retry with a NEW key: booking is still unpaid so it passes the guards,
    // but the second 'paid' booking_deposit insert violates the one-paid index.
    mockState.heldBalanceCrash = false;
    const { result, error } = await callCashDeposit("pay-key-2");

    expect(result).toBeNull();
    expect(error).toBeTruthy();
    // Real endpoint 23505 handler → 409 IDEMPOTENCY_KEY_AMOUNT_CONFLICT.
    // (Audit said 500; the code returns 409 — recorded for accuracy.)
    expect(error?.statusCode).toBe(409);
    // Only the original attempt is committed; booking still stuck draft.
    expect(mockState.store.attempts).toHaveLength(1);
    expect(mockState.store.booking?.status).toBe("draft");
  });

  // ── B. REPRODUCTION (RED today; flips GREEN with mig-119) ────────────────────

  it.fails("B — REPRO: after cash is captured (W1) and W2 crashes, a retry MUST recover the booking (FAILS until mig-119)", async () => {
    // 1) First attempt crashes at W2 — cash captured, booking stuck.
    mockState.heldBalanceCrash = true;
    const first = await callCashDeposit("pay-key-1");
    expect(first.error).toBeTruthy(); // crashed
    expect(mockState.store.attempts[0]?.status).toBe("paid"); // money captured

    // 2) Fault clears; staff retries with the SAME key (the natural recovery).
    mockState.heldBalanceCrash = false;
    await callCashDeposit("pay-key-1");

    // INVARIANT (mig-119 target): captured money must not leave the booking
    // permanently stuck. A retry must reconcile it to `confirmed` (or an
    // equivalent recovered state) via the API alone — no manual DB surgery.
    //
    // TODO(mig-119): the atomic finalization RPC + idempotent same-key
    // re-entry make this pass. Today the same-key retry short-circuits without
    // finalizing, so the booking is still `draft` and this assertion FAILS —
    // which is the proof of the stuck state.
    expect(mockState.store.booking?.status).toBe("confirmed");
  });

  // ── C. SCHEMA ANCHOR — the real index backing the simulated 23505 ────────────

  it("C — migration 087 defines the one-paid partial unique index + idempotency-key unique", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/087_pos_rental_payment_attempts.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("idx_pos_rental_payment_attempts_one_paid_deposit");
    expect(sql).toMatch(
      /WHERE status = 'paid' AND payment_purpose = 'booking_deposit'/,
    );
    expect(sql).toContain("UNIQUE (rental_booking_id, idempotency_key)");
  });
});
