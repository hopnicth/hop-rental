/**
 * Tests: server/utils/kyc-documents.ts + server/utils/kyc-document-view.ts
 *
 * Covers:
 *  1. readRawBodyWithHardLimit — counts ACTUAL bytes; 413 past the cap; works
 *     with chunked streams (no Content-Length concept at all); destroys the
 *     source stream on overflow; returns the full buffer when under the cap
 *  2. sniffKycDocumentMime — JPEG/PNG/PDF magic accepted with canonical MIME;
 *     PNG requires the FULL 8-byte signature; SVG, fake-MIME, truncated,
 *     offset-shifted, and empty inputs rejected
 *  3. buildKycDocumentStorageKey — opaque `kyc/<uuid>.<ext>` format, unique per
 *     call, extension follows canonical MIME, no inputs besides MIME
 *  4. parseSingleForwardedIp — single validated IP from a multi-hop chain;
 *     invalid/garbage/empty → null (never a raw comma chain)
 *  5. logKycDocumentAccess — payload typed against the GENERATED migration-109
 *     Insert type; best-effort by default (returns false + console.error
 *     breadcrumb, never throws); failClosed → 500
 *  6. parseKycDateOnly / isFutureKycDate — strict YYYY-MM-DD validation and
 *     Asia/Bangkok future check for issued_at / expires_at capture
 *  7. KYC document safe view — SELECT/mapper never expose storage_path,
 *     storage_bucket, URLs, or uploader id
 *  8. Phase 2 download helpers (docs/kyc-phase-2-download-spec.md §2.3) —
 *     isSafeKycDocumentStoragePath round-trips keys from the REAL builder for
 *     every MIME in the map (single source of truth); rejects traversal/URL/
 *     legacy/non-UUID/uppercase-hex/empty/non-string; kycDocumentExtensionForMime
 *     allowlist; asUuidOrNull strict classification (Decision G log purity);
 *     KycDocumentAccessAction includes 'download'; internal download SELECT
 *     includes storage_path while the safe SELECT still excludes it
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "~/types/database.types";
import {
  KYC_DOCUMENT_MAX_FILE_BYTES,
  KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES,
  KYC_PROFILE_DOCUMENTS_BUCKET,
  asUuidOrNull,
  buildKycDocumentStorageKey,
  isFutureKycDate,
  isSafeKycDocumentStoragePath,
  kycDocumentExtensionForMime,
  logKycDocumentAccess,
  parseKycDateOnly,
  parseSingleForwardedIp,
  readRawBodyWithHardLimit,
  sniffKycDocumentMime,
  type KycDocumentAccessAction,
  type KycDocumentAccessLogEntry,
  type KycDocumentAccessLogInsert,
  type KycDocumentCanonicalMime,
} from "../../server/utils/kyc-documents";
import {
  KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT,
  KYC_DOCUMENT_SAFE_SELECT,
  toSafeKycDocument,
} from "../../server/utils/kyc-document-view";

// ── Helpers ──────────────────────────────────────────────────────────────────

function jpegBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

/** Full 8-byte PNG signature: 89 50 4E 47 0D 0A 1A 0A */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function pngBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  PNG_SIGNATURE.forEach((byte, i) => {
    buf[i] = byte;
  });
  return buf;
}

function pdfBytes(size = 64): Buffer {
  const buf = Buffer.alloc(size);
  Buffer.from("%PDF-1.7").copy(buf);
  return buf;
}

/** Mock readable: yields `chunks`, records destroy() calls. */
function mockStream(chunks: Buffer[], onDestroy?: () => void) {
  let destroyed = false;
  return {
    get destroyed() {
      return destroyed;
    },
    destroy() {
      destroyed = true;
      onDestroy?.();
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        if (destroyed) return;
        yield chunk;
      }
    },
  };
}

function chunked(total: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = [];
  for (let i = 0; i < total.length; i += chunkSize) {
    chunks.push(total.subarray(i, i + chunkSize));
  }
  return chunks;
}

// ── readRawBodyWithHardLimit ─────────────────────────────────────────────────

describe("readRawBodyWithHardLimit", () => {
  it("returns the full buffer when under the limit", async () => {
    const body = Buffer.from("hello world");
    const stream = mockStream(chunked(body, 4));
    const result = await readRawBodyWithHardLimit(stream, 1024);
    expect(result.equals(body)).toBe(true);
  });

  it("throws 413 once ACTUAL bytes exceed the limit (chunked, no Content-Length)", async () => {
    // 1 MiB streamed in 64 KiB chunks with NO length declared anywhere —
    // simulates chunked transfer encoding. The limiter must still stop it.
    const body = Buffer.alloc(1024 * 1024);
    const stream = mockStream(chunked(body, 64 * 1024));
    await expect(
      readRawBodyWithHardLimit(stream, 256 * 1024),
    ).rejects.toMatchObject({ statusCode: 413 });
  });

  it("never consults any declared length — a tiny spoofed Content-Length cannot bypass it", async () => {
    // The function has no access to headers at all; feed >limit actual bytes
    // and assert rejection purely on byte count.
    const body = Buffer.alloc(2048);
    const stream = mockStream(chunked(body, 100));
    await expect(
      readRawBodyWithHardLimit(stream, 1024),
    ).rejects.toMatchObject({ statusCode: 413 });
  });

  it("destroys the source stream on overflow", async () => {
    let destroyCalls = 0;
    const stream = mockStream(chunked(Buffer.alloc(4096), 512), () => {
      destroyCalls += 1;
    });
    await expect(readRawBodyWithHardLimit(stream, 1024)).rejects.toMatchObject({
      statusCode: 413,
    });
    expect(destroyCalls).toBe(1);
  });

  it("accepts a body exactly at the limit", async () => {
    const body = Buffer.alloc(1024);
    const stream = mockStream(chunked(body, 256));
    const result = await readRawBodyWithHardLimit(stream, 1024);
    expect(result.byteLength).toBe(1024);
  });
});

// ── sniffKycDocumentMime ─────────────────────────────────────────────────────

describe("sniffKycDocumentMime", () => {
  it("sniffs JPEG magic (FF D8 FF) → image/jpeg", () => {
    expect(sniffKycDocumentMime(jpegBytes())).toBe("image/jpeg");
  });

  it("sniffs the FULL 8-byte PNG signature (89 50 4E 47 0D 0A 1A 0A) → image/png", () => {
    expect(sniffKycDocumentMime(pngBytes())).toBe("image/png");
    expect(sniffKycDocumentMime(Buffer.from(PNG_SIGNATURE))).toBe("image/png");
  });

  it("rejects a truncated/partial PNG signature", () => {
    // First 4 bytes only — the old, weaker check would have accepted this.
    expect(
      sniffKycDocumentMime(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    ).toBeNull();
    // 4-byte prefix followed by wrong tail bytes.
    const corrupted = pngBytes();
    corrupted[4] = 0x00;
    expect(sniffKycDocumentMime(corrupted)).toBeNull();
    // 7 of 8 signature bytes.
    expect(
      sniffKycDocumentMime(Buffer.from(PNG_SIGNATURE.slice(0, 7))),
    ).toBeNull();
  });

  it("sniffs PDF magic (%PDF- at offset 0) → application/pdf", () => {
    expect(sniffKycDocumentMime(pdfBytes())).toBe("application/pdf");
  });

  it("rejects SVG content", () => {
    expect(
      sniffKycDocumentMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(
      sniffKycDocumentMime(Buffer.from('<?xml version="1.0"?><svg/>')),
    ).toBeNull();
  });

  it("rejects arbitrary content regardless of any client-declared MIME", () => {
    expect(sniffKycDocumentMime(Buffer.from("plain text pretending"))).toBeNull();
    expect(sniffKycDocumentMime(Buffer.from([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(sniffKycDocumentMime(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // ZIP
  });

  it("rejects %PDF- NOT at offset 0", () => {
    expect(sniffKycDocumentMime(Buffer.from(" %PDF-1.7"))).toBeNull();
  });

  it("rejects truncated magic and empty input", () => {
    expect(sniffKycDocumentMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffKycDocumentMime(Buffer.alloc(0))).toBeNull();
  });
});

// ── buildKycDocumentStorageKey ───────────────────────────────────────────────

describe("buildKycDocumentStorageKey", () => {
  const UUID_KEY_RE =
    /^kyc\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|pdf)$/;

  it("produces an opaque kyc/<uuid>.<ext> key", () => {
    expect(buildKycDocumentStorageKey("image/jpeg")).toMatch(UUID_KEY_RE);
  });

  it("extension follows the canonical sniffed MIME", () => {
    expect(buildKycDocumentStorageKey("image/jpeg").endsWith(".jpg")).toBe(true);
    expect(buildKycDocumentStorageKey("image/png").endsWith(".png")).toBe(true);
    expect(buildKycDocumentStorageKey("application/pdf").endsWith(".pdf")).toBe(true);
  });

  it("is random per call (non-guessable, not derived from any identifier)", () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => buildKycDocumentStorageKey("image/png")),
    );
    expect(keys.size).toBe(50);
  });

  it("takes only the MIME — profile/identity inputs cannot reach the key by construction", () => {
    // Signature-level guarantee: the function accepts a single MIME argument.
    expect(buildKycDocumentStorageKey.length).toBe(1);
  });
});

// ── parseSingleForwardedIp ───────────────────────────────────────────────────

describe("parseSingleForwardedIp", () => {
  it("returns a bare valid IPv4 unchanged", () => {
    expect(parseSingleForwardedIp("203.0.113.7")).toBe("203.0.113.7");
  });

  it("takes ONLY the first hop of a multi-hop comma chain", () => {
    expect(
      parseSingleForwardedIp("203.0.113.7, 70.41.3.18, 150.172.238.178"),
    ).toBe("203.0.113.7");
  });

  it("never returns a raw comma chain", () => {
    const result = parseSingleForwardedIp("203.0.113.7, 70.41.3.18");
    expect(result).not.toContain(",");
  });

  it("supports IPv6 with surrounding whitespace", () => {
    expect(parseSingleForwardedIp(" 2001:db8::1 , 10.0.0.1")).toBe("2001:db8::1");
  });

  it("returns null when the first hop is not a valid IP", () => {
    expect(parseSingleForwardedIp("unknown, 203.0.113.7")).toBeNull();
    expect(parseSingleForwardedIp("203.0.113.7:8080")).toBeNull();
    expect(parseSingleForwardedIp("<script>")).toBeNull();
  });

  it("returns null for empty / missing values", () => {
    expect(parseSingleForwardedIp("")).toBeNull();
    expect(parseSingleForwardedIp("   ")).toBeNull();
    expect(parseSingleForwardedIp(undefined)).toBeNull();
    expect(parseSingleForwardedIp(null)).toBeNull();
    expect(parseSingleForwardedIp(42)).toBeNull();
  });
});

// ── logKycDocumentAccess ─────────────────────────────────────────────────────

function makeLogClient(opts: { error?: { message: string } | null; reject?: boolean } = {}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          if (opts.reject) return Promise.reject(new Error("connection down"));
          return Promise.resolve({ error: opts.error ?? null });
        },
      };
    },
  };
  return { client, inserts };
}

const FULL_ENTRY: KycDocumentAccessLogEntry = {
  documentId: "11111111-1111-4111-8111-111111111111",
  kycProfileId: "22222222-2222-4222-8222-222222222222",
  actorUserId: "33333333-3333-4333-8333-333333333333",
  actorRole: "staff",
  action: "upload",
  result: "allowed",
  reason: null,
  documentType: "id_card",
  storageBucket: KYC_PROFILE_DOCUMENTS_BUCKET,
  storagePath: "kyc/44444444-4444-4444-8444-444444444444.jpg",
  ipAddress: "203.0.113.7",
  userAgent: "vitest",
};

describe("logKycDocumentAccess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("payload type matches the GENERATED kyc_document_access_log Insert type (compile-time)", () => {
    // Compile-time guarantee: this literal must satisfy the generated Insert
    // shape. Column-name drift after a types regen becomes a tsc error here
    // and inside logKycDocumentAccess itself.
    const payload: KycDocumentAccessLogInsert = {
      document_id: null,
      kyc_profile_id: null,
      actor_user_id: null,
      actor_role: null,
      action: "upload",
      result: "allowed",
      reason: null,
      document_type: "id_card",
      storage_bucket: null,
      storage_path: null,
      ip_address: null,
      user_agent: null,
    };
    type GeneratedInsert =
      Database["public"]["Tables"]["kyc_document_access_log"]["Insert"];
    const roundTrip: GeneratedInsert = payload; // helper alias ≡ generated type
    expect(roundTrip.action).toBe("upload");
    expect(roundTrip.result).toBe("allowed");
  });

  it("writes the final migration-109 column names", async () => {
    const { client, inserts } = makeLogClient();
    const ok = await logKycDocumentAccess(client, FULL_ENTRY);
    expect(ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.table).toBe("kyc_document_access_log");
    expect(inserts[0]!.payload).toEqual({
      document_id: FULL_ENTRY.documentId,
      kyc_profile_id: FULL_ENTRY.kycProfileId,
      actor_user_id: FULL_ENTRY.actorUserId,
      actor_role: "staff",
      action: "upload",
      result: "allowed",
      reason: null,
      document_type: "id_card",
      storage_bucket: KYC_PROFILE_DOCUMENTS_BUCKET,
      storage_path: FULL_ENTRY.storagePath,
      ip_address: "203.0.113.7",
      user_agent: "vitest",
    });
  });

  it("defaults omitted optional fields to null", async () => {
    const { client, inserts } = makeLogClient();
    await logKycDocumentAccess(client, { action: "upload", result: "allowed" });
    const payload = inserts[0]!.payload;
    expect(payload.document_id).toBeNull();
    expect(payload.kyc_profile_id).toBeNull();
    expect(payload.actor_user_id).toBeNull();
    expect(payload.ip_address).toBeNull();
    expect(payload.user_agent).toBeNull();
  });

  it("is best-effort by default — insert error returns false and emits a console.error breadcrumb", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeLogClient({ error: { message: "rls denied" } });
    await expect(logKycDocumentAccess(client, FULL_ENTRY)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]![0])).toContain(
      "kyc_document_access_log write failed",
    );
  });

  it("is best-effort by default — insert rejection returns false and emits a console.error breadcrumb", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeLogClient({ reject: true });
    await expect(logKycDocumentAccess(client, FULL_ENTRY)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("emits no console.error breadcrumb on success", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeLogClient();
    await expect(logKycDocumentAccess(client, FULL_ENTRY)).resolves.toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("failClosed: true throws 500 on log failure (future allowed-download contract)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeLogClient({ error: { message: "rls denied" } });
    await expect(
      logKycDocumentAccess(client, FULL_ENTRY, { failClosed: true }),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

// ── parseKycDateOnly / isFutureKycDate ───────────────────────────────────────

describe("parseKycDateOnly", () => {
  it("accepts a canonical YYYY-MM-DD date", () => {
    expect(parseKycDateOnly("2026-01-15")).toBe("2026-01-15");
    expect(parseKycDateOnly("  2026-01-15  ")).toBe("2026-01-15");
  });

  it("rejects non-ISO formats", () => {
    expect(parseKycDateOnly("15/01/2026")).toBeNull();
    expect(parseKycDateOnly("2026-1-5")).toBeNull();
    expect(parseKycDateOnly("2026-01-15T00:00:00Z")).toBeNull();
    expect(parseKycDateOnly("Jan 15, 2026")).toBeNull();
  });

  it("rejects non-existent calendar dates (no Date rollover)", () => {
    expect(parseKycDateOnly("2026-02-31")).toBeNull();
    expect(parseKycDateOnly("2026-13-01")).toBeNull();
    expect(parseKycDateOnly("2026-00-10")).toBeNull();
  });

  it("rejects non-string / empty input", () => {
    expect(parseKycDateOnly(undefined)).toBeNull();
    expect(parseKycDateOnly(null)).toBeNull();
    expect(parseKycDateOnly(20260115)).toBeNull();
    expect(parseKycDateOnly("")).toBeNull();
  });
});

describe("isFutureKycDate", () => {
  // Fixed "now": 2026-06-04T10:00:00Z = 2026-06-04 17:00 Asia/Bangkok.
  const NOW = new Date("2026-06-04T10:00:00.000Z");

  it("past and today (Bangkok) are not future", () => {
    expect(isFutureKycDate("2025-12-31", NOW)).toBe(false);
    expect(isFutureKycDate("2026-06-04", NOW)).toBe(false);
  });

  it("tomorrow (Bangkok) is future", () => {
    expect(isFutureKycDate("2026-06-05", NOW)).toBe(true);
    expect(isFutureKycDate("2099-01-01", NOW)).toBe(true);
  });

  it("uses Asia/Bangkok, not UTC, for the today boundary", () => {
    // 2026-06-04T18:30Z is already 2026-06-05 01:30 in Bangkok — a document
    // issued "2026-06-05" (today in Thailand) must NOT be flagged as future.
    const lateUtc = new Date("2026-06-04T18:30:00.000Z");
    expect(isFutureKycDate("2026-06-05", lateUtc)).toBe(false);
    expect(isFutureKycDate("2026-06-06", lateUtc)).toBe(true);
  });
});

// ── Safe view — serializer + SELECT ──────────────────────────────────────────

describe("KYC document safe view", () => {
  const ROW = {
    id: "doc-1",
    kyc_profile_id: "profile-1",
    document_type: "id_card",
    mime_type: "image/jpeg",
    file_size_bytes: 12345,
    uploaded_at: "2026-06-04T00:00:00.000Z",
    created_at: "2026-06-04T00:00:00.000Z",
  };

  it("KYC_DOCUMENT_SAFE_SELECT never includes storage or uploader columns", () => {
    expect(KYC_DOCUMENT_SAFE_SELECT).not.toContain("storage_path");
    expect(KYC_DOCUMENT_SAFE_SELECT).not.toContain("storage_bucket");
    expect(KYC_DOCUMENT_SAFE_SELECT).not.toContain("uploaded_by_user_id");
  });

  it("maps only safe metadata", () => {
    expect(toSafeKycDocument(ROW)).toEqual({
      id: "doc-1",
      kycProfileId: "profile-1",
      documentType: "id_card",
      mimeType: "image/jpeg",
      fileSizeBytes: 12345,
      uploadedAt: "2026-06-04T00:00:00.000Z",
      createdAt: "2026-06-04T00:00:00.000Z",
    });
  });

  it("never exposes storage path, bucket, or URLs — even if present on the row", () => {
    const dirty = {
      ...ROW,
      storage_path: "kyc/secret.jpg",
      storage_bucket: "kyc-profile-documents",
      signed_url: "https://example.com/signed",
    } as typeof ROW;
    const serialized = JSON.stringify(toSafeKycDocument(dirty));
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("storage_bucket");
    expect(serialized).not.toContain("storageBucket");
    expect(serialized).not.toContain("kyc/secret.jpg");
    expect(serialized).not.toContain("http");
  });
});

// ── Phase 2 download helpers ─────────────────────────────────────────────────

const ALL_CANONICAL_MIMES: KycDocumentCanonicalMime[] = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

describe("isSafeKycDocumentStoragePath", () => {
  it("round-trips every key the REAL builder produces, for every MIME in the map", () => {
    for (const mime of ALL_CANONICAL_MIMES) {
      const key = buildKycDocumentStorageKey(mime);
      expect(isSafeKycDocumentStoragePath(key)).toBe(true);
    }
  });

  it("rejects traversal, URLs, legacy paths, non-UUID keys, and absolute paths", () => {
    for (const bad of [
      "kyc/../../etc/passwd",
      "kyc/../x.jpg",
      "https://evil.example/kyc/a.jpg",
      "http://x/kyc/a.jpg",
      "users/123/id-card/x.jpg",
      "walk-in-customers/0812345678/id-card/x.jpg",
      "kyc/not-a-uuid.jpg",
      "/kyc/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg",
      "kyc/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg.exe",
      "kyc/cccccccc-cccc-4ccc-8ccc-cccccccccccc.svg",
    ]) {
      expect(isSafeKycDocumentStoragePath(bad)).toBe(false);
    }
  });

  it("rejects uppercase hex (strict — the builder only emits lowercase)", () => {
    const key = buildKycDocumentStorageKey("image/jpeg");
    expect(isSafeKycDocumentStoragePath(key.toUpperCase())).toBe(false);
  });

  it("rejects empty and non-string inputs", () => {
    expect(isSafeKycDocumentStoragePath("")).toBe(false);
    expect(isSafeKycDocumentStoragePath(null)).toBe(false);
    expect(isSafeKycDocumentStoragePath(undefined)).toBe(false);
    expect(isSafeKycDocumentStoragePath(42)).toBe(false);
  });

  it("treats the extension dot as a literal (regex metacharacters are escaped)", () => {
    const key = buildKycDocumentStorageKey("image/jpeg");
    // '.' must not act as a wildcard: replacing it with another char must fail.
    expect(isSafeKycDocumentStoragePath(key.replace(".jpg", "Xjpg"))).toBe(false);
    // And a mutated extension must fail (alternation is exact, not prefix).
    expect(isSafeKycDocumentStoragePath(key.replace(".jpg", ".jp"))).toBe(false);
    expect(isSafeKycDocumentStoragePath(key.replace(".jpg", ".jpgg"))).toBe(false);
  });
});

describe("kycDocumentExtensionForMime", () => {
  it("maps every canonical MIME to its extension (same map as the builder)", () => {
    expect(kycDocumentExtensionForMime("image/jpeg")).toBe("jpg");
    expect(kycDocumentExtensionForMime("image/png")).toBe("png");
    expect(kycDocumentExtensionForMime("application/pdf")).toBe("pdf");
  });

  it("fails closed on anything outside the allowlist", () => {
    expect(kycDocumentExtensionForMime("image/gif")).toBeNull();
    expect(kycDocumentExtensionForMime("image/svg+xml")).toBeNull();
    expect(kycDocumentExtensionForMime("")).toBeNull();
    expect(kycDocumentExtensionForMime(null)).toBeNull();
    expect(kycDocumentExtensionForMime(undefined)).toBeNull();
  });
});

describe("asUuidOrNull (Decision G — audit-log purity)", () => {
  const UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("returns a lowercase uuid unchanged", () => {
    expect(asUuidOrNull(UUID)).toBe(UUID);
  });

  it("accepts uppercase but normalizes to lowercase", () => {
    expect(asUuidOrNull(UUID.toUpperCase())).toBe(UUID);
  });

  it("returns null for near-UUIDs, padding, and injection-ish strings", () => {
    expect(asUuidOrNull(`${UUID}x`)).toBeNull();
    expect(asUuidOrNull(UUID.slice(0, -1))).toBeNull();
    expect(asUuidOrNull(` ${UUID}`)).toBeNull();
    expect(asUuidOrNull(UUID.replace(/-/g, ""))).toBeNull();
    expect(asUuidOrNull("../../etc/passwd")).toBeNull();
    expect(asUuidOrNull("DROP TABLE kyc_documents")).toBeNull();
    expect(asUuidOrNull("<script>alert(1)</script>")).toBeNull();
  });

  it("returns null for empty / non-string input", () => {
    expect(asUuidOrNull("")).toBeNull();
    expect(asUuidOrNull(null)).toBeNull();
    expect(asUuidOrNull(undefined)).toBeNull();
    expect(asUuidOrNull(42)).toBeNull();
  });
});

describe("download action + internal select contract", () => {
  it("KycDocumentAccessAction includes 'download' (migration 110 vocabulary)", () => {
    const action: KycDocumentAccessAction = "download";
    expect(action).toBe("download");
  });

  it("internal download SELECT includes storage_path but never uploader/bucket columns", () => {
    expect(KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT).toContain("storage_path");
    expect(KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT).not.toContain(
      "uploaded_by_user_id",
    );
  });

  it("the SAFE select still excludes storage_path (the internal select did not leak into it)", () => {
    expect(KYC_DOCUMENT_SAFE_SELECT).not.toContain("storage_path");
  });
});

// ── Constants sanity ─────────────────────────────────────────────────────────

describe("KYC document constants", () => {
  it("max file size is exactly 10 MB (bucket parity with migration 109)", () => {
    expect(KYC_DOCUMENT_MAX_FILE_BYTES).toBe(10485760);
  });

  it("body hard limit covers the max file plus multipart overhead only", () => {
    expect(KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES).toBeGreaterThan(
      KYC_DOCUMENT_MAX_FILE_BYTES,
    );
    expect(KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES).toBeLessThanOrEqual(
      KYC_DOCUMENT_MAX_FILE_BYTES + 1024 * 1024,
    );
  });

  it("uses the dedicated bucket, not the legacy partner bucket", () => {
    expect(KYC_PROFILE_DOCUMENTS_BUCKET).toBe("kyc-profile-documents");
  });
});
