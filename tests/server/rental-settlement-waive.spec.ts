/**
 * Tests: settlement-payment WAIVE (§8.9 half 2 — merge-blocker release)
 *
 * Covers:
 *  1. THE BLOCKER PROOF — a §F denial row is written to
 *     money_ops_decision_logs on EVERY refusal (wrapper guards + every RPC
 *     RAISE), with operation 'settlement_payment_waive_denied' /
 *     decision 'denied', BEFORE the error is returned
 *  2. No double success log — on success the wrapper writes NOTHING (the
 *     in-RPC row, 141:86-89, owns the success path)
 *  3. Non-super_admin refusal is audited and 403s without touching the RPC
 *  4. Error -> HTTP map + Thai copy; NO-PII (free-text reason never logged)
 *  5. Endpoint pins — the §F inversion (requirePlatformAdmin, NOT
 *     requireSuperAdmin) and no client-supplied role
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

vi.mock("h3", () => ({
  createError: (opts: {
    statusCode?: number;
    statusMessage?: string;
    data?: unknown;
  }) => Object.assign(new Error(opts.statusMessage), opts),
}));

const { waiveSettlementPayment, waiveRpcError } = await import(
  "../../server/utils/rental-settlement-waive"
);

const BOOKING_ID = "11111111-2222-4333-8444-555555555555";

function makeClient(
  opts: {
    rpcError?: { message: string } | null;
    rpcResult?: Record<string, unknown>;
    amountDue?: number;
    logError?: { message: string } | null;
  } = {},
) {
  const calls = {
    rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    modlInserts: [] as Array<Record<string, unknown>>,
  };
  const client: any = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ fn, args });
      return opts.rpcError
        ? { data: null, error: opts.rpcError }
        : { data: opts.rpcResult ?? { ok: true, state: "waived" }, error: null };
    },
    from(table: string) {
      const chain: any = {
        insert: (payload: Record<string, unknown>) => {
          if (table === "money_ops_decision_logs") calls.modlInserts.push(payload);
          return Promise.resolve({ error: opts.logError ?? null });
        },
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: { amount_due: opts.amountDue ?? 1500 },
          error: null,
        }),
      };
      return chain;
    },
  };
  return { client, calls };
}

function baseInput(client: any, over: Record<string, unknown> = {}) {
  return {
    client,
    rawBookingId: BOOKING_ID,
    actorUserId: "super-1",
    actorRole: "super_admin",
    reason: "ลูกค้าเป็นพันธมิตร ตกลงยกเว้นค่าใช้จ่าย",
    ipAddress: null,
    userAgent: null,
    ...over,
  } as any;
}

beforeEach(() => vi.clearAllMocks());

// ── 1. THE BLOCKER PROOF ─────────────────────────────────────────────────────

describe("§F denial log (THE §8.9 half-2 release condition)", () => {
  it("non-super_admin: writes the denial row THEN 403 — RPC never called", async () => {
    const { client, calls } = makeClient();
    await expect(
      waiveSettlementPayment(baseInput(client, { actorRole: "staff" })),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(calls.modlInserts).toHaveLength(1);
    expect(calls.modlInserts[0]).toMatchObject({
      operation: "settlement_payment_waive_denied",
      decision: "denied",
      denial_reason: "not_super_admin",
      actor_user_id: "super-1",
      actor_role: "staff",
      entity_type: "rental_booking",
      entity_id: BOOKING_ID,
    });
    // The refusal never reached the money writer.
    expect(calls.rpcs).toHaveLength(0);
  });

  it("missing reason: denial row + 422, RPC never called", async () => {
    const { client, calls } = makeClient();
    await expect(
      waiveSettlementPayment(baseInput(client, { reason: "   " })),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(calls.modlInserts[0]).toMatchObject({
      operation: "settlement_payment_waive_denied",
      decision: "denied",
      denial_reason: "reason_required",
    });
    expect(calls.rpcs).toHaveLength(0);
  });

  it("malformed booking id: Decision-G purity — entity id/type NOT logged", async () => {
    const { client, calls } = makeClient();
    await expect(
      waiveSettlementPayment(baseInput(client, { rawBookingId: "not-a-uuid" })),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(calls.modlInserts[0]).toMatchObject({
      denial_reason: "malformed_booking_id",
      entity_type: null,
      entity_id: null,
    });
  });

  // Every RPC RAISE must be audited — this is what 141 removed from SQL.
  const RAISES: Array<[string, number, string]> = [
    ["SETTLEMENT_WAIVE_SUPER_ADMIN_ONLY", 403, "not_super_admin"],
    ["SETTLEMENT_WAIVE_REASON_REQUIRED", 422, "reason_required"],
    ["SETTLEMENT_WAIVE_BOOKING_NOT_FOUND", 404, "booking_not_found"],
    ["SETTLEMENT_WAIVE_STATE_NOT_FOUND", 404, "state_not_found"],
    ["SETTLEMENT_WAIVE_STATE_NOT_AWAITING", 409, "state_not_awaiting"],
    ["SETTLEMENT_WAIVE_STATE_CONFLICT", 409, "state_conflict"],
    ["SETTLEMENT_WAIVE_ACTOR_REQUIRED", 422, "actor_required"],
  ];
  it.each(RAISES)(
    "RPC RAISE %s -> HTTP %i, denial row '%s'",
    async (raise, status, denialReason) => {
      const { client, calls } = makeClient({
        rpcError: { message: `${raise}: detail` },
      });
      await expect(waiveSettlementPayment(baseInput(client))).rejects.toMatchObject(
        { statusCode: status },
      );
      expect(calls.modlInserts).toHaveLength(1);
      expect(calls.modlInserts[0]).toMatchObject({
        operation: "settlement_payment_waive_denied",
        decision: "denied",
        denial_reason: denialReason,
        entity_id: BOOKING_ID,
      });
    },
  );

  it("unknown RPC error -> 500 + rpc_failed denial row", async () => {
    const { client, calls } = makeClient({
      rpcError: { message: "connection reset" },
    });
    await expect(waiveSettlementPayment(baseInput(client))).rejects.toMatchObject(
      { statusCode: 500 },
    );
    expect(calls.modlInserts[0]).toMatchObject({ denial_reason: "rpc_failed" });
  });

  it("a failed denial-log write must NOT block the refusal (best-effort)", async () => {
    const { client } = makeClient({ logError: { message: "modl down" } });
    await expect(
      waiveSettlementPayment(baseInput(client, { actorRole: "staff" })),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("denial rows carry the money at stake once known", async () => {
    const { client, calls } = makeClient({
      rpcError: { message: "SETTLEMENT_WAIVE_STATE_NOT_AWAITING: paid" },
      amountDue: 2500,
    });
    await expect(waiveSettlementPayment(baseInput(client))).rejects.toThrow();
    expect(calls.modlInserts[0]).toMatchObject({ amount: 2500 });
  });
});

// ── 2. Success path — no double log ──────────────────────────────────────────

describe("success path", () => {
  it("waives via the RPC and writes NO wrapper log (in-RPC row owns success)", async () => {
    const { client, calls } = makeClient();
    const result = await waiveSettlementPayment(baseInput(client));

    expect(result).toEqual({ ok: true, state: "waived" });
    // THE no-double-log assertion.
    expect(calls.modlInserts).toHaveLength(0);

    expect(calls.rpcs).toHaveLength(1);
    expect(calls.rpcs[0]!.fn).toBe("f_waive_settlement_payment");
    expect(calls.rpcs[0]!.args).toMatchObject({
      p_booking_id: BOOKING_ID,
      p_actor_user_id: "super-1",
      p_actor_role: "super_admin",
    });
    // Reason is trimmed and forwarded to the domain row via the RPC.
    expect(String(calls.rpcs[0]!.args.p_reason).trim()).toBe(
      String(calls.rpcs[0]!.args.p_reason),
    );
  });
});

// ── 3. NO-PII invariant ──────────────────────────────────────────────────────

describe("NO-PII invariant (mig 132 table comment)", () => {
  it("the staff free-text reason NEVER appears in any decision-log row", async () => {
    const secretReason = "ลูกค้าชื่อสมชาย โทร 0812345678 ตกลงยกเว้น";
    const { client, calls } = makeClient({
      rpcError: { message: "SETTLEMENT_WAIVE_STATE_CONFLICT" },
    });
    await expect(
      waiveSettlementPayment(baseInput(client, { reason: secretReason })),
    ).rejects.toThrow();
    const serialized = JSON.stringify(calls.modlInserts);
    expect(serialized).not.toContain(secretReason);
    expect(serialized).not.toContain("0812345678");
  });
});

// ── 4. Error map ─────────────────────────────────────────────────────────────

describe("waiveRpcError map", () => {
  it("keys on the leading RAISE token (Postgres appends a detail suffix)", () => {
    expect(waiveRpcError("SETTLEMENT_WAIVE_STATE_NOT_AWAITING: paid").statusCode).toBe(409);
    expect(waiveRpcError("SETTLEMENT_WAIVE_SUPER_ADMIN_ONLY").statusCode).toBe(403);
  });

  it("unknown codes fall back to 500 / rpc_failed", () => {
    expect(waiveRpcError("boom")).toMatchObject({
      statusCode: 500,
      denialReason: "rpc_failed",
    });
  });

  it("every message is non-empty Thai without the bare deposit word มัดจำ", () => {
    for (const code of [
      "SETTLEMENT_WAIVE_SUPER_ADMIN_ONLY",
      "SETTLEMENT_WAIVE_REASON_REQUIRED",
      "SETTLEMENT_WAIVE_BOOKING_NOT_FOUND",
      "SETTLEMENT_WAIVE_STATE_NOT_FOUND",
      "SETTLEMENT_WAIVE_STATE_NOT_AWAITING",
      "SETTLEMENT_WAIVE_STATE_CONFLICT",
      "SETTLEMENT_WAIVE_ACTOR_REQUIRED",
    ]) {
      const m = waiveRpcError(code);
      expect(m.statusMessage.length).toBeGreaterThan(0);
      expect(m.statusMessage).not.toContain("มัดจำ");
    }
  });
});

// ── 5. Endpoint + migration pins ─────────────────────────────────────────────

describe("endpoint pins", () => {
  const src = read(
    "server/api/admin/rental-bookings/[id]/settlement-waive.post.ts",
  );

  it("uses the §F inversion: requirePlatformAdmin, NOT requireSuperAdmin", () => {
    // requireSuperAdmin would throw BEFORE the denial log — the exact silent
    // gap §8.9 exists to close. This pin protects the blocker from regression.
    // Matched on the CALL/import, not prose (the header explains the choice).
    expect(src).toContain("requirePlatformAdmin(event)");
    expect(src).not.toContain("requireSuperAdmin(event)");
    expect(src).not.toContain("import { requireSuperAdmin");
  });

  it("takes the actor role from the guard, never from the request body", () => {
    expect(src).toContain("actorRole: platformRole");
    expect(src).not.toContain("body.role");
    expect(src).not.toContain("body.actorRole");
  });

  it("reason is the only body field read", () => {
    expect(src).toContain("body.reason");
  });
});

describe("migration 144 pins", () => {
  const sql = read("supabase/migrations/144_waive_denial_log_vocabulary.sql");

  it("adds the wrapper denial value and keeps the in-RPC success value", () => {
    expect(sql).toContain("'settlement_payment_waive_denied'");
    expect(sql).toContain("'settlement_payment_waive'");
  });

  it("uses a plain DROP so a wrong constraint name fails loudly", () => {
    expect(sql).toContain("DROP CONSTRAINT modl_operation_chk");
    expect(sql).not.toContain("DROP CONSTRAINT IF EXISTS modl_operation_chk");
  });
});
