-- ============================================================
-- HOPNIC — Migration 003: Shopping Cart (DB-backed)
-- ============================================================
-- Depends on: 001_rbac_schema.sql (users, update_updated_at fn)
--
-- Design:
--   - One cart per user (1:1) — carts.user_id UNIQUE
--   - cart_items keyed by (cart_id, product_id, sku_id)
--   - RLS: users see only their own cart + items
--   - Guest carts live in localStorage only (no DB row)
-- ============================================================


-- ─── 1. CARTS TABLE ─────────────────────────────────────────

CREATE TABLE public.carts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.carts          IS 'One cart per logged-in user.';
COMMENT ON COLUMN public.carts.user_id  IS 'Owner — 1:1 with auth user.';


-- ─── 2. CART_ITEMS TABLE ────────────────────────────────────

CREATE TABLE public.cart_items (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    UUID          NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id TEXT          NOT NULL,
  sku_id     TEXT          NOT NULL,
  name       TEXT          NOT NULL,
  thumbnail  TEXT,
  unit_price NUMERIC(12,2) NOT NULL,
  quantity   INTEGER       NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (cart_id, product_id, sku_id)
);

COMMENT ON TABLE  public.cart_items            IS 'Line items inside a user cart.';
COMMENT ON COLUMN public.cart_items.product_id IS 'References product catalog (mock/future DB).';
COMMENT ON COLUMN public.cart_items.sku_id     IS 'Selected variant within the product.';
COMMENT ON COLUMN public.cart_items.name       IS 'Snapshot of product name at time of add.';
COMMENT ON COLUMN public.cart_items.unit_price IS 'Snapshot of price at time of add.';


-- ─── 3. INDEXES ─────────────────────────────────────────────

CREATE INDEX idx_carts_user       ON public.carts(user_id);
CREATE INDEX idx_cart_items_cart   ON public.cart_items(cart_id);


-- ─── 4. UPDATED_AT TRIGGERS (reuse fn from 001) ────────────

CREATE TRIGGER set_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ─── 5. ROW LEVEL SECURITY ─────────────────────────────────

ALTER TABLE public.carts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- ── carts ──

CREATE POLICY "carts_select_own"
  ON public.carts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "carts_insert_own"
  ON public.carts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "carts_update_own"
  ON public.carts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "carts_delete_own"
  ON public.carts FOR DELETE
  USING (auth.uid() = user_id);

-- ── cart_items (via cart ownership) ──

CREATE POLICY "cart_items_select_own"
  ON public.cart_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id
        AND carts.user_id = auth.uid()
    )
  );

CREATE POLICY "cart_items_insert_own"
  ON public.cart_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id
        AND carts.user_id = auth.uid()
    )
  );

CREATE POLICY "cart_items_update_own"
  ON public.cart_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id
        AND carts.user_id = auth.uid()
    )
  );

CREATE POLICY "cart_items_delete_own"
  ON public.cart_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id
        AND carts.user_id = auth.uid()
    )
  );

