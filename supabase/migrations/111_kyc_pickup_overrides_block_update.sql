-- ============================================================
-- 111: kyc_pickup_overrides — block in-place UPDATE (audit hardening)
--
-- Decision: Minimal Verify KYC v1 inspection (2026-06-06, "Option R") found
-- that the super_admin FOR ALL RLS policy on kyc_pickup_overrides permitted
-- silent post-hoc UPDATE of accountability fields (override_reason,
-- overridden_by_user_id, booking_id, kyc_profile_id, branch_id, …).
-- Overrides are the v1 escape hatch for walk-in pickups while verification
-- is admin_panel-only, so the written record must be tamper-proof.
--
-- This migration blocks UPDATE for ALL roles via a trigger (RLS cannot bind
-- service_role; a trigger can). The simplest correct rule is to block every
-- UPDATE rather than enumerate protected columns — there is no legitimate
-- in-place edit of an override row.
--
-- DELETE remains ALLOWED in v1: per the locked POS V3 KYC design, deleting
-- the row is the designed override-invalidation path until TASK 6 introduces
-- expiry/used semantics.
--
-- RESIDUAL RISK (accepted temporarily): DELETE erases the override trace.
-- Accepted until TASK 6 redesigns the override lifecycle. TASK 6 REQUIREMENT:
-- the redesign must PRESERVE this immutability invariant (no reintroduction
-- of in-place UPDATE semantics) and should replace delete-to-invalidate with
-- an auditable invalidation marker.
-- ============================================================

CREATE OR REPLACE FUNCTION public.kyc_pickup_overrides_block_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'kyc_pickup_overrides rows are immutable: UPDATE is not permitted (delete-to-invalidate remains the designed path until TASK 6)';
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_pickup_overrides_no_update
  ON public.kyc_pickup_overrides;
CREATE TRIGGER trg_kyc_pickup_overrides_no_update
  BEFORE UPDATE ON public.kyc_pickup_overrides
  FOR EACH ROW EXECUTE FUNCTION public.kyc_pickup_overrides_block_update();

COMMENT ON TABLE public.kyc_pickup_overrides IS
  'Super-admin-only pickup exception audit records (who/when/why are NOT NULL at write time). UPDATE is blocked for all roles by trigger (migration 111) — rows are immutable once written. DELETE remains the designed invalidation path until TASK 6; the resulting trace erasure is an accepted residual risk. TASK 6 must preserve the no-UPDATE invariant.';
