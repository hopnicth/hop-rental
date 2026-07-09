-- ============================================================
-- 119_atomic_rental_booking_deposit_confirm.sql
--
-- Scope (G2 — docs/payment-flow-ratification-audit.md F4; POS V3 deep audit
--   P2.5 / findings 11-12; DECISIONS 2026-07-09 (b)):
--   Single SECURITY DEFINER RPC performing the booking-deposit money core
--   (held-balance event + deposit-paid fields + POS attempt→paid) and the
--   draft→confirmed transition ATOMICALLY, for BOTH the POS V3 path (cash + QR)
--   and the manual slip-confirm path. Replaces the non-atomic multi-HTTP-write
--   sequences in pos-rental-booking-deposit-finalizer.ts and
--   rental-manual-deposit-confirmation.ts.
--
-- Column proof (R1): all read/written columns verified present —
--   rental_bookings.{currency_code, booking_deposit_payment_status,
--     booking_deposit_paid_amount, booking_deposit_paid_at,
--     booking_deposit_pos_attempt_id, booking_deposit_confirm_failed_at (076:55),
--     booking_deposit_confirm_failure_reason (076:56)};
--   pos_rental_payment_attempts.{status, paid_at, confirm_failed_at (087:19),
--     confirm_failure_reason (087:20)};
--   rental_held_balance_events per mig 086.
-- Source-type continuity (R2): 'manual_admin_confirmation' /
--   'pos_rental_payment_attempt' match today's writers exactly; mig-086 has no
--   closed CHECK on source_type (only non-empty), so re-entry finds prior events.
--
-- Key design decisions:
--   * FAIL-CLOSED: every unexpected state RAISEs (full rollback) — no silent
--     continue (fixes finding 11's unchecked W3).
--   * Money core (W2 held event, W3 deposit fields, W1 attempt→paid) atomic;
--     confirm (W4) savepoint-isolated so a GENUINE mig-058 overlap conflict
--     (23P01) keeps the money core and returns paid_confirm_failed.
--   * mig-058 advisory-lock overlap trigger runs inside this txn (authoritative
--     atomic double-booking guard). Advisory locks are txn-scoped (held to
--     end-of-RPC-txn even across the savepoint rollback) — acceptable.
--   * Idempotent + re-entrant (FOR UPDATE + ON CONFLICT + guarded updates):
--     a same-key retry after a crash completes finalization (crash-gap fix).
--   * R3 amount guard: replay / paid-re-entry RAISE BOOKING_DEPOSIT_AMOUNT_MISMATCH.
--   * W5 document issuance stays OUTSIDE (deep audit P2.3).
--   * mig-112 conventions: SECURITY DEFINER, SET search_path = public,
--     service_role-only EXECUTE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.f_confirm_rental_booking_deposit(
  p_booking_id      uuid,
  p_source_type     text,
  p_source_id       text,
  p_attempt_id      uuid,
  p_amount          numeric,
  p_currency_code   text,
  p_payment_method  text,
  p_branch_id       text,
  p_staff_user_id   uuid,
  p_idempotency_key text,
  p_event_metadata  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status       text;
  v_dep_status   text;
  v_currency     text;
  v_paid_amount  numeric;
  v_event_id     uuid;
  v_reason       text;
  v_conflict     boolean := false;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'BOOKING_DEPOSIT_AMOUNT_INVALID';
  END IF;
  IF p_source_type NOT IN ('pos_rental_payment_attempt','manual_admin_confirmation') THEN
    RAISE EXCEPTION 'BOOKING_DEPOSIT_SOURCE_TYPE_INVALID';
  END IF;

  -- 0. Lock the booking row (serialises concurrent finalization of the same booking).
  SELECT status,
         booking_deposit_payment_status,
         coalesce(currency_code,'THB'),
         booking_deposit_paid_amount
    INTO v_status, v_dep_status, v_currency, v_paid_amount
    FROM public.rental_bookings
   WHERE id = p_booking_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RENTAL_BOOKING_NOT_FOUND';
  END IF;

  -- 1. Idempotent success re-entry (post-confirm replay) — R3 amount guard.
  IF v_status = 'confirmed' AND v_dep_status = 'paid' THEN
    IF round(p_amount, 2) IS DISTINCT FROM v_paid_amount THEN
      RAISE EXCEPTION 'BOOKING_DEPOSIT_AMOUNT_MISMATCH'
        USING DETAIL = format('stored=%s requested=%s', v_paid_amount, round(p_amount,2));
    END IF;
    SELECT id INTO v_event_id FROM public.rental_held_balance_events
      WHERE source_type = p_source_type AND source_id = p_source_id
        AND event_type = 'booking_deposit_collection';
    RETURN jsonb_build_object(
      'status','confirmed','idempotent',true,
      'booking_deposit_paid_amount', v_paid_amount,   -- authoritative stored value
      'currency_code', v_currency,
      'held_balance_event_id', v_event_id,
      'confirm_failure_reason', NULL);
  END IF;

  -- 2. Must be a draft to (re)finalize.
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'BOOKING_NOT_DRAFT' USING DETAIL = coalesce(v_status,'<null>');
  END IF;

  -- 3. Deposit must be fresh ('unpaid') or a mid-core re-entry ('paid'); anything
  --    else (e.g. 'paid_confirm_failed') is a manual-resolution state — fail closed.
  IF v_dep_status NOT IN ('unpaid','paid') THEN
    RAISE EXCEPTION 'BOOKING_DEPOSIT_UNEXPECTED_STATUS' USING DETAIL = coalesce(v_dep_status,'<null>');
  END IF;
  -- R3: a mid-core re-entry must present the same amount already recorded.
  IF v_dep_status = 'paid' AND round(p_amount, 2) IS DISTINCT FROM v_paid_amount THEN
    RAISE EXCEPTION 'BOOKING_DEPOSIT_AMOUNT_MISMATCH'
      USING DETAIL = format('stored=%s requested=%s', v_paid_amount, round(p_amount,2));
  END IF;

  -- ── ATOMIC MONEY CORE ───────────────────────────────────────────────────────
  -- W2: held-balance liability (idempotent on unique(source_type,source_id,event_type)).
  INSERT INTO public.rental_held_balance_events
    (rental_booking_id, event_type, amount, currency_code, status,
     source_type, source_id, idempotency_key, metadata)
  VALUES
    (p_booking_id, 'booking_deposit_collection', p_amount, v_currency, 'posted',
     p_source_type, p_source_id, p_idempotency_key, coalesce(p_event_metadata,'{}'::jsonb))
  ON CONFLICT (source_type, source_id, event_type) DO NOTHING;

  SELECT id INTO v_event_id FROM public.rental_held_balance_events
    WHERE source_type = p_source_type AND source_id = p_source_id
      AND event_type = 'booking_deposit_collection';
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'HELD_BALANCE_EVENT_WRITE_FAILED';  -- fail closed → full rollback
  END IF;

  -- W3: deposit-paid fields (guarded → idempotent no-op if already paid).
  UPDATE public.rental_bookings
     SET booking_deposit_payment_status = 'paid',
         booking_deposit_paid_amount    = p_amount,
         booking_deposit_paid_at        = now(),
         booking_deposit_pos_attempt_id = coalesce(p_attempt_id, booking_deposit_pos_attempt_id)
   WHERE id = p_booking_id
     AND booking_deposit_payment_status = 'unpaid';

  -- W1: POS attempt → paid (only reached if held + deposit succeeded).
  IF p_attempt_id IS NOT NULL THEN
    UPDATE public.pos_rental_payment_attempts
       SET status = 'paid', paid_at = now()
     WHERE id = p_attempt_id
       AND status IN ('finalizing','pending','requires_action');
  END IF;

  -- ── W4: CONFIRM (savepoint-isolated; mig-058 trigger enforces overlap) ───────
  BEGIN
    UPDATE public.rental_bookings
       SET status = 'confirmed'
     WHERE id = p_booking_id AND status = 'draft';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BOOKING_CONFIRM_NO_ROW';
    END IF;
  EXCEPTION
    WHEN sqlstate '23P01' THEN v_conflict := true; v_reason := 'RENTAL_BOOKING_CONFLICT';
    WHEN sqlstate '23514' THEN v_conflict := true; v_reason := 'RENTAL_BOOKING_DATE_INVALID';
  END;

  IF v_conflict THEN
    -- Money core stays committed; flag paid_confirm_failed (manual review).
    UPDATE public.rental_bookings
       SET booking_deposit_payment_status        = 'paid_confirm_failed',
           booking_deposit_confirm_failed_at      = now(),
           booking_deposit_confirm_failure_reason = v_reason
     WHERE id = p_booking_id;
    IF p_attempt_id IS NOT NULL THEN
      UPDATE public.pos_rental_payment_attempts
         SET status = 'paid_confirm_failed', confirm_failed_at = now(),
             confirm_failure_reason = v_reason
       WHERE id = p_attempt_id;
    END IF;
    RETURN jsonb_build_object(
      'status','paid_confirm_failed','idempotent',false,
      'booking_deposit_paid_amount', p_amount,
      'currency_code', v_currency,
      'held_balance_event_id', v_event_id,
      'confirm_failure_reason', v_reason);
  END IF;

  RETURN jsonb_build_object(
    'status','confirmed','idempotent',false,
    'booking_deposit_paid_amount', p_amount,
    'currency_code', v_currency,
    'held_balance_event_id', v_event_id,
    'confirm_failure_reason', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.f_confirm_rental_booking_deposit(
  uuid, text, text, uuid, numeric, text, text, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_confirm_rental_booking_deposit(
  uuid, text, text, uuid, numeric, text, text, text, uuid, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.f_confirm_rental_booking_deposit(
  uuid, text, text, uuid, numeric, text, text, text, uuid, text, jsonb
) IS
  'G2 (ratification audit F4; deep audit P2.5; DECISIONS 2026-07-09): atomic booking-deposit money core (held-balance event + deposit fields + POS attempt→paid) + draft→confirmed via mig-058 overlap guard. Fail-closed; idempotent/re-entrant (fixes cash W1→W2 crash gap); replay/re-entry amount-guarded. Confirm is savepoint-isolated so a genuine overlap conflict returns paid_confirm_failed with the money core kept. service_role only. W5 document issuance stays outside this txn.';

-- Assertion: function exists with the expected argument signature.
DO $$
BEGIN
  IF to_regprocedure(
    'public.f_confirm_rental_booking_deposit(uuid,text,text,uuid,numeric,text,text,text,uuid,text,jsonb)'
  ) IS NULL THEN
    RAISE EXCEPTION 'migration 119: f_confirm_rental_booking_deposit not created with expected signature';
  END IF;
END $$;
