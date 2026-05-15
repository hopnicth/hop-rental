import { beforeEach, describe, expect, it, vi } from "vitest";
import { createError } from "h3";

vi.mock("~~/server/utils/rental-booking-confirmation", () => ({
  validateRentalBookingForConfirmation: vi.fn(async () => undefined),
  confirmRentalBooking: vi.fn(async () => ({
    id: "booking-1",
    status: "confirmed",
  })),
}));

import { validateRentalBookingForConfirmation } from "../../server/utils/rental-booking-confirmation";
import {
  createMixedCheckout,
  expireMixedCheckoutIfNeeded,
  getMixedCheckoutUserId,
  prevalidateMixedCheckout,
} from "../../server/utils/mixed-checkout";
import { cancelMixedCheckoutSession } from "../../server/utils/mixed-checkout-cancellation";

type Row = Record<string, unknown>;

class Chain {
  private filters: Array<(row: Row) => boolean> = [];
  private action: "select" | "insert" | "update" | "delete" = "select";
  private payload: unknown;
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
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  insert(payload: unknown) {
    this.action = "insert";
    this.payload = payload;
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
    return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
  }
  async single() {
    const { data, error } = await this.exec();
    return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
  }
  then(
    resolve: (value: { data: Row[] | null; error: null }) => void,
    reject: (reason?: unknown) => void,
  ) {
    this.exec().then(resolve, reject);
  }
  private async exec(): Promise<{ data: Row[]; error: null }> {
    this.db[this.table] ??= [];
    const rows = this.db[this.table];
    if (this.action === "insert") {
      const inserted = (
        Array.isArray(this.payload) ? this.payload : [this.payload]
      ).map((row, index) => ({
        id: `${this.table}-${rows.length + index + 1}`,
        ...(row as Row),
      }));
      rows.push(...inserted);
      return { data: inserted, error: null };
    }
    const matched = rows.filter((row) => this.filters.every((fn) => fn(row)));
    if (this.action === "update") {
      matched.forEach((row) => Object.assign(row, this.payload));
      return { data: matched, error: null };
    }
    if (this.action === "delete") {
      this.db[this.table] = rows.filter((row) => !matched.includes(row));
      return { data: matched, error: null };
    }
    return { data: matched, error: null };
  }
}

function booking(overrides: Row = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    status: "draft",
    asset_id: "asset-1",
    sku_id: null,
    start_date: "2026-06-01",
    end_date: "2026-06-06",
    rental_days: 5,
    hub_id: "hub-1",
    daily_rate: 100,
    weekly_rate: 0,
    monthly_rate: 0,
    rental_total: 500,
    deposit_amount: 3000,
    currency_code: "THB",
    booking_deposit_payment_status: "unpaid",
    booking_deposit_paid_amount: 0,
    pricing_breakdown: {},
    ...overrides,
  };
}

function db(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    carts: [{ id: "cart-1", user_id: "user-1" }],
    product_skus: [
      {
        id: "sku-1",
        product_id: "product-1",
        label_th: "Lens",
        price: 1000,
        original_price: 1200,
        currency_code: "THB",
        stock: 5,
        products: { name_th: "Lens", is_hidden: false, shipping_size: "free" },
      },
    ],
    addresses: [{ id: "addr-1", user_id: "user-1", company_id: null }],
    store_branches: [{ id: "hub-1", is_active: true }],
    rental_bookings: [booking()],
    mixed_checkout_sessions: [],
    mixed_payment_allocations: [],
    mixed_payment_attempts: [],
    orders: [],
    order_items: [],
    ...overrides,
  } as Record<string, Row[]>;
}
function client(database: Record<string, Row[]>) {
  return { from: (table: string) => new Chain(database, table) };
}
const body = {
  idempotencyKey: "idem-1",
  method: "promptpay",
  shippingMode: "pickup",
  pickupBranchId: "hub-1",
  saleItems: [
    {
      skuId: "sku-1",
      quantity: 1,
      expectedUnitPrice: 1000,
      cartLineId: "cart-line-1",
    },
  ],
  rentalBookings: [
    {
      bookingId: "booking-1",
      expectedBookingDepositAmount: 200,
      cartLineId: "booking-line-1",
    },
  ],
};
const rentalOnlyBody = {
  idempotencyKey: "idem-rental-only",
  method: "promptpay",
  shippingMode: "pickup",
  pickupBranchId: "hub-1",
  saleItems: [],
  rentalBookings: [
    {
      bookingId: "booking-1",
      expectedBookingDepositAmount: 200,
      cartLineId: "booking-line-1",
    },
  ],
};
const event = { node: { req: { headers: { host: "localhost" } } } } as never;

function pendingCharge() {
  return {
    status: "pending",
    gatewayChargeId: "ch_1",
    gatewaySourceId: "src_1",
    authorizeUri: null,
    qrImageUrl: "qr",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    raw: {},
  };
}

function paidCharge() {
  return {
    status: "paid" as const,
    gatewayChargeId: "ch_paid",
    gatewaySourceId: "src_paid",
    authorizeUri: null,
    qrImageUrl: null,
    expiresAt: null,
    failureCode: null,
    failureMessage: null,
    raw: { id: "ch_paid", amount: 120000, currency: "thb", successful: true },
  };
}

describe("mixed checkout backend foundation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exports mixed checkout user id helper with id/sub fallback", () => {
    expect(getMixedCheckoutUserId({ id: "user-1", sub: "sub-1" })).toBe(
      "user-1",
    );
    expect(getMixedCheckoutUserId({ id: "", sub: "sub-1" })).toBe("sub-1");
    expect(getMixedCheckoutUserId(null)).toBeNull();
  });

  it("valid mixed cart returns allocation preview", async () => {
    const result = await prevalidateMixedCheckout({
      client: client(db()) as never,
      userId: "user-1",
      body,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checkoutKind).toBe("mixed");
    expect(result.allocations.map((a) => a.allocationType)).toEqual([
      "sale_product",
      "booking_deposit",
    ]);
  });

  it("valid rental-only cart returns rental_deposit_only allocation preview", async () => {
    const result = await prevalidateMixedCheckout({
      client: client(db()) as never,
      userId: "user-1",
      body: rentalOnlyBody,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checkoutKind).toBe("rental_deposit_only");
    expect(result.saleLines).toHaveLength(0);
    expect(result.shippingAmount).toBe(0);
    expect(result.allocations.map((a) => a.allocationType)).toEqual([
      "booking_deposit",
    ]);
  });

  it("creates rental-only PromptPay checkout with booking allocations and no sale order", async () => {
    const database = db({
      rental_bookings: [booking(), booking({ id: "booking-2" })],
    });
    const createCharge = vi.fn(async ({ attempt }) => ({
      ...pendingCharge(),
      expiresAt: attempt.expires_at as string,
    }));
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body: {
        ...rentalOnlyBody,
        rentalBookings: [
          ...rentalOnlyBody.rentalBookings,
          {
            bookingId: "booking-2",
            expectedBookingDepositAmount: 200,
            cartLineId: "booking-line-2",
          },
        ],
      },
      createCharge,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(database.orders).toHaveLength(0);
    expect(database.mixed_checkout_sessions[0]).toMatchObject({
      checkout_kind: "rental_deposit_only",
      sale_subtotal_amount: 0,
      shipping_amount: 0,
      booking_deposit_total_amount: 400,
      amount_total: 400,
    });
    expect(database.mixed_checkout_sessions[0].sale_order_id).toBeUndefined();
    expect(database.mixed_payment_allocations).toHaveLength(2);
    expect(
      database.mixed_payment_allocations.every(
        (allocation) => allocation.allocation_type === "booking_deposit",
      ),
    ).toBe(true);
    expect(database.mixed_payment_attempts[0]).toMatchObject({
      method: "promptpay",
      amount: 400,
      status: "pending",
    });
    expect(createCharge).toHaveBeenCalledOnce();
  });

  it("creates rental-only credit-card checkout without cardToken and does not charge immediately", async () => {
    const database = db();
    const createCharge = vi.fn(async () => pendingCharge());
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body: {
        ...rentalOnlyBody,
        method: "credit_card",
        idempotencyKey: "idem-rental-only-card-create-no-token",
      },
      createCharge,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(createCharge).not.toHaveBeenCalled();
    expect(database.orders).toHaveLength(0);
    expect(database.mixed_checkout_sessions[0]).toMatchObject({
      checkout_kind: "rental_deposit_only",
      status: "payment_created",
    });
    expect(database.mixed_checkout_sessions[0].sale_order_id).toBeUndefined();
    expect(database.mixed_payment_allocations).toHaveLength(1);
    expect(database.mixed_payment_allocations[0]).toMatchObject({
      allocation_type: "booking_deposit",
      order_id: null,
      rental_booking_id: "booking-1",
    });
    expect(result.attempt).toMatchObject({
      method: "credit_card",
      status: "created",
      redirectUrl: null,
      qrImageUrl: null,
    });
  });

  it("expires checkout state when the latest QR attempt expired before the session", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    const database = db({
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
          created_at: past,
        },
      ],
      mixed_payment_allocations: [
        {
          id: "allocation-1",
          mixed_checkout_session_id: "session-1",
          status: "payment_pending",
        },
      ],
    });

    const normalized = await expireMixedCheckoutIfNeeded(
      client(database) as never,
      database.mixed_checkout_sessions[0],
    );

    expect(normalized.status).toBe("expired");
    expect(database.mixed_checkout_sessions[0].status).toBe("expired");
    expect(database.mixed_payment_attempts[0].status).toBe("expired");
    expect(database.mixed_payment_allocations[0].status).toBe("voided");
  });

  it("sale stock fail blocks QR/session creation", async () => {
    const database = db({
      product_skus: [{ ...db().product_skus[0], stock: 0 }],
    });
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body,
      createCharge: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].errorCode).toBe("INSUFFICIENT_STOCK");
    expect(database.mixed_checkout_sessions).toHaveLength(0);
  });

  it("sale price changed blocks QR/session creation", async () => {
    const result = await createMixedCheckout({
      client: client(
        db({ product_skus: [{ ...db().product_skus[0], price: 1100 }] }),
      ) as never,
      event,
      userId: "user-1",
      body,
      createCharge: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].errorCode).toBe("PRICE_CHANGED");
  });

  it("rental availability fail blocks QR/session creation", async () => {
    vi.mocked(validateRentalBookingForConfirmation).mockRejectedValueOnce(
      createError({
        statusCode: 409,
        statusMessage: "RENTAL_BOOKING_CONFLICT",
      }),
    );
    const result = await createMixedCheckout({
      client: client(db()) as never,
      event,
      userId: "user-1",
      body,
      createCharge: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors[0].errorCode).toBe("RENTAL_AVAILABILITY_CONFLICT");
  });

  it("booking deposit already paid blocks QR/session creation", async () => {
    const result = await createMixedCheckout({
      client: client(
        db({
          rental_bookings: [
            booking({
              booking_deposit_payment_status: "paid",
              booking_deposit_paid_amount: 500,
            }),
          ],
        }),
      ) as never,
      event,
      userId: "user-1",
      body,
      createCharge: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors[0].errorCode).toBe("BOOKING_DEPOSIT_ALREADY_PAID");
  });

  it("pickup hub missing blocks QR/session creation", async () => {
    const result = await createMixedCheckout({
      client: client(
        db({ rental_bookings: [booking({ hub_id: null })] }),
      ) as never,
      event,
      userId: "user-1",
      body,
      createCharge: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors[0].errorCode).toBe("PICKUP_HUB_REQUIRED");
  });

  it("Booking Deposit allocation keeps WHT 0 and security-deposit category", async () => {
    const result = await prevalidateMixedCheckout({
      client: client(db()) as never,
      userId: "user-1",
      body,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const allocation = result.allocations.find(
      (a) => a.allocationType === "booking_deposit",
    );
    expect(allocation).toMatchObject({
      whtRate: 0,
      whtAmount: 0,
      taxCategory: "partial_refundable_security_deposit",
      targetType: "rental_booking",
    });
  });

  it("allocation total equals attempt amount", async () => {
    const database = db();
    const createCharge = vi.fn(async ({ attempt }) => ({
      status: "pending",
      gatewayChargeId: "ch_1",
      gatewaySourceId: "src_1",
      authorizeUri: null,
      qrImageUrl: "qr",
      expiresAt: attempt.expires_at as string,
      raw: {},
    }));
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body,
      createCharge,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(createCharge).toHaveBeenCalledOnce();
    expect(database.mixed_payment_attempts[0].status).toBe("pending");
    expect(database.mixed_payment_attempts[0].gateway_charge_id).toBe("ch_1");
    const total = database.mixed_payment_allocations.reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    );
    expect(total).toBe(Number(database.mixed_payment_attempts[0].amount));
  });

  it("creates credit-card mixed checkout without cardToken and does not charge immediately", async () => {
    const database = db();
    const createCharge = vi.fn(async () => pendingCharge());
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body: {
        ...body,
        method: "credit_card",
        idempotencyKey: "idem-card-create-no-token",
      },
      createCharge,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(createCharge).not.toHaveBeenCalled();
    expect(database.mixed_checkout_sessions).toHaveLength(1);
    expect(database.mixed_checkout_sessions[0].status).toBe("payment_created");
    expect(database.mixed_payment_attempts).toHaveLength(1);
    expect(database.mixed_payment_attempts[0]).toMatchObject({
      method: "credit_card",
      status: "created",
    });
    expect(
      database.mixed_payment_attempts[0].gateway_charge_id,
    ).toBeUndefined();
    expect(result.attempt).toMatchObject({
      method: "credit_card",
      status: "created",
      redirectUrl: null,
      qrImageUrl: null,
    });
  });

  it("finalizes an immediate-paid mixed credit-card charge and keeps the DB cart id for cleanup", async () => {
    const database = db({
      cart_items: [
        {
          id: "ci-paid",
          cart_id: "cart-1",
          product_id: "product-1",
          sku_id: "sku-1",
        },
      ],
      payment_alerts: [],
    });
    const c = {
      ...client(database),
      rpc: vi.fn(async () => ({ error: null })),
    };

    const result = await createMixedCheckout({
      client: c as never,
      event,
      userId: "user-1",
      body: {
        ...body,
        method: "credit_card",
        cardToken: "tokn_test",
        cartId: "stale-browser-cart-id",
        idempotencyKey: "idem-card-paid",
      },
      createCharge: async () => paidCharge(),
    });

    expect(result.ok).toBe(true);
    expect(database.mixed_checkout_sessions[0]).toMatchObject({
      cart_id: "cart-1",
      status: "finalized",
    });
    expect(database.mixed_payment_attempts[0].status).toBe("finalized");
    expect(database.orders[0]).toMatchObject({
      payment_status: "paid",
      status: "confirmed",
    });
    expect(database.rental_bookings[0]).toMatchObject({
      booking_deposit_payment_status: "paid",
      booking_deposit_mixed_allocation_id: "mixed_payment_allocations-2",
    });
    expect(database.cart_items).toEqual([]);
    expect(c.rpc).toHaveBeenCalledWith("f_apply_order_inventory", {
      p_order_id: "orders-1",
    });
  });

  it("persists verified current-user cartId on mixed checkout session and order", async () => {
    const database = db();
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body: { ...body, cartId: "cart-1", idempotencyKey: "idem-cart-valid" },
      createCharge: async () => pendingCharge(),
    });

    expect(result.ok).toBe(true);
    expect(database.mixed_checkout_sessions[0].cart_id).toBe("cart-1");
    expect(database.orders[0].cart_id).toBe("cart-1");
  });

  it("persists pickup shipping mode and branch on mixed sale order creation", async () => {
    const database = db();
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body: { ...body, idempotencyKey: "idem-pickup-shipping-mode" },
      createCharge: async () => pendingCharge(),
    });

    expect(result.ok).toBe(true);
    expect(database.orders[0]).toMatchObject({
      shipping_mode: "pickup",
      pickup_branch_id: "hub-1",
      address_id: null,
    });
  });

  it("persists delivery shipping mode on mixed sale order creation", async () => {
    const database = db();
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body: {
        ...body,
        idempotencyKey: "idem-delivery-shipping-mode",
        shippingMode: "delivery",
        pickupBranchId: null,
        address: { id: "addr-1", title: "Home", fullAddress: "Bangkok" },
      },
      createCharge: async () => pendingCharge(),
    });

    expect(result.ok).toBe(true);
    expect(database.orders[0]).toMatchObject({
      shipping_mode: "delivery",
      pickup_branch_id: null,
      address_id: "addr-1",
    });
  });

  it("falls back to the current user's DB cart when the browser cart id is stale", async () => {
    const database = db();
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body: {
        ...body,
        cartId: "stale-local-cart",
        idempotencyKey: "idem-cart-stale",
      },
      createCharge: async () => pendingCharge(),
    });

    expect(result.ok).toBe(true);
    expect(database.mixed_checkout_sessions[0].cart_id).toBe("cart-1");
    expect(database.orders[0].cart_id).toBe("cart-1");
  });

  it("does not blindly accept cartId owned by another user", async () => {
    const database = db({
      carts: [{ id: "other-user-cart", user_id: "user-2" }],
    });
    const result = await createMixedCheckout({
      client: client(database) as never,
      event,
      userId: "user-1",
      body: {
        ...body,
        cartId: "other-user-cart",
        idempotencyKey: "idem-cart-other-user",
      },
      createCharge: async () => pendingCharge(),
    });

    expect(result.ok).toBe(true);
    expect(database.mixed_checkout_sessions[0].cart_id).toBeNull();
    expect(database.orders[0].cart_id).toBeNull();
  });

  it("cancels an active unpaid mixed checkout without deleting cart items", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const database = db({
      mixed_checkout_sessions: [
        {
          id: "session-1",
          user_id: "user-1",
          cart_id: "cart-1",
          sale_order_id: "order-1",
          status: "payment_created",
          checkout_kind: "mixed",
          expires_at: future,
        },
      ],
      mixed_payment_attempts: [
        {
          id: "attempt-1",
          mixed_checkout_session_id: "session-1",
          status: "pending",
        },
      ],
      mixed_payment_allocations: [
        {
          id: "sale-1",
          mixed_checkout_session_id: "session-1",
          status: "payment_pending",
        },
        {
          id: "booking-1",
          mixed_checkout_session_id: "session-1",
          status: "planned",
        },
      ],
      orders: [
        {
          id: "order-1",
          status: "submitted",
          payment_status: "awaiting_payment",
          fulfillment_status: "unfulfilled",
        },
      ],
      cart_items: [{ id: "cart-item-1", cart_id: "cart-1" }],
    });

    const result = await cancelMixedCheckoutSession({
      client: client(database) as never,
      session: database.mixed_checkout_sessions[0],
    });

    expect(result).toMatchObject({ ok: true, status: "cancelled" });
    expect(database.mixed_checkout_sessions[0].status).toBe("cancelled");
    expect(database.mixed_payment_attempts[0].status).toBe("cancelled");
    expect(database.mixed_payment_allocations.map((row) => row.status)).toEqual(
      ["voided", "voided"],
    );
    expect(database.orders[0]).toMatchObject({
      status: "cancelled",
      payment_status: "cancelled",
      fulfillment_status: "cancelled",
    });
    expect(database.cart_items).toHaveLength(1);
  });

  it("cancels an active unpaid rental-only checkout without a sale order", async () => {
    const database = db({
      mixed_checkout_sessions: [
        {
          id: "session-rental",
          user_id: "user-1",
          status: "payment_created",
          checkout_kind: "rental_deposit_only",
        },
      ],
      mixed_payment_attempts: [
        {
          id: "attempt-rental",
          mixed_checkout_session_id: "session-rental",
          status: "created",
        },
      ],
      mixed_payment_allocations: [
        {
          id: "booking-alloc",
          mixed_checkout_session_id: "session-rental",
          status: "payment_pending",
        },
      ],
      orders: [],
    });

    await cancelMixedCheckoutSession({
      client: client(database) as never,
      session: database.mixed_checkout_sessions[0],
    });

    expect(database.mixed_checkout_sessions[0].status).toBe("cancelled");
    expect(database.mixed_payment_attempts[0].status).toBe("cancelled");
    expect(database.mixed_payment_allocations[0].status).toBe("voided");
    expect(database.orders).toHaveLength(0);
  });

  it("rejects cancellation once a checkout is paid or finalized", async () => {
    const database = db({
      mixed_checkout_sessions: [
        { id: "session-paid", user_id: "user-1", status: "finalized" },
      ],
    });

    await expect(
      cancelMixedCheckoutSession({
        client: client(database) as never,
        session: database.mixed_checkout_sessions[0],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("treats a second cancel request for an already-cancelled session as idempotent", async () => {
    const result = await cancelMixedCheckoutSession({
      client: client(db()) as never,
      session: { id: "session-cancelled", status: "cancelled" },
    });

    expect(result).toMatchObject({
      ok: true,
      status: "cancelled",
      alreadyCancelled: true,
    });
  });
});
