-- ============================================================
-- 009_split_order_status_dimensions.sql
--
-- Split order lifecycle, payment, and fulfillment into separate dimensions.
-- Existing orders are backfilled from the original single `status` column so
-- storefront/account history remains readable after the change.
-- ============================================================

ALTER TYPE public.order_status RENAME TO order_status_legacy;

CREATE TYPE public.order_status AS ENUM (
  'submitted',
  'confirmed',
  'completed',
  'cancelled'
);

CREATE TYPE public.order_payment_status AS ENUM (
  'not_applicable',
  'pending_review',
  'awaiting_payment',
  'paid',
  'deferred',
  'cancelled',
  'refunded'
);

CREATE TYPE public.order_fulfillment_status AS ENUM (
  'not_applicable',
  'unfulfilled',
  'preparing',
  'ready_for_carrier_pickup',
  'shipped',
  'delivered',
  'returned',
  'cancelled'
);

ALTER TABLE public.orders
  ADD COLUMN payment_status public.order_payment_status,
  ADD COLUMN fulfillment_status public.order_fulfillment_status;

UPDATE public.orders
SET
  payment_status = CASE
    WHEN status::text = 'cancelled' THEN 'cancelled'::public.order_payment_status
    WHEN checkout_mode = 'quotation' THEN 'not_applicable'::public.order_payment_status
    WHEN status::text = 'confirmed' AND payment_method = 'company_credit'
      THEN 'deferred'::public.order_payment_status
    WHEN status::text = 'confirmed' THEN 'paid'::public.order_payment_status
    WHEN payment_method = 'company_credit' THEN 'pending_review'::public.order_payment_status
    WHEN status::text = 'pending_review' THEN 'pending_review'::public.order_payment_status
    ELSE 'awaiting_payment'::public.order_payment_status
  END,
  fulfillment_status = CASE
    WHEN status::text = 'cancelled' THEN 'cancelled'::public.order_fulfillment_status
    WHEN checkout_mode = 'quotation' THEN 'not_applicable'::public.order_fulfillment_status
    ELSE 'unfulfilled'::public.order_fulfillment_status
  END;

ALTER TABLE public.orders
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.order_status
  USING (
    CASE
      WHEN status::text IN ('pending_payment', 'pending_review') THEN 'submitted'
      WHEN status::text = 'confirmed' THEN 'confirmed'
      WHEN status::text = 'cancelled' THEN 'cancelled'
      ELSE 'submitted'
    END::public.order_status
  ),
  ALTER COLUMN status SET DEFAULT 'submitted',
  ALTER COLUMN payment_status SET NOT NULL,
  ALTER COLUMN fulfillment_status SET NOT NULL;

COMMENT ON COLUMN public.orders.status IS 'High-level lifecycle status for the order record.';
COMMENT ON COLUMN public.orders.payment_status IS 'Commercial/payment collection status for the order.';
COMMENT ON COLUMN public.orders.fulfillment_status IS 'Physical fulfillment and delivery status for the order.';

DROP TYPE public.order_status_legacy;

CREATE INDEX idx_orders_payment_status_created_at
  ON public.orders(payment_status, created_at DESC);

CREATE INDEX idx_orders_fulfillment_status_created_at
  ON public.orders(fulfillment_status, created_at DESC);