-- ============================================================
-- 129_cancel_rpcs.sql
--
-- Scope:
--   * f_cancel_rental_booking_admin(p_mode): atomic staff/company rental
--     cancel — 'late_cancel_forfeit' (ruling 2: pipeline identical to
--     no-show) and 'company_cancel_refund' (§b: super_admin, full refund).
--
-- Key design decisions:
--   * Design contract: docs/design/2026-07-19-t3-t4-unified-cancel-and-documents.md §A cases 2/3, annex #3.
--   * One money-writer RPC per entity (T2 pattern); documents/logs stay in wrappers.
--   * Forfeiture tail mirrors 126's chain (disposition → recognition → ledger
--     forfeiture, full release asserted). Policy 'booking_deposit_forfeiture_late_cancel_v1'.
--   * Customer 7-day tier is TS-side (rental-cancellation-policy.ts) — the
--     customer RPC (082) is deliberately NOT touched here.
--   * Company mode re-checks super_admin in-RPC (defence-in-depth, mig-112 style).
--   * B-M1: company mode accepts booking_deposit_payment_status 'paid_confirm_failed'.
--   * MONEY AUTHORITY (gate amendment): company-refund amount is DERIVED in-RPC
--     (booking_deposit_paid_amount, legacy deposit_paid_amount fallback);
--     p_refund_amount is an optional cross-check → REFUND_AMOUNT_MISMATCH.
--   * refund_timezone hardcoded 'Asia/Bangkok' (decisions.md §b addendum item 8).
--   * customer_confirmed_destination_at = p_cancelled_at with
--     metadata.destinationEnteredByStaff=true (column is NOT NULL; destination
--     is staff-entered at company-cancel time, not customer-web-confirmed).
-- ============================================================

CREATE OR REPLACE FUNCTION public.f_cancel_rental_booking_admin(
  p_mode TEXT,                        -- 'late_cancel_forfeit' | 'company_cancel_refund'
  p_booking_id UUID,
  p_actor_user_id UUID,
  p_actor_role TEXT,                  -- 'staff' | 'super_admin' (from requirePlatformAdmin)
  p_reason TEXT,                      -- REQUIRED both modes
  p_cancelled_at TIMESTAMPTZ,
  p_pickup_local_date DATE,
  p_cancellation_local_date DATE,
  p_refund_cutoff_date DATE,          -- 7-day-tier cutoff, caller-computed (policy v2)
  p_refund_policy_version TEXT,
  -- company_cancel_refund only (NULLs for forfeit mode):
  p_refund_amount NUMERIC DEFAULT NULL,   -- optional CROSS-CHECK only; never the authority
  p_original_payment_source_type TEXT DEFAULT NULL,
  p_original_rental_booking_payment_attempt_id UUID DEFAULT NULL,
  p_original_mixed_payment_allocation_id UUID DEFAULT NULL,
  p_gateway public.payment_gateway DEFAULT NULL,
  p_gateway_charge_id TEXT DEFAULT NULL,
  p_gateway_payment_reference TEXT DEFAULT NULL,
  p_currency_code TEXT DEFAULT 'THB',
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
  v_booking public.rental_bookings%ROWTYPE;
  v_event public.rental_booking_cancellation_events%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_actor_type TEXT;
  v_deposit_captured BOOLEAN := false;
  v_refund_full NUMERIC := 0;
  v_forfeit NUMERIC := 0;
  v_currency TEXT := 'THB';
  v_disposition UUID;
  v_held NUMERIC := 0;
  v_residue NUMERIC := 0;
BEGIN
  IF p_mode NOT IN ('late_cancel_forfeit', 'company_cancel_refund') THEN
    RAISE EXCEPTION 'CANCEL_MODE_INVALID';
  END IF;
  IF NULLIF(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CANCEL_REASON_REQUIRED';
  END IF;
  IF NULLIF(trim(coalesce(p_refund_policy_version, '')), '') IS NULL THEN
    RAISE EXCEPTION 'POLICY_VERSION_REQUIRED';
  END IF;
  IF p_actor_role NOT IN ('staff', 'super_admin') THEN
    RAISE EXCEPTION 'CANCEL_ACTOR_ROLE_INVALID';
  END IF;
  -- Defence-in-depth: company-side cancel is SUPER ADMIN only (§b).
  IF p_mode = 'company_cancel_refund' AND p_actor_role <> 'super_admin' THEN
    RAISE EXCEPTION 'COMPANY_CANCEL_SUPER_ADMIN_ONLY';
  END IF;
  v_actor_type := CASE WHEN p_actor_role = 'super_admin' THEN 'admin' ELSE 'staff' END;
  v_currency := upper(coalesce(nullif(trim(coalesce(p_currency_code, '')), ''), 'THB'));

  SELECT * INTO v_booking
  FROM public.rental_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyCancelled', true,
                              'bookingId', p_booking_id);
  END IF;
  IF v_booking.status IN ('picked_up', 'returned') THEN
    RAISE EXCEPTION 'BOOKING_ALREADY_FULFILLED';
  END IF;
  -- Cron-race guard (annex #3): a booking the no-show cron already claimed is
  -- 'no_show' by now and lands here.
  IF v_booking.status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'BOOKING_NOT_CANCELLABLE';
  END IF;

  v_deposit_captured :=
    v_booking.booking_deposit_payment_status IN ('paid', 'paid_confirm_failed');

  IF p_mode = 'late_cancel_forfeit' THEN
    IF v_booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'BOOKING_NOT_CONFIRMED';
    END IF;
    IF v_booking.booking_deposit_payment_status <> 'paid' THEN
      RAISE EXCEPTION 'BOOKING_DEPOSIT_NOT_PAID';
    END IF;
    -- Inside-window guard: while the customer still qualifies for self-serve
    -- refund (≥7d), staff MUST NOT forfeit.
    IF p_cancellation_local_date <= p_refund_cutoff_date THEN
      RAISE EXCEPTION 'LATE_CANCEL_WINDOW_NOT_REACHED';
    END IF;
  ELSIF v_deposit_captured THEN
    -- MONEY AUTHORITY: the full-refund figure is DERIVED here (§b "full
    -- refund ALWAYS" lives in the RPC) — same figure + legacy fallback as
    -- the forfeit/no-show path. p_refund_amount is only a cross-check.
    v_refund_full := COALESCE(v_booking.booking_deposit_paid_amount, 0);
    IF v_refund_full = 0 THEN
      v_refund_full := COALESCE(v_booking.deposit_paid_amount, 0);
    END IF;
    IF v_refund_full <= 0 THEN
      RAISE EXCEPTION 'BOOKING_DEPOSIT_REFUND_AMOUNT_NOT_RESOLVED';
    END IF;
    IF p_refund_amount IS NOT NULL AND p_refund_amount <> v_refund_full THEN
      RAISE EXCEPTION 'REFUND_AMOUNT_MISMATCH: derived %, caller %',
        v_refund_full, p_refund_amount;
    END IF;
    IF p_original_payment_source_type IS NULL
       OR (p_original_payment_source_type = 'rental_booking_payment_attempt'
           AND p_original_rental_booking_payment_attempt_id IS NULL)
       OR (p_original_payment_source_type = 'mixed_payment_allocation'
           AND p_original_mixed_payment_allocation_id IS NULL) THEN
      RAISE EXCEPTION 'ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED';
    END IF;
    -- payment_refunds bank columns are NOT NULL + non-empty CHECKed; fail
    -- with a clear code, not a bare 23502.
    IF NULLIF(trim(coalesce(p_refund_bank_name, '')), '') IS NULL
       OR NULLIF(trim(coalesce(p_refund_bank_account_number, '')), '') IS NULL
       OR NULLIF(trim(coalesce(p_refund_bank_account_name, '')), '') IS NULL
       OR NULLIF(trim(coalesce(p_refund_contact_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'COMPANY_REFUND_BANK_DETAILS_REQUIRED';
    END IF;
  END IF;

  INSERT INTO public.rental_booking_cancellation_events (
    booking_id, user_id, actor_user_id, actor_type, cancelled_at,
    cancellation_initiator, cancellation_source, cancellation_reason_code,
    cancellation_reason_note, previous_status,
    previous_booking_deposit_payment_status, pickup_date_snapshot,
    cancellation_local_date_snapshot, refund_cutoff_date_snapshot,
    refund_policy_version, refund_timezone, refund_eligible, refund_amount_due,
    qualifies_for_restriction, metadata
  ) VALUES (
    p_booking_id, v_booking.user_id, p_actor_user_id, v_actor_type, p_cancelled_at,
    v_actor_type, 'admin_rental_detail',
    CASE WHEN p_mode = 'late_cancel_forfeit'
         THEN 'late_cancellation_forfeiture' ELSE 'company_cancellation' END,
    trim(p_reason), v_booking.status,
    v_booking.booking_deposit_payment_status, p_pickup_local_date,
    p_cancellation_local_date, p_refund_cutoff_date,
    p_refund_policy_version, 'Asia/Bangkok',
    (p_mode = 'company_cancel_refund' AND v_deposit_captured),
    CASE WHEN p_mode = 'company_cancel_refund' THEN v_refund_full ELSE 0 END,
    false,
    jsonb_build_object('cancelMode', p_mode, 'actorRole', p_actor_role)
  ) RETURNING * INTO v_event;

  UPDATE public.rental_bookings
  SET status = 'cancelled',
      cancelled_at = p_cancelled_at,
      cancelled_by_user_id = p_actor_user_id,
      cancellation_initiator = v_actor_type,
      cancellation_source = 'admin_rental_detail',
      cancellation_reason = trim(p_reason),
      cancellation_source_event_id = v_event.id,
      cancellation_refund_eligible = v_event.refund_eligible,
      cancellation_refund_amount_due = v_event.refund_amount_due,
      cancellation_refund_cutoff_date = p_refund_cutoff_date
  WHERE id = p_booking_id
    AND status = v_booking.status
  RETURNING * INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_CANCELLATION_CONFLICT';
  END IF;

  IF p_mode = 'late_cancel_forfeit' THEN
    -- ── Forfeiture tail: byte-mirror of the no-show chain (126) ──
    SELECT COALESCE(booking_deposit_paid_amount, 0),
           COALESCE(NULLIF(upper(currency_code), ''), 'THB')
      INTO v_forfeit, v_currency
      FROM public.rental_bookings WHERE id = p_booking_id;
    IF v_forfeit = 0 THEN
      SELECT COALESCE(deposit_paid_amount, 0) INTO v_forfeit
        FROM public.rental_bookings WHERE id = p_booking_id;
    END IF;

    INSERT INTO public.rental_booking_deposit_disposition_events
      (booking_id, user_id, source_event_type, cancellation_event_id,
       actor_user_id, actor_type, occurred_at, disposition,
       forfeited_amount, currency_code,
       booking_deposit_payment_source_type, policy_version, reason, metadata)
    SELECT id, user_id, 'late_cancellation_forfeiture', v_event.id,
           p_actor_user_id, v_actor_type, now(), 'forfeited',
           v_forfeit, v_currency,
           CASE WHEN booking_deposit_payment_attempt_id IS NOT NULL
                  THEN 'rental_booking_payment_attempt'
                WHEN booking_deposit_mixed_allocation_id IS NOT NULL
                  THEN 'mixed_payment_allocation'
                ELSE 'legacy_deposit_field' END,
           'booking_deposit_forfeiture_late_cancel_v1',
           trim(p_reason),
           jsonb_build_object('cancellationEventId', v_event.id,
                              'cancelMode', 'late_cancel_forfeit')
      FROM public.rental_bookings WHERE id = p_booking_id
    RETURNING id INTO v_disposition;

    INSERT INTO public.financial_recognition_events
      (recognition_type, source_type, source_id, booking_id, recognized_at,
       recognized_amount, currency_code, revenue_category, tax_treatment,
       vat_rate, vat_amount, wht_treatment, wht_rate, wht_amount, status,
       metadata)
    VALUES
      ('booking_deposit_forfeiture_income',
       'rental_booking_deposit_disposition_event', v_disposition,
       p_booking_id, now(), v_forfeit, v_currency,
       'contractual_penalty_damage_deposit_forfeiture',
       'non_vat_contractual_penalty', 0, 0, 'not_subject_to_wht', 0, 0,
       'recognized',
       jsonb_build_object('dispositionEventId', v_disposition,
                          'cancellationEventId', v_event.id,
                          'ordinaryReceiptDeferred', true));

    -- Held-balance FORFEITURE: full ledger release (composition rule).
    SELECT COALESCE(SUM(
      CASE WHEN event_type IN ('booking_deposit_collection',
                               'pickup_held_balance_collection',
                               'same_day_held_balance_collection',
                               'remaining_security_deposit_collection',
                               'settlement_additional_collection')
           THEN amount ELSE -amount END), 0)
      INTO v_held
      FROM public.rental_held_balance_events
     WHERE rental_booking_id = p_booking_id AND status = 'posted';
    IF v_held > 0 THEN
      INSERT INTO public.rental_held_balance_events
        (rental_booking_id, event_type, amount, currency_code, status,
         source_type, source_id, staff_user_id, idempotency_key, metadata)
      VALUES
        (p_booking_id, 'forfeiture', v_held, v_currency, 'posted',
         'late_cancel_forfeiture', v_event.id::text, p_actor_user_id,
         'late-cancel-forfeiture-' || v_event.id::text,
         jsonb_build_object('cancellationEventId', v_event.id,
                            'ledgerHeldTotalAtForfeiture', v_held));
    END IF;

    -- Full-release invariant (125 discipline): residue must be 0.
    SELECT COALESCE(SUM(
      CASE WHEN event_type IN ('booking_deposit_collection',
                               'pickup_held_balance_collection',
                               'same_day_held_balance_collection',
                               'remaining_security_deposit_collection',
                               'settlement_additional_collection')
           THEN amount ELSE -amount END), 0)
      INTO v_residue
      FROM public.rental_held_balance_events
     WHERE rental_booking_id = p_booking_id AND status = 'posted';
    IF v_residue <> 0 THEN
      RAISE EXCEPTION 'LATE_CANCEL_FORFEITURE_INVARIANT_VIOLATION: residue %', v_residue;
    END IF;

  ELSIF v_deposit_captured THEN
    -- ── Company-cancel refund tail: full refund request (081 machinery) ──
    INSERT INTO public.payment_refunds (
      refund_type, booking_id, user_id, cancellation_event_id,
      original_payment_source_type, original_rental_booking_payment_attempt_id,
      original_mixed_payment_allocation_id, gateway, gateway_charge_id,
      gateway_payment_reference, refund_amount, currency_code, refund_method,
      refund_bank_name, refund_bank_account_number, refund_bank_account_name,
      refund_contact_phone, customer_note, customer_confirmed_destination_at,
      status, requested_at, metadata
    ) VALUES (
      'rental_booking_deposit', p_booking_id, v_booking.user_id, v_event.id,
      p_original_payment_source_type, p_original_rental_booking_payment_attempt_id,
      p_original_mixed_payment_allocation_id, p_gateway, p_gateway_charge_id,
      p_gateway_payment_reference, v_refund_full, v_currency,
      'manual_transfer',
      trim(p_refund_bank_name), trim(p_refund_bank_account_number),
      trim(p_refund_bank_account_name), trim(p_refund_contact_phone),
      NULL, p_cancelled_at,
      'pending_admin_review', p_cancelled_at,
      jsonb_build_object('cancelMode', 'company_cancel_refund',
                        'cancellationPolicyVersion', p_refund_policy_version,
                        'companyCancelReason', trim(p_reason),
                        'destinationEnteredByStaff', true)
    ) RETURNING * INTO v_refund;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'alreadyCancelled', false,
    'booking', to_jsonb(v_booking),
    'cancellationEvent', to_jsonb(v_event),
    'dispositionEventId', v_disposition,
    'forfeitedHeldAmount', CASE WHEN p_mode = 'late_cancel_forfeit' THEN v_held END,
    'refund', to_jsonb(v_refund)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_cancel_rental_booking_admin(
  TEXT, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, DATE, DATE, DATE, TEXT,
  NUMERIC, TEXT, UUID, UUID, public.payment_gateway, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.f_cancel_rental_booking_admin(
  TEXT, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, DATE, DATE, DATE, TEXT,
  NUMERIC, TEXT, UUID, UUID, public.payment_gateway, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- Verification: function exists with service_role-only EXECUTE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'f_cancel_rental_booking_admin'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'MIG129_VERIFY_FAILED: RPC missing or not SECURITY DEFINER';
  END IF;
END $$;
