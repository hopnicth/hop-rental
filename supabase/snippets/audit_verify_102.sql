-- Verification after migration 102_lkb_branch_public_and_dedup
-- READ-ONLY: SELECT only

-- V1: Public branches count (expected: 1 row — branch-e12b7a81)
SELECT id, code, name_th, name_en, is_active, is_public, sort_order
FROM public.store_branches
WHERE is_active = true AND is_public = true
ORDER BY sort_order;

-- V2: Duplicate branch archived (expected: is_active=false, is_public=false)
SELECT id, code, name_th, is_active, is_public, updated_at
FROM public.store_branches
WHERE id = 'store-nikhom-lkb';

-- V3: 8 sku_branch_inventory rows moved to canonical branch (expected: 8 rows with branch_id=branch-e12b7a81 and inventory_kind=sale)
SELECT branch_id, branch_code, branch_name, inventory_id, inventory_kind, COUNT(*) AS cnt
FROM public.sku_branch_inventory
WHERE inventory_kind = 'sale'
GROUP BY branch_id, branch_code, branch_name, inventory_id, inventory_kind
ORDER BY branch_id;

-- V4: No sku_branch_inventory rows remain under store-nikhom-lkb (expected: 0 rows)
SELECT COUNT(*) AS remaining_duplicate_sku_rows
FROM public.sku_branch_inventory
WHERE branch_id = 'store-nikhom-lkb';
