-- SKU commercial fields + branch inventory source-of-truth bridge

CREATE TYPE public.sku_inventory_kind AS ENUM ('sale', 'rental', 'shared');

ALTER TABLE public.product_skus
  ADD COLUMN sku_code TEXT,
  ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  ADD COLUMN promo_start_at TIMESTAMPTZ,
  ADD COLUMN promo_end_at TIMESTAMPTZ,
  ADD COLUMN pricing_tiers JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD CONSTRAINT product_skus_pricing_tiers_array_chk CHECK (jsonb_typeof(pricing_tiers) = 'array'),
  ADD CONSTRAINT product_skus_promo_window_chk CHECK (
    promo_end_at IS NULL OR promo_start_at IS NULL OR promo_end_at >= promo_start_at
  );

UPDATE public.product_skus
SET sku_code = COALESCE(
  NULLIF(trim(sku_code), ''),
  upper(replace(id, 'sku_', 'SKU-'))
)
WHERE sku_code IS NULL OR char_length(trim(sku_code)) = 0;

ALTER TABLE public.product_skus
  ALTER COLUMN sku_code SET NOT NULL;

CREATE UNIQUE INDEX idx_product_skus_sku_code_unique
  ON public.product_skus (lower(sku_code));

COMMENT ON COLUMN public.product_skus.sku_code IS 'Human-facing editable SKU code. Internal row identity remains product_skus.id.';
COMMENT ON COLUMN public.product_skus.currency_code IS 'Primary commercial currency for SKU pricing.';
COMMENT ON COLUMN public.product_skus.promo_start_at IS 'Optional promotion window start for SKU-level offers.';
COMMENT ON COLUMN public.product_skus.promo_end_at IS 'Optional promotion window end for SKU-level offers.';
COMMENT ON COLUMN public.product_skus.pricing_tiers IS 'Optional tiered pricing rules stored as JSONB array.';
COMMENT ON COLUMN public.product_skus.stock IS 'Compatibility summary for sale stock derived from sku_branch_inventory.';
COMMENT ON COLUMN public.product_skus.rental_stock IS 'Compatibility summary for rental availability derived from sku_branch_inventory.';
COMMENT ON COLUMN public.product_skus.reserved_stock IS 'Compatibility summary for reserved rental units derived from sku_branch_inventory.';

CREATE TABLE public.sku_branch_inventory (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku_id         TEXT NOT NULL REFERENCES public.product_skus(id) ON DELETE CASCADE,
  inventory_kind public.sku_inventory_kind NOT NULL DEFAULT 'shared',
  branch_id      TEXT NOT NULL,
  branch_code    TEXT,
  branch_name    TEXT NOT NULL,
  on_hand        INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  available      INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
  reserved       INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  incoming       INTEGER NOT NULL DEFAULT 0 CHECK (incoming >= 0),
  safety_stock   INTEGER NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (char_length(trim(branch_id)) > 0),
  CHECK (char_length(trim(branch_name)) > 0),
  CHECK (available <= on_hand),
  CHECK (reserved <= on_hand),
  CHECK (available + reserved <= on_hand),
  UNIQUE (sku_id, inventory_kind, branch_id)
);

COMMENT ON TABLE public.sku_branch_inventory IS 'Source-of-truth per-branch inventory rows for each SKU. Supports separate sale, rental, or shared pools.';
COMMENT ON COLUMN public.sku_branch_inventory.inventory_kind IS 'sale = sale-only pool, rental = rental-only pool, shared = shared pool contributing to both summaries.';
COMMENT ON COLUMN public.sku_branch_inventory.branch_id IS 'Store/hub/branch identifier used by admin and operations.';
COMMENT ON COLUMN public.sku_branch_inventory.branch_code IS 'Optional short display code for the branch.';
COMMENT ON COLUMN public.sku_branch_inventory.branch_name IS 'Display name snapshot for the branch at the time the row was edited.';

CREATE INDEX idx_sku_branch_inventory_sku
  ON public.sku_branch_inventory (sku_id, inventory_kind);

CREATE INDEX idx_sku_branch_inventory_product
  ON public.sku_branch_inventory (product_id, sku_id);

CREATE INDEX idx_sku_branch_inventory_branch
  ON public.sku_branch_inventory (branch_id, inventory_kind);

CREATE TRIGGER set_sku_branch_inventory_updated_at
  BEFORE UPDATE ON public.sku_branch_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

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
  sale_available_total INTEGER := 0;
  rental_available_total INTEGER := 0;
  rental_reserved_total INTEGER := 0;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN inventory_kind IN ('sale', 'shared') THEN available ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN inventory_kind IN ('rental', 'shared') THEN available ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN inventory_kind IN ('rental', 'shared') THEN reserved ELSE 0 END), 0)::INTEGER
  INTO sale_available_total, rental_available_total, rental_reserved_total
  FROM public.sku_branch_inventory
  WHERE sku_id = p_sku_id;

  UPDATE public.product_skus
  SET stock = sale_available_total,
      rental_stock = rental_available_total,
      reserved_stock = rental_reserved_total,
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

CREATE TRIGGER sku_branch_inventory_after_write_sync_summary_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.sku_branch_inventory
  FOR EACH ROW EXECUTE FUNCTION public.sku_branch_inventory_after_write_sync_summary();

CREATE OR REPLACE FUNCTION public.products_after_type_change_sync_inventory_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.type IS DISTINCT FROM NEW.type THEN
    PERFORM public.sync_all_product_sku_inventory_summaries(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER products_after_type_change_sync_inventory_summary_trg
  AFTER UPDATE OF type ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_after_type_change_sync_inventory_summary();

INSERT INTO public.sku_branch_inventory (
  product_id,
  sku_id,
  inventory_kind,
  branch_id,
  branch_code,
  branch_name,
  on_hand,
  available,
  reserved,
  incoming,
  safety_stock,
  notes
)
SELECT
  sku.product_id,
  sku.id,
  migrated.inventory_kind,
  migrated.branch_id,
  migrated.branch_code,
  migrated.branch_name,
  migrated.on_hand,
  migrated.available,
  migrated.reserved,
  0,
  0,
  'Auto-migrated from legacy SKU stock columns'
FROM public.product_skus sku
JOIN public.products p ON p.id = sku.product_id
JOIN LATERAL (
  SELECT
    migration_row.inventory_kind,
    COALESCE(NULLIF(trim(COALESCE(p.store_location_ids[1], '')), ''), 'legacy-default') AS branch_id,
    CASE
      WHEN NULLIF(trim(COALESCE(p.store_location_ids[1], '')), '') IS NULL THEN 'LEGACY'
      ELSE upper(left(regexp_replace(p.store_location_ids[1], '[^A-Za-z0-9]+', '', 'g'), 12))
    END AS branch_code,
    CASE
      WHEN NULLIF(trim(COALESCE(p.store_location_ids[1], '')), '') IS NULL THEN 'Legacy migrated inventory'
      ELSE p.store_location_ids[1]
    END AS branch_name,
    migration_row.on_hand,
    migration_row.available,
    migration_row.reserved
  FROM (
    VALUES
      ('sale'::public.sku_inventory_kind, sku.stock, sku.stock, 0),
      ('rental'::public.sku_inventory_kind, sku.rental_stock + sku.reserved_stock, sku.rental_stock, sku.reserved_stock)
  ) AS migration_row(inventory_kind, on_hand, available, reserved)
  WHERE migration_row.on_hand > 0 OR migration_row.available > 0 OR migration_row.reserved > 0
) AS migrated ON TRUE
ON CONFLICT (sku_id, inventory_kind, branch_id) DO NOTHING;

SELECT public.sync_all_product_sku_inventory_summaries(id)
FROM public.products;

ALTER TABLE public.sku_branch_inventory ENABLE ROW LEVEL SECURITY;