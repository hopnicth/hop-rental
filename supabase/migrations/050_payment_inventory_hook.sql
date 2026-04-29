-- 050: Post-payment inventory hook
--
-- Adds an idempotency marker on orders and an RPC that deducts stock from
-- sku_branch_inventory rows (sale + shared kinds) when an order is marked paid.
-- Called from applyGatewayResult() in server/utils/payments.ts.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_applied_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.inventory_applied_at IS
  'Timestamp when stock was deducted following payment success. NULL until applied. Used by f_apply_order_inventory for idempotency.';

CREATE OR REPLACE FUNCTION public.f_apply_order_inventory(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_applied TIMESTAMPTZ;
  v_item            RECORD;
  v_inv             RECORD;
  v_remaining       INTEGER;
  v_take            INTEGER;
BEGIN
  -- Lock the order row so concurrent webhook + poll calls serialise here.
  SELECT inventory_applied_at INTO v_already_applied
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF v_already_applied IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  -- Walk each ordered line, deducting from sale/shared inventory rows in
  -- FIFO order (oldest row first). Continues across rows until the line's
  -- quantity is satisfied. Underflow is allowed at the on_hand level via
  -- GREATEST(0, ...) so we never violate the CHECK constraints if stock
  -- bookkeeping has drifted; an admin alert from the caller will surface it.
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
        AND on_hand > 0
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_inv.on_hand, v_remaining);

      UPDATE public.sku_branch_inventory
      SET on_hand    = GREATEST(0, on_hand - v_take),
          available  = GREATEST(0, available - v_take),
          updated_at = now()
      WHERE id = v_inv.id;

      v_remaining := v_remaining - v_take;
    END LOOP;

    -- Refresh the denormalised product_skus.stock summary for this SKU.
    PERFORM public.sync_product_sku_inventory_summary(v_item.sku_id);
  END LOOP;

  UPDATE public.orders
  SET inventory_applied_at = now()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.f_apply_order_inventory(UUID) IS
  'Idempotent stock deduction triggered after payment success. Returns TRUE on first call, FALSE on subsequent calls.';

REVOKE ALL ON FUNCTION public.f_apply_order_inventory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.f_apply_order_inventory(UUID) TO service_role;
