-- ============================================================
-- 133_settlement_payment_state_and_tax_guard.sql
--
-- Scope:
--   * rental_settlement_payment_states — the MUTABLE companion row that
--     carries return-charge payment state (OD-3). rental_booking_settlements
--     stays append-only and is NOT touched (125:153-161).
--   * f_assert_tax_document_issuable — the tax-point guard (decisions.md
--     2026-07-22 d, 2026-07-23 a). Refuses TIR/TIA/CDN while unpaid;
--     STM and all legacy types exempt.
--   * f_settle_rental_booking_return — CREATE OR REPLACE (I-4 Option A) to
--     insert the payment-state row in the SAME transaction as the settlement.
--
-- Key design decisions:
--   * Design contract: docs/design/2026-07-23-t-launch-phase0.md §8.1 (133).
--   * Two terminal states: paid | waived. No rollback — corrections are
--     credit notes (new documents), never state reversals.
--   * amount_due is DERIVED from v_additional (125:274), never caller-supplied.
--     134 must extend it to include the base rental charge (MERGE-BLOCKER).
--   * Guard is function-only in 133; the official_documents INSERT trigger is
--     deferred to 139 (I-2). Until 139, the §0 central-engine constraint is
--     the standing defense.
--   * Zero-due settlements are created directly as 'paid' (I-1).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- A. Table
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_settlement_payment_states (
  id                    uuid          NOT NULL DEFAULT gen_random_uuid(),
  settlement_id         uuid          NOT NULL REFERENCES public.rental_booking_settlements(id) ON DELETE RESTRICT,
  booking_id            uuid          NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  state                 text          NOT NULL DEFAULT 'awaiting_payment',
  amount_due            numeric(12,2) NOT NULL,
  amount_paid           numeric(12,2) NOT NULL DEFAULT 0,
  currency_code         text          NOT NULL DEFAULT 'THB',
  payment_method        text          NULL,
  payment_reference     text          NULL,
  slip_evidence_ref     text          NULL,
  paid_at               timestamptz   NULL,
  confirmed_by_user_id  uuid          NULL REFERENCES public.users(id) ON DELETE SET NULL,
  waived_at             timestamptz   NULL,
  waived_by_user_id     uuid          NULL REFERENCES public.users(id) ON DELETE SET NULL,
  waive_reason          text          NULL,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT rental_settlement_payment_states_pkey PRIMARY KEY (id),
  CONSTRAINT rsps_settlement_unique UNIQUE (settlement_id),
  CONSTRAINT rsps_booking_unique    UNIQUE (booking_id),

  CONSTRAINT rsps_state_chk    CHECK (state IN ('awaiting_payment', 'paid', 'waived')),
  CONSTRAINT rsps_currency_chk CHECK (char_length(currency_code) = 3),
  CONSTRAINT rsps_due_nonneg_chk  CHECK (amount_due  >= 0),
  CONSTRAINT rsps_paid_nonneg_chk CHECK (amount_paid >= 0),

  CONSTRAINT rsps_paid_shape_chk CHECK (
    state <> 'paid' OR (
      paid_at IS NOT NULL
      AND confirmed_by_user_id IS NOT NULL
      AND amount_paid >= amount_due
    )
  ),
  CONSTRAINT rsps_waived_shape_chk CHECK (
    state <> 'waived' OR (
      waived_at IS NOT NULL
      AND waived_by_user_id IS NOT NULL
      AND char_length(trim(coalesce(waive_reason, ''))) > 0
    )
  ),
  CONSTRAINT rsps_not_both_chk CHECK (NOT (paid_at IS NOT NULL AND waived_at IS NOT NULL))
);

COMMENT ON TABLE public.rental_settlement_payment_states IS
  'MUTABLE companion to the append-only rental_booking_settlements: carries return-charge payment state for the tax-point guard. States: awaiting_payment -> paid | waived (both terminal). paid = staff-confirmed with evidence; waived = super_admin only, reason mandatory. Corrections are credit notes, never state reversals. amount_due is RPC-derived (never caller-supplied). Audit trail lives in money_ops_decision_logs, not in row history.';

CREATE INDEX IF NOT EXISTS idx_rsps_booking    ON public.rental_settlement_payment_states (booking_id);
CREATE INDEX IF NOT EXISTS idx_rsps_settlement ON public.rental_settlement_payment_states (settlement_id);
CREATE INDEX IF NOT EXISTS idx_rsps_awaiting   ON public.rental_settlement_payment_states (created_at DESC)
  WHERE state = 'awaiting_payment';

DROP TRIGGER IF EXISTS set_rental_settlement_payment_states_updated_at
  ON public.rental_settlement_payment_states;
CREATE TRIGGER set_rental_settlement_payment_states_updated_at
  BEFORE UPDATE ON public.rental_settlement_payment_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ──────────────────────────────────────────────────────────────
-- B. RLS + grants (125/132 pattern)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.rental_settlement_payment_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_settlement_payment_states FROM anon, authenticated;
GRANT ALL ON public.rental_settlement_payment_states TO service_role;

DROP POLICY IF EXISTS "rsps_service_role_all" ON public.rental_settlement_payment_states;
CREATE POLICY "rsps_service_role_all"
  ON public.rental_settlement_payment_states FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "rsps_super_admin_select" ON public.rental_settlement_payment_states;
CREATE POLICY "rsps_super_admin_select"
  ON public.rental_settlement_payment_states FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.platform_role = 'super_admin'
  ));

-- ──────────────────────────────────────────────────────────────
-- C. Tax-point guard (function-only per I-2; trigger deferred to 139)
-- ──────────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────────
-- D+E. f_settle_rental_booking_return — CREATE OR REPLACE (I-4 Option A)
--      Signature UNCHANGED (10 args) — no overload, no DROP, no re-grant.
--      Delta vs 125: 4 new DECLARE vars + one block after the settlement
--      INSERT. Nothing else differs.
-- ──────────────────────────────────────────────────────────────
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_payment_state_id uuid;                 -- [133 NEW]
  v_state            text;                 -- [133 NEW]
  v_paid_at          timestamptz;          -- [133 NEW]
  v_confirmed_by     uuid;                 -- [133 NEW]
BEGIN
  IF p_staff_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_ACTOR_REQUIRED';
  END IF;

  -- Row lock: one settlement per booking, no concurrent double-settle.
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

  -- Validate penalty lines: each needs amount > 0 and a non-empty note.
  IF p_penalty_lines IS NULL OR jsonb_typeof(p_penalty_lines) <> 'array' THEN
    RAISE EXCEPTION 'SETTLEMENT_PENALTY_LINES_INVALID';
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_penalty_lines) LOOP
    IF (v_line->>'amount') IS NULL OR (v_line->>'amount')::numeric <= 0
       OR COALESCE(trim(v_line->>'note'), '') = '' THEN
      RAISE EXCEPTION 'SETTLEMENT_PENALTY_LINE_INVALID: %', v_line;
    END IF;
  END LOOP;

  -- Held total from the LEDGER (writer authority — never trusted from input):
  -- posted collections minus posted releases for this booking.
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

  -- ═══ [133 NEW BLOCK — START] ══════════════════════════════════
  -- Payment state, SAME transaction as the settlement (I-4 Option A):
  -- no settlement can exist without a payment state.
  -- amount_due = v_additional (derived above, never caller-supplied).
  -- MERGE-BLOCKER: 134 must extend this to include the base rental
  -- charge before feature/t-launch may merge to staging (I-3).
  IF v_additional = 0 THEN
    v_state        := 'paid';          -- I-1: zero-due settles on creation
    v_paid_at      := now();
    v_confirmed_by := p_staff_user_id;
  ELSE
    v_state        := 'awaiting_payment';
    v_paid_at      := NULL;
    v_confirmed_by := NULL;
  END IF;

  INSERT INTO public.rental_settlement_payment_states (
    settlement_id, booking_id, state, amount_due, amount_paid,
    currency_code, paid_at, confirmed_by_user_id
  ) VALUES (
    v_settlement_id, p_booking_id, v_state, v_additional, 0,
    'THB', v_paid_at, v_confirmed_by
  ) RETURNING id INTO v_payment_state_id;

  -- I-1: distinguishable audit marker for zero-due auto-paid rows.
  -- Requires the SECTION F vocabulary widening.
  IF v_state = 'paid' THEN
    INSERT INTO public.money_ops_decision_logs
      (operation, decision, actor_user_id, entity_type, entity_id,
       amount, currency_code)
    VALUES
      ('settlement_zero_due_auto_paid', 'allowed', p_staff_user_id,
       'rental_booking', p_booking_id, 0, 'THB');
  END IF;
  -- ═══ [133 NEW BLOCK — END] ════════════════════════════════════

  -- Ledger release events (composition rule, LOCKED). Collection first so a
  -- ledger replay never dips negative.
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

  -- INVARIANT re-assert from the LEDGER: net held balance must now be zero.
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
    'payment_state_id', v_payment_state_id,     -- [133 NEW]
    'payment_state', v_state                     -- [133 NEW]
  );
END;
$$;

-- Grants unchanged (signature identical to 125:349-350) — restated for
-- idempotent re-apply.
REVOKE ALL ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text) TO service_role;

-- ──────────────────────────────────────────────────────────────
-- F. modl_operation_chk widening — the zero-due operation value.
--    Auditor-amended 2026-07-23: this value lands in 133; migration 138's
--    remaining scope is the tax-issuance operation values only.
--    Plain DROP: a wrong constraint name must fail loudly (125:C pattern).
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.money_ops_decision_logs
  DROP CONSTRAINT modl_operation_chk;
ALTER TABLE public.money_ops_decision_logs
  ADD CONSTRAINT modl_operation_chk CHECK (operation IN (
    'company_cancel',
    'late_cancel_forfeit',
    'document_void',
    'sale_cancel_paid',
    'refund_mark_refunded',
    'manual_stock_adjustment',
    'settlement_zero_due_auto_paid'
  ));
