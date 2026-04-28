-- 043_auto_sync_filter_options_from_tags.sql
--
-- Two changes in one migration:
--
-- (A) Assets parity for Pattern C: add asset_filter_options junction +
--     assets.filter_keys denormalized GIN-indexed array, mirroring what
--     products already have from migration 041.
--
-- (B) Auto-sync convention: a product/asset is automatically linked to a
--     filter_option whenever the option's key appears in the row's tag_keys
--     (case-sensitive exact match) AND the option belongs to a filter_group
--     bound to the row's main_category_key. Only checkbox/dropdown groups
--     participate — number_range groups have no options.
--
-- Triggers cascade so renames / new options / new tags resync automatically.
-- The migration ends with a one-shot backfill for every existing row.

-- ────────────────────────────────────────────────────────────
-- (A) ASSETS — junction table + filter_keys column
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS filter_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN public.assets.filter_keys IS
  'Denormalized "<group_key>__<option_key>" tokens synced from asset_filter_options. Maintained by trigger — do not edit directly.';

CREATE TABLE IF NOT EXISTS public.asset_filter_options (
  asset_id         UUID        NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  filter_option_id UUID        NOT NULL REFERENCES public.filter_options(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, filter_option_id)
);

COMMENT ON TABLE public.asset_filter_options IS
  'Many-to-many assignment of assets to filter_options. Auto-maintained by triggers from assets.tag_keys.';

CREATE INDEX IF NOT EXISTS idx_asset_filter_options_option
  ON public.asset_filter_options (filter_option_id);

CREATE INDEX IF NOT EXISTS idx_assets_filter_keys
  ON public.assets USING GIN (filter_keys);

CREATE OR REPLACE FUNCTION public.assets_sync_filter_keys(p_asset_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.assets
  SET filter_keys = COALESCE(
    (
      SELECT array_agg(DISTINCT fg.key || '__' || fo.key)
      FROM public.asset_filter_options afo
      JOIN public.filter_options fo ON fo.id = afo.filter_option_id
      JOIN public.filter_groups  fg ON fg.id = fo.group_id
      WHERE afo.asset_id = p_asset_id
    ),
    ARRAY[]::TEXT[]
  )
  WHERE id = p_asset_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.asset_filter_options_sync_trg()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assets_sync_filter_keys(NEW.asset_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.assets_sync_filter_keys(OLD.asset_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS asset_filter_options_after_change ON public.asset_filter_options;
CREATE TRIGGER asset_filter_options_after_change
  AFTER INSERT OR DELETE ON public.asset_filter_options
  FOR EACH ROW EXECUTE FUNCTION public.asset_filter_options_sync_trg();

-- Drop all filter assignments when an asset's main_category_key changes —
-- options bound to the previous category are no longer applicable.
CREATE OR REPLACE FUNCTION public.assets_clear_filter_options_on_category_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.main_category_key IS DISTINCT FROM NEW.main_category_key THEN
    DELETE FROM public.asset_filter_options
     WHERE asset_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_clear_filter_options_on_category_change ON public.assets;
CREATE TRIGGER assets_clear_filter_options_on_category_change
  AFTER UPDATE OF main_category_key ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.assets_clear_filter_options_on_category_change();

-- ────────────────────────────────────────────────────────────
-- RLS for asset_filter_options (mirror product_filter_options)
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.asset_filter_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_filter_options_select_public" ON public.asset_filter_options;
CREATE POLICY "asset_filter_options_select_public"
  ON public.asset_filter_options FOR SELECT
  USING (TRUE);

GRANT SELECT ON public.asset_filter_options TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- (B) AUTO-SYNC FROM tag_keys
-- ────────────────────────────────────────────────────────────
-- Convention: a row is linked to filter_option fo iff
--   fo.key = ANY(row.tag_keys)
--   AND fo.is_active
--   AND fo.group.is_active
--   AND fo.group.filter_type IN ('checkbox','dropdown')
--   AND fo.group.main_category_key = row.main_category_key
-- Match is case-sensitive exact (= operator on text).

CREATE OR REPLACE FUNCTION public.products_resync_filter_options_from_tags(p_product_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  r_main_category TEXT;
  r_tag_keys      TEXT[];
BEGIN
  SELECT main_category_key, COALESCE(tag_keys, ARRAY[]::TEXT[])
    INTO r_main_category, r_tag_keys
    FROM public.products
   WHERE id = p_product_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.product_filter_options pfo
   WHERE pfo.product_id = p_product_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.filter_options fo
         JOIN public.filter_groups  fg ON fg.id = fo.group_id
        WHERE fo.id = pfo.filter_option_id
          AND fg.main_category_key = r_main_category
          AND fg.is_active = TRUE
          AND fg.filter_type IN ('checkbox','dropdown')
          AND fo.is_active = TRUE
          AND fo.key = ANY(r_tag_keys)
     );

  INSERT INTO public.product_filter_options (product_id, filter_option_id)
  SELECT p_product_id, fo.id
    FROM public.filter_options fo
    JOIN public.filter_groups  fg ON fg.id = fo.group_id
   WHERE fg.main_category_key = r_main_category
     AND fg.is_active = TRUE
     AND fg.filter_type IN ('checkbox','dropdown')
     AND fo.is_active = TRUE
     AND fo.key = ANY(r_tag_keys)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.assets_resync_filter_options_from_tags(p_asset_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  r_main_category TEXT;
  r_tag_keys      TEXT[];
BEGIN
  SELECT main_category_key, COALESCE(tag_keys, ARRAY[]::TEXT[])
    INTO r_main_category, r_tag_keys
    FROM public.assets
   WHERE id = p_asset_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.asset_filter_options afo
   WHERE afo.asset_id = p_asset_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.filter_options fo
         JOIN public.filter_groups  fg ON fg.id = fo.group_id
        WHERE fo.id = afo.filter_option_id
          AND fg.main_category_key = r_main_category
          AND fg.is_active = TRUE
          AND fg.filter_type IN ('checkbox','dropdown')
          AND fo.is_active = TRUE
          AND fo.key = ANY(r_tag_keys)
     );

  INSERT INTO public.asset_filter_options (asset_id, filter_option_id)
  SELECT p_asset_id, fo.id
    FROM public.filter_options fo
    JOIN public.filter_groups  fg ON fg.id = fo.group_id
   WHERE fg.main_category_key = r_main_category
     AND fg.is_active = TRUE
     AND fg.filter_type IN ('checkbox','dropdown')
     AND fo.is_active = TRUE
     AND fo.key = ANY(r_tag_keys)
  ON CONFLICT DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.products_resync_filter_options_from_tags(TEXT) IS
  'Recomputes product_filter_options for one product from products.tag_keys (case-sensitive match against filter_options.key).';
COMMENT ON FUNCTION public.assets_resync_filter_options_from_tags(UUID) IS
  'Recomputes asset_filter_options for one asset from assets.tag_keys (case-sensitive match against filter_options.key).';

-- Row-level triggers on products / assets fire AFTER tag_keys or main_category_key change.
CREATE OR REPLACE FUNCTION public.products_resync_filter_options_trg()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.products_resync_filter_options_from_tags(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS products_resync_filter_options_from_tags_trg ON public.products;
CREATE TRIGGER products_resync_filter_options_from_tags_trg
  AFTER INSERT OR UPDATE OF tag_keys, main_category_key ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_resync_filter_options_trg();

CREATE OR REPLACE FUNCTION public.assets_resync_filter_options_trg()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.assets_resync_filter_options_from_tags(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS assets_resync_filter_options_from_tags_trg ON public.assets;
CREATE TRIGGER assets_resync_filter_options_from_tags_trg
  AFTER INSERT OR UPDATE OF tag_keys, main_category_key ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.assets_resync_filter_options_trg();


-- ────────────────────────────────────────────────────────────
-- (C) CASCADE: re-evaluate every product/asset in a category when
--     filter_options change (insert, key rename, is_active flip) or
--     when a filter_group's main_category_key / is_active changes.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.filter_resync_main_category(p_main_category TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  IF p_main_category IS NULL THEN
    RETURN;
  END IF;

  FOR r IN SELECT id FROM public.products WHERE main_category_key = p_main_category LOOP
    PERFORM public.products_resync_filter_options_from_tags(r.id);
  END LOOP;

  FOR r IN SELECT id FROM public.assets WHERE main_category_key = p_main_category LOOP
    PERFORM public.assets_resync_filter_options_from_tags(r.id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.filter_resync_main_category(TEXT) IS
  'Re-runs the tag-based auto-sync for every product and asset under the given main_category_key.';

-- filter_options: any change that affects matching → resync the group's main_category.
CREATE OR REPLACE FUNCTION public.filter_options_cascade_resync_trg()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_main_category_old TEXT;
  v_main_category_new TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT main_category_key INTO v_main_category_new
      FROM public.filter_groups WHERE id = NEW.group_id;
    PERFORM public.filter_resync_main_category(v_main_category_new);
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT main_category_key INTO v_main_category_new
      FROM public.filter_groups WHERE id = NEW.group_id;
    IF OLD.group_id IS DISTINCT FROM NEW.group_id THEN
      SELECT main_category_key INTO v_main_category_old
        FROM public.filter_groups WHERE id = OLD.group_id;
      PERFORM public.filter_resync_main_category(v_main_category_old);
    END IF;
    PERFORM public.filter_resync_main_category(v_main_category_new);
  ELSIF TG_OP = 'DELETE' THEN
    -- ON DELETE CASCADE on the junction handles removals; nothing to do.
    NULL;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS filter_options_cascade_resync ON public.filter_options;
CREATE TRIGGER filter_options_cascade_resync
  AFTER INSERT OR UPDATE OF key, is_active, group_id ON public.filter_options
  FOR EACH ROW EXECUTE FUNCTION public.filter_options_cascade_resync_trg();

-- filter_groups: changes to main_category_key / is_active / filter_type / key require resync.
CREATE OR REPLACE FUNCTION public.filter_groups_cascade_resync_trg()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.filter_resync_main_category(NEW.main_category_key);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.main_category_key IS DISTINCT FROM NEW.main_category_key THEN
      PERFORM public.filter_resync_main_category(OLD.main_category_key);
    END IF;
    PERFORM public.filter_resync_main_category(NEW.main_category_key);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS filter_groups_cascade_resync ON public.filter_groups;
CREATE TRIGGER filter_groups_cascade_resync
  AFTER INSERT OR UPDATE OF main_category_key, is_active, filter_type, key
  ON public.filter_groups
  FOR EACH ROW EXECUTE FUNCTION public.filter_groups_cascade_resync_trg();

-- ────────────────────────────────────────────────────────────
-- (D) BACKFILL — populate junctions + filter_keys for every existing row.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.products LOOP
    PERFORM public.products_resync_filter_options_from_tags(r.id);
  END LOOP;

  FOR r IN SELECT id FROM public.assets LOOP
    PERFORM public.assets_resync_filter_options_from_tags(r.id);
  END LOOP;

  -- Ensure denormalized filter_keys are in sync after the backfill, even for
  -- rows that didn't end up with any junction changes.
  FOR r IN SELECT id FROM public.products LOOP
    PERFORM public.products_sync_filter_keys(r.id);
  END LOOP;

  FOR r IN SELECT id FROM public.assets LOOP
    PERFORM public.assets_sync_filter_keys(r.id);
  END LOOP;
END $$;
