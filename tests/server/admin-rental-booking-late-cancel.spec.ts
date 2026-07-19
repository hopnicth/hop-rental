/**
 * Tests: Staff late-cancel forfeiture (T3 walk 2, design §A case 2)
 *
 * Covers:
 *  1. §F inversion — endpoint uses requirePlatformAdmin (never requireSuperAdmin);
 *     every post-guard refusal logs a DENIED money_ops_decision_logs row before throwing
 *  2. Allowed row is written FAIL-CLOSED before the money RPC
 *  3. RPC failure after allow → correction (denied/rpc_failed_after_allow) row
 *  4. Success → RPC called with 7-day/policy-v2 window params + late_cancel_forfeit
 *     deposit-action-log row
 *  5. logMoneyOpsDecision unit behavior (failClosed vs best-effort)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lateCancelForfeitRentalBooking } from "../../server/utils/admin-rental-booking-cancel";
import { logMoneyOpsDecision } from "../../server/utils/money-ops-log";

type Row = Record<string, unknown>;

const BOOKING_ID = "33333333-3333-4333-8333-333333333333";

function makeClient(opts: {
  booking?: Row | null;
  rpcError?: string | null;
  failLogInsert?: boolean;
}) {
  const state = {
    decisionLogs: [] as Row[],
    actionLogs: [] as Row[],
    rpcCalls: [] as { name: string; params: Row }[],
    orderOfWrites: [] as string[],
  };
  const client = {
    from(table: string) {
      if (table === "money_ops_decision_logs") {
        return {
          insert: async (payload: Row) => {
            if (opts.failLogInsert) return { error: { message: "boom" } };
            state.decisionLogs.push(payload);
            state.orderOfWrites.push(`log:${payload.decision}`);
            return { error: null };
          },
        };
      }
      if (table === "rental_booking_deposit_action_logs") {
        return {
          insert: async (payload: Row) => {
            state.actionLogs.push(payload);
            state.orderOfWrites.push("action-log");
            return { error: null };
          },
        };
      }
      if (table === "rental_bookings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.booking === undefined ? baseBooking() : opts.booking,
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string, params: Row) => {
      state.rpcCalls.push({ name, params });
      state.orderOfWrites.push("rpc");
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      return { data: { ok: true, forfeitedHeldAmount: 500 }, error: null };
    },
  };
  return { client, state };
}

function baseBooking(overrides: Row = {}): Row {
  // start_date tomorrow → inside the <7d window (forfeit legal)
  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    id: BOOKING_ID,
    user_id: "user-1",
    status: "confirmed",
    start_date: soon,
    currency_code: "THB",
    booking_deposit_payment_status: "paid",
    booking_deposit_paid_amount: 500,
    deposit_paid_amount: 0,
    ...overrides,
  };
}

function callInput(client: unknown, overrides: Row = {}) {
  return {
    client: client as any,
    rawBookingId: BOOKING_ID,
    actorUserId: "staff-1",
    actorRole: "staff",
    reason: "customer requested inside window",
    ...overrides,
  };
}

describe("lateCancelForfeitRentalBooking (§F inversion)", () => {
  it("succeeds: allowed row fail-closed BEFORE rpc, then action log; rpc gets v2 window params", async () => {
    const { client, state } = makeClient({});
    const result = await lateCancelForfeitRentalBooking(callInput(client) as any);
    expect(result).toMatchObject({ ok: true });
    expect(state.orderOfWrites).toEqual(["log:allowed", "rpc", "action-log"]);
    expect(state.decisionLogs[0]).toMatchObject({
      operation: "late_cancel_forfeit",
      decision: "allowed",
      entity_type: "rental_booking",
      entity_id: BOOKING_ID,
      amount: 500,
    });
    const rpc = state.rpcCalls[0];
    expect(rpc.name).toBe("f_cancel_rental_booking_admin");
    expect(rpc.params).toMatchObject({
      p_mode: "late_cancel_forfeit",
      p_refund_policy_version: "booking_deposit_refund_calendar_day_v2",
    });
    // cutoff = pickup - 7 per the v2 tier
    expect(rpc.params.p_refund_cutoff_date).not.toBe(rpc.params.p_pickup_local_date);
    expect(state.actionLogs[0]).toMatchObject({ action: "late_cancel_forfeit" });
  });

  it("denies outside-window attempts with a logged denied row before the 409", async () => {
    const far = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { client, state } = makeClient({ booking: baseBooking({ start_date: far }) });
    await expect(
      lateCancelForfeitRentalBooking(callInput(client) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.decisionLogs).toHaveLength(1);
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "denied",
      denial_reason: "window_not_reached",
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("denies non-cancellable bookings (walk-1 cancelled fixture shape) with a logged row", async () => {
    const { client, state } = makeClient({
      booking: baseBooking({ status: "cancelled" }),
    });
    await expect(
      lateCancelForfeitRentalBooking(callInput(client) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "denied",
      denial_reason: "booking_not_cancellable",
    });
  });

  it("denies wrong roles with a logged row; malformed ids log entity_id null (Decision-G purity)", async () => {
    const { client, state } = makeClient({});
    await expect(
      lateCancelForfeitRentalBooking(
        callInput(client, { actorRole: "customer" }) as any,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "denied",
      denial_reason: "actor_role_invalid",
    });

    const malformed = makeClient({});
    await expect(
      lateCancelForfeitRentalBooking(
        callInput(malformed.client, { rawBookingId: "not-a-uuid; DROP" }) as any,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(malformed.state.decisionLogs[0]).toMatchObject({
      denial_reason: "malformed_booking_id",
      entity_id: null,
      entity_type: null,
    });
  });

  it("writes a correction row when the RPC fails after the allowed row", async () => {
    const { client, state } = makeClient({ rpcError: "BOOKING_CANCELLATION_CONFLICT" });
    await expect(
      lateCancelForfeitRentalBooking(callInput(client) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state.decisionLogs.map((r) => `${r.decision}:${r.denial_reason ?? ""}`)).toEqual([
      "allowed:",
      "denied:rpc_failed_after_allow",
    ]);
    expect(state.actionLogs).toHaveLength(0);
  });

  it("fail-closed: a failed allowed-log write blocks the money RPC entirely", async () => {
    const { client, state } = makeClient({ failLogInsert: true });
    await expect(
      lateCancelForfeitRentalBooking(callInput(client) as any),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("logMoneyOpsDecision", () => {
  it("best-effort by default; failClosed throws 500", async () => {
    const failing = {
      from: () => ({ insert: async () => ({ error: { message: "x" } }) }),
    };
    await expect(
      logMoneyOpsDecision(failing as any, {
        operation: "late_cancel_forfeit",
        decision: "denied",
        denialReason: "test",
      }),
    ).resolves.toBe(false);
    await expect(
      logMoneyOpsDecision(
        failing as any,
        { operation: "late_cancel_forfeit", decision: "allowed" },
        { failClosed: true },
      ),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("late-cancel endpoint source contract", () => {
  it("uses requirePlatformAdmin (never requireSuperAdmin) and passes ip/ua", () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        "server/api/admin/rental-bookings/[id]/late-cancel-forfeit.post.ts",
      ),
      "utf8",
    );
    expect(src).toContain("requirePlatformAdmin");
    expect(src).not.toContain("requireSuperAdmin");
    expect(src).toContain("getRequestIP");
    expect(src).toContain("lateCancelForfeitRentalBooking");
  });
});
