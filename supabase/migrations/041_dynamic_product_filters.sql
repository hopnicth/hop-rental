-- Migration 041: Dynamic product filter groups (super-admin managed)
--
-- Pattern C (Hybrid): relational source of truth + denormalized array on
-- products for fast GIN-indexed querying. The denormalized column lives in
-- products.filter_keys (separate from tag_keys) to avoid polluting
-- category_keys via the existing products_sync_category_keys trigger.
--
-- Tables added:
--   * filter_groups          — bound to a main_category, defines a single facet
--   * filter_options         — selectable values inside checkbox/dropdown groups
--   * product_filter_options — many-to-many: product ↔ option
--
-- Triggers:
--   * filter_groups.key / filter_options.key are immutable after creation
--   * product_filter_options inserts/deletes recompute products.filter_keys
--     using the convention "<group_key>__<option_key>".

CREATE TABLE public.filter_groups (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  main_category_key TEXT        NOT NULL REFERENCES public.main_categories(key)
                                  ON UPDATE CASCADE ON DELETE CASCADE,
  key               TEXT        NOT NULL,
  label_th          TEXT        NOT NULL,
  label_en          TEXT        NOT NULL,
  filter_type       TEXT        NOT NULL
                                  CHECK (filter_type IN ('checkbox','dropdown','number_range')),
  match_logic       TEXT        NOT NULL DEFAULT 'or'
                                  CHECK (match_logic IN ('or','and')),
  spec_key          TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT filter_groups_key_chk          CHECK (char_length(trim(key)) > 0),
  CONSTRAINT filter_groups_main_key_unique  UNIQUE (main_category_key, key),
  CONSTRAINT filter_groups_spec_key_required CHECK (
    (filter_type = 'number_range' AND spec_key IS NOT NULL AND char_length(trim(spec_key)) > 0)
    OR filter_type IN ('checkbox','dropdown')
  )
);

COMMENT ON TABLE public.filter_groups IS
  'Super-admin managed dynamic filter groups bound to a main_category. Used by /product-all SearchFilters.';
COMMENT ON COLUMN public.filter_groups.spec_key IS
  'For filter_type=number_range only — the products.spec key whose numeric value is range-filtered.';

CREATE TABLE public.filter_options (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID        NOT NULL REFERENCES public.filter_groups(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL,
  label_th    TEXT        NOT NULL,
  label_en    TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT filter_options_key_chk         CHECK (char_length(trim(key)) > 0),
  CONSTRAINT filter_options_group_key_unique UNIQUE (group_id, key)
);

CREATE TABLE public.product_filter_options (
  product_id       TEXT        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  filter_option_id UUID        NOT NULL REFERENCES public.filter_options(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, filter_option_id)
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS filter_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN public.products.filter_keys IS
  'Denormalized "<group_key>__<option_key>" tokens synced from product_filter_options. Maintained by trigger — do not edit directly.';

CREATE INDEX IF NOT EXISTS idx_filter_groups_main_active_sort
  ON public.filter_groups (main_category_key, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_filter_options_group_active_sort
  ON public.filter_options (group_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_product_filter_options_option
  ON public.product_filter_options (filter_option_id);

CREATE INDEX IF NOT EXISTS idx_products_filter_keys
  ON public.products USING GIN (filter_keys);

CREATE TRIGGER set_filter_groups_updated_at
  BEFORE UPDATE ON public.filter_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_filter_options_updated_at
  BEFORE UPDATE ON public.filter_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.filter_groups_prevent_key_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.key IS DISTINCT FROM NEW.key THEN
    RAISE EXCEPTION 'filter_groups.key is immutable after creation (was: %, attempted: %)', OLD.key, NEW.key;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER filter_groups_lock_key
  BEFORE UPDATE OF key ON public.filter_groups
  FOR EACH ROW EXECUTE FUNCTION public.filter_groups_prevent_key_update();

CREATE OR REPLACE FUNCTION public.filter_options_prevent_key_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.key IS DISTINCT FROM NEW.key THEN
    RAISE EXCEPTION 'filter_options.key is immutable after creation (was: %, attempted: %)', OLD.key, NEW.key;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER filter_options_lock_key
  BEFORE UPDATE OF key ON public.filter_options
  FOR EACH ROW EXECUTE FUNCTION public.filter_options_prevent_key_update();

CREATE OR REPLACE FUNCTION public.products_sync_filter_keys(p_product_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.products
  SET filter_keys = COALESCE(
    (
      SELECT array_agg(DISTINCT fg.key || '__' || fo.key)
      FROM public.product_filter_options pfo
      JOIN public.filter_options fo ON fo.id = pfo.filter_option_id
      JOIN public.filter_groups  fg ON fg.id = fo.group_id
      WHERE pfo.product_id = p_product_id
    ),
    ARRAY[]::TEXT[]
  )
  WHERE id = p_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.product_filter_options_sync_trg()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.products_sync_filter_keys(NEW.product_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.products_sync_filter_keys(OLD.product_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER product_filter_options_after_change
  AFTER INSERT OR DELETE ON public.product_filter_options
  FOR EACH ROW EXECUTE FUNCTION public.product_filter_options_sync_trg();

-- Drop all filter assignments when a product's main_category_key changes —
-- options bound to the previous category are no longer applicable.
CREATE OR REPLACE FUNCTION public.products_clear_filter_options_on_category_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.main_category_key IS DISTINCT FROM NEW.main_category_key THEN
    DELETE FROM public.product_filter_options
     WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_clear_filter_options_on_category_change
  AFTER UPDATE OF main_category_key ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_clear_filter_options_on_category_change();

ALTER TABLE public.filter_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filter_options         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_filter_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "filter_groups_select_public_active"
  ON public.filter_groups FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "filter_options_select_public_active"
  ON public.filter_options FOR SELECT
  USING (
    is_active = TRUE
    AND EXISTS (
      SELECT 1 FROM public.filter_groups fg
      WHERE fg.id = filter_options.group_id AND fg.is_active = TRUE
    )
  );

CREATE POLICY "product_filter_options_select_public"
  ON public.product_filter_options FOR SELECT
  USING (TRUE);

GRANT SELECT ON public.filter_groups          TO anon, authenticated;
GRANT SELECT ON public.filter_options         TO anon, authenticated;
GRANT SELECT ON public.product_filter_options TO anon, authenticated;
