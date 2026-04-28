-- 039: Add `service_areas` to content_pages so service-type pages can declare
-- which Thai regions/provinces they cover. Vocabulary lives in the app
-- (app/data/thaiServiceAreas.ts); the DB only stores slugs as a TEXT[].
-- Indexed with GIN so future filters like `service_areas && '{phuket}'` are fast.

ALTER TABLE public.content_pages
  ADD COLUMN IF NOT EXISTS service_areas TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS content_pages_service_areas_idx
  ON public.content_pages USING GIN (service_areas);

COMMENT ON COLUMN public.content_pages.service_areas IS
  'Optional list of service-area slugs (Thai provinces, regions, special) used when content_type=service. Empty array for blog/promotion. Vocabulary is enforced in the app layer.';
