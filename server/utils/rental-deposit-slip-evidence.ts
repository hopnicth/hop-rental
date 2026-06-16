/**
 * Rental booking-deposit SLIP evidence — private upload + signed-access helpers.
 *
 * Customer-uploaded bank-transfer slips are PII/financial evidence. This module
 * is the ONLY sanctioned writer/reader path for them and is built on the same
 * private-document security model as KYC documents (without importing KYC logic):
 *
 *  - sniffRentalDepositSlipMime — magic-byte content sniffing (JPEG/PNG/PDF
 *    only); the client-declared MIME is NEVER trusted.
 *  - buildRentalDepositSlipStorageKey — object key under the private bucket:
 *    `booking-deposit-slips/<bookingId>/<random-uuid>.<ext>`.
 *  - uploadRentalDepositSlipEvidence — validate → upload to the PRIVATE
 *    rental-deposit-slips bucket → insert one metadata row (status
 *    'pending_review'). Returns safe metadata ONLY — never a URL, storage path,
 *    or bucket.
 *  - createRentalDepositSlipSignedUrl — short-lived signed URL for admin view.
 *  - toSafeRentalDepositSlip — DB row → client shape, never exposing
 *    storage_path / storage_bucket / any URL.
 *
 * INVARIANTS:
 *  - Files live ONLY in the private bucket (RENTAL_DEPOSIT_SLIP_BUCKET). Never
 *    catalog-media. Never getPublicUrl(). Never a permanent public URL.
 *  - This module NEVER mutates booking status, payment/money fields, payment
 *    lines, or held-balance events, and NEVER confirms a booking. Uploading a
 *    slip is evidence only; admin must still mark the deposit received.
 *
 * The Supabase service-role client satisfies the structural client shapes here;
 * callers pass it after route-level auth (ownership / requirePlatformAdmin).
 */
import { createError } from "h3";
import { randomUUID } from "node:crypto";
import type { Database } from "~/types/database.types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Private bucket (migration 113). Files are served via signed URLs only. */
export const RENTAL_DEPOSIT_SLIP_BUCKET = "rental-deposit-slips";

/** Max ACTUAL file bytes (10 MB) — matches the bucket-level file_size_limit. */
export const RENTAL_DEPOSIT_SLIP_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Short TTL for admin view signed URLs — minutes, not permanent links. */
export const RENTAL_DEPOSIT_SLIP_SIGNED_URL_TTL_SECONDS = 60;

/** Canonical sniffed MIME types accepted for deposit slips. */
export type RentalDepositSlipMime =
  | "image/jpeg"
  | "image/png"
  | "application/pdf";

const RENTAL_DEPOSIT_SLIP_MIME_EXTENSIONS: Record<RentalDepositSlipMime, string> =
  {
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
  };

// ── Magic-byte MIME sniffing (client-declared MIME is never trusted) ──────────

const MAGIC_JPEG = [0xff, 0xd8, 0xff] as const;
// Full 8-byte PNG signature (not just the 4-byte "\x89PNG" prefix).
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const MAGIC_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // "%PDF-" at offset 0

function startsWithBytes(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((expected, i) => bytes[i] === expected);
}

/**
 * Sniff the canonical MIME from file content (magic bytes at offset 0).
 * Returns null for everything that is not JPEG/PNG/PDF — including SVG, which
 * is rejected by design (scriptable). The client-declared MIME is irrelevant.
 */
export function sniffRentalDepositSlipMime(
  bytes: Uint8Array,
): RentalDepositSlipMime | null {
  if (startsWithBytes(bytes, MAGIC_JPEG)) return "image/jpeg";
  if (startsWithBytes(bytes, MAGIC_PNG)) return "image/png";
  if (startsWithBytes(bytes, MAGIC_PDF)) return "application/pdf";
  return null;
}

/**
 * Canonical MIME → file extension. Returns null for anything outside the
 * JPEG/PNG/PDF allowlist (fail closed).
 */
export function rentalDepositSlipExtensionForMime(mime: unknown): string | null {
  if (typeof mime !== "string") return null;
  return (
    RENTAL_DEPOSIT_SLIP_MIME_EXTENSIONS[mime as RentalDepositSlipMime] ?? null
  );
}

// ── Storage key ──────────────────────────────────────────────────────────────

const UUID_SHAPE_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Classify an attacker-controlled id (route param / body field). Returns the
 * lowercased uuid when the input is exactly uuid-shaped, else null. Used so a
 * raw string is never interpolated into a storage path or a uuid-typed column.
 */
export function asUuidOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return UUID_SHAPE_RE.test(value) ? value.toLowerCase() : null;
}

/**
 * Build the private-bucket object key:
 * `booking-deposit-slips/<bookingId>/<random-uuid>.<ext>`.
 * bookingId MUST already be validated (asUuidOrNull) by the caller — it is
 * embedded only to group a booking's evidence inside the private bucket; the
 * filename component is a fresh random UUID, never derived from user input.
 */
export function buildRentalDepositSlipStorageKey(
  bookingId: string,
  mime: RentalDepositSlipMime,
): string {
  const ext = RENTAL_DEPOSIT_SLIP_MIME_EXTENSIONS[mime];
  return `booking-deposit-slips/${bookingId}/${randomUUID()}.${ext}`;
}

// ── Filename sanitization ──────────────────────────────────────────────────────

/**
 * Reduce a client-supplied filename to a safe display label: strip any
 * directory components, drop control characters, collapse whitespace, and cap
 * length. Returns a fallback when nothing usable remains. This value is stored
 * for display only — it is NEVER used to build the storage path.
 */
export function sanitizeRentalDepositSlipFilename(value: unknown): string {
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

export type RentalDepositSlipRow =
  Database["public"]["Tables"]["rental_booking_deposit_slips"]["Row"];
export type RentalDepositSlipInsert =
  Database["public"]["Tables"]["rental_booking_deposit_slips"]["Insert"];

/** The only columns a safe slip view selects — never storage path/bucket. */
export const RENTAL_DEPOSIT_SLIP_SAFE_SELECT =
  "id, rental_booking_id, original_filename, mime_type, file_size_bytes, status, uploaded_at, reviewed_at, review_note";

/** Internal select that additionally exposes storage path/bucket for download. */
export const RENTAL_DEPOSIT_SLIP_DOWNLOAD_SELECT =
  "id, rental_booking_id, storage_bucket, storage_path, mime_type, original_filename";

export interface SafeRentalDepositSlip {
  id: string;
  rentalBookingId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

/**
 * Map a slip row to the safe client shape. Reads ONLY whitelisted fields, so a
 * row that still carries storage_path / storage_bucket cannot leak them.
 */
export function toSafeRentalDepositSlip(
  row: Record<string, unknown>,
): SafeRentalDepositSlip {
  return {
    id: String(row.id ?? ""),
    rentalBookingId: String(row.rental_booking_id ?? ""),
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

export interface RentalDepositSlipClient {
  storage: { from(bucket: string): SlipStorageBucketApi };
  from(table: string): any;
}

// ── Upload orchestration ───────────────────────────────────────────────────────

export interface RentalDepositSlipUploadInput {
  bookingId: string;
  uploadedBy: string;
  fileBytes: Buffer | Uint8Array;
  originalFilename: unknown;
}

/**
 * Validate and persist one deposit-slip evidence file.
 *
 *  1. size: rejects empty (422) and oversize (413, > 10 MB).
 *  2. MIME: magic-byte sniff only; non JPEG/PNG/PDF rejected (415).
 *  3. upload to the PRIVATE bucket (contentType = sniffed MIME, no upsert).
 *  4. insert one metadata row (status defaults to 'pending_review').
 *
 * Returns safe metadata only. NEVER returns a URL, storage path, or bucket.
 * NEVER mutates booking status / money / payment lines / held balance, and
 * NEVER confirms the booking.
 */
export async function uploadRentalDepositSlipEvidence(
  client: RentalDepositSlipClient,
  input: RentalDepositSlipUploadInput,
): Promise<SafeRentalDepositSlip> {
  const bookingId = asUuidOrNull(input.bookingId);
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_BOOKING_ID" });
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
  if (bytes.byteLength > RENTAL_DEPOSIT_SLIP_MAX_FILE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "PAYLOAD_TOO_LARGE" });
  }

  const mime = sniffRentalDepositSlipMime(bytes);
  if (!mime) {
    throw createError({
      statusCode: 415,
      statusMessage: "SLIP_UNSUPPORTED_MEDIA_TYPE",
    });
  }

  const originalFilename = sanitizeRentalDepositSlipFilename(
    input.originalFilename,
  );
  const storagePath = buildRentalDepositSlipStorageKey(bookingId, mime);

  const { error: uploadError } = await client.storage
    .from(RENTAL_DEPOSIT_SLIP_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    console.error("[rental] deposit slip upload failed", uploadError.message);
    throw createError({ statusCode: 500, statusMessage: "SLIP_UPLOAD_FAILED" });
  }

  const payload: RentalDepositSlipInsert = {
    rental_booking_id: bookingId,
    uploaded_by: uploadedBy,
    storage_bucket: RENTAL_DEPOSIT_SLIP_BUCKET,
    storage_path: storagePath,
    original_filename: originalFilename,
    mime_type: mime,
    file_size_bytes: bytes.byteLength,
    status: "pending_review",
  };

  const { data, error } = await client
    .from("rental_booking_deposit_slips")
    .insert(payload)
    .select(RENTAL_DEPOSIT_SLIP_SAFE_SELECT)
    .single();
  if (error || !data) {
    console.error(
      "[rental] deposit slip metadata insert failed",
      error?.message,
    );
    throw createError({ statusCode: 500, statusMessage: "SLIP_RECORD_FAILED" });
  }

  return toSafeRentalDepositSlip(data as Record<string, unknown>);
}

/**
 * Create a short-lived signed URL for a stored slip object. The only sanctioned
 * way to view a slip — there is no public URL. Returns the signed URL string.
 */
export async function createRentalDepositSlipSignedUrl(
  client: RentalDepositSlipClient,
  storagePath: string,
  ttlSeconds: number = RENTAL_DEPOSIT_SLIP_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await client.storage
    .from(RENTAL_DEPOSIT_SLIP_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) {
    console.error("[rental] deposit slip signed-url failed", error?.message);
    throw createError({
      statusCode: 500,
      statusMessage: "SLIP_SIGNED_URL_FAILED",
    });
  }
  return data.signedUrl;
}
