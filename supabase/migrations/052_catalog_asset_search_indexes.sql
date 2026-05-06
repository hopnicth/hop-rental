-- 052: Catalog/asset search indexes + asset autocomplete
--
-- Additive migration: no existing catalog columns are removed or renamed.
-- Goals:
--   * Give products a missing GIN index for category overlap search.
--   * Give assets parity with product search: curated keywords, tsvector,
--     trigram lookup indexes, category/tag GIN indexes, and autocomplete RPC.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Product index gap ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_category_keys
  ON public.products USING GIN (category_keys);

CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON public.products USING GIN ((coalesce(brand, '')) extensions.gin_trgm_ops)
  WHERE brand IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_main_category_visibility
  ON public.products (main_category_key, is_hidden, updated_at DESC);


-- ─── Asset search columns ──────────────────────────────────────

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS search_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

COMMENT ON COLUMN public.assets.search_keywords IS
  'Admin/AI curated asset aliases and natural-language search phrases. Do not duplicate code, slug, brand, main_category_key, or tag_keys.';

COMMENT ON COLUMN public.assets.search_vector IS
  'Weighted tsvector for asset search. A=code/slug/names, B=brand/categories/tags/admin keywords, C=descriptions, D=spec/detail blocks.';

CREATE OR REPLACE FUNCTION public.assets_search_vector_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_keywords := COALESCE(NEW.search_keywords, ARRAY[]::TEXT[]);

  NEW.search_vector :=
    setweight(to_tsvector('simple',
      coalesce(NEW.code, '') || ' ' ||
      coalesce(NEW.slug, '') || ' ' ||
      coalesce(NEW.name_th, '') || ' ' ||
      coalesce(NEW.name_en, '') || ' ' ||
      coalesce(NEW.name_cn, '') || ' ' ||
      coalesce(NEW.name_jp, '')
    ), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.brand, '') || ' ' ||
      coalesce(NEW.main_category_key, '') || ' ' ||
      coalesce(array_to_string(NEW.category_keys, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.tag_keys, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.search_keywords, ' '), '')
    ), 'B') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.description_th, '') || ' ' ||
      coalesce(NEW.description_en, '') || ' ' ||
      coalesce(NEW.description_cn, '') || ' ' ||
      coalesce(NEW.description_jp, '')
    ), 'C') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.spec_summary::TEXT, '') || ' ' ||
      coalesce(NEW.detail_blocks::TEXT, '')
    ), 'D');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_search_vector_trg ON public.assets;

CREATE TRIGGER assets_search_vector_trg
  BEFORE INSERT OR UPDATE OF
    code, slug, name_th, name_en, name_cn, name_jp,
    brand, main_category_key, category_keys, tag_keys, search_keywords,
    description_th, description_en, description_cn, description_jp,
    spec_summary, detail_blocks
  ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.assets_search_vector_update();

-- Backfill existing assets so autocomplete works immediately after migration.
UPDATE public.assets SET code = code;


-- ─── Asset indexes ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_assets_search_vector
  ON public.assets USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_assets_code_trgm
  ON public.assets USING GIN ((coalesce(code, '')) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_assets_name_trgm
  ON public.assets USING GIN ((
    coalesce(name_th, '') || ' ' ||
    coalesce(name_en, '') || ' ' ||
    coalesce(name_cn, '') || ' ' ||
    coalesce(name_jp, '')
  ) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_assets_brand_trgm
  ON public.assets USING GIN ((coalesce(brand, '')) extensions.gin_trgm_ops)
  WHERE brand IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_category_keys
  ON public.assets USING GIN (category_keys);

CREATE INDEX IF NOT EXISTS idx_assets_search_keywords
  ON public.assets USING GIN (search_keywords);

CREATE INDEX IF NOT EXISTS idx_assets_main_category_visibility
  ON public.assets (main_category_key, status, is_hidden, sort_order, updated_at DESC);


-- ─── Asset keywords → central catalog_terms dictionary ─────────

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

  FOREACH raw_value IN ARRAY COALESCE(NEW.search_keywords, ARRAY[]::TEXT[])
  LOOP
    PERFORM public.upsert_catalog_term('search_keyword', raw_value);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_after_sync_catalog_terms_trg ON public.assets;

CREATE TRIGGER assets_after_sync_catalog_terms_trg
  AFTER INSERT OR UPDATE OF tag_keys, search_keywords
  ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_catalog_terms_from_asset();

INSERT INTO public.catalog_terms (kind, normalized_value, display_value)
SELECT DISTINCT
  'search_keyword',
  public.normalize_catalog_search_keyword_term(raw_value),
  trim(regexp_replace(coalesce(raw_value, ''), '\s+', ' ', 'g'))
FROM public.assets a,
LATERAL unnest(COALESCE(a.search_keywords, ARRAY[]::TEXT[])) AS raw_value
WHERE char_length(public.normalize_catalog_search_keyword_term(raw_value)) > 0
ON CONFLICT (kind, normalized_value) DO UPDATE
SET is_active = TRUE,
    updated_at = timezone('utc', now()),
    display_value = EXCLUDED.display_value;


-- ─── Asset autocomplete RPC ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.autocomplete_assets(
  prefix           TEXT,
  p_limit          INTEGER DEFAULT 8,
  p_include_hidden BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id               UUID,
  code             TEXT,
  slug             TEXT,
  status           public.asset_status,
  name_th          TEXT,
  name_en          TEXT,
  name_cn          TEXT,
  name_jp          TEXT,
  brand            TEXT,
  thumbnail_url    TEXT,
  main_category_key TEXT,
  category_keys    TEXT[],
  similarity_score REAL
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH query AS (
    SELECT nullif(trim(prefix), '') AS raw
  )
  SELECT
    a.id,
    a.code,
    a.slug,
    a.status,
    a.name_th,
    a.name_en,
    a.name_cn,
    a.name_jp,
    a.brand,
    a.thumbnail_url,
    a.main_category_key,
    a.category_keys,
    GREATEST(
      extensions.similarity(coalesce(a.code, ''), q.raw),
      extensions.similarity(coalesce(a.slug, ''), q.raw),
      extensions.similarity(coalesce(a.name_th, ''), q.raw),
      extensions.similarity(coalesce(a.name_en, ''), q.raw),
      extensions.similarity(coalesce(a.brand, ''), q.raw)
    )::REAL AS similarity_score
  FROM public.assets a
  CROSS JOIN query q
  WHERE
    q.raw IS NOT NULL
    AND (p_include_hidden OR (a.status = 'active' AND a.is_hidden = FALSE))
    AND (
      a.search_vector @@ plainto_tsquery('simple', q.raw)
      OR a.code ILIKE q.raw || '%'
      OR a.slug ILIKE q.raw || '%'
      OR a.name_th ILIKE '%' || q.raw || '%'
      OR a.name_en ILIKE '%' || q.raw || '%'
      OR coalesce(a.brand, '') ILIKE '%' || q.raw || '%'
      OR (coalesce(a.code, '') || ' ' || coalesce(a.slug, '') || ' ' || coalesce(a.name_th, '') || ' ' || coalesce(a.name_en, '')) ILIKE '%' || q.raw || '%'
      OR extensions.similarity(coalesce(a.code, ''), q.raw) > 0.2
      OR extensions.similarity(coalesce(a.name_th, ''), q.raw) > 0.2
      OR extensions.similarity(coalesce(a.name_en, ''), q.raw) > 0.2
    )
  ORDER BY
    (lower(a.code) = lower(q.raw)) DESC,
    (a.code ILIKE q.raw || '%') DESC,
    similarity_score DESC,
    a.rental_count DESC,
    a.sort_order ASC,
    a.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50);
$$;

COMMENT ON FUNCTION public.autocomplete_assets(TEXT, INTEGER, BOOLEAN) IS
  'Typeahead suggestions for assets using exact code/prefix, full-text search, and trigram similarity. p_include_hidden is intended for service-role/admin calls; RLS still applies for normal callers.';

GRANT EXECUTE ON FUNCTION public.autocomplete_assets(TEXT, INTEGER, BOOLEAN) TO anon, authenticated;