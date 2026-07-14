-- ============================================================
-- 124: kyc_verification_decisions — reason_chk widening for 'rejected'
--
-- Migration 121 widened the outcome CHECK but missed the SIBLING
-- reason_chk (112:102-106), which forces reason_code IS NULL for every
-- outcome except 'revoked' — so reject_kyc_profile's decision INSERT
-- (outcome='rejected' + reason_code) violated it and rolled back
-- atomically. This widens reason_chk with the rejected reason set
-- (mirrors the RPC's own validation in migration 121).
--
-- Plain DROP (no IF EXISTS): a wrong constraint name must fail loudly.
-- Validity: existing rows are 'verified' with NULL reason_code, which
-- still satisfies the new predicate.
-- ============================================================

ALTER TABLE public.kyc_verification_decisions
  DROP CONSTRAINT kyc_verification_decisions_reason_chk;

ALTER TABLE public.kyc_verification_decisions
  ADD CONSTRAINT kyc_verification_decisions_reason_chk
    CHECK (
      (outcome = 'revoked' AND reason_code IN
        ('fraud_suspected', 'document_invalid', 'verified_in_error', 'other'))
      OR (outcome = 'rejected' AND reason_code IN
        ('document_illegible', 'document_incomplete', 'document_expired',
         'identity_mismatch', 'other'))
      OR (outcome NOT IN ('revoked', 'rejected') AND reason_code IS NULL)
    );
