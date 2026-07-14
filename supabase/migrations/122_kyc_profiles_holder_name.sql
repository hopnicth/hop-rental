-- ============================================================
-- 122: kyc_profiles.holder_name — §a name capture
-- decisions.md 2026-07-14 §a: individual = name-on-ID; juristic =
-- registered company name. REQUIRED at walk-in intake (endpoint 422),
-- optional on user-bound creation (users.full_name is the display source).
-- ============================================================

ALTER TABLE public.kyc_profiles ADD COLUMN IF NOT EXISTS holder_name text NULL;
COMMENT ON COLUMN public.kyc_profiles.holder_name IS
  'Name-on-ID (individual) / registered company name (juristic), §a. For user-bound profiles users.full_name is the display source; holder_name captures what the DOCUMENT says. Not an identity root — never hashed, never used for dedupe.';
