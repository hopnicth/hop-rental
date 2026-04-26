-- 023: Rental default inventory + asset storage FKs
--
-- 1. Add `is_default_rental` flag on inventories (one per branch, like is_default).
-- 2. Auto-create both "Default" and "Rental" inventories on every new branch
--    via a trigger on store_branches.
-- 3. Seed an `is_default_rental` "Rental" inventory for existing branches.
-- 4. Add storage_branch_id / storage_inventory_id columns on assets
--    so admins can pick a primary storage location instead of typing free text.

-- ── 1. is_default_rental column + unique partial index ──

ALTER TABLE public.inventories
  ADD COLUMN IF NOT EXISTS is_default_rental BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.inventories.is_default_rental IS 'Default rental inventory for the branch. Cannot be renamed, deleted, or unflagged. Independent from is_default.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventories_one_default_rental_per_branch
  ON public.inventories (branch_id) WHERE is_default_rental;

-- ── 2. Extend protect-default trigger to also protect is_default_rental rows ──

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
    IF OLD.is_default_rental THEN
      RAISE EXCEPTION 'Default rental inventory (id=%) cannot be deleted', OLD.id
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

  IF TG_OP = 'UPDATE' AND OLD.is_default_rental THEN
    IF NEW.is_default_rental IS DISTINCT FROM OLD.is_default_rental
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'Default rental inventory (id=%) cannot have name, is_default_rental, or branch_id changed', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Trigger: auto-create Default + Rental inventories on new branch ──

CREATE OR REPLACE FUNCTION public.store_branches_after_insert_seed_inventories()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.inventories (branch_id, name, is_default, sort_order)
  VALUES (NEW.id, 'Default', TRUE, 0)
  ON CONFLICT (branch_id, name) DO NOTHING;

  INSERT INTO public.inventories (branch_id, name, is_default_rental, sort_order)
  VALUES (NEW.id, 'Rental', TRUE, 10)
  ON CONFLICT (branch_id, name) DO UPDATE
    SET is_default_rental = TRUE
    WHERE inventories.is_default = FALSE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_branches_after_insert_seed_inventories_trg ON public.store_branches;
CREATE TRIGGER store_branches_after_insert_seed_inventories_trg
  AFTER INSERT ON public.store_branches
  FOR EACH ROW EXECUTE FUNCTION public.store_branches_after_insert_seed_inventories();

-- ── 4. Backfill: ensure each existing branch has a Rental inventory ──

INSERT INTO public.inventories (branch_id, name, is_default_rental, sort_order)
SELECT b.id, 'Rental', TRUE, 10
FROM public.store_branches b
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventories i
  WHERE i.branch_id = b.id AND i.is_default_rental = TRUE
)
ON CONFLICT (branch_id, name) DO UPDATE
  SET is_default_rental = TRUE
  WHERE inventories.is_default = FALSE;

-- ── 5. Add storage FK columns on assets ──

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS storage_branch_id    TEXT
    REFERENCES public.store_branches(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_inventory_id UUID
    REFERENCES public.inventories(id)    ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_storage_branch
  ON public.assets (storage_branch_id);
CREATE INDEX IF NOT EXISTS idx_assets_storage_inventory
  ON public.assets (storage_inventory_id);

COMMENT ON COLUMN public.assets.storage_branch_id    IS 'Primary storage branch for this asset. Optional pointer to store_branches.';
COMMENT ON COLUMN public.assets.storage_inventory_id IS 'Primary storage inventory pool (must belong to storage_branch_id). Optional pointer to inventories.';

-- ── 6. Consistency check: storage_inventory_id must belong to storage_branch_id ──

CREATE OR REPLACE FUNCTION public.assets_check_storage_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  inv_branch TEXT;
BEGIN
  IF NEW.storage_inventory_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch_id INTO inv_branch
  FROM public.inventories
  WHERE id = NEW.storage_inventory_id;

  IF inv_branch IS NULL THEN
    RAISE EXCEPTION 'storage_inventory_id % does not exist', NEW.storage_inventory_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.storage_branch_id IS NULL THEN
    NEW.storage_branch_id := inv_branch;
  ELSIF NEW.storage_branch_id <> inv_branch THEN
    RAISE EXCEPTION 'storage_inventory_id % does not belong to storage_branch_id %', NEW.storage_inventory_id, NEW.storage_branch_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_check_storage_inventory_trg ON public.assets;
CREATE TRIGGER assets_check_storage_inventory_trg
  BEFORE INSERT OR UPDATE OF storage_branch_id, storage_inventory_id ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.assets_check_storage_inventory();
