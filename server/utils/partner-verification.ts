/**
 * Shared utilities for partner KYC verification.
 *
 * Covers:
 *  - KYC bucket / path constants
 *  - MIME and size validation
 *  - Filename sanitization
 *  - Storage path building
 *  - kyc_documents JSONB parsing and appending
 */
import { createError } from "h3";
import type {
  PartnerKycDocumentMeta,
  PartnerKycDocuments,
} from "~~/app/types/admin-partner";

// ── Constants ───────────────────────────────────────────────────────────────
export const PARTNER_KYC_BUCKET = "kyc-documents";
export const PARTNER_KYC_PREFIX = "partner-verification";
export const PARTNER_KYC_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export const PARTNER_KYC_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

// ── MIME validator ──────────────────────────────────────────────────────────
export function validatePartnerKycMime(fileType: unknown): void {
  const normalized =
    typeof fileType === "string" ? fileType.toLowerCase().trim() : "";
  if (!PARTNER_KYC_ALLOWED_MIME.has(normalized)) {
    throw createError({
      statusCode: 415,
      statusMessage:
        "Only JPEG, PNG, WebP, or PDF documents are supported",
    });
  }
}

// ── Size validator ──────────────────────────────────────────────────────────
export function validatePartnerKycSize(byteLength: number): void {
  if (byteLength > PARTNER_KYC_MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Document file must be 20 MB or smaller",
    });
  }
}

// ── Filename sanitizer ──────────────────────────────────────────────────────
/**
 * Returns a safe filename:
 *  - strips null bytes, slashes, backslashes
 *  - collapses ".." path traversal segments
 *  - falls back to "document" when nothing remains
 */
export function sanitizePartnerKycFilename(filename: unknown): string {
  if (typeof filename !== "string" || filename.trim().length === 0) {
    return "document";
  }

  // Remove null bytes
  let safe = filename.replace(/\0/g, "");

  // Strip directory separators (/ and \)
  safe = safe.replace(/[/\\]/g, "");

  // Remove ".." sequences
  safe = safe.replace(/\.\./g, "");

  // Trim whitespace / dots
  safe = safe.trim().replace(/^\.+/, "").replace(/\.+$/, "");

  return safe.length > 0 ? safe : "document";
}

// ── Storage path builder ────────────────────────────────────────────────────
/**
 * Builds: partner-verification/{partnerId}/{documentId}-{safeFilename}
 */
export function buildPartnerKycPath(
  partnerId: string,
  documentId: string,
  filename: string,
): string {
  const safe = sanitizePartnerKycFilename(filename);
  return `${PARTNER_KYC_PREFIX}/${partnerId}/${documentId}-${safe}`;
}

// ── JSONB parser ─────────────────────────────────────────────────────────────
/**
 * Safely parses the kyc_documents JSONB column value.
 * Returns { documents: [] } for any missing/invalid/malformed value.
 * Never throws.
 */
export function parsePartnerKycDocuments(raw: unknown): PartnerKycDocuments {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.documents)) {
      return { documents: obj.documents as PartnerKycDocuments["documents"] };
    }
  }
  return { documents: [] };
}

// ── JSONB appender ───────────────────────────────────────────────────────────
/**
 * Returns a new PartnerKycDocuments with the given metadata appended.
 * Existing documents are preserved; the new document is added at the end.
 */
export function appendPartnerKycDocument(
  raw: unknown,
  meta: PartnerKycDocumentMeta,
): PartnerKycDocuments {
  const existing = parsePartnerKycDocuments(raw);
  return { documents: [...existing.documents, meta] };
}
