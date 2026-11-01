-- ============================================================
-- 148_settlement_discount_line.sql
--
-- Scope:
--   * NEW f_write_settlement_discount_line — writes the settlement discount
--     as its own payment_allocations line (direction 'out', positive amount).
--   * WIDEN payment_allocations_charge_type_chk to admit 'settlement_discount'.
--   * CREATE OR REPLACE f_settle_rental_booking_return (10th generation) —
--     body-only change: one block that writes the discount line when a
--     discount was granted. The 14-arg signature is byte-unchanged from 147.
--
-- Key design decisions:
--   * CHiP ruling 2026-11-02, option (B) "ยอดเต็ม + บรรทัดส่วนลด": the ledger
--     keeps the GROSS charge AND records the giveaway, rather than silently
--     netting the charge line down. Option (A) (net charge line) would have
--     made discounts invisible to any revenue report; option (C) (leave it)
--     would have left the ledger permanently overstating charged revenue by
--     every discount granted. (B) is also what lets T4's tax invoice show a
--     correctly reduced taxable base.
--   * WHY A NEW WRITER, not a parameter on the existing one:
--     f_write_settlement_charge_line hardcodes direction 'in'. Adding a
--     direction argument means DROP + CREATE on a writer that migrations 143,
--     146 and 147 all call — signature churn on a shared money writer is the
--     class of change that made mig-143's 13-arg form a merge blocker. A
--     dedicated writer costs ~10 duplicated lines and touches no caller.
--   * VAT IS NOT OPTIONAL ON THIS LINE. payment_allocations enforces
--     abs(gross - (net + vat)) <= 0.01, and f_tax_vat_config() is
--     vat_inclusive 7%, so a bare gross figure would be REJECTED. The discount
--     line carries its own split, derived by the same math as the charge line:
--     ฿200 discount → gross 200.00, net 186.92, vat 13.08.
--   * NO ฿0 LINES. The writer returns NULL for <= 0 and the caller gates on
--     v_discount > 0 — the no-fiction rule, same as the existing writer.
--   * amount_due IS UNCHANGED: base + penalty - discount - held. This
--     migration adds a ledger line; it does not move money.
--   * FORWARD ONLY. No history is rewritten. Remote held zero settlements,
--     zero rental_charge allocations and zero discount decision rows when this
--     was drafted, so there is nothing to backfill and the append-only
--     settlements trigger (mig-125) is never engaged.
--   * The CHECK widening is additive, so every existing row satisfies the new
--     constraint and validation cannot fail.
-- ============================================================

-- ─── 1. charge_type vocabulary — additive widening ──────────────────────────
ALTER TABLE public.payment_allocations
  DROP CONSTRAINT IF EXISTS payment_allocations_charge_type_chk;

ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_charge_type_chk
  CHECK (
    charge_type IS NULL OR charge_type = ANY (ARRAY[
      'rental_charge',
      'rental_extension',
      'taxable_service_charge',
      'actual_damage',
      'contractual_penalty',
      'pending_review',
      'settlement_discount'
    ])
  );

-- ─── 2. the discount writer ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.f_write_settlement_discount_line(
  p_booking_id    uuid,
  p_settlement_id uuid,
  p_gross         numeric,
  p_branch_id     text,
  p_staff_user_id uuid
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
    RETURN NULL;   -- no ฿0 discount line, same no-fiction rule as the charge writer
  END IF;
  v_cfg := public.f_tax_vat_config();
  v_rate := (v_cfg->>'rate_percent')::numeric;
  v_treatment := v_cfg->>'treatment';

  IF v_treatment = 'vat_inclusive' THEN
    v_gross := round(p_gross, 2);
    v_net   := round(p_gross / (1 + v_rate / 100.0), 2);
    v_vat   := v_gross - v_net;
  ELSE
    v_net   := round(p_gross, 2);
    v_vat   := round(p_gross * v_rate / 100.0, 2);
    v_gross := v_net + v_vat;
  END IF;

  INSERT INTO public.payment_allocations (
    source_type, source_id, branch_id, direction, allocation_type, status,
    vat_treatment, net_amount, vat_amount, gross_amount, currency_code,
    staff_user_id, idempotency_key, metadata, charge_type
  ) VALUES (
    'rental_booking_settlement', p_settlement_id::text, p_branch_id, 'out',
    'manual_adjustment', 'pending', v_treatment, v_net, v_vat, v_gross, 'THB',
    p_staff_user_id,
    'settlement-' || p_settlement_id::text || '-manual_adjustment-settlement_discount',
    jsonb_build_object('bookingId', p_booking_id, 'vatRatePercent', v_rate),
    'settlement_discount'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.f_write_settlement_discount_line(uuid, uuid, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_write_settlement_discount_line(uuid, uuid, numeric, text, uuid)
  TO service_role;

-- ─── 3. settle RPC — body-only change, 14-arg signature unchanged ───────────
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
  p_branch_id               text DEFAULT NULL,
  p_staff_charge_lines      jsonb DEFAULT '[]'::jsonb,   -- [146] ACCEPTED ONLY EMPTY
  p_discount_amount         numeric DEFAULT 0,
  p_discount_note           text DEFAULT NULL,
  p_staff_memo              text DEFAULT NULL            -- [146 NEW] text only
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
  v_return_date      date;               -- [134]
  v_late_days        integer;            -- [134]
  v_base_rental      numeric(12,2);      -- [134]
  v_penalty_net      numeric(12,2);      -- [134]
  v_amount_due       numeric(12,2);      -- [134]
  v_deposits_on      boolean;            -- [143]
  v_actor_role       text;               -- [143]
  v_rental_base      numeric(12,2);      -- [143]
  v_discount         numeric(12,2);      -- [143]
  v_max_pct          numeric;            -- [143]
  v_memo             text;               -- [146 NEW]
BEGIN
  IF p_staff_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_ACTOR_REQUIRED';
  END IF;

  -- ═══ [146 NEW] STAFF-CHARGE CHANNEL REMOVED ════════════════════════
  -- decisions.md 2026-07-26 c: the typed staff-charge channel is REMOVED,
  -- not gated — an unused money-collection path that can be switched on is
  -- a live risk. This RAISE precedes every write and every regime branch, so
  -- taxable_service_charge / actual_damage / contractual_penalty have no
  -- writer in either regime. Anything but NULL or an empty array is refused
  -- (fail-closed: a malformed payload is a refusal, not a shape complaint).
  IF p_staff_charge_lines IS NOT NULL
     AND NOT (jsonb_typeof(p_staff_charge_lines) = 'array'
              AND jsonb_array_length(p_staff_charge_lines) = 0) THEN
    RAISE EXCEPTION 'STAFF_CHARGE_CHANNEL_REMOVED';
  END IF;
  -- ═══ [146 NEW END] ═════════════════════════════════════════════════

  -- ═══ [143] regime discrimination + in-RPC role lookup ═══════════════
  -- The tier decision uses the LOOKED-UP role, never a caller claim (R-B).
  -- This differs from 134's confirm/waive, which take p_actor_role for
  -- AUDIT ATTRIBUTION; here the role is a PRIVILEGE decision, so it is
  -- read from the database inside the same transaction.
  v_deposits_on := public.f_deposits_enabled();
  SELECT platform_role INTO v_actor_role FROM public.users WHERE id = p_staff_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLEMENT_ACTOR_NOT_FOUND';
  END IF;

  -- Channel separation: the deposit-era penalty channel is still refused at
  -- launch, and the launch discount is still refused in the deposit regime.
  -- [146] the staff-charge branch is GONE — the removal RAISE above covers
  -- both regimes, so a regime-specific refusal for it is unreachable.
  IF NOT v_deposits_on THEN
    IF p_penalty_lines IS NOT NULL AND jsonb_array_length(p_penalty_lines) > 0 THEN
      RAISE EXCEPTION 'PENALTY_LINES_NOT_ACCEPTED_AT_LAUNCH';
    END IF;
  ELSE
    IF COALESCE(p_discount_amount, 0) <> 0 THEN
      RAISE EXCEPTION 'LAUNCH_DISCOUNT_NOT_ACCEPTED_IN_DEPOSIT_REGIME';
    END IF;
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

  -- ═══ [134 DERIVE — MOVED ABOVE THE INSERT BY 146; late CHARGE removed by 147] START ═══
  -- Base rental + late days, ALL derived from the LOCKED booking row.
  -- Every anomaly RAISEs; nothing silently defaults. [147] late_days is still
  -- derived and stored — it is REPORT DATA now, not money. No late CHARGE is
  -- computed, so no daily-rate guard fires: a settle must not fail because a
  -- report field is unset. The report reads daily_rate from the booking row.
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
  -- ═══ [134 DERIVE — MOVED] END ══════════════════════════════════════

  -- ═══ [146 NEW] RECORD-BUT-NO-MONEY memo gate ═══════════════════════
  -- decisions.md 2026-07-26 b + ruling A5: TEXT ONLY, mandatory when the
  -- return is overdue, optional otherwise. Regime-independent: the memo
  -- records a fact, it is not a money path. The table CHECK
  -- (rbs_staff_memo_required_when_late_chk) backstops this for any writer
  -- that bypasses the RPC.
  v_memo := NULLIF(trim(COALESCE(p_staff_memo, '')), '');
  IF v_late_days > 0 AND v_memo IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_MEMO_REQUIRED_FOR_LATE_RETURN: % late day(s)', v_late_days;
  END IF;
  -- ═══ [146 NEW END] ═════════════════════════════════════════════════

  INSERT INTO public.rental_booking_settlements (
    booking_id, held_total, penalty_lines,
    special_discount_amount, special_discount_note,
    settlement_applied_amount, refund_amount, additional_collection_amount,
    customer_signature_path, staff_signature_path,
    slip_evidence_ref, refund_bank_account_ref,
    created_by_user_id, branch_id,
    staff_memo, late_days                                   -- [146 NEW]
  ) VALUES (
    p_booking_id, v_held, p_penalty_lines,
    COALESCE(p_special_discount_amount, 0), p_special_discount_note,
    v_applied, v_refund, v_additional,
    p_customer_signature_path, p_staff_signature_path,
    p_slip_evidence_ref, p_refund_bank_account_ref,
    p_staff_user_id, p_branch_id,
    v_memo, v_late_days                                     -- [146 NEW]
  ) RETURNING id INTO v_settlement_id;

  v_penalty_net := v_net_charge;   -- penalties minus discount (bounded above)

  -- ═══ [143] two-tier discount, rental-base only ═════════════════════
  -- [147] The base is the BOOKED RENTAL ALONE. rental_extension left web
  -- collection (decisions.md 2026-07-27 a), so there is no second component
  -- to discount. Tier authority still comes from the LOOKED-UP role (R-B).
  v_rental_base := round(v_base_rental, 2);
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
  -- ═══ [143 END] ═════════════════════════════════════════════════════

  -- [146] the v_staff_total term is GONE from amount_due — there is no
  -- staff-charge channel to total.
  v_amount_due  := round(v_base_rental + v_penalty_net
                         - v_discount - v_held, 2);
  IF v_amount_due < 0 THEN
    v_amount_due := 0;             -- held exceeds charges; refund side handled by 125 math
  END IF;

  -- Charge lines: one allocation row per non-zero component, status 'pending'.
  -- Charge lines carry the tax-substance charge_type (142 column).
  -- [147] THE WEB PRODUCES EXACTLY ONE CHARGE TYPE: rental_charge, the rental
  -- as booked. The rental_extension line is GONE — overdue rental leaves the
  -- web and is billed externally from the printed report (decisions.md
  -- 2026-07-27 a/b). late_days is still computed and stored, as REPORT DATA.
  PERFORM public.f_write_settlement_charge_line(p_booking_id, v_settlement_id, 'rental_charge', v_base_rental, p_branch_id, p_staff_user_id, 'rental_charge');

  -- ═══ [148] THE DISCOUNT GETS ITS OWN LEDGER LINE ═════════════════════
  -- CHiP ruling 2026-11-02: "ยอดเต็ม + บรรทัดส่วนลด" — the ledger records
  -- the GROSS rental charged and the amount given away, separately. Before
  -- this, a granted discount existed only in money_ops_decision_logs (an
  -- audit log, not a ledger), so payment_allocations claimed ฿1,500 charged
  -- while the till took ฿1,300 (UAT 2026-09-01, docs/BACKLOG.md T-UAT).
  -- direction 'out' with a POSITIVE amount: gross/net/vat are all CHECK >= 0,
  -- so a negative line is impossible by constraint, not by preference.
  -- Written ONLY when a discount was actually granted — no ฿0 line (the
  -- writer itself also returns NULL at <= 0). amount_due is UNCHANGED.
  IF v_discount > 0 THEN
    PERFORM public.f_write_settlement_discount_line(
      p_booking_id, v_settlement_id, v_discount, p_branch_id, p_staff_user_id);
  END IF;
  -- Deposit-regime penalties keep the legacy (untyped) line.
  PERFORM public.f_write_settlement_charge_line(p_booking_id, v_settlement_id, 'penalty',       v_penalty_net, p_branch_id, p_staff_user_id, NULL);

  -- ═══ [146 NEW] pending_review backstop (auditor ruling 2026-07-26, GQ2) ══
  -- The fourth guard site, restated positively. No writer in this function can
  -- produce a pending_review line once the staff-charge channel is gone, so
  -- this asserts that the settlement just written carries none — BEFORE the
  -- payment state is decided, so a poisoned settlement can never reach 'paid'
  -- or 'awaiting_payment'. Predicate and index usage mirror
  -- f_confirm_settlement_payment (143:528-531) and the 142 partial index.
  IF EXISTS (SELECT 1 FROM public.payment_allocations
              WHERE source_type = 'rental_booking_settlement'
                AND source_id = v_settlement_id::text
                AND charge_type = 'pending_review') THEN
    RAISE EXCEPTION 'SETTLEMENT_PENDING_REVIEW_LINE_PRESENT: %', v_settlement_id;
  END IF;
  -- ═══ [146 NEW END] ═════════════════════════════════════════════════

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

  -- [143] §F success log for a granted discount. SUCCESS PATH ONLY —
  -- a refused discount RAISEs and the denial is the WRAPPER's duty (§8.9:
  -- an in-function log before RAISE cannot persist). actor_role records the
  -- LOOKED-UP role, so the super_admin 20-50%% tier logs its authority use.
  IF v_discount > 0 THEN
    INSERT INTO public.money_ops_decision_logs
      (operation, decision, actor_user_id, actor_role, entity_type, entity_id, amount, currency_code)
    VALUES ('settlement_discount_granted', 'allowed', p_staff_user_id, v_actor_role,
            'rental_booking', p_booking_id, v_discount, 'THB');
  END IF;

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
    'base_rental_charge', v_base_rental,      -- [134]
    'late_days', v_late_days,                 -- [134]
    'amount_due', v_amount_due,               -- [134]
    'discount_amount', v_discount,            -- [143]
    'rental_base', v_rental_base,             -- [143]
    'staff_memo', v_memo                      -- [146 NEW]
  );
END;
$$;
REVOKE ALL ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text, jsonb, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text, jsonb, numeric, text, text) TO service_role;
