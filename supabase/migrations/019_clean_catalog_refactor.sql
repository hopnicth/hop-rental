-- Clean catalog refactor:
-- - move product insights to product_metrics
-- - remove rental-specific columns from products/product_skus
-- - simplify sku_branch_inventory to a single pooled inventory model

CREATE TABLE IF NOT EXISTS public.product_metrics (
  product_id         TEXT PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  view_count         INTEGER       NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  add_to_cart_count  INTEGER       NOT NULL DEFAULT 0 CHECK (add_to_cart_count >= 0),
  order_count        INTEGER       NOT NULL DEFAULT 0 CHECK (order_count >= 0),
  rental_count       INTEGER       NOT NULL DEFAULT 0 CHECK (rental_count >= 0),
  wishlist_count     INTEGER       NOT NULL DEFAULT 0 CHECK (wishlist_count >= 0),
  avg_rating         NUMERIC(4,2)  NOT NULL DEFAULT 0 CHECK (avg_rating >= 0 AND avg_rating <= 5),
  review_count       INTEGER       NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  return_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (return_rate >= 0 AND return_rate <= 100),
  trending_score     NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_sold_at       TIMESTAMPTZ,
  last_rented_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_metrics IS 'Product-level counters and derived merchandising metrics separated from the core products row.';

INSERT INTO public.product_metrics (
  product_id,
  view_count,
  add_to_cart_count,
  order_count,
  rental_count,
  wishlist_count,
  avg_rating,
  review_count,
  return_rate,
  trending_score,
  last_sold_at,
  last_rented_at,
  created_at,
  updated_at
)
SELECT
  p.id,
  p.view_count,
  p.add_to_cart_count,
  p.order_count,
  p.rental_count,
  p.wishlist_count,
  p.avg_rating,
  p.review_count,
  p.return_rate,
  p.trending_score,
  p.last_sold_at,
  p.last_rented_at,
  p.created_at,
  p.updated_at
FROM public.products p
ON CONFLICT (product_id) DO UPDATE
SET view_count = EXCLUDED.view_count,
    add_to_cart_count = EXCLUDED.add_to_cart_count,
    order_count = EXCLUDED.order_count,
    rental_count = EXCLUDED.rental_count,
    wishlist_count = EXCLUDED.wishlist_count,
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    return_rate = EXCLUDED.return_rate,
    trending_score = EXCLUDED.trending_score,
    last_sold_at = EXCLUDED.last_sold_at,
    last_rented_at = EXCLUDED.last_rented_at,
    updated_at = EXCLUDED.updated_at;

DROP TRIGGER IF EXISTS set_product_metrics_updated_at ON public.product_metrics;
CREATE TRIGGER set_product_metrics_updated_at
  BEFORE UPDATE ON public.product_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_product_metrics_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.product_metrics (product_id)
  VALUES (NEW.id)
  ON CONFLICT (product_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_after_insert_ensure_metrics_row_trg ON public.products;
CREATE TRIGGER products_after_insert_ensure_metrics_row_trg
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.ensure_product_metrics_row();

ALTER TABLE public.product_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_metrics_select_public" ON public.product_metrics;
CREATE POLICY "product_metrics_select_public"
  ON public.product_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.products
      WHERE products.id = product_metrics.product_id
        AND products.is_hidden = FALSE
    )
  );

GRANT SELECT ON public.product_metrics TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.store_branches (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name_th     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(trim(id)) > 0),
  CHECK (char_length(trim(code)) > 0),
  CHECK (char_length(trim(name_th)) > 0),
  CHECK (char_length(trim(name_en)) > 0)
);

COMMENT ON TABLE public.store_branches IS 'Master branch/store rows reused by admin inventory linking and future storefront hub selection.';
COMMENT ON COLUMN public.store_branches.code IS 'Short display code for the branch.';

DROP TRIGGER IF EXISTS set_store_branches_updated_at ON public.store_branches;
CREATE TRIGGER set_store_branches_updated_at
  BEFORE UPDATE ON public.store_branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.store_branches (
  id,
  code,
  name_th,
  name_en,
  is_active,
  sort_order
)
VALUES
  ('store-001', 'BKK', 'สาขากรุงเทพฯ (บางนา)', 'Bangkok Branch (Bangna)', TRUE, 10),
  ('store-002', 'RYG', 'สาขาระยอง (มาบตาพุด)', 'Rayong Branch (Map Ta Phut)', TRUE, 20)
ON CONFLICT (id) DO UPDATE
SET code = EXCLUDED.code,
    name_th = EXCLUDED.name_th,
    name_en = EXCLUDED.name_en,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO public.store_branches (
  id,
  code,
  name_th,
  name_en,
  is_active,
  sort_order
)
SELECT DISTINCT
  sbi.branch_id,
  COALESCE(
    NULLIF(trim(COALESCE(sbi.branch_code, '')), ''),
    upper(left(regexp_replace(sbi.branch_id, '[^A-Za-z0-9]+', '', 'g'), 12))
  ) AS code,
  sbi.branch_name AS name_th,
  sbi.branch_name AS name_en,
  TRUE AS is_active,
  1000 AS sort_order
FROM public.sku_branch_inventory sbi
WHERE NULLIF(trim(COALESCE(sbi.branch_id, '')), '') IS NOT NULL
  AND NULLIF(trim(COALESCE(sbi.branch_name, '')), '') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS sku_branch_inventory_after_write_sync_summary_trg ON public.sku_branch_inventory;
DROP TRIGGER IF EXISTS sku_branch_inventory_before_sync_product_id_trg ON public.sku_branch_inventory;
DROP TRIGGER IF EXISTS set_sku_branch_inventory_updated_at ON public.sku_branch_inventory;
DROP TRIGGER IF EXISTS products_after_type_change_sync_inventory_summary_trg ON public.products;

DROP FUNCTION IF EXISTS public.products_after_type_change_sync_inventory_summary();
DROP FUNCTION IF EXISTS public.sku_branch_inventory_after_write_sync_summary();
DROP FUNCTION IF EXISTS public.sync_all_product_sku_inventory_summaries(TEXT);
DROP FUNCTION IF EXISTS public.sync_product_sku_inventory_summary(TEXT);
DROP FUNCTION IF EXISTS public.sku_branch_inventory_sync_product_id();

CREATE TABLE public.sku_branch_inventory_new (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku_id       TEXT NOT NULL REFERENCES public.product_skus(id) ON DELETE CASCADE,
  branch_id    TEXT NOT NULL REFERENCES public.store_branches(id) ON UPDATE CASCADE,
  branch_code  TEXT,
  branch_name  TEXT NOT NULL,
  on_hand      INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  available    INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
  reserved     INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  incoming     INTEGER NOT NULL DEFAULT 0 CHECK (incoming >= 0),
  safety_stock INTEGER NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(trim(branch_id)) > 0),
  CHECK (char_length(trim(branch_name)) > 0),
  CHECK (available <= on_hand),
  CHECK (reserved <= on_hand),
  CHECK (available + reserved <= on_hand),
  UNIQUE (sku_id, branch_id)
);

COMMENT ON TABLE public.sku_branch_inventory_new IS 'Source-of-truth per-branch pooled inventory rows for each SKU.';

INSERT INTO public.sku_branch_inventory_new (
  product_id,
  sku_id,
  branch_id,
  branch_code,
  branch_name,
  on_hand,
  available,
  reserved,
  incoming,
  safety_stock,
  notes,
  created_at,
  updated_at
)
SELECT
  MAX(sbi.product_id) AS product_id,
  sbi.sku_id,
  sbi.branch_id,
  MAX(NULLIF(trim(COALESCE(sbi.branch_code, '')), '')) AS branch_code,
  MAX(sbi.branch_name) AS branch_name,
  COALESCE(SUM(sbi.on_hand), 0)::INTEGER AS on_hand,
  COALESCE(SUM(sbi.available), 0)::INTEGER AS available,
  COALESCE(SUM(sbi.reserved), 0)::INTEGER AS reserved,
  COALESCE(SUM(sbi.incoming), 0)::INTEGER AS incoming,
  COALESCE(MAX(sbi.safety_stock), 0)::INTEGER AS safety_stock,
  string_agg(DISTINCT NULLIF(trim(COALESCE(sbi.notes, '')), ''), E'\n') AS notes,
  COALESCE(MIN(sbi.created_at), now()) AS created_at,
  COALESCE(MAX(sbi.updated_at), now()) AS updated_at
FROM public.sku_branch_inventory sbi
GROUP BY sbi.sku_id, sbi.branch_id;

DROP TABLE public.sku_branch_inventory;
ALTER TABLE public.sku_branch_inventory_new RENAME TO sku_branch_inventory;

CREATE INDEX idx_sku_branch_inventory_sku
  ON public.sku_branch_inventory (sku_id);

CREATE INDEX idx_sku_branch_inventory_product
  ON public.sku_branch_inventory (product_id, sku_id);

CREATE INDEX idx_sku_branch_inventory_branch
  ON public.sku_branch_inventory (branch_id);

CREATE OR REPLACE FUNCTION public.sku_branch_inventory_sync_product_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_product_id TEXT;
BEGIN
  SELECT product_id INTO resolved_product_id
  FROM public.product_skus
  WHERE id = NEW.sku_id;

  IF resolved_product_id IS NULL THEN
    RAISE EXCEPTION 'sku_id % does not exist', NEW.sku_id;
  END IF;

  NEW.product_id := resolved_product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sku_branch_inventory_before_sync_product_id_trg
  BEFORE INSERT OR UPDATE OF sku_id ON public.sku_branch_inventory
  FOR EACH ROW EXECUTE FUNCTION public.sku_branch_inventory_sync_product_id();

CREATE OR REPLACE FUNCTION public.sync_product_sku_inventory_summary(p_sku_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  available_total INTEGER := 0;
BEGIN
  SELECT COALESCE(SUM(available), 0)::INTEGER
  INTO available_total
  FROM public.sku_branch_inventory
  WHERE sku_id = p_sku_id;

  UPDATE public.product_skus
  SET stock = available_total,
      updated_at = now()
  WHERE id = p_sku_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_all_product_sku_inventory_summaries(p_product_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  sku_row RECORD;
BEGIN
  FOR sku_row IN
    SELECT id
    FROM public.product_skus
    WHERE product_id = p_product_id
  LOOP
    PERFORM public.sync_product_sku_inventory_summary(sku_row.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sku_branch_inventory_after_write_sync_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sync_product_sku_inventory_summary(COALESCE(NEW.sku_id, OLD.sku_id));

  IF TG_OP = 'UPDATE' AND OLD.sku_id IS DISTINCT FROM NEW.sku_id THEN
    PERFORM public.sync_product_sku_inventory_summary(OLD.sku_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER set_sku_branch_inventory_updated_at
  BEFORE UPDATE ON public.sku_branch_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER sku_branch_inventory_after_write_sync_summary_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.sku_branch_inventory
  FOR EACH ROW EXECUTE FUNCTION public.sku_branch_inventory_after_write_sync_summary();

SELECT public.sync_all_product_sku_inventory_summaries(id)
FROM public.products;

ALTER TABLE public.sku_branch_inventory ENABLE ROW LEVEL SECURITY;

DROP TYPE IF EXISTS public.sku_inventory_kind;

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

DROP FUNCTION IF EXISTS public.autocomplete_products(
  text,
  integer
);

ALTER TABLE public.products
  DROP COLUMN IF EXISTS rental_min_days,
  DROP COLUMN IF EXISTS rental_max_days,
  DROP COLUMN IF EXISTS rental_buffer_days,
  DROP COLUMN IF EXISTS store_location_ids,
  DROP COLUMN IF EXISTS view_count,
  DROP COLUMN IF EXISTS add_to_cart_count,
  DROP COLUMN IF EXISTS order_count,
  DROP COLUMN IF EXISTS rental_count,
  DROP COLUMN IF EXISTS wishlist_count,
  DROP COLUMN IF EXISTS avg_rating,
  DROP COLUMN IF EXISTS review_count,
  DROP COLUMN IF EXISTS return_rate,
  DROP COLUMN IF EXISTS trending_score,
  DROP COLUMN IF EXISTS last_sold_at,
  DROP COLUMN IF EXISTS last_rented_at;

ALTER TABLE public.product_skus
  DROP COLUMN IF EXISTS rental_deposit,
  DROP COLUMN IF EXISTS rental_daily,
  DROP COLUMN IF EXISTS rental_weekly,
  DROP COLUMN IF EXISTS rental_monthly,
  DROP COLUMN IF EXISTS rental_stock,
  DROP COLUMN IF EXISTS reserved_stock;

COMMENT ON COLUMN public.product_skus.stock IS 'Compatibility summary derived from pooled sku_branch_inventory available quantity.';

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

COMMENT ON FUNCTION public.search_products IS 'Full-text + facet search over public products. Returns ranked results with pricing/stock aggregates and product_metrics-backed ordering.';

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
    )::REAL AS similarity_score
  FROM public.products p
  LEFT JOIN public.product_metrics pm ON pm.product_id = p.id
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
    COALESCE(pm.order_count, 0) DESC,
    COALESCE(pm.trending_score, 0) DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.autocomplete_products IS 'Typeahead suggestions for product names using trigram similarity + prefix ILIKE. Ordered with product_metrics-backed popularity.';

GRANT EXECUTE ON FUNCTION public.search_products(text, text[], text, text[], numeric, numeric, boolean, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autocomplete_products(text, integer) TO anon, authenticated;