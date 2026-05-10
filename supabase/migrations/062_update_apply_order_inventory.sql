-- 062: Update f_apply_order_inventory to use available stock and add insufficient stock guard
-- This migration replaces the previous implementation with the branch-aware version.

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
        AND available > 0
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_inv.available, v_remaining);
      UPDATE public.sku_branch_inventory
      SET on_hand = GREATEST(0, on_hand - v_take),
          available = GREATEST(0, available - v_take),
          updated_at = now()
      WHERE id = v_inv.id;
      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'insufficient available inventory for sku %', v_item.sku_id;
    END IF;

    PERFORM public.sync_product_sku_inventory_summary(v_item.sku_id);
  END LOOP;

  UPDATE public.orders SET inventory_applied_at = now() WHERE id = p_order_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.f_apply_order_inventory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.f_apply_order_inventory(UUID) TO service_role;
