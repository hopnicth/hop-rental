-- ============================================================
-- 110_kyc_document_access_log_download_action.sql
--
-- Scope:
--   * Widen the `action` CHECK constraint on public.kyc_document_access_log
--     to allow 'download' — the audit value for the Phase 2 server-proxy
--     download endpoint (docs/kyc-phase-2-download-spec.md §3/§4; decisions.md
--     2026-06-05 Decision D). Nothing else changes.
--
-- Key design decisions:
--   * WIDENING-ONLY constraint change. The constraint is dropped and re-added
--     with a strict superset of the previous allowed values
--     ('upload' | 'download_signed_url' | 'delete' | 'download'), so it is
--     safe against every existing row — including the permanent staging probe
--     row (action='upload', reason='remote-verify-probe'; decisions.md
--     2026-06-05 Decision A) — because all previously allowed actions remain
--     allowed. The re-added constraint validates existing rows at ADD time
--     and passes by construction.
--   * 'download_signed_url' is retained: it is historical vocabulary and the
--     audit value of the shelved hybrid signed-URL contingency
--     (docs/kyc-phase-2-download-spec.md §9).
--   * `action` is a TEXT column; CHECK constraints do not appear in generated
--     types, so NO database.types.ts regeneration is required.
--   * DOES NOT touch: kyc_document_access_log_result_chk, table columns,
--     append-only triggers (trg_kyc_document_access_log_no_mutate /
--     _no_truncate), RLS policies, grants, or the kyc-profile-documents
--     bucket.
--   * Remote verification must be METADATA-ONLY (pg_get_constraintdef
--     contains 'download'); never insert probe/test rows into the remote
--     immutable log (decisions.md 2026-06-05 Decisions A and C item 5).
--     Behavioral insert tests run on the disposable LOCAL reset DB only.
--   * Idempotent: DROP CONSTRAINT IF EXISTS before ADD — re-running the file
--     converges to the same final constraint.
-- ============================================================

ALTER TABLE public.kyc_document_access_log
  DROP CONSTRAINT IF EXISTS kyc_document_access_log_action_chk;

ALTER TABLE public.kyc_document_access_log
  ADD CONSTRAINT kyc_document_access_log_action_chk
    CHECK (action IN ('upload', 'download_signed_url', 'delete', 'download'));
