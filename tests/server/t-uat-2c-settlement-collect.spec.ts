/**
 * Tests: T-UAT 2c — the settlement amount can finally be collected.
 *
 * `f_confirm_settlement_payment` shipped in mig-134 with NO caller; only waive
 * was ever wired. So the counter had one control for a settled amount —
 * ยกเว้นยอดชำระ — and the choice was write the money off or leave it owing
 * forever (UAT 2026-09-01, docs/BACKLOG.md T-UAT).
 *
 * Covers (mock client at the util boundary + route/UI contract):
 *  1. staff AND super_admin may collect; anything else is refused AND logged
 *  2. branch-scoped on the BOOKING's hub, never a client-supplied branch
 *  3. cash — reference generated server-side, Asia/Bangkok, client IGNORED
 *  4. transfer — reference and a private-chain slip both required
 *  5. the actor id/role reach the RPC from the guard, never the body
 *  6. every refusal writes exactly one §F denial row BEFORE throwing
 *  7. success writes NO wrapper log (the RPC owns the allowed row)
 *  8. replay surfaces as a customer-safe 409
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectSettlementPayment,
  collectRpcError,
  buildCashPaymentReference,
} from "../../server/utils/rental-settlement-collect";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BOOKING = "33333333-3333-4333-8333-333333333333";
const STAFF = "22222222-2222-4222-8222-222222222222";

/** Mock client: booking row + branch-access row + rpc, recording every write. */
function makeClient(opts: {
  hubId?: string | null;
  hasBranchAccess?: boolean;
  rpcError?: string | null;
  bookingMissing?: boolean;
} = {}) {
  const logs: Record<string, unknown>[] = [];
  const rpcCalls: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => {
          if (table === "rental_bookings") {
            return opts.bookingMissing
              ? { data: null, error: null }
              : { data: { id: BOOKING, hub_id: opts.hubId ?? "branch-1" }, error: null };
          }
          if (table === "admin_user_branch_access") {
            return {
              data: opts.hasBranchAccess === false ? null : { user_id: STAFF },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        insert: async (row: Record<string, unknown>) => {
          if (table === "money_ops_decision_logs") logs.push(row);
          return { data: null, error: null };
        },
      };
      return api;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, ...args });
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      return {
        data: { ok: true, state: "paid", amount_due: 1300, amount_paid: 1300 },
        error: null,
      };
    },
  };
  return { client, logs, rpcCalls };
}

const base = {
  rawBookingId: BOOKING,
  actorUserId: STAFF,
  actorRole: "staff",
  rawAmountPaid: 1300,
  rawPaymentMethod: "cash",
  rawPaymentReference: undefined,
  rawSlipEvidenceRef: undefined,
};

describe("[2c] who may collect", () => {
  it("staff may collect — this is the ordinary counter action", async () => {
    const { client, rpcCalls } = makeClient();
    const res = await collectSettlementPayment({ ...base, client } as never);
    expect(res.ok).toBe(true);
    expect(rpcCalls[0]!.fn).toBe("f_confirm_settlement_payment");
  });

  it("super_admin may collect too", async () => {
    const { client } = makeClient();
    const res = await collectSettlementPayment({
      ...base,
      client,
      actorRole: "super_admin",
    } as never);
    expect(res.ok).toBe(true);
  });

  it("any other role is refused AND logged", async () => {
    const { client, logs, rpcCalls } = makeClient();
    await expect(
      collectSettlementPayment({ ...base, client, actorRole: "customer" } as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rpcCalls).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.denial_reason).toBe("actor_role_invalid");
  });
});

describe("[2c] branch scope comes from the booking, not the request", () => {
  it("refuses staff without can_pos on the booking's hub", async () => {
    const { client, logs, rpcCalls } = makeClient({ hasBranchAccess: false });
    await expect(
      collectSettlementPayment({ ...base, client } as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rpcCalls).toHaveLength(0);
    expect(logs[0]!.denial_reason).toBe("branch_access_denied");
  });

  it("super_admin bypasses the branch check", async () => {
    const { client } = makeClient({ hasBranchAccess: false });
    const res = await collectSettlementPayment({
      ...base,
      client,
      actorRole: "super_admin",
    } as never);
    expect(res.ok).toBe(true);
  });

  it("never reads a branch from the caller's input", () => {
    const src = code(read("server/utils/rental-settlement-collect.ts"));
    // the hub is read off the loaded booking row, however it is narrowed
    expect(src).toMatch(/booking[^;]*\.hub_id/);
    expect(src).not.toMatch(/rawBranchId|input\.branchId/);
  });
});

describe("[2c] cash reference is generated, never accepted", () => {
  it("uses the Asia/Bangkok date, not UTC", () => {
    // 2026-11-02T18:30Z is already 2026-11-03 in Bangkok (UTC+7).
    const ref = buildCashPaymentReference(BOOKING, new Date("2026-11-02T18:30:00Z"));
    expect(ref).toBe("CASH-33333333-20261103");
    expect(ref).not.toContain("20261102");
  });

  it("IGNORES a client-supplied reference for cash", async () => {
    const { client, rpcCalls } = makeClient();
    await collectSettlementPayment({
      ...base,
      client,
      rawPaymentReference: "ATTACKER-SUPPLIED",
    } as never);
    expect(rpcCalls[0]!.p_payment_reference).toMatch(/^CASH-/);
    expect(rpcCalls[0]!.p_payment_reference).not.toContain("ATTACKER");
    expect(rpcCalls[0]!.p_slip_evidence_ref).toBeNull();
  });
});

describe("[2c] transfer demands evidence", () => {
  it("refuses a transfer with no reference", async () => {
    const { client, logs } = makeClient();
    await expect(
      collectSettlementPayment({
        ...base,
        client,
        rawPaymentMethod: "transfer",
        rawSlipEvidenceRef: "return-settlement/x/slip.png",
      } as never),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(logs[0]!.denial_reason).toBe("reference_required");
  });

  it("refuses a transfer with no slip", async () => {
    const { client, logs } = makeClient();
    await expect(
      collectSettlementPayment({
        ...base,
        client,
        rawPaymentMethod: "transfer",
        rawPaymentReference: "TRX-1",
      } as never),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(logs[0]!.denial_reason).toBe("slip_required");
  });

  it("passes both through when supplied", async () => {
    const { client, rpcCalls } = makeClient();
    await collectSettlementPayment({
      ...base,
      client,
      rawPaymentMethod: "transfer",
      rawPaymentReference: "TRX-1",
      rawSlipEvidenceRef: "return-settlement/x/slip.png",
    } as never);
    expect(rpcCalls[0]!.p_payment_reference).toBe("TRX-1");
    expect(rpcCalls[0]!.p_slip_evidence_ref).toBe("return-settlement/x/slip.png");
  });
});

describe("[2c] the actor reaches the RPC from the guard", () => {
  it("passes the session actor id and role verbatim", async () => {
    const { client, rpcCalls } = makeClient();
    await collectSettlementPayment({ ...base, client } as never);
    expect(rpcCalls[0]!.p_actor_user_id).toBe(STAFF);
    expect(rpcCalls[0]!.p_actor_role).toBe("staff");
  });

  it("the route takes them from requirePlatformAdmin, not the body", () => {
    const route = code(
      read("server/api/admin/rental-bookings/[id]/settlement-collect.post.ts"),
    );
    expect(route).toContain("requirePlatformAdmin");
    expect(route).toContain("actorUserId: userId");
    expect(route).toContain("actorRole: platformRole");
    expect(route).not.toContain("requireSuperAdmin");
    expect(route).not.toMatch(/body\.(actorRole|actorUserId)/);
  });
});

describe("[2c] §F logging", () => {
  it("success writes NO wrapper log — the RPC owns the allowed row", async () => {
    const { client, logs } = makeClient();
    await collectSettlementPayment({ ...base, client } as never);
    expect(logs).toHaveLength(0);
  });

  it("an RPC refusal writes exactly one denial row", async () => {
    const { client, logs } = makeClient({
      rpcError: "SETTLEMENT_PAYMENT_INSUFFICIENT: due 1300 paid 1000",
    });
    await expect(
      collectSettlementPayment({ ...base, client } as never),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.denial_reason).toBe("amount_insufficient");
  });

  it("carries no reference or slip into the decision log (NO-PII)", async () => {
    const { client, logs } = makeClient({ rpcError: "SETTLEMENT_PAYMENT_STATE_CONFLICT" });
    await expect(
      collectSettlementPayment({
        ...base,
        client,
        rawPaymentMethod: "transfer",
        rawPaymentReference: "TRX-SECRET",
        rawSlipEvidenceRef: "private/slip.png",
      } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(JSON.stringify(logs)).not.toContain("TRX-SECRET");
    expect(JSON.stringify(logs)).not.toContain("private/slip.png");
  });
});

describe("[2c] replay is customer-safe", () => {
  it("a second submit maps to 409, not a raw code", async () => {
    const { client } = makeClient({
      rpcError: "SETTLEMENT_PAYMENT_STATE_NOT_AWAITING: paid",
    });
    await expect(
      collectSettlementPayment({ ...base, client } as never),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: expect.not.stringContaining("SETTLEMENT_PAYMENT"),
    });
  });

  it("every mapped message is Thai, with no raw code leaking", () => {
    for (const raw of [
      "SETTLEMENT_PAYMENT_ACTOR_REQUIRED",
      "SETTLEMENT_PAYMENT_ACTOR_ROLE_INVALID",
      "SETTLEMENT_PAYMENT_EVIDENCE_REQUIRED",
      "SETTLEMENT_PAYMENT_SLIP_REQUIRED",
      "SETTLEMENT_PAYMENT_BOOKING_NOT_FOUND",
      "SETTLEMENT_PAYMENT_STATE_NOT_FOUND",
      "SETTLEMENT_PAYMENT_STATE_NOT_AWAITING",
      "SETTLEMENT_PAYMENT_INSUFFICIENT",
      "SETTLEMENT_PAYMENT_STATE_CONFLICT",
      "SETTLEMENT_HAS_PENDING_REVIEW_CHARGES",
    ]) {
      const m = collectRpcError(raw);
      expect(m.statusMessage).not.toMatch(/[A-Z_]{6,}/);
      expect(m.statusMessage).toMatch(/[฀-๿]/);
      // Glossary: no bare deposit vocabulary in settlement money copy.
      expect(m.statusMessage).not.toContain("มัดจำ");
      expect(m.denialReason).not.toBe("rpc_failed");
    }
  });
});

describe("[2c] §F vocabulary — the mock must not be laxer than the database", () => {
  /**
   * WHY THIS EXISTS. The mock client above happily accepts any `operation`
   * string, so 21 tests passed green on 2026-11-02 while the REAL database
   * rejected every denial insert: `settlement_payment_confirm_denied` was not
   * in `modl_operation_chk`, and logMoneyOpsDecision is best-effort, so the
   * rejection was swallowed. Refusals reached the user; the audit row did not
   * exist. Mock fidelity hid a §8.9 failure.
   *
   * This asserts the real constraint vocabulary covers every operation the
   * wrapper can emit, so a future denial code cannot ship without its
   * migration.
   */
  const wrapper = read("server/utils/rental-settlement-collect.ts");
  const migrations = ["supabase/migrations/149_collect_denial_log_vocabulary.sql"];
  const vocabulary = migrations.map(read).join("\n");

  it("every operation the wrapper emits exists in the DB vocabulary", () => {
    const emitted = [
      ...wrapper.matchAll(/operation:\s*"([a-z_]+)"/g),
    ].map((m) => m[1]!);
    expect(emitted.length).toBeGreaterThan(0);
    for (const op of emitted) {
      expect(vocabulary, `operation '${op}' has no migration vocabulary entry`).toContain(
        `'${op}'`,
      );
    }
  });

  it("the migration widens the constraint rather than replacing it", () => {
    // Every pre-existing value must survive — a DROP + ADD that forgets one
    // would silently break another caller's audit trail.
    for (const existing of [
      "company_cancel",
      "settlement_payment_confirm",
      "settlement_payment_waive",
      "settlement_payment_waive_denied",
      "settlement_discount_granted",
      "launch_booking_cancel",
      "auto_no_show_cancel",
    ]) {
      expect(vocabulary).toContain(`'${existing}'`);
    }
  });

  it("the SUCCESS operation is NOT emitted by the wrapper (the RPC owns it)", () => {
    expect(code(wrapper)).not.toMatch(/operation:\s*"settlement_payment_confirm"/);
  });
});

describe("[2c] the counter sees collect first", () => {
  const panel = read("app/components/admin/AdminRentalReturnSettlement.vue");

  it("collect is primary and waive is the quiet secondary", () => {
    expect(panel).toContain('label="รับชำระ"');
    const c = code(panel);
    expect(c.indexOf('label="รับชำระ"')).toBeLessThan(
      c.indexOf('label="ยกเว้นยอดชำระ"'),
    );
  });

  it("waive stays hidden from staff, collect does not", () => {
    const c = code(panel);
    const waiveBtn = c.slice(c.indexOf('label="ยกเว้นยอดชำระ"') - 300, c.indexOf('label="ยกเว้นยอดชำระ"'));
    expect(waiveBtn).toContain("isSuperAdmin");
    const collectBtn = c.slice(c.indexOf('label="รับชำระ"') - 200, c.indexOf('label="รับชำระ"'));
    expect(collectBtn).not.toContain("isSuperAdmin");
  });

  it("sends the server-held amount_due, not a typed-in figure", () => {
    expect(code(panel)).toContain("amountPaid: Number(paymentState.value?.amount_due ?? 0)");
  });
});
