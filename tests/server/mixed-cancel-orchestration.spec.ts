/**
 * Tests: Mixed post-payment cancel orchestration (T3 walk 5, design §A case 5 — B4)
 *
 * Covers:
 *  1. Rental leg runs FIRST, then sale leg, then session bookkeeping (order pinned)
 *  2. Resume: committed rental leg verified-and-skipped; sale leg completes
 *  3. Mismatch on resubmission → 409 MIXED_CANCEL_PENDING_MISMATCH
 *  4. No cross-domain transaction: each leg is its own wrapper/RPC call
 *  5. Finalized allocations are NOT voided; session flips to cancelled
 */
import { describe, expect, it } from "vitest";
import { cancelMixedPostPaymentPair } from "../../server/utils/mixed-cancel-orchestration";

type Row = Record<string, unknown>;
const SESSION = "51515151-5151-4151-8151-515151515151";
const BOOKING = "52525252-5252-4252-8252-525252525252";
const ORDER = "53535353-5353-4353-8353-535353535353";

const bank = {
  refundBankName: "Kasikorn",
  refundBankAccountNumber: "1234567890",
  refundBankAccountName: "Customer",
  refundContactPhone: "0812345678",
};

function makeDb(overrides: Partial<Record<string, Row | Row[]>> = {}) {
  return {
    session: (overrides.session as Row) ?? { id: SESSION, status: "finalized", checkout_kind: "mixed" },
    allocations:
      (overrides.allocations as Row[]) ?? [
        { id: "al-1", allocation_type: "booking_deposit", rental_booking_id: BOOKING, order_id: null, status: "finalized" },
        { id: "al-2", allocation_type: "sale_product", rental_booking_id: null, order_id: ORDER, status: "finalized" },
      ],
    booking:
      (overrides.booking as Row) ?? {
        id: BOOKING, user_id: "user-1", status: "confirmed", start_date: "2026-09-01",
        currency_code: "THB", booking_deposit_payment_status: "paid",
        booking_deposit_paid_amount: 200, deposit_paid_amount: 0,
        booking_deposit_payment_attempt_id: null,
        booking_deposit_mixed_allocation_id: "al-1",
        cancellation_reason: null,
      },
    order:
      (overrides.order as Row) ?? {
        id: ORDER, user_id: "user-1", status: "confirmed", payment_status: "paid",
        fulfillment_status: "unfulfilled", grand_total: 350, pos_paid_amount: 0,
        currency_code: "THB", inventory_applied_at: "2026-07-01T00:00:00.000Z",
        inventory_restored_at: null,
      },
    saleRefund: (overrides.saleRefund as Row) ?? null,
  };
}

function makeClient(db: ReturnType<typeof makeDb>) {
  const state = { calls: [] as string[], sessionUpdates: [] as Row[], decisionLogs: [] as Row[] };
  const client = {
    from(table: string) {
      if (table === "mixed_checkout_sessions")
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.session, error: null }) }) }),
          update: (p: Row) => ({
            eq: async () => {
              state.sessionUpdates.push(p);
              state.calls.push("session-flip");
              return { error: null };
            },
          }),
        };
      if (table === "mixed_payment_allocations")
        return { select: () => ({ eq: async () => ({ data: db.allocations, error: null }) }) };
      if (table === "rental_bookings")
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.booking, error: null }) }) }) };
      if (table === "orders")
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.order, error: null }) }) }) };
      if (table === "sale_order_refunds")
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.saleRefund, error: null }) }) }) };
      if (table === "money_ops_decision_logs")
        return {
          insert: async (p: Row) => {
            state.decisionLogs.push(p);
            return { error: null };
          },
        };
      if (table === "rental_booking_deposit_action_logs")
        return { insert: async () => ({ error: null }) };
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string) => {
      state.calls.push(`rpc:${name}`);
      if (name === "f_cancel_rental_booking_admin")
        return { data: { ok: true, refund: { status: "pending_admin_review" } }, error: null };
      if (name === "f_cancel_sale_order")
        return { data: { ok: true, refund: { state: "pending" } }, error: null };
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  };
  return { client, state };
}

function callInput(client: unknown, overrides: Row = {}) {
  return {
    client: client as any,
    rawSessionId: SESSION,
    actorUserId: "super-1",
    actorRole: "super_admin",
    reason: "mixed pair cancel",
    ...bank,
    ...overrides,
  };
}

describe("cancelMixedPostPaymentPair (B4)", () => {
  it("runs rental leg FIRST, sale leg second, session flip last — each leg its own RPC", async () => {
    const { client, state } = makeClient(makeDb());
    const result = await cancelMixedPostPaymentPair(callInput(client) as any);
    expect(result).toMatchObject({
      ok: true,
      legs: { rental: "cancelled", sale: "cancelled" },
      sessionStatus: "cancelled",
    });
    expect(state.calls).toEqual([
      "rpc:f_cancel_rental_booking_admin",
      "rpc:f_cancel_sale_order",
      "session-flip",
    ]);
  });

  it("resume: committed rental leg verified-and-skipped, sale leg completes", async () => {
    const db = makeDb({
      booking: {
        ...makeDb().booking,
        status: "cancelled",
        cancellation_reason: "mixed pair cancel",
      },
    });
    const { client, state } = makeClient(db);
    const result = await cancelMixedPostPaymentPair(callInput(client) as any);
    expect(result.legs).toEqual({
      rental: "skipped_already_cancelled",
      sale: "cancelled",
    });
    expect(state.calls).toEqual(["rpc:f_cancel_sale_order", "session-flip"]);
  });

  it("mismatched resubmission → 409 MIXED_CANCEL_PENDING_MISMATCH, sale leg untouched", async () => {
    const db = makeDb({
      booking: {
        ...makeDb().booking,
        status: "cancelled",
        cancellation_reason: "a DIFFERENT reason",
      },
    });
    const { client, state } = makeClient(db);
    await expect(
      cancelMixedPostPaymentPair(callInput(client) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.calls).toEqual([]);
  });

  it("full replay (both legs committed, matching) → both skipped, idempotent", async () => {
    const db = makeDb({
      booking: { ...makeDb().booking, status: "cancelled", cancellation_reason: "mixed pair cancel" },
      order: { ...makeDb().order, status: "cancelled" },
      saleRefund: { reason: "mixed pair cancel" },
      session: { id: SESSION, status: "cancelled", checkout_kind: "mixed" },
    });
    const { client, state } = makeClient(db);
    const result = await cancelMixedPostPaymentPair(callInput(client) as any);
    expect(result.legs).toEqual({
      rental: "skipped_already_cancelled",
      sale: "skipped_already_cancelled",
    });
    expect(state.calls).toEqual([]);
  });

  it("session without a full pair → 409 MIXED_PAIR_INCOMPLETE", async () => {
    const db = makeDb({
      allocations: [
        { id: "al-1", allocation_type: "booking_deposit", rental_booking_id: BOOKING, order_id: null, status: "finalized" },
      ],
    });
    const { client } = makeClient(db);
    await expect(
      cancelMixedPostPaymentPair(callInput(client) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
