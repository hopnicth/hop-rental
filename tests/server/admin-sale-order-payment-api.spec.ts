/**
 * Tests: server/utils/sale-order-manual-payment.ts + admin sale payment routes
 *
 * Mocks recordPaymentAlert at the util boundary; uses a mock client for table
 * ops + rpc. Covers:
 *  1. order-not-found (404), not-payable (422)
 *  2. happy path: paid+confirmed (guarded), f_apply_order_inventory called,
 *     cart cleared, returns alreadyPaid=false
 *  3. idempotent: already-paid returns alreadyPaid=true, no re-update/rpc
 *  4. slip ownership guard (different order → 404) + reviewed marking
 *  5. route contracts: requirePlatformAdmin, signed-url belongs-to-order guard,
 *     record-payment uses the util, no rental ledger / no public URL
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("~~/server/utils/payments", () => ({
  recordPaymentAlert: vi.fn(async () => {}),
}));

import { recordManualSalePayment } from "../../server/utils/sale-order-manual-payment";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const SLIP_ID = "33333333-3333-4333-8333-333333333333";

function makeClient(cfg: {
  order?: Record<string, unknown> | null;
  slip?: Record<string, unknown> | null;
  cart?: Record<string, unknown> | null;
}) {
  const calls = {
    rpc: [] as { fn: string; params: Record<string, unknown> }[],
    updates: [] as { table: string; payload: Record<string, unknown> }[],
    deletes: [] as string[],
  };
  function from(table: string) {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      update: (payload: Record<string, unknown>) => {
        calls.updates.push({ table, payload });
        return q;
      },
      delete: () => {
        calls.deletes.push(table);
        return q;
      },
      eq: () => q,
      neq: () => q,
      order: () => q,
      maybeSingle: () => {
        if (table === "orders") {
          // first call = load order; subsequent = update().select().maybeSingle()
          return Promise.resolve({ data: cfg.order ?? null, error: null });
        }
        if (table === "sale_order_payment_slips")
          return Promise.resolve({ data: cfg.slip ?? null, error: null });
        if (table === "carts")
          return Promise.resolve({ data: cfg.cart ?? null, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(onF, onR),
    });
    return q;
  }
  const client = {
    from,
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calls.rpc.push({ fn, params });
      return { error: null };
    },
  };
  return { client, calls };
}

beforeEach(() => vi.clearAllMocks());

describe("recordManualSalePayment", () => {
  it("404 when order missing", async () => {
    const { client } = makeClient({ order: null });
    await expect(
      recordManualSalePayment({
        adminClient: client,
        orderId: ORDER_ID,
        adminUserId: ADMIN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("422 for a non-payable order (cancelled/refunded/not_applicable)", async () => {
    for (const payment_status of ["cancelled", "refunded", "not_applicable"]) {
      const { client, calls } = makeClient({
        order: { id: ORDER_ID, user_id: "u1", payment_status, status: "submitted" },
      });
      await expect(
        recordManualSalePayment({
          adminClient: client,
          orderId: ORDER_ID,
          adminUserId: ADMIN_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 422 });
      expect(calls.rpc.length).toBe(0);
    }
  });

  it("happy path: marks paid+confirmed, applies inventory, clears cart", async () => {
    const { client, calls } = makeClient({
      order: {
        id: ORDER_ID,
        user_id: "u1",
        payment_status: "pending_review",
        status: "submitted",
      },
      cart: { id: "cart-1" },
    });
    const result = await recordManualSalePayment({
      adminClient: client,
      orderId: ORDER_ID,
      adminUserId: ADMIN_ID,
    });
    const orderUpdate = calls.updates.find((u) => u.table === "orders");
    expect(orderUpdate?.payload.payment_status).toBe("paid");
    expect(orderUpdate?.payload.status).toBe("confirmed");
    expect(calls.rpc.find((r) => r.fn === "f_apply_order_inventory")).toBeTruthy();
    expect(calls.deletes).toContain("cart_items");
    expect(result.alreadyPaid).toBe(false);
  });

  it("idempotent: already-paid returns alreadyPaid without re-update/rpc", async () => {
    const { client, calls } = makeClient({
      order: { id: ORDER_ID, user_id: "u1", payment_status: "paid", status: "confirmed" },
    });
    const result = await recordManualSalePayment({
      adminClient: client,
      orderId: ORDER_ID,
      adminUserId: ADMIN_ID,
    });
    expect(result.alreadyPaid).toBe(true);
    expect(calls.updates.find((u) => u.table === "orders")).toBeUndefined();
    expect(calls.rpc.length).toBe(0);
  });

  it("404 when the linked slip belongs to a different order", async () => {
    const { client } = makeClient({
      order: { id: ORDER_ID, user_id: "u1", payment_status: "pending_review", status: "submitted" },
      slip: { id: SLIP_ID, order_id: "other-order" },
    });
    await expect(
      recordManualSalePayment({
        adminClient: client,
        orderId: ORDER_ID,
        adminUserId: ADMIN_ID,
        paymentSlipId: SLIP_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("marks an owned slip reviewed", async () => {
    const { client, calls } = makeClient({
      order: { id: ORDER_ID, user_id: "u1", payment_status: "pending_review", status: "submitted" },
      slip: { id: SLIP_ID, order_id: ORDER_ID },
      cart: { id: "cart-1" },
    });
    const result = await recordManualSalePayment({
      adminClient: client,
      orderId: ORDER_ID,
      adminUserId: ADMIN_ID,
      paymentSlipId: SLIP_ID,
      adminNote: "ok",
    });
    const slipUpdate = calls.updates.find(
      (u) => u.table === "sale_order_payment_slips",
    );
    expect(slipUpdate?.payload.status).toBe("reviewed");
    expect(result.paymentSlipReviewed).toBe(true);
  });
});

describe("admin sale payment route contracts", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  const LIST = read("server/api/admin/orders/[id]/payment-slips.get.ts");
  const SIGNED = read(
    "server/api/admin/orders/[id]/payment-slips/[slipId]/signed-url.get.ts",
  );
  const RECORD = read("server/api/admin/orders/[id]/record-payment.post.ts");

  it("all require platform admin", () => {
    for (const src of [LIST, SIGNED, RECORD])
      expect(src).toContain("requirePlatformAdmin");
  });
  it("list uses safe select, no storage path/url", () => {
    expect(LIST).toContain("SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT");
    expect(LIST).not.toContain("storage_path");
    expect(LIST).not.toContain("getPublicUrl");
  });
  it("signed-url guards slip belongs to order, short-lived, no public url", () => {
    expect(SIGNED).toContain("order_id");
    expect(SIGNED).toContain("Slip not found");
    expect(SIGNED).toContain("createSaleOrderPaymentSlipSignedUrl");
    expect(SIGNED).not.toContain("getPublicUrl");
  });
  it("record-payment delegates to the util, no rental ledger", () => {
    expect(RECORD).toContain("recordManualSalePayment");
    expect(RECORD).not.toContain("rental_held_balance_events");
    expect(RECORD).not.toContain("confirmRentalBooking");
  });
});
