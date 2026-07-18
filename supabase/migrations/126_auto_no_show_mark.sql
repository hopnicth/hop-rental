-- ============================================================
-- 126_auto_no_show_mark.sql
--
-- Scope (decisions.md §b:554-556 + §b addendum items 5 & 8):
--   * f_auto_mark_rental_no_shows() — SECURITY DEFINER RPC, the system's
--     first scheduled job. Auto-marks eligible confirmed bookings no_show
--     and writes the FULL manual-path chain per booking: no_show event →
--     booking flip → disposition event (actor_type='system') → financial
--     recognition → held-balance FORFEITURE (full ledger release).
--   * pg_cron schedule firing daily at 17:00 UTC.
--
-- TIMEZONE (owner addendum 2026-07-19, HARD-CODED policy zone):
--   Business timezone is Asia/Bangkok. 00:00 Bangkok = 17:00 UTC — Thailand
--   has no DST, so this offset is CONSTANT year-round. Eligibility derives
--   the "day after rental start" boundary explicitly via
--   (now() AT TIME ZONE 'Asia/Bangkok')::date — NEVER server-local time,
--   NEVER UTC-truncated now(). start_date is a DATE in Bangkok civil time
--   (house convention, same as toBangkokLocalDate in
--   server/utils/rental-booking-no-show.ts).
--
-- SYSTEM ACTOR (§b addendum item 5): read from system_configs.system_actor
--   ->> 'user_id'. FAIL LOUDLY if the config row is absent — never fall
--   back to a human id or NULL.
--
-- DOCUMENTS: no-show forfeiture DOCUMENTS are NOT issued here (the 068 doc
--   engine is app-side). Parity with manual: metadata records
--   ordinaryReceiptDeferred=true and staff issue them via the existing
--   "Issue missing no-show documents" button on the booking page.
--
-- Per-booking subtransaction: one bad booking never aborts the nightly run;
--   failures are returned in the result jsonb (and visible in cron.job_run_details).
--
-- APPLY NOTES (remote): remote apply requires (1) the SYSTEM ACTOR auth user
--   + system_configs row created first (Auth Admin API — see 125 apply
--   notes), (2) pg_cron enabled on the project.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Pure boundary predicate — the ONE place the no-show day boundary lives.
-- p_start is the booking start DATE (Bangkok civil date, house convention);
-- p_at is the evaluation instant. True = the Bangkok calendar day of p_at is
-- AFTER the start date (i.e. we are past 00:00 Bangkok of the following day).
-- IMMUTABLE-safe: timezone('Asia/Bangkok', timestamptz) is a fixed civil
-- mapping (no DST in Thailand), but Postgres classifies tz conversion STABLE,
-- so mark STABLE.
CREATE OR REPLACE FUNCTION public.f_rental_no_show_boundary_passed(
  p_start date,
  p_at    timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_start < (p_at AT TIME ZONE 'Asia/Bangkok')::date;
$$;

CREATE OR REPLACE FUNCTION public.f_auto_mark_rental_no_shows()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_actor uuid;
  v_today_bkk    date;
  v_booking      record;
  v_event_id     uuid;
  v_disposition  uuid;
  v_forfeit      numeric(12,2);
  v_held         numeric(12,2);
  v_currency     text;
  v_marked       integer := 0;
  v_failures     jsonb := '[]'::jsonb;
BEGIN
  -- SYSTEM ACTOR — fail loudly when absent (never a human id, never NULL).
  SELECT (value->>'user_id')::uuid INTO v_system_actor
    FROM public.system_configs WHERE key = 'system_actor';
  IF v_system_actor IS NULL THEN
    RAISE EXCEPTION 'AUTO_NO_SHOW_SYSTEM_ACTOR_MISSING: system_configs.system_actor is not configured';
  END IF;

  -- Policy boundary: today in Asia/Bangkok (explicit zone arithmetic).
  v_today_bkk := (now() AT TIME ZONE 'Asia/Bangkok')::date;

  FOR v_booking IN
    SELECT id FROM public.rental_bookings
     WHERE status = 'confirmed'
       AND public.f_rental_no_show_boundary_passed(start_date, now())
     ORDER BY start_date
  LOOP
    BEGIN
      -- Row lock + re-check inside the subtransaction.
      PERFORM 1 FROM public.rental_bookings
        WHERE id = v_booking.id AND status = 'confirmed'
        FOR UPDATE;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(booking_deposit_paid_amount, 0),
             COALESCE(NULLIF(upper(currency_code), ''), 'THB')
        INTO v_forfeit, v_currency
        FROM public.rental_bookings WHERE id = v_booking.id;
      -- Disposition forfeited_amount mirrors the manual path: booking-deposit
      -- figure with legacy fallback.
      IF v_forfeit = 0 THEN
        SELECT COALESCE(deposit_paid_amount, 0) INTO v_forfeit
          FROM public.rental_bookings WHERE id = v_booking.id;
      END IF;

      INSERT INTO public.rental_booking_no_show_events
        (booking_id, admin_user_id, marked_at, pickup_date_snapshot,
         previous_status, deposit_outcome, reason, metadata)
      SELECT id, v_system_actor, now(), start_date,
             'confirmed', 'booking_deposit_forfeited_no_refund',
             'auto no-show (00:00 Asia/Bangkok scheduled job)',
             jsonb_build_object('source', 'pg_cron_auto_no_show',
                                'todayBangkok', v_today_bkk)
        FROM public.rental_bookings WHERE id = v_booking.id
      RETURNING id INTO v_event_id;

      UPDATE public.rental_bookings SET
        status = 'no_show',
        no_show_source_event_id = v_event_id,
        deposit_refund_status = 'forfeited',
        deposit_refund_amount = 0,
        deposit_refund_notes = 'Booking Deposit retained/forfeited by no-show policy; refund not applicable.'
      WHERE id = v_booking.id;

      INSERT INTO public.rental_booking_deposit_disposition_events
        (booking_id, user_id, source_event_type, no_show_event_id,
         actor_user_id, actor_type, occurred_at, disposition,
         forfeited_amount, currency_code,
         booking_deposit_payment_source_type, policy_version, reason, metadata)
      SELECT id, user_id, 'no_show', v_event_id,
             v_system_actor, 'system', now(), 'forfeited',
             v_forfeit, v_currency,
             CASE WHEN booking_deposit_payment_attempt_id IS NOT NULL
                    THEN 'rental_booking_payment_attempt'
                  WHEN booking_deposit_mixed_allocation_id IS NOT NULL
                    THEN 'mixed_payment_allocation'
                  ELSE 'legacy_deposit_field' END,
             'booking_deposit_forfeiture_no_show_v1',
             'auto no-show (scheduled job)',
             jsonb_build_object('operationalSource', 'pg_cron_auto_no_show',
                                'noShowEventId', v_event_id)
        FROM public.rental_bookings WHERE id = v_booking.id
      RETURNING id INTO v_disposition;

      INSERT INTO public.financial_recognition_events
        (recognition_type, source_type, source_id, booking_id, recognized_at,
         recognized_amount, currency_code, revenue_category, tax_treatment,
         vat_rate, vat_amount, wht_treatment, wht_rate, wht_amount, status,
         metadata)
      VALUES
        ('booking_deposit_forfeiture_income',
         'rental_booking_deposit_disposition_event', v_disposition,
         v_booking.id, now(), v_forfeit, v_currency,
         'contractual_penalty_damage_deposit_forfeiture',
         'non_vat_contractual_penalty', 0, 0, 'not_subject_to_wht', 0, 0,
         'recognized',
         jsonb_build_object('dispositionEventId', v_disposition,
                            'noShowEventId', v_event_id,
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
       WHERE rental_booking_id = v_booking.id AND status = 'posted';
      IF v_held > 0 THEN
        INSERT INTO public.rental_held_balance_events
          (rental_booking_id, event_type, amount, currency_code, status,
           source_type, source_id, staff_user_id, idempotency_key, metadata)
        VALUES
          (v_booking.id, 'forfeiture', v_held, v_currency, 'posted',
           'no_show_forfeiture', v_event_id::text, v_system_actor,
           'no-show-forfeiture-' || v_event_id::text,
           jsonb_build_object('noShowEventId', v_event_id,
                              'ledgerHeldTotalAtForfeiture', v_held,
                              'source', 'pg_cron_auto_no_show'));
      END IF;

      v_marked := v_marked + 1;
    EXCEPTION
      WHEN unique_violation THEN
        -- Concurrent manual mark won the race (UNIQUE booking_id on
        -- no-show events) — correct outcome, recorded distinctly.
        v_failures := v_failures || jsonb_build_object(
          'booking_id', v_booking.id, 'skipped', 'concurrent_manual_mark');
      WHEN others THEN
        v_failures := v_failures || jsonb_build_object(
          'booking_id', v_booking.id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'marked', v_marked,
    'today_bangkok', v_today_bkk,
    'failures', v_failures
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_auto_mark_rental_no_shows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_auto_mark_rental_no_shows() TO service_role;

-- Daily at 17:00 UTC = 00:00 Asia/Bangkok (constant offset — no Thai DST).
-- cron.schedule upserts by job name (idempotent re-apply).
SELECT cron.schedule(
  'rental-no-show-auto-mark',
  '0 17 * * *',
  $cron$SELECT public.f_auto_mark_rental_no_shows();$cron$
);
