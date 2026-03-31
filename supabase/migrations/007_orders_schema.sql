-- ============================================================
-- HOPNIC — Migration 007: Orders + Order Items (MVP storefront)
-- ============================================================
-- Depends on:
--   - 001_rbac_schema.sql (users, companies, update_updated_at)
--   - 002_addresses_pdpa.sql (addresses)
--   - 003_cart_schema.sql (carts)
--
-- Goals:
--   - Persist finalized sale orders from the storefront cart
--   - Support both payment submission and quotation request modes
--   - Preserve address and pricing snapshots for order history
-- ============================================================

CREATE TYPE order_checkout_mode AS ENUM ('payment', 'quotation');
CREATE TYPE order_payment_method AS ENUM (
  'credit_card',
  'promptpay',
  'company_credit'
);
CREATE TYPE order_status AS ENUM (
  'pending_payment',
  'pending_review',
  'confirmed',
  'cancelled'
);

CREATE TABLE public.orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     TEXT NOT NULL UNIQUE DEFAULT (
    'ORD-'
    || to_char(now(), 'YYYYMMDDHH24MISS')
    || '-'
    || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6))
  ),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id       UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  cart_id          UUID REFERENCES public.carts(id) ON DELETE SET NULL,
  checkout_mode    order_checkout_mode NOT NULL,
  payment_method   order_payment_method,
  status           order_status NOT NULL DEFAULT 'pending_review',
  address_id       UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
  address_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  subtotal         NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_total   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  grand_total      NUMERIC(12,2) NOT NULL CHECK (grand_total >= 0),
  currency_code    TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    (checkout_mode = 'quotation' AND payment_method IS NULL)
    OR (checkout_mode = 'payment' AND payment_method IS NOT NULL)
  )
);

COMMENT ON TABLE public.orders IS 'Submitted storefront sale orders and quotation requests.';
COMMENT ON COLUMN public.orders.address_snapshot IS 'Frozen delivery/billing address payload captured at submit time.';

CREATE TABLE public.order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id          TEXT NOT NULL,
  sku_id              TEXT NOT NULL,
  name                TEXT NOT NULL,
  thumbnail           TEXT,
  unit_price          NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  original_unit_price NUMERIC(12,2),
  discount_percent    INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  line_total          NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (original_unit_price IS NULL OR original_unit_price >= unit_price)
);

COMMENT ON TABLE public.order_items IS 'Snapshot sale line items belonging to an order.';

CREATE INDEX idx_orders_user_created_at
  ON public.orders(user_id, created_at DESC);

CREATE INDEX idx_orders_company_created_at
  ON public.orders(company_id, created_at DESC);

CREATE INDEX idx_orders_status_created_at
  ON public.orders(status, created_at DESC);

CREATE INDEX idx_order_items_order
  ON public.order_items(order_id);

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_own_or_company"
  ON public.orders FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = orders.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "orders_insert_own_or_company"
  ON public.orders FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      company_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = orders.company_id
          AND cm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "orders_delete_own_or_company"
  ON public.orders FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = orders.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "order_items_select_via_owned_order"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND (
          orders.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = orders.company_id
              AND cm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "order_items_insert_via_owned_order"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.user_id = auth.uid()
    )
  );