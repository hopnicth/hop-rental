/**
 * Tests: POST /api/admin/kyc/profiles/:id/documents (KYC document upload — Phase 1B)
 *
 * Covers:
 *  1. Auth — requirePlatformAdmin enforced: staff and super_admin can upload;
 *     customer (403) and unauthenticated (401) are rejected; no self-upload route
 *  2. Hard streaming body limit — actual bytes counted; spoofed Content-Length
 *     and chunked/no-Content-Length uploads cannot bypass it; multipart parsing
 *     never runs on an over-limit body
 *  3. Actual file size > 10 MB rejected (413) even when the body passes the cap
 *  4. Magic-byte MIME — JPEG/PNG (full 8-byte signature)/PDF accepted with
 *     canonical MIME stored; SVG and wrong-magic-with-fake-MIME rejected (415);
 *     client MIME ignored
 *  5. kyc_documents row — actual byte count in file_size_bytes, sniffed MIME in
 *     mime_type, opaque UUID storage key not derived from the profile id
 *  6. Response safety — no storage_path, no storage bucket, no public/signed URL
 *  7. Access log — best-effort upload event (action=upload, result=allowed) with
 *     single-IP x-forwarded-for parsing; log failure never fails the upload
 *  8. documentType ↔ profile coherence — keyed on customer_type × identity_type
 *     (mirrors the create-time COHERENT_IDENTITY_TYPES guard):
 *     individual×national_id → id_card/signature; individual×passport →
 *     passport/signature; company×juristic_id → company_cert/vat_certificate/
 *     signature; any mismatch or unknown pair → 422 (fail closed)
 *  9. issued_at / expires_at capture — company_cert requires issuedAt; a
 *     future issuedAt is 422 for ANY type; expiresAt < issuedAt is 422;
 *     valid dates stored
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  adminError: null as any,
  platformRole: "staff" as string,
  client: null as any,
  params: {} as Record<string, string>,
  parts: [] as any[],
  multipartCalls: 0,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: any) => handler,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
  getRouterParam: (_event: any, name: string) => mockState.params[name],
  getHeader: (event: any, name: string) =>
    event?.node?.req?.headers?.[name.toLowerCase()],
  readMultipartFormData: async () => {
    mockState.multipartCalls += 1;
    return mockState.parts;
  },
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

const uploadPost = (
  await import("../../server/api/admin/kyc/profiles/[id]/documents.post")
).default;
const {
  KYC_DOCUMENT_MAX_FILE_BYTES,
  KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES,
} = await import("../../server/utils/kyc-documents");

const PROFILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_KEY_RE =
  /^kyc\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|pdf)$/;

// ── Fixtures ─────────────────────────────────────────────────────────────────

function jpegBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

/** Full 8-byte PNG signature: 89 50 4E 47 0D 0A 1A 0A */
function pngBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach((byte, i) => {
    buf[i] = byte;
  });
  return buf;
}

function pdfBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  Buffer.from("%PDF-1.7").copy(buf);
  return buf;
}

function fileParts(
  data: Buffer,
  over: {
    documentType?: string | null;
    clientType?: string;
    issuedAt?: string;
    expiresAt?: string;
  } = {},
) {
  const parts: any[] = [
    { name: "file", filename: "doc.bin", type: over.clientType ?? "application/octet-stream", data },
  ];
  if (over.documentType !== null) {
    parts.push({
      name: "documentType",
      data: Buffer.from(over.documentType ?? "id_card"),
    });
  }
  if (over.issuedAt !== undefined) {
    parts.push({ name: "issuedAt", data: Buffer.from(over.issuedAt) });
  }
  if (over.expiresAt !== undefined) {
    parts.push({ name: "expiresAt", data: Buffer.from(over.expiresAt) });
  }
  return parts;
}

/** Mock H3 event whose node.req streams `body` in chunks (async iterable). */
function makeEvent(
  body: Buffer,
  headers: Record<string, string> = {},
): any {
  const req: any = {
    headers,
    socket: { remoteAddress: "10.0.0.9" },
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < body.length; i += 64 * 1024) {
        if (this.destroyed) return;
        yield body.subarray(i, i + 64 * 1024);
      }
    },
  };
  return { node: { req } };
}

// ── Mock admin client ────────────────────────────────────────────────────────

function makeClient(
  opts: {
    profileExists?: boolean;
    customerType?: string;
    identityType?: string;
    documentInsertError?: { message: string } | null;
    logInsertError?: boolean;
    profileStatus?: string;
    profileUpdateError?: { message: string } | null;
  } = {},
) {
  const calls = {
    profileUpdates: [] as Array<Record<string, unknown>>,
    storageUploads: [] as Array<{
      bucket: string;
      path: string;
      bytes: Buffer;
      options: Record<string, unknown>;
    }>,
    storageRemovals: [] as string[][],
    documentInserts: [] as Array<Record<string, unknown>>,
    logInserts: [] as Array<Record<string, unknown>>,
  };
  const client = {
    from(table: string) {
      if (table === "kyc_profiles") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          update: (p: Record<string, unknown>) => {
            calls.profileUpdates.push(p);
            return {
              eq: () => ({
                eq: async () => ({
                  error: opts.profileUpdateError ?? null,
                }),
              }),
            };
          },
          maybeSingle: async () => ({
            data:
              opts.profileExists === false
                ? null
                : {
                    id: PROFILE_ID,
                    customer_type: opts.customerType ?? "individual",
                    // Default to the coherent identity root for the customer
                    // type (mirrors the create-endpoint guard).
                    identity_type:
                      opts.identityType ??
                      (opts.customerType === "company"
                        ? "juristic_id"
                        : "national_id"),
                    status: opts.profileStatus ?? "pending",
                  },
            error: null,
          }),
        };
        return chain;
      }
      if (table === "kyc_documents") {
        let payload: Record<string, unknown> | null = null;
        const chain: any = {
          insert: (p: Record<string, unknown>) => {
            payload = p;
            calls.documentInserts.push(p);
            return chain;
          },
          select: () => chain,
          single: async () =>
            opts.documentInsertError
              ? { data: null, error: opts.documentInsertError }
              : {
                  data: {
                    id: "doc-1",
                    kyc_profile_id: payload?.kyc_profile_id,
                    document_type: payload?.document_type,
                    mime_type: payload?.mime_type,
                    file_size_bytes: payload?.file_size_bytes,
                    uploaded_at: "2026-06-04T00:00:00.000Z",
                    created_at: "2026-06-04T00:00:00.000Z",
                  },
                  error: null,
                },
        };
        return chain;
      }
      if (table === "kyc_document_access_log") {
        return {
          insert: (p: Record<string, unknown>) => {
            calls.logInserts.push(p);
            return Promise.resolve({
              error: opts.logInsertError ? { message: "log table down" } : null,
            });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (
            path: string,
            bytes: Buffer,
            options: Record<string, unknown>,
          ) => {
            calls.storageUploads.push({ bucket, path, bytes, options });
            return { error: null };
          },
          remove: async (paths: string[]) => {
            calls.storageRemovals.push(paths);
            return { error: null };
          },
        };
      },
    },
  };
  return { client, calls };
}

function setup(
  opts: Parameters<typeof makeClient>[0] & {
    parts?: any[];
    role?: string;
  } = {},
) {
  const { client, calls } = makeClient(opts);
  mockState.client = client;
  mockState.platformRole = opts.role ?? "staff";
  mockState.parts = opts.parts ?? fileParts(jpegBytes());
  return { calls };
}

beforeEach(() => {
  mockState.adminError = null;
  mockState.platformRole = "staff";
  mockState.client = null;
  mockState.params = { id: PROFILE_ID };
  mockState.parts = [];
  mockState.multipartCalls = 0;
});

// ── 1. Auth ──────────────────────────────────────────────────────────────────

describe("auth", () => {
  it("staff (platform admin) can upload", async () => {
    const { calls } = setup({ role: "staff" });
    const res = await uploadPost(makeEvent(jpegBytes()));
    expect(res.document.id).toBe("doc-1");
    expect(calls.documentInserts).toHaveLength(1);
  });

  it("super_admin can upload", async () => {
    const { calls } = setup({ role: "super_admin" });
    const res = await uploadPost(makeEvent(jpegBytes()));
    expect(res.document.id).toBe("doc-1");
    expect(calls.documentInserts).toHaveLength(1);
  });

  it("customer is rejected (guard 403) and nothing is uploaded", async () => {
    const { calls } = setup();
    mockState.adminError = Object.assign(new Error("Admin access required"), {
      statusCode: 403,
    });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(calls.storageUploads).toHaveLength(0);
    expect(calls.documentInserts).toHaveLength(0);
  });

  it("unauthenticated is rejected (guard 401) and nothing is uploaded", async () => {
    const { calls } = setup();
    mockState.adminError = Object.assign(new Error("Authentication required"), {
      statusCode: 401,
    });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(calls.storageUploads).toHaveLength(0);
    expect(calls.documentInserts).toHaveLength(0);
  });

  it("source: route lives under /api/admin and uses requirePlatformAdmin (no customer self-upload)", () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        "server/api/admin/kyc/profiles/[id]/documents.post.ts",
      ),
      "utf8",
    );
    expect(src).toContain("requirePlatformAdmin");
    expect(src).not.toContain("serverSupabaseClient");
  });
});

// ── 2. Hard streaming body limit ─────────────────────────────────────────────

describe("hard streaming body limit", () => {
  it("rejects an over-limit body with a SPOOFED small Content-Length (413) before multipart parsing", async () => {
    setup();
    const big = Buffer.alloc(KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES + 1);
    const event = makeEvent(big, { "content-length": "100" }); // spoofed
    await expect(uploadPost(event)).rejects.toMatchObject({ statusCode: 413 });
    expect(mockState.multipartCalls).toBe(0);
  });

  it("rejects an over-limit chunked body with NO Content-Length at all (413)", async () => {
    setup();
    const big = Buffer.alloc(KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES + 1);
    const event = makeEvent(big, {}); // no content-length → chunked semantics
    await expect(uploadPost(event)).rejects.toMatchObject({ statusCode: 413 });
    expect(mockState.multipartCalls).toBe(0);
  });

  it("destroys the request stream once the cap is exceeded", async () => {
    setup();
    const big = Buffer.alloc(KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES + 1);
    const event = makeEvent(big);
    await expect(uploadPost(event)).rejects.toMatchObject({ statusCode: 413 });
    expect(event.node.req.destroyed).toBe(true);
  });

  it("fast-fails on an honestly-declared oversize Content-Length without streaming", async () => {
    setup();
    const event = makeEvent(Buffer.alloc(0), {
      "content-length": String(KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES + 1),
    });
    await expect(uploadPost(event)).rejects.toMatchObject({ statusCode: 413 });
    expect(mockState.multipartCalls).toBe(0);
  });
});

// ── 3. Actual file size ──────────────────────────────────────────────────────

describe("actual file size limit", () => {
  it("rejects a file whose ACTUAL bytes exceed 10 MB (413), regardless of declared size", async () => {
    const oversize = jpegBytes(KYC_DOCUMENT_MAX_FILE_BYTES + 1);
    const { calls } = setup({ parts: fileParts(oversize) });
    await expect(uploadPost(makeEvent(oversize))).rejects.toMatchObject({
      statusCode: 413,
    });
    expect(calls.storageUploads).toHaveLength(0);
    expect(calls.documentInserts).toHaveLength(0);
  });

  it("accepts a file exactly at 10 MB", async () => {
    const exact = jpegBytes(KYC_DOCUMENT_MAX_FILE_BYTES);
    const { calls } = setup({ parts: fileParts(exact) });
    const res = await uploadPost(makeEvent(exact));
    expect(res.document.fileSizeBytes).toBe(KYC_DOCUMENT_MAX_FILE_BYTES);
    expect(calls.documentInserts[0]!.file_size_bytes).toBe(
      KYC_DOCUMENT_MAX_FILE_BYTES,
    );
  });

  it("stores the ACTUAL byte count in file_size_bytes", async () => {
    const file = pngBytes(12345);
    const { calls } = setup({ parts: fileParts(file) });
    await uploadPost(makeEvent(file));
    expect(calls.documentInserts[0]!.file_size_bytes).toBe(12345);
  });
});

// ── 4. Magic-byte MIME ───────────────────────────────────────────────────────

describe("magic-byte MIME sniffing", () => {
  it("JPEG magic accepted; canonical image/jpeg stored and used as storage contentType", async () => {
    const { calls } = setup({
      parts: fileParts(jpegBytes(), { clientType: "application/x-fake" }),
    });
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.documentInserts[0]!.mime_type).toBe("image/jpeg");
    expect(calls.storageUploads[0]!.options.contentType).toBe("image/jpeg");
  });

  it("PNG magic accepted; canonical image/png stored", async () => {
    const { calls } = setup({ parts: fileParts(pngBytes()) });
    await uploadPost(makeEvent(pngBytes()));
    expect(calls.documentInserts[0]!.mime_type).toBe("image/png");
    expect(calls.storageUploads[0]!.options.contentType).toBe("image/png");
  });

  it("PDF magic accepted; canonical application/pdf stored", async () => {
    const { calls } = setup({ parts: fileParts(pdfBytes()) });
    await uploadPost(makeEvent(pdfBytes()));
    expect(calls.documentInserts[0]!.mime_type).toBe("application/pdf");
    expect(calls.storageUploads[0]!.options.contentType).toBe("application/pdf");
  });

  it("SVG is rejected (415) even with a declared image MIME", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const { calls } = setup({
      parts: fileParts(svg, { clientType: "image/svg+xml" }),
    });
    await expect(uploadPost(makeEvent(svg))).rejects.toMatchObject({
      statusCode: 415,
    });
    expect(calls.storageUploads).toHaveLength(0);
  });

  it("wrong magic with a fake image/jpeg client MIME is rejected (415)", async () => {
    const fake = Buffer.from("not really a jpeg at all");
    const { calls } = setup({
      parts: fileParts(fake, { clientType: "image/jpeg" }),
    });
    await expect(uploadPost(makeEvent(fake))).rejects.toMatchObject({
      statusCode: 415,
    });
    expect(calls.storageUploads).toHaveLength(0);
    expect(calls.documentInserts).toHaveLength(0);
  });
});

// ── 5. Storage key + row content ─────────────────────────────────────────────

describe("storage key", () => {
  it("is an opaque kyc/<uuid>.<ext> key, not derived from the profile id", async () => {
    const { calls } = setup();
    await uploadPost(makeEvent(jpegBytes()));
    const key = calls.storageUploads[0]!.path;
    expect(key).toMatch(UUID_KEY_RE);
    expect(key).not.toContain(PROFILE_ID);
    expect(calls.storageUploads[0]!.bucket).toBe("kyc-profile-documents");
    // The kyc_documents row stores the same opaque key server-side.
    expect(calls.documentInserts[0]!.storage_path).toBe(key);
  });

  it("is unique across uploads", async () => {
    const { calls } = setup();
    await uploadPost(makeEvent(jpegBytes()));
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.storageUploads[0]!.path).not.toBe(calls.storageUploads[1]!.path);
  });
});

// ── 6. Response safety ───────────────────────────────────────────────────────

describe("response safety", () => {
  it("returns only safe metadata via the safe serializer", async () => {
    setup();
    const res = await uploadPost(makeEvent(jpegBytes()));
    expect(res).toEqual({
      document: {
        id: "doc-1",
        kycProfileId: PROFILE_ID,
        documentType: "id_card",
        mimeType: "image/jpeg",
        fileSizeBytes: 64,
        uploadedAt: "2026-06-04T00:00:00.000Z",
        createdAt: "2026-06-04T00:00:00.000Z",
      },
    });
  });

  it("never exposes storage_path, bucket, or any URL", async () => {
    const { calls } = setup();
    const res = await uploadPost(makeEvent(jpegBytes()));
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("storage_bucket");
    expect(serialized).not.toContain("storageBucket");
    expect(serialized).not.toContain(calls.storageUploads[0]!.path); // the opaque key
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("publicUrl");
  });
});

// ── 7. Access log ────────────────────────────────────────────────────────────

describe("upload access log", () => {
  it("logs action=upload result=allowed with opaque references and actor snapshot", async () => {
    const { calls } = setup();
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.logInserts).toHaveLength(1);
    const log = calls.logInserts[0]!;
    expect(log.action).toBe("upload");
    expect(log.result).toBe("allowed");
    expect(log.document_id).toBe("doc-1");
    expect(log.kyc_profile_id).toBe(PROFILE_ID);
    expect(log.actor_user_id).toBe("admin-user-1");
    expect(log.actor_role).toBe("staff");
    expect(log.document_type).toBe("id_card");
    expect(log.storage_bucket).toBe("kyc-profile-documents");
    expect(log.storage_path).toMatch(UUID_KEY_RE);
  });

  it("parses a single valid IP out of a multi-hop x-forwarded-for chain", async () => {
    const { calls } = setup();
    const event = makeEvent(jpegBytes(), {
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    });
    await uploadPost(event);
    expect(calls.logInserts[0]!.ip_address).toBe("203.0.113.7");
  });

  it("never inserts a raw comma chain into ip_address", async () => {
    const { calls } = setup();
    const event = makeEvent(jpegBytes(), {
      "x-forwarded-for": "203.0.113.7, 70.41.3.18",
    });
    await uploadPost(event);
    expect(String(calls.logInserts[0]!.ip_address)).not.toContain(",");
  });

  it("falls back to the socket address when x-forwarded-for is invalid", async () => {
    const { calls } = setup();
    const event = makeEvent(jpegBytes(), { "x-forwarded-for": "unknown" });
    await uploadPost(event);
    expect(calls.logInserts[0]!.ip_address).toBe("10.0.0.9");
  });

  it("best-effort: a failing log insert does NOT fail the upload (console.error breadcrumb emitted)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { calls } = setup({ logInsertError: true });
    const res = await uploadPost(makeEvent(jpegBytes()));
    expect(res.document.id).toBe("doc-1");
    expect(calls.logInserts).toHaveLength(1); // attempted
    expect(calls.documentInserts).toHaveLength(1); // upload still committed
    expect(errorSpy).toHaveBeenCalledTimes(1); // broken audit trail is detectable
    errorSpy.mockRestore();
  });
});

// ── 8. documentType ↔ customer_type × identity_type coherence ───────────────

describe("documentType ↔ profile (customer_type × identity_type) coherence", () => {
  async function expectCoherenceRejected(calls: { storageUploads: unknown[]; documentInserts: unknown[] }) {
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "INVALID_DOCUMENT_TYPE_FOR_PROFILE",
    });
    expect(calls.storageUploads).toHaveLength(0);
    expect(calls.documentInserts).toHaveLength(0);
  }

  it("individual × national_id + id_card accepted", async () => {
    const { calls } = setup({
      customerType: "individual",
      identityType: "national_id",
      parts: fileParts(jpegBytes(), { documentType: "id_card" }),
    });
    const res = await uploadPost(makeEvent(jpegBytes()));
    expect(res.document.documentType).toBe("id_card");
    expect(calls.documentInserts).toHaveLength(1);
  });

  it("individual × national_id + passport rejected 422 (identity root is national_id)", async () => {
    const { calls } = setup({
      customerType: "individual",
      identityType: "national_id",
      parts: fileParts(jpegBytes(), { documentType: "passport" }),
    });
    await expectCoherenceRejected(calls);
  });

  it("individual × passport + passport accepted", async () => {
    const { calls } = setup({
      customerType: "individual",
      identityType: "passport",
      parts: fileParts(jpegBytes(), { documentType: "passport" }),
    });
    const res = await uploadPost(makeEvent(jpegBytes()));
    expect(res.document.documentType).toBe("passport");
    expect(calls.documentInserts).toHaveLength(1);
  });

  it("individual × passport + id_card rejected 422 (identity root is passport)", async () => {
    const { calls } = setup({
      customerType: "individual",
      identityType: "passport",
      parts: fileParts(jpegBytes(), { documentType: "id_card" }),
    });
    await expectCoherenceRejected(calls);
  });

  it("individual + company_cert rejected 422 (even with a valid issuedAt)", async () => {
    const { calls } = setup({
      customerType: "individual",
      identityType: "national_id",
      parts: fileParts(jpegBytes(), {
        documentType: "company_cert",
        issuedAt: "2026-01-15",
      }),
    });
    await expectCoherenceRejected(calls);
  });

  it("individual + vat_certificate rejected 422", async () => {
    const { calls } = setup({
      customerType: "individual",
      parts: fileParts(jpegBytes(), { documentType: "vat_certificate" }),
    });
    await expectCoherenceRejected(calls);
  });

  it("company × juristic_id + company_cert accepted (with valid issuedAt)", async () => {
    const { calls } = setup({
      customerType: "company",
      identityType: "juristic_id",
      parts: fileParts(jpegBytes(), {
        documentType: "company_cert",
        issuedAt: "2026-01-15",
      }),
    });
    const res = await uploadPost(makeEvent(jpegBytes()));
    expect(res.document.documentType).toBe("company_cert");
    expect(calls.documentInserts).toHaveLength(1);
  });

  it("company × juristic_id + vat_certificate accepted", async () => {
    const { calls } = setup({
      customerType: "company",
      identityType: "juristic_id",
      parts: fileParts(jpegBytes(), { documentType: "vat_certificate" }),
    });
    const res = await uploadPost(makeEvent(jpegBytes()));
    expect(res.document.documentType).toBe("vat_certificate");
    expect(calls.documentInserts).toHaveLength(1);
  });

  it("company × juristic_id + id_card rejected 422", async () => {
    const { calls } = setup({
      customerType: "company",
      identityType: "juristic_id",
      parts: fileParts(jpegBytes(), { documentType: "id_card" }),
    });
    await expectCoherenceRejected(calls);
  });

  it("company + passport rejected 422", async () => {
    const { calls } = setup({
      customerType: "company",
      parts: fileParts(jpegBytes(), { documentType: "passport" }),
    });
    await expectCoherenceRejected(calls);
  });

  it("signature accepted for all three coherent pairs (identity-type-agnostic)", async () => {
    for (const profile of [
      { customerType: "individual", identityType: "national_id" },
      { customerType: "individual", identityType: "passport" },
      { customerType: "company", identityType: "juristic_id" },
    ]) {
      const { calls } = setup({
        ...profile,
        parts: fileParts(jpegBytes(), { documentType: "signature" }),
      });
      const res = await uploadPost(makeEvent(jpegBytes()));
      expect(res.document.documentType).toBe("signature");
      expect(calls.documentInserts).toHaveLength(1);
    }
  });

  it("incoherent profile pair fails closed 422 (e.g. individual × juristic_id)", async () => {
    // A pair the create-time guard would never produce: nothing is allowed.
    const { calls } = setup({
      customerType: "individual",
      identityType: "juristic_id",
      parts: fileParts(jpegBytes(), { documentType: "id_card" }),
    });
    await expectCoherenceRejected(calls);
  });

  it("unknown customer_type fails closed with 422", async () => {
    const { calls } = setup({
      customerType: "franchise",
      parts: fileParts(jpegBytes(), { documentType: "id_card" }),
    });
    await expectCoherenceRejected(calls);
  });
});

// ── 9. issued_at / expires_at capture ────────────────────────────────────────

describe("issued_at / expires_at capture", () => {
  it("company_cert missing issuedAt returns 422 ISSUED_AT_REQUIRED", async () => {
    const { calls } = setup({
      customerType: "company",
      parts: fileParts(jpegBytes(), { documentType: "company_cert" }),
    });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "ISSUED_AT_REQUIRED",
    });
    expect(calls.storageUploads).toHaveLength(0);
  });

  it("company_cert invalid issuedAt returns 422 INVALID_ISSUED_AT", async () => {
    for (const bad of ["15/01/2026", "2026-02-31", "not-a-date"]) {
      setup({
        customerType: "company",
        parts: fileParts(jpegBytes(), {
          documentType: "company_cert",
          issuedAt: bad,
        }),
      });
      await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
        statusCode: 422,
        statusMessage: "INVALID_ISSUED_AT",
      });
    }
  });

  it("company_cert future issuedAt returns 422 ISSUED_AT_IN_FUTURE", async () => {
    setup({
      customerType: "company",
      parts: fileParts(jpegBytes(), {
        documentType: "company_cert",
        issuedAt: "2099-01-01",
      }),
    });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "ISSUED_AT_IN_FUTURE",
    });
  });

  it("future issuedAt returns 422 for ANY document type (not just company_cert)", async () => {
    const { calls } = setup({
      parts: fileParts(jpegBytes(), {
        documentType: "id_card",
        issuedAt: "2099-01-01",
      }),
    });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "ISSUED_AT_IN_FUTURE",
    });
    expect(calls.storageUploads).toHaveLength(0);
  });

  it("expiresAt earlier than issuedAt returns 422 EXPIRES_AT_BEFORE_ISSUED_AT", async () => {
    const { calls } = setup({
      parts: fileParts(jpegBytes(), {
        documentType: "id_card",
        issuedAt: "2026-01-15",
        expiresAt: "2026-01-14",
      }),
    });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "EXPIRES_AT_BEFORE_ISSUED_AT",
    });
    expect(calls.storageUploads).toHaveLength(0);
  });

  it("expiresAt equal to issuedAt is allowed (same-day documents)", async () => {
    const { calls } = setup({
      parts: fileParts(jpegBytes(), {
        documentType: "id_card",
        issuedAt: "2026-01-15",
        expiresAt: "2026-01-15",
      }),
    });
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.documentInserts[0]!.issued_at).toBe("2026-01-15");
    expect(calls.documentInserts[0]!.expires_at).toBe("2026-01-15");
  });

  it("company_cert valid issuedAt stores kyc_documents.issued_at", async () => {
    const { calls } = setup({
      customerType: "company",
      parts: fileParts(jpegBytes(), {
        documentType: "company_cert",
        issuedAt: "2026-01-15",
      }),
    });
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.documentInserts[0]!.issued_at).toBe("2026-01-15");
  });

  it("optional expiresAt stores kyc_documents.expires_at (column exists in schema)", async () => {
    const { calls } = setup({
      customerType: "company",
      parts: fileParts(jpegBytes(), {
        documentType: "company_cert",
        issuedAt: "2026-01-15",
        expiresAt: "2027-01-15",
      }),
    });
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.documentInserts[0]!.issued_at).toBe("2026-01-15");
    expect(calls.documentInserts[0]!.expires_at).toBe("2027-01-15");
  });

  it("invalid expiresAt returns 422 INVALID_EXPIRES_AT", async () => {
    setup({
      parts: fileParts(jpegBytes(), {
        documentType: "id_card",
        expiresAt: "31-12-2027",
      }),
    });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "INVALID_EXPIRES_AT",
    });
  });

  it("optional issuedAt is accepted for non-company_cert types and stored", async () => {
    const { calls } = setup({
      parts: fileParts(jpegBytes(), {
        documentType: "id_card",
        issuedAt: "2024-03-01",
      }),
    });
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.documentInserts[0]!.issued_at).toBe("2024-03-01");
  });

  it("dates default to null when omitted", async () => {
    const { calls } = setup({
      parts: fileParts(jpegBytes(), { documentType: "id_card" }),
    });
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.documentInserts[0]!.issued_at).toBeNull();
    expect(calls.documentInserts[0]!.expires_at).toBeNull();
  });
});

// ── Input / not-found edges ──────────────────────────────────────────────────

describe("input validation", () => {
  it("404 when the kyc_profile does not exist; nothing uploaded", async () => {
    const { calls } = setup({ profileExists: false });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(calls.storageUploads).toHaveLength(0);
  });

  it("400 when the file part is missing", async () => {
    setup({ parts: [{ name: "documentType", data: Buffer.from("id_card") }] });
    await expect(uploadPost(makeEvent(Buffer.alloc(16)))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("400 when documentType is missing or not a kyc_document_type value", async () => {
    setup({ parts: fileParts(jpegBytes(), { documentType: null }) });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 400,
    });

    setup({ parts: fileParts(jpegBytes(), { documentType: "selfie" }) });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("cleans up the stored object when the kyc_documents insert fails", async () => {
    const { calls } = setup({ documentInsertError: { message: "insert down" } });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(calls.storageUploads).toHaveLength(1);
    expect(calls.storageRemovals).toHaveLength(1);
    expect(calls.storageRemovals[0]).toEqual([calls.storageUploads[0]!.path]);
  });
});

// ── 8. Rejected-profile resubmission flip (§a addendum item 4) ────────────────

describe("rejected → pending resubmission flip", () => {
  it("upload to a rejected profile flips status to pending and records the transition in the upload log reason", async () => {
    const { calls } = setup({ profileStatus: "rejected" });
    const res = await uploadPost(makeEvent(jpegBytes()));
    expect(res.document.id).toBe("doc-1");
    expect(calls.profileUpdates).toHaveLength(1);
    expect(calls.profileUpdates[0]).toEqual({ status: "pending" });
    expect(calls.logInserts).toHaveLength(1);
    expect(calls.logInserts[0]!.reason).toBe(
      "resubmission_status_rejected_to_pending",
    );
  });

  it("upload to a pending profile does NOT touch status and logs reason null", async () => {
    const { calls } = setup({ profileStatus: "pending" });
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.profileUpdates).toHaveLength(0);
    expect(calls.logInserts[0]!.reason).toBeNull();
  });

  it("upload to a verified profile does NOT touch status (no silent transitions)", async () => {
    const { calls } = setup({ profileStatus: "verified" });
    await uploadPost(makeEvent(jpegBytes()));
    expect(calls.profileUpdates).toHaveLength(0);
  });

  it("flip failure is fail-closed: 500 KYC_RESUBMISSION_FLIP_FAILED, no allowed log claiming the transition", async () => {
    const { calls } = setup({
      profileStatus: "rejected",
      profileUpdateError: { message: "boom" },
    });
    await expect(uploadPost(makeEvent(jpegBytes()))).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: "KYC_RESUBMISSION_FLIP_FAILED",
    });
    expect(calls.logInserts).toHaveLength(0);
  });
});
