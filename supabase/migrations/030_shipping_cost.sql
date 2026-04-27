-- 030: Shipping size on products + shipping cost snapshot on orders
--
-- Each product is tagged with a shipping size bucket (free / s / m / l / xl).
-- The cart converts the order into "free-units" using fixed ratios and packs
-- them greedily into the largest possible boxes (xl → free) to compute the
-- shipping fee. The fee + the box breakdown are persisted on the order so the
-- numbers remain auditable even if the rate table is later changed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'product_shipping_size'
  ) THEN
    CREATE TYPE public.product_shipping_size AS ENUM ('free', 's', 'm', 'l', 'xl');
  END IF;
END
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shipping_size public.product_shipping_size NOT NULL DEFAULT 's';

COMMENT ON COLUMN public.products.shipping_size IS 'Shipping bucket used to compute the cart shipping fee via free-unit bin-packing.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_cost      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  ADD COLUMN IF NOT EXISTS shipping_breakdown JSONB         NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.orders.shipping_cost IS 'Shipping fee captured at order submit time. 0 when picking up at branch.';
COMMENT ON COLUMN public.orders.shipping_breakdown IS 'Bin-pack breakdown: { xl, l, m, s, free, totalFreeUnits }. Empty object when no shipping was charged.';
