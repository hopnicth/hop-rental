-- 024: asset_branch_inventory
--
-- Per-inventory stock pool owned directly by an asset row.
-- This is INTENTIONALLY NOT tied to product_skus / sku_branch_inventory:
--   * Assets are abstract bookable resources, not catalog SKUs.
--   * Stock lives against a specific inventories row (which belongs to a branch).
--   * One asset can have many inventory rows (per-branch fan-out), but
--     never more than one row per (asset, inventory) pair.

CREATE TABLE public.asset_branch_inventory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id  UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  inventory_id      UUID NOT NULL REFERENCES public.inventories(id)    ON UPDATE CASCADE ON DELETE RESTRICT,
  branch_id         TEXT NOT NULL,
  branch_code       TEXT,
  branch_name       TEXT NOT NULL,
  on_hand           INTEGER NOT NULL DEFAULT 0 CHECK (on_hand     >= 0),
  available         INTEGER NOT NULL DEFAULT 0 CHECK (available   >= 0),
  reserved          INTEGER NOT NULL DEFAULT 0 CHECK (reserved    >= 0),
  incoming          INTEGER NOT NULL DEFAULT 0 CHECK (incoming    >= 0),
  safety_stock      INTEGER NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (char_length(trim(branch_id))   > 0),
  CHECK (char_length(trim(branch_name)) > 0),
  CHECK (available <= on_hand),
  CHECK (reserved  <= on_hand),
  CHECK (available + reserved <= on_hand),
  UNIQUE (asset_id, inventory_id)
);

COMMENT ON TABLE  public.asset_branch_inventory IS 'Per-inventory rental stock owned by an asset. Not connected to SKUs.';
COMMENT ON COLUMN public.asset_branch_inventory.branch_id   IS 'Denormalised branch id, kept in sync from inventories.branch_id.';
COMMENT ON COLUMN public.asset_branch_inventory.branch_code IS 'Optional short display code snapshot of the branch.';
COMMENT ON COLUMN public.asset_branch_inventory.branch_name IS 'Display name snapshot of the branch at the time the row was edited.';

CREATE INDEX idx_asset_branch_inventory_asset
  ON public.asset_branch_inventory (asset_id);

CREATE INDEX idx_asset_branch_inventory_inventory
  ON public.asset_branch_inventory (inventory_id);

CREATE INDEX idx_asset_branch_inventory_branch
  ON public.asset_branch_inventory (branch_id);

-- ── updated_at ──

CREATE TRIGGER set_asset_branch_inventory_updated_at
  BEFORE UPDATE ON public.asset_branch_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Sync branch_id + denorm fields from inventories.branch_id ──

CREATE OR REPLACE FUNCTION public.asset_branch_inventory_sync_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  inv_branch_id   TEXT;
  inv_branch_code TEXT;
  inv_branch_name TEXT;
BEGIN
  SELECT b.id, b.code, COALESCE(b.name_th, b.name_en, b.code)
    INTO inv_branch_id, inv_branch_code, inv_branch_name
  FROM public.inventories i
  JOIN public.store_branches b ON b.id = i.branch_id
  WHERE i.id = NEW.inventory_id;

  IF inv_branch_id IS NULL THEN
    RAISE EXCEPTION 'inventory_id % does not exist or has no branch', NEW.inventory_id;
  END IF;

  NEW.branch_id   := inv_branch_id;
  NEW.branch_code := COALESCE(NEW.branch_code, inv_branch_code);
  NEW.branch_name := COALESCE(NULLIF(trim(NEW.branch_name), ''), inv_branch_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS asset_branch_inventory_before_sync_branch_trg
  ON public.asset_branch_inventory;
CREATE TRIGGER asset_branch_inventory_before_sync_branch_trg
  BEFORE INSERT OR UPDATE OF inventory_id ON public.asset_branch_inventory
  FOR EACH ROW EXECUTE FUNCTION public.asset_branch_inventory_sync_branch();

-- ── RLS (service_role bypasses; explicit policies left to follow-up if needed) ──

ALTER TABLE public.asset_branch_inventory ENABLE ROW LEVEL SECURITY;
