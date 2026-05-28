-- Q5b: Assets pointing at branch-e12b7a81 as storage branch
-- READ-ONLY: SELECT only
SELECT
  a.id                   AS asset_id,
  a.code                 AS asset_code,
  a.name_th              AS asset_name_th,
  a.storage_branch_id,
  a.storage_inventory_id
FROM public.assets a
WHERE a.storage_branch_id = 'branch-e12b7a81'
ORDER BY a.code;
