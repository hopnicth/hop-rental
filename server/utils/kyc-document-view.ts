/**
 * Shared KYC document "safe view" — the SINGLE PII/storage whitelist boundary
 * for KYC document API responses. Mirrors `kyc-profile-view.ts`.
 *
 * Covers:
 *  - KYC_DOCUMENT_SAFE_SELECT: the only column list KYC document endpoints select.
 *  - SafeKycDocument: the only shape returned to clients.
 *  - toSafeKycDocument: the only mapper from a DB row to a response.
 *
 * CONTRACT (security-core — every KYC document endpoint MUST follow this):
 *  - Raw DB rows must NEVER be returned directly — always go through toSafeKycDocument.
 *  - storage_path must NEVER be returned (opaque or not — paths stay server-side).
 *  - storage_bucket must NEVER be returned (not currently classified as safe).
 *  - Public URLs and signed URLs must NEVER be returned by upload/list responses;
 *    downloads are a separate server-mediated flow (future phase, fail-closed log).
 *  - Identity values and any customer PII must NEVER appear on this shape.
 *
 * Pure — no DB access, no Supabase import. Callers pass already-fetched rows.
 */

/**
 * The ONLY column list KYC document endpoints may select. Deliberately EXCLUDES
 * storage_path, storage_bucket-like fields, and uploaded_by_user_id.
 */
export const KYC_DOCUMENT_SAFE_SELECT =
  "id, kyc_profile_id, document_type, mime_type, file_size_bytes, uploaded_at, created_at";

/** DB-row shape consumed by `toSafeKycDocument` (matches KYC_DOCUMENT_SAFE_SELECT). */
export interface KycDocumentSafeRow {
  id: string;
  kyc_profile_id: string;
  document_type: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_at: string;
  created_at: string;
}

/** Client-safe KYC document shape — the ONLY shape returned by document endpoints. */
export interface SafeKycDocument {
  id: string;
  kycProfileId: string;
  documentType: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string;
  createdAt: string;
}

/**
 * Pure whitelist mapper — strips storage_path, storage bucket, uploader id, and
 * every column not on the SafeKycDocument whitelist by construction.
 */
export function toSafeKycDocument(row: KycDocumentSafeRow): SafeKycDocument {
  return {
    id: row.id,
    kycProfileId: row.kyc_profile_id,
    documentType: row.document_type,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
  };
}
