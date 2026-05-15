import { describe, expect, it } from "vitest";
import { getDraftRentalBookingCheckoutStates } from "../../server/utils/rental-booking-checkout-state";

type Row = Record<string, unknown>;

class Chain {
  private filters: Array<(row: Row) => boolean> = [];
  constructor(
    private db: Record<string, Row[]>,
    private table: string,
  ) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  then(resolve: (value: { data: Row[]; error: null }) => void) {
    this.exec().then(resolve);
  }
  private async exec() {
    const rows = this.db[this.table] ?? [];
    return {
      data: rows.filter((row) => this.filters.every((fn) => fn(row))),
      error: null,
    };
  }
}
function client(db: Record<string, Row[]>) {
  return { from: (table: string) => new Chain(db, table) };
}
function booking(overrides: Row = {}) {
  return { id: "booking-1", user_id: "user-1", status: "draft", ...overrides };
}
function db(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    rental_bookings: [booking()],
    mixed_payment_allocations: [],
    mixed_checkout_sessions: [],
    mixed_payment_attempts: [],
    ...overrides,
  } as Record<string, Row[]>;
}
async function states(
  database: Record<string, Row[]>,
  bookingIds = ["booking-1", "booking-2"],
) {
  return getDraftRentalBookingCheckoutStates({
    client: client(database),
    userId: "user-1",
    bookingIds,
  });
}

describe("draft rental booking checkout state", () => {
  it("returns none for an owned draft booking with no allocation", async () => {
    const result = await states(db());
    expect(result.states["booking-1"]).toMatchObject({
      state: "none",
      sessionId: null,
    });
  });

  it("returns active_unpaid with useful session and attempt fields", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = await states(
      db({
        mixed_checkout_sessions: [
          { id: "session-1", status: "payment_created", expires_at: future },
        ],
        mixed_payment_attempts: [
          {
            id: "attempt-1",
            mixed_checkout_session_id: "session-1",
            status: "requires_action",
            method: "promptpay",
            expires_at: future,
          },
        ],
        mixed_payment_allocations: [
          {
            id: "alloc-1",
            rental_booking_id: "booking-1",
            mixed_checkout_session_id: "session-1",
            mixed_payment_attempt_id: "attempt-1",
            status: "payment_pending",
          },
        ],
      }),
    );
    expect(result.states["booking-1"]).toMatchObject({
      state: "active_unpaid",
      sessionId: "session-1",
      sessionStatus: "payment_created",
      attemptId: "attempt-1",
      attemptStatus: "requires_action",
      method: "promptpay",
      expiresAt: future,
      allocationStatus: "payment_pending",
    });
  });

  it("returns expired for expired attempt or session linkage", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const result = await states(
      db({
        mixed_checkout_sessions: [
          { id: "session-1", status: "payment_created", expires_at: past },
        ],
        mixed_payment_attempts: [
          {
            id: "attempt-1",
            mixed_checkout_session_id: "session-1",
            status: "requires_action",
            method: "promptpay",
            expires_at: past,
          },
        ],
        mixed_payment_allocations: [
          {
            id: "alloc-1",
            rental_booking_id: "booking-1",
            mixed_checkout_session_id: "session-1",
            mixed_payment_attempt_id: "attempt-1",
            status: "payment_pending",
          },
        ],
      }),
    );
    expect(result.states["booking-1"].state).toBe("expired");
  });

  it("returns paid_or_finalized for paid or finalized linkage", async () => {
    const result = await states(
      db({
        mixed_checkout_sessions: [
          {
            id: "session-1",
            status: "finalized",
            expires_at: new Date(Date.now() - 1).toISOString(),
          },
        ],
        mixed_payment_attempts: [
          {
            id: "attempt-1",
            mixed_checkout_session_id: "session-1",
            status: "finalized",
            method: "credit_card",
          },
        ],
        mixed_payment_allocations: [
          {
            id: "alloc-1",
            rental_booking_id: "booking-1",
            mixed_checkout_session_id: "session-1",
            mixed_payment_attempt_id: "attempt-1",
            status: "finalized",
          },
        ],
      }),
    );
    expect(result.states["booking-1"]).toMatchObject({
      state: "paid_or_finalized",
      method: "credit_card",
    });
  });

  it("returns blocked_review for admin-review/finalization failure states", async () => {
    const result = await states(
      db({
        mixed_checkout_sessions: [
          { id: "session-1", status: "partial_finalized" },
        ],
        mixed_payment_allocations: [
          {
            id: "alloc-1",
            rental_booking_id: "booking-1",
            mixed_checkout_session_id: "session-1",
            status: "admin_review_required",
          },
        ],
      }),
    );
    expect(result.states["booking-1"].state).toBe("blocked_review");
  });

  it("ignores explicitly cancelled mixed checkout sessions", async () => {
    const result = await states(
      db({
        mixed_checkout_sessions: [{ id: "session-1", status: "cancelled" }],
        mixed_payment_attempts: [
          {
            id: "attempt-1",
            mixed_checkout_session_id: "session-1",
            status: "cancelled",
            method: "promptpay",
          },
        ],
        mixed_payment_allocations: [
          {
            id: "alloc-1",
            rental_booking_id: "booking-1",
            mixed_checkout_session_id: "session-1",
            mixed_payment_attempt_id: "attempt-1",
            status: "voided",
          },
        ],
      }),
    );
    expect(result.states["booking-1"]).toMatchObject({
      state: "none",
      sessionId: null,
    });
  });

  it("only returns current-user draft bookings", async () => {
    const result = await states(
      db({
        rental_bookings: [
          booking(),
          booking({ id: "booking-2", user_id: "user-2" }),
          booking({ id: "booking-3", status: "confirmed" }),
        ],
      }),
      ["booking-1", "booking-2", "booking-3"],
    );
    expect(Object.keys(result.states)).toEqual(["booking-1"]);
    expect(result.states["booking-1"].state).toBe("none");
  });
});
