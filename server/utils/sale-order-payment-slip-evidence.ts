/**
 * Sale ORDER payment-slip evidence — private upload + signed-access helpers.
 *
 * Customer-uploaded bank-transfer slips for SALE ORDERS are PII/financial
 * evidence. This module is the ONLY sanctioned writer/reader path for them and
 * is built on the same private-document model as the rental deposit-slip util
 * (server/utils/rental-deposit-slip-evidence.ts) — but it is SEPARATE: a
 * different table (sale_order_payment_slips) and a different private bucket
 * (sale-order-payment-slips). It NEVER touches rental tables/buckets.
 *
 *  - sniffSaleOrderPaymentSlipMime — magic-byte sniff (JPEG/PNG/PDF only;
 *    client MIME never trusted).
 *  - buildSaleOrderPaymentSlipStorageKey — private-bucket object key
 *    `order-payment-slips/<orderId>/<random-uuid>.<ext>`.
 *  - uploadSaleOrderPaymentSlipEvidence — validate -> upload to the PRIVATE
 *    bucket -> insert one metadata row (status 'pending_review'). Returns safe
 *    metadata ONLY — never a URL/storage path/bucket.
 *  - createSaleOrderPaymentSlipSignedUrl — short-lived signed URL for admin view.
 *  - toSafeSaleOrderPaymentSlip — DB row -> client shape (never exposes
 *    storage_path / storage_bucket / any URL).
 *
 * INVARIANTS:
 *  - Files live ONLY in the private bucket. Never catalog-media. Never a
 *    permanent public URL.
 *  - This module NEVER marks the order paid, NEVER deducts inventory, NEVER
 *    writes any rental ledger, and NEVER touches Omise/payment_attempts.
 */
import { createError } from "h3";
import { randomUUID } from "node:crypto";
import type { Database } from "~/types/database.types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Private bucket (migration 114). Files are served via signed URLs only. */
export const SALE_ORDER_PAYMENT_SLIP_BUCKET = "sale-order-payment-slips";

/** Max ACTUAL file bytes (10 MB) — matches the bucket-level file_size_limit. */
export const SALE_ORDER_PAYMENT_SLIP_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Short TTL for admin view signed URLs — minutes, not permanent links. */
export const SALE_ORDER_PAYMENT_SLIP_SIGNED_URL_TTL_SECONDS = 60;

/** Canonical sniffed MIME types accepted for sale payment slips. */
export type SaleOrderPaymentSlipMime =
  | "image/jpeg"
  | "image/png"
  | "application/pdf";

const SALE_ORDER_PAYMENT_SLIP_MIME_EXTENSIONS: Record<
  SaleOrderPaymentSlipMime,
  string
> = {
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

export function sniffSaleOrderPaymentSlipMime(
  bytes: Uint8Array,
): SaleOrderPaymentSlipMime | null {
  if (startsWithBytes(bytes, MAGIC_JPEG)) return "image/jpeg";
  if (startsWithBytes(bytes, MAGIC_PNG)) return "image/png";
  if (startsWithBytes(bytes, MAGIC_PDF)) return "application/pdf";
  return null;
}

export function saleOrderPaymentSlipExtensionForMime(
  mime: unknown,
): string | null {
  if (typeof mime !== "string") return null;
  return (
    SALE_ORDER_PAYMENT_SLIP_MIME_EXTENSIONS[mime as SaleOrderPaymentSlipMime] ??
    null
  );
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
 * `order-payment-slips/<orderId>/<random-uuid>.<ext>`.
 * orderId MUST already be validated (asUuidOrNull) by the caller.
 */
export function buildSaleOrderPaymentSlipStorageKey(
  orderId: string,
  mime: SaleOrderPaymentSlipMime,
): string {
  const ext = SALE_ORDER_PAYMENT_SLIP_MIME_EXTENSIONS[mime];
  return `order-payment-slips/${orderId}/${randomUUID()}.${ext}`;
}

// ── Filename sanitization ──────────────────────────────────────────────────────

export function sanitizeSaleOrderPaymentSlipFilename(value: unknown): string {
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

export type SaleOrderPaymentSlipRow =
  Database["public"]["Tables"]["sale_order_payment_slips"]["Row"];
export type SaleOrderPaymentSlipInsert =
  Database["public"]["Tables"]["sale_order_payment_slips"]["Insert"];

/** The only columns a safe slip view selects — never storage path/bucket. */
export const SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT =
  "id, order_id, original_filename, mime_type, file_size_bytes, status, uploaded_at, reviewed_at, review_note";

/** Internal select that additionally exposes storage path/bucket for download. */
export const SALE_ORDER_PAYMENT_SLIP_DOWNLOAD_SELECT =
  "id, order_id, storage_bucket, storage_path, mime_type, original_filename";

export interface SafeSaleOrderPaymentSlip {
  id: string;
  orderId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export function toSafeSaleOrderPaymentSlip(
  row: Record<string, unknown>,
): SafeSaleOrderPaymentSlip {
  return {
    id: String(row.id ?? ""),
    orderId: String(row.order_id ?? ""),
    originalFilename: String(row.original_filename ?? ""),
    mimeType: String(row.mime_type ?? ""),
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    status: String(row.status ?? ""),
    uploadedAt: String(row.uploaded_at ?? ""),
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    reviewNote: typeof row.review_note === "string" ? row.review_note : null,
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

export interface SaleOrderPaymentSlipClient {
  storage: { from(bucket: string): SlipStorageBucketApi };
  from(table: string): any;
}

// ── Upload orchestration ───────────────────────────────────────────────────────

export interface SaleOrderPaymentSlipUploadInput {
  orderId: string;
  uploadedBy: string;
  fileBytes: Buffer | Uint8Array;
  originalFilename: unknown;
}

/**
 * Validate and persist one sale-order payment-slip evidence file.
 *
 *  1. size: rejects empty (422) and oversize (413, > 10 MB).
 *  2. MIME: magic-byte sniff only; non JPEG/PNG/PDF rejected (415).
 *  3. upload to the PRIVATE bucket (contentType = sniffed MIME, no upsert).
 *  4. insert one metadata row (status defaults to 'pending_review').
 *
 * Returns safe metadata only. NEVER marks the order paid, NEVER deducts
 * inventory, NEVER writes a rental ledger.
 */
export async function uploadSaleOrderPaymentSlipEvidence(
  client: SaleOrderPaymentSlipClient,
  input: SaleOrderPaymentSlipUploadInput,
): Promise<SafeSaleOrderPaymentSlip> {
  const orderId = asUuidOrNull(input.orderId);
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_ORDER_ID" });
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
  if (bytes.byteLength > SALE_ORDER_PAYMENT_SLIP_MAX_FILE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "PAYLOAD_TOO_LARGE" });
  }

  const mime = sniffSaleOrderPaymentSlipMime(bytes);
  if (!mime) {
    throw createError({
      statusCode: 415,
      statusMessage: "SLIP_UNSUPPORTED_MEDIA_TYPE",
    });
  }

  const originalFilename = sanitizeSaleOrderPaymentSlipFilename(
    input.originalFilename,
  );
  const storagePath = buildSaleOrderPaymentSlipStorageKey(orderId, mime);

  const { error: uploadError } = await client.storage
    .from(SALE_ORDER_PAYMENT_SLIP_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    console.error("[orders] payment slip upload failed", uploadError.message);
    throw createError({ statusCode: 500, statusMessage: "SLIP_UPLOAD_FAILED" });
  }

  const payload: SaleOrderPaymentSlipInsert = {
    order_id: orderId,
    uploaded_by: uploadedBy,
    storage_bucket: SALE_ORDER_PAYMENT_SLIP_BUCKET,
    storage_path: storagePath,
    original_filename: originalFilename,
    mime_type: mime,
    file_size_bytes: bytes.byteLength,
    status: "pending_review",
  };

  const { data, error } = await client
    .from("sale_order_payment_slips")
    .insert(payload)
    .select(SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT)
    .single();
  if (error || !data) {
    console.error(
      "[orders] payment slip metadata insert failed",
      error?.message,
    );
    throw createError({ statusCode: 500, statusMessage: "SLIP_RECORD_FAILED" });
  }

  return toSafeSaleOrderPaymentSlip(data as Record<string, unknown>);
}

/**
 * Create a short-lived signed URL for a stored slip object. The only sanctioned
 * way to view a slip — there is no public URL.
 */
export async function createSaleOrderPaymentSlipSignedUrl(
  client: SaleOrderPaymentSlipClient,
  storagePath: string,
  ttlSeconds: number = SALE_ORDER_PAYMENT_SLIP_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await client.storage
    .from(SALE_ORDER_PAYMENT_SLIP_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) {
    console.error("[orders] payment slip signed-url failed", error?.message);
    throw createError({
      statusCode: 500,
      statusMessage: "SLIP_SIGNED_URL_FAILED",
    });
  }
  return data.signedUrl;
}
