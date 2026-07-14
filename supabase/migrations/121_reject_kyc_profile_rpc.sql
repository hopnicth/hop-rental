-- ============================================================
-- 121: reject_kyc_profile RPC
--
-- decisions.md §a addendum item 4: rejection of a PENDING profile is a
-- super-admin verification decision of the same class as verify/revoke —
-- never a direct service-role UPDATE. Sibling-shaped to
-- verify_kyc_profile / revoke_kyc_profile (migration 112): self-guarding,
-- FOR UPDATE row lock, decision INSERT + profile UPDATE in one transaction,
-- service_role-only grants.
--
-- Also widens the decision-outcome CHECK (112 allows only
-- 'verified'|'revoked') to include 'rejected'.
-- ============================================================

-- A. Widen outcome CHECK to admit 'rejected'. reason_code stays structured:
--    used by 'revoked' AND 'rejected' decisions, NULL for 'verified'.
ALTER TABLE public.kyc_verification_decisions
  DROP CONSTRAINT kyc_verification_decisions_outcome_chk;
ALTER TABLE public.kyc_verification_decisions
  ADD CONSTRAINT kyc_verification_decisions_outcome_chk
    CHECK (outcome IN ('verified', 'revoked', 'rejected'));

-- B. RPC: reject_kyc_profile — ONE transaction: decision INSERT + profile UPDATE
CREATE OR REPLACE FUNCTION public.reject_kyc_profile(
  p_profile_id         uuid,
  p_decided_by_user_id uuid,
  p_decided_by_name    text,
  p_decided_by_role    text,
  p_reason_code        text,
  p_note               text DEFAULT NULL,
  p_ip_address         inet DEFAULT NULL,
  p_user_agent         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile     public.kyc_profiles%ROWTYPE;
  v_now         timestamptz := now();
  v_decision_id uuid;
BEGIN
  -- Defence-in-depth: the endpoint guard is the requirePlatformAdmin +
  -- explicit super_admin inversion (decisions.md §a addendum item 2);
  -- re-assert here.
  IF p_decided_by_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'KYC_REJECT_SUPER_ADMIN_ONLY';
  END IF;
  IF p_decided_by_user_id IS NULL THEN
    RAISE EXCEPTION 'KYC_REJECT_ACTOR_REQUIRED';
  END IF;
  IF p_reason_code IS NULL
     OR p_reason_code NOT IN ('document_illegible', 'document_incomplete',
                              'document_expired', 'identity_mismatch', 'other') THEN
    RAISE EXCEPTION 'KYC_REJECT_REASON_INVALID';
  END IF;

  -- Row lock: closes the concurrent reject/verify race.
  SELECT * INTO v_profile FROM public.kyc_profiles
   WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KYC_PROFILE_NOT_FOUND';
  END IF;
  -- Rejection applies to the pending queue ONLY (verified profiles are
  -- revoked, not rejected).
  IF v_profile.status <> 'pending' THEN
    RAISE EXCEPTION 'KYC_PROFILE_NOT_PENDING';
  END IF;

  INSERT INTO public.kyc_verification_decisions (
    kyc_profile_id, customer_type, identity_type,
    decided_by_user_id, decided_by_name, decided_by_role,
    decided_at, outcome, method,
    reviewed_document_ids, visual_review_confirmed,
    vat_status, valid_until, reason_code,
    ip_address, user_agent
  ) VALUES (
    v_profile.id, v_profile.customer_type, v_profile.identity_type,
    p_decided_by_user_id, p_decided_by_name, p_decided_by_role,
    v_now, 'rejected', 'admin_panel',
    '{}', false,
    NULL, NULL, p_reason_code,
    p_ip_address, p_user_agent
  ) RETURNING id INTO v_decision_id;

  -- Current-state mirror. Resubmission (document upload) flips the SAME row
  -- back to 'pending'; rejected_* stay as history until then.
  UPDATE public.kyc_profiles SET
    status                = 'rejected',
    rejected_at           = v_now,
    rejection_reason_code = p_reason_code,
    rejection_note        = p_note
  WHERE id = v_profile.id;

  RETURN jsonb_build_object(
    'decision_id', v_decision_id,
    'outcome', 'rejected',
    'decided_at', v_now,
    'reason_code', p_reason_code
  );
END;
$$;

-- C. Grants — service_role only (endpoints call via the service-role client)
REVOKE ALL ON FUNCTION public.reject_kyc_profile(uuid, uuid, text, text, text, text, inet, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_kyc_profile(uuid, uuid, text, text, text, text, inet, text) TO service_role;
