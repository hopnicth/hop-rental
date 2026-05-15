import { describe, expect, it } from "vitest";
import { getCartCheckoutState } from "../../server/utils/cart-checkout-state";

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
    return {
      data: (this.db[this.table] ?? []).filter((row) =>
        this.filters.every((fn) => fn(row)),
      ),
      error: null,
    };
  }
}

function client(db: Record<string, Row[]>) {
  return { from: (table: string) => new Chain(db, table) };
}

function base(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    mixed_checkout_sessions: [],
    mixed_payment_attempts: [],
    mixed_payment_allocations: [],
    ...overrides,
  } as Record<string, Row[]>;
}

async function state(database: Record<string, Row[]>) {
  return getCartCheckoutState({
    client: client(database),
    userId: "user-1",
    cartId: "cart-1",
    saleCartLineIds: ["product-1:sku-1"],
    bookingIds: ["booking-1"],
  });
}

function mixedRows(status: string, attemptStatus: string, expiresAt: string) {
  return base({
    mixed_checkout_sessions: [
      {
        id: "session-1",
        user_id: "user-1",
        cart_id: "cart-1",
        status,
        checkout_kind: "mixed",
        expires_at: expiresAt,
      },
    ],
    mixed_payment_attempts: [
      {
        id: "attempt-1",
        mixed_checkout_session_id: "session-1",
        status: attemptStatus,
        method: "promptpay",
        expires_at: expiresAt,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    mixed_payment_allocations: [
      {
        id: "sale-alloc",
        mixed_checkout_session_id: "session-1",
        mixed_payment_attempt_id: "attempt-1",
        allocation_type: "sale_product",
        status: "payment_pending",
        metadata: { cartLineId: "product-1:sku-1" },
      },
      {
        id: "ship-alloc",
        mixed_checkout_session_id: "session-1",
        mixed_payment_attempt_id: "attempt-1",
        allocation_type: "shipping",
        status: "payment_pending",
        metadata: {},
      },
      {
        id: "booking-alloc",
        mixed_checkout_session_id: "session-1",
        mixed_payment_attempt_id: "attempt-1",
        allocation_type: "booking_deposit",
        rental_booking_id: "booking-1",
        target_id: "booking-1",
        status: "payment_pending",
        metadata: { cartLineId: "booking-1" },
      },
    ],
  });
}

describe("cart checkout state", () => {
  it("returns none when no relevant checkout session exists", async () => {
    expect(await state(base())).toMatchObject({
      state: "none",
      sessionId: null,
      saleItemCartLineIds: [],
      bookingIds: [],
    });
  });

  it("returns active_unpaid with session, method, expiry, sale line ids, booking ids, and shipping", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = await state(
      mixedRows("payment_created", "requires_action", future),
    );
    expect(result).toMatchObject({
      state: "active_unpaid",
      sessionId: "session-1",
      checkoutKind: "mixed",
      sessionStatus: "payment_created",
      attemptId: "attempt-1",
      attemptStatus: "requires_action",
      method: "promptpay",
      expiresAt: future,
      saleItemCartLineIds: ["product-1:sku-1"],
      bookingIds: ["booking-1"],
      shippingIncluded: true,
    });
  });

  it("returns expired for expired session or attempt timestamps", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(
      (await state(mixedRows("payment_created", "requires_action", past)))
        .state,
    ).toBe("expired");
  });

  it("returns paid_or_finalized for finalized sessions", async () => {
    const result = await state(
      mixedRows(
        "finalized",
        "finalized",
        new Date(Date.now() - 1).toISOString(),
      ),
    );
    expect(result.state).toBe("paid_or_finalized");
  });

  it("returns blocked_review for mixed review/failure statuses", async () => {
    const result = await state(
      mixedRows(
        "partial_finalized",
        "finalized",
        new Date(Date.now() + 60_000).toISOString(),
      ),
    );
    expect(result.state).toBe("blocked_review");
  });

  it("ignores another user's sessions", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const database = mixedRows("payment_created", "requires_action", future);
    database.mixed_checkout_sessions[0]!.user_id = "user-2";
    expect((await state(database)).state).toBe("none");
  });

  it("prioritizes an active session over historical expired sessions", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    const database = mixedRows("expired", "expired", past);
    database.mixed_checkout_sessions.push({
      id: "session-2",
      user_id: "user-1",
      cart_id: "cart-1",
      status: "payment_created",
      checkout_kind: "mixed",
      expires_at: future,
    });
    database.mixed_payment_attempts.push({
      id: "attempt-2",
      mixed_checkout_session_id: "session-2",
      status: "requires_action",
      method: "credit_card",
      expires_at: future,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    database.mixed_payment_allocations.push({
      id: "alloc-2",
      mixed_checkout_session_id: "session-2",
      mixed_payment_attempt_id: "attempt-2",
      allocation_type: "sale_product",
      status: "payment_pending",
      metadata: { cartLineId: "product-1:sku-1" },
    });
    const result = await state(database);
    expect(result).toMatchObject({
      state: "active_unpaid",
      sessionId: "session-2",
      method: "credit_card",
    });
  });

  it("returns the latest expired session when no active session is relevant", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const database = mixedRows("expired", "expired", past);
    database.mixed_checkout_sessions[0]!.created_at =
      "2026-01-01T00:00:00.000Z";
    database.mixed_checkout_sessions.push({
      id: "session-2",
      user_id: "user-1",
      cart_id: "cart-1",
      status: "expired",
      checkout_kind: "mixed",
      expires_at: past,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    database.mixed_payment_attempts.push({
      id: "attempt-2",
      mixed_checkout_session_id: "session-2",
      status: "expired",
      method: "credit_card",
      expires_at: past,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    database.mixed_payment_allocations.push({
      id: "alloc-2",
      mixed_checkout_session_id: "session-2",
      mixed_payment_attempt_id: "attempt-2",
      allocation_type: "sale_product",
      status: "voided",
      metadata: { cartLineId: "product-1:sku-1" },
    });
    const result = await state(database);
    expect(result).toMatchObject({
      state: "expired",
      sessionId: "session-2",
      method: "credit_card",
    });
  });

  it("ignores explicitly cancelled sessions so cart controls unlock", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const database = mixedRows("cancelled", "cancelled", future);
    database.mixed_payment_allocations.forEach((row) => {
      row.status = "voided";
    });

    expect(await state(database)).toMatchObject({
      state: "none",
      sessionId: null,
      saleItemCartLineIds: [],
      bookingIds: [],
    });
  });
});
