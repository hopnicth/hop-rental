-- Q1: All store_branches rows that could relate to Lat Krabang / Nikhom
-- READ-ONLY: SELECT only
SELECT
  id,
  code,
  name_th,
  name_en,
  is_active,
  sort_order,
  created_at,
  updated_at
FROM public.store_branches
WHERE
  name_th   LIKE '%นิคม%'
  OR name_th   LIKE '%ลาดกระบัง%'
  OR name_th   LIKE '%สาขาหน้า%'
  OR name_en   ILIKE '%krabang%'
  OR name_en   ILIKE '%nikhom%'
  OR name_en   ILIKE '%ladkr%'
  OR id        LIKE '%lkb%'
  OR id        LIKE '%nikhom%'
  OR id        LIKE '%ladkr%'
  OR id        LIKE '%krabang%'
ORDER BY created_at;
