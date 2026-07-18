-- ============================================================
-- 125_rental_booking_settlements.sql
--
-- Scope (decisions.md §b addendum 2026-07-15, items 1-4):
--   * rental_booking_settlements — ONE row per return settlement, carrying
--     what T4's numbered document will need. Append-only (086 guard pattern).
--   * Widen rental_held_balance_events.event_type with
--     'settlement_additional_collection' (negative settlements: customer
--     pays the shortfall in; slip-evidenced money-in event).
--   * f_settle_rental_booking_return RPC — SECURITY DEFINER, sibling
--     discipline (self-guarded, FOR UPDATE row lock, atomic settlement row
--     + ledger events, invariant re-asserted in SQL).
--
-- Money composition (LOCKED, §b addendum item 2):
--   net_charge = penalty_total - special_discount
--   net_charge <= held : applied = net_charge, refund = held - net_charge
--   net_charge >  held : applied = net_charge, refund = 0,
--                        additional_collection = net_charge - held
--   INVARIANT: held + additional_collection = applied + refund
--   (forfeiture is the no-show path only — never part of a return settlement)
--
-- APPLY NOTES (remote): the T2 remote apply must also create the SYSTEM
-- ACTOR auth user (system@hopnic.internal, §b addendum item 5) — not part
-- of this migration (Flow-2/126 scope) but recorded here so it is not
-- forgotten at remote-apply time.
-- ============================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- A. Helper: IMMUTABLE penalty-lines total (backs the GENERATED column, which
--    resolves the penalty_total duplication question: the column can never
--    drift from penalty_lines because Postgres computes it).
-- ──────────────────────────────────────────────────────────────────────────────
-- FAIL-LOUD (gate standard): direct service-role writes bypass the RPC's
-- per-line validation, so this helper is the last line of defense for
-- penalty_total integrity. Malformed input RAISES — never coerces to 0,
-- never skips an element.
CREATE OR REPLACE FUNCTION public.f_penalty_lines_total(p_lines jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_line  jsonb;
  v_total numeric := 0;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'PENALTY_LINES_NOT_ARRAY';
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'PENALTY_LINE_NOT_OBJECT: %', v_line;
    END IF;
    IF v_line->>'amount' IS NULL THEN
      RAISE EXCEPTION 'PENALTY_LINE_AMOUNT_MISSING: %', v_line;
    END IF;
    -- Non-numeric amount raises 22P02 here (invalid text representation).
    v_total := v_total + (v_line->>'amount')::numeric;
  END LOOP;
  RETURN v_total;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- B. TABLE: rental_booking_settlements
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_booking_settlements (
  id                           uuid        NOT NULL DEFAULT gen_random_uuid(),
  booking_id                   uuid        NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,

  -- Money (all amounts >= 0; composition CHECK-enforced below)
  held_total                   numeric(12,2) NOT NULL,
  penalty_lines                jsonb       NOT NULL DEFAULT '[]'::jsonb,
  penalty_total                numeric(12,2) GENERATED ALWAYS AS (public.f_penalty_lines_total(penalty_lines)) STORED,
  special_discount_amount      numeric(12,2) NOT NULL DEFAULT 0,
  special_discount_note        text        NULL,
  settlement_applied_amount    numeric(12,2) NOT NULL,
  refund_amount                numeric(12,2) NOT NULL,
  additional_collection_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency_code                text        NOT NULL DEFAULT 'THB',

  -- Evidence (§b addendum items 3-4)
  customer_signature_path      text        NOT NULL,
  staff_signature_path         text        NOT NULL,
  slip_evidence_ref            text        NULL,  -- private-bucket path (mig-113 chain); NULL only when refund=0 AND additional=0
  refund_bank_account_ref      text        NULL,  -- §b: customer bank account for refunds (masked/ref form; never full PII dump)

  created_by_user_id           uuid        NULL REFERENCES public.users(id) ON DELETE SET NULL,
  branch_id                    text        NULL REFERENCES public.store_branches(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rental_booking_settlements_pkey PRIMARY KEY (id),
  CONSTRAINT rental_booking_settlements_booking_unique UNIQUE (booking_id),

  -- Shape guards
  CONSTRAINT rbs_penalty_lines_is_array_chk
    CHECK (jsonb_typeof(penalty_lines) = 'array'),
  CONSTRAINT rbs_currency_chk CHECK (char_length(currency_code) = 3),

  -- Amount sign guards
  CONSTRAINT rbs_held_nonneg_chk       CHECK (held_total >= 0),
  CONSTRAINT rbs_discount_nonneg_chk   CHECK (special_discount_amount >= 0),
  CONSTRAINT rbs_applied_nonneg_chk    CHECK (settlement_applied_amount >= 0),
  CONSTRAINT rbs_refund_nonneg_chk     CHECK (refund_amount >= 0),
  CONSTRAINT rbs_additional_nonneg_chk CHECK (additional_collection_amount >= 0),

  -- §b:559-561 — special discount requires a staff note
  CONSTRAINT rbs_discount_note_chk
    CHECK (special_discount_amount = 0 OR
           (special_discount_note IS NOT NULL AND char_length(trim(special_discount_note)) > 0)),

  -- Discount can only reduce charges, never mint money
  CONSTRAINT rbs_discount_le_penalty_chk
    CHECK (special_discount_amount <= penalty_total),

  -- Composition (LOCKED): applied = penalties - discount
  CONSTRAINT rbs_applied_composition_chk
    CHECK (settlement_applied_amount = penalty_total - special_discount_amount),

  -- INVARIANT (LOCKED): held + additional collection = applied + refund
  CONSTRAINT rbs_full_release_invariant_chk
    CHECK (held_total + additional_collection_amount = settlement_applied_amount + refund_amount),

  -- Money movement requires slip evidence (EVEN outcome may omit it)
  CONSTRAINT rbs_slip_required_chk
    CHECK ((refund_amount = 0 AND additional_collection_amount = 0) OR slip_evidence_ref IS NOT NULL),

  -- §b: refunds are bank transfer — bank account ref required when refunding
  CONSTRAINT rbs_refund_bank_chk
    CHECK (refund_amount = 0 OR refund_bank_account_ref IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_rental_booking_settlements_booking
  ON public.rental_booking_settlements(booking_id);

-- RLS: service_role writes; platform admins read (endpoint guard is the
-- real gate; RLS is defence-in-depth, per house pattern).
ALTER TABLE public.rental_booking_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_booking_settlements_service_role_all"
  ON public.rental_booking_settlements FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON public.rental_booking_settlements FROM anon, authenticated;

-- Append-only guards (086 pattern): settlements are money evidence.
CREATE OR REPLACE FUNCTION public.rental_booking_settlements_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rental_booking_settlements is append-only; % is not permitted', TG_OP;
END;
$$;
DROP TRIGGER IF EXISTS trg_rental_booking_settlements_no_mutate
  ON public.rental_booking_settlements;
CREATE TRIGGER trg_rental_booking_settlements_no_mutate
  BEFORE UPDATE OR DELETE ON public.rental_booking_settlements
  FOR EACH ROW EXECUTE FUNCTION public.rental_booking_settlements_block_mutation();
DROP TRIGGER IF EXISTS trg_rental_booking_settlements_no_truncate
  ON public.rental_booking_settlements;
CREATE TRIGGER trg_rental_booking_settlements_no_truncate
  BEFORE TRUNCATE ON public.rental_booking_settlements
  FOR EACH STATEMENT EXECUTE FUNCTION public.rental_booking_settlements_block_mutation();

-- ──────────────────────────────────────────────────────────────────────────────
-- C. Widen rental_held_balance_events.event_type
--    (plain DROP — a wrong constraint name must fail loudly)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.rental_held_balance_events
  DROP CONSTRAINT rental_held_balance_events_event_type_check;
ALTER TABLE public.rental_held_balance_events
  ADD CONSTRAINT rental_held_balance_events_event_type_check
    CHECK (event_type = ANY (ARRAY[
      'booking_deposit_collection',
      'pickup_held_balance_collection',
      'same_day_held_balance_collection',
      'settlement_application',
      'refund',
      'forfeiture',
      'remaining_security_deposit_collection',
      'settlement_additional_collection'
    ]));

-- ──────────────────────────────────────────────────────────────────────────────
-- D. RPC: f_settle_rental_booking_return — ONE transaction:
--    settlement INSERT + ledger release events, invariant re-asserted.
--    The endpoint computes for display; this RPC is the WRITER AUTHORITY.
-- ──────────────────────────────────────────────────────────────────────────────
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
    'additional_collection_amount', v_additional
  );
END;
$$;

-- Grants — service_role only (endpoint calls via the service-role client).
REVOKE ALL ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_settle_rental_booking_return(uuid, jsonb, numeric, text, text, text, text, text, uuid, text) TO service_role;
