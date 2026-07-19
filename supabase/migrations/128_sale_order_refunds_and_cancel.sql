-- ============================================================
-- 128_sale_order_refunds_and_cancel.sql
--
-- Scope:
--   * sale_order_refunds (ruling 3: method manual_transfer|gateway_refund,
--     state pending|settled|failed, evidence discipline per payment_refunds)
--   * orders.inventory_restored_at + f_restore_order_inventory (exact
--     inverse of f_apply_order_inventory, mig 062)
--   * f_cancel_sale_order: one txn — flip + refund record + conditional
--     restore + D5 payment-request closure
--   * f_settle_sale_order_refund: pending → settled/failed with evidence
--
-- Key design decisions:
--   * Design contract: docs/design/2026-07-19-t3-t4-unified-cancel-and-documents.md
--     §A case 4, ruling 3. Closes Case-1 D5/BUGS 1-3.
--   * LOCK ORDER (order-domain writers, first definition): order row FIRST →
--     inventory rows (FIFO, FOR UPDATE) → payment-request rows.
--   * Money authority: refund amount derived in-RPC (pos_paid_amount>0 else
--     grand_total); never caller-supplied.
--   * Restore is symmetric inverse of apply (on_hand+=q, available+=q;
--     reserved untouched) — preserves all sku_branch_inventory CHECKs.
--   * Multi-target manual payment requests are left open (counted in the
--     return); only all-items-this-order requests are cancelled (118 guard
--     whitelists status; items immutable). Closure locks rows with a plain
--     FOR UPDATE then classifies (items immutable ⇒ post-lock test race-safe).
--   * orders.payment_status is the 009 enum (009:18-26) — 'cancelled' and
--     'refunded' both legal; paid orders stay 'paid' until settle.
--   * §F operation='sale_cancel_paid' is logged by the WRAPPER (walk 4).
-- ============================================================

-- ── sale_order_refunds ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_order_refunds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  user_id        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  refund_amount  numeric(12,2) NOT NULL CHECK (refund_amount > 0),
  currency_code  text NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  method         text NOT NULL DEFAULT 'manual_transfer',
  state          text NOT NULL DEFAULT 'pending',
  reason         text NOT NULL,
  refund_bank_name           text NOT NULL,
  refund_bank_account_number text NOT NULL,
  refund_bank_account_name   text NOT NULL,
  refund_contact_phone       text NOT NULL,
  manual_transfer_reference  text,
  slip_storage_bucket        text,
  slip_storage_path          text,
  failed_reason  text,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  settled_at     timestamptz,
  failed_at      timestamptz,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  settled_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sor_method_chk CHECK (method IN ('manual_transfer', 'gateway_refund')),
  CONSTRAINT sor_state_chk CHECK (state IN ('pending', 'settled', 'failed')),
  CONSTRAINT sor_reason_chk CHECK (char_length(trim(reason)) > 0),
  CONSTRAINT sor_bank_chk CHECK (
    char_length(trim(refund_bank_name)) > 0
    AND char_length(trim(refund_bank_account_number)) > 0
    AND char_length(trim(refund_bank_account_name)) > 0
    AND char_length(trim(refund_contact_phone)) > 0
  ),
  CONSTRAINT sor_settled_evidence_chk CHECK (
    state <> 'settled' OR (
      settled_at IS NOT NULL
      AND char_length(trim(coalesce(manual_transfer_reference, ''))) > 0
      AND char_length(trim(coalesce(slip_storage_path, ''))) > 0
    )
  ),
  CONSTRAINT sor_failed_chk CHECK (
    state <> 'failed' OR (failed_at IS NOT NULL
      AND char_length(trim(coalesce(failed_reason, ''))) > 0)
  ),
  CONSTRAINT sor_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_order_refunds_one_per_order
  ON public.sale_order_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_sale_order_refunds_state
  ON public.sale_order_refunds(state, created_at DESC);

COMMENT ON TABLE public.sale_order_refunds IS
  'Sale-order refund records (T3 ruling 3). method: manual_transfer (live) | gateway_refund (Omise-ready). state machine: pending -> settled (requires transfer reference + slip evidence) | failed. One refund per order. Amount is RPC-derived from the order''s paid total — never caller-supplied.';

CREATE TRIGGER set_sale_order_refunds_updated_at
  BEFORE UPDATE ON public.sale_order_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.guard_sale_order_refund_updates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.refund_amount IS DISTINCT FROM OLD.refund_amount
     OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'sale_order_refunds: money-identity columns are immutable';
  END IF;
  IF OLD.state IN ('settled', 'failed') AND NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'sale_order_refunds: % is a terminal state', OLD.state;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sale_order_refunds_guard_update
  BEFORE UPDATE ON public.sale_order_refunds
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_order_refund_updates();

CREATE OR REPLACE FUNCTION public.block_sale_order_refund_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sale_order_refunds rows cannot be deleted';
END;
$$;
CREATE TRIGGER trg_sale_order_refunds_block_delete
  BEFORE DELETE ON public.sale_order_refunds
  FOR EACH ROW EXECUTE FUNCTION public.block_sale_order_refund_delete();

ALTER TABLE public.sale_order_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_order_refunds FROM anon, authenticated;
GRANT ALL ON public.sale_order_refunds TO service_role;
CREATE POLICY "sale_order_refunds_service_role_all"
  ON public.sale_order_refunds FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ── orders.inventory_restored_at ────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_restored_at timestamptz;
COMMENT ON COLUMN public.orders.inventory_restored_at IS
  'Set by f_restore_order_inventory (128). Restore idempotency stamp — the inverse of inventory_applied_at (062).';

-- ── f_restore_order_inventory ───────────────────────────────
CREATE OR REPLACE FUNCTION public.f_restore_order_inventory(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied  TIMESTAMPTZ;
  v_restored TIMESTAMPTZ;
  v_fulfillment public.order_fulfillment_status;
  v_branch_id TEXT;
  v_item RECORD;
  v_inv_id UUID;
BEGIN
  -- LOCK ORDER (order-domain convention): order row FIRST.
  SELECT inventory_applied_at, inventory_restored_at, fulfillment_status, pos_branch_id
    INTO v_applied, v_restored, v_fulfillment, v_branch_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;
  IF v_applied IS NULL THEN
    RETURN FALSE;  -- nothing to restore (never applied)
  END IF;
  IF v_restored IS NOT NULL THEN
    RETURN FALSE;  -- idempotent
  END IF;
  -- Ruling-3 boundary: auto-restore ONLY while unfulfilled.
  IF v_fulfillment NOT IN ('not_applicable', 'unfulfilled', 'cancelled') THEN
    RAISE EXCEPTION 'ORDER_FULFILLMENT_STARTED: restore is a manual adjustment for %', v_fulfillment;
  END IF;

  FOR v_item IN
    SELECT sku_id, SUM(quantity)::INTEGER AS qty
    FROM public.order_items
    WHERE order_id = p_order_id
    GROUP BY sku_id
  LOOP
    -- Symmetric inverse of 062 apply: first matching row (same predicate +
    -- FIFO order) receives the full quantity back; on_hand and available
    -- increment together (reserved untouched) — all CHECKs preserved.
    SELECT id INTO v_inv_id
    FROM public.sku_branch_inventory
    WHERE sku_id = v_item.sku_id
      AND inventory_kind IN ('sale', 'shared')
      AND (v_branch_id IS NULL OR branch_id = v_branch_id)
    ORDER BY created_at ASC, id ASC
    LIMIT 1
    FOR UPDATE;
    IF v_inv_id IS NULL THEN
      RAISE EXCEPTION 'RESTORE_TARGET_MISSING: no sale/shared inventory row for sku %', v_item.sku_id;
    END IF;
    UPDATE public.sku_branch_inventory
    SET on_hand = on_hand + v_item.qty,
        available = available + v_item.qty,
        updated_at = now()
    WHERE id = v_inv_id;
    PERFORM public.sync_product_sku_inventory_summary(v_item.sku_id);
  END LOOP;

  UPDATE public.orders SET inventory_restored_at = now() WHERE id = p_order_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.f_restore_order_inventory(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_restore_order_inventory(UUID) TO service_role;

-- ── f_cancel_sale_order ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.f_cancel_sale_order(
  p_order_id UUID,
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_reason TEXT,
  p_refund_bank_name TEXT DEFAULT NULL,
  p_refund_bank_account_number TEXT DEFAULT NULL,
  p_refund_bank_account_name TEXT DEFAULT NULL,
  p_refund_contact_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid BOOLEAN;
  v_refund_amount NUMERIC := 0;
  v_refund public.sale_order_refunds%ROWTYPE;
  v_restored BOOLEAN := FALSE;
  v_restore_manual BOOLEAN := FALSE;
  v_req RECORD;
  v_requests_closed INTEGER := 0;
  v_requests_left_open INTEGER := 0;
BEGIN
  IF p_actor_role NOT IN ('staff', 'super_admin') THEN
    RAISE EXCEPTION 'CANCEL_ACTOR_ROLE_INVALID';
  END IF;
  IF NULLIF(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CANCEL_REASON_REQUIRED';
  END IF;

  -- LOCK ORDER (order-domain convention): order row FIRST.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyCancelled', true, 'orderId', p_order_id);
  END IF;
  IF v_order.status NOT IN ('submitted', 'confirmed') THEN
    RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE: %', v_order.status;
  END IF;

  v_paid := v_order.payment_status = 'paid';
  IF v_paid THEN
    -- Money authority: derived, never caller-supplied.
    v_refund_amount := CASE WHEN v_order.pos_paid_amount > 0
                            THEN v_order.pos_paid_amount
                            ELSE v_order.grand_total END;
    IF v_refund_amount <= 0 THEN
      RAISE EXCEPTION 'REFUND_AMOUNT_NOT_RESOLVED';
    END IF;
    IF NULLIF(trim(coalesce(p_refund_bank_name, '')), '') IS NULL
       OR NULLIF(trim(coalesce(p_refund_bank_account_number, '')), '') IS NULL
       OR NULLIF(trim(coalesce(p_refund_bank_account_name, '')), '') IS NULL
       OR NULLIF(trim(coalesce(p_refund_contact_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'SALE_REFUND_BANK_DETAILS_REQUIRED';
    END IF;
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = CASE WHEN v_paid THEN payment_status ELSE 'cancelled' END,
      fulfillment_status = CASE
        WHEN fulfillment_status IN ('not_applicable', 'unfulfilled')
        THEN 'cancelled'::public.order_fulfillment_status
        ELSE fulfillment_status END,
      updated_at = now()
  WHERE id = p_order_id
    AND status = v_order.status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_CANCELLATION_CONFLICT';
  END IF;
  -- payment_status note: paid orders stay 'paid' until the refund SETTLES
  -- (f_settle_sale_order_refund flips to 'refunded') — money truth first.

  IF v_paid THEN
    INSERT INTO public.sale_order_refunds
      (order_id, user_id, refund_amount, currency_code, method, state, reason,
       refund_bank_name, refund_bank_account_number, refund_bank_account_name,
       refund_contact_phone, created_by_user_id, metadata)
    VALUES
      (p_order_id, v_order.user_id, v_refund_amount,
       coalesce(nullif(upper(v_order.currency_code), ''), 'THB'),
       'manual_transfer', 'pending', trim(p_reason),
       trim(p_refund_bank_name), trim(p_refund_bank_account_number),
       trim(p_refund_bank_account_name), trim(p_refund_contact_phone),
       p_actor_user_id,
       jsonb_build_object('cancelActorRole', p_actor_role,
                          'derivedFrom', CASE WHEN v_order.pos_paid_amount > 0
                                              THEN 'pos_paid_amount' ELSE 'grand_total' END))
    RETURNING * INTO v_refund;
  END IF;

  -- Ruling-3 stock boundary: auto-restore only while applied-and-unfulfilled.
  IF v_order.inventory_applied_at IS NOT NULL AND v_order.inventory_restored_at IS NULL THEN
    IF v_order.fulfillment_status IN ('not_applicable', 'unfulfilled') THEN
      v_restored := public.f_restore_order_inventory(p_order_id);
    ELSE
      v_restore_manual := TRUE;  -- refund flows; stock is manual adjustment
    END IF;
  END IF;

  -- D5 orphan closure: cancel manual payment requests whose items ALL target
  -- this order; leave multi-target requests open (counted for follow-up).
  -- Lock first (plain FOR UPDATE — no grouping), then classify: the item set
  -- is immutable (118), so the post-lock EXISTS test is race-safe.
  FOR v_req IN
    SELECT r.id
    FROM public.manual_payment_requests r
    WHERE r.status IN ('awaiting_payment', 'pending_review')
      AND EXISTS (
        SELECT 1 FROM public.manual_payment_request_items x
        WHERE x.payment_request_id = r.id
          AND x.target_type = 'sale_order' AND x.target_id = p_order_id)
    ORDER BY r.id
    FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.manual_payment_request_items y
      WHERE y.payment_request_id = v_req.id
        AND NOT (y.target_type = 'sale_order' AND y.target_id = p_order_id)
    ) THEN
      v_requests_left_open := v_requests_left_open + 1;
    ELSE
      UPDATE public.manual_payment_requests
      SET status = 'cancelled',
          admin_note = coalesce(admin_note || ' | ', '')
            || 'auto-cancelled: sale order ' || p_order_id::text || ' cancelled',
          updated_at = now()
      WHERE id = v_req.id;
      v_requests_closed := v_requests_closed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'alreadyCancelled', false,
    'orderId', p_order_id,
    'refund', to_jsonb(v_refund),
    'inventoryRestored', v_restored,
    'inventoryManualAdjustmentRequired', v_restore_manual,
    'paymentRequestsClosed', v_requests_closed,
    'paymentRequestsLeftOpen', v_requests_left_open
  );
END;
$$;
REVOKE ALL ON FUNCTION public.f_cancel_sale_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_cancel_sale_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- ── f_settle_sale_order_refund ──────────────────────────────
CREATE OR REPLACE FUNCTION public.f_settle_sale_order_refund(
  p_refund_id UUID,
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_outcome TEXT,                       -- 'settled' | 'failed'
  p_manual_transfer_reference TEXT DEFAULT NULL,
  p_slip_storage_bucket TEXT DEFAULT NULL,
  p_slip_storage_path TEXT DEFAULT NULL,
  p_failed_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_refund public.sale_order_refunds%ROWTYPE;
BEGIN
  IF p_actor_role NOT IN ('staff', 'super_admin') THEN
    RAISE EXCEPTION 'REFUND_ACTOR_ROLE_INVALID';
  END IF;
  IF p_outcome NOT IN ('settled', 'failed') THEN
    RAISE EXCEPTION 'REFUND_OUTCOME_INVALID';
  END IF;

  -- Annex-#7 pattern: unlocked read → lock ORDER first → lock refund.
  SELECT order_id INTO v_order_id FROM public.sale_order_refunds WHERE id = p_refund_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUND_NOT_FOUND';
  END IF;
  PERFORM 1 FROM public.orders WHERE id = v_order_id FOR UPDATE;
  SELECT * INTO v_refund FROM public.sale_order_refunds WHERE id = p_refund_id FOR UPDATE;

  IF v_refund.state = p_outcome THEN
    RETURN jsonb_build_object('ok', true, 'alreadyTerminal', true, 'refund', to_jsonb(v_refund));
  END IF;
  IF v_refund.state <> 'pending' THEN
    RAISE EXCEPTION 'REFUND_STATE_TERMINAL: %', v_refund.state;
  END IF;

  IF p_outcome = 'settled' THEN
    -- Evidence before settle: transfer reference + slip (sor_settled_evidence_chk backstop).
    IF NULLIF(trim(coalesce(p_manual_transfer_reference, '')), '') IS NULL
       OR NULLIF(trim(coalesce(p_slip_storage_path, '')), '') IS NULL THEN
      RAISE EXCEPTION 'REFUND_SETTLE_EVIDENCE_REQUIRED';
    END IF;
    UPDATE public.sale_order_refunds
    SET state = 'settled', settled_at = now(),
        manual_transfer_reference = trim(p_manual_transfer_reference),
        slip_storage_bucket = NULLIF(trim(coalesce(p_slip_storage_bucket, '')), ''),
        slip_storage_path = trim(p_slip_storage_path),
        settled_by_user_id = p_actor_user_id
    WHERE id = p_refund_id
    RETURNING * INTO v_refund;
    UPDATE public.orders SET payment_status = 'refunded', updated_at = now()
    WHERE id = v_order_id;
  ELSE
    IF NULLIF(trim(coalesce(p_failed_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'REFUND_FAILED_REASON_REQUIRED';
    END IF;
    UPDATE public.sale_order_refunds
    SET state = 'failed', failed_at = now(),
        failed_reason = trim(p_failed_reason),
        settled_by_user_id = p_actor_user_id
    WHERE id = p_refund_id
    RETURNING * INTO v_refund;
  END IF;

  RETURN jsonb_build_object('ok', true, 'alreadyTerminal', false, 'refund', to_jsonb(v_refund));
END;
$$;
REVOKE ALL ON FUNCTION public.f_settle_sale_order_refund(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_settle_sale_order_refund(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- ── Verification ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sor_settled_evidence_chk') THEN
    RAISE EXCEPTION 'MIG128_VERIFY_FAILED: settled-evidence CHECK missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'inventory_restored_at'
  ) THEN
    RAISE EXCEPTION 'MIG128_VERIFY_FAILED: orders.inventory_restored_at missing';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND p.proname IN ('f_restore_order_inventory', 'f_cancel_sale_order', 'f_settle_sale_order_refund')) <> 3 THEN
    RAISE EXCEPTION 'MIG128_VERIFY_FAILED: RPC set incomplete or not SECURITY DEFINER';
  END IF;
END $$;
