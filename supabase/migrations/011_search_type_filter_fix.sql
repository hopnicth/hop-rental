-- ============================================================
-- HOPNIC — Migration 011: Refine type filter in search_products
-- ============================================================
-- Adjust the `p_type` filter so that picking 'sale' or 'rental'
-- also includes hybrid products (which are both saleable and rentable).
-- 'hybrid' value is no longer exposed in the UI but still accepted
-- if passed explicitly (keeps backward compatibility).
-- ============================================================

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
        AND (
          p_type IS NULL
          OR (p_type = 'sale'   AND p.type::text IN ('sale',   'hybrid'))
          OR (p_type = 'rental' AND p.type::text IN ('rental', 'hybrid'))
          OR (p_type = 'hybrid' AND p.type::text = 'hybrid')
        )
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
