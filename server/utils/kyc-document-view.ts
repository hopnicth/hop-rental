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

/**
 * SERVER-INTERNAL ONLY — includes storage_path so the download endpoint can
 * fetch the object. NEVER serialize this row (or any field of it) into a JSON
 * response, response header, or error message. The download endpoint's success
 * response is raw bytes; storage_path/bucket must never reach the client
 * (docs/kyc-phase-2-download-spec.md §2.2). There is no storage_bucket column —
 * the bucket is the KYC_PROFILE_DOCUMENTS_BUCKET constant.
 */
export const KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT =
  "id, kyc_profile_id, document_type, mime_type, file_size_bytes, storage_path";

/** DB-row shape for the download endpoint (matches the INTERNAL select). Server-side only. */
export interface KycDocumentDownloadRow {
  id: string;
  kyc_profile_id: string;
  document_type: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
}

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
