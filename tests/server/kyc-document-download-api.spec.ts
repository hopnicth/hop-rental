/**
 * Tests: GET /api/admin/kyc/documents/:id/download (KYC document download — Phase 2)
 *
 * Locked spec: docs/kyc-phase-2-download-spec.md §5 (decisions.md 2026-06-05
 * Decisions B/D/E/G).
 *
 * Covers:
 *  1. No-oracle — non-super_admin gets a byte-identical 403 for existent,
 *     nonexistent, and malformed ids; kyc_documents is NEVER queried and
 *     Storage is NEVER touched on that path
 *  2. Denied audit logs — best-effort, correct action/result/reason vocabulary,
 *     single parsed IP, actor snapshot; a downed log table never escalates the
 *     uniform 403 into a 500
 *  3. Malformed-id log purity (Decision G) — document_id = null, the
 *     `*_malformed_*` reasons, and the raw attacker string NEVER appears in
 *     any log payload
 *  4. super_admin path — 400 malformed / 404 not found / 500 unsafe path /
 *     500 invalid MIME, each with its denial row; unsafe path is never fetched
 *     and never logged (storage_path null on that row)
 *  5. Fail-closed allowed log — written BEFORE the storage fetch; its failure
 *     is a 500 with zero storage access and zero bytes
 *  6. Storage fetch failure after the allowed row — 500 + best-effort
 *     `storage_download_failed` correction row whose own failure leaves the
 *     500 intact
 *  7. Success — bytes stream back intact; Cache-Control no-store, allowlisted
 *     Content-Type, nosniff, attachment with opaque filename; Content-Length
 *     OMITTED; no storage path / bucket / URL leakage in any header
 *  8. Source inspection — requirePlatformAdmin (not requireSuperAdmin), no
 *     createSignedUrl/getPublicUrl/serverSupabaseClient
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  adminError: null as any,
  platformRole: "super_admin" as string,
  client: null as any,
  params: {} as Record<string, string>,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: any) => handler,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
  getRouterParam: (_event: any, name: string) => mockState.params[name],
  getHeader: (event: any, name: string) =>
    event?.node?.req?.headers?.[name.toLowerCase()],
  setHeader: (event: any, name: string, value: string) => {
    event.__headers[name] = value;
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

const downloadGet = (
  await import("../../server/api/admin/kyc/documents/[id]/download.get")
).default;

const DOC_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROFILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SAFE_PATH = "kyc/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg";
const FILE_BYTES = Buffer.from("fake-jpeg-bytes-for-the-download-spike-test");

// ── Mock admin client ────────────────────────────────────────────────────────

interface ClientOpts {
  rowExists?: boolean;
  row?: Partial<Record<string, unknown>>;
  /** Make the kyc_documents read itself fail (infrastructure error). */
  readError?: { message: string } | null;
  /** Fail log inserts whose payload matches this predicate. */
  failLogWhen?: (payload: Record<string, unknown>) => boolean;
  downloadError?: { message: string } | null;
}

function makeClient(opts: ClientOpts = {}) {
  const calls = {
    documentQueries: 0,
    storageDownloads: [] as Array<{ bucket: string; path: string }>,
    logInserts: [] as Array<Record<string, unknown>>,
    sequence: [] as string[],
  };
  const client = {
    from(table: string) {
      if (table === "kyc_documents") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => {
            calls.documentQueries += 1;
            calls.sequence.push("kyc_documents:query");
            if (opts.readError) {
              return { data: null, error: opts.readError };
            }
            return {
              data:
                opts.rowExists === false
                  ? null
                  : {
                      id: DOC_ID,
                      kyc_profile_id: PROFILE_ID,
                      document_type: "id_card",
                      mime_type: "image/jpeg",
                      file_size_bytes: FILE_BYTES.byteLength,
                      storage_path: SAFE_PATH,
                      ...opts.row,
                    },
              error: null,
            };
          },
        };
        return chain;
      }
      if (table === "kyc_document_access_log") {
        return {
          insert: (payload: Record<string, unknown>) => {
            calls.logInserts.push(payload);
            calls.sequence.push(
              `log:${String(payload.result)}:${String(payload.reason)}`,
            );
            if (opts.failLogWhen?.(payload)) {
              return Promise.resolve({ error: { message: "log table down" } });
            }
            return Promise.resolve({ error: null });
          },
        };
      }
      // Fail LOUDLY on any unexpected table — silent queries are impossible.
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from(bucket: string) {
        return {
          download: async (path: string) => {
            calls.storageDownloads.push({ bucket, path });
            calls.sequence.push("storage:download");
            if (opts.downloadError) {
              return { data: null, error: opts.downloadError };
            }
            return { data: new Blob([FILE_BYTES]), error: null };
          },
        };
      },
    },
  };
  return { client, calls };
}

function makeEvent(headers: Record<string, string> = {}): any {
  return {
    node: { req: { headers, socket: { remoteAddress: "10.0.0.9" } } },
    __headers: {} as Record<string, string>,
  };
}

function setup(
  opts: ClientOpts & { role?: string; id?: string | undefined } = {},
) {
  const { client, calls } = makeClient(opts);
  mockState.client = client;
  mockState.platformRole = opts.role ?? "super_admin";
  mockState.params = {};
  if (opts.id !== undefined) mockState.params.id = opts.id;
  else mockState.params.id = DOC_ID;
  return { calls };
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function captureRejection(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("expected rejection");
  } catch (error) {
    const e = error as Error & { statusCode?: number; statusMessage?: string };
    return { statusCode: e.statusCode, statusMessage: e.statusMessage };
  }
}

beforeEach(() => {
  mockState.adminError = null;
  mockState.platformRole = "super_admin";
  mockState.client = null;
  mockState.params = { id: DOC_ID };
});

// ── 1. No-oracle: uniform 403 for every non-super_admin ─────────────────────

describe("no-oracle uniform 403 for non-super_admin", () => {
  it("staff gets a deep-equal 403 for existent, nonexistent, and malformed ids", async () => {
    const errors: Array<Record<string, unknown>> = [];
    for (const variant of [
      { id: DOC_ID, rowExists: true },
      { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", rowExists: false },
      { id: "../../etc/passwd", rowExists: true },
    ]) {
      setup({ role: "staff", id: variant.id, rowExists: variant.rowExists });
      errors.push(await captureRejection(downloadGet(makeEvent())));
    }
    expect(errors[0]).toEqual({
      statusCode: 403,
      statusMessage: "Super admin access required",
    });
    expect(errors[1]).toEqual(errors[0]);
    expect(errors[2]).toEqual(errors[0]);
  });

  it("never queries kyc_documents and never touches storage for staff", async () => {
    for (const id of [DOC_ID, "not-a-uuid"]) {
      const { calls } = setup({ role: "staff", id });
      await expect(downloadGet(makeEvent())).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(calls.documentQueries).toBe(0);
      expect(calls.storageDownloads).toHaveLength(0);
    }
  });

  it("customer guard rejection (401/403) passes through with zero side effects", async () => {
    const { calls } = setup();
    mockState.adminError = Object.assign(new Error("Authentication required"), {
      statusCode: 401,
    });
    await expect(downloadGet(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(calls.documentQueries).toBe(0);
    expect(calls.logInserts).toHaveLength(0);
    expect(calls.storageDownloads).toHaveLength(0);
  });
});

// ── 2 + 3. Denied logs + malformed-id purity ─────────────────────────────────

describe("denied audit logs", () => {
  it("staff + uuid-shaped id logs document_id=<id>, reason=not_super_admin with actor snapshot and single parsed IP", async () => {
    const { calls } = setup({ role: "staff", id: DOC_ID });
    const event = makeEvent({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18",
      "user-agent": "vitest",
    });
    await expect(downloadGet(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls.logInserts).toHaveLength(1);
    const log = calls.logInserts[0]!;
    expect(log.action).toBe("download");
    expect(log.result).toBe("denied");
    expect(log.reason).toBe("not_super_admin");
    expect(log.document_id).toBe(DOC_ID);
    expect(log.actor_user_id).toBe("admin-user-1");
    expect(log.actor_role).toBe("staff");
    expect(log.ip_address).toBe("203.0.113.7");
    expect(log.user_agent).toBe("vitest");
  });

  it("staff + malformed id logs document_id=null, reason=not_super_admin_malformed_id and NEVER the raw string", async () => {
    const raw = "../../etc/passwd<script>0812345678";
    const { calls } = setup({ role: "staff", id: raw });
    await expect(downloadGet(makeEvent())).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(calls.logInserts).toHaveLength(1);
    const log = calls.logInserts[0]!;
    expect(log.document_id).toBeNull();
    expect(log.reason).toBe("not_super_admin_malformed_id");
    expect(JSON.stringify(log)).not.toContain(raw);
    expect(JSON.stringify(log)).not.toContain("passwd");
    expect(calls.documentQueries).toBe(0);
  });

  it("super_admin + malformed id returns 400, logs document_id=null reason=malformed_document_id, never queries kyc_documents", async () => {
    const raw = "DROP TABLE kyc_documents";
    const { calls } = setup({ role: "super_admin", id: raw });
    await expect(downloadGet(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "INVALID_DOCUMENT_ID",
    });
    const log = calls.logInserts[0]!;
    expect(log.document_id).toBeNull();
    expect(log.reason).toBe("malformed_document_id");
    expect(JSON.stringify(log)).not.toContain(raw);
    expect(calls.documentQueries).toBe(0);
    expect(calls.storageDownloads).toHaveLength(0);
  });

  it("a downed log table never escalates the uniform 403 into a 500 (breadcrumb emitted)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { calls } = setup({ role: "staff", failLogWhen: () => true });
    await expect(downloadGet(makeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: "Super admin access required",
    });
    expect(calls.logInserts).toHaveLength(1); // attempted
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

// ── 4. super_admin: 404 / unsafe path / invalid MIME ─────────────────────────

describe("super_admin row + integrity gates", () => {
  it("404 only on the super_admin path when the row is missing, with a best-effort not_found row", async () => {
    const { calls } = setup({ rowExists: false });
    await expect(downloadGet(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
    });
    const log = calls.logInserts[0]!;
    expect(log.result).toBe("denied");
    expect(log.reason).toBe("not_found");
    expect(log.document_id).toBe(DOC_ID);
    expect(calls.storageDownloads).toHaveLength(0);
  });

  it("unsafe stored paths return 500, log reason=unsafe_path with storage_path=null, and are never fetched", async () => {
    const unsafePaths = [
      "kyc/../../etc/passwd",
      "https://evil.example/kyc/x.jpg",
      "users/123/id-card/x.jpg",
      "kyc/not-a-uuid.jpg",
      `kyc/${DOC_ID.toUpperCase()}.jpg`, // uppercase hex rejected (strict)
      "",
      null,
    ];
    for (const storage_path of unsafePaths) {
      const { calls } = setup({ row: { storage_path } });
      await expect(downloadGet(makeEvent())).rejects.toMatchObject({
        statusCode: 500,
        statusMessage: "KYC_DOCUMENT_UNSAFE_PATH",
      });
      const log = calls.logInserts[0]!;
      expect(log.reason).toBe("unsafe_path");
      expect(log.storage_path).toBeNull(); // PII-bearing path never logged
      if (typeof storage_path === "string" && storage_path.length > 0) {
        expect(JSON.stringify(log)).not.toContain(storage_path);
      }
      expect(calls.storageDownloads).toHaveLength(0);
    }
  });

  it("non-allowlisted or null mime_type returns 500 invalid_mime with no storage access", async () => {
    for (const mime_type of [null, "image/gif", "image/svg+xml", "text/html"]) {
      const { calls } = setup({ row: { mime_type } });
      await expect(downloadGet(makeEvent())).rejects.toMatchObject({
        statusCode: 500,
        statusMessage: "KYC_DOCUMENT_INVALID_MIME",
      });
      expect(calls.logInserts[0]!.reason).toBe("invalid_mime");
      expect(calls.storageDownloads).toHaveLength(0);
    }
  });

  it("DB read error returns opaque 500 KYC_DOCUMENT_READ_FAILED (raw DB text never leaks) with a best-effort read_failed row and no storage access", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { calls } = setup({ readError: { message: "db down" } });
    const rejection = await captureRejection(downloadGet(makeEvent()));
    expect(rejection).toEqual({
      statusCode: 500,
      statusMessage: "KYC_DOCUMENT_READ_FAILED",
    });
    // The raw Postgres/Supabase message must never reach the client.
    expect(JSON.stringify(rejection)).not.toContain("db down");
    // Best-effort denial row attempted: denied/read_failed, valid uuid,
    // no storage path (the row was never loaded).
    expect(calls.logInserts).toHaveLength(1);
    const log = calls.logInserts[0]!;
    expect(log.result).toBe("denied");
    expect(log.reason).toBe("read_failed");
    expect(log.document_id).toBe(DOC_ID);
    expect(log.storage_path).toBeNull();
    // No allowed row, no storage access on this path.
    expect(calls.logInserts.some((l) => l.result === "allowed")).toBe(false);
    expect(calls.storageDownloads).toHaveLength(0);
    // Real error is breadcrumbed server-side.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a downed log table on the read_failed path leaves the opaque 500 intact (best-effort, not fail-closed)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setup({
      readError: { message: "db down" },
      failLogWhen: (p) => p.reason === "read_failed",
    });
    await expect(downloadGet(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: "KYC_DOCUMENT_READ_FAILED",
    });
    errorSpy.mockRestore();
  });
});

// ── 5. Fail-closed allowed log ───────────────────────────────────────────────

describe("fail-closed allowed log", () => {
  it("allowed-log failure returns 500 and storage is NEVER touched (zero bytes)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { calls } = setup({
      failLogWhen: (p) => p.result === "allowed",
    });
    await expect(downloadGet(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: "KYC_ACCESS_LOG_WRITE_FAILED",
    });
    expect(calls.storageDownloads).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("the allowed row is written BEFORE the storage fetch (call order)", async () => {
    const { calls } = setup();
    await downloadGet(makeEvent());
    const allowedIdx = calls.sequence.indexOf("log:allowed:null");
    const downloadIdx = calls.sequence.indexOf("storage:download");
    expect(allowedIdx).toBeGreaterThanOrEqual(0);
    expect(downloadIdx).toBeGreaterThan(allowedIdx);
  });

  it("allowed row carries opaque references: document, profile, type, bucket, opaque path", async () => {
    const { calls } = setup();
    await downloadGet(makeEvent());
    const allowed = calls.logInserts.find((l) => l.result === "allowed")!;
    expect(allowed.action).toBe("download");
    expect(allowed.reason).toBeNull();
    expect(allowed.document_id).toBe(DOC_ID);
    expect(allowed.kyc_profile_id).toBe(PROFILE_ID);
    expect(allowed.document_type).toBe("id_card");
    expect(allowed.storage_bucket).toBe("kyc-profile-documents");
    expect(allowed.storage_path).toBe(SAFE_PATH);
  });
});

// ── 6. Storage fetch failure after the allowed row ───────────────────────────

describe("storage fetch failure after grant", () => {
  it("returns 500 and writes a best-effort storage_download_failed correction row", async () => {
    const { calls } = setup({ downloadError: { message: "object missing" } });
    await expect(downloadGet(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: "KYC_DOCUMENT_DOWNLOAD_FAILED",
    });
    expect(calls.sequence).toEqual([
      "kyc_documents:query",
      "log:allowed:null",
      "storage:download",
      "log:denied:storage_download_failed",
    ]);
  });

  it("the correction row's own failure leaves the 500 intact (never KYC_ACCESS_LOG_WRITE_FAILED)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setup({
      downloadError: { message: "object missing" },
      failLogWhen: (p) => p.reason === "storage_download_failed",
    });
    await expect(downloadGet(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: "KYC_DOCUMENT_DOWNLOAD_FAILED",
    });
    errorSpy.mockRestore();
  });
});

// ── 7. Success path ──────────────────────────────────────────────────────────

describe("successful download", () => {
  it("streams the exact bytes back", async () => {
    setup();
    const stream = await downloadGet(makeEvent());
    const body = await readStream(stream);
    expect(body.equals(FILE_BYTES)).toBe(true);
  });

  it("sets the safe header set and OMITS Content-Length", async () => {
    setup();
    const event = makeEvent();
    await downloadGet(event);
    expect(event.__headers["Cache-Control"]).toBe("no-store");
    expect(event.__headers["Content-Type"]).toBe("image/jpeg");
    expect(event.__headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(event.__headers["Content-Disposition"]).toBe(
      `attachment; filename="kyc-${DOC_ID}.jpg"`,
    );
    const headerNames = Object.keys(event.__headers).map((h) => h.toLowerCase());
    expect(headerNames).not.toContain("content-length");
  });

  it("never leaks storage path, bucket, or any URL through headers", async () => {
    setup();
    const event = makeEvent();
    await downloadGet(event);
    const serialized = JSON.stringify(event.__headers);
    expect(serialized).not.toContain(SAFE_PATH);
    expect(serialized).not.toContain("kyc-profile-documents");
    expect(serialized).not.toContain("storage");
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("signedUrl");
  });

  it("uses the extension derived from the stored MIME for the opaque filename (pdf)", async () => {
    setup({
      row: {
        mime_type: "application/pdf",
        storage_path: "kyc/cccccccc-cccc-4ccc-8ccc-cccccccccccc.pdf",
      },
    });
    const event = makeEvent();
    await downloadGet(event);
    expect(event.__headers["Content-Type"]).toBe("application/pdf");
    expect(event.__headers["Content-Disposition"]).toBe(
      `attachment; filename="kyc-${DOC_ID}.pdf"`,
    );
  });

  it("accepts an uppercase route id but normalizes it (logs + filename use lowercase)", async () => {
    const { calls } = setup({ id: DOC_ID.toUpperCase() });
    const event = makeEvent();
    await downloadGet(event);
    const allowed = calls.logInserts.find((l) => l.result === "allowed")!;
    expect(allowed.document_id).toBe(DOC_ID);
    expect(event.__headers["Content-Disposition"]).toContain(`kyc-${DOC_ID}.jpg`);
  });
});

// ── 8. Source inspection ─────────────────────────────────────────────────────

describe("source contract", () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      "server/api/admin/kyc/documents/[id]/download.get.ts",
    ),
    "utf8",
  );

  it("uses requirePlatformAdmin (explicit role check), never requireSuperAdmin", () => {
    expect(src).toContain("requirePlatformAdmin");
    expect(src).not.toContain("requireSuperAdmin");
  });

  it("never mints signed/public URLs and never uses the RLS-bound client", () => {
    expect(src).not.toContain("createSignedUrl");
    expect(src).not.toContain("getPublicUrl");
    expect(src).not.toContain("serverSupabaseClient");
  });

  it("uses the internal download select and the fail-closed log option", () => {
    expect(src).toContain("KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT");
    expect(src).toContain("failClosed: true");
  });
});
