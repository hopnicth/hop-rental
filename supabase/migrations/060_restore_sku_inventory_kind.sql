-- 060: Restore/ensure sku_branch_inventory.inventory_kind for POS sale stock filters.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'sku_inventory_kind'
  ) THEN
    CREATE TYPE public.sku_inventory_kind AS ENUM ('sale', 'rental', 'shared');
  END IF;
END $$;

ALTER TABLE public.sku_branch_inventory
  ADD COLUMN IF NOT EXISTS inventory_kind public.sku_inventory_kind NOT NULL DEFAULT 'shared';

CREATE INDEX IF NOT EXISTS idx_sku_branch_inventory_sku_kind
  ON public.sku_branch_inventory (sku_id, inventory_kind);

CREATE INDEX IF NOT EXISTS idx_sku_branch_inventory_branch_kind
  ON public.sku_branch_inventory (branch_id, inventory_kind);

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