-- 021: Multi-inventory per branch
-- Introduce inventories table sitting between store_branches and sku_branch_inventory.
-- Each branch has at least one default inventory (protected). Stock rows reference
-- inventory_id; branch_id stays denormalised for query performance and is kept in
-- sync via trigger.

-- ── 1. inventories table ──

CREATE TABLE IF NOT EXISTS public.inventories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   TEXT NOT NULL REFERENCES public.store_branches(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  notes       JSONB NOT NULL DEFAULT '{}'::JSONB,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(trim(name)) > 0),
  CHECK (jsonb_typeof(notes) = 'object'),
  UNIQUE (branch_id, name)
);

COMMENT ON TABLE public.inventories IS 'Logical inventory pools owned by a branch. Each branch must have exactly one default inventory.';
COMMENT ON COLUMN public.inventories.is_default IS 'Default inventory for the branch. Cannot be renamed, deleted, or unflagged.';
COMMENT ON COLUMN public.inventories.notes IS 'Free-form metadata as JSONB (location, kind, contact, etc.).';

CREATE INDEX IF NOT EXISTS idx_inventories_branch ON public.inventories (branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventories_one_default_per_branch
  ON public.inventories (branch_id) WHERE is_default;

DROP TRIGGER IF EXISTS set_inventories_updated_at ON public.inventories;
CREATE TRIGGER set_inventories_updated_at
  BEFORE UPDATE ON public.inventories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 2. Protect default inventory from rename / unflag / delete ──

CREATE OR REPLACE FUNCTION public.inventories_protect_default()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_default THEN
      RAISE EXCEPTION 'Default inventory (id=%) cannot be deleted', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_default THEN
    IF NEW.is_default IS DISTINCT FROM OLD.is_default
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'Default inventory (id=%) cannot have name, is_default, or branch_id changed', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventories_protect_default_trg ON public.inventories;
CREATE TRIGGER inventories_protect_default_trg
  BEFORE UPDATE OR DELETE ON public.inventories
  FOR EACH ROW EXECUTE FUNCTION public.inventories_protect_default();

-- ── 3. Seed one default inventory per existing branch ──

INSERT INTO public.inventories (branch_id, name, is_default, sort_order)
SELECT id, 'Default', TRUE, 0
FROM public.store_branches
ON CONFLICT (branch_id, name) DO NOTHING;

-- ── 4. Add inventory_id to sku_branch_inventory and backfill ──

ALTER TABLE public.sku_branch_inventory
  ADD COLUMN IF NOT EXISTS inventory_id UUID;

UPDATE public.sku_branch_inventory sbi
SET inventory_id = inv.id
FROM public.inventories inv
WHERE sbi.inventory_id IS NULL
  AND inv.branch_id = sbi.branch_id
  AND inv.is_default = TRUE;

ALTER TABLE public.sku_branch_inventory
  ALTER COLUMN inventory_id SET NOT NULL;

ALTER TABLE public.sku_branch_inventory
  DROP CONSTRAINT IF EXISTS sku_branch_inventory_inventory_id_fkey;

ALTER TABLE public.sku_branch_inventory
  ADD CONSTRAINT sku_branch_inventory_inventory_id_fkey
  FOREIGN KEY (inventory_id)
  REFERENCES public.inventories(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ── 5. Replace UNIQUE(sku_id, branch_id) with UNIQUE(sku_id, inventory_id) ──

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.sku_branch_inventory'::regclass
      AND contype = 'u'
      AND conname <> 'sku_branch_inventory_sku_inventory_unique'
  LOOP
    EXECUTE format('ALTER TABLE public.sku_branch_inventory DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.sku_branch_inventory
  DROP CONSTRAINT IF EXISTS sku_branch_inventory_sku_inventory_unique;

ALTER TABLE public.sku_branch_inventory
  ADD CONSTRAINT sku_branch_inventory_sku_inventory_unique
  UNIQUE (sku_id, inventory_id);

CREATE INDEX IF NOT EXISTS idx_sku_branch_inventory_inventory
  ON public.sku_branch_inventory (inventory_id);

-- ── 6. Keep branch_id in sync with the inventory's branch ──

CREATE OR REPLACE FUNCTION public.sku_branch_inventory_sync_branch_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  inv_branch TEXT;
BEGIN
  SELECT branch_id INTO inv_branch
  FROM public.inventories
  WHERE id = NEW.inventory_id;

  IF inv_branch IS NULL THEN
    RAISE EXCEPTION 'inventory_id % does not exist', NEW.inventory_id;
  END IF;

  NEW.branch_id := inv_branch;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sku_branch_inventory_before_sync_branch_id_trg ON public.sku_branch_inventory;
CREATE TRIGGER sku_branch_inventory_before_sync_branch_id_trg
  BEFORE INSERT OR UPDATE OF inventory_id ON public.sku_branch_inventory
  FOR EACH ROW EXECUTE FUNCTION public.sku_branch_inventory_sync_branch_id();

-- ── 7. RLS for inventories ──

ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventories_service_role_all" ON public.inventories;
CREATE POLICY "inventories_service_role_all"
  ON public.inventories
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);
