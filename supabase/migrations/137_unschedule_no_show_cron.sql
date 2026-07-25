-- ============================================================
-- 137_unschedule_no_show_cron.sql
--
-- Scope:
--   * Remove the pg_cron schedule for the no-show auto-mark sweep.
--     NOTHING ELSE.
--
-- Key design decisions:
--   * OD-5: under minimal launch there are no deposits to forfeit, so
--     the nightly sweep has no work. Unschedule it.
--   * BELT AND BRACES WITH 135 — neither substitutes for the other:
--       135 gates the FUNCTION (f_auto_mark_rental_no_shows raises
--           DEPOSITS_DISABLED_NO_SHOW_SWEEP while deposits are off),
--       137 removes the SCHEDULE (nothing invokes it nightly).
--     Unscheduling is not gating: the function stays callable manually
--     or by any future scheduler. Gating is not unscheduling: a gated
--     function still gets woken every night to fail. Both are required.
--   * The RPC is RETAINED (parked, not dropped) — as f_auto_mark_
--     rental_no_shows_ungated behind the 135 wrapper. Revival re-adds
--     the schedule via a future migration (statement in this header).
--   * IDEMPOTENT NO-OP when the job is absent. cron.unschedule() RAISES
--     'could not find valid entry for job' on a missing name (verified),
--     which would abort a replayed chain. A migration must survive
--     re-application, so absence is a clean no-op with a NOTICE — the
--     NOTICE is the audit trail in the apply output.
--
-- REVIVAL (for the record — do NOT run here; it belongs in the
-- deposit-revival migration alongside flipping deposits.enabled):
--   SELECT cron.schedule(
--     'rental-no-show-auto-mark',
--     '0 17 * * *',
--     $cron$SELECT public.f_auto_mark_rental_no_shows();$cron$
--   );
-- ============================================================

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobname = 'rental-no-show-auto-mark';

  IF NOT FOUND THEN
    RAISE NOTICE '137: cron job "rental-no-show-auto-mark" not present — no-op (already removed or never scheduled).';
    RETURN;
  END IF;

  PERFORM cron.unschedule('rental-no-show-auto-mark');
  RAISE NOTICE '137: unscheduled cron job "rental-no-show-auto-mark" (jobid %).', v_jobid;
END;
$$;
