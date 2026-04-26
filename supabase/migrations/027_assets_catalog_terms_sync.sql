-- 027: Sync assets.tag_keys into the central catalog_terms dictionary
-- Mirrors products_after_sync_catalog_terms_trg from migration 017.

CREATE OR REPLACE FUNCTION public.sync_catalog_terms_from_asset()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  raw_value TEXT;
BEGIN
  FOREACH raw_value IN ARRAY COALESCE(NEW.tag_keys, ARRAY[]::TEXT[])
  LOOP
    PERFORM public.upsert_catalog_term('tag', raw_value);
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_catalog_terms_from_asset IS 'Mirrors product tag sync: feeds asset tag_keys into public.catalog_terms.';

DROP TRIGGER IF EXISTS assets_after_sync_catalog_terms_trg ON public.assets;

CREATE TRIGGER assets_after_sync_catalog_terms_trg
  AFTER INSERT OR UPDATE OF tag_keys
  ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_catalog_terms_from_asset();

-- Backfill existing asset tag_keys into catalog_terms.
INSERT INTO public.catalog_terms (kind, normalized_value, display_value)
SELECT DISTINCT
  'tag',
  public.normalize_catalog_tag_term(raw_value),
  public.normalize_catalog_tag_term(raw_value)
FROM public.assets a,
LATERAL unnest(COALESCE(a.tag_keys, ARRAY[]::TEXT[])) AS raw_value
WHERE char_length(public.normalize_catalog_tag_term(raw_value)) > 0
ON CONFLICT (kind, normalized_value) DO UPDATE
SET is_active = TRUE,
    updated_at = timezone('utc', now());
