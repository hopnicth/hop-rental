-- Q2: Reference counts for both LKB candidate branches across ALL tables
-- READ-ONLY: SELECT only

SELECT 'inventories'                        AS tbl,
       branch_id,
       COUNT(*)                             AS cnt
FROM   public.inventories
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

UNION ALL

SELECT 'sku_branch_inventory',
       branch_id,
       COUNT(*)
FROM   public.sku_branch_inventory
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

UNION ALL

SELECT 'asset_branch_inventory',
       branch_id,
       COUNT(*)
FROM   public.asset_branch_inventory
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

UNION ALL

SELECT 'assets (storage_branch_id)',
       storage_branch_id,
       COUNT(*)
FROM   public.assets
WHERE  storage_branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY storage_branch_id

UNION ALL

SELECT 'orders (pos_branch_id)',
       pos_branch_id,
       COUNT(*)
FROM   public.orders
WHERE  pos_branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY pos_branch_id

UNION ALL

SELECT 'orders (pickup_branch_id)',
       pickup_branch_id,
       COUNT(*)
FROM   public.orders
WHERE  pickup_branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY pickup_branch_id

UNION ALL

SELECT 'rental_bookings (pos_branch_id)',
       pos_branch_id,
       COUNT(*)
FROM   public.rental_bookings
WHERE  pos_branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY pos_branch_id

UNION ALL

SELECT 'rental_bookings (pickup_branch_id)',
       pickup_branch_id,
       COUNT(*)
FROM   public.rental_bookings
WHERE  pickup_branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY pickup_branch_id

UNION ALL

SELECT 'rental_bookings (return_branch_id)',
       return_branch_id,
       COUNT(*)
FROM   public.rental_bookings
WHERE  return_branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY return_branch_id

UNION ALL

SELECT 'rental_bookings (hub_id TEXT)',
       hub_id,
       COUNT(*)
FROM   public.rental_bookings
WHERE  hub_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY hub_id

UNION ALL

SELECT 'rental_booking_fulfillments',
       branch_id,
       COUNT(*)
FROM   public.rental_booking_fulfillments
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

UNION ALL

SELECT 'rental_booking_deposit_action_logs',
       branch_id,
       COUNT(*)
FROM   public.rental_booking_deposit_action_logs
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

UNION ALL

SELECT 'admin_user_branch_access',
       branch_id,
       COUNT(*)
FROM   public.admin_user_branch_access
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

UNION ALL

SELECT 'branch_document_settings',
       branch_id,
       COUNT(*)
FROM   public.branch_document_settings
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

UNION ALL

SELECT 'document_sequences',
       branch_id,
       COUNT(*)
FROM   public.document_sequences
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

UNION ALL

SELECT 'official_documents',
       branch_id,
       COUNT(*)
FROM   public.official_documents
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

UNION ALL

SELECT 'payment_allocations',
       branch_id,
       COUNT(*)
FROM   public.payment_allocations
WHERE  branch_id IN ('branch-e12b7a81', 'store-nikhom-lkb')
GROUP  BY branch_id

ORDER  BY tbl, branch_id;
