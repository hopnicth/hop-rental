-- 083: Admin sale order operations queue foundation.
-- Adds authoritative sale-order fulfillment method fields for delivery/pickup
-- queue segmentation. Existing rows are backfilled only where delivery is
-- proven by an address_id; ambiguous legacy/null-address rows remain unknown.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'order_shipping_mode'
  ) THEN
    CREATE TYPE public.order_shipping_mode AS ENUM ('delivery', 'pickup');
  END IF;
END
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_mode public.order_shipping_mode,
  ADD COLUMN IF NOT EXISTS pickup_branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.shipping_mode IS
  'Authoritative sale-order fulfillment method for admin operations queues. NULL means legacy/unknown.';
COMMENT ON COLUMN public.orders.pickup_branch_id IS
  'Branch selected for customer pickup sale orders when the checkout flow provides one.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_pickup_branch_requires_pickup_chk'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_pickup_branch_requires_pickup_chk
      CHECK (pickup_branch_id IS NULL OR shipping_mode = 'pickup');
  END IF;
END
$$;

UPDATE public.orders
SET shipping_mode = 'delivery'::public.order_shipping_mode
WHERE shipping_mode IS NULL
  AND address_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shipping_mode_created_at
  ON public.orders(shipping_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_pickup_branch_created_at
  ON public.orders(pickup_branch_id, created_at DESC)
  WHERE pickup_branch_id IS NOT NULL;