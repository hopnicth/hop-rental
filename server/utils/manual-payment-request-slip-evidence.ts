/**
 * Manual payment-request slip evidence — private upload + signed-access helpers.
 *
 * Customer-uploaded bank-transfer slips for a CENTRAL manual_payment_requests row
 * are PII/financial evidence. This module is the ONLY sanctioned writer/reader
 * path for them. It is built on the same private-document model as the sale-order
 * and rental-deposit slip utils, but is SEPARATE: its own table
 * (manual_payment_request_slips) and its own private bucket (manual-payment-slips).
 *
 *  - sniffManualPaymentSlipMime — magic-byte sniff (JPEG/PNG/PDF only; client MIME
 *    never trusted; rejects SVG / fake-MIME files).
 *  - buildManualPaymentSlipStorageKey — private-bucket object key.
 *  - uploadManualPaymentRequestSlipEvidence — validate -> upload to PRIVATE bucket
 *    -> insert one metadata row (status 'pending_review'). Returns safe metadata.
 *  - createManualPaymentSlipSignedUrl — short-lived signed URL for admin view.
 *  - toSafeManualPaymentSlip — DB row -> client shape (never exposes storage_path /
 *    storage_bucket / any URL).
 *
 * INVARIANTS:
 *  - Files live ONLY in the private bucket. Never catalog-media. Never public URL.
 *  - This module NEVER marks any order paid, NEVER confirms a booking, NEVER
 *    deducts inventory, NEVER writes a rental ledger, NEVER touches Omise/KYC.
 */
import { createError } from "h3";
import { createHash, randomUUID } from "node:crypto";
import type { Database } from "~/types/database.types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Private bucket (migration 115). Files are served via signed URLs only. */
export const MANUAL_PAYMENT_SLIP_BUCKET = "manual-payment-slips";

/** Max ACTUAL file bytes (10 MB) — matches the bucket-level file_size_limit. */
export const MANUAL_PAYMENT_SLIP_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Short TTL for admin view signed URLs — minutes, not permanent links. */
export const MANUAL_PAYMENT_SLIP_SIGNED_URL_TTL_SECONDS = 60;

/** Canonical sniffed MIME types accepted for manual payment slips. */
export type ManualPaymentSlipMime =
  | "image/jpeg"
  | "image/png"
  | "application/pdf";

const MANUAL_PAYMENT_SLIP_MIME_EXTENSIONS: Record<ManualPaymentSlipMime, string> =
  {
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
  };

// ── Magic-byte MIME sniffing (client-declared MIME is never trusted) ──────────

const MAGIC_JPEG = [0xff, 0xd8, 0xff] as const;
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const MAGIC_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // "%PDF-" at offset 0

function startsWithBytes(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((expected, i) => bytes[i] === expected);
}

export function sniffManualPaymentSlipMime(
  bytes: Uint8Array,
): ManualPaymentSlipMime | null {
  if (startsWithBytes(bytes, MAGIC_JPEG)) return "image/jpeg";
  if (startsWithBytes(bytes, MAGIC_PNG)) return "image/png";
  if (startsWithBytes(bytes, MAGIC_PDF)) return "application/pdf";
  return null;
}

// ── Id classification + storage key ──────────────────────────────────────────

const UUID_SHAPE_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function asUuidOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return UUID_SHAPE_RE.test(value) ? value.toLowerCase() : null;
}

/**
 * Build the private-bucket object key:
 * `payment-request-slips/<paymentRequestId>/<random-uuid>.<ext>`.
 * paymentRequestId MUST already be validated (asUuidOrNull) by the caller.
 */
export function buildManualPaymentSlipStorageKey(
  paymentRequestId: string,
  mime: ManualPaymentSlipMime,
): string {
  const ext = MANUAL_PAYMENT_SLIP_MIME_EXTENSIONS[mime];
  return `payment-request-slips/${paymentRequestId}/${randomUUID()}.${ext}`;
}

// ── Filename sanitization ──────────────────────────────────────────────────────

export function sanitizeManualPaymentSlipFilename(value: unknown): string {
  if (typeof value !== "string") return "slip";
  const base = value.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "slip";
  return cleaned.slice(0, 200);
}

// ── Row / safe shapes ──────────────────────────────────────────────────────────

export type ManualPaymentSlipRow =
  Database["public"]["Tables"]["manual_payment_request_slips"]["Row"];
export type ManualPaymentSlipInsert =
  Database["public"]["Tables"]["manual_payment_request_slips"]["Insert"];

/** The only columns a safe slip view selects — never storage path/bucket. */
export const MANUAL_PAYMENT_SLIP_SAFE_SELECT =
  "id, payment_request_id, original_filename, mime_type, file_size_bytes, status, uploaded_at, reviewed_at, rejected_at, rejected_reason";

/** Internal select that additionally exposes storage path/bucket for download. */
export const MANUAL_PAYMENT_SLIP_DOWNLOAD_SELECT =
  "id, payment_request_id, storage_bucket, storage_path, mime_type, original_filename";

export interface SafeManualPaymentSlip {
  id: string;
  paymentRequestId: string;
  originalFilename: string | null;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  uploadedAt: string;
  reviewedAt: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
}

export function toSafeManualPaymentSlip(
  row: Record<string, unknown>,
): SafeManualPaymentSlip {
  return {
    id: String(row.id ?? ""),
    paymentRequestId: String(row.payment_request_id ?? ""),
    originalFilename:
      typeof row.original_filename === "string" ? row.original_filename : null,
    mimeType: String(row.mime_type ?? ""),
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    status: String(row.status ?? ""),
    uploadedAt: String(row.uploaded_at ?? ""),
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    rejectedAt: typeof row.rejected_at === "string" ? row.rejected_at : null,
    rejectedReason:
      typeof row.rejected_reason === "string" ? row.rejected_reason : null,
  };
}

// ── Client shapes (the service-role client satisfies these structurally) ──────

interface SlipStorageBucketApi {
  upload(
    path: string,
    body: Buffer | Uint8Array,
    options?: { contentType?: string; upsert?: boolean },
  ): PromiseLike<{ error: { message?: string } | null }>;
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): PromiseLike<{
    data: { signedUrl: string } | null;
    error: { message?: string } | null;
  }>;
}

export interface ManualPaymentSlipClient {
  storage: { from(bucket: string): SlipStorageBucketApi };
  from(table: string): any;
}

// ── Upload orchestration ───────────────────────────────────────────────────────

export interface ManualPaymentSlipUploadInput {
  paymentRequestId: string;
  uploadedBy: string;
  fileBytes: Buffer | Uint8Array;
  originalFilename: unknown;
}

/**
 * Validate and persist one manual-payment-request slip evidence file.
 *
 *  1. size: rejects empty (422) and oversize (413, > 10 MB).
 *  2. MIME: magic-byte sniff only; non JPEG/PNG/PDF (incl. SVG / fake MIME) → 415.
 *  3. upload to the PRIVATE bucket (contentType = sniffed MIME, no upsert).
 *  4. insert one metadata row (status defaults to 'pending_review') with sha256.
 *
 * Returns safe metadata only. NEVER marks an order paid, NEVER confirms a booking,
 * NEVER deducts inventory, NEVER writes a rental ledger.
 */
export async function uploadManualPaymentRequestSlipEvidence(
  client: ManualPaymentSlipClient,
  input: ManualPaymentSlipUploadInput,
): Promise<SafeManualPaymentSlip> {
  const paymentRequestId = asUuidOrNull(input.paymentRequestId);
  if (!paymentRequestId) {
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_PAYMENT_REQUEST_ID",
    });
  }
  const uploadedBy = asUuidOrNull(input.uploadedBy);
  if (!uploadedBy) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const bytes =
    input.fileBytes instanceof Buffer
      ? input.fileBytes
      : Buffer.from(input.fileBytes);

  if (bytes.byteLength === 0) {
    throw createError({ statusCode: 422, statusMessage: "SLIP_FILE_EMPTY" });
  }
  if (bytes.byteLength > MANUAL_PAYMENT_SLIP_MAX_FILE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "PAYLOAD_TOO_LARGE" });
  }

  const mime = sniffManualPaymentSlipMime(bytes);
  if (!mime) {
    throw createError({
      statusCode: 415,
      statusMessage: "SLIP_UNSUPPORTED_MEDIA_TYPE",
    });
  }

  const originalFilename = sanitizeManualPaymentSlipFilename(
    input.originalFilename,
  );
  const storagePath = buildManualPaymentSlipStorageKey(paymentRequestId, mime);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const { error: uploadError } = await client.storage
    .from(MANUAL_PAYMENT_SLIP_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    console.error("[payments] slip upload failed", uploadError.message);
    throw createError({ statusCode: 500, statusMessage: "SLIP_UPLOAD_FAILED" });
  }

  const payload: ManualPaymentSlipInsert = {
    payment_request_id: paymentRequestId,
    uploaded_by: uploadedBy,
    storage_bucket: MANUAL_PAYMENT_SLIP_BUCKET,
    storage_path: storagePath,
    original_filename: originalFilename,
    mime_type: mime,
    file_size_bytes: bytes.byteLength,
    sha256_hash: sha256,
    status: "pending_review",
  };

  const { data, error } = await client
    .from("manual_payment_request_slips")
    .insert(payload)
    .select(MANUAL_PAYMENT_SLIP_SAFE_SELECT)
    .single();
  if (error || !data) {
    console.error("[payments] slip metadata insert failed", error?.message);
    throw createError({ statusCode: 500, statusMessage: "SLIP_RECORD_FAILED" });
  }

  return toSafeManualPaymentSlip(data as Record<string, unknown>);
}

/**
 * Create a short-lived signed URL for a stored slip object. The only sanctioned
 * way to view a slip — there is no public URL.
 */
export async function createManualPaymentSlipSignedUrl(
  client: ManualPaymentSlipClient,
  storagePath: string,
  ttlSeconds: number = MANUAL_PAYMENT_SLIP_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await client.storage
    .from(MANUAL_PAYMENT_SLIP_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) {
    console.error("[payments] slip signed-url failed", error?.message);
    throw createError({
      statusCode: 500,
      statusMessage: "SLIP_SIGNED_URL_FAILED",
    });
  }
  return data.signedUrl;
}
