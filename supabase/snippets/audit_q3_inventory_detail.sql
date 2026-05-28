-- Q3a: Inventory pools for both candidates
-- READ-ONLY: SELECT only
SELECT
  i.id            AS inventory_id,
  i.branch_id,
  i.name,
  i.is_default,
  i.is_default_rental,
  i.sort_order,
  i.created_at
FROM public.inventories i
WHERE i.branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
ORDER BY i.branch_id, i.sort_order;
