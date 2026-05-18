import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyMixedCheckoutGatewayResult } from "../../server/utils/mixed-checkout-finalization";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";

vi.mock("~~/server/utils/rental-booking-confirmation", () => ({
  confirmRentalBooking: vi.fn(async () => ({ id: "b1", status: "confirmed" })),
}));

type Row = Record<string, unknown>;
class Chain {
  filters: Array<(r: Row) => boolean> = [];
  action: "select" | "insert" | "update" | "delete" = "select";
  payload: Row = {};
  constructor(
    private db: Record<string, Row[]>,
    private table: string,
  ) {}
  select() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  insert(p: Row) {
    this.action = "insert";
    this.payload = p;
    return this;
  }
  update(p: Row) {
    this.action = "update";
    this.payload = p;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  async maybeSingle() {
    const r = await this.exec();
    return { data: r.data[0] ?? null, error: r.error };
  }
  async single() {
    const r = await this.exec();
    return { data: r.data[0] ?? null, error: r.error };
  }
  then(
    res: (v: {
      data: Row[];
      error: { code?: string; message?: string } | null;
    }) => void,
    rej: (e: unknown) => void,
  ) {
    this.exec().then(res, rej);
  }
  async exec() {
    this.db[this.table] ??= [];
    const rows = this.db[this.table];
    const matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.action === "insert") {
      if (
        this.table === "rental_held_balance_events" &&
        rows.some(
          (r) =>
            r.source_type === this.payload.source_type &&
            r.source_id === this.payload.source_id &&
            r.event_type === this.payload.event_type,
        )
      ) {
        return {
          data: [],
          error: { code: "23505", message: "duplicate" },
        };
      }
      const row = { id: `${this.table}-${rows.length + 1}`, ...this.payload };
      rows.push(row);
      return { data: [row], error: null };
    }
    if (this.action === "update") {
      matched.forEach((r) => Object.assign(r, this.payload));
      return { data: matched, error: null };
    }
    if (this.action === "delete") {
      this.db[this.table] = rows.filter((r) => !matched.includes(r));
      return { data: matched, error: null };
    }
    return { data: matched, error: null };
  }
}
function seed(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    mixed_checkout_sessions: [
      {
        id: "s1",
        user_id: "u1",
        cart_id: "cart-1",
        sale_order_id: "o1",
        status: "payment_created",
        amount_total: 1200,
      },
    ],
    mixed_payment_attempts: [
      {
        id: "a1",
        mixed_checkout_session_id: "s1",
        user_id: "u1",
        method: "promptpay",
        status: "pending",
        amount: 1200,
        currency_code: "THB",
      },
    ],
    mixed_payment_allocations: [
      {
        id: "al-sale",
        mixed_checkout_session_id: "s1",
        mixed_payment_attempt_id: "a1",
        allocation_type: "sale_product",
        order_id: "o1",
        amount: 1000,
        currency_code: "THB",
        status: "payment_pending",
        target_id: "sku-1",
        metadata: {
          productId: "product-1",
          skuId: "sku-1",
          cartLineId: "product-1:sku-1",
        },
      },
      {
        id: "al-book",
        mixed_checkout_session_id: "s1",
        mixed_payment_attempt_id: "a1",
        allocation_type: "booking_deposit",
        rental_booking_id: "b1",
        target_id: "b1",
        amount: 200,
        currency_code: "THB",
        status: "payment_pending",
      },
    ],
    orders: [
      {
        id: "o1",
        user_id: "u1",
        status: "submitted",
        payment_status: "awaiting_payment",
        grand_total: 1000,
        currency_code: "THB",
      },
    ],
    carts: [
      { id: "cart-1", user_id: "u1", updated_at: "2026-01-01T00:00:00.000Z" },
    ],
    cart_items: [
      {
        id: "ci-paid",
        cart_id: "cart-1",
        product_id: "product-1",
        sku_id: "sku-1",
        quantity: 1,
      },
      {
        id: "ci-new",
        cart_id: "cart-1",
        product_id: "product-2",
        sku_id: "sku-2",
        quantity: 1,
      },
    ],
    rental_bookings: [
      {
        id: "b1",
        user_id: "u1",
        status: "draft",
        rental_days: 5,
        rental_total: 500,
        deposit_amount: 3000,
        currency_code: "THB",
        booking_deposit_payment_status: "unpaid",
      },
    ],
    rental_held_balance_events: [],
    payment_alerts: [],
    ...overrides,
  } as Record<string, Row[]>;
}
function client(db: Record<string, Row[]>) {
  const calls: string[] = [];
  return {
    calls,
    from: (t: string) => new Chain(db, t),
    rpc: async (fn: string) => {
      calls.push(fn);
      return { error: null };
    },
  };
}
const paid = {
  gatewayChargeId: "ch1",
  gatewaySourceId: "src1",
  status: "paid" as const,
  authorizeUri: null,
  qrImageUrl: null,
  expiresAt: null,
  failureCode: null,
  failureMessage: null,
  raw: { id: "ch1", amount: 120000, currency: "thb" },
};

describe("mixed checkout finalization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("webhook source identifies mixed payment attempts", () => {
    const webhook = readFileSync("server/api/webhooks/omise.post.ts", "utf8");
    expect(webhook).toContain("mixed_payment_attempts");
    expect(webhook).toContain("applyMixedCheckoutGatewayResult");
  });

  it("finalizes sale allocation, applies inventory once, and confirms rental booking", async () => {
    const db = seed();
    const c = client(db);
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: paid,
    });
    expect(db.orders[0]).toMatchObject({
      payment_status: "paid",
      status: "confirmed",
    });
    expect(c.calls).toEqual(["f_apply_order_inventory"]);
    expect(confirmRentalBooking).toHaveBeenCalledTimes(1);
    expect(confirmRentalBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        requireBookingDepositPaid: true,
        requireBookingDepositHeldBalanceEvent: {
          sourceType: "mixed_payment_allocation",
          sourceId: "al-book",
        },
      }),
    );
    expect(
      db.mixed_payment_allocations.every((a) => a.status === "finalized"),
    ).toBe(true);
    expect(db.rental_held_balance_events).toEqual([
      expect.objectContaining({
        rental_booking_id: "b1",
        event_type: "booking_deposit_collection",
        amount: 200,
        currency_code: "THB",
        status: "posted",
        source_type: "mixed_payment_allocation",
        source_id: "al-book",
      }),
    ]);
    expect(db.cart_items).toEqual([
      expect.objectContaining({
        id: "ci-new",
        product_id: "product-2",
        sku_id: "sku-2",
      }),
    ]);
    expect(db.mixed_checkout_sessions[0].status).toBe("finalized");
  });

  it("finalizes rental-only paid checkout without requiring a sale order", async () => {
    const db = seed({
      mixed_checkout_sessions: [
        {
          id: "s-rental",
          user_id: "u1",
          sale_order_id: null,
          status: "payment_created",
          checkout_kind: "rental_deposit_only",
          amount_total: 200,
        },
      ],
      mixed_payment_attempts: [
        {
          id: "a-rental",
          mixed_checkout_session_id: "s-rental",
          user_id: "u1",
          method: "promptpay",
          status: "pending",
          amount: 200,
          currency_code: "THB",
        },
      ],
      mixed_payment_allocations: [
        {
          id: "al-book",
          mixed_checkout_session_id: "s-rental",
          mixed_payment_attempt_id: "a-rental",
          allocation_type: "booking_deposit",
          rental_booking_id: "b1",
          target_id: "b1",
          amount: 200,
          currency_code: "THB",
          status: "payment_pending",
        },
      ],
      orders: [],
    });
    const c = client(db);
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: {
        ...paid,
        raw: { id: "ch-rental", amount: 20000, currency: "thb" },
      },
    });

    expect(c.calls).toEqual([]);
    expect(confirmRentalBooking).toHaveBeenCalledTimes(1);
    expect(db.rental_bookings[0]).toMatchObject({
      booking_deposit_payment_status: "paid",
      booking_deposit_paid_amount: 200,
      booking_deposit_mixed_allocation_id: "al-book",
    });
    expect(db.rental_held_balance_events).toEqual([
      expect.objectContaining({
        source_type: "mixed_payment_allocation",
        source_id: "al-book",
        amount: 200,
      }),
    ]);
    expect(db.mixed_payment_allocations[0].status).toBe("finalized");
    expect(db.mixed_checkout_sessions[0].status).toBe("finalized");
    expect(db.mixed_payment_attempts[0].status).toBe("finalized");
  });

  it("webhook replay does not double apply inventory or duplicate rental confirmation", async () => {
    const db = seed();
    const c = client(db);
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: paid,
    });
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: paid,
    });
    expect(c.calls).toEqual(["f_apply_order_inventory"]);
    expect(confirmRentalBooking).toHaveBeenCalledTimes(1);
    expect(db.rental_held_balance_events).toHaveLength(1);
    expect(db.cart_items).toHaveLength(1);
    expect(db.cart_items[0].id).toBe("ci-new");
  });

  it("skips sale cart cleanup safely when mixed session has no cart id", async () => {
    const db = seed({
      mixed_checkout_sessions: [
        {
          id: "s1",
          user_id: "u1",
          cart_id: null,
          sale_order_id: "o1",
          status: "payment_created",
          amount_total: 1200,
        },
      ],
    });
    const c = client(db);
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: paid,
    });
    expect(db.orders[0].payment_status).toBe("paid");
    expect(db.cart_items.some((item) => item.id === "ci-paid")).toBe(true);
  });

  it("amount mismatch blocks all finalization and creates alert", async () => {
    const db = seed();
    const c = client(db);
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: { ...paid, raw: { id: "ch1", amount: 119900, currency: "thb" } },
    });
    expect(db.orders[0].payment_status).toBe("awaiting_payment");
    expect(db.rental_bookings[0].status).toBe("draft");
    expect(db.rental_held_balance_events).toHaveLength(0);
    expect(db.mixed_payment_attempts[0].status).toBe("finalization_failed");
    expect(db.payment_alerts[0].kind).toBe("mixed_payment_amount_mismatch");
  });

  it("booking allocation amount mismatch rejects without held-balance event", async () => {
    const db = seed({
      mixed_checkout_sessions: [
        { ...seed().mixed_checkout_sessions[0], amount_total: 1300 },
      ],
      mixed_payment_attempts: [
        { ...seed().mixed_payment_attempts[0], amount: 1300 },
      ],
      mixed_payment_allocations: seed().mixed_payment_allocations.map((row) =>
        row.allocation_type === "booking_deposit"
          ? { ...row, amount: 300 }
          : row,
      ),
    });
    const c = client(db);
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: { ...paid, raw: { id: "ch1", amount: 130000, currency: "thb" } },
    });
    expect(db.rental_held_balance_events).toHaveLength(0);
    expect(
      db.mixed_payment_allocations.find((a) => a.id === "al-book")?.status,
    ).toBe("paid_confirm_failed");
    expect(db.mixed_checkout_sessions[0].status).toBe("partial_finalized");
    expect(
      db.payment_alerts.some((a) => a.kind === "mixed_booking_confirm_failed"),
    ).toBe(true);
  });

  it("held-balance event conflict blocks booking confirmation safely", async () => {
    const db = seed({
      rental_held_balance_events: [
        {
          id: "event-1",
          rental_booking_id: "b1",
          event_type: "booking_deposit_collection",
          amount: 300,
          currency_code: "THB",
          status: "posted",
          source_type: "mixed_payment_allocation",
          source_id: "al-book",
        },
      ],
    });
    const c = client(db);
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: paid,
    });
    expect(confirmRentalBooking).not.toHaveBeenCalled();
    expect(db.rental_held_balance_events).toHaveLength(1);
    expect(db.rental_bookings[0].booking_deposit_payment_status).toBe(
      "paid_confirm_failed",
    );
    expect(
      db.mixed_payment_allocations.find((a) => a.id === "al-book")?.status,
    ).toBe("paid_confirm_failed");
    expect(db.mixed_checkout_sessions[0].status).toBe("partial_finalized");
    expect(
      db.payment_alerts.some((a) => a.kind === "mixed_booking_confirm_failed"),
    ).toBe(true);
  });

  it("rental confirm failure marks booking allocation paid_confirm_failed and session partial", async () => {
    vi.mocked(confirmRentalBooking).mockRejectedValueOnce(
      new Error("conflict"),
    );
    const db = seed();
    const c = client(db);
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: paid,
    });
    expect(
      db.mixed_payment_allocations.find((a) => a.id === "al-book")?.status,
    ).toBe("paid_confirm_failed");
    expect(db.rental_bookings[0].booking_deposit_payment_status).toBe(
      "paid_confirm_failed",
    );
    expect(db.mixed_checkout_sessions[0].status).toBe("partial_finalized");
    expect(
      db.payment_alerts.some((a) => a.kind === "mixed_booking_confirm_failed"),
    ).toBe(true);
  });

  it("sale finalization failure marks sale allocation admin review and session partial", async () => {
    const db = seed({ orders: [] });
    const c = client(db);
    await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: paid,
    });
    expect(
      db.mixed_payment_allocations.find((a) => a.id === "al-sale")?.status,
    ).toBe("admin_review_required");
    expect(db.mixed_checkout_sessions[0].status).toBe("partial_finalized");
    expect(
      db.payment_alerts.some(
        (a) => a.kind === "mixed_sale_finalization_failed",
      ),
    ).toBe(true);
  });

  it("does not finalize a cancelled checkout when a late paid gateway event arrives", async () => {
    const db = seed({
      mixed_checkout_sessions: [
        { ...seed().mixed_checkout_sessions[0], status: "cancelled" },
      ],
      mixed_payment_attempts: [
        { ...seed().mixed_payment_attempts[0], status: "cancelled" },
      ],
      mixed_payment_allocations: seed().mixed_payment_allocations.map(
        (row) => ({
          ...row,
          status: "voided",
        }),
      ),
    });
    const c = client(db);
    const result = await applyMixedCheckoutGatewayResult({
      client: c,
      session: db.mixed_checkout_sessions[0],
      attempt: db.mixed_payment_attempts[0],
      result: paid,
    });

    expect(result).toMatchObject({ cancelled: true, finalized: false });
    expect(db.orders[0].payment_status).toBe("awaiting_payment");
    expect(db.rental_bookings[0].status).toBe("draft");
    expect(db.mixed_checkout_sessions[0].status).toBe("cancelled");
    expect(
      db.mixed_payment_allocations.every((a) => a.status === "voided"),
    ).toBe(true);
    expect(
      db.payment_alerts.some(
        (a) => a.kind === "mixed_payment_paid_after_cancel",
      ),
    ).toBe(true);
    expect(confirmRentalBooking).not.toHaveBeenCalled();
  });
});
