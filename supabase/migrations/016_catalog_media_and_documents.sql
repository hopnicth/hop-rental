-- Catalog media galleries, external media links, and document links

ALTER TABLE public.products
  ADD COLUMN media_gallery JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN media_links JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.product_skus
  ADD COLUMN media_gallery JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN use_product_images BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.products.media_gallery IS 'Processed product image gallery stored as JSONB array with processing status and variant URLs.';
COMMENT ON COLUMN public.products.media_links IS 'External video/media links (YouTube or similar) stored as JSONB array.';
COMMENT ON COLUMN public.products.documents IS 'External document links stored as JSONB array.';
COMMENT ON COLUMN public.product_skus.media_gallery IS 'Processed SKU-specific image gallery stored as JSONB array.';
COMMENT ON COLUMN public.product_skus.use_product_images IS 'If true, storefront should ignore SKU gallery and reuse product-level images.';

UPDATE public.products p
SET documents = COALESCE(
  (
    SELECT jsonb_agg(entry.value ORDER BY entry.position)
    FROM (
      SELECT 1 AS position,
        jsonb_build_object(
          'id', 'legacy-manual',
          'kind', 'manual',
          'title', COALESCE(p.documents->'manual'->'name'->>'th', p.documents->'manual'->'name'->>'en', 'manual'),
          'url', p.documents->'manual'->>'url',
          'createdAt', COALESCE(p.updated_at, p.created_at, now())::TEXT
        ) AS value
      WHERE COALESCE(p.documents->'manual'->>'url', '') <> ''

      UNION ALL

      SELECT 2 AS position,
        jsonb_build_object(
          'id', 'legacy-catalog',
          'kind', 'catalog',
          'title', COALESCE(p.documents->'catalog'->'name'->>'th', p.documents->'catalog'->'name'->>'en', 'catalog'),
          'url', p.documents->'catalog'->>'url',
          'createdAt', COALESCE(p.updated_at, p.created_at, now())::TEXT
        ) AS value
      WHERE COALESCE(p.documents->'catalog'->>'url', '') <> ''

      UNION ALL

      SELECT 3 AS position,
        jsonb_build_object(
          'id', 'legacy-datasheet',
          'kind', 'datasheet',
          'title', COALESCE(p.documents->'datasheet'->'name'->>'th', p.documents->'datasheet'->'name'->>'en', 'datasheet'),
          'url', p.documents->'datasheet'->>'url',
          'createdAt', COALESCE(p.updated_at, p.created_at, now())::TEXT
        ) AS value
      WHERE COALESCE(p.documents->'datasheet'->>'url', '') <> ''
    ) AS entry
  ),
  '[]'::JSONB
)
WHERE jsonb_typeof(p.documents) = 'object';

ALTER TABLE public.products
  ALTER COLUMN documents SET DEFAULT '[]'::JSONB;

UPDATE public.products p
SET media_gallery = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', CONCAT('legacy-', image.ordinality),
        'kind', 'image',
        'title', NULL,
        'altText', NULL,
        'fit', 'contain',
        'status', 'ready',
        'position', image.ordinality - 1,
        'originalFilename', NULL,
        'error', NULL,
        'uploadedAt', COALESCE(p.updated_at, p.created_at, now())::TEXT,
        'updatedAt', COALESCE(p.updated_at, p.created_at, now())::TEXT,
        'variants', jsonb_build_object(
          'thumbnail', jsonb_build_object('url', image.url, 'width', 300, 'height', 300, 'format', 'webp'),
          'card', jsonb_build_object('url', image.url, 'width', 800, 'height', 800, 'format', 'webp'),
          'large', jsonb_build_object('url', image.url, 'width', 1600, 'height', 1600, 'format', 'webp')
        )
      )
      ORDER BY image.ordinality
    )
    FROM unnest(
      CASE
        WHEN cardinality(COALESCE(p.image_urls, ARRAY[]::TEXT[])) > 0 THEN p.image_urls
        WHEN COALESCE(p.thumbnail_url, '') <> '' THEN ARRAY[p.thumbnail_url]
        ELSE ARRAY[]::TEXT[]
      END
    ) WITH ORDINALITY AS image(url, ordinality)
    WHERE COALESCE(trim(image.url), '') <> ''
  ),
  '[]'::JSONB
)
WHERE jsonb_array_length(p.media_gallery) = 0
  AND (
    cardinality(COALESCE(p.image_urls, ARRAY[]::TEXT[])) > 0
    OR COALESCE(p.thumbnail_url, '') <> ''
  );

UPDATE public.product_skus sku
SET media_gallery = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', CONCAT('legacy-', image.ordinality),
        'kind', 'image',
        'title', NULL,
        'altText', NULL,
        'fit', 'contain',
        'status', 'ready',
        'position', image.ordinality - 1,
        'originalFilename', NULL,
        'error', NULL,
        'uploadedAt', COALESCE(sku.updated_at, sku.created_at, now())::TEXT,
        'updatedAt', COALESCE(sku.updated_at, sku.created_at, now())::TEXT,
        'variants', jsonb_build_object(
          'thumbnail', jsonb_build_object('url', image.url, 'width', 300, 'height', 300, 'format', 'webp'),
          'card', jsonb_build_object('url', image.url, 'width', 800, 'height', 800, 'format', 'webp'),
          'large', jsonb_build_object('url', image.url, 'width', 1600, 'height', 1600, 'format', 'webp')
        )
      )
      ORDER BY image.ordinality
    )
    FROM unnest(
      CASE
        WHEN cardinality(COALESCE(sku.image_urls, ARRAY[]::TEXT[])) > 0 THEN sku.image_urls
        WHEN COALESCE(sku.image_url, '') <> '' THEN ARRAY[sku.image_url]
        ELSE ARRAY[]::TEXT[]
      END
    ) WITH ORDINALITY AS image(url, ordinality)
    WHERE COALESCE(trim(image.url), '') <> ''
  ),
  '[]'::JSONB
)
WHERE jsonb_array_length(sku.media_gallery) = 0
  AND (
    cardinality(COALESCE(sku.image_urls, ARRAY[]::TEXT[])) > 0
    OR COALESCE(sku.image_url, '') <> ''
  );

UPDATE public.product_skus
SET use_product_images = FALSE
WHERE jsonb_array_length(media_gallery) > 0;

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
    b.category_keys, b.brand, COALESCE(b.media_gallery, '[]'::JSONB), b.spec,
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

COMMENT ON FUNCTION public.search_products IS 'Full-text + facet search over public products. Returns ranked results with pricing/stock aggregates and media_gallery for thumbnail derivation.';

DROP FUNCTION IF EXISTS public.autocomplete_products(
  text,
  integer
);

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
  media_gallery    jsonb,
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
    COALESCE(p.media_gallery, '[]'::JSONB),
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

COMMENT ON FUNCTION public.autocomplete_products IS 'Typeahead suggestions for product names using trigram similarity + prefix ILIKE. Returns media_gallery for thumbnail derivation.';

ALTER TABLE public.products
  DROP COLUMN IF EXISTS thumbnail_url,
  DROP COLUMN IF EXISTS image_urls;

ALTER TABLE public.product_skus
  DROP COLUMN IF EXISTS image_url,
  DROP COLUMN IF EXISTS image_urls;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-media',
  'catalog-media',
  TRUE,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;