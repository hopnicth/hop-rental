-- Q5a: inventory_id values for the 8 store-nikhom-lkb sku rows
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
