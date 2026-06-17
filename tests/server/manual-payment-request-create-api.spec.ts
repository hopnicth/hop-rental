/**
 * Tests: server/utils/manual-payment-request.ts — createManualPaymentRequestFromTargets
 *
 * Covers (mock DB client at the util boundary):
 *  1. sale_only — one sale_order item, source_type sale_only, total = order total
 *  2. booking_only — one rental_booking_deposit item (Booking Deposit), not confirmed
 *  3. mixed — sale_order + booking deposit items, total = sum of allocations
 *  4. ownership guard (403) on order / booking owned by another customer
 *  5. eligibility guards (422) — order not awaiting_payment, booking not draft
 *  6. no targets (400)
 *  7. reuse — an active request covering the same target set is returned, no new insert
 *  8. EVIDENCE ONLY — never updates orders/rental_bookings (no paid/confirm)
 */
import { describe, it, expect } from "vitest";
import { createManualPaymentRequestFromTargets } from "../../server/utils/manual-payment-request";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const ORDER = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";

interface Store {
  orders: Record<string, unknown>[];
  rental_bookings: Record<string, unknown>[];
  manual_payment_requests: Record<string, unknown>[];
  manual_payment_request_items: Record<string, unknown>[];
}

function makeClient(seed: Partial<Store> = {}) {
  const store: Store = {
    orders: seed.orders ?? [],
    rental_bookings: seed.rental_bookings ?? [],
    manual_payment_requests: seed.manual_payment_requests ?? [],
    manual_payment_request_items: seed.manual_payment_request_items ?? [],
  };
  const inserted = {
    requests: [] as Record<string, unknown>[],
    items: [] as Record<string, unknown>[],
  };
  const updates: { table: string }[] = [];
  let idCounter = 1;

  function builder(table: string) {
    const filters: [string, unknown, "eq" | "in"][] = [];
    let insertPayload: Record<string, unknown> | null = null;

    function rows(): Record<string, unknown>[] {
      let data = (store as Record<string, Record<string, unknown>[]>)[table] ?? [];
      for (const [col, val, kind] of filters) {
        data =
          kind === "in"
            ? data.filter((r) => (val as unknown[]).includes(r[col]))
            : data.filter((r) => r[col] === val);
      }
      return data;
    }

    const api: Record<string, unknown> = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val, "eq"]);
        return api;
      },
      in(col: string, vals: unknown[]) {
        filters.push([col, vals, "in"]);
        return api;
      },
      order() {
        return api;
      },
      update() {
        updates.push({ table });
        return api;
      },
      insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
        if (Array.isArray(payload)) {
          for (const p of payload) {
            store.manual_payment_request_items.push(p);
            inserted.items.push(p);
          }
        } else {
          insertPayload = payload;
        }
        return api;
      },
      async maybeSingle() {
        return { data: rows()[0] ?? null, error: null };
      },
      async single() {
        if (insertPayload) {
          const id = `req-${idCounter++}`;
          const row = { id, ...insertPayload };
          store.manual_payment_requests.push(row);
          inserted.requests.push(row);
          return { data: { id }, error: null };
        }
        return { data: rows()[0] ?? null, error: null };
      },
      then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) {
        resolve({ data: rows(), error: null });
      },
    };
    return api;
  }

  return { client: { from: builder } as never, store, inserted, updates };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER,
    user_id: USER,
    order_number: "SO-1",
    payment_status: "awaiting_payment",
    grand_total: 1500,
    shipping_cost: 50,
    currency_code: "THB",
    ...overrides,
  };
}
function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING,
    user_id: USER,
    status: "draft",
    rental_days: 5,
    deposit_amount: 3000,
    currency_code: "THB",
    asset_name: "Camera A",
    ...overrides,
  };
}

describe("createManualPaymentRequestFromTargets", () => {
  it("sale_only — one sale_order item, total = order grand_total", async () => {
    const { client, inserted } = makeClient({ orders: [order()] });
    const res = await createManualPaymentRequestFromTargets(client, {
      userId: USER,
      orderId: ORDER,
      bookingIds: [],
    });
    expect(res.reused).toBe(false);
    const header = inserted.requests[0]!;
    expect(header.source_type).toBe("sale_only");
    expect(header.total_amount_due).toBe(1500);
    expect(inserted.items).toHaveLength(1);
    expect(inserted.items[0]!.target_type).toBe("sale_order");
    expect(inserted.items[0]!.amount_due).toBe(1500);
  });

  it("booking_only — one Booking Deposit item, source booking_only", async () => {
    const { client, inserted } = makeClient({ rental_bookings: [booking()] });
    await createManualPaymentRequestFromTargets(client, {
      userId: USER,
      bookingIds: [BOOKING],
    });
    const header = inserted.requests[0]!;
    expect(header.source_type).toBe("booking_only");
    // 5 days -> fixed 200, min(200, 3000) = 200
    expect(header.total_amount_due).toBe(200);
    expect(inserted.items).toHaveLength(1);
    expect(inserted.items[0]!.target_type).toBe("rental_booking_deposit");
    expect(inserted.items[0]!.amount_due).toBe(200);
  });

  it("mixed — sale + booking items, total = sum", async () => {
    const { client, inserted } = makeClient({
      orders: [order()],
      rental_bookings: [booking()],
    });
    await createManualPaymentRequestFromTargets(client, {
      userId: USER,
      orderId: ORDER,
      bookingIds: [BOOKING],
    });
    const header = inserted.requests[0]!;
    expect(header.source_type).toBe("mixed");
    expect(header.total_amount_due).toBe(1700);
    expect(inserted.items).toHaveLength(2);
  });

  it("rejects order owned by another customer (403)", async () => {
    const { client } = makeClient({ orders: [order({ user_id: OTHER })] });
    await expect(
      createManualPaymentRequestFromTargets(client, {
        userId: USER,
        orderId: ORDER,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects order not awaiting_payment (422)", async () => {
    const { client } = makeClient({
      orders: [order({ payment_status: "paid" })],
    });
    await expect(
      createManualPaymentRequestFromTargets(client, {
        userId: USER,
        orderId: ORDER,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects booking not draft (422)", async () => {
    const { client } = makeClient({
      rental_bookings: [booking({ status: "confirmed" })],
    });
    await expect(
      createManualPaymentRequestFromTargets(client, {
        userId: USER,
        bookingIds: [BOOKING],
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("rejects no targets (400)", async () => {
    const { client } = makeClient();
    await expect(
      createManualPaymentRequestFromTargets(client, { userId: USER }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reuses an active request covering the same target set", async () => {
    const { client, inserted } = makeClient({
      orders: [order()],
      manual_payment_requests: [
        { id: "existing-1", customer_id: USER, status: "awaiting_payment" },
      ],
      manual_payment_request_items: [
        { payment_request_id: "existing-1", target_id: ORDER, target_type: "sale_order" },
      ],
    });
    const res = await createManualPaymentRequestFromTargets(client, {
      userId: USER,
      orderId: ORDER,
    });
    expect(res.reused).toBe(true);
    expect(res.paymentRequestId).toBe("existing-1");
    expect(inserted.requests).toHaveLength(0);
  });

  it("EVIDENCE ONLY — never updates orders / rental_bookings", async () => {
    const { client, updates } = makeClient({
      orders: [order()],
      rental_bookings: [booking()],
    });
    await createManualPaymentRequestFromTargets(client, {
      userId: USER,
      orderId: ORDER,
      bookingIds: [BOOKING],
    });
    expect(updates).toHaveLength(0);
  });
});
