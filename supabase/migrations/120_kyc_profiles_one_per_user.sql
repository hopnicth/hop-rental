-- ============================================================
-- 120: kyc_profiles — one profile per registered user (§a "once per user")
--
-- decisions.md 2026-07-14 §a addendum item 4. Walk-in profiles
-- (user_id IS NULL) are unconstrained and continue to dedupe on
-- identity_hash. Rejected/expired/revoked profiles are re-verified
-- IN PLACE (verify_kyc_profile blocks only status='verified',
-- migration 112 line 237); resubmission flips rejected→pending on the
-- same row. No path ever requires a second row per user.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS kyc_profiles_user_id_unique
  ON public.kyc_profiles (user_id)
  WHERE user_id IS NOT NULL;
