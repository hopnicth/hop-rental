-- ============================================================
-- 123: kyc_document_access_log — widen action CHECK for T1a endpoints
-- decisions.md §a addendum item 2 requires every KYC endpoint (queue list,
-- verify caller, reject caller, revoke caller) to audit-log denials via
-- logKycDocumentAccess BEFORE throwing. The action CHECK (last widened by
-- migration 110) allows only upload/download_signed_url/delete/download —
-- none of the new endpoints has a legal value. Same DROP/ADD pattern as 110;
-- validity is safe because all previously allowed values remain in the set.
-- ============================================================

-- Plain DROP (no IF EXISTS): a wrong constraint name must fail loudly, not
-- no-op and leave a second constraint blocking the new action values.
ALTER TABLE public.kyc_document_access_log
  DROP CONSTRAINT kyc_document_access_log_action_chk;

ALTER TABLE public.kyc_document_access_log
  ADD CONSTRAINT kyc_document_access_log_action_chk
    CHECK (action IN (
      'upload', 'download_signed_url', 'delete', 'download',
      'list_pending', 'verify', 'reject', 'revoke'
    ));
