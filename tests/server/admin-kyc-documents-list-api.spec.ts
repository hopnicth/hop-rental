/**
 * Tests: GET /api/admin/kyc/profiles/:id/documents (Admin KYC document list)
 *
 * Covers:
 *  1. Guard pass-through — requirePlatformAdmin 401/403 errors propagate
 *  2. Malformed profile id → 400 INVALID_PROFILE_ID with zero DB queries
 *  3. Absent profile → 404; kyc_documents is never queried
 *  4. Opaque infrastructure errors — raw DB error text never reaches the
 *     client (KYC_PROFILE_READ_FAILED / KYC_DOCUMENT_LIST_FAILED)
 *  5. Happy path — { documents } mapped via toSafeKycDocument, uploaded_at
 *     desc, exact SAFE select strings, and NO storage_path / bucket / URL /
 *     uploader keys anywhere in the serialized response
 *  6. List access is intentionally unlogged in v1 — zero access-log inserts
 *  7. Source inspection — requirePlatformAdmin + asUuidOrNull + safe view
 *     module only; no internal select, no signed/public URLs, no Storage use,
 *     no access-log writes
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KYC_DOCUMENT_SAFE_SELECT } from "../../server/utils/kyc-document-view";

const mockState = vi.hoisted(() => ({
  adminError: null as any,
  platformRole: "staff" as string,
  client: null as any,
  params: {} as Record<string, string>,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: any) => handler,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
  getRouterParam: (_event: any, name: string) => mockState.params[name],
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

const listGet = (
  await import("../../server/api/admin/kyc/profiles/[id]/documents.get")
).default;

const PROFILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

interface ClientOpts {
  profileExists?: boolean;
  profileReadError?: { message: string } | null;
  documentRows?: Array<Record<string, unknown>>;
  documentsReadError?: { message: string } | null;
}

function docRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    kyc_profile_id: PROFILE_ID,
    document_type: "id_card",
    mime_type: "image/jpeg",
    file_size_bytes: 4096,
    uploaded_at: "2026-06-06T01:00:00.000Z",
    created_at: "2026-06-06T01:00:00.000Z",
    ...overrides,
  };
}

function makeClient(opts: ClientOpts = {}) {
  const calls = {
    profileQueries: [] as Array<{ select: string }>,
    documentQueries: [] as Array<{
      select: string;
      order: { column: string; ascending: boolean } | null;
    }>,
    logInserts: 0,
    storageAccess: 0,
  };
  const client = {
    from(table: string) {
      if (table === "kyc_profiles") {
        const call = { select: "", eqValue: "" as unknown };
        const chain: any = {
          select: (cols: string) => {
            call.select = cols;
            return chain;
          },
          eq: (_col: string, val: unknown) => {
            call.eqValue = val;
            return chain;
          },
          maybeSingle: async () => {
            calls.profileQueries.push(call);
            if (opts.profileReadError) {
              return { data: null, error: opts.profileReadError };
            }
            return {
              data:
                opts.profileExists === false ? null : { id: PROFILE_ID },
              error: null,
            };
          },
        };
        return chain;
      }
      if (table === "kyc_documents") {
        const call = {
          select: "",
          order: null as { column: string; ascending: boolean } | null,
        };
        const chain: any = {
          select: (cols: string) => {
            call.select = cols;
            return chain;
          },
          eq: () => chain,
          order: async (
            column: string,
            o: { ascending: boolean },
          ) => {
            call.order = { column, ascending: o.ascending };
            calls.documentQueries.push(call);
            if (opts.documentsReadError) {
              return { data: null, error: opts.documentsReadError };
            }
            return { data: opts.documentRows ?? [docRow()], error: null };
          },
        };
        return chain;
      }
      if (table === "kyc_document_access_log") {
        calls.logInserts += 1;
        throw new Error(`unexpected access-log write from list endpoint`);
      }
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from() {
        calls.storageAccess += 1;
        throw new Error("unexpected storage access from list endpoint");
      },
    },
  };
  return { client, calls };
}

function makeEvent() {
  return { node: { req: { headers: {} } } } as any;
}

beforeEach(() => {
  mockState.adminError = null;
  mockState.platformRole = "staff";
  mockState.client = null;
  mockState.params = {};
});

describe("GET /api/admin/kyc/profiles/:id/documents — guard", () => {
  it("propagates the platform-admin guard error (401)", async () => {
    mockState.adminError = Object.assign(new Error("Authentication required"), {
      statusCode: 401,
    });
    await expect(listGet(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("propagates the platform-admin guard error (403 customer)", async () => {
    mockState.adminError = Object.assign(new Error("Admin access required"), {
      statusCode: 403,
    });
    await expect(listGet(makeEvent())).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe("GET /api/admin/kyc/profiles/:id/documents — id validation", () => {
  it("uppercase hex uuid is accepted and normalized to lowercase (asUuidOrNull parity)", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.params = { id: PROFILE_ID.toUpperCase() };
    await listGet(makeEvent());
    expect(calls.profileQueries).toHaveLength(1);
    expect(calls.profileQueries[0]!.eqValue).toBe(PROFILE_ID);
  });

  it.each([
    ["non-uuid string", "not-a-uuid"],
    ["empty string", ""],
    ["path traversal", "../etc/passwd"],
    ["uuid with junk suffix", `${PROFILE_ID}x`],
  ])("malformed id (%s) → 400 with zero DB queries", async (_label, id) => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.params = { id };
    await expect(listGet(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "INVALID_PROFILE_ID",
    });
    expect(calls.profileQueries).toHaveLength(0);
    expect(calls.documentQueries).toHaveLength(0);
  });
});

describe("GET /api/admin/kyc/profiles/:id/documents — profile gate", () => {
  it("absent profile → 404 and kyc_documents is never queried", async () => {
    const { client, calls } = makeClient({ profileExists: false });
    mockState.client = client;
    mockState.params = { id: PROFILE_ID };
    await expect(listGet(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(calls.documentQueries).toHaveLength(0);
  });

  it("profile read failure → opaque 500, raw DB message never surfaces", async () => {
    const { client } = makeClient({
      profileReadError: { message: "connection refused at 10.0.0.5:5432" },
    });
    mockState.client = client;
    mockState.params = { id: PROFILE_ID };
    const err = await listGet(makeEvent()).catch((e: any) => e);
    expect(err.statusCode).toBe(500);
    expect(err.statusMessage).toBe("KYC_PROFILE_READ_FAILED");
    expect(JSON.stringify({ ...err, message: err.message })).not.toContain(
      "10.0.0.5",
    );
  });

  it("profile existence query selects the bare id only", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.params = { id: PROFILE_ID };
    await listGet(makeEvent());
    expect(calls.profileQueries).toHaveLength(1);
    expect(calls.profileQueries[0]!.select).toBe("id");
  });
});

describe("GET /api/admin/kyc/profiles/:id/documents — list", () => {
  it("documents read failure → opaque 500", async () => {
    const { client } = makeClient({
      documentsReadError: { message: "relation kyc_documents is on fire" },
    });
    mockState.client = client;
    mockState.params = { id: PROFILE_ID };
    const err = await listGet(makeEvent()).catch((e: any) => e);
    expect(err.statusCode).toBe(500);
    expect(err.statusMessage).toBe("KYC_DOCUMENT_LIST_FAILED");
    expect(err.statusMessage).not.toContain("on fire");
  });

  it("happy path maps rows through toSafeKycDocument (camelCase, whitelist only)", async () => {
    const { client } = makeClient();
    mockState.client = client;
    mockState.params = { id: PROFILE_ID };
    const res = await listGet(makeEvent());
    expect(res).toEqual({
      documents: [
        {
          id: DOC_ID,
          kycProfileId: PROFILE_ID,
          documentType: "id_card",
          mimeType: "image/jpeg",
          fileSizeBytes: 4096,
          uploadedAt: "2026-06-06T01:00:00.000Z",
          createdAt: "2026-06-06T01:00:00.000Z",
        },
      ],
    });
  });

  it("serialized response never contains storage/bucket/URL/uploader keys", async () => {
    // Even if a future select regression leaked extra columns, the mapper must
    // strip them. Feed a poisoned row and assert the response stays clean.
    const { client } = makeClient({
      documentRows: [
        docRow({
          storage_path: "kyc/leak.jpg",
          storage_bucket: "kyc-profile-documents",
          uploaded_by_user_id: "user-9",
          signedUrl: "https://leak.example/signed",
        }),
      ],
    });
    mockState.client = client;
    mockState.params = { id: PROFILE_ID };
    const serialized = JSON.stringify(await listGet(makeEvent()));
    for (const banned of [
      "storage_path",
      "storagePath",
      "storage_bucket",
      "storageBucket",
      "signedUrl",
      "uploaded_by_user_id",
      "leak",
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("selects exactly KYC_DOCUMENT_SAFE_SELECT ordered uploaded_at desc", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.params = { id: PROFILE_ID };
    await listGet(makeEvent());
    expect(calls.documentQueries).toHaveLength(1);
    expect(calls.documentQueries[0]!.select).toBe(KYC_DOCUMENT_SAFE_SELECT);
    expect(calls.documentQueries[0]!.order).toEqual({
      column: "uploaded_at",
      ascending: false,
    });
  });

  it("empty document set returns { documents: [] }", async () => {
    const { client } = makeClient({ documentRows: [] });
    mockState.client = client;
    mockState.params = { id: PROFILE_ID };
    expect(await listGet(makeEvent())).toEqual({ documents: [] });
  });

  it("list access writes ZERO audit-log rows and touches ZERO storage (intentionally unlogged v1)", async () => {
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.params = { id: PROFILE_ID };
    await listGet(makeEvent());
    expect(calls.logInserts).toBe(0);
    expect(calls.storageAccess).toBe(0);
  });
});

describe("source inspection — list endpoint", () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      "server/api/admin/kyc/profiles/[id]/documents.get.ts",
    ),
    "utf8",
  );

  it("uses requirePlatformAdmin and the strict UUID classifier", () => {
    expect(src).toContain("requirePlatformAdmin");
    expect(src).toContain("asUuidOrNull");
    expect(src).not.toContain("requireSuperAdmin");
  });

  it("uses the safe view module only — never the internal download select", () => {
    expect(src).toContain("KYC_DOCUMENT_SAFE_SELECT");
    expect(src).toContain("toSafeKycDocument");
    expect(src).not.toContain("KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT");
    expect(src).not.toContain("storage_path");
  });

  it("never mints URLs, touches Storage, or writes access logs", () => {
    expect(src).not.toContain("createSignedUrl");
    expect(src).not.toContain("getPublicUrl");
    expect(src).not.toContain(".storage");
    expect(src).not.toContain("logKycDocumentAccess");
    expect(src).not.toContain("serverSupabaseClient");
  });
});
