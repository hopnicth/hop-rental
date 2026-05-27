-- 104: Partner verification timestamps
--
-- Adds audit columns needed for the 1-year partner verification workflow:
--   verified_until                    — expiry timestamp (public-safe)
--   verified_by_user_id               — super_admin who verified (private)
--   verification_cancelled_at         — when verification was cancelled (private)
--   verification_cancelled_by_user_id — super_admin who cancelled (private)
--
-- Also updates the existing private kyc-documents bucket:
--   file_size_limit  5 MB → 20 MB
--   allowed_mime_types += image/webp
--
-- Bucket remains private (public = FALSE). No public URL logic.
-- All new private columns are NOT granted to anon/authenticated.
-- verified_until IS granted to anon/authenticated for public badge expiry.

-- ── 1. Add verification audit columns ─────────────────────────────────────────

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS verified_until
    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by_user_id
    UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS verification_cancelled_at
    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_cancelled_by_user_id
    UUID REFERENCES public.users(id);

-- ── 2. Check constraint — verified_until only when is_verified = TRUE ──────────
--
-- Mirrors the existing pattern:
--   CHECK (verified_at IS NULL OR is_verified = TRUE)   ← migration 096
-- Uses a DO block for idempotency.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  constraint_schema = 'public'
      AND  table_name        = 'partner_profiles'
      AND  constraint_name   = 'partner_profiles_verified_until_check'
  ) THEN
    ALTER TABLE public.partner_profiles
      ADD CONSTRAINT partner_profiles_verified_until_check
      CHECK (verified_until IS NULL OR is_verified = TRUE);
  END IF;
END
$$;

-- ── 3. Column comments ────────────────────────────────────────────────────────

COMMENT ON COLUMN public.partner_profiles.verified_until IS
  'Timestamp until which partner verification is valid (verified_at + 1 year). '
  'NULL when unverified or cancelled. Public-safe: exposed for badge expiry logic.';

COMMENT ON COLUMN public.partner_profiles.verified_by_user_id IS
  'ADMIN-ONLY. UUID of the super_admin who last verified this partner. '
  'Retained after cancellation for audit. Never exposed in public payloads.';

COMMENT ON COLUMN public.partner_profiles.verification_cancelled_at IS
  'ADMIN-ONLY. Timestamp when verification was last cancelled/revoked. '
  'NULL if currently verified or never cancelled.';

COMMENT ON COLUMN public.partner_profiles.verification_cancelled_by_user_id IS
  'ADMIN-ONLY. UUID of the super_admin who last cancelled this partner verification. '
  'Never exposed in public payloads.';

-- ── 4. Column-level grants ────────────────────────────────────────────────────
--
-- migration 096 issued REVOKE ALL … FROM anon, authenticated followed by an
-- explicit GRANT SELECT (…safe columns…).  Any column added after that REVOKE
-- is inaccessible to anon/authenticated unless explicitly granted here.
--
-- verified_until → public-safe (badge expiry).  Granting it.
-- verified_by_user_id, verification_cancelled_at,
-- verification_cancelled_by_user_id → private.  NOT granted.
-- kyc_documents, verified_notes, internal_notes → already private (096). No change.

GRANT SELECT (verified_until) ON public.partner_profiles TO anon, authenticated;

-- ── 5. Update kyc-documents storage bucket ────────────────────────────────────
--
-- Existing bucket (migration 072):
--   public = FALSE, file_size_limit = 5 MB, mime = [jpeg, png, pdf]
--
-- Changes:
--   file_size_limit  → 20 MB (20971520 bytes) — partner docs can be larger
--   allowed_mime_types → add image/webp (verification photo uploads)
--
-- Bucket remains private (public stays FALSE). No public URL logic.

UPDATE storage.buckets
SET
  file_size_limit    = 20971520,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
WHERE id = 'kyc-documents';
