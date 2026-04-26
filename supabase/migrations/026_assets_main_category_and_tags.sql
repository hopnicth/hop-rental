-- 026: Add main_category_key + tag_keys to public.assets to mirror products
-- Keeps category_keys derived (main_category_key + tag_keys) via trigger.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS main_category_key TEXT,
  ADD COLUMN IF NOT EXISTS tag_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN public.assets.main_category_key IS 'Primary category selected from public.main_categories.';
COMMENT ON COLUMN public.assets.tag_keys IS 'Flexible secondary tags/facets used for filtering. Stored separately from primary category.';

CREATE OR REPLACE FUNCTION public.assets_sync_category_keys()
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

DROP TRIGGER IF EXISTS assets_before_sync_category_keys_trg ON public.assets;

CREATE TRIGGER assets_before_sync_category_keys_trg
  BEFORE INSERT OR UPDATE OF main_category_key, tag_keys, category_keys
  ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.assets_sync_category_keys();

UPDATE public.assets a
SET main_category_key = COALESCE(
      a.main_category_key,
      (
        SELECT mc.key
        FROM unnest(COALESCE(a.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
        JOIN public.main_categories mc ON mc.key = raw_key.key
        LIMIT 1
      ),
      'others'
    ),
    tag_keys = CASE
      WHEN cardinality(a.tag_keys) > 0 THEN a.tag_keys
      ELSE ARRAY(
        SELECT raw_key.key
        FROM unnest(COALESCE(a.category_keys, ARRAY[]::TEXT[])) AS raw_key(key)
        WHERE raw_key.key IS NOT NULL
          AND char_length(trim(raw_key.key)) > 0
          AND raw_key.key <> COALESCE(
            (
              SELECT mc.key
              FROM unnest(COALESCE(a.category_keys, ARRAY[]::TEXT[])) AS raw_match(key)
              JOIN public.main_categories mc ON mc.key = raw_match.key
              LIMIT 1
            ),
            'others'
          )
      )
    END;

UPDATE public.assets
SET main_category_key = 'others'
WHERE main_category_key IS NULL OR char_length(trim(main_category_key)) = 0;

ALTER TABLE public.assets
  ALTER COLUMN main_category_key SET DEFAULT 'others',
  ALTER COLUMN main_category_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assets_main_category_key_fkey'
      AND conrelid = 'public.assets'::regclass
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_main_category_key_fkey
      FOREIGN KEY (main_category_key)
      REFERENCES public.main_categories(key)
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_main_category_key
  ON public.assets (main_category_key);

CREATE INDEX IF NOT EXISTS idx_assets_tag_keys
  ON public.assets USING GIN (tag_keys);
