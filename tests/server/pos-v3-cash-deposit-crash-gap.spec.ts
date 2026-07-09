/**
 * Tests: POS V3 cash Booking-Deposit — W1→W2 crash gap (REGRESSION, fixed by mig-119)
 *
 * History: this spec first REPRODUCED the crash gap from
 * docs/audit/2026-07-09-pos-v3-deep-audit.md §P2.5 / finding 4 (test B was
 * `it.fails`). Migration 119 (f_confirm_rental_booking_deposit) made the money
 * core + confirm ATOMIC and the flow idempotent/re-entrant, and the cash
 * endpoint now inserts the attempt as 'finalizing' (not 'paid') and re-enters
 * the finalizer on a same-key retry. This spec was FLIPPED accordingly:
 *   - Block A now documents the FIXED mechanism (crash → attempt stays
 *     finalizing + booking draft; same-key retry RE-ENTERS and confirms).
 *   - Block B (recovery) is now a normal `it(...)` that passes.
 * The former A3 "one-paid index 23505 dead-end" is gone: the attempt is never
 * inserted as 'paid', so no second paid insert is ever attempted.
 *
 * Harness: drives the REAL cash endpoint + REAL finalizer; the atomic RPC is
 * stubbed on the mock client (`.rpc('f_confirm_rental_booking_deposit')`) in
 * three modes — confirm / crash / conflict — mutating an in-memory store so the
 * endpoint's insert('finalizing') + same-key re-entry logic is fully exercised.
 * The RPC's own atomicity/idempotency is proven separately at the DB level
 * (migration 119 PART-1 verification + migration-119-atomic-deposit-confirm.spec.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  platformRole: "super_admin" as string,
  // RPC behaviour: 'confirm' (atomic success), 'crash' (infra error → full
  // rollback), 'conflict' (genuine overlap → paid_confirm_failed).
  rpcMode: "confirm" as "confirm" | "crash" | "conflict",
  rpcCalls: [] as Record<string, unknown>[],
  store: {
    booking: null as Record<string, unknown> | null,
    attempts: [] as Record<string, unknown>[],
    heldEvents: [] as Record<string, unknown>[],
  },
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/rental-booking-availability", () => ({
  assertRentalBookingAvailability: vi.fn(async () => {}),
}));

vi.mock("~~/app/utils/rental-payment-lines", () => ({
  calculateBookingDepositDueNow: vi.fn(() => 200),
}));

// W5 document issuance (isolated, after confirm) — succeed.
vi.mock(
  "~~/server/utils/admin-rental-booking-deposit-confirmation-document",
  () => ({
    issueBookingDepositConfirmationDocument: vi.fn(async () => ({
      document: {
        id: "doc-1",
        documentNo: "BDC-1",
        status: "issued",
        issuedAt: "2026-05-21T10:00:00.000Z",
      },
      alreadyIssued: false,
    })),
    BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE:
      "rental_booking_deposit_confirmation",
  }),
);

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

function qr(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r),
  };
  return chain;
}

// The atomic RPC, stubbed. Mutates the store to mirror migration-119 effects.
function rpcConfirmDeposit(params: Record<string, unknown>) {
  mockState.rpcCalls.push(params);
  const b = mockState.store.booking!;
  const attemptId = params.p_attempt_id as string | null;
  const attempt = mockState.store.attempts.find((a) => a.id === attemptId);
  if (mockState.rpcMode === "crash") {
    // Infra failure — nothing changes (full rollback).
    return {
      data: null,
      error: { message: "HELD_BALANCE_EVENT_WRITE_FAILED", code: "P0001" },
    };
  }
  // Money core (atomic): held event + deposit fields + attempt→paid.
  const eventId = `evt-${mockState.store.heldEvents.length + 1}`;
  mockState.store.heldEvents.push({
    id: eventId,
    source_type: params.p_source_type,
    source_id: params.p_source_id,
    event_type: "booking_deposit_collection",
  });
  b.booking_deposit_payment_status = "paid";
  b.booking_deposit_paid_amount = params.p_amount;
  if (attempt) attempt.status = "paid";
  if (mockState.rpcMode === "conflict") {
    b.booking_deposit_payment_status = "paid_confirm_failed";
    if (attempt) attempt.status = "paid_confirm_failed";
    return {
      data: {
        status: "paid_confirm_failed",
        idempotent: false,
        held_balance_event_id: eventId,
        currency_code: "THB",
        booking_deposit_paid_amount: params.p_amount,
        confirm_failure_reason: "RENTAL_BOOKING_CONFLICT",
      },
      error: null,
    };
  }
  b.status = "confirmed";
  return {
    data: {
      status: "confirmed",
      idempotent: false,
      held_balance_event_id: eventId,
      currency_code: "THB",
      booking_deposit_paid_amount: params.p_amount,
      confirm_failure_reason: null,
    },
    error: null,
  };
}

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    userId: "staff-1",
    platformRole: mockState.platformRole,
    adminClient: {
      rpc: async (_fn: string, params: Record<string, unknown>) =>
        rpcConfirmDeposit(params),
      from: (table: string) => {
        if (table === "rental_bookings") {
          return {
            select: () => qr({ data: mockState.store.booking, error: null }),
            update: () => qr({ data: null, error: null }),
          };
        }
        if (table === "pos_rental_payment_attempts") {
          return {
            select: () => {
              const filters: Record<string, unknown> = {};
              const chain: Record<string, unknown> = {
                eq: (c: string, v: unknown) => {
                  filters[c] = v;
                  return chain;
                },
                maybeSingle: async () => {
                  const a = mockState.store.attempts.find(
                    (x) => x.idempotency_key === filters.idempotency_key,
                  );
                  return {
                    data: a
                      ? { id: a.id, amount: a.amount, status: a.status }
                      : null,
                    error: null,
                  };
                },
              };
              return chain;
            },
            insert: (payload: Record<string, unknown>) => {
              const row = {
                id: `attempt-${mockState.store.attempts.length + 1}`,
                ...payload,
              };
              mockState.store.attempts.push(row);
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: row.id, amount: row.amount, status: row.status },
                    error: null,
                  }),
                }),
              };
            },
            update: () => qr({ data: null, error: null }),
          };
        }
        if (table === "rental_held_balance_events") {
          return {
            select: () => {
              const filters: Record<string, unknown> = {};
              const chain: Record<string, unknown> = {
                eq: (c: string, v: unknown) => {
                  filters[c] = v;
                  return chain;
                },
                single: async () => ({
                  data:
                    mockState.store.heldEvents.find(
                      (e) => e.id === filters.id,
                    ) ?? null,
                  error: null,
                }),
              };
              return chain;
            },
          };
        }
        if (table === "pos_document_issuance_tasks") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "task-1", status: "pending", attempt_count: 0 },
                  error: null,
                }),
              }),
            }),
            update: () => qr({ data: null, error: null }),
            select: () => {
              const chain: Record<string, unknown> = {
                eq: () => chain,
                maybeSingle: async () => ({ data: null, error: null }),
              };
              return chain;
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

async function callCash(key: string) {
  mockState.body = { idempotencyKey: key, amount: 200, paymentMethod: "cash" };
  try {
    return { result: (await endpoint(event)) as Record<string, unknown>, error: null };
  } catch (error) {
    return { result: null, error: error as { statusCode?: number } & Error };
  }
}

describe("POS V3 cash Booking-Deposit — W1→W2 crash gap (fixed by mig-119)", () => {
  beforeEach(() => {
    mockState.body = {};
    mockState.platformRole = "super_admin";
    mockState.rpcMode = "confirm";
    mockState.rpcCalls = [];
    mockState.store = { booking: baseBooking(), attempts: [], heldEvents: [] };
  });

  // ── A. Mechanism (now FIXED) ────────────────────────────────────────────────

  it("A1 — a crash rolls back atomically: attempt stays 'finalizing', booking draft/unpaid, zero held events", async () => {
    mockState.rpcMode = "crash";
    const { result, error } = await callCash("pay-key-1");

    expect(result).toBeNull();
    expect(error?.statusCode).toBe(500); // HELD_BALANCE_EVENT_WRITE_FAILED
    // Attempt was inserted as 'finalizing' (NOT 'paid') and the RPC rolled back.
    expect(mockState.store.attempts).toHaveLength(1);
    expect(mockState.store.attempts[0].status).toBe("finalizing");
    expect(mockState.store.heldEvents).toHaveLength(0);
    expect(mockState.store.booking?.status).toBe("draft");
    expect(mockState.store.booking?.booking_deposit_payment_status).toBe("unpaid");
  });

  it("A2 — same-key retry RE-ENTERS finalization (no second attempt) and confirms the booking", async () => {
    mockState.rpcMode = "crash";
    await callCash("pay-key-1"); // crash → finalizing attempt

    mockState.rpcMode = "confirm";
    const { result, error } = await callCash("pay-key-1"); // same key

    expect(error).toBeNull();
    expect(result?.status).toBe("confirmed");
    // No second attempt row — the same finalizing attempt was re-entered.
    expect(mockState.store.attempts).toHaveLength(1);
    expect(mockState.store.attempts[0].status).toBe("paid");
    expect(mockState.store.booking?.status).toBe("confirmed");
    // The finalizer/RPC was invoked on BOTH calls (crash + recovery).
    expect(mockState.rpcCalls).toHaveLength(2);
  });

  // ── B. Recovery regression (was it.fails; now green) ────────────────────────

  it("B — after cash is captured and the money core crashes, a retry recovers the booking to confirmed", async () => {
    mockState.rpcMode = "crash";
    const first = await callCash("pay-key-1");
    expect(first.error).toBeTruthy();
    expect(mockState.store.attempts[0].status).toBe("finalizing");

    mockState.rpcMode = "confirm";
    await callCash("pay-key-1");

    // The invariant that FAILED before mig-119: the booking is recoverable via
    // the API alone — no manual DB surgery.
    expect(mockState.store.booking?.status).toBe("confirmed");
  });

  // ── Happy path + conflict, for completeness ─────────────────────────────────

  it("happy path — fresh finalize inserts 'finalizing', RPC confirms → status confirmed", async () => {
    const { result, error } = await callCash("pay-key-1");
    expect(error).toBeNull();
    expect(result?.status).toBe("confirmed");
    expect(mockState.store.attempts[0].status).toBe("paid");
    expect(mockState.store.heldEvents).toHaveLength(1);
    // The endpoint sent the correct source discriminator to the RPC.
    expect(mockState.rpcCalls[0]).toMatchObject({
      p_source_type: "pos_rental_payment_attempt",
      p_amount: 200,
    });
  });

  it("conflict — genuine overlap → paid_confirm_failed, money core kept", async () => {
    mockState.rpcMode = "conflict";
    const { result } = await callCash("pay-key-1");
    expect(result?.status).toBe("paid_confirm_failed");
    expect(mockState.store.heldEvents).toHaveLength(1); // liability recorded
    expect(mockState.store.booking?.status).toBe("draft"); // not confirmed
  });
});
