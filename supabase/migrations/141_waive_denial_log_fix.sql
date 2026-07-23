-- ============================================================
-- 141_waive_denial_log_fix.sql
--
-- Scope:
--   * f_waive_settlement_payment: remove the UNREACHABLE denial INSERT.
--     NOTHING ELSE. §8.9 half 1.
--
-- The defect (found at the 134 read-back gate): the function wrote a
-- 'settlement_payment_waive'/'denied' row to money_ops_decision_logs and
-- then RAISE'd. The RAISE aborts the transaction and rolls the INSERT
-- back — the denial row can NEVER persist (proven: count before=0, call
-- as staff -> ERROR, count after=0). Dead code that fakes audit coverage.
--
-- The fix: delete the unreachable INSERT. Denial logging is the WRAPPER's
-- duty (the 129/131 pattern — e.g. 131:24 "§F operation='document_void'
-- is logged by the WRAPPER"; companyCancelRentalBooking logs the 129
-- denial in TypeScript). §8.9 half 2 (the waive endpoint writing the
-- denial row before the 403) is Phase 1.
--
-- Standing rule (§8.9): no plpgsql function may log a denial and then
-- RAISE in the same transaction. Refusal is the RPC's job; the audit
-- trail is the caller's.
--
-- Delta vs 134: the 4-line denial INSERT/VALUES block is removed and
-- replaced by a comment. The SUCCESS log (allowed) and every other line
-- are byte-identical to 134. Extracted mechanically (the standing method
-- for this function family).
-- ============================================================

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
    -- Denial logging is the WRAPPER's duty (129/131 pattern): an in-function
    -- INSERT before RAISE cannot persist — the RAISE rolls it back (§8.9).
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
