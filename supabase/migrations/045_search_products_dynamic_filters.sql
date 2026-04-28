-- 045_search_products_dynamic_filters.sql
-- Extend /search RPC with dynamic filter selections keyed by filter_group.id.

DROP FUNCTION IF EXISTS public.search_products(
  text,
  text[],
  text,
  text[],
  numeric,
  numeric,
  boolean,
  integer,
  integer
);

CREATE OR REPLACE FUNCTION public.search_products(
  q                 text      DEFAULT '',
  p_categories      text[]    DEFAULT NULL,
  p_type            text      DEFAULT NULL,
  p_brands          text[]    DEFAULT NULL,
  p_min_price       numeric   DEFAULT NULL,
  p_max_price       numeric   DEFAULT NULL,
  p_in_stock        boolean   DEFAULT FALSE,
  p_limit           integer   DEFAULT 24,
  p_offset          integer   DEFAULT 0,
  p_dynamic_filters jsonb     DEFAULT NULL
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
  media_gallery   jsonb,
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
        nullif(trim(q), '') AS raw,
        CASE
          WHEN nullif(trim(q), '') IS NOT NULL
          THEN plainto_tsquery('simple', q)
        END AS tsq
    ),
    sku_agg AS (
      SELECT
        product_id,
        MIN(NULLIF(price, 0)) AS min_price,
        MAX(price) AS max_price,
        COALESCE(SUM(stock), 0)::INTEGER AS total_stock
      FROM public.product_skus
      GROUP BY product_id
    ),
    base AS (
      SELECT
        p.*,
        COALESCE(pm.trending_score, 0) AS trending_score,
        COALESCE(pm.order_count, 0) AS order_count,
        sk.min_price,
        sk.max_price,
        COALESCE(sk.total_stock, 0) AS total_stock,
        0::INTEGER AS total_rental,
        CASE
          WHEN (SELECT tsq FROM query) IS NOT NULL
          THEN ts_rank(p.search_vector, (SELECT tsq FROM query))
          ELSE 0
        END AS rank_score
      FROM public.products p
      LEFT JOIN public.product_metrics pm ON pm.product_id = p.id
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
        AND (p_brands IS NULL OR p.brand = ANY(p_brands))
        AND (p_min_price IS NULL OR sk.min_price >= p_min_price)
        AND (p_max_price IS NULL OR sk.min_price <= p_max_price)
        AND (NOT p_in_stock OR COALESCE(sk.total_stock, 0) > 0)
        AND (
          p_dynamic_filters IS NULL
          OR p_dynamic_filters = '{}'::jsonb
          OR NOT EXISTS (
            SELECT 1
            FROM jsonb_each(p_dynamic_filters) AS sel(group_id, value)
            JOIN public.filter_groups fg
              ON fg.id::text = sel.group_id
             AND fg.is_active = TRUE
            LEFT JOIN LATERAL (
              SELECT array_agg(fg.key || '__' || fo.key) AS expected_keys
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(sel.value) = 'array' THEN sel.value
                  ELSE '[]'::jsonb
                END
              ) AS selected(option_id)
              JOIN public.filter_options fo
                ON fo.id::text = selected.option_id
               AND fo.group_id = fg.id
               AND fo.is_active = TRUE
            ) option_match ON TRUE
            LEFT JOIN LATERAL (
              SELECT substring(
                coalesce(p.spec->>fg.spec_key, '')
                from '-?[0-9]+(\.[0-9]+)?'
              )::numeric AS spec_number
            ) spec_match ON fg.filter_type = 'number_range'
            WHERE
              (
                fg.filter_type = 'number_range'
                AND jsonb_typeof(sel.value) = 'object'
                AND (
                  jsonb_typeof(sel.value->'min') = 'number'
                  OR jsonb_typeof(sel.value->'max') = 'number'
                )
                AND NOT (
                  spec_match.spec_number IS NOT NULL
                  AND (
                    jsonb_typeof(sel.value->'min') IS DISTINCT FROM 'number'
                    OR spec_match.spec_number >= (sel.value->>'min')::numeric
                  )
                  AND (
                    jsonb_typeof(sel.value->'max') IS DISTINCT FROM 'number'
                    OR spec_match.spec_number <= (sel.value->>'max')::numeric
                  )
                )
              )
              OR (
                fg.filter_type IN ('checkbox', 'dropdown')
                AND jsonb_typeof(sel.value) = 'array'
                AND jsonb_array_length(sel.value) > 0
                AND NOT (
                  COALESCE(array_length(option_match.expected_keys, 1), 0) > 0
                  AND CASE
                    WHEN fg.match_logic = 'and'
                    THEN p.filter_keys @> option_match.expected_keys
                    ELSE p.filter_keys && option_match.expected_keys
                  END
                )
              )
          )
        )
    )
  SELECT
    b.id, b.slug, b.type,
    b.name_th, b.name_en, b.name_cn, b.name_jp,
    b.description_th, b.description_en, b.description_cn, b.description_jp,
    b.category_keys, b.brand, COALESCE(b.media_gallery, '[]'::JSONB), b.spec,
    b.min_price, b.max_price, b.total_stock, b.total_rental,
    b.trending_score, b.rank_score::REAL AS rank,
    COUNT(*) OVER ()::BIGINT AS total_count
  FROM base b
  ORDER BY
    b.rank_score DESC NULLS LAST,
    b.trending_score DESC NULLS LAST,
    b.order_count DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;

COMMENT ON FUNCTION public.search_products IS
  'Full-text + facet search over public products, including dynamic filter selections from filter_groups/filter_options.';

GRANT EXECUTE ON FUNCTION public.search_products(
  text,
  text[],
  text,
  text[],
  numeric,
  numeric,
  boolean,
  integer,
  integer,
  jsonb
) TO anon, authenticated;