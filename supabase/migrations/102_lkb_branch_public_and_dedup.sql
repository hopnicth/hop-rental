-- 102_lkb_branch_public_and_dedup.sql
-- Phase 1: Add is_public to store_branches, promote the canonical LKB branch,
--          remap the 8 seed sku_branch_inventory rows, and archive the duplicate.
--
-- Canonical branch : branch-e12b7a81  (LKB)
-- Duplicate branch : store-nikhom-lkb (NLKB) — created by migration 095 seed
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; UPDATE WHERE guards prevent double-apply harm.

BEGIN;

-- ── 1. Add is_public column (idempotent) ─────────────────────────────────────
ALTER TABLE public.store_branches
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

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
-- inventory_id 599b2688-… → e4ad1acc-… (canonical Default pool)
-- Guard: WHERE branch_id = 'store-nikhom-lkb' — no-op if already migrated.
UPDATE public.sku_branch_inventory
SET
  branch_id    = 'branch-e12b7a81',
  branch_code  = 'LKB',
  branch_name  = 'สาขาหน้านิคมลาดกระบัง',
  inventory_id = 'e4ad1acc-66df-407e-96c1-6bf87d5b68f4'
WHERE branch_id = 'store-nikhom-lkb';

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
