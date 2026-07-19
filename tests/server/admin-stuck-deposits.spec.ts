/**
 * Tests: B-M1 stuck-deposit recovery surface (T3 walk 6)
 *
 * Covers:
 *  1. List surface: paid_confirm_failed bookings with money context
 *  2. retry-confirm verifies stored money state BEFORE the confirm half
 *     (no ledger collection → 409, confirm never called)
 *  3. Success restores 'paid' + clears failure fields; conflict surfaces 409
 *     without force-confirm; idempotent on recovered bookings
 *  4. Endpoint source contracts (read surface + retry are requirePlatformAdmin)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("~~/server/utils/rental-booking-confirmation", () => ({
  confirmRentalBooking: vi.fn(async (input: Record<string, unknown>) => {
    if ((globalThis as Record<string, unknown>).__walk6ConflictMode) {
      const err = new Error("RENTAL_BOOKING_CONFLICT") as Error & {
        statusCode?: number;
      };
      err.statusCode = 409;
      throw err;
    }
    (globalThis as Record<string, unknown>).__walk6ConfirmCalls =
      (((globalThis as Record<string, unknown>).__walk6ConfirmCalls as unknown[]) ?? []).concat([input]);
    return { id: input.bookingId, status: "confirmed" };
  }),
}));

import {
  listStuckDepositBookings,
  retryConfirmStuckBooking,
} from "../../server/utils/admin-stuck-deposits";

type Row = Record<string, unknown>;
const BOOKING = "61616161-6161-4161-8161-616161616161";

function stuckBooking(overrides: Row = {}): Row {
  return {
    id: BOOKING,
    user_id: "user-1",
    status: "draft",
    product_name: "Stuck Drill",
    start_date: "2026-08-01",
    end_date: "2026-08-03",
    currency_code: "THB",
    booking_deposit_paid_amount: 300,
    deposit_paid_amount: 0,
    booking_deposit_payment_status: "paid_confirm_failed",
    booking_deposit_confirm_failed_at: "2026-07-18T00:00:00.000Z",
    booking_deposit_confirm_failure_reason: "RENTAL_BOOKING_CONFLICT",
    booking_deposit_payment_attempt_id: "attempt-1",
    booking_deposit_mixed_allocation_id: null,
    ...overrides,
  };
}

function makeClient(opts: { booking?: Row | null; ledger?: Row[] }) {
  const state = { bookingUpdates: [] as Row[] };
  const ledger =
    opts.ledger ?? [
      { event_type: "booking_deposit_collection", amount: 300, status: "posted" },
    ];
  const client = {
    from(table: string) {
      if (table === "rental_bookings")
        return {
          select: () => ({
            eq: (_c: string, _v: unknown) => {
              const rows =
                opts.booking === undefined
                  ? [stuckBooking()]
                  : opts.booking
                    ? [opts.booking]
                    : [];
              return {
                maybeSingle: async () => ({
                  data: rows[0] ?? null,
                  error: null,
                }),
                in: (_col: string, statuses: string[]) => ({
                  order: async () => ({
                    data: rows.filter((r) => statuses.includes(String(r.status))),
                    error: null,
                  }),
                }),
              };
            },
          }),
          update: (p: Row) => ({
            eq: () => ({
              eq: async () => {
                state.bookingUpdates.push(p);
                return { error: null };
              },
            }),
          }),
        };
      if (table === "rental_held_balance_events")
        return { select: () => ({ eq: async () => ({ data: ledger, error: null }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, state };
}

describe("listStuckDepositBookings", () => {
  it("lists paid_confirm_failed bookings with money context", async () => {
    const { client } = makeClient({});
    const items = await listStuckDepositBookings(client as any);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: BOOKING,
      capturedAmount: 300,
      ledgerHeld: 300,
      failureReason: "RENTAL_BOOKING_CONFLICT",
      paymentSource: "rental_booking_payment_attempt",
    });
  });

  it("excludes cancelled bookings (exited via the refund path)", async () => {
    const { client } = makeClient({
      booking: stuckBooking({ status: "cancelled" }),
    });
    const items = await listStuckDepositBookings(client as any);
    expect(items).toHaveLength(0);
  });
});

describe("retryConfirmStuckBooking", () => {
  it("verifies stored money FIRST: no ledger collection → 409, confirm never runs", async () => {
    (globalThis as Record<string, unknown>).__walk6ConfirmCalls = [];
    (globalThis as Record<string, unknown>).__walk6ConflictMode = false;
    const { client } = makeClient({ ledger: [] });
    await expect(
      retryConfirmStuckBooking({
        client: client as any,
        rawBookingId: BOOKING,
        actorUserId: "staff-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(
      (globalThis as Record<string, unknown>).__walk6ConfirmCalls,
    ).toHaveLength(0);
  });

  it("success: confirm half re-runs with the stored money source, 'paid' restored", async () => {
    (globalThis as Record<string, unknown>).__walk6ConfirmCalls = [];
    (globalThis as Record<string, unknown>).__walk6ConflictMode = false;
    const { client, state } = makeClient({});
    const result = await retryConfirmStuckBooking({
      client: client as any,
      rawBookingId: BOOKING,
      actorUserId: "staff-1",
    });
    expect(result).toMatchObject({ ok: true, alreadyRecovered: false, ledgerHeld: 300 });
    const calls = (globalThis as Record<string, unknown>)
      .__walk6ConfirmCalls as Row[];
    expect(calls[0]).toMatchObject({
      bookingId: BOOKING,
      requireBookingDepositPaid: false,
      requireBookingDepositHeldBalanceEvent: {
        sourceType: "rental_booking_payment_attempt",
        sourceId: "attempt-1",
      },
    });
    expect(state.bookingUpdates[0]).toMatchObject({
      booking_deposit_payment_status: "paid",
      booking_deposit_confirm_failed_at: null,
    });
  });

  it("persisting conflict surfaces as 409 — no force-confirm, no paid restore", async () => {
    (globalThis as Record<string, unknown>).__walk6ConflictMode = true;
    const { client, state } = makeClient({});
    await expect(
      retryConfirmStuckBooking({
        client: client as any,
        rawBookingId: BOOKING,
        actorUserId: "staff-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.bookingUpdates).toHaveLength(0);
    (globalThis as Record<string, unknown>).__walk6ConflictMode = false;
  });

  it("idempotent: recovered booking is a no-op success; non-stuck is 409", async () => {
    const recovered = makeClient({
      booking: stuckBooking({
        status: "confirmed",
        booking_deposit_payment_status: "paid",
      }),
    });
    await expect(
      retryConfirmStuckBooking({
        client: recovered.client as any,
        rawBookingId: BOOKING,
        actorUserId: "staff-1",
      }),
    ).resolves.toMatchObject({ alreadyRecovered: true });

    const notStuck = makeClient({
      booking: stuckBooking({ booking_deposit_payment_status: "paid" }),
    });
    await expect(
      retryConfirmStuckBooking({
        client: notStuck.client as any,
        rawBookingId: BOOKING,
        actorUserId: "staff-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("stuck-deposit endpoint source contracts", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  it("list + retry endpoints use requirePlatformAdmin", () => {
    for (const p of [
      "server/api/admin/rental-bookings/stuck-deposits.get.ts",
      "server/api/admin/rental-bookings/[id]/retry-confirm.post.ts",
    ]) {
      const src = read(p);
      expect(src).toContain("requirePlatformAdmin");
      expect(src).not.toContain("requireSuperAdmin");
    }
  });
});
