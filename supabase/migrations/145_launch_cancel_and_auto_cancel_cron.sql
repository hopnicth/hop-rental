-- ============================================================
-- 145_launch_cancel_and_auto_cancel_cron.sql
--
-- Scope (K-1 — the last open merge-blocker):
--   * modl_operation_chk widened by TWO values (J-2 carrying).
--   * f_cancel_rental_booking_launch — the LEAN launch cancel RPC:
--     slot release + status flip + §F log. ZERO money branches.
--   * f_auto_cancel_expired_rental_bookings — the sweep the cron calls.
--   * pg_cron job 'rental-launch-auto-cancel', 00:05 Asia/Bangkok.
--   NOTHING ELSE.
--
-- Key design decisions:
--   * SLOT RELEASE IS THE STATUS FLIP. There is no separate hold record:
--     availability blocks only ('confirmed','picked_up') at BOTH layers —
--     server/utils/rental-booking-availability.ts:22 (BLOCKING_RENTAL_STATUSES)
--     applied at :91, and the mig-058 trigger
--     rental_bookings_prevent_blocking_overlap, whose body opens
--     "IF NEW.status NOT IN ('confirmed','picked_up') THEN RETURN NEW".
--     status='cancelled' frees the slot at both. NO inventory or calendar write.
--   * NO ENUM / COLUMN WIDENING. 'cancelled' is an existing
--     rental_booking_status value; cancelled_at, cancelled_by_user_id,
--     cancellation_reason, cancellation_initiator, cancellation_source all
--     already exist, and their CHECKs already contain 'system' and
--     'system_cleanup'. This migration adds NO column and NO type value.
--   * ZERO MONEY BRANCHES. Reads/writes no deposit, settlement, ledger or
--     document object. The deposit-era columns cancellation_refund_eligible /
--     _amount_due / _cutoff_date are deliberately LEFT NULL — writing them
--     would assert a refund policy that does not exist at launch (§8.8 lesson).
--   * PARALLEL PATH, NOT AN UN-GATE. The four 135-gated RPCs stay gated and
--     byte-untouched; deposit revival remains a config flip.
--   * AUTO vs MANUAL is carried by the OPERATION VALUE, never by a NULL actor
--     (CHiP ruling): initiator='system' selects 'auto_no_show_cancel',
--     everything else 'launch_booking_cancel'.
--   * IDEMPOTENT on an already-cancelled booking: no-op, and writes NO second
--     audit row. Required for cron re-runs and UI double-submit.
--   * BOOKING-FIRST LOCK (standing convention, as in 141/143).
--   * NO-PII: the free-text reason goes to rental_bookings.cancellation_reason
--     and NEVER into money_ops_decision_logs (mig-132 table comment).
--   * Denials are NOT logged in-function (§8.9 standing rule: a log written
--     before a RAISE cannot persist) — refusal is the RPC's job, the audit
--     trail is the wrapper's.
--   * Plain DROP on modl_operation_chk: a wrong constraint name must fail
--     LOUDLY (125:C pattern, as used by 133/134/138/142/144).
--   * PERMANENCE: the two modl values are removable only until first
--     committed use. The cron job is freely removable (137 precedent).
-- ============================================================

-- ── A. modl vocabulary FIRST (J-2: the value must exist before any code writes it)
ALTER TABLE public.money_ops_decision_logs
  DROP CONSTRAINT modl_operation_chk;
ALTER TABLE public.money_ops_decision_logs
  ADD CONSTRAINT modl_operation_chk CHECK (operation IN (
    -- the 14 live values, preserved verbatim from the current constraint
    'company_cancel',
    'late_cancel_forfeit',
    'document_void',
    'sale_cancel_paid',
    'refund_mark_refunded',
    'manual_stock_adjustment',
    'settlement_zero_due_auto_paid',
    'settlement_payment_confirm',
    'settlement_payment_waive',
    'settlement_state_migration_backfill',
    'tax_document_issue',
    'tax_credit_note_issue',
    'settlement_discount_granted',
    'settlement_payment_waive_denied',
    -- [145 NEW] launch cancel, manual (customer / staff / admin / pos)
    'launch_booking_cancel',
    -- [145 NEW] launch cancel, automatic (cron sweep past the pickup date)
    'auto_no_show_cancel'
  ));

-- ── B. The lean launch cancel RPC
CREATE OR REPLACE FUNCTION public.f_cancel_rental_booking_launch(
  p_booking_id    uuid,
  p_actor_user_id uuid,   -- NULL ONLY for the system/cron actor
  p_actor_role    text,
  p_initiator     text,   -- customer | staff | admin | pos | system
  p_source        text,   -- customer_web | admin_rental_detail | admin_pos | pos_history | system_cleanup | support
  p_reason        text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking   public.rental_bookings%ROWTYPE;
  v_is_auto   boolean;
  v_operation text;
  v_now       timestamptz := now();
BEGIN
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_BOOKING_ID_REQUIRED';
  END IF;
  IF p_initiator IS NULL OR p_initiator NOT IN ('customer','staff','admin','pos','system') THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_INITIATOR_INVALID: %', p_initiator;
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('customer_web','admin_rental_detail','admin_pos','pos_history','system_cleanup','support') THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_SOURCE_INVALID: %', p_source;
  END IF;
  IF NULLIF(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_REASON_REQUIRED';
  END IF;

  v_is_auto   := (p_initiator = 'system');
  v_operation := CASE WHEN v_is_auto THEN 'auto_no_show_cancel' ELSE 'launch_booking_cancel' END;
  -- A human cancel must always name its actor; only the cron may be actorless.
  IF NOT v_is_auto AND p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_ACTOR_REQUIRED';
  END IF;

  -- BOOKING FIRST (standing lock convention). No other row lock is taken.
  SELECT * INTO v_booking FROM public.rental_bookings
   WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_BOOKING_NOT_FOUND';
  END IF;

  -- Idempotent no-op: NO second audit row (cron re-run / double submit).
  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', true, 'booking_id', p_booking_id,
      'previous_status', 'cancelled', 'state', 'cancelled',
      'cancelled_at', v_booking.cancelled_at,
      'was_already_cancelled', true, 'operation', NULL);
  END IF;

  IF v_booking.status = 'draft' THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_BOOKING_NOT_CONFIRMED';
  END IF;
  IF v_booking.status = 'picked_up' THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_BOOKING_ALREADY_PICKED_UP';
  END IF;
  IF v_booking.status = 'returned' THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_BOOKING_ALREADY_RETURNED';
  END IF;
  IF v_booking.status = 'no_show' THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_BOOKING_NO_SHOW';
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_BOOKING_NOT_CANCELLABLE: %', v_booking.status;
  END IF;

  -- Money must not exist on this path. A settlement means the booking
  -- reached the money flow; refuse rather than cancel around it.
  IF EXISTS (SELECT 1 FROM public.rental_booking_settlements WHERE booking_id = p_booking_id) THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_SETTLEMENT_EXISTS';
  END IF;

  -- SLOT RELEASE = the status flip. Guarded on the locked status so a
  -- concurrent transition cannot be overwritten.
  UPDATE public.rental_bookings
     SET status                 = 'cancelled',
         cancelled_at           = v_now,
         cancelled_by_user_id   = p_actor_user_id,
         cancellation_reason    = trim(p_reason),
         cancellation_initiator = p_initiator,
         cancellation_source    = p_source
   WHERE id = p_booking_id AND status = 'confirmed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LAUNCH_CANCEL_STATE_CONFLICT';
  END IF;

  -- §F audit. amount/currency stay NULL: nothing was ever collected, and a
  -- 0 would assert a money figure that has no meaning on a free booking.
  INSERT INTO public.money_ops_decision_logs
    (operation, decision, actor_user_id, actor_role, entity_type, entity_id)
  VALUES (v_operation, 'allowed', p_actor_user_id, p_actor_role,
          'rental_booking', p_booking_id);

  RETURN jsonb_build_object(
    'ok', true, 'booking_id', p_booking_id,
    'previous_status', 'confirmed', 'state', 'cancelled',
    'cancelled_at', v_now, 'was_already_cancelled', false,
    'operation', v_operation);
END;
$$;

-- ── C. The sweep the cron calls (one writer: it delegates to the RPC)
CREATE OR REPLACE FUNCTION public.f_auto_cancel_expired_rental_bookings()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today_bkk date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_row       record;
  v_cancelled integer := 0;
  v_failed    integer := 0;
BEGIN
  FOR v_row IN
    SELECT id FROM public.rental_bookings
     WHERE status = 'confirmed'
       AND start_date < v_today_bkk      -- strictly past the pickup date
     ORDER BY start_date
  LOOP
    BEGIN
      PERFORM public.f_cancel_rental_booking_launch(
        v_row.id, NULL, 'system', 'system', 'system_cleanup',
        'Auto-cancelled: pickup date passed without pickup (launch slot release).');
      v_cancelled := v_cancelled + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Per-row isolation: one unexpected row must not jam the nightly sweep
      -- for every other booking. Counted AND warned, never silent.
      v_failed := v_failed + 1;
      RAISE WARNING 'auto-cancel failed for booking %: %', v_row.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('cancelled', v_cancelled, 'failed', v_failed,
                            'today_bangkok', v_today_bkk);
END;
$$;

-- ── D. Grants (wrapper posture: service_role only; no client may execute)
REVOKE ALL ON FUNCTION public.f_cancel_rental_booking_launch(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_cancel_rental_booking_launch(uuid, uuid, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.f_auto_cancel_expired_rental_bookings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_auto_cancel_expired_rental_bookings() TO service_role;

-- ── E. The cron job
-- TIMEZONE CONVERSION (pg_cron schedules in UTC):
--   target 00:05 Asia/Bangkok. Thailand is a CONSTANT UTC+7 and has
--   observed no DST since 1941, so the offset never moves.
--   00:05 ICT − 7h = 17:05 UTC of the PREVIOUS calendar day, all year.
--   => cron expression '5 17 * * *'.
-- The sweep itself derives "today" from (now() AT TIME ZONE 'Asia/Bangkok'),
-- so the DATE boundary is Bangkok-correct regardless of the server clock.
-- cron.schedule upserts by job name (idempotent re-apply) — 126:216-221 pattern.
SELECT cron.schedule(
  'rental-launch-auto-cancel',
  '5 17 * * *',
  $cron$SELECT public.f_auto_cancel_expired_rental_bookings();$cron$
);
