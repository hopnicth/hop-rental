-- ============================================================
-- 134_return_charge_money_direction.sql
--
-- Scope:
--   * allocation_type widening: 'rental_charge', 'service_charge' (J-1).
--   * modl_operation_chk widening: settlement_payment_confirm /
--     settlement_payment_waive / settlement_state_migration_backfill (J-2).
--   * system_configs 'tax.vat' seed + fail-closed reader (J-5).
--   * f_settle_rental_booking_return: amount_due extended to
--     base rental + late days + penalties - discount - held (J-4), and
--     per-line payment_allocations rows (status 'pending').
--   * f_confirm_settlement_payment / f_waive_settlement_payment — the ONLY
--     writers of the 133 state row (133 design §7: never a direct UPDATE).
--   * Legacy backfill for pre-133 settlements (J-3).
--
-- Key design decisions:
--   * NO new money table — payment_allocations (068:361) already carries
--     direction/status/vat_treatment/net/vat/gross with a consistency CHECK.
--   * ZERO held-balance events written; 094 vocabulary UNTOUCHED (C4).
--   * Charge lines are written 'pending' at settlement and flipped
--     'confirmed' at payment: allocation before state flip, always.
--   * VAT treatment + rate come from system_configs; absent config RAISEs.
--   * KNOWN FICTION (ruled ACCEPT for 134): when held=0 and penalties>0 the
--     inherited 125 ledger branch writes a collection+application pair that
--     nets to zero but asserts a collection that has not happened. Migration
--     140 suppresses it and is a MERGE-BLOCKER — the fiction must not reach
--     staging.
-- ============================================================

-- ── A. allocation_type widening (J-1). Plain DROP: wrong name fails loudly.
ALTER TABLE public.payment_allocations
  DROP CONSTRAINT payment_allocations_allocation_type_check;
ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_allocation_type_check CHECK (allocation_type IN (
    'security_deposit', 'rental_advance', 'sale_payment', 'remaining_payment',
    'refund', 'penalty', 'damage_fee', 'late_fee', 'manual_adjustment',
    'rental_charge', 'service_charge'
  ));

-- ── B. modl_operation_chk widening (J-2 + backfill marker)
ALTER TABLE public.money_ops_decision_logs
  DROP CONSTRAINT modl_operation_chk;
ALTER TABLE public.money_ops_decision_logs
  ADD CONSTRAINT modl_operation_chk CHECK (operation IN (
    'company_cancel', 'late_cancel_forfeit', 'document_void',
    'sale_cancel_paid', 'refund_mark_refunded', 'manual_stock_adjustment',
    'settlement_zero_due_auto_paid',
    'settlement_payment_confirm', 'settlement_payment_waive',
    'settlement_state_migration_backfill'
  ));

-- ── C. VAT config seed (J-5). Idempotent; value is authoritative at runtime.
INSERT INTO public.system_configs (key, value, description)
VALUES ('tax.vat',
        jsonb_build_object('rate_percent', 7, 'treatment', 'vat_inclusive'),
        'Launch VAT: rate_percent + treatment (vat_inclusive|vat_exclusive). Read fail-closed by f_tax_vat_config(); absent row RAISEs.')
ON CONFLICT (key) DO NOTHING;

-- ── D. Fail-closed VAT config reader
CREATE OR REPLACE FUNCTION public.f_tax_vat_config()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg jsonb;
  v_rate numeric;
  v_treatment text;
BEGIN
  SELECT value INTO v_cfg FROM public.system_configs WHERE key = 'tax.vat';
  IF NOT FOUND OR v_cfg IS NULL THEN
    RAISE EXCEPTION 'TAX_VAT_CONFIG_MISSING';
  END IF;
  v_rate := (v_cfg->>'rate_percent')::numeric;
  v_treatment := v_cfg->>'treatment';
  IF v_rate IS NULL OR v_rate < 0 THEN
    RAISE EXCEPTION 'TAX_VAT_CONFIG_RATE_INVALID: %', v_cfg->>'rate_percent';
  END IF;
  IF v_treatment IS NULL OR v_treatment NOT IN ('vat_inclusive', 'vat_exclusive') THEN
    RAISE EXCEPTION 'TAX_VAT_CONFIG_TREATMENT_INVALID: %', coalesce(v_treatment, 'null');
  END IF;
  RETURN jsonb_build_object('rate_percent', v_rate, 'treatment', v_treatment);
END;
$$;
REVOKE ALL ON FUNCTION public.f_tax_vat_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_tax_vat_config() TO service_role;

-- ── E. Charge-line writer (internal helper; one allocation row per line)
CREATE OR REPLACE FUNCTION public.f_write_settlement_charge_line(
  p_booking_id uuid, p_settlement_id uuid, p_allocation_type text,
  p_gross numeric, p_branch_id text, p_staff_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg jsonb; v_rate numeric; v_treatment text;
  v_net numeric(12,2); v_vat numeric(12,2); v_gross numeric(12,2);
  v_id uuid;
BEGIN
  IF p_gross IS NULL OR p_gross <= 0 THEN
    RETURN NULL;   -- zero/absent lines are simply not written
  END IF;
  v_cfg := public.f_tax_vat_config();
  v_rate := (v_cfg->>'rate_percent')::numeric;
  v_treatment := v_cfg->>'treatment';

  IF v_treatment = 'vat_inclusive' THEN
    v_gross := round(p_gross, 2);
    v_net   := round(p_gross / (1 + v_rate / 100.0), 2);
    v_vat   := v_gross - v_net;
  ELSE  -- vat_exclusive: quoted figure is net, VAT added on top
    v_net   := round(p_gross, 2);
    v_vat   := round(p_gross * v_rate / 100.0, 2);
    v_gross := v_net + v_vat;
  END IF;

  INSERT INTO public.payment_allocations (
    source_type, source_id, branch_id, direction, allocation_type, status,
    vat_treatment, net_amount, vat_amount, gross_amount, currency_code,
    staff_user_id, idempotency_key, metadata
  ) VALUES (
    'rental_booking_settlement', p_settlement_id::text, p_branch_id, 'in',
    p_allocation_type, 'pending', v_treatment, v_net, v_vat, v_gross, 'THB',
    p_staff_user_id,
    'settlement-' || p_settlement_id::text || '-' || p_allocation_type,
    jsonb_build_object('bookingId', p_booking_id, 'vatRatePercent', v_rate)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.f_write_settlement_charge_line(uuid, uuid, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_write_settlement_charge_line(uuid, uuid, text, numeric, text, uuid) TO service_role;

-- ── F. f_settle_rental_booking_return — CREATE OR REPLACE.
--      Signature UNCHANGED (10 args). Delta vs 133: late-days derivation,
--      base-rental term in amount_due, charge-line writes. The 125 ledger
--      branch and the residue-0 invariant are BYTE-UNCHANGED (FINDING A).
CREATE OR REPLACE FUNCTION public.f_settle_rental_booking_return(
  p_booking_id              uuid,
  p_penalty_lines           jsonb,
  p_special_discount_amount numeric,
  p_special_discount_note   text,
  p_customer_signature_path text,
  p_staff_signature_path    text,
  p_slip_evidence_ref       text,
  p_refund_bank_account_ref text,
  p_staff_user_id           uuid,
  p_branch_id               text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking       public.rental_bookings%ROWTYPE;
  v_line          jsonb;
  v_held          numeric(12,2);
  v_penalty_total numeric(12,2);
  v_net_charge    numeric(12,2);
  v_applied       numeric(12,2);
  v_refund        numeric(12,2);
  v_additional    numeric(12,2);
  v_settlement_id uuid;
  v_check         numeric(12,2);
  v_payment_state_id uuid;
  v_state            text;
  v_paid_at          timestamptz;
  v_confirmed_by     uuid;
  v_return_date      date;               -- [134 NEW]
  v_late_days        integer;            -- [134 NEW]
  v_base_rental      numeric(12,2);      -- [134 NEW]
  v_late_charge      numeric(12,2);      -- [134 NEW]
  v_penalty_net      numeric(12,2);      -- [134 NEW]
  v_amount_due       numeric(12,2);      -- [134 NEW]
BEGIN
  IF p_staff_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_ACTOR_REQUIRED';
  END IF;

  SELECT * INTO v_booking FROM public.rental_bookings
   WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_BOOKING_NOT_FOUND';
  END IF;
  IF v_booking.status <> 'picked_up' THEN
    RAISE EXCEPTION 'SETTLEMENT_BOOKING_NOT_PICKED_UP';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rental_booking_settlements WHERE booking_id = p_booking_id) THEN
    RAISE EXCEPTION 'SETTLEMENT_ALREADY_EXISTS';
  END IF;

  IF p_penalty_lines IS NULL OR jsonb_typeof(p_penalty_lines) <> 'array' THEN
    RAISE EXCEPTION 'SETTLEMENT_PENALTY_LINES_INVALID';
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_penalty_lines) LOOP
    IF (v_line->>'amount') IS NULL OR (v_line->>'amount')::numeric <= 0
       OR COALESCE(trim(v_line->>'note'), '') = '' THEN
      RAISE EXCEPTION 'SETTLEMENT_PENALTY_LINE_INVALID: %', v_line;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(
    CASE WHEN event_type IN ('booking_deposit_collection',
                             'pickup_held_balance_collection',
                             'same_day_held_balance_collection',
                             'remaining_security_deposit_collection',
                             'settlement_additional_collection')
         THEN amount
         ELSE -amount END), 0)
    INTO v_held
    FROM public.rental_held_balance_events
   WHERE rental_booking_id = p_booking_id AND status = 'posted';
  IF v_held < 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_LEDGER_NEGATIVE_HELD: %', v_held;
  END IF;

  v_penalty_total := public.f_penalty_lines_total(p_penalty_lines);
  IF COALESCE(p_special_discount_amount, 0) < 0
     OR COALESCE(p_special_discount_amount, 0) > v_penalty_total THEN
    RAISE EXCEPTION 'SETTLEMENT_DISCOUNT_INVALID';
  END IF;

  v_net_charge := v_penalty_total - COALESCE(p_special_discount_amount, 0);
  v_applied    := v_net_charge;
  IF v_net_charge <= v_held THEN
    v_refund     := v_held - v_net_charge;
    v_additional := 0;
  ELSE
    v_refund     := 0;
    v_additional := v_net_charge - v_held;
  END IF;

  INSERT INTO public.rental_booking_settlements (
    booking_id, held_total, penalty_lines,
    special_discount_amount, special_discount_note,
    settlement_applied_amount, refund_amount, additional_collection_amount,
    customer_signature_path, staff_signature_path,
    slip_evidence_ref, refund_bank_account_ref,
    created_by_user_id, branch_id
  ) VALUES (
    p_booking_id, v_held, p_penalty_lines,
    COALESCE(p_special_discount_amount, 0), p_special_discount_note,
    v_applied, v_refund, v_additional,
    p_customer_signature_path, p_staff_signature_path,
    p_slip_evidence_ref, p_refund_bank_account_ref,
    p_staff_user_id, p_branch_id
  ) RETURNING id INTO v_settlement_id;

  -- ═══ [134 NEW BLOCK — START] ═══════════════════════════════════════
  -- Base rental + late days, ALL derived from the LOCKED booking row.
  -- Every anomaly RAISEs; nothing silently defaults.
  IF v_booking.pricing_model IS DISTINCT FROM 'daily'::public.rental_pricing_model THEN
    RAISE EXCEPTION 'SETTLEMENT_PRICING_MODEL_UNSUPPORTED: %', v_booking.pricing_model;
  END IF;
  IF v_booking.rental_total IS NULL OR v_booking.rental_total < 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_RENTAL_TOTAL_INVALID';
  END IF;
  IF v_booking.start_date IS NULL OR v_booking.end_date IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_BOOKING_DATES_MISSING';
  END IF;
  -- DB convention: end_date is EXCLUSIVE, so rental_days = end - start.
  -- A booking whose own fields disagree is corrupt — fail loudly rather
  -- than bill against an ambiguous boundary (BACKLOG T6 incl/excl flag).
  IF v_booking.rental_days IS DISTINCT FROM (v_booking.end_date - v_booking.start_date) THEN
    RAISE EXCEPTION 'SETTLEMENT_BOOKING_DATE_FIELDS_INCONSISTENT: rental_days=% end-start=%',
      v_booking.rental_days, (v_booking.end_date - v_booking.start_date);
  END IF;

  v_base_rental := round(v_booking.rental_total, 2);
  v_return_date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_late_days   := GREATEST(0, v_return_date - v_booking.end_date);

  IF v_late_days > 0 THEN
    IF v_booking.daily_rate IS NULL OR v_booking.daily_rate <= 0 THEN
      RAISE EXCEPTION 'SETTLEMENT_DAILY_RATE_INVALID_FOR_LATE_DAYS';
    END IF;
    v_late_charge := round(v_booking.daily_rate * v_late_days, 2);
  ELSE
    v_late_charge := 0;
  END IF;

  v_penalty_net := v_net_charge;   -- penalties minus discount (bounded above)
  v_amount_due  := round(v_base_rental + v_late_charge + v_penalty_net - v_held, 2);
  IF v_amount_due < 0 THEN
    v_amount_due := 0;             -- held exceeds charges; refund side handled by 125 math
  END IF;

  -- Charge lines: one allocation row per non-zero component, status 'pending'.
  PERFORM public.f_write_settlement_charge_line(p_booking_id, v_settlement_id, 'rental_charge',  v_base_rental, p_branch_id, p_staff_user_id);
  PERFORM public.f_write_settlement_charge_line(p_booking_id, v_settlement_id, 'late_fee',       v_late_charge, p_branch_id, p_staff_user_id);
  PERFORM public.f_write_settlement_charge_line(p_booking_id, v_settlement_id, 'penalty',        v_penalty_net, p_branch_id, p_staff_user_id);

  IF v_amount_due = 0 THEN
    v_state := 'paid'; v_paid_at := now(); v_confirmed_by := p_staff_user_id;
  ELSE
    v_state := 'awaiting_payment'; v_paid_at := NULL; v_confirmed_by := NULL;
  END IF;

  INSERT INTO public.rental_settlement_payment_states (
    settlement_id, booking_id, state, amount_due, amount_paid,
    currency_code, paid_at, confirmed_by_user_id
  ) VALUES (
    v_settlement_id, p_booking_id, v_state, v_amount_due, 0,
    'THB', v_paid_at, v_confirmed_by
  ) RETURNING id INTO v_payment_state_id;

  IF v_state = 'paid' THEN
    INSERT INTO public.money_ops_decision_logs
      (operation, decision, actor_user_id, entity_type, entity_id, amount, currency_code)
    VALUES ('settlement_zero_due_auto_paid', 'allowed', p_staff_user_id,
            'rental_booking', p_booking_id, 0, 'THB');
  END IF;
  -- ═══ [134 NEW BLOCK — END] ═════════════════════════════════════════

  IF v_additional > 0 THEN
    INSERT INTO public.rental_held_balance_events
      (rental_booking_id, event_type, amount, currency_code, status,
       source_type, source_id, branch_id, staff_user_id)
    VALUES (p_booking_id, 'settlement_additional_collection', v_additional,
            'THB', 'posted', 'return_settlement', v_settlement_id::text,
            p_branch_id, p_staff_user_id);
  END IF;
  IF v_applied > 0 THEN
    INSERT INTO public.rental_held_balance_events
      (rental_booking_id, event_type, amount, currency_code, status,
       source_type, source_id, branch_id, staff_user_id)
    VALUES (p_booking_id, 'settlement_application', v_applied,
            'THB', 'posted', 'return_settlement', v_settlement_id::text,
            p_branch_id, p_staff_user_id);
  END IF;
  IF v_refund > 0 THEN
    INSERT INTO public.rental_held_balance_events
      (rental_booking_id, event_type, amount, currency_code, status,
       source_type, source_id, branch_id, staff_user_id)
    VALUES (p_booking_id, 'refund', v_refund,
            'THB', 'posted', 'return_settlement', v_settlement_id::text,
            p_branch_id, p_staff_user_id);
  END IF;

  SELECT COALESCE(SUM(
    CASE WHEN event_type IN ('booking_deposit_collection',
                             'pickup_held_balance_collection',
                             'same_day_held_balance_collection',
                             'remaining_security_deposit_collection',
                             'settlement_additional_collection')
         THEN amount
         ELSE -amount END), 0)
    INTO v_check
    FROM public.rental_held_balance_events
   WHERE rental_booking_id = p_booking_id AND status = 'posted';
  IF v_check <> 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_INVARIANT_VIOLATION: residue %', v_check;
  END IF;

  RETURN jsonb_build_object(
    'settlement_id', v_settlement_id,
    'held_total', v_held,
    'penalty_total', v_penalty_total,
    'special_discount_amount', COALESCE(p_special_discount_amount, 0),
    'settlement_applied_amount', v_applied,
    'refund_amount', v_refund,
    'additional_collection_amount', v_additional,
    'payment_state_id', v_payment_state_id,
    'payment_state', v_state,
    'base_rental_charge', v_base_rental,      -- [134 NEW]
    'late_days', v_late_days,                 -- [134 NEW]
    'late_day_charge', v_late_charge,         -- [134 NEW]
    'amount_due', v_amount_due                -- [134 NEW]
  );
END;
$$;
REVOKE ALL ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text) TO service_role;

-- ── G. Payment confirmation — the ONLY writer of state -> 'paid'
CREATE OR REPLACE FUNCTION public.f_confirm_settlement_payment(
  p_booking_id        uuid,
  p_amount_paid       numeric,
  p_payment_method    text,
  p_payment_reference text,
  p_slip_evidence_ref text,
  p_actor_user_id     uuid,
  p_actor_role        text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.rental_bookings%ROWTYPE;
  v_state   public.rental_settlement_payment_states%ROWTYPE;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_ACTOR_REQUIRED';
  END IF;
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('staff', 'super_admin') THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_ACTOR_ROLE_INVALID';
  END IF;
  IF NULLIF(trim(coalesce(p_payment_method, '')), '') IS NULL
     OR NULLIF(trim(coalesce(p_payment_reference, '')), '') IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_EVIDENCE_REQUIRED';
  END IF;
  IF lower(trim(p_payment_method)) <> 'cash'
     AND NULLIF(trim(coalesce(p_slip_evidence_ref, '')), '') IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_SLIP_REQUIRED';
  END IF;

  -- BOOKING FIRST (standing lock convention), then the state row.
  SELECT * INTO v_booking FROM public.rental_bookings
   WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_BOOKING_NOT_FOUND';
  END IF;

  SELECT * INTO v_state FROM public.rental_settlement_payment_states
   WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_STATE_NOT_FOUND';
  END IF;
  IF v_state.state <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_STATE_NOT_AWAITING: %', v_state.state;
  END IF;
  IF p_amount_paid IS NULL OR p_amount_paid < v_state.amount_due THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INSUFFICIENT: due % paid %',
      v_state.amount_due, coalesce(p_amount_paid, 0);
  END IF;

  -- MONEY BEFORE STATE: confirm the charge lines first.
  UPDATE public.payment_allocations
     SET status = 'confirmed',
         payment_method = trim(p_payment_method),
         payment_reference = trim(p_payment_reference),
         proof_storage_path = NULLIF(trim(coalesce(p_slip_evidence_ref, '')), ''),
         allocated_at = now(),
         staff_user_id = p_actor_user_id
   WHERE source_type = 'rental_booking_settlement'
     AND source_id = v_state.settlement_id::text
     AND status = 'pending';

  UPDATE public.rental_settlement_payment_states
     SET state = 'paid',
         amount_paid = p_amount_paid,
         paid_at = now(),
         confirmed_by_user_id = p_actor_user_id,
         payment_method = trim(p_payment_method),
         payment_reference = trim(p_payment_reference),
         slip_evidence_ref = NULLIF(trim(coalesce(p_slip_evidence_ref, '')), '')
   WHERE id = v_state.id AND state = 'awaiting_payment'
  RETURNING * INTO v_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_STATE_CONFLICT';
  END IF;

  INSERT INTO public.money_ops_decision_logs
    (operation, decision, actor_user_id, actor_role, entity_type, entity_id, amount, currency_code)
  VALUES ('settlement_payment_confirm', 'allowed', p_actor_user_id, p_actor_role,
          'rental_booking', p_booking_id, p_amount_paid, 'THB');

  RETURN jsonb_build_object('ok', true, 'state', v_state.state,
                            'amount_due', v_state.amount_due,
                            'amount_paid', v_state.amount_paid);
END;
$$;
REVOKE ALL ON FUNCTION public.f_confirm_settlement_payment(uuid, numeric, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_confirm_settlement_payment(uuid, numeric, text, text, text, uuid, text) TO service_role;

-- ── H. Waiver — super_admin ONLY, §F inversion (denial logged before refusal)
CREATE OR REPLACE FUNCTION public.f_waive_settlement_payment(
  p_booking_id    uuid,
  p_reason        text,
  p_actor_user_id uuid,
  p_actor_role    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.rental_bookings%ROWTYPE;
  v_state   public.rental_settlement_payment_states%ROWTYPE;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_WAIVE_ACTOR_REQUIRED';
  END IF;
  IF p_actor_role IS DISTINCT FROM 'super_admin' THEN
    INSERT INTO public.money_ops_decision_logs
      (operation, decision, denial_reason, actor_user_id, actor_role, entity_type, entity_id)
    VALUES ('settlement_payment_waive', 'denied', 'not_super_admin',
            p_actor_user_id, p_actor_role, 'rental_booking', p_booking_id);
    RAISE EXCEPTION 'SETTLEMENT_WAIVE_SUPER_ADMIN_ONLY';
  END IF;
  IF NULLIF(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_WAIVE_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_booking FROM public.rental_bookings
   WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_WAIVE_BOOKING_NOT_FOUND';
  END IF;

  SELECT * INTO v_state FROM public.rental_settlement_payment_states
   WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_WAIVE_STATE_NOT_FOUND';
  END IF;
  IF v_state.state <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'SETTLEMENT_WAIVE_STATE_NOT_AWAITING: %', v_state.state;
  END IF;

  -- No money moved: the pending charge lines are cancelled, not confirmed.
  UPDATE public.payment_allocations
     SET status = 'cancelled', allocated_at = now(), staff_user_id = p_actor_user_id
   WHERE source_type = 'rental_booking_settlement'
     AND source_id = v_state.settlement_id::text
     AND status = 'pending';

  UPDATE public.rental_settlement_payment_states
     SET state = 'waived', waived_at = now(),
         waived_by_user_id = p_actor_user_id, waive_reason = trim(p_reason)
   WHERE id = v_state.id AND state = 'awaiting_payment'
  RETURNING * INTO v_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_WAIVE_STATE_CONFLICT';
  END IF;

  INSERT INTO public.money_ops_decision_logs
    (operation, decision, actor_user_id, actor_role, entity_type, entity_id, amount, currency_code)
  VALUES ('settlement_payment_waive', 'allowed', p_actor_user_id, p_actor_role,
          'rental_booking', p_booking_id, v_state.amount_due, 'THB');

  RETURN jsonb_build_object('ok', true, 'state', v_state.state);
END;
$$;
REVOKE ALL ON FUNCTION public.f_waive_settlement_payment(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_waive_settlement_payment(uuid, text, uuid, text) TO service_role;

-- ── I. Legacy backfill (J-3). Idempotent via UNIQUE(settlement_id).
DO $backfill$
DECLARE
  r RECORD;
  v_id uuid;
BEGIN
  FOR r IN
    SELECT s.id, s.booking_id, s.additional_collection_amount, s.created_at,
           s.created_by_user_id, s.currency_code
      FROM public.rental_booking_settlements s
      LEFT JOIN public.rental_settlement_payment_states st ON st.settlement_id = s.id
     WHERE st.id IS NULL
  LOOP
    INSERT INTO public.rental_settlement_payment_states (
      settlement_id, booking_id, state, amount_due, amount_paid,
      currency_code, paid_at, confirmed_by_user_id
    ) VALUES (
      r.id, r.booking_id, 'paid',
      COALESCE(r.additional_collection_amount, 0),
      COALESCE(r.additional_collection_amount, 0),
      COALESCE(r.currency_code, 'THB'), r.created_at, r.created_by_user_id
    )
    ON CONFLICT (settlement_id) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      INSERT INTO public.money_ops_decision_logs
        (operation, decision, actor_user_id, entity_type, entity_id, amount, currency_code)
      VALUES ('settlement_state_migration_backfill', 'allowed', r.created_by_user_id,
              'rental_booking', r.booking_id,
              COALESCE(r.additional_collection_amount, 0), COALESCE(r.currency_code, 'THB'));
    END IF;
  END LOOP;
END;
$backfill$;
