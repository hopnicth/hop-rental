-- 059: Full-function Admin POS foundations
--
-- Adds POS branch access, in-store sale metadata, unified payment capture fields,
-- and scanner-friendly barcode/code indexes. Master data remains controlled by
-- Super Admin at the API layer.

-- POS payment methods used by rental deposits and in-store sales.
ALTER TYPE public.order_payment_method ADD VALUE IF NOT EXISTS 'cash';
ALTER TYPE public.order_payment_method ADD VALUE IF NOT EXISTS 'qr_transfer';
ALTER TYPE public.order_payment_method ADD VALUE IF NOT EXISTS 'bank_transfer';
ALTER TYPE public.order_payment_method ADD VALUE IF NOT EXISTS 'card';
ALTER TYPE public.order_payment_method ADD VALUE IF NOT EXISTS 'other';

CREATE TABLE IF NOT EXISTS public.admin_user_branch_access (
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  branch_id          TEXT NOT NULL REFERENCES public.store_branches(id) ON DELETE CASCADE,
  can_pos            BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, branch_id)
);

DROP TRIGGER IF EXISTS set_admin_user_branch_access_updated_at
  ON public.admin_user_branch_access;
CREATE TRIGGER set_admin_user_branch_access_updated_at
  BEFORE UPDATE ON public.admin_user_branch_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.admin_user_branch_access IS
  'Super Admin managed branch access for staff POS sessions.';

ALTER TABLE public.orders
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS walk_in_phone TEXT REFERENCES public.walk_in_customers(phone) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pos_branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pos_branch_code TEXT,
  ADD COLUMN IF NOT EXISTS pos_branch_name TEXT,
  ADD COLUMN IF NOT EXISTS pos_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pos_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS pos_payment_method TEXT CHECK (pos_payment_method IN ('cash','qr_transfer','bank_transfer','card','other','credit_card','promptpay','company_credit')),
  ADD COLUMN IF NOT EXISTS pos_staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_customer_ref_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_customer_ref_chk
  CHECK (user_id IS NOT NULL OR walk_in_phone IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_orders_pos_branch_created
  ON public.orders(pos_branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_walk_in_phone_created
  ON public.orders(walk_in_phone, created_at DESC);

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS checkout_total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (checkout_total_amount >= 0),
  ADD COLUMN IF NOT EXISTS checkout_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (checkout_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS checkout_payment_method TEXT CHECK (checkout_payment_method IN ('cash','qr_transfer','bank_transfer','card','other')),
  ADD COLUMN IF NOT EXISTS pos_branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pos_branch_code TEXT,
  ADD COLUMN IF NOT EXISTS pos_branch_name TEXT,
  ADD COLUMN IF NOT EXISTS pos_staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rental_bookings_pos_branch_created
  ON public.rental_bookings(pos_branch_id, created_at DESC);

COMMENT ON COLUMN public.assets.code IS
  'Super Admin managed asset code; can be printed as QR/barcode payload for POS scanning.';
COMMENT ON COLUMN public.product_skus.sku_code IS
  'Super Admin managed sale SKU/barcode code. Use this field or id as scanner payload.';
CREATE INDEX IF NOT EXISTS idx_product_skus_sku_code_lookup
  ON public.product_skus(sku_code)
  WHERE sku_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.f_apply_order_inventory(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_applied TIMESTAMPTZ;
  v_branch_id       TEXT;
  v_item            RECORD;
  v_inv             RECORD;
  v_remaining       INTEGER;
  v_take            INTEGER;
BEGIN
  SELECT inventory_applied_at, pos_branch_id
    INTO v_already_applied, v_branch_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;
  IF v_already_applied IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  FOR v_item IN
    SELECT sku_id, SUM(quantity)::INTEGER AS qty
    FROM public.order_items
    WHERE order_id = p_order_id
    GROUP BY sku_id
  LOOP
    v_remaining := v_item.qty;
    FOR v_inv IN
      SELECT id, on_hand, available
      FROM public.sku_branch_inventory
      WHERE sku_id = v_item.sku_id
        AND inventory_kind IN ('sale', 'shared')
        AND (v_branch_id IS NULL OR branch_id = v_branch_id)
        AND on_hand > 0
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_inv.on_hand, v_remaining);
      UPDATE public.sku_branch_inventory
      SET on_hand = GREATEST(0, on_hand - v_take),
          available = GREATEST(0, available - v_take),
          updated_at = now()
      WHERE id = v_inv.id;
      v_remaining := v_remaining - v_take;
    END LOOP;

    PERFORM public.sync_product_sku_inventory_summary(v_item.sku_id);
  END LOOP;

  UPDATE public.orders SET inventory_applied_at = now() WHERE id = p_order_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.f_apply_order_inventory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.f_apply_order_inventory(UUID) TO service_role;