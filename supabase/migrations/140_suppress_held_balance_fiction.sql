-- ============================================================
-- 140_suppress_held_balance_fiction.sql
--
-- Scope:
--   * f_settle_rental_booking_return: suppress the settlement
--     collection/application ledger PAIR when v_held = 0. NOTHING ELSE.
--
-- Releases the §8.8 MERGE-BLOCKER (the held-balance fiction).
--
-- The fiction (accepted for 134, ruled ACCEPT option (i) at that gate):
--   when held = 0 and penalties > 0, the inherited 125 branch writes a
--   'settlement_additional_collection' + 'settlement_application' pair
--   that nets to zero but ASSERTS a collection that never happened
--   (under minimal launch the customer pays later via
--   f_confirm_settlement_payment, not at settlement).
--
-- The fix: gate BOTH events on v_held > 0.
--   * v_held = 0  <=> no deposit was ever held. Launch bookings never
--     collect a deposit (135 gates f_confirm_rental_booking_deposit), and
--     a picked_up booking reaching settlement still holds any real
--     deposit (pre-settlement release paths — cancel/no-show — terminate
--     the booking). So held = 0 at settlement is the truthful regime
--     discriminator: nothing to apply against, so the pair is fiction.
--   * v_held > 0  <=> a real deposit is held. 125's behavior is KEPT
--     byte-for-byte: apply the held balance, collect any shortfall in
--     cash, refund any surplus. All real money movement.
--   * The 'refund' branch is UNTOUCHED: v_refund is only > 0 when
--     v_held > v_net_charge, which already implies v_held > 0.
--   * The residue-0 invariant is UNTOUCHED: with the pair suppressed,
--     held stays 0 and 0 = 0 holds; with the pair fired (held > 0), the
--     collection/application/refund still net to 0 exactly as 125.
--
-- Delta vs 134 (5th generation 125->133->134->140): TWO conditions gain
-- 'v_held > 0 AND'. Every other line is byte-identical to 134.
-- ============================================================

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

  IF v_held > 0 AND v_additional > 0 THEN   -- [140] gate on held: no fiction at held=0
    INSERT INTO public.rental_held_balance_events
      (rental_booking_id, event_type, amount, currency_code, status,
       source_type, source_id, branch_id, staff_user_id)
    VALUES (p_booking_id, 'settlement_additional_collection', v_additional,
            'THB', 'posted', 'return_settlement', v_settlement_id::text,
            p_branch_id, p_staff_user_id);
  END IF;
  IF v_held > 0 AND v_applied > 0 THEN         -- [140] gate on held: no fiction at held=0
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

