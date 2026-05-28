-- Q5a: inventory_id linkage for the 8 store-nikhom-lkb sku rows
--      (need to know which inventory UUID they reference so we can re-point them)
-- READ-ONLY: SELECT only
SELECT
  sbi.sku_id,
  sbi.branch_id,
  sbi.inventory_id,
  sbi.inventory_kind,
  sbi.on_hand,
  sbi.available
FROM public.sku_branch_inventory sbi
WHERE sbi.branch_id = 'store-nikhom-lkb'
ORDER BY sbi.sku_id;

-- Q5b: Assets pointing at branch-e12b7a81 as storage branch
SELECT
  a.id        AS asset_id,
  a.code      AS asset_code,
  a.name_th   AS asset_name,
  a.storage_branch_id,
  a.storage_inventory_id
FROM public.assets a
WHERE a.storage_branch_id = 'branch-e12b7a81'
ORDER BY a.code;

-- Q5c: Check if any of the store-nikhom-lkb SKUs ALSO exist in branch-e12b7a81
--      (to confirm zero overlap before migration)
SELECT
  sbi.sku_id,
  sbi.branch_id
FROM public.sku_branch_inventory sbi
WHERE sbi.sku_id IN (
  SELECT sku_id FROM public.sku_branch_inventory
  WHERE branch_id = 'store-nikhom-lkb'
)
ORDER BY sbi.sku_id, sbi.branch_id;
