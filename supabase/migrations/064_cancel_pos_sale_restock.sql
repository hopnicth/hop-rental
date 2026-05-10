-- 064: Atomic POS sale void + inventory restock.
-- Cancels a branch-scoped POS sale and reverses inventory once when stock had
-- already been applied.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_reversed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.inventory_reversed_at IS
  'Timestamp when POS sale stock deduction was reversed after void/cancel. NULL until reversed.';

CREATE OR REPLACE FUNCTION public.f_cancel_pos_sale(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order          RECORD;
  v_item           RECORD;
  v_inv            RECORD;
  v_should_reverse BOOLEAN := FALSE;
  v_restocked      BOOLEAN := FALSE;
  v_total_qty      INTEGER := 0;
BEGIN
  SELECT id, status, payment_status, pos_branch_id, inventory_applied_at, inventory_reversed_at
    INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS sale % not found', p_order_id;
  END IF;

  IF v_order.pos_branch_id IS NULL THEN
    RAISE EXCEPTION 'Only POS sales can be cancelled here';
  END IF;

  v_should_reverse :=
    v_order.inventory_applied_at IS NOT NULL
    AND v_order.inventory_reversed_at IS NULL;

  IF v_should_reverse THEN
    FOR v_item IN
      SELECT sku_id, SUM(quantity)::INTEGER AS qty
      FROM public.order_items
      WHERE order_id = p_order_id
      GROUP BY sku_id
    LOOP
      SELECT id
        INTO v_inv
      FROM public.sku_branch_inventory
      WHERE sku_id = v_item.sku_id
        AND branch_id = v_order.pos_branch_id
        AND inventory_kind IN ('sale', 'shared')
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'inventory row not found for sku % branch %',
          v_item.sku_id,
          v_order.pos_branch_id;
      END IF;

      UPDATE public.sku_branch_inventory
      SET on_hand = on_hand + v_item.qty,
          available = available + v_item.qty,
          updated_at = now()
      WHERE id = v_inv.id;

      PERFORM public.sync_product_sku_inventory_summary(v_item.sku_id);
      v_total_qty := v_total_qty + v_item.qty;
      v_restocked := TRUE;
    END LOOP;
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = 'cancelled',
      fulfillment_status = 'cancelled',
      inventory_reversed_at = CASE
        WHEN v_should_reverse THEN now()
        ELSE inventory_reversed_at
      END
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'status', 'cancelled',
    'inventoryWasApplied', v_order.inventory_applied_at IS NOT NULL,
    'inventoryAlreadyReversed', v_order.inventory_reversed_at IS NOT NULL,
    'inventoryRestocked', v_restocked,
    'restockedQuantity', v_total_qty
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_cancel_pos_sale(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.f_cancel_pos_sale(UUID) TO service_role;