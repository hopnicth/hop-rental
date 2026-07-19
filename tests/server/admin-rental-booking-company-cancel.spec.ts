/**
 * Tests: Company-side cancellation (T3 walk 3, design §A case 3)
 *
 * Covers:
 *  1. §F inversion on money — staff (non-super_admin) denial LOGGED before 403
 *  2. Allowed row fail-closed before the 129 RPC (company mode, amount NULL param —
 *     the RPC derives the full refund)
 *  3. Bank-details wrapper contract (422 + denied row when deposit captured)
 *  4. Draft no-money path: allowed log with amount null; no bank details needed
 *  5. paid_confirm_failed accepted (B-M1 preview: mode admits it)
 *  6. Endpoint source contract: requirePlatformAdmin, never the super-admin guard
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { companyCancelRentalBooking } from "../../server/utils/admin-rental-booking-cancel";

type Row = Record<string, unknown>;
const BOOKING_ID = "99999999-9999-4999-8999-999999999999";

function makeClient(opts: { booking?: Row | null; rpcError?: string | null }) {
  const state = {
    decisionLogs: [] as Row[],
    actionLogs: [] as Row[],
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
      if (table === "rental_booking_deposit_action_logs")
        return {
          insert: async (p: Row) => {
            state.actionLogs.push(p);
            state.order.push("action-log");
            return { error: null };
          },
        };
      if (table === "rental_bookings")
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.booking === undefined ? paidBooking() : opts.booking,
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
      return { data: { ok: true, refund: { status: "pending_admin_review" } }, error: null };
    },
  };
  return { client, state };
}

function paidBooking(overrides: Row = {}): Row {
  return {
    id: BOOKING_ID,
    user_id: "user-1",
    status: "confirmed",
    start_date: "2026-09-01",
    currency_code: "THB",
    booking_deposit_payment_status: "paid",
    booking_deposit_paid_amount: 700,
    deposit_paid_amount: 0,
    booking_deposit_payment_attempt_id: "55555555-5555-4555-8555-555555555555",
    booking_deposit_mixed_allocation_id: null,
    ...overrides,
  };
}

const bank = {
  refundBankName: "Kasikorn",
  refundBankAccountNumber: "1234567890",
  refundBankAccountName: "Customer",
  refundContactPhone: "0812345678",
};

function callInput(client: unknown, overrides: Row = {}) {
  return {
    client: client as any,
    rawBookingId: BOOKING_ID,
    actorUserId: "super-1",
    actorRole: "super_admin",
    reason: "company-side cancellation",
    ...bank,
    ...overrides,
  };
}

describe("companyCancelRentalBooking (§F inversion on money)", () => {
  it("logs a staff denial BEFORE the 403 (the extended inversion)", async () => {
    const { client, state } = makeClient({});
    await expect(
      companyCancelRentalBooking(callInput(client, { actorRole: "staff" }) as any),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(state.decisionLogs[0]).toMatchObject({
      operation: "company_cancel",
      decision: "denied",
      denial_reason: "not_super_admin",
      actor_role: "staff",
      entity_id: BOOKING_ID,
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("success: allowed row fail-closed before the RPC; RPC derives the amount (null param)", async () => {
    const { client, state } = makeClient({});
    const result = await companyCancelRentalBooking(callInput(client) as any);
    expect(result).toMatchObject({ ok: true });
    expect(state.order).toEqual(["log:allowed", "rpc", "action-log"]);
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "allowed",
      amount: 700,
      entity_id: BOOKING_ID,
    });
    expect(state.rpcCalls[0].params).toMatchObject({
      p_mode: "company_cancel_refund",
      p_refund_amount: null,
      p_original_payment_source_type: "rental_booking_payment_attempt",
      p_refund_bank_name: "Kasikorn",
    });
    expect(state.actionLogs[0]).toMatchObject({ action: "company_cancel_refund" });
  });

  it("requires bank details when a deposit is captured (422 + denied row)", async () => {
    const { client, state } = makeClient({});
    await expect(
      companyCancelRentalBooking(
        callInput(client, { refundBankAccountNumber: "" }) as any,
      ),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "denied",
      denial_reason: "bank_details_required",
    });
  });

  it("draft no-money path: no bank details needed, allowed row amount null", async () => {
    const { client, state } = makeClient({
      booking: paidBooking({
        status: "draft",
        booking_deposit_payment_status: "unpaid",
        booking_deposit_paid_amount: 0,
      }),
    });
    const result = await companyCancelRentalBooking(
      callInput(client, {
        refundBankName: "",
        refundBankAccountNumber: "",
        refundBankAccountName: "",
        refundContactPhone: "",
      }) as any,
    );
    expect(result).toMatchObject({ ok: true });
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "allowed",
      amount: null,
      currency_code: null,
    });
  });

  it("accepts paid_confirm_failed (B-M1 preview) and resolves the payment source", async () => {
    const { client, state } = makeClient({
      booking: paidBooking({ booking_deposit_payment_status: "paid_confirm_failed" }),
    });
    await companyCancelRentalBooking(callInput(client) as any);
    expect(state.decisionLogs[0]).toMatchObject({ decision: "allowed", amount: 700 });
    expect(state.rpcCalls[0].params).toMatchObject({ p_mode: "company_cancel_refund" });
  });

  it("denies unresolvable payment sources (manually-confirmed deposits) with a logged row", async () => {
    const { client, state } = makeClient({
      booking: paidBooking({
        booking_deposit_payment_attempt_id: null,
        booking_deposit_mixed_allocation_id: null,
      }),
    });
    await expect(
      companyCancelRentalBooking(callInput(client) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "denied",
      denial_reason: "payment_source_unresolved",
    });
  });
});

describe("company-cancel endpoint source contract", () => {
  it("uses requirePlatformAdmin (inversion — never the super-admin-only guard)", () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        "server/api/admin/rental-bookings/[id]/company-cancel.post.ts",
      ),
      "utf8",
    );
    expect(src).toContain("requirePlatformAdmin");
    expect(src).not.toContain("requireSuperAdmin");
    expect(src).toContain("companyCancelRentalBooking");
    expect(src).toContain("getRequestIP");
  });
});

describe("companyCancelRentalBooking idempotent replay (walk-6 finding)", () => {
  it("returns alreadyCancelled on a cancelled booking without any decision row", async () => {
    const { client, state } = makeClient({
      booking: paidBooking({ status: "cancelled" }),
    });
    const result = await companyCancelRentalBooking(callInput(client) as any);
    expect(result).toMatchObject({ ok: true, alreadyCancelled: true });
    expect(state.decisionLogs).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
  });
});
