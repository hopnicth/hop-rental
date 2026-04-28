-- 046_main_category_entity_types.sql
-- Allow one main category catalog to serve multiple content/entity types.

ALTER TABLE public.main_categories
  ADD COLUMN IF NOT EXISTS entity_types TEXT[] NOT NULL DEFAULT ARRAY['product']::TEXT[];

COMMENT ON COLUMN public.main_categories.entity_types IS
  'Entity/content types that can use this main category: product, asset, service, promotion, blog, review.';

UPDATE public.main_categories
SET entity_types = ARRAY['product', 'asset']::TEXT[]
WHERE entity_types = ARRAY['product']::TEXT[];

UPDATE public.main_categories
SET entity_types = ARRAY['product', 'asset', 'service', 'promotion', 'blog', 'review']::TEXT[]
WHERE key = 'others';

ALTER TABLE public.main_categories
  DROP CONSTRAINT IF EXISTS main_categories_entity_types_chk;

ALTER TABLE public.main_categories
  ADD CONSTRAINT main_categories_entity_types_chk
  CHECK (
    cardinality(entity_types) > 0
    AND entity_types <@ ARRAY['product', 'asset', 'service', 'promotion', 'blog', 'review']::TEXT[]
  );

CREATE INDEX IF NOT EXISTS idx_main_categories_entity_types
  ON public.main_categories USING GIN (entity_types);

INSERT INTO public.main_categories (key, label_th, label_en, icon, entity_types, sort_order)
VALUES
  ('services', 'บริการ', 'Services', 'bx:support', ARRAY['service']::TEXT[], 10),
  ('promotions', 'โปรโมชัน', 'Promotions', 'bx:purchase-tag', ARRAY['promotion']::TEXT[], 10),
  ('blogs', 'บทความ', 'Blogs', 'bx:news', ARRAY['blog']::TEXT[], 10),
  ('reviews', 'รีวิว', 'Reviews', 'bx:star', ARRAY['review']::TEXT[], 10)
ON CONFLICT (key) DO UPDATE
SET entity_types = ARRAY(
      SELECT DISTINCT value
      FROM unnest(public.main_categories.entity_types || EXCLUDED.entity_types) AS value
    ),
    updated_at = timezone('utc', now());