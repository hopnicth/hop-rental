/**
 * Tests: POST /api/user/kyc/id-card — customer self-serve KYC intake
 * (§a channel 1, T1a rail-move: kyc_profiles + kyc-profile-documents rails)
 *
 * Covers:
 *  1. Auth — 401 unauthenticated
 *  2. Input — 422 missing identityValue / holderName; 415 magic-byte sniff
 *     (client MIME never trusted); 413 > 5 MB; 403 without PDPA consent
 *  3. Rails — creates a user-bound PENDING kyc_profiles row (holder_name,
 *     hashed identity), uploads to kyc-profile-documents under an opaque key,
 *     inserts kyc_documents, audit-logs upload with actor_role 'customer',
 *     mirrors users.kyc_status='pending'; legacy kyc-documents bucket never
 *     written
 *  4. Once-per-user — verified profile → 409; identity mismatch → 409;
 *     rejected profile → same-row flip to pending recorded in the log reason
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  authUser: { id: "user-1" } as Record<string, unknown> | null,
  parts: [] as any[],
  pdpaConsentedAt: "2026-05-18T00:00:00.000Z" as string | null,
  existingProfile: null as Record<string, unknown> | null,
  client: null as any,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: any) => handler,
  readMultipartFormData: async () => mockState.parts,
  getHeader: () => undefined,
  createError: (opts: { statusMessage?: string; statusCode?: number }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("#supabase/server", () => ({
  serverSupabaseUser: async () => mockState.authUser,
  serverSupabaseServiceRole: () => mockState.client,
}));

const handler = (await import("../../server/api/user/kyc/id-card.post")).default;
const { hashKycIdentity } = await import("../../server/utils/kyc");

const SECRET = "test-secret-user-kyc";
const EVENT = { node: { req: { socket: { remoteAddress: "10.0.0.5" } } } } as any;
const VALID_ID = "1101700230123";

function jpegBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  return buf;
}

function parts(over: { data?: Buffer; identityValue?: string | null; holderName?: string | null } = {}) {
  const list: any[] = [
    { name: "file", filename: "id.jpg", type: "image/jpeg", data: over.data ?? jpegBytes() },
  ];
  if (over.identityValue !== null) {
    list.push({ name: "identityValue", data: Buffer.from(over.identityValue ?? VALID_ID) });
  }
  if (over.holderName !== null) {
    list.push({ name: "holderName", data: Buffer.from(over.holderName ?? "สมชาย ใจดี") });
  }
  return list;
}

function makeClient() {
  const calls = {
    buckets: [] as string[],
    uploads: [] as string[],
    removed: [] as string[][],
    profileInserts: [] as Array<Record<string, unknown>>,
    profileUpdates: [] as Array<Record<string, unknown>>,
    documentInserts: [] as Array<Record<string, unknown>>,
    userUpdates: [] as Array<Record<string, unknown>>,
    logInserts: [] as Array<Record<string, unknown>>,
  };
  const client: any = {
    storage: {
      from(bucket: string) {
        calls.buckets.push(bucket);
        return {
          upload: async (path: string) => { calls.uploads.push(path); return { error: null }; },
          remove: async (paths: string[]) => { calls.removed.push(paths); return { error: null }; },
        };
      },
    },
    from(table: string) {
      if (table === "kyc_document_access_log") {
        return { insert: async (p: any) => { calls.logInserts.push(p); return { error: null }; } };
      }
      let pendingInsert: Record<string, unknown> | null = null;
      let pendingUpdate: Record<string, unknown> | null = null;
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        insert: (p: Record<string, unknown>) => {
          pendingInsert = p;
          if (table === "kyc_profiles") calls.profileInserts.push(p);
          if (table === "kyc_documents") calls.documentInserts.push(p);
          return chain;
        },
        update: (p: Record<string, unknown>) => {
          pendingUpdate = p;
          if (table === "kyc_profiles") calls.profileUpdates.push(p);
          if (table === "users") calls.userUpdates.push(p);
          return chain;
        },
        maybeSingle: async () => ({
          data: { pdpa_consented_at: mockState.pdpaConsentedAt },
          error: null,
        }),
        single: async () => ({
          data: pendingInsert
            ? { id: table === "kyc_profiles" ? "profile-new" : "doc-new", document_type: "id_card", mime_type: "image/jpeg", ...{} }
            : null,
          error: null,
        }),
        then: (resolve: (v: unknown) => unknown) => {
          // awaited select (kyc_profiles lookup) or awaited update
          if (pendingUpdate) return Promise.resolve({ error: null }).then(resolve);
          return Promise.resolve({
            data: mockState.existingProfile ? [mockState.existingProfile] : [],
            error: null,
          }).then(resolve);
        },
      };
      return chain;
    },
  };
  return { client, calls };
}

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.KYC_HASH_SECRET;
  process.env.KYC_HASH_SECRET = SECRET;
  mockState.authUser = { id: "user-1" };
  mockState.pdpaConsentedAt = "2026-05-18T00:00:00.000Z";
  mockState.existingProfile = null;
  mockState.parts = parts();
  const made = makeClient();
  mockState.client = made.client;
  (mockState as any).calls = made.calls;
});

const calls = () => (mockState as any).calls;

describe("auth + input validation", () => {
  it("rejects unauthenticated uploads (401)", async () => {
    mockState.authUser = null;
    await expect(handler(EVENT)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("missing identityValue → 422", async () => {
    mockState.parts = parts({ identityValue: null });
    await expect(handler(EVENT)).rejects.toMatchObject({
      statusCode: 422, statusMessage: "IDENTITY_VALUE_REQUIRED",
    });
  });

  it("missing holderName → 422", async () => {
    mockState.parts = parts({ holderName: null });
    await expect(handler(EVENT)).rejects.toMatchObject({
      statusCode: 422, statusMessage: "HOLDER_NAME_REQUIRED",
    });
  });

  it("wrong magic bytes → 415 even with a friendly client MIME", async () => {
    mockState.parts = parts({ data: Buffer.from("<svg>not an image</svg>") });
    await expect(handler(EVENT)).rejects.toMatchObject({ statusCode: 415 });
  });

  it("file over 5MB → 413", async () => {
    mockState.parts = parts({ data: jpegBytes(5 * 1024 * 1024 + 1) });
    await expect(handler(EVENT)).rejects.toMatchObject({ statusCode: 413 });
  });

  it("no PDPA consent → 403 and nothing written", async () => {
    mockState.pdpaConsentedAt = null;
    await expect(handler(EVENT)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls().uploads).toHaveLength(0);
    expect(calls().profileInserts).toHaveLength(0);
  });
});

describe("rails — kyc_profiles + kyc-profile-documents", () => {
  it("creates a user-bound pending profile with holder_name and hashed identity", async () => {
    const res = await handler(EVENT);
    expect(res.profile.status).toBe("pending");
    const insert = calls().profileInserts[0]!;
    expect(insert.user_id).toBe("user-1");
    expect(insert.holder_name).toBe("สมชาย ใจดี");
    expect(insert.status).toBe("pending");
    expect(insert.identity_hash).toBe(hashKycIdentity("national_id", VALID_ID));
    // Raw identity never stored anywhere in the payload.
    expect(JSON.stringify(insert)).not.toContain(VALID_ID);
  });

  it("uploads ONLY to kyc-profile-documents under an opaque kyc/<uuid> key — legacy bucket never written", async () => {
    await handler(EVENT);
    expect(calls().buckets).toEqual(["kyc-profile-documents"]);
    expect(calls().uploads[0]).toMatch(/^kyc\/[0-9a-f-]{36}\.jpg$/);
  });

  it("inserts the kyc_documents row and audit-logs with actor_role customer", async () => {
    await handler(EVENT);
    expect(calls().documentInserts[0]).toMatchObject({
      document_type: "id_card",
      uploaded_by_user_id: "user-1",
    });
    expect(calls().logInserts[0]).toMatchObject({
      action: "upload",
      result: "allowed",
      actor_role: "customer",
      reason: null,
    });
  });

  it("mirrors users.kyc_status = pending", async () => {
    await handler(EVENT);
    expect(calls().userUpdates).toContainEqual({ kyc_status: "pending" });
  });
});

describe("once-per-user semantics", () => {
  it("verified profile → 409 KYC_ALREADY_VERIFIED", async () => {
    mockState.existingProfile = {
      id: "p1", status: "verified",
      identity_hash: hashKycIdentity("national_id", VALID_ID),
    };
    await expect(handler(EVENT)).rejects.toMatchObject({
      statusCode: 409, statusMessage: "KYC_ALREADY_VERIFIED",
    });
  });

  it("identity mismatch vs bound profile → 409 KYC_IDENTITY_MISMATCH", async () => {
    mockState.existingProfile = { id: "p1", status: "pending", identity_hash: "other-hash" };
    await expect(handler(EVENT)).rejects.toMatchObject({
      statusCode: 409, statusMessage: "KYC_IDENTITY_MISMATCH",
    });
  });

  it("rejected profile → same-row flip to pending, recorded in the log reason", async () => {
    mockState.existingProfile = {
      id: "p1", status: "rejected",
      identity_hash: hashKycIdentity("national_id", VALID_ID),
    };
    const res = await handler(EVENT);
    expect(res.profile.id).toBe("p1");
    expect(calls().profileInserts).toHaveLength(0);
    expect(calls().profileUpdates).toContainEqual({ status: "pending" });
    expect(calls().logInserts[0]!.reason).toBe("resubmission_status_rejected_to_pending");
  });
});
