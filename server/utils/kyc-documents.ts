/**
 * KYC document upload/storage helpers + access-log writer (Phase 1B upload +
 * Phase 2 download — docs/kyc-phase-2-download-spec.md).
 *
 * Covers:
 *  - Bucket + size-limit constants for the dedicated `kyc-profile-documents` bucket
 *  - readRawBodyWithHardLimit — streaming body reader with a HARD byte cap that
 *    counts actual bytes (never trusts Content-Length; defends against chunked
 *    transfer and spoofed/missing Content-Length headers)
 *  - sniffKycDocumentMime — magic-byte content sniffing (JPEG/PNG/PDF only);
 *    the client-declared MIME is NEVER trusted
 *  - buildKycDocumentStorageKey — opaque random-UUID object key, by construction
 *    not derived from profile id, identity value, or any human-readable input
 *  - isSafeKycDocumentStoragePath — fail-closed validator for STORED paths;
 *    its extension alternation is derived from KYC_DOCUMENT_MIME_EXTENSIONS
 *    (single source of truth with the key builder — they cannot drift)
 *  - kycDocumentExtensionForMime — canonical MIME → extension lookup (the only
 *    sanctioned mapping; download filenames must derive from it)
 *  - asUuidOrNull — strict UUID-shape classifier for route ids so a raw
 *    attacker-controlled string is NEVER inserted into the uuid-typed
 *    kyc_document_access_log.document_id column (decisions.md Decision G)
 *  - parseSingleForwardedIp — extracts ONE validated IP from an x-forwarded-for
 *    chain so a multi-hop comma list is never inserted into an `inet` column
 *  - logKycDocumentAccess — append-only writer for public.kyc_document_access_log
 *    (best-effort by default; failClosed for allowed-download logging);
 *    payload typed against the generated database.types.ts Insert shape
 *  - parseKycDateOnly / isFutureKycDate — strict YYYY-MM-DD date-only input
 *    validation for kyc_documents.issued_at / expires_at capture
 *
 * SECURITY / INVARIANTS (security-core — migration 109 contract):
 *  - kyc_document_access_log is IMMUTABLE and outlives the document. It must
 *    store ONLY opaque references and non-PII snapshots. Never pass customer
 *    names, identity numbers, document numbers, phone numbers, or any
 *    non-opaque / human-readable storage path into the log entry.
 *  - Storage object keys are `kyc/<random-uuid>.<ext>` — opaque, non-guessable,
 *    never derived from profile id or identity values.
 *  - Canonical MIME comes from magic-byte sniffing only; SVG and every other
 *    type is rejected (sniff returns null).
 */
import { createError } from "h3";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Database } from "~/types/database.types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Dedicated private bucket (migration 109). NOT the legacy partner `kyc-documents`. */
export const KYC_PROFILE_DOCUMENTS_BUCKET = "kyc-profile-documents";

/** Max ACTUAL file bytes (10 MB) — matches the bucket-level file_size_limit. */
export const KYC_DOCUMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Hard cap for the whole multipart request body: max file + a small allowance
 * for multipart boundaries/fields. The streaming reader aborts past this point
 * regardless of what Content-Length claims.
 */
export const KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES =
  KYC_DOCUMENT_MAX_FILE_BYTES + 256 * 1024;

/** Canonical sniffed MIME types accepted for KYC documents. */
export type KycDocumentCanonicalMime =
  | "image/jpeg"
  | "image/png"
  | "application/pdf";

const KYC_DOCUMENT_MIME_EXTENSIONS: Record<KycDocumentCanonicalMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

// ── Hard streaming body limit ────────────────────────────────────────────────

/** Minimal readable shape — Node IncomingMessage satisfies this. */
export interface ByteLimitedReadable {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
  destroy?: (error?: Error) => void;
}

/**
 * Read a request body stream into a Buffer with a HARD byte cap.
 *
 * Counts ACTUAL bytes as chunks arrive — it never consults Content-Length, so
 * a spoofed/absent Content-Length or chunked transfer encoding cannot bypass
 * the limit. On overflow the source stream is destroyed and a 413 is thrown
 * before any further buffering.
 */
export async function readRawBodyWithHardLimit(
  stream: ByteLimitedReadable,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : typeof chunk === "string"
        ? Buffer.from(chunk)
        : Buffer.from(chunk as Uint8Array);
    totalBytes += buf.byteLength;
    if (totalBytes > maxBytes) {
      stream.destroy?.();
      throw createError({
        statusCode: 413,
        statusMessage: "PAYLOAD_TOO_LARGE",
      });
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

// ── Magic-byte MIME sniffing ─────────────────────────────────────────────────

const MAGIC_JPEG = [0xff, 0xd8, 0xff] as const;
// Full 8-byte PNG signature (not just the 4-byte "\x89PNG" prefix).
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const MAGIC_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // "%PDF-" at offset 0

function startsWithBytes(
  bytes: Uint8Array,
  magic: readonly number[],
): boolean {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((expected, i) => bytes[i] === expected);
}

/**
 * Sniff the canonical MIME from file content (magic bytes at offset 0).
 * Returns null for everything that is not JPEG/PNG/PDF — including SVG, which
 * is rejected by design (scriptable). The client-declared MIME is irrelevant.
 */
export function sniffKycDocumentMime(
  bytes: Uint8Array,
): KycDocumentCanonicalMime | null {
  if (startsWithBytes(bytes, MAGIC_JPEG)) return "image/jpeg";
  if (startsWithBytes(bytes, MAGIC_PNG)) return "image/png";
  if (startsWithBytes(bytes, MAGIC_PDF)) return "application/pdf";
  return null;
}

// ── Opaque storage key ───────────────────────────────────────────────────────

/**
 * Build an opaque, non-guessable object key: `kyc/<random-uuid>.<ext>`.
 * Deliberately takes ONLY the canonical MIME — by construction the key cannot
 * embed a profile id, identity value, customer name, phone, or filename.
 * The UUID is independent of the kyc_documents row id.
 */
export function buildKycDocumentStorageKey(
  mime: KycDocumentCanonicalMime,
): string {
  return `kyc/${randomUUID()}.${KYC_DOCUMENT_MIME_EXTENSIONS[mime]}`;
}

/**
 * Canonical MIME → file extension. Returns null for anything outside the
 * JPEG/PNG/PDF allowlist (fail closed). Download filenames and Content-Type
 * gating must use this — never a second hand-rolled mapping.
 */
export function kycDocumentExtensionForMime(mime: unknown): string | null {
  if (typeof mime !== "string") return null;
  return KYC_DOCUMENT_MIME_EXTENSIONS[mime as KycDocumentCanonicalMime] ?? null;
}

/** Escape a literal for safe embedding inside a RegExp alternation. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Built ONCE from the same map the key builder uses — adding a MIME to
// KYC_DOCUMENT_MIME_EXTENSIONS automatically extends builder AND validator;
// they cannot drift. Values are regex-escaped so a future extension containing
// a metacharacter can never silently widen the pattern.
const SAFE_KYC_STORAGE_PATH_RE = new RegExp(
  `^kyc/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${Object.values(
    KYC_DOCUMENT_MIME_EXTENSIONS,
  )
    .map(escapeRegExp)
    .join("|")})$`,
);

/**
 * Validate that a STORED storage path has exactly the opaque Phase-1B shape
 * produced by buildKycDocumentStorageKey: `kyc/<lowercase-uuid>.<ext>` with an
 * extension from KYC_DOCUMENT_MIME_EXTENSIONS. Everything else fails closed —
 * traversal, URLs, legacy `users/...` paths, non-UUID keys, uppercase hex,
 * empty or non-string input. A failing path must NEVER be fetched and must
 * NEVER be written to the access log (it may be PII-bearing).
 */
export function isSafeKycDocumentStoragePath(path: unknown): boolean {
  return typeof path === "string" && SAFE_KYC_STORAGE_PATH_RE.test(path);
}

// ── Route-id classification (audit-log purity — Decision G) ─────────────────

const UUID_SHAPE_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Classify an attacker-controlled route id. Returns the LOWERCASED uuid when
 * the input is exactly uuid-shaped, else null. kyc_document_access_log
 * .document_id is uuid-typed — inserting a raw non-UUID string would make the
 * BEST-EFFORT denied log fail silently (a vanished audit row). Callers must
 * log `document_id = null` plus a `*_malformed_*` reason for null results and
 * must never write the raw input anywhere in the log entry.
 */
export function asUuidOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return UUID_SHAPE_RE.test(value) ? value.toLowerCase() : null;
}

// ── x-forwarded-for parsing ──────────────────────────────────────────────────

/**
 * Extract a single, syntactically valid IP from an x-forwarded-for value (or a
 * bare address). Takes the FIRST hop of a comma chain and validates it with
 * node:net isIP — a multi-hop chain or garbage value is never returned, so the
 * result is always safe for an `inet` column insert. Returns null when absent
 * or invalid (ip_address is a best-effort audit field).
 */
export function parseSingleForwardedIp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const first = value.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  return isIP(first) !== 0 ? first : null;
}

// ── Date-only input validation (issued_at / expires_at capture) ─────────────

/**
 * Strictly parse a date-only input as `YYYY-MM-DD`. Rejects other formats and
 * non-existent calendar dates (e.g. 2026-02-31, which Date would roll over).
 * Returns the canonical string for a Postgres `date` insert, or null.
 */
export function parseKycDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== trimmed) return null;
  return trimmed;
}

/**
 * True when a date-only string is after "today" in the business timezone
 * (Asia/Bangkok) — used to reject future issued dates without a UTC-offset
 * false positive for documents issued "today" in Thailand.
 */
export function isFutureKycDate(dateOnly: string, now: Date = new Date()): boolean {
  const todayBangkok = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // ISO date-only strings compare correctly as plain strings.
  return dateOnly > todayBangkok;
}

// ── Access-log writer ────────────────────────────────────────────────────────

/**
 * Allowed audit actions (migration 110 widened the DB check constraint).
 * `download` = Phase 2 server-proxy delivery; `download_signed_url` is the
 * historical value and the shelved hybrid contingency's vocabulary
 * (docs/kyc-phase-2-download-spec.md §9).
 */
export type KycDocumentAccessAction =
  | "upload"
  | "download"
  | "download_signed_url"
  | "delete";
export type KycDocumentAccessResult = "allowed" | "denied";
export type KycDocumentType = Database["public"]["Enums"]["kyc_document_type"];

/** Generated Insert shape for public.kyc_document_access_log (migration 109). */
export type KycDocumentAccessLogInsert =
  Database["public"]["Tables"]["kyc_document_access_log"]["Insert"];

/**
 * Non-PII log entry. Every field is an opaque reference or a non-PII snapshot
 * (migration 109 invariant). `storagePath` must be the opaque UUID-based key
 * only; `reason` must be a machine code, never free text containing PII.
 */
export interface KycDocumentAccessLogEntry {
  documentId?: string | null;
  kycProfileId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  action: KycDocumentAccessAction;
  result: KycDocumentAccessResult;
  reason?: string | null;
  documentType?: KycDocumentType | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  /** Single validated IP (use parseSingleForwardedIp) — never a raw header chain. */
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Minimal client shape for the log insert — the service-role Supabase client
 * satisfies this structurally (no cast needed). The payload is typed against
 * the GENERATED `kyc_document_access_log` Insert type so column-name drift is
 * a compile error, not a silent audit gap.
 */
export interface KycDocumentAccessLogClient {
  from(table: "kyc_document_access_log"): {
    insert(
      payload: KycDocumentAccessLogInsert,
    ): PromiseLike<{ error: { message?: string } | null }>;
  };
}

/**
 * Append one row to public.kyc_document_access_log.
 *
 * Best-effort by default (upload events): a log failure returns false and must
 * NEVER fail the surrounding operation — but it always emits a console.error
 * breadcrumb so a broken audit trail is detectable in server logs. Pass
 * `failClosed: true` for flows where the log write is a precondition (future
 * allowed-download signed-URL issuance) — then a log failure throws 500 and
 * the caller must abort.
 */
export async function logKycDocumentAccess(
  client: KycDocumentAccessLogClient,
  entry: KycDocumentAccessLogEntry,
  options: { failClosed?: boolean } = {},
): Promise<boolean> {
  try {
    const payload: KycDocumentAccessLogInsert = {
      document_id: entry.documentId ?? null,
      kyc_profile_id: entry.kycProfileId ?? null,
      actor_user_id: entry.actorUserId ?? null,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      result: entry.result,
      reason: entry.reason ?? null,
      document_type: entry.documentType ?? null,
      storage_bucket: entry.storageBucket ?? null,
      storage_path: entry.storagePath ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    };
    const { error } = await client.from("kyc_document_access_log").insert(payload);
    if (error) {
      throw new Error(error.message ?? "kyc_document_access_log insert failed");
    }
    return true;
  } catch (error) {
    // Breadcrumb only — the entry itself is non-PII by invariant, and the
    // error message comes from the DB layer, not from customer input.
    console.error(
      "[kyc] kyc_document_access_log write failed",
      `action=${entry.action} result=${entry.result} failClosed=${options.failClosed === true}`,
      error instanceof Error ? error.message : error,
    );
    if (options.failClosed) {
      throw createError({
        statusCode: 500,
        statusMessage: "KYC_ACCESS_LOG_WRITE_FAILED",
      });
    }
    return false;
  }
}
