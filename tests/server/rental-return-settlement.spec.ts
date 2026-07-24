/**
 * Tests: T2 return settlement (wrapper + endpoint contracts)
 *
 * Covers:
 *  1. Byte-unchanged collision guard — rental-fulfillment.ts carries ZERO
 *     settlement references (T2 never edited the shared pickup path), and the
 *     wrapper composes via the public completeRentalBookingFulfillment only
 *  2. Scoped-mapping pin (§b addendum item 7): fulfillment refundAmount is
 *     CAPPED at deposit_paid_amount; refundNotes records settlement id + TRUE
 *     ledger refund; refundStatus refunded/not_applicable
 *  3. Legacy refund-proof row written (private bucket) only when refund > 0
 *  4. RPC business errors (SETTLEMENT_*) → 422; other errors → 500
 *  5. Endpoint pins — requirePlatformAdmin, private-bucket slip chain,
 *     penalty-line and discount-note validation
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

// ── 1. Collision guard pins ───────────────────────────────────────────────────

describe("byte-unchanged collision guard", () => {
  it("rental-fulfillment.ts contains no settlement reference (shared pickup path untouched by T2)", () => {
    const src = read("server/utils/rental-fulfillment.ts");
    expect(src).not.toContain("rental_booking_settlements");
    expect(src).not.toContain("f_settle_rental_booking_return");
    expect(src).not.toContain("settleRentalBookingReturn");
  });

  it("wrapper composes via completeRentalBookingFulfillment only (no fulfillment internals)", () => {
    const src = read("server/utils/rental-return-settlement.ts");
    expect(src).toContain("completeRentalBookingFulfillment");
    expect(src).not.toContain("assertRefundProof");
    expect(src).not.toContain("insertReturnDepositLog");
  });
});

// ── Runtime mocks for the wrapper ─────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  fulfillmentCalls: [] as any[],
  prereqCalls: [] as any[],
  prereqError: null as any,
  fulfillmentResult: { id: "booking-1", status: "returned" } as any,
}));

vi.mock("~~/server/utils/rental-fulfillment", () => ({
  assertRentalFulfillmentPrerequisites: async (options: any) => {
    mockState.prereqCalls.push(options);
    if (mockState.prereqError) throw mockState.prereqError;
    return {};
  },
  completeRentalBookingFulfillment: async (options: any) => {
    mockState.fulfillmentCalls.push(options);
    return mockState.fulfillmentResult;
  },
}));

vi.mock("h3", () => ({
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

const { settleRentalBookingReturn, settleReturnRpcError } = await import(
  "../../server/utils/rental-return-settlement"
);

function makeClient(opts: {
  rpcResult?: Record<string, unknown>;
  rpcError?: { message: string } | null;
  depositPaidAmount?: number;
  existingSettlement?: Record<string, unknown> | null;
  existingProof?: Record<string, unknown> | null;
} = {}) {
  const calls = {
    rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    proofInserts: [] as Array<Record<string, unknown>>,
    auditInserts: [] as Array<Record<string, unknown>>,
  };
  const client: any = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ fn, args });
      return opts.rpcError
        ? { data: null, error: opts.rpcError }
        : {
            data:
              opts.rpcResult ?? {
                settlement_id: "settle-1",
                held_total: 2000,
                penalty_total: 0,
                special_discount_amount: 0,
                settlement_applied_amount: 0,
                refund_amount: 2000,
                additional_collection_amount: 0,
              },
            error: null,
          };
    },
    from(table: string) {
      const chain: any = {
        insert: (payload: Record<string, unknown>) => {
          if (table === "rental_booking_deposit_proofs") {
            calls.proofInserts.push(payload);
          }
          if (table === "rental_booking_deposit_action_logs") {
            calls.auditInserts.push(payload);
          }
          return Promise.resolve({ error: null });
        },
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === "rental_booking_settlements") {
            return { data: opts.existingSettlement ?? null, error: null };
          }
          if (table === "rental_booking_deposit_proofs") {
            return { data: opts.existingProof ?? null, error: null };
          }
          return {
            data: { deposit_paid_amount: opts.depositPaidAmount ?? 1800 },
            error: null,
          };
        },
      };
      return chain;
    },
  };
  return { client, calls };
}

function baseInput(client: any) {
  return {
    adminClient: client,
    userId: "staff-1",
    platformRole: "staff",
    bookingId: "booking-1",
    penaltyLines: [],
    specialDiscountAmount: 0,
    specialDiscountNote: null,
    // [143 R-A] launch channel — empty by default; individual tests override.
    staffChargeLines: [],
    discountAmount: 0,
    discountNote: null,
    customerSignatureDataUrl: "data:image/png;base64,AAAA",
    customerSignaturePath: "return-settlement/booking-1/customer.png",
    staffSignaturePath: "return-settlement/booking-1/staff.png",
    slipStoragePath: "return-settlement/booking-1/slip.jpg",
    refundBankAccountRef: "KBank 123-4-56789-0",
    branchId: null,
    notes: null,
  };
}

beforeEach(() => {
  mockState.fulfillmentCalls = [];
  mockState.prereqCalls = [];
  mockState.prereqError = null;
});

// ── 2. Scoped-mapping pin ─────────────────────────────────────────────────────

describe("scoped mapping (§b addendum item 7)", () => {
  it("caps fulfillment refundAmount at deposit_paid_amount; notes carry the TRUE ledger refund", async () => {
    const { client } = makeClient({ depositPaidAmount: 1800 });
    const result = await settleRentalBookingReturn(baseInput(client));
    expect(result.settlement.refundAmount).toBe(2000); // ledger truth
    const call = mockState.fulfillmentCalls[0]!;
    expect(call.eventType).toBe("return");
    expect(call.payload.refundAmount).toBe(1800); // capped legacy figure
    expect(call.payload.refundStatus).toBe("refunded");
    expect(call.payload.refundNotes).toContain("settle-1");
    expect(call.payload.refundNotes).toContain("2000.00");
  });

  it("EVEN settlement → refundStatus not_applicable, refundAmount 0", async () => {
    const { client } = makeClient({
      rpcResult: {
        settlement_id: "settle-2",
        held_total: 2000,
        penalty_total: 2000,
        special_discount_amount: 0,
        settlement_applied_amount: 2000,
        refund_amount: 0,
        additional_collection_amount: 0,
      },
    });
    await settleRentalBookingReturn(baseInput(client));
    const call = mockState.fulfillmentCalls[0]!;
    expect(call.payload.refundAmount).toBe(0);
    expect(call.payload.refundStatus).toBe("not_applicable");
  });

  it("COLLECT settlement notes record the additional collection", async () => {
    const { client } = makeClient({
      rpcResult: {
        settlement_id: "settle-3",
        held_total: 2000,
        penalty_total: 2500,
        special_discount_amount: 0,
        settlement_applied_amount: 2500,
        refund_amount: 0,
        additional_collection_amount: 500,
      },
    });
    const result = await settleRentalBookingReturn(baseInput(client));
    expect(result.settlement.additionalCollectionAmount).toBe(500);
    const call = mockState.fulfillmentCalls[0]!;
    expect(call.payload.refundNotes).toContain("additional collection 500.00");
  });
});

// ── 3. Legacy proof bridge ────────────────────────────────────────────────────

describe("legacy refund-proof bridge", () => {
  it("writes ONE proof row (refund kind, PRIVATE bucket) when refund > 0", async () => {
    const { client, calls } = makeClient();
    await settleRentalBookingReturn(baseInput(client));
    expect(calls.proofInserts).toHaveLength(1);
    expect(calls.proofInserts[0]).toMatchObject({
      proof_kind: "refund",
      amount: 2000,
      storage_bucket: "rental-deposit-slips",
      payment_method: "bank_transfer",
    });
  });

  it("writes NO proof row when refund = 0", async () => {
    const { client, calls } = makeClient({
      rpcResult: {
        settlement_id: "settle-4",
        held_total: 2000,
        penalty_total: 2000,
        special_discount_amount: 0,
        settlement_applied_amount: 2000,
        refund_amount: 0,
        additional_collection_amount: 0,
      },
    });
    await settleRentalBookingReturn(baseInput(client));
    expect(calls.proofInserts).toHaveLength(0);
  });
});

// ── 4. Error mapping ──────────────────────────────────────────────────────────

describe("RPC error mapping", () => {
  it("SETTLEMENT_* business errors → 422, machine code carried in data.settleRpcCode", async () => {
    const { client } = makeClient({
      rpcError: { message: "SETTLEMENT_BOOKING_NOT_PICKED_UP" },
    });
    await expect(settleRentalBookingReturn(baseInput(client))).rejects.toMatchObject({
      statusCode: 422,
      data: { settleRpcCode: "SETTLEMENT_BOOKING_NOT_PICKED_UP" },
    });
    expect(mockState.fulfillmentCalls).toHaveLength(0);
  });

  it("infrastructure errors → 500, fulfillment never reached", async () => {
    const { client } = makeClient({ rpcError: { message: "connection reset" } });
    await expect(settleRentalBookingReturn(baseInput(client))).rejects.toMatchObject({
      statusCode: 500,
      data: { settleRpcCode: "connection reset" },
    });
    expect(mockState.fulfillmentCalls).toHaveLength(0);
  });

  // [143 R-A] Every new launch RAISE → approved HTTP status. The util surfaces
  // the code through settleReturnRpcError; refusals never reach fulfillment.
  const REFUSALS: Array<[string, number]> = [
    ["PENALTY_LINES_NOT_ACCEPTED_AT_LAUNCH", 409],
    ["STAFF_CHARGE_LINES_NOT_ACCEPTED_IN_DEPOSIT_REGIME", 409],
    ["LAUNCH_DISCOUNT_NOT_ACCEPTED_IN_DEPOSIT_REGIME", 409],
    ["STAFF_CHARGE_LINE_INVALID", 422],
    ["CHARGE_TYPE_DISABLED_FOR_LAUNCH", 422],
    ["CHARGE_TYPE_NOT_SETTABLE", 422],
    ["CHARGE_TYPE_UNKNOWN", 422],
    ["STAFF_CHARGE_AMOUNT_INVALID", 422],
    ["STAFF_CHARGE_EXCEEDS_CAP", 422],
    ["DISCOUNT_NEGATIVE", 422],
    ["DISCOUNT_NOTE_REQUIRED", 422],
    ["DISCOUNT_WITHOUT_RENTAL_BASE", 422],
    ["DISCOUNT_EXCEEDS_MAX", 422],
    ["DISCOUNT_REQUIRES_SUPER_ADMIN", 403],
    ["SETTLEMENT_ACTOR_NOT_FOUND", 422],
  ];
  it.each(REFUSALS)(
    "refusal %s → HTTP %i via the util, fulfillment never reached",
    async (code, status) => {
      const { client } = makeClient({ rpcError: { message: `${code}: detail` } });
      await expect(
        settleRentalBookingReturn(baseInput(client)),
      ).rejects.toMatchObject({
        statusCode: status,
        data: { settleRpcCode: `${code}: detail` },
      });
      expect(mockState.fulfillmentCalls).toHaveLength(0);
    },
  );
});

// ── 4b. settleReturnRpcError pure map (the endpoint's HTTP + Thai mapping) ────

describe("settleReturnRpcError (HTTP + Thai map)", () => {
  const CASES: Array<[string, number]> = [
    ["PENALTY_LINES_NOT_ACCEPTED_AT_LAUNCH", 409],
    ["STAFF_CHARGE_LINES_NOT_ACCEPTED_IN_DEPOSIT_REGIME", 409],
    ["LAUNCH_DISCOUNT_NOT_ACCEPTED_IN_DEPOSIT_REGIME", 409],
    ["STAFF_CHARGE_LINES_INVALID", 422],
    ["STAFF_CHARGE_LINE_INVALID", 422],
    ["CHARGE_TYPE_DISABLED_FOR_LAUNCH", 422],
    ["CHARGE_TYPE_NOT_SETTABLE", 422],
    ["CHARGE_TYPE_UNKNOWN", 422],
    ["STAFF_CHARGE_AMOUNT_INVALID", 422],
    ["STAFF_CHARGE_EXCEEDS_CAP", 422],
    ["DISCOUNT_NEGATIVE", 422],
    ["DISCOUNT_NOTE_REQUIRED", 422],
    ["DISCOUNT_WITHOUT_RENTAL_BASE", 422],
    ["DISCOUNT_EXCEEDS_MAX", 422],
    ["DISCOUNT_REQUIRES_SUPER_ADMIN", 403],
    ["SETTLEMENT_ACTOR_REQUIRED", 422],
    ["SETTLEMENT_ACTOR_NOT_FOUND", 422],
  ];
  it.each(CASES)("%s → %i with a non-empty Thai message", (code, status) => {
    const mapped = settleReturnRpcError(code);
    expect(mapped.statusCode).toBe(status);
    expect(mapped.statusMessage.length).toBeGreaterThan(0);
  });

  it("prefixed but unlisted codes fall back to business 422 (not 500)", () => {
    expect(settleReturnRpcError("SETTLEMENT_ALREADY_EXISTS").statusCode).toBe(422);
    expect(settleReturnRpcError("DISCOUNT_SOMETHING_NEW").statusCode).toBe(422);
  });

  it("unknown / infrastructure codes → 500", () => {
    expect(settleReturnRpcError("connection reset").statusCode).toBe(500);
    expect(settleReturnRpcError("timeout").statusCode).toBe(500);
  });

  it("money copy never contains the bare deposit word มัดจำ (glossary rule)", () => {
    for (const [code] of CASES) {
      expect(settleReturnRpcError(code).statusMessage).not.toContain("มัดจำ");
    }
  });
});

// ── 4c. Happy path — typed staff-charge lines + discount pass through ─────────

describe("launch staff-charge + discount passthrough (143 R-A)", () => {
  it("forwards p_staff_charge_lines / p_discount_amount / p_discount_note and returns the 3 new keys", async () => {
    const { client, calls } = makeClient({
      rpcResult: {
        settlement_id: "settle-launch",
        held_total: 0,
        penalty_total: 0,
        special_discount_amount: 0,
        settlement_applied_amount: 0,
        refund_amount: 0,
        additional_collection_amount: 0,
        staff_charge_total: 450,
        discount_amount: 50,
        rental_base: 500,
      },
    });
    const input = {
      ...baseInput(client),
      staffChargeLines: [
        { charge_type: "taxable_service_charge", amount: 450, note: "cleaning" },
      ],
      discountAmount: 50,
      discountNote: "goodwill",
    };
    const result = await settleRentalBookingReturn(input);

    // Return-shape +3 keys surfaced from the RPC result.
    expect(result.settlement.staffChargeTotal).toBe(450);
    expect(result.settlement.discountAmount).toBe(50);
    expect(result.settlement.rentalBase).toBe(500);

    // The 13-arg call carried the launch params verbatim (snake_case keys).
    const rpcCall = calls.rpcs.find(
      (c) => c.fn === "f_settle_rental_booking_return",
    )!;
    expect(rpcCall.args.p_staff_charge_lines).toEqual([
      { charge_type: "taxable_service_charge", amount: 450, note: "cleaning" },
    ]);
    expect(rpcCall.args.p_discount_amount).toBe(50);
    expect(rpcCall.args.p_discount_note).toBe("goodwill");
    // Fulfillment still completes on the happy path.
    expect(mockState.fulfillmentCalls).toHaveLength(1);
  });
});

// ── 5. Endpoint pins ──────────────────────────────────────────────────────────

describe("endpoint pins", () => {
  const postSrc = read(
    "server/api/admin/rental-bookings/[id]/return-settlement.post.ts",
  );
  const getSrc = read(
    "server/api/admin/rental-bookings/[id]/return-settlement.get.ts",
  );

  it("both endpoints use requirePlatformAdmin", () => {
    expect(postSrc).toContain("requirePlatformAdmin");
    expect(getSrc).toContain("requirePlatformAdmin");
  });

  it("slip + signatures go to the PRIVATE rental-deposit-slips bucket, magic-byte sniffed", () => {
    expect(postSrc).toContain("RENTAL_DEPOSIT_SLIP_BUCKET");
    expect(postSrc).toContain("sniffRentalDepositSlipMime");
    expect(postSrc).not.toContain("catalog-media");
  });

  it("discount note enforced; penalty lines shape-validated", () => {
    expect(postSrc).toContain("SETTLEMENT_DISCOUNT_NOTE_REQUIRED");
    expect(postSrc).toContain("SETTLEMENT_PENALTY_LINES_INVALID");
  });

  it("[143 R-A] parses the launch multipart fields and forwards them", () => {
    expect(postSrc).toContain("staffChargeLines");
    expect(postSrc).toContain("discountAmount");
    expect(postSrc).toContain("discountNote");
    // Snake-case charge_type key preserved for the RPC.
    expect(postSrc).toContain("charge_type");
  });

  it("[143 R-A] maps RPC RAISEs via settleReturnRpcError (HTTP + Thai)", () => {
    expect(postSrc).toContain("settleReturnRpcError");
  });

  it("[143 R-A] does NOT duplicate the RPC per-line cap (RPC is sole money authority)", () => {
    // The 5,000 cap + discount tiers live ONLY in the RPC; the endpoint never
    // re-checks them (shape/parse only).
    expect(postSrc).not.toContain("5000");
    expect(postSrc).not.toContain("0.20");
    expect(postSrc).not.toContain("0.50");
  });
});

// ── 8. POS v1 settle path disabled for launch (CHiP ruling §4, option ก) ──────

describe("POS v1 return/settle path — launch gate", () => {
  const posSrc = read("app/pages/admin/pos.vue");

  it("declares the launch settle-disabled flag", () => {
    expect(posSrc).toContain("POS_LAUNCH_SETTLE_DISABLED");
  });

  it("does NOT rewire POS to the 13-arg settle endpoint (T5 scope)", () => {
    expect(posSrc).not.toContain("return-settlement");
    expect(posSrc).not.toContain("staffChargeLines");
    expect(posSrc).not.toContain("f_settle_rental_booking_return");
  });

  it("gates the Confirm Return button behind the launch flag", () => {
    // The return button and the deposit-refund block both hide at launch.
    expect(posSrc).toContain("!POS_LAUNCH_SETTLE_DISABLED");
    // A Thai notice directs staff to the main settle page.
    expect(posSrc).toContain("หน้าจัดการการเช่า");
  });
});

// ── 6. Fix 1: pre-validation ordering ────────────────────────────────────────

describe("prerequisites probe (fix 1)", () => {
  it("runs BEFORE the RPC with a refund-0 probe payload", async () => {
    const { client, calls } = makeClient();
    await settleRentalBookingReturn(baseInput(client));
    expect(mockState.prereqCalls).toHaveLength(1);
    expect(mockState.prereqCalls[0].payload.refundAmount).toBe(0);
    expect(mockState.prereqCalls[0].payload.refundStatus).toBe("not_applicable");
    expect(calls.rpcs).toHaveLength(1);
  });

  it("probe failure (e.g. missing checklist / wrong status) → RPC NEVER fires, nothing committed", async () => {
    mockState.prereqError = Object.assign(
      new Error("return requires a completed checklist"),
      { statusCode: 422 },
    );
    const { client, calls } = makeClient();
    await expect(settleRentalBookingReturn(baseInput(client))).rejects.toMatchObject(
      { statusCode: 422 },
    );
    expect(calls.rpcs).toHaveLength(0);
    expect(calls.proofInserts).toHaveLength(0);
    expect(mockState.fulfillmentCalls).toHaveLength(0);
  });

  it("returned booking never reaches resume — probe 422s on status first (fix-2 scope pin)", async () => {
    mockState.prereqError = Object.assign(
      new Error("return requires a picked_up booking"),
      { statusCode: 422 },
    );
    const { client, calls } = makeClient({
      existingSettlement: { id: "settle-old", penalty_lines: [], special_discount_amount: 0, refund_amount: 2000 },
    });
    await expect(settleRentalBookingReturn(baseInput(client))).rejects.toMatchObject(
      { statusCode: 422, message: "return requires a picked_up booking" },
    );
    expect(calls.rpcs).toHaveLength(0);
    expect(mockState.fulfillmentCalls).toHaveLength(0);
  });
});

// ── 7. Fix 2: crash-safe resume ──────────────────────────────────────────────

const STORED = {
  id: "settle-1",
  penalty_lines: [{ amount: 300, note: "scratch" }],
  special_discount_amount: 100,
  settlement_applied_amount: 200,
  refund_amount: 1800,
  additional_collection_amount: 0,
  held_total: 2000,
  penalty_total: 300,
  slip_evidence_ref: "return-settlement/booking-1/slip.jpg",
};

function resumeInput(client: any) {
  return {
    ...baseInput(client),
    penaltyLines: [{ amount: 300, note: "scratch" }],
    specialDiscountAmount: 100,
    specialDiscountNote: "goodwill",
  };
}

describe("crash-safe resume (fix 2)", () => {
  it("matching figures → skips RPC, completes fulfillment, logs the resume actor", async () => {
    const { client, calls } = makeClient({ existingSettlement: STORED });
    const result = await settleRentalBookingReturn(resumeInput(client));
    expect(calls.rpcs).toHaveLength(0); // no second settlement
    expect(mockState.fulfillmentCalls).toHaveLength(1);
    expect(result.settlement.settlementId).toBe("settle-1");
    expect(result.settlement.refundAmount).toBe(1800);
    expect(calls.auditInserts).toHaveLength(1);
    expect(calls.auditInserts[0]).toMatchObject({
      action: "return_refund", // CHECK-locked vocabulary; resume marker in summary
      staff_user_id: "staff-1",
    });
    expect(calls.auditInserts[0].change_summary).toContain("resumed");
  });

  it("figure mismatch → 409 SETTLEMENT_PENDING_MISMATCH carrying the stored figures; nothing runs", async () => {
    const { client, calls } = makeClient({ existingSettlement: STORED });
    const input = { ...resumeInput(client), specialDiscountAmount: 0 };
    await expect(settleRentalBookingReturn(input)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "SETTLEMENT_PENDING_MISMATCH",
      data: { stored: { settlementId: "settle-1", refundAmount: 1800 } },
    });
    expect(calls.rpcs).toHaveLength(0);
    expect(mockState.fulfillmentCalls).toHaveLength(0);
    expect(calls.auditInserts).toHaveLength(0);
  });

  it("proof-row idempotence: existing proof for the settlement → no duplicate insert", async () => {
    const { client, calls } = makeClient({
      existingSettlement: STORED,
      existingProof: { id: "proof-1" },
    });
    await settleRentalBookingReturn(resumeInput(client));
    expect(calls.proofInserts).toHaveLength(0);
  });

  it("missing proof on resume → inserted once from the stored slip ref", async () => {
    const { client, calls } = makeClient({ existingSettlement: STORED });
    await settleRentalBookingReturn(resumeInput(client));
    expect(calls.proofInserts).toHaveLength(1);
    expect(calls.proofInserts[0]).toMatchObject({
      amount: 1800,
      storage_path: "return-settlement/booking-1/slip.jpg",
    });
  });
});
