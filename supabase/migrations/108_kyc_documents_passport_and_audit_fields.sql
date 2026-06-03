-- ============================================================
-- 108_kyc_documents_passport_and_audit_fields.sql
--
-- Scope:
--   * Add 'passport' to the public.kyc_document_type enum so passport-based
--     individual KYC can store the correct document type (closes the gap where
--     kyc_profiles.identity_type='passport' had no matching document_type).
--   * Add audit/traceability columns to public.kyc_documents:
--       - mime_type        TEXT   (content-sniffed canonical MIME)
--       - file_size_bytes  BIGINT (server-computed byte length)
--
-- Key design decisions:
--   * Enum value is only ADDED here; it is NOT used elsewhere in this migration
--     (Postgres forbids using a newly added enum value in the same transaction).
--     Mirrors the ALTER TYPE ... ADD VALUE IF NOT EXISTS pattern in 084 / 105.
--   * Audit columns are NULLABLE for migration safety: the relational
--     kyc_documents table has no application writer yet, and there is no honest
--     backfill value for any legacy row. The upload API will REQUIRE both fields
--     at write time; nullable-in-DB does not weaken that contract.
--   * No DB CHECK on mime_type — the application owns the MIME allowlist.
--   * No grant/RLS changes: migration 105 secures kyc_documents with table-level
--     REVOKE (anon) + RLS policies (service_role / super_admin / staff / owner),
--     NOT column-level GRANTs, so new columns inherit the existing table grants
--     and policies automatically.
--   * No constraints reference kyc_document_type, so there is nothing to
--     DROP/re-add for idempotency. ADD VALUE IF NOT EXISTS and
--     ADD COLUMN IF NOT EXISTS make this migration reset-safe and re-runnable.
-- ============================================================

-- 1. Passport document type — add only (never used within this migration).
ALTER TYPE public.kyc_document_type ADD VALUE IF NOT EXISTS 'passport';

-- 2. Audit / traceability columns on kyc_documents (nullable; required by API later).
ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS mime_type       text   NULL,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint NULL;

COMMENT ON COLUMN public.kyc_documents.mime_type IS
  'Content-sniffed canonical MIME of the stored object (image/jpeg | image/png | application/pdf). Populated by the upload API; nullable for legacy/empty rows.';
COMMENT ON COLUMN public.kyc_documents.file_size_bytes IS
  'Server-computed byte length of the stored object. Populated by the upload API; nullable for legacy/empty rows.';
