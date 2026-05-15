import { describe, expect, it } from "vitest";
import { deleteDraftRentalBooking } from "../../server/utils/rental-booking-draft-delete";

type Row = Record<string, unknown>;

class Chain {
  private filters: Array<(row: Row) => boolean> = [];
  private action: "select" | "update" | "delete" = "select";
  private payload: Row = {};
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
  update(payload: Row) {
    this.action = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  async maybeSingle() {
    const { data, error } = await this.exec();
    return { data: data[0] ?? null, error };
  }
  then(resolve: (value: { data: Row[]; error: Row | null }) => void) {
    this.exec().then(resolve);
  }
  private async exec() {
    const rows = this.db[this.table] ?? [];
    const matched = rows.filter((row) => this.filters.every((fn) => fn(row)));
    if (this.action === "update") {
      matched.forEach((row) => Object.assign(row, this.payload));
      return { data: matched, error: null };
    }
    if (this.action === "delete") {
      if (this.table === "rental_bookings") {
        const ids = new Set(matched.map((row) => row.id));
        if (
          (this.db.mixed_payment_allocations ?? []).some((row) =>
            ids.has(row.rental_booking_id),
          )
        ) {
          return {
            data: [],
            error: {
              code: "23514",
              message: "mixed_payment_allocations_check",
            },
          };
        }
      }
      this.db[this.table] = rows.filter((row) => !matched.includes(row));
      return { data: matched, error: null };
    }
    return { data: matched, error: null };
  }
}

function client(db: Record<string, Row[]>) {
  return { from: (table: string) => new Chain(db, table) };
}
function booking(overrides: Row = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    status: "draft",
    booking_deposit_payment_status: "unpaid",
    ...overrides,
  };
}
function baseDb(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    rental_bookings: [booking()],
    mixed_payment_allocations: [],
    mixed_checkout_sessions: [],
    mixed_payment_attempts: [],
    ...overrides,
  };
}

describe("deleteDraftRentalBooking", () => {
  it("deletes own draft unpaid booking with no mixed checkout linkage", async () => {
    const db = baseDb();
    const result = await deleteDraftRentalBooking({
      client: client(db),
      bookingId: "booking-1",
      userId: "user-1",
    });
    expect(result).toMatchObject({ ok: true, deletedBookingId: "booking-1" });
    expect(db.rental_bookings).toHaveLength(0);
  });

  it("voids stale mixed linkage before deleting the draft booking", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const db = baseDb({
      mixed_checkout_sessions: [
        {
          id: "session-1",
          user_id: "user-1",
          status: "payment_created",
          expires_at: past,
        },
      ],
      mixed_payment_attempts: [
        {
          id: "attempt-1",
          mixed_checkout_session_id: "session-1",
          status: "requires_action",
          expires_at: past,
        },
      ],
      mixed_payment_allocations: [
        {
          id: "allocation-1",
          mixed_checkout_session_id: "session-1",
          mixed_payment_attempt_id: "attempt-1",
          allocation_type: "booking_deposit",
          rental_booking_id: "booking-1",
          status: "payment_pending",
        },
      ],
    });
    const result = await deleteDraftRentalBooking({
      client: client(db),
      bookingId: "booking-1",
      userId: "user-1",
    });
    expect(result.cleanup).toMatchObject({
      voidedAllocations: 1,
      expiredAttempts: 1,
      expiredSessions: 1,
    });
    expect(db.mixed_payment_allocations).toHaveLength(0);
    expect(db.mixed_payment_attempts[0].status).toBe("expired");
    expect(db.mixed_checkout_sessions[0].status).toBe("expired");
    expect(db.rental_bookings).toHaveLength(0);
  });

  it("allows deleting after QR attempt expiry even when the parent session has not expired", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    const db = baseDb({
      mixed_checkout_sessions: [
        {
          id: "session-1",
          user_id: "user-1",
          status: "payment_created",
          expires_at: future,
        },
      ],
      mixed_payment_attempts: [
        {
          id: "attempt-1",
          mixed_checkout_session_id: "session-1",
          status: "pending",
          expires_at: past,
        },
      ],
      mixed_payment_allocations: [
        {
          id: "allocation-1",
          mixed_checkout_session_id: "session-1",
          mixed_payment_attempt_id: "attempt-1",
          allocation_type: "booking_deposit",
          rental_booking_id: "booking-1",
          status: "payment_pending",
        },
      ],
    });
    const result = await deleteDraftRentalBooking({
      client: client(db),
      bookingId: "booking-1",
      userId: "user-1",
    });
    expect(result.cleanup).toMatchObject({
      voidedAllocations: 1,
      expiredAttempts: 1,
      expiredSessions: 1,
    });
    expect(db.mixed_payment_attempts[0].status).toBe("expired");
    expect(db.mixed_checkout_sessions[0].status).toBe("expired");
    expect(db.rental_bookings).toHaveLength(0);
  });

  it("rejects booking owned by another user", async () => {
    await expect(
      deleteDraftRentalBooking({
        client: client(baseDb()),
        bookingId: "booking-1",
        userId: "user-2",
      }),
    ).rejects.toMatchObject({ statusMessage: "BOOKING_ACCESS_DENIED" });
  });

  it("rejects non-draft bookings", async () => {
    const db = baseDb({ rental_bookings: [booking({ status: "confirmed" })] });
    await expect(
      deleteDraftRentalBooking({
        client: client(db),
        bookingId: "booking-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ statusMessage: "BOOKING_NOT_DRAFT" });
  });

  it("rejects bookings with paid or pending Booking Deposit status", async () => {
    const db = baseDb({
      rental_bookings: [booking({ booking_deposit_payment_status: "paid" })],
    });
    await expect(
      deleteDraftRentalBooking({
        client: client(db),
        bookingId: "booking-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ statusMessage: "BOOKING_DEPOSIT_NOT_UNPAID" });
  });

  it("blocks active non-terminal mixed checkout attempts instead of deleting", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const db = baseDb({
      mixed_checkout_sessions: [
        {
          id: "session-1",
          user_id: "user-1",
          status: "payment_created",
          expires_at: future,
        },
      ],
      mixed_payment_attempts: [
        {
          id: "attempt-1",
          mixed_checkout_session_id: "session-1",
          status: "requires_action",
          expires_at: future,
        },
      ],
      mixed_payment_allocations: [
        {
          id: "allocation-1",
          mixed_checkout_session_id: "session-1",
          mixed_payment_attempt_id: "attempt-1",
          allocation_type: "booking_deposit",
          rental_booking_id: "booking-1",
          status: "payment_pending",
        },
      ],
    });
    await expect(
      deleteDraftRentalBooking({
        client: client(db),
        bookingId: "booking-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      statusMessage: "BOOKING_DELETE_BLOCKED_ACTIVE_CHECKOUT",
    });
    expect(db.rental_bookings).toHaveLength(1);
    expect(db.mixed_payment_allocations).toHaveLength(1);
  });

  it("blocks paid/finalized allocations and avoids raw constraint errors", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const db = baseDb({
      mixed_checkout_sessions: [
        {
          id: "session-1",
          user_id: "user-1",
          status: "expired",
          expires_at: past,
        },
      ],
      mixed_payment_allocations: [
        {
          id: "allocation-1",
          mixed_checkout_session_id: "session-1",
          allocation_type: "booking_deposit",
          rental_booking_id: "booking-1",
          status: "finalized",
        },
      ],
    });
    await expect(
      deleteDraftRentalBooking({
        client: client(db),
        bookingId: "booking-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      statusMessage: "BOOKING_DELETE_BLOCKED_PAID_ALLOCATION",
    });
  });
});
