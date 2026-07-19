/**
 * Tests: Sale-order cancel + refund settle (T3 walk 4, design §A case 4)
 *
 * Covers:
 *  1. §F inversion — staff denial (not_super_admin) LOGGED before 403
 *     (inherited contract: cancel was super_admin-gated in [id].patch.ts)
 *  2. Allowed row fail-closed before f_cancel_sale_order; bank contract 422
 *  3. Settle wrapper: outcome validation, evidence 422 mapping,
 *     refund_mark_refunded logging
 *  4. Raw-flip retirement: [id].patch.ts rejects status='cancelled' with
 *     SALE_ORDER_CANCEL_MOVED — the RPC path is the only cancel path
 *  5. Endpoint source contracts (requirePlatformAdmin, never the
 *     super-admin-only guard; ip/ua captured)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cancelSaleOrder,
  settleSaleOrderRefund,
} from "../../server/utils/admin-sale-order-cancel";

type Row = Record<string, unknown>;
const ORDER_ID = "12121212-1212-4212-8212-121212121212";
const REFUND_ID = "34343434-3434-4434-8434-343434343434";

function makeClient(opts: { order?: Row | null; rpcError?: string | null }) {
  const state = {
    decisionLogs: [] as Row[],
    rpcCalls: [] as { name: string; params: Row }[],
    order: [] as string[],
  };
  const client = {
    from(table: string) {
      if (table === "money_ops_decision_logs")
        return {
          insert: async (p: Row) => {
            state.decisionLogs.push(p);
            state.order.push(`log:${p.decision}`);
            return { error: null };
          },
        };
      if (table === "orders")
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.order === undefined ? paidOrder() : opts.order,
                error: null,
              }),
            }),
          }),
        };
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string, params: Row) => {
      state.rpcCalls.push({ name, params });
      state.order.push("rpc");
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      return {
        data: { ok: true, inventoryRestored: true, paymentRequestsClosed: 1 },
        error: null,
      };
    },
  };
  return { client, state };
}

function paidOrder(overrides: Row = {}): Row {
  return {
    id: ORDER_ID,
    user_id: "user-1",
    status: "confirmed",
    payment_status: "paid",
    fulfillment_status: "unfulfilled",
    grand_total: 350,
    pos_paid_amount: 0,
    currency_code: "THB",
    inventory_applied_at: "2026-07-01T00:00:00.000Z",
    inventory_restored_at: null,
    ...overrides,
  };
}

const bank = {
  refundBankName: "Kasikorn",
  refundBankAccountNumber: "1234567890",
  refundBankAccountName: "Customer",
  refundContactPhone: "0812345678",
};

function cancelInput(client: unknown, overrides: Row = {}) {
  return {
    client: client as any,
    rawOrderId: ORDER_ID,
    actorUserId: "super-1",
    actorRole: "super_admin",
    reason: "walk 4 cancel",
    ...bank,
    ...overrides,
  };
}

describe("cancelSaleOrder (§F inversion, inherited super_admin contract)", () => {
  it("logs a staff denial BEFORE the 403", async () => {
    const { client, state } = makeClient({});
    await expect(
      cancelSaleOrder(cancelInput(client, { actorRole: "staff" }) as any),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(state.decisionLogs[0]).toMatchObject({
      operation: "sale_cancel_paid",
      decision: "denied",
      denial_reason: "not_super_admin",
      actor_role: "staff",
      entity_id: ORDER_ID,
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("success: allowed row fail-closed before the RPC (amount from grand_total)", async () => {
    const { client, state } = makeClient({});
    const result = await cancelSaleOrder(cancelInput(client) as any);
    expect(result).toMatchObject({ ok: true });
    expect(state.order).toEqual(["log:allowed", "rpc"]);
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "allowed",
      entity_type: "sale_order",
      amount: 350,
    });
    expect(state.rpcCalls[0].name).toBe("f_cancel_sale_order");
  });

  it("requires bank details for paid orders (422 + denied row); unpaid needs none", async () => {
    const { client, state } = makeClient({});
    await expect(
      cancelSaleOrder(cancelInput(client, { refundBankName: "" }) as any),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(state.decisionLogs[0]).toMatchObject({
      denial_reason: "bank_details_required",
    });

    const unpaid = makeClient({
      order: paidOrder({ payment_status: "awaiting_payment" }),
    });
    const result = await cancelSaleOrder(
      cancelInput(unpaid.client, {
        refundBankName: "",
        refundBankAccountNumber: "",
        refundBankAccountName: "",
        refundContactPhone: "",
      }) as any,
    );
    expect(result).toMatchObject({ ok: true });
    expect(unpaid.state.decisionLogs[0]).toMatchObject({
      decision: "allowed",
      amount: null,
    });
  });

  it("writes a correction row when the RPC fails after allow", async () => {
    const { client, state } = makeClient({ rpcError: "ORDER_CANCELLATION_CONFLICT" });
    await expect(cancelSaleOrder(cancelInput(client) as any)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(state.decisionLogs.map((r) => `${r.decision}:${r.denial_reason ?? ""}`)).toEqual(
      ["allowed:", "denied:rpc_failed_after_allow"],
    );
  });
});

describe("settleSaleOrderRefund", () => {
  function settleInput(client: unknown, overrides: Row = {}) {
    return {
      client: client as any,
      rawRefundId: REFUND_ID,
      actorUserId: "staff-1",
      actorRole: "staff",
      outcome: "settled",
      manualTransferReference: "TRF-1",
      slipStoragePath: "sale-refunds/x.jpg",
      ...overrides,
    };
  }

  it("maps evidence failure to 422 and logs the correction", async () => {
    const { client, state } = makeClient({ rpcError: "REFUND_SETTLE_EVIDENCE_REQUIRED" });
    await expect(
      settleSaleOrderRefund(settleInput(client) as any),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(state.decisionLogs.map((r) => r.decision)).toEqual(["allowed", "denied"]);
    expect(state.decisionLogs[0]).toMatchObject({
      operation: "refund_mark_refunded",
      entity_type: "payment_refund",
    });
  });

  it("rejects invalid outcomes with a denied row before any RPC", async () => {
    const { client, state } = makeClient({});
    await expect(
      settleSaleOrderRefund(settleInput(client, { outcome: "done" }) as any),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "denied",
      denial_reason: "outcome_invalid",
    });
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("raw-flip retirement + endpoint source contracts", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("[id].patch.ts rejects status='cancelled' (SALE_ORDER_CANCEL_MOVED) and keeps no raw cancel flip", () => {
    const src = read("server/api/admin/orders/[id].patch.ts");
    expect(src).toContain("SALE_ORDER_CANCEL_MOVED");
    expect(src).not.toContain("Super admin access required to cancel orders");
  });

  it("cancel + settle endpoints use requirePlatformAdmin (inversion) and pass ip/ua", () => {
    for (const p of [
      "server/api/admin/orders/[id]/cancel.post.ts",
      "server/api/admin/orders/refunds/[id]/settle.post.ts",
    ]) {
      const src = read(p);
      expect(src).toContain("requirePlatformAdmin");
      expect(src).not.toContain("requireSuperAdmin");
      expect(src).toContain("getRequestIP");
    }
  });
});

describe("cancelSaleOrder idempotent replay", () => {
  it("returns alreadyCancelled without writing any decision row", async () => {
    const state = { decisionLogs: [] as Row[] };
    const client = {
      from(table: string) {
        if (table === "money_ops_decision_logs")
          return { insert: async (p: Row) => (state.decisionLogs.push(p), { error: null }) };
        if (table === "orders")
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: ORDER_ID, status: "cancelled", payment_status: "paid" },
                  error: null,
                }),
              }),
            }),
          };
        throw new Error(`unexpected table ${table}`);
      },
      rpc: async () => {
        throw new Error("rpc must not be called on replay");
      },
    };
    const result = await cancelSaleOrder({
      client: client as any,
      rawOrderId: ORDER_ID,
      actorUserId: "super-1",
      actorRole: "super_admin",
      reason: "again",
    } as any);
    expect(result).toMatchObject({ ok: true, alreadyCancelled: true });
    expect(state.decisionLogs).toHaveLength(0);
  });
});

describe("paymentStatus raw path closure (CHiP ruling 2026-07-19)", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("transition table no longer offers refunded/cancelled targets (whitelist subtraction)", async () => {
    const { ORDER_PAYMENT_STATUS_TRANSITIONS } = await import(
      "../../app/utils/admin-order-transitions"
    );
    for (const targets of Object.values(ORDER_PAYMENT_STATUS_TRANSITIONS)) {
      expect(targets).not.toContain("refunded");
      expect(targets).not.toContain("cancelled");
    }
    expect(ORDER_PAYMENT_STATUS_TRANSITIONS.paid).toEqual([]);
  });

  it("[id].patch.ts 409s money-truth paymentStatus targets before any validation", () => {
    const src = read("server/api/admin/orders/[id].patch.ts");
    expect(src).toContain("SALE_ORDER_PAYMENT_STATUS_MOVED");
    const blockIdx = src.indexOf("SALE_ORDER_PAYMENT_STATUS_MOVED");
    const validateIdx = src.indexOf("ORDER_PAYMENT_STATUS_TRANSITIONS,", src.indexOf("body.paymentStatus"));
    expect(blockIdx).toBeGreaterThan(0);
    expect(blockIdx).toBeLessThan(validateIdx);
  });
});
