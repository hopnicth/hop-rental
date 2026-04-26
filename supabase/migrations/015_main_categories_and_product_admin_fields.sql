-- Main categories + richer product admin metadata

CREATE TABLE public.main_categories (
  key            TEXT PRIMARY KEY,
  label_th       TEXT        NOT NULL,
  label_en       TEXT        NOT NULL,
  icon           TEXT,
  description_th TEXT,
  description_en TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (char_length(key) > 0),
  CHECK (char_length(label_th) > 0),
  CHECK (char_length(label_en) > 0)
);

COMMENT ON TABLE public.main_categories IS 'Super-admin managed primary product categories used by admin create/edit flows.';
COMMENT ON COLUMN public.main_categories.key IS 'Stable category key used for product.main_category_key and search/filter facets.';

INSERT INTO public.main_categories (
  key,
  label_th,
  label_en,
  icon,
  sort_order
)
VALUES
  ('safety_equipment', 'อุปกรณ์ความปลอดภัย', 'Safety Equipment', 'bx:shield-quarter', 10),
  ('mechanic_tools', 'เครื่องมือช่าง', 'Mechanic Tools', 'bx:wrench', 20),
  ('measuring_tools', 'เครื่องมือวัด', 'Measuring Tools', 'bx:ruler', 30),
  ('ppe_general', 'PPE ทั่วไป', 'General PPE', 'bx:hard-hat', 40),
  ('construction_consumables', 'วัสดุสิ้นเปลืองงานก่อสร้าง', 'Construction Consumables', 'bx:building-house', 50),
  ('screws_bolts', 'สกรูและโบลต์', 'Screws & Bolts', 'bx:cog', 60),
  ('others', 'อื่น ๆ', 'Others', 'bx:dots-horizontal-rounded', 999)
ON CONFLICT (key) DO NOTHING;

CREATE TRIGGER set_main_categories_updated_at
  BEFORE UPDATE ON public.main_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.products
  ADD COLUMN main_category_key TEXT,
  ADD COLUMN tag_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN search_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN detail_blocks JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.products.main_category_key IS 'Primary category selected from public.main_categories.';
COMMENT ON COLUMN public.products.tag_keys IS 'Flexible secondary tags/facets used for future filtering. Stored separately from primary category.';
COMMENT ON COLUMN public.products.search_keywords IS 'Extra search phrases/aliases curated by admin to improve recall.';
COMMENT ON COLUMN public.products.detail_blocks IS 'Structured marketing/detail content blocks stored as JSONB for flexible admin authoring.';

CREATE OR REPLACE FUNCTION public.products_sync_category_keys()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.main_category_key IS NULL OR char_length(trim(NEW.main_category_key)) = 0 THEN
    SELECT mc.key
    INTO NEW.main_category_key
    FROM unnest(COALESCE(NEW.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
    JOIN public.main_categories mc ON mc.key = raw_key.key
    LIMIT 1;
  END IF;

  IF NEW.main_category_key IS NULL OR char_length(trim(NEW.main_category_key)) = 0 THEN
    NEW.main_category_key := 'others';
  END IF;

  NEW.tag_keys := COALESCE(NEW.tag_keys, ARRAY[]::TEXT[]);

  IF cardinality(NEW.tag_keys) = 0 AND cardinality(COALESCE(NEW.category_keys, ARRAY[]::TEXT[])) > 0 THEN
    NEW.tag_keys := ARRAY(
      SELECT raw_key.key
      FROM unnest(COALESCE(NEW.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
      WHERE raw_key.key IS NOT NULL
        AND char_length(trim(raw_key.key)) > 0
        AND raw_key.key <> NEW.main_category_key
    );
  END IF;

  NEW.category_keys := ARRAY(
    SELECT DISTINCT raw_key.key
    FROM unnest(array_prepend(NEW.main_category_key, NEW.tag_keys)) AS raw_key(key)
    WHERE raw_key.key IS NOT NULL
      AND char_length(trim(raw_key.key)) > 0
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_before_sync_category_keys_trg ON public.products;

CREATE TRIGGER products_before_sync_category_keys_trg
  BEFORE INSERT OR UPDATE OF main_category_key, tag_keys, category_keys
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_sync_category_keys();

UPDATE public.products p
SET main_category_key = COALESCE(
      p.main_category_key,
      (
        SELECT mc.key
        FROM unnest(COALESCE(p.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
        JOIN public.main_categories mc ON mc.key = raw_key.key
        LIMIT 1
      ),
      'others'
    ),
    tag_keys = CASE
      WHEN cardinality(p.tag_keys) > 0 THEN p.tag_keys
      ELSE ARRAY(
        SELECT raw_key.key
        FROM unnest(COALESCE(p.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
        WHERE raw_key.key IS NOT NULL
          AND char_length(trim(raw_key.key)) > 0
          AND raw_key.key <> COALESCE(
            (
              SELECT mc.key
              FROM unnest(COALESCE(p.category_keys, ARRAY[]::TEXT[])) AS raw_match(key)
              JOIN public.main_categories mc ON mc.key = raw_match.key
              LIMIT 1
            ),
            'others'
          )
      )
    END;

UPDATE public.products
SET main_category_key = 'others'
WHERE main_category_key IS NULL OR char_length(trim(main_category_key)) = 0;

ALTER TABLE public.products
  ALTER COLUMN main_category_key SET DEFAULT 'others',
  ALTER COLUMN main_category_key SET NOT NULL;

ALTER TABLE public.products
  ADD CONSTRAINT products_main_category_key_fkey
  FOREIGN KEY (main_category_key)
  REFERENCES public.main_categories(key)
  ON UPDATE CASCADE;

CREATE INDEX idx_main_categories_active_sort
  ON public.main_categories (is_active, sort_order, label_th);

CREATE INDEX idx_products_main_category_key
  ON public.products (main_category_key);

CREATE INDEX idx_products_tag_keys
  ON public.products USING GIN (tag_keys);

CREATE INDEX idx_products_search_keywords
  ON public.products USING GIN (search_keywords);

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
      coalesce(NEW.main_category_key, '') || ' ' ||
      coalesce(array_to_string(NEW.tag_keys, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.category_keys, ' '), '')
    ), 'B') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.description_th, '') || ' ' ||
      coalesce(NEW.description_en, '') || ' ' ||
      coalesce(NEW.description_cn, '') || ' ' ||
      coalesce(NEW.description_jp, '') || ' ' ||
      coalesce(NEW.detail_blocks::text, '')
    ), 'C') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.spec::text, '') || ' ' ||
      coalesce(array_to_string(NEW.search_keywords, ' '), '')
    ), 'D');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_search_vector_trg ON public.products;

CREATE TRIGGER products_search_vector_trg
  BEFORE INSERT OR UPDATE OF
    name_th, name_en, name_cn, name_jp,
    brand, main_category_key, tag_keys, category_keys,
    description_th, description_en, description_cn, description_jp,
    spec, detail_blocks, search_keywords
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_search_vector_update();

UPDATE public.products SET name_th = name_th;

ALTER TABLE public.main_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "main_categories_select_public_active"
  ON public.main_categories FOR SELECT
  USING (is_active = TRUE);

GRANT SELECT ON public.main_categories TO anon, authenticated;
