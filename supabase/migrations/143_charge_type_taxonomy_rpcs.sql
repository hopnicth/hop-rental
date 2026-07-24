-- ============================================================
-- 143_charge_type_taxonomy_rpcs.sql
--
-- Scope (RPC half of the M-2 split; schema half = 142):
--   * f_settle_rental_booking_return — 7th generation. SIGNATURE CHANGE
--     (R-A): the 10-arg form is DROPPED and a 13-arg form created.
--   * f_write_settlement_charge_line — +p_charge_type (signature change).
--   * f_confirm_settlement_payment  — +pending_review block.
--   * f_assert_tax_document_issuable — +pending_review block.
--
-- Key design decisions:
--   * OPTION A (ruling 1): launch does NOT route charges through
--     penalty_lines. Typed staff-charge lines travel their own channel;
--     penalty_lines stays EMPTY under launch, so the settlement row is
--     naturally 0/0/0 and NO composition CHECK is touched. This RELEASES
--     the §8.12 merge-blocker.
--   * SIGNATURE CHANGE, deliberately (R-A): carrying typed lines inside
--     the existing penalty_lines jsonb would make ONE parameter mean two
--     regime-dependent things — the exact ambiguity the charge taxonomy
--     was ratified to kill. The old 10-arg signature is DROPPED by full
--     name (fail-loud) so exactly ONE signature exists afterwards.
--     MERGE-BLOCKER: the TS settle wrapper must ship the new call before
--     feature/t-launch merges.
--   * IN-RPC ROLE LOOKUP (R-B): the discount tier reads platform_role from
--     public.users inside the same transaction. The tier is a PRIVILEGE
--     decision, so it may never rest on a caller claim. This differs from
--     134's confirm/waive, which take p_actor_role for AUDIT ATTRIBUTION
--     only. The modl log records the LOOKED-UP role.
--   * CHANNEL SEPARATION: launch and deposit regimes never share an input.
--     Launch refuses penalty_lines; deposit regime refuses staff-charge
--     lines and the launch discount. Deposit behavior is 125-identical.
--   * DISCOUNT (ruling 5): rental base = rental_charge + rental_extension
--     ONLY (service lines are never discounted); staff <= 20%, super_admin
--     <= 50%, >50% refused outright with no override; mandatory note;
--     logged to modl on the SUCCESS path only (§8.9 — an in-function log
--     before RAISE cannot persist, so denial logging is wrapper duty).
--   * STAFF CHARGE CAP (M-1): 5000 THB per line, refuse-outright, no
--     override. Split larger charges into audit-visible lines.
--   * rental_extension (ruling 2) labels the computed late-day term —
--     continued rental benefit, NOT a fixed penalty. Fixed-amount late
--     penalties are not offered at launch.
--   * pending_review (M-4) BLOCKS payment confirmation AND tax-document
--     issuance. The tax block lives in the 133 assert, which the 139
--     BEFORE INSERT trigger already calls un-bypassably — no new trigger.
--     Launch-unreachable scaffolding today (nothing produces the state).
--   * DISCOUNT DISPLAY (M-3/R-C): the launch discount is NOT stored on the
--     settlement row (special_discount_amount + its CHECK are deposit-era
--     algebra, untouched). Documents derive it as
--       discount = SUM(gross of charge lines) - amount_due
--     so STM/TIR remain projections of the money rows. No negative
--     allocation rows (they would violate the non-negative CHECKs).
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- 1. Charge-line writer: +p_charge_type (signature change)
-- ══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.f_write_settlement_charge_line(uuid, uuid, text, numeric, text, uuid);

CREATE FUNCTION public.f_write_settlement_charge_line(
  p_booking_id uuid, p_settlement_id uuid, p_allocation_type text,
  p_gross numeric, p_branch_id text, p_staff_user_id uuid,
  p_charge_type text DEFAULT NULL                 -- [143 NEW] tax substance
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
    staff_user_id, idempotency_key, metadata, charge_type
  ) VALUES (
    'rental_booking_settlement', p_settlement_id::text, p_branch_id, 'in',
    p_allocation_type, 'pending', v_treatment, v_net, v_vat, v_gross, 'THB',
    p_staff_user_id,
    'settlement-' || p_settlement_id::text || '-' || p_allocation_type
      || coalesce('-' || p_charge_type, ''),                  -- [143] key includes type
    jsonb_build_object('bookingId', p_booking_id, 'vatRatePercent', v_rate),
    p_charge_type                                             -- [143 NEW]
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.f_write_settlement_charge_line(uuid, uuid, text, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_write_settlement_charge_line(uuid, uuid, text, numeric, text, uuid, text) TO service_role;

-- ══════════════════════════════════════════════════════════════
-- 2. f_settle_rental_booking_return — 7th generation, 13 args.
--    DROP names the full old signature so a drift fails loudly.
-- ══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text);

CREATE FUNCTION public.f_settle_rental_booking_return(
  p_booking_id              uuid,
  p_penalty_lines           jsonb,
  p_special_discount_amount numeric,
  p_special_discount_note   text,
  p_customer_signature_path text,
  p_staff_signature_path    text,
  p_slip_evidence_ref       text,
  p_refund_bank_account_ref text,
  p_staff_user_id           uuid,
  p_branch_id               text DEFAULT NULL,
  p_staff_charge_lines      jsonb DEFAULT '[]'::jsonb,   -- [143 NEW]
  p_discount_amount         numeric DEFAULT 0,           -- [143 NEW]
  p_discount_note           text DEFAULT NULL            -- [143 NEW]
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
  v_deposits_on      boolean;            -- [143 NEW]
  v_actor_role       text;               -- [143 NEW]
  v_staff_line       jsonb;              -- [143 NEW]
  v_staff_total      numeric(12,2);      -- [143 NEW]
  v_ct               text;               -- [143 NEW]
  v_amt              numeric(12,2);      -- [143 NEW]
  v_alloc_type       text;               -- [143 NEW]
  v_rental_base      numeric(12,2);      -- [143 NEW]
  v_discount         numeric(12,2);      -- [143 NEW]
  v_max_pct          numeric;            -- [143 NEW]
BEGIN
  IF p_staff_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_ACTOR_REQUIRED';
  END IF;

  -- ═══ [143 NEW] regime discrimination + in-RPC role lookup ═══════════
  -- The tier decision uses the LOOKED-UP role, never a caller claim (R-B).
  -- This differs from 134's confirm/waive, which take p_actor_role for
  -- AUDIT ATTRIBUTION; here the role is a PRIVILEGE decision, so it is
  -- read from the database inside the same transaction.
  v_deposits_on := public.f_deposits_enabled();
  SELECT platform_role INTO v_actor_role FROM public.users WHERE id = p_staff_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_ACTOR_NOT_FOUND';
  END IF;

  -- Channel separation: the two regimes never share an input channel.
  IF NOT v_deposits_on THEN
    IF p_penalty_lines IS NOT NULL AND jsonb_array_length(p_penalty_lines) > 0 THEN
      RAISE EXCEPTION 'PENALTY_LINES_NOT_ACCEPTED_AT_LAUNCH';
    END IF;
  ELSE
    IF p_staff_charge_lines IS NOT NULL AND jsonb_array_length(p_staff_charge_lines) > 0 THEN
      RAISE EXCEPTION 'STAFF_CHARGE_LINES_NOT_ACCEPTED_IN_DEPOSIT_REGIME';
    END IF;
    IF COALESCE(p_discount_amount, 0) <> 0 THEN
      RAISE EXCEPTION 'LAUNCH_DISCOUNT_NOT_ACCEPTED_IN_DEPOSIT_REGIME';
    END IF;
  END IF;

  -- Typed staff-charge lines: {charge_type, amount, note}. Free-form (no
  -- catalogue yet) but charge_type + note are MANDATORY; cap 5000/line,
  -- refuse-outright with no override (M-1).
  IF p_staff_charge_lines IS NULL OR jsonb_typeof(p_staff_charge_lines) <> 'array' THEN
    RAISE EXCEPTION 'STAFF_CHARGE_LINES_INVALID';
  END IF;
  v_staff_total := 0;
  FOR v_staff_line IN SELECT * FROM jsonb_array_elements(p_staff_charge_lines) LOOP
    v_ct  := v_staff_line->>'charge_type';
    v_amt := (v_staff_line->>'amount')::numeric;
    IF v_ct IS NULL OR COALESCE(trim(v_staff_line->>'note'), '') = '' THEN
      RAISE EXCEPTION 'STAFF_CHARGE_LINE_INVALID: %', v_staff_line;
    END IF;
    IF v_ct IN ('actual_damage', 'contractual_penalty') THEN
      RAISE EXCEPTION 'CHARGE_TYPE_DISABLED_FOR_LAUNCH: %', v_ct;
    END IF;
    IF v_ct = 'pending_review' THEN
      RAISE EXCEPTION 'CHARGE_TYPE_NOT_SETTABLE: %', v_ct;
    END IF;
    IF v_ct NOT IN ('rental_charge', 'rental_extension', 'taxable_service_charge') THEN
      RAISE EXCEPTION 'CHARGE_TYPE_UNKNOWN: %', v_ct;
    END IF;
    IF v_amt IS NULL OR v_amt <= 0 THEN
      RAISE EXCEPTION 'STAFF_CHARGE_AMOUNT_INVALID: %', v_amt;
    END IF;
    IF v_amt > 5000 THEN
      RAISE EXCEPTION 'STAFF_CHARGE_EXCEEDS_CAP: % (max 5000 per line)', v_amt;
    END IF;
    v_staff_total := v_staff_total + v_amt;
  END LOOP;
  -- ═══ [143 NEW END] ═════════════════════════════════════════════════

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

  -- ═══ [143 NEW] two-tier discount, rental-base only ═════════════════
  -- Base = rental_charge + rental_extension ONLY. Service lines are NEVER
  -- discounted. Tier authority comes from the LOOKED-UP role (R-B).
  v_rental_base := round(v_base_rental + v_late_charge, 2);
  v_discount    := round(COALESCE(p_discount_amount, 0), 2);
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'DISCOUNT_NEGATIVE';
  END IF;
  IF v_discount > 0 THEN
    IF COALESCE(trim(p_discount_note), '') = '' THEN
      RAISE EXCEPTION 'DISCOUNT_NOTE_REQUIRED';
    END IF;
    IF v_rental_base <= 0 THEN
      RAISE EXCEPTION 'DISCOUNT_WITHOUT_RENTAL_BASE';
    END IF;
    IF v_discount > round(0.50 * v_rental_base, 2) THEN
      RAISE EXCEPTION 'DISCOUNT_EXCEEDS_MAX: % of base % (max 50%%)', v_discount, v_rental_base;
    END IF;
    v_max_pct := CASE WHEN v_actor_role = 'super_admin' THEN 0.50 ELSE 0.20 END;
    IF v_discount > round(v_max_pct * v_rental_base, 2) THEN
      RAISE EXCEPTION 'DISCOUNT_REQUIRES_SUPER_ADMIN: % exceeds % percent of base %',
        v_discount, (v_max_pct * 100), v_rental_base;
    END IF;
  END IF;
  -- ═══ [143 NEW END] ═════════════════════════════════════════════════

  v_amount_due  := round(v_base_rental + v_late_charge + v_penalty_net
                         + v_staff_total - v_discount - v_held, 2);
  IF v_amount_due < 0 THEN
    v_amount_due := 0;             -- held exceeds charges; refund side handled by 125 math
  END IF;

  -- Charge lines: one allocation row per non-zero component, status 'pending'.
  -- [143] charge lines now carry the tax-substance charge_type (142 column).
  -- Base rental = rental_charge; the computed late-day term = rental_extension
  -- (continued rental benefit, NOT a fixed penalty — ruling 2).
  PERFORM public.f_write_settlement_charge_line(p_booking_id, v_settlement_id, 'rental_charge', v_base_rental, p_branch_id, p_staff_user_id, 'rental_charge');
  PERFORM public.f_write_settlement_charge_line(p_booking_id, v_settlement_id, 'late_fee',      v_late_charge, p_branch_id, p_staff_user_id, 'rental_extension');
  -- Deposit-regime penalties keep the legacy (untyped) line.
  PERFORM public.f_write_settlement_charge_line(p_booking_id, v_settlement_id, 'penalty',       v_penalty_net, p_branch_id, p_staff_user_id, NULL);
  -- [143 NEW] one allocation row per typed staff-charge line.
  FOR v_staff_line IN SELECT * FROM jsonb_array_elements(p_staff_charge_lines) LOOP
    v_ct  := v_staff_line->>'charge_type';
    v_amt := (v_staff_line->>'amount')::numeric;
    v_alloc_type := CASE v_ct
                      WHEN 'rental_charge'          THEN 'rental_charge'
                      WHEN 'rental_extension'       THEN 'late_fee'
                      WHEN 'taxable_service_charge' THEN 'service_charge'
                    END;
    PERFORM public.f_write_settlement_charge_line(p_booking_id, v_settlement_id, v_alloc_type, v_amt, p_branch_id, p_staff_user_id, v_ct);
  END LOOP;

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

  -- [143 NEW] §F success log for a granted discount. SUCCESS PATH ONLY —
  -- a refused discount RAISEs and the denial is the WRAPPER's duty (§8.9:
  -- an in-function log before RAISE cannot persist). actor_role records the
  -- LOOKED-UP role, so the super_admin 20-50%% tier logs its authority use.
  IF v_discount > 0 THEN
    INSERT INTO public.money_ops_decision_logs
      (operation, decision, actor_user_id, actor_role, entity_type, entity_id, amount, currency_code)
    VALUES ('settlement_discount_granted', 'allowed', p_staff_user_id, v_actor_role,
            'rental_booking', p_booking_id, v_discount, 'THB');
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
    'amount_due', v_amount_due,               -- [134 NEW]
    'staff_charge_total', v_staff_total,      -- [143 NEW]
    'discount_amount', v_discount,            -- [143 NEW]
    'rental_base', v_rental_base              -- [143 NEW]
  );
END;
$$;
REVOKE ALL ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text, jsonb, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text, jsonb, numeric, text) TO service_role;

-- ══════════════════════════════════════════════════════════════
-- 3. f_confirm_settlement_payment — +pending_review block
-- ══════════════════════════════════════════════════════════════
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
  -- [143 NEW] fail-closed classification: an unclassified charge blocks money.
  IF EXISTS (SELECT 1 FROM public.payment_allocations
              WHERE source_type = 'rental_booking_settlement'
                AND source_id = v_state.settlement_id::text
                AND charge_type = 'pending_review') THEN
    RAISE EXCEPTION 'SETTLEMENT_HAS_PENDING_REVIEW_CHARGES';
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

-- ══════════════════════════════════════════════════════════════
-- 4. f_assert_tax_document_issuable — +pending_review block
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.f_assert_tax_document_issuable(
  p_booking_id    uuid,
  p_document_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
BEGIN
  -- Non-tax documents are unaffected: STM, BDC, BDR, no-show, pickup/return
  -- forms, and every legacy type pass through untouched.
  IF p_document_type IS NULL OR p_document_type NOT IN (
       'rental_tax_invoice_receipt_full',
       'rental_tax_invoice_receipt_abbreviated',
       'rental_credit_note'
     ) THEN
    RETURN;
  END IF;

  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'TAX_DOCUMENT_BOOKING_REQUIRED';
  END IF;

  SELECT state INTO v_state
    FROM public.rental_settlement_payment_states
   WHERE booking_id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAX_DOCUMENT_SETTLEMENT_STATE_MISSING';
  END IF;

  IF v_state = 'awaiting_payment' THEN
    RAISE EXCEPTION 'TAX_DOCUMENT_BLOCKED_AWAITING_PAYMENT';
  END IF;

  IF v_state IN ('paid', 'waived') THEN
    -- [143 NEW] a pending_review charge blocks tax-document issuance too.
    -- Enforced un-bypassably: the 139 BEFORE INSERT trigger calls this assert.
    IF EXISTS (SELECT 1 FROM public.payment_allocations pa
                 JOIN public.rental_booking_settlements s
                   ON s.id::text = pa.source_id
                WHERE s.booking_id = p_booking_id
                  AND pa.source_type = 'rental_booking_settlement'
                  AND pa.charge_type = 'pending_review') THEN
      RAISE EXCEPTION 'TAX_DOCUMENT_PENDING_REVIEW_CHARGES';
    END IF;
    RETURN;
  END IF;

  -- Fail closed on the impossible branch.
  RAISE EXCEPTION 'TAX_DOCUMENT_STATE_UNKNOWN: %', v_state;
END;
$$;

REVOKE ALL ON FUNCTION public.f_assert_tax_document_issuable(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_assert_tax_document_issuable(uuid, text)
  TO service_role;
