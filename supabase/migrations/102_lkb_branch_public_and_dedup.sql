-- 102_lkb_branch_public_and_dedup.sql
-- Phase 1: Add is_public to store_branches, promote the canonical LKB branch,
--          remap the 8 seed sku_branch_inventory rows, and archive the duplicate.
--
-- Canonical branch : branch-e12b7a81  (LKB)
-- Duplicate branch : store-nikhom-lkb (NLKB) — created by migration 095 seed
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; INSERT ON CONFLICT DO NOTHING;
--             UPDATE WHERE guards + dynamic inventory lookup; no hardcoded UUIDs.

BEGIN;

-- ── 1. Add is_public column (idempotent) ─────────────────────────────────────
ALTER TABLE public.store_branches
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- ── 1a. Seed canonical LKB branch if absent (idempotent) ─────────────────────
-- branch-e12b7a81 was created out-of-band on staging before this migration was
-- written. On a fresh db reset it does not exist. Inserting it here causes the
-- store_branches_after_insert_seed_inventories_trg trigger (migration 023) to
-- auto-create the Default + Rental inventories via gen_random_uuid().
-- ON CONFLICT (id) DO NOTHING is a no-op on staging where the branch already exists.
-- is_public = TRUE is set explicitly; statement 2 below also sets it, but we do
-- not rely on that to correct a stale value from the INSERT.
INSERT INTO public.store_branches (id, code, name_th, name_en, is_active, is_public, sort_order)
VALUES ('branch-e12b7a81', 'LKB', 'สาขาหน้านิคมลาดกระบัง', 'Lat Krabang Industrial Estate', TRUE, TRUE, 20)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Promote canonical LKB branch ──────────────────────────────────────────
UPDATE public.store_branches
SET
  name_th    = 'สาขาหน้านิคมลาดกระบัง',
  name_en    = 'Lat Krabang Industrial Estate',
  is_active  = true,
  is_public  = true,
  updated_at = now()
WHERE id = 'branch-e12b7a81';

-- ── 3. Ensure all other branches are explicitly not public ────────────────────
UPDATE public.store_branches
SET
  is_public  = false,
  updated_at = now()
WHERE id IN ('branch-hq', 'store-001', 'store-002', 'store-nikhom-lkb');

-- ── 4. Move 8 sale sku_branch_inventory rows to canonical branch ──────────────
-- Rows: sku-020-default … sku-027-default (inventory_kind = sale)
-- inventory_id resolved dynamically from the canonical branch Default inventory.
-- Guard: WHERE sbi.branch_id = 'store-nikhom-lkb' — no-op if already migrated.
-- Guard: AND EXISTS — skips entirely if the canonical default inventory is absent.
UPDATE public.sku_branch_inventory sbi
SET
  branch_id    = 'branch-e12b7a81',
  branch_code  = 'LKB',
  branch_name  = 'สาขาหน้านิคมลาดกระบัง',
  inventory_id = (
    SELECT id FROM public.inventories
    WHERE branch_id = 'branch-e12b7a81'
      AND name = 'Default'
    LIMIT 1
  )
WHERE sbi.branch_id = 'store-nikhom-lkb'
  AND EXISTS (
    SELECT 1 FROM public.inventories
    WHERE branch_id = 'branch-e12b7a81'
      AND name = 'Default'
  );

-- ── 5. Deactivate duplicate inventory pools (conditional on column) ───────────
-- Duplicate Default pool : 599b2688-eb04-47c3-8a91-8e53d592a8e6
-- Duplicate Rental pool  : 4272c0ad-98db-4f83-b958-b218107fdb83
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'inventories'
      AND column_name  = 'is_active'
  ) THEN
    UPDATE public.inventories
    SET is_active = false
    WHERE id IN (
      '599b2688-eb04-47c3-8a91-8e53d592a8e6',
      '4272c0ad-98db-4f83-b958-b218107fdb83'
    );
  END IF;
END
$$;

-- ── 6. Archive duplicate branch ───────────────────────────────────────────────
UPDATE public.store_branches
SET
  is_active  = false,
  is_public  = false,
  updated_at = now()
WHERE id = 'store-nikhom-lkb';

COMMIT;
