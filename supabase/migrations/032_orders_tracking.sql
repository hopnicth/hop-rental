-- 032: Sale order shipping tracking
--
-- Captures the carrier-side tracking the admin enters when fulfilling a sale
-- order so the customer can see it on their /user/orders page. Auto-stamps
-- shipped_at the first time the fulfillment_status flips to 'shipped'.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_carrier TEXT,
  ADD COLUMN IF NOT EXISTS tracking_number  TEXT,
  ADD COLUMN IF NOT EXISTS tracking_note    TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at       TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.tracking_carrier IS 'Carrier name entered by admin when shipping (e.g. Kerry, Flash, Thailand Post).';
COMMENT ON COLUMN public.orders.tracking_number  IS 'Carrier tracking number entered by admin; visible to the customer.';
COMMENT ON COLUMN public.orders.tracking_note    IS 'Free-form note from admin to the customer about the shipment.';
COMMENT ON COLUMN public.orders.shipped_at       IS 'First time fulfillment_status transitioned to shipped; set by trigger.';

CREATE OR REPLACE FUNCTION public.orders_stamp_shipped_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fulfillment_status = 'shipped'
     AND (OLD.fulfillment_status IS DISTINCT FROM 'shipped')
     AND NEW.shipped_at IS NULL THEN
    NEW.shipped_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_stamp_shipped_at ON public.orders;
CREATE TRIGGER trg_orders_stamp_shipped_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_stamp_shipped_at();
