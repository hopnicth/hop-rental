-- patch_maps_url_constraint.sql
-- Remove goo.gl from maps_url constraint on partner_profiles.
-- Applied manually because migration 096 was already in the DB when 096 was patched.

ALTER TABLE public.partner_profiles
  DROP CONSTRAINT IF EXISTS partner_profiles_maps_url_check;

ALTER TABLE public.partner_profiles
  ADD CONSTRAINT partner_profiles_maps_url_check
  CHECK (
    maps_url IS NULL OR (
      maps_url ~* '^https://maps\.google\.com(/|\?|#|$)'     OR
      maps_url ~* '^https://www\.google\.com/maps(/|\?|#|$)' OR
      maps_url ~* '^https://maps\.app\.goo\.gl(/|\?|#|$)'
    )
  );

-- Verify: goo.gl absent, maps.app.goo.gl present
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.partner_profiles'::regclass
  AND conname = 'partner_profiles_maps_url_check';
