-- Allow asset-rooted bookings without a matched product/SKU.
-- Either asset_id is set, or the legacy (product_id, sku_id) pair is set.

ALTER TABLE public.rental_bookings
  ALTER COLUMN product_id DROP NOT NULL,
  ALTER COLUMN sku_id     DROP NOT NULL;

ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_root_chk;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT rental_bookings_root_chk
  CHECK (
    asset_id IS NOT NULL
    OR (product_id IS NOT NULL AND sku_id IS NOT NULL)
  );

COMMENT ON COLUMN public.rental_bookings.product_id IS
  'Optional. Snapshot of matched product when booking originated from a product/SKU. NULL for asset-only bookings.';
COMMENT ON COLUMN public.rental_bookings.sku_id IS
  'Optional. Snapshot of selected SKU when booking originated from a product/SKU. NULL for asset-only bookings.';
