-- Q4: SKU inventory rows for both candidates
-- READ-ONLY: SELECT only
SELECT
  sbi.branch_id,
  sbi.sku_id,
  sbi.branch_code,
  sbi.branch_name,
  sbi.inventory_kind,
  sbi.on_hand,
  sbi.available,
  sbi.reserved,
  sbi.safety_stock,
  sbi.created_at
FROM public.sku_branch_inventory sbi
WHERE sbi.branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
ORDER BY sbi.branch_id, sbi.sku_id;
