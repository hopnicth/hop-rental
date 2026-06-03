-- ============================================================
-- 109_kyc_document_access_log_and_bucket.sql
--
-- Scope:
--   * Provision a NEW dedicated private storage bucket `kyc-profile-documents`
--     (10 MB, jpeg/png/pdf) for the relational public.kyc_documents table.
--     The legacy shared `kyc-documents` bucket is NOT reused (it serves partner
--     verification at 20 MB and would regress if lowered to 10 MB).
--   * Add append-only audit table public.kyc_document_access_log covering
--     upload / download / denied-access events, with a BEFORE UPDATE OR DELETE
--     trigger that raises so rows cannot be modified or deleted.
--   * RLS: service_role ALL; super_admin SELECT only; no staff; no anon.
--
-- Key design decisions:
--   * Dedicated bucket lets us enforce the 10 MB limit at the STORAGE level
--     (defense-in-depth under the app-level magic-byte + byte-length gate)
--     without touching the shared `kyc-documents` bucket.
--   * NO storage.objects policy is created for this bucket. Private bucket +
--     service-role-only access means anon/authenticated have no read path; all
--     downloads are server-mediated via short-lived signed URLs.
--   * kyc_document_access_log is DENORMALIZED (plain UUIDs, no FK to
--     kyc_documents/kyc_profiles, plus document_type/storage_bucket/storage_path
--     snapshots) so the audit trail SURVIVES document/profile purge. An FK would
--     defeat purge-history survival.
--   * actor_role is TEXT (snapshot) rather than public.platform_role so the
--     historical record is decoupled from future enum changes.
--   * The append-only trigger blocks UPDATE/DELETE for ALL roles (incl.
--     service_role) — a hard integrity guarantee, not app-enforced only.
--   * No new file-backed kyc_documents rows exist (verified: 0 rows), so no
--     legacy-bucket back-compat is required.
-- ============================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- A. Dedicated private bucket: kyc-profile-documents (idempotent)
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-profile-documents',
  'kyc-profile-documents',
  FALSE,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public             = FALSE,
      file_size_limit    = 10485760,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf'];

-- B. Storage policies: intentionally NONE for this bucket.
--    Do NOT add a storage.objects SELECT/INSERT policy for anon or authenticated.
--    Reads/writes are performed by the server with the service-role key, which
--    bypasses storage RLS; clients only ever receive short-lived signed URLs.

-- ──────────────────────────────────────────────────────────────────────────────
-- C. Append-only access log
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kyc_document_access_log (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  -- Plain UUID snapshots (NO FK) so the audit row survives purge of the document/profile.
  document_id     uuid        NULL,
  kyc_profile_id  uuid        NULL,
  actor_user_id   uuid        NULL,
  actor_role      text        NULL,  -- snapshot of platform_role ('staff' | 'super_admin')

  action          text        NOT NULL,  -- 'upload' | 'download_signed_url' | 'delete'
  result          text        NOT NULL,  -- 'allowed' | 'denied'
  reason          text        NULL,      -- e.g. 'not_super_admin' | 'not_found' | 'unsafe_path'

  document_type   public.kyc_document_type NULL,  -- snapshot; null for denied-before-load
  storage_bucket  text        NULL,
  storage_path    text        NULL,

  ip_address      inet        NULL,  -- best-effort
  user_agent      text        NULL,  -- best-effort

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kyc_document_access_log_pkey PRIMARY KEY (id),
  CONSTRAINT kyc_document_access_log_action_chk
    CHECK (action IN ('upload', 'download_signed_url', 'delete')),
  CONSTRAINT kyc_document_access_log_result_chk
    CHECK (result IN ('allowed', 'denied'))
);

COMMENT ON TABLE public.kyc_document_access_log IS
  'Append-only audit of KYC document upload/download/denied-access events. Denormalized to survive document/profile purge. super_admin SELECT only. INVARIANT: because this log is immutable and outlives the document, it must store ONLY opaque references and non-PII snapshots (document/profile/actor UUIDs, opaque UUID-based object keys, document_type, action/result). It must NEVER store customer names, national ID / passport / juristic ID numbers, document numbers, phone numbers, or any non-opaque / human-readable storage path.';

COMMENT ON COLUMN public.kyc_document_access_log.storage_path IS
  'Opaque UUID-based object key only (e.g. kyc/<uuid>.<ext>). NEVER a PII-bearing or human-readable path. Object keys are not derived from profile id or any identity value.';
COMMENT ON COLUMN public.kyc_document_access_log.storage_bucket IS
  'Storage bucket id snapshot (opaque, non-PII), e.g. kyc-profile-documents.';

CREATE INDEX IF NOT EXISTS idx_kyc_doc_access_log_document
  ON public.kyc_document_access_log (document_id);
CREATE INDEX IF NOT EXISTS idx_kyc_doc_access_log_profile
  ON public.kyc_document_access_log (kyc_profile_id);
CREATE INDEX IF NOT EXISTS idx_kyc_doc_access_log_actor
  ON public.kyc_document_access_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_doc_access_log_created_at
  ON public.kyc_document_access_log (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- D. Append-only trigger — raises on UPDATE or DELETE (all roles)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kyc_document_access_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'kyc_document_access_log is append-only; % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_document_access_log_no_mutate
  ON public.kyc_document_access_log;
CREATE TRIGGER trg_kyc_document_access_log_no_mutate
  BEFORE UPDATE OR DELETE ON public.kyc_document_access_log
  FOR EACH ROW EXECUTE FUNCTION public.kyc_document_access_log_block_mutation();

-- Row-level UPDATE/DELETE triggers do NOT fire on TRUNCATE, so a separate
-- statement-level BEFORE TRUNCATE trigger is required to close that hole.
-- Reuses the same function (TG_OP resolves to 'TRUNCATE').
DROP TRIGGER IF EXISTS trg_kyc_document_access_log_no_truncate
  ON public.kyc_document_access_log;
CREATE TRIGGER trg_kyc_document_access_log_no_truncate
  BEFORE TRUNCATE ON public.kyc_document_access_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.kyc_document_access_log_block_mutation();

-- ──────────────────────────────────────────────────────────────────────────────
-- E. RLS / grants
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.kyc_document_access_log ENABLE ROW LEVEL SECURITY;

-- Block anon entirely (defence-in-depth alongside RLS default deny).
REVOKE ALL ON public.kyc_document_access_log FROM anon;

DROP POLICY IF EXISTS "kyc_document_access_log_service_role_all"   ON public.kyc_document_access_log;
DROP POLICY IF EXISTS "kyc_document_access_log_super_admin_select" ON public.kyc_document_access_log;

-- service_role: all operations (server writes the log via the service-role client).
CREATE POLICY "kyc_document_access_log_service_role_all"
  ON public.kyc_document_access_log FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- super_admin: SELECT only (review the trail). No staff/platform-admin read; no anon.
CREATE POLICY "kyc_document_access_log_super_admin_select"
  ON public.kyc_document_access_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = 'super_admin'::public.platform_role
  ));
