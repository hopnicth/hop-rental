/**
 * Tests: Super Admin KYC queue + decision endpoints (T1a)
 *   GET  /api/admin/kyc/queue
 *   GET  /api/admin/kyc/profiles/:id
 *   POST /api/admin/kyc/profiles/:id/verify
 *   POST /api/admin/kyc/profiles/:id/reject
 *   POST /api/admin/kyc/profiles/:id/revoke
 *
 * Covers:
 *  1. Auth-inversion pins (decisions.md §a addendum item 2): every endpoint
 *     uses requirePlatformAdmin + an explicit super_admin check and NEVER
 *     requireSuperAdmin, and logs the denial via logKycDocumentAccess BEFORE
 *     throwing (style: kyc-document-download-api.spec.ts:553)
 *  2. Queue behavior — staff denied with audit row; pending-only select;
 *     minimal fields (no identity_hash / identity_last4 / phone); §a
 *     completeness flag per row
 *  3. Verify caller — §a completeness 422 (KYC_DOCUMENTS_INCOMPLETE) before
 *     the RPC; RPC invoked with actor snapshot and NO validity period param
 *  4. Reject caller — invalid reason 422; RPC invoked with reason
 *  5. Revoke caller — invalid reason 422; RPC invoked with reason
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const ENDPOINTS = [
  "server/api/admin/kyc/queue.get.ts",
  "server/api/admin/kyc/profiles/[id]/index.get.ts",
  "server/api/admin/kyc/profiles/[id]/verify.post.ts",
  "server/api/admin/kyc/profiles/[id]/reject.post.ts",
  "server/api/admin/kyc/profiles/[id]/revoke.post.ts",
];

describe("auth inversion pins (§a addendum item 2)", () => {
  for (const file of ENDPOINTS) {
    it(`${file} uses requirePlatformAdmin (explicit role check), never requireSuperAdmin`, () => {
      const src = read(file);
      expect(src).toContain("requirePlatformAdmin");
      expect(src).not.toContain("requireSuperAdmin");
      expect(src).toContain('platformRole !== "super_admin"');
      // Denial is logged before the throw.
      const logIdx = src.indexOf("logKycDocumentAccess");
      const throwIdx = src.indexOf("Super admin access required");
      expect(logIdx).toBeGreaterThan(-1);
      expect(throwIdx).toBeGreaterThan(logIdx);
    });
  }
});

// ── Runtime mocks ─────────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  adminError: null as any,
  platformRole: "super_admin" as string,
  client: null as any,
  params: {} as Record<string, string>,
  body: {} as any,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: any) => handler,
  readBody: async () => mockState.body,
  getRouterParam: (_e: any, name: string) => mockState.params[name],
  getHeader: () => undefined,
  createError: (opts: { statusCode?: number; statusMessage?: string; data?: unknown }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => {
    if (mockState.adminError) throw mockState.adminError;
    return {
      adminClient: mockState.client,
      userId: "admin-user-1",
      platformRole: mockState.platformRole,
    };
  },
}));

const queueGet = (await import("../../server/api/admin/kyc/queue.get")).default;
const verifyPost = (
  await import("../../server/api/admin/kyc/profiles/[id]/verify.post")
).default;
const rejectPost = (
  await import("../../server/api/admin/kyc/profiles/[id]/reject.post")
).default;
const revokePost = (
  await import("../../server/api/admin/kyc/profiles/[id]/revoke.post")
).default;

const PROFILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT = { node: { req: { socket: { remoteAddress: "10.0.0.9" } } } } as any;

function makeClient(opts: {
  pending?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  profile?: Record<string, unknown> | null;
  rpcError?: { message: string } | null;
} = {}) {
  const calls = {
    logInserts: [] as Array<Record<string, unknown>>,
    rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    selects: [] as Array<{ table: string; columns: string; eq: Array<[string, unknown]> }>,
  };
  const client: any = {
    from(table: string) {
      if (table === "kyc_document_access_log") {
        return { insert: async (p: Record<string, unknown>) => { calls.logInserts.push(p); return { error: null }; } };
      }
      const rec: { table: string; columns: string; eq: Array<[string, unknown]> } =
        { table, columns: "", eq: [] };
      calls.selects.push(rec);
      const chain: any = {
        select: (cols: string) => { rec.columns = cols; return chain; },
        eq: (c: string, v: unknown) => { rec.eq.push([c, v]); return chain; },
        in: () => chain,
        order: () => chain,
        maybeSingle: async () => {
          if (table === "kyc_profiles") return { data: opts.profile ?? null, error: null };
          if (table === "users") return { data: { full_name: "Admin Name" }, error: null };
          return { data: null, error: null };
        },
        then: (resolvefn: (v: unknown) => unknown) => {
          let data: unknown = [];
          if (table === "kyc_profiles") data = opts.pending ?? [];
          if (table === "kyc_documents") data = opts.documents ?? [];
          if (table === "users") data = [];
          return Promise.resolve({ data, error: null }).then(resolvefn);
        },
      };
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ fn, args });
      return opts.rpcError
        ? { data: null, error: opts.rpcError }
        : { data: { decision_id: "dec-1", outcome: "x" }, error: null };
    },
  };
  return { client, calls };
}

beforeEach(() => {
  mockState.adminError = null;
  mockState.platformRole = "super_admin";
  mockState.params = { id: PROFILE_ID };
  mockState.body = {};
});

describe("GET /api/admin/kyc/queue", () => {
  it("staff is denied 403 AND the denial is audit-logged (action=list_pending)", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.platformRole = "staff";
    await expect(queueGet(EVENT)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls.logInserts).toHaveLength(1);
    expect(calls.logInserts[0]).toMatchObject({
      action: "list_pending",
      result: "denied",
      reason: "not_super_admin",
      actor_role: "staff",
    });
  });

  it("selects pending-only, returns minimal fields with §a completeness flag", async () => {
    const { client, calls } = makeClient({
      pending: [
        {
          id: PROFILE_ID,
          user_id: null,
          holder_name: "สมชาย ใจดี",
          customer_type: "company",
          identity_type: "juristic_id",
          branch_id: null,
          created_at: "2026-07-14T00:00:00Z",
        },
      ],
      documents: [{ kyc_profile_id: PROFILE_ID, document_type: "company_cert" }],
    });
    mockState.client = client;
    const res = await queueGet(EVENT);
    // status='pending' filter applied
    const profileSelect = calls.selects.find((s) => s.table === "kyc_profiles")!;
    expect(profileSelect.eq).toContainEqual(["status", "pending"]);
    // minimal fields — never identity columns or phone
    expect(profileSelect.columns).not.toContain("identity_hash");
    expect(profileSelect.columns).not.toContain("identity_last4");
    expect(profileSelect.columns).not.toContain("walk_in_phone");
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      displayName: "สมชาย ใจดี",
      complete: false,
      missingDocumentTypes: ["vat_certificate"],
    });
    expect(JSON.stringify(res)).not.toContain("identity");
  });
});

describe("POST /api/admin/kyc/profiles/:id/verify", () => {
  const validBody = {
    reviewedDocumentIds: ["doc-1"],
    visualReviewConfirmed: true,
  };
  const individualProfile = {
    id: PROFILE_ID,
    customer_type: "individual",
    identity_type: "national_id",
  };

  it("staff denied 403 with audit row (action=verify)", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.platformRole = "staff";
    await expect(verifyPost(EVENT)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls.logInserts[0]).toMatchObject({ action: "verify", result: "denied" });
  });

  it("incomplete documents → 422 KYC_DOCUMENTS_INCOMPLETE and the RPC is NEVER called", async () => {
    const { client, calls } = makeClient({
      profile: individualProfile,
      documents: [{ document_type: "signature" }],
    });
    mockState.client = client;
    mockState.body = validBody;
    await expect(verifyPost(EVENT)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "KYC_DOCUMENTS_INCOMPLETE",
    });
    expect(calls.rpcs).toHaveLength(0);
  });

  it("complete documents → calls verify_kyc_profile with actor snapshot and NO validity period", async () => {
    const { client, calls } = makeClient({
      profile: individualProfile,
      documents: [{ document_type: "id_card" }],
    });
    mockState.client = client;
    mockState.body = validBody;
    const res = await verifyPost(EVENT);
    expect(calls.rpcs).toHaveLength(1);
    const { fn, args } = calls.rpcs[0]!;
    expect(fn).toBe("verify_kyc_profile");
    expect(args).toMatchObject({
      p_profile_id: PROFILE_ID,
      p_decided_by_user_id: "admin-user-1",
      p_decided_by_role: "super_admin",
      p_visual_review_confirmed: true,
    });
    // valid_until is the RPC's single-writer authority — never passed in.
    expect(Object.keys(args).join(",")).not.toContain("valid_until");
    expect(res.decision).toBeTruthy();
    // allowed decision event logged
    expect(calls.logInserts.some((l) => l.action === "verify" && l.result === "allowed")).toBe(true);
  });

  it("missing visual review → 422 before any DB work", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.body = { reviewedDocumentIds: ["doc-1"], visualReviewConfirmed: false };
    await expect(verifyPost(EVENT)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "KYC_VISUAL_REVIEW_REQUIRED",
    });
    expect(calls.rpcs).toHaveLength(0);
  });
});

describe("POST /api/admin/kyc/profiles/:id/reject", () => {
  it("invalid reason → 422, no RPC", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.body = { reasonCode: "nope" };
    await expect(rejectPost(EVENT)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "KYC_REJECT_REASON_INVALID",
    });
    expect(calls.rpcs).toHaveLength(0);
  });

  it("valid reason → calls reject_kyc_profile and logs the allowed decision", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.body = { reasonCode: "identity_mismatch", note: "photo mismatch" };
    await rejectPost(EVENT);
    expect(calls.rpcs[0]).toMatchObject({
      fn: "reject_kyc_profile",
      args: { p_reason_code: "identity_mismatch", p_note: "photo mismatch" },
    });
    expect(calls.logInserts.some((l) => l.action === "reject" && l.result === "allowed")).toBe(true);
  });

  it("staff denied 403 with audit row (action=reject)", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.platformRole = "staff";
    await expect(rejectPost(EVENT)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls.logInserts[0]).toMatchObject({ action: "reject", result: "denied" });
  });
});

describe("POST /api/admin/kyc/profiles/:id/revoke", () => {
  it("invalid reason → 422, no RPC", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.body = { reasonCode: "document_incomplete" }; // reject-only value
    await expect(revokePost(EVENT)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "KYC_REVOKE_REASON_INVALID",
    });
    expect(calls.rpcs).toHaveLength(0);
  });

  it("valid reason → calls revoke_kyc_profile", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.body = { reasonCode: "fraud_suspected" };
    await revokePost(EVENT);
    expect(calls.rpcs[0]).toMatchObject({
      fn: "revoke_kyc_profile",
      args: { p_reason_code: "fraud_suspected" },
    });
  });

  it("staff denied 403 with audit row (action=revoke)", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.platformRole = "staff";
    await expect(revokePost(EVENT)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls.logInserts[0]).toMatchObject({ action: "revoke", result: "denied" });
  });
});
