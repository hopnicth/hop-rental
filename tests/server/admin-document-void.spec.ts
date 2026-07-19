/**
 * Tests: Document void + reissue (T3 walk 7, design §B)
 *
 * Covers:
 *  1. §F inversion (document_void): staff denial logged before 403
 *  2. Allowed row fail-closed before f_void_official_document; correction on failure
 *  3. Replay short-circuit (voided/replaced → alreadyVoided, no decision row)
 *  4. Reissue: fresh number via f_next_document_number, snapshot cloned,
 *     original_document_id linked, flip RPC invoked; idempotent
 *  5. Endpoint source contract (requirePlatformAdmin, never the super-admin guard)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  reissueOfficialDocument,
  voidOfficialDocument,
} from "../../server/utils/admin-document-void";

type Row = Record<string, unknown>;
const DOC = "71717171-7171-4171-8171-717171717171";

function issuedDoc(overrides: Row = {}): Row {
  return {
    id: DOC,
    document_type: "payment_refund",
    document_no: "BDR-202607-0001",
    status: "issued",
    branch_id: null,
    source_type: "payment_refund",
    source_id: "refund-1",
    original_document_id: null,
    tax_profile_id: null,
    customer_user_id: "user-1",
    walk_in_phone: null,
    company_id: null,
    subtotal: 500,
    vat_amount: 0,
    total_amount: 500,
    currency_code: "THB",
    template_key: "payment_refund_v1",
    template_version: 1,
    snapshot: { schema_version: 1 },
    issued_at: "2026-07-01T00:00:00.000Z",
    issued_by: "staff-1",
    ...overrides,
  };
}

function makeClient(opts: {
  doc?: Row | null;
  existingReplacement?: Row | null;
  rpcError?: string | null;
}) {
  const state = {
    decisionLogs: [] as Row[],
    rpcCalls: [] as { name: string; params: Row }[],
    inserts: [] as { table: string; payload: Row }[],
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
      if (table === "official_documents")
        return {
          select: () => ({
            eq: (col: string) => ({
              maybeSingle: async () => ({
                data:
                  col === "original_document_id"
                    ? (opts.existingReplacement ?? null)
                    : opts.doc === undefined
                      ? issuedDoc()
                      : opts.doc,
                error: null,
              }),
            }),
          }),
          insert: (p: Row) => ({
            select: () => ({
              single: async () => {
                state.inserts.push({ table, payload: p });
                state.order.push("insert-replacement");
                return { data: { ...p, id: "replacement-1" }, error: null };
              },
            }),
          }),
        };
      if (table === "document_events")
        return {
          insert: async (p: Row) => {
            state.inserts.push({ table, payload: p });
            return { error: null };
          },
        };
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string, params: Row) => {
      state.rpcCalls.push({ name, params });
      state.order.push(`rpc:${name}`);
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      if (name === "f_next_document_number")
        return { data: "BDR-202607-0002", error: null };
      return { data: { ok: true }, error: null };
    },
  };
  return { client, state };
}

function voidInput(client: unknown, overrides: Row = {}) {
  return {
    client: client as any,
    rawDocumentId: DOC,
    actorUserId: "super-1",
    actorRole: "super_admin",
    reason: "wrong customer on document",
    ...overrides,
  };
}

describe("voidOfficialDocument (§F inversion)", () => {
  it("logs a staff denial BEFORE the 403", async () => {
    const { client, state } = makeClient({});
    await expect(
      voidOfficialDocument(voidInput(client, { actorRole: "staff" }) as any),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(state.decisionLogs[0]).toMatchObject({
      operation: "document_void",
      decision: "denied",
      denial_reason: "not_super_admin",
      entity_id: DOC,
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("success: allowed row fail-closed BEFORE the void RPC (amount = total)", async () => {
    const { client, state } = makeClient({});
    const result = await voidOfficialDocument(voidInput(client) as any);
    expect(result).toMatchObject({ ok: true });
    expect(state.order).toEqual(["log:allowed", "rpc:f_void_official_document"]);
    expect(state.decisionLogs[0]).toMatchObject({
      decision: "allowed",
      entity_type: "official_document",
      amount: 500,
    });
  });

  it("draft is not voidable (denied row + 409); replay short-circuits with no row", async () => {
    const draft = makeClient({ doc: issuedDoc({ status: "draft" }) });
    await expect(
      voidOfficialDocument(voidInput(draft.client) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(draft.state.decisionLogs[0]).toMatchObject({
      denial_reason: "document_not_voidable",
    });

    const voided = makeClient({ doc: issuedDoc({ status: "voided" }) });
    const result = await voidOfficialDocument(voidInput(voided.client) as any);
    expect(result).toMatchObject({ alreadyVoided: true });
    expect(voided.state.decisionLogs).toHaveLength(0);
  });

  it("writes a correction row when the RPC fails after allow", async () => {
    const { client, state } = makeClient({ rpcError: "DOCUMENT_VOID_CONFLICT" });
    await expect(voidOfficialDocument(voidInput(client) as any)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(state.decisionLogs.map((r) => `${r.decision}:${r.denial_reason ?? ""}`)).toEqual(
      ["allowed:", "denied:rpc_failed_after_allow"],
    );
  });
});

describe("reissueOfficialDocument", () => {
  it("issues under a fresh number, links original, clones snapshot, flips original", async () => {
    const { client, state } = makeClient({ doc: issuedDoc({ status: "voided" }) });
    const result: any = await reissueOfficialDocument({
      client: client as any,
      rawOriginalDocumentId: DOC,
      actorUserId: "super-1",
    });
    expect(result.alreadyReissued).toBe(false);
    const numbering = state.rpcCalls.find((c) => c.name === "f_next_document_number")!;
    expect(numbering.params).toMatchObject({ p_prefix: "BDR", p_document_type: "payment_refund" });
    const replacement = state.inserts.find((i) => i.table === "official_documents")!.payload;
    expect(replacement).toMatchObject({
      document_no: "BDR-202607-0002",
      original_document_id: DOC,
      snapshot: { schema_version: 1 },
      idempotency_key: `reissue-${DOC}`,
    });
    const flip = state.rpcCalls.find((c) => c.name === "f_mark_official_document_replaced")!;
    expect(flip.params).toMatchObject({
      p_original_document_id: DOC,
      p_replacement_document_id: "replacement-1",
    });
  });

  it("refuses non-voided originals; idempotent when a replacement exists", async () => {
    const notVoided = makeClient({});
    await expect(
      reissueOfficialDocument({
        client: notVoided.client as any,
        rawOriginalDocumentId: DOC,
        actorUserId: "super-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const existing = makeClient({
      doc: issuedDoc({ status: "voided" }),
      existingReplacement: { id: "replacement-1", document_no: "BDR-202607-0002", status: "issued" },
    });
    const result: any = await reissueOfficialDocument({
      client: existing.client as any,
      rawOriginalDocumentId: DOC,
      actorUserId: "super-1",
    });
    expect(result.alreadyReissued).toBe(true);
    expect(existing.state.rpcCalls).toHaveLength(0);
  });
});

describe("void endpoint source contract", () => {
  it("uses requirePlatformAdmin (inversion) and passes ip/ua", () => {
    const src = readFileSync(
      resolve(process.cwd(), "server/api/admin/documents/[id]/void.post.ts"),
      "utf8",
    );
    expect(src).toContain("requirePlatformAdmin");
    expect(src).not.toContain("requireSuperAdmin");
    expect(src).toContain("getRequestIP");
    expect(src).toContain("voidOfficialDocument");
  });
});
