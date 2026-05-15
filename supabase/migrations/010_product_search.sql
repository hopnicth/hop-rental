-- ============================================================
-- HOPNIC — Migration 010: Product Search Infrastructure
-- ============================================================
-- Depends on:
--   - 004_catalog_booking_asset_ledger.sql (public.products, public.product_skus)
--
-- Goals:
--   - Enable trigram extension for fuzzy matching and autocomplete
--   - Add weighted tsvector generated column on products for FTS
--   - Add GIN indexes for FTS and trigram matching
--   - Expose search_products() and autocomplete_products() RPCs to the client
-- ============================================================


-- ─── 1. EXTENSIONS ──────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm'
      AND n.nspname <> 'extensions'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END $$;


-- ─── 2. SEARCH VECTOR COLUMN ────────────────────────────────
-- Postgres rejects `to_tsvector` inside STORED generated columns because the
-- text-search config resolution is only STABLE (not IMMUTABLE). Use a
-- BEFORE INSERT/UPDATE trigger to populate the column instead.

ALTER TABLE public.products
  ADD COLUMN search_vector tsvector;

COMMENT ON COLUMN public.products.search_vector IS 'Weighted tsvector for full-text product search. A=names, B=brand/categories, C=descriptions, D=spec values.';

CREATE OR REPLACE FUNCTION public.products_search_vector_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple',
      coalesce(NEW.name_th, '') || ' ' ||
      coalesce(NEW.name_en, '') || ' ' ||
      coalesce(NEW.name_cn, '') || ' ' ||
      coalesce(NEW.name_jp, '')
    ), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.brand, '') || ' ' ||
      coalesce(array_to_string(NEW.category_keys, ' '), '')
    ), 'B') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.description_th, '') || ' ' ||
      coalesce(NEW.description_en, '') || ' ' ||
      coalesce(NEW.description_cn, '') || ' ' ||
      coalesce(NEW.description_jp, '')
    ), 'C') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.spec::text, '')
    ), 'D');
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_search_vector_trg
  BEFORE INSERT OR UPDATE OF
    name_th, name_en, name_cn, name_jp,
    brand, category_keys,
    description_th, description_en, description_cn, description_jp,
    spec
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_search_vector_update();

-- Backfill existing rows (no-op UPDATE fires the BEFORE trigger)
UPDATE public.products SET name_th = name_th;


-- ─── 3. INDEXES ─────────────────────────────────────────────

CREATE INDEX idx_products_search_vector
  ON public.products USING GIN (search_vector);

CREATE INDEX idx_products_name_trgm
  ON public.products
  USING GIN ((coalesce(name_th, '') || ' ' || coalesce(name_en, '')) extensions.gin_trgm_ops);


-- ─── 4. SEARCH RPC ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_products(
  q            text      DEFAULT '',
  p_categories text[]    DEFAULT NULL,
  p_type       text      DEFAULT NULL,
  p_brands     text[]    DEFAULT NULL,
  p_min_price  numeric   DEFAULT NULL,
  p_max_price  numeric   DEFAULT NULL,
  p_in_stock   boolean   DEFAULT FALSE,
  p_limit      integer   DEFAULT 24,
  p_offset     integer   DEFAULT 0
)
RETURNS TABLE (
  id              text,
  slug            text,
  type            catalog_product_type,
  name_th         text,
  name_en         text,
  name_cn         text,
  name_jp         text,
  description_th  text,
  description_en  text,
  description_cn  text,
  description_jp  text,
  category_keys   text[],
  brand           text,
  thumbnail_url   text,
  image_urls      text[],
  spec            jsonb,
  min_price       numeric,
  max_price       numeric,
  total_stock     integer,
  total_rental    integer,
  trending_score  numeric,
  rank            real,
  total_count     bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH
    query AS (
      SELECT
        nullif(trim(q), '')                                        AS raw,
        CASE
          WHEN nullif(trim(q), '') IS NOT NULL
          THEN plainto_tsquery('simple', q)
        END                                                        AS tsq
    ),
    sku_agg AS (
      SELECT
        product_id,
        MIN(NULLIF(price, 0))                                      AS min_price,
        MAX(price)                                                 AS max_price,
        COALESCE(SUM(stock), 0)::integer                           AS total_stock,
        COALESCE(SUM(rental_stock), 0)::integer                    AS total_rental
      FROM public.product_skus
      GROUP BY product_id
    ),
    base AS (
      SELECT
        p.*,
        sk.min_price,
        sk.max_price,
        COALESCE(sk.total_stock, 0)   AS total_stock,
        COALESCE(sk.total_rental, 0)  AS total_rental,
        CASE
          WHEN (SELECT tsq FROM query) IS NOT NULL
          THEN ts_rank(p.search_vector, (SELECT tsq FROM query))
          ELSE 0
        END                            AS rank_score
      FROM public.products p
      LEFT JOIN sku_agg sk ON sk.product_id = p.id
      WHERE
        p.is_hidden = FALSE
        AND (
          (SELECT tsq FROM query) IS NULL
          OR p.search_vector @@ (SELECT tsq FROM query)
          OR (coalesce(p.name_th, '') || ' ' || coalesce(p.name_en, '')) ILIKE '%' || (SELECT raw FROM query) || '%'
        )
        AND (p_categories IS NULL OR p.category_keys && p_categories)
        AND (p_type       IS NULL OR p.type::text = p_type)
        AND (p_brands     IS NULL OR p.brand = ANY(p_brands))
        AND (p_min_price  IS NULL OR sk.min_price >= p_min_price)
        AND (p_max_price  IS NULL OR sk.min_price <= p_max_price)
        AND (NOT p_in_stock OR (COALESCE(sk.total_stock, 0) + COALESCE(sk.total_rental, 0)) > 0)
    )
  SELECT
    b.id, b.slug, b.type,
    b.name_th, b.name_en, b.name_cn, b.name_jp,
    b.description_th, b.description_en, b.description_cn, b.description_jp,
    b.category_keys, b.brand, b.thumbnail_url, b.image_urls, b.spec,
    b.min_price, b.max_price, b.total_stock, b.total_rental,
    b.trending_score, b.rank_score::real AS rank,
    COUNT(*) OVER ()::bigint AS total_count
  FROM base b
  ORDER BY
    b.rank_score DESC NULLS LAST,
    b.trending_score DESC NULLS LAST,
    b.order_count DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;

COMMENT ON FUNCTION public.search_products IS 'Full-text + facet search over public products. Returns ranked results with pricing/stock aggregates and total_count for pagination.';



-- ─── 5. AUTOCOMPLETE RPC ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.autocomplete_products(
  prefix  text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  id               text,
  slug             text,
  name_th          text,
  name_en          text,
  name_cn          text,
  name_jp          text,
  thumbnail_url    text,
  type             catalog_product_type,
  category_keys    text[],
  similarity_score real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    p.id,
    p.slug,
    p.name_th,
    p.name_en,
    p.name_cn,
    p.name_jp,
    p.thumbnail_url,
    p.type,
    p.category_keys,
    GREATEST(
      extensions.similarity(coalesce(p.name_th, ''), prefix),
      extensions.similarity(coalesce(p.name_en, ''), prefix)
    )::real AS similarity_score
  FROM public.products p
  WHERE
    p.is_hidden = FALSE
    AND nullif(trim(prefix), '') IS NOT NULL
    AND (
      p.name_th ILIKE prefix || '%'
      OR p.name_en ILIKE prefix || '%'
      OR (coalesce(p.name_th, '') || ' ' || coalesce(p.name_en, '')) ILIKE '%' || prefix || '%'
      OR extensions.similarity(coalesce(p.name_th, ''), prefix) > 0.2
      OR extensions.similarity(coalesce(p.name_en, ''), prefix) > 0.2
    )
  ORDER BY
    similarity_score DESC,
    p.order_count DESC,
    p.trending_score DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.autocomplete_products IS 'Typeahead suggestions for product names using trigram similarity + prefix ILIKE.';


-- ─── 6. GRANTS ──────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.search_products(text, text[], text, text[], numeric, numeric, boolean, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autocomplete_products(text, integer) TO anon, authenticated;
