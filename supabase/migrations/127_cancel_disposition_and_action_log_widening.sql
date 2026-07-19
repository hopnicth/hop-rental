-- 127: T3 Phase-1 vocabulary widenings + refund method field.
-- Design contract: docs/design/2026-07-19-t3-t4-unified-cancel-and-documents.md
--   (§H mig-127; collision annex #5 action-log, #6 disposition XOR).
-- Ruling 2: new disposition source 'late_cancellation_forfeiture'
--   (policy version 'booking_deposit_forfeiture_late_cancel_v1' is data, not schema —
--    policy_version has an open non-empty CHECK, 085).
-- Ruling 3: payment_refunds.refund_method ('manual_transfer' now, 'gateway_refund'-ready).
-- BACKLOG [SCHEMA] debt: formalize the T2 settlement-resume action value
--   ('return_refund_resume') at the first migration touching the action-log CHECK — this one.
-- No data writes. No backfill (clean-slate go-forward per §b addendum item 6).

-- ============================================================================
-- Part 1: rental_booking_deposit_disposition_events — widen source_event_type
--          + XOR guard. The 085 CHECKs are inline/unnamed; resolve their
--          auto-generated names by definition match, FAIL LOUDLY unless exactly
--          one match each, drop, re-add as NAMED constraints.
-- ============================================================================
DO $$
DECLARE
  v_src_name text;
  v_xor_name text;
BEGIN
  -- The source_event_type vocabulary CHECK: unique by containing the literal
  -- 'admin_agreed_cancellation' WITHOUT referencing the event-id columns.
  SELECT c.conname INTO STRICT v_src_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.rental_booking_deposit_disposition_events'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%admin_agreed_cancellation%'
    AND pg_get_constraintdef(c.oid) NOT LIKE '%no_show_event_id%';

  -- The XOR guard: unique by referencing no_show_event_id.
  SELECT c.conname INTO STRICT v_xor_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.rental_booking_deposit_disposition_events'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%no_show_event_id%';

  EXECUTE format(
    'ALTER TABLE public.rental_booking_deposit_disposition_events DROP CONSTRAINT %I',
    v_src_name);
  EXECUTE format(
    'ALTER TABLE public.rental_booking_deposit_disposition_events DROP CONSTRAINT %I',
    v_xor_name);
EXCEPTION
  WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'MIG127_DISPOSITION_CHECK_RESOLUTION_FAILED: expected exactly one match per pattern';
END $$;

ALTER TABLE public.rental_booking_deposit_disposition_events
  ADD CONSTRAINT rbdde_source_event_type_chk
  CHECK (source_event_type IN (
    'no_show',
    'admin_agreed_cancellation',
    'late_cancellation_forfeiture'
  ));

ALTER TABLE public.rental_booking_deposit_disposition_events
  ADD CONSTRAINT rbdde_source_event_xor_chk
  CHECK (
    (source_event_type = 'no_show'
      AND no_show_event_id IS NOT NULL AND cancellation_event_id IS NULL)
    OR (source_event_type = 'admin_agreed_cancellation'
      AND cancellation_event_id IS NOT NULL AND no_show_event_id IS NULL)
    OR (source_event_type = 'late_cancellation_forfeiture'
      AND cancellation_event_id IS NOT NULL AND no_show_event_id IS NULL)
  );

COMMENT ON CONSTRAINT rbdde_source_event_type_chk
  ON public.rental_booking_deposit_disposition_events IS
  'Closed disposition-source vocabulary. late_cancellation_forfeiture added by 127 (T3 ruling 2); pipeline identical to no_show, anchored to a cancellation event.';

-- ============================================================================
-- Part 2: rental_booking_deposit_action_logs — widen action vocabulary.
-- Named constraint from 067; plain DROP so a wrong name fails loudly.
-- ============================================================================
ALTER TABLE public.rental_booking_deposit_action_logs
  DROP CONSTRAINT rental_booking_deposit_action_logs_action_check;

ALTER TABLE public.rental_booking_deposit_action_logs
  ADD CONSTRAINT rental_booking_deposit_action_logs_action_check
  CHECK (action IN (
    'manual_update',
    'pos_create_override',
    'return_refund',
    'return_refund_resume',
    'cancel_refund',
    'late_cancel_forfeit',
    'company_cancel_refund'
  ));

-- ============================================================================
-- Part 3: payment_refunds.refund_method (ruling 3).
-- Bank-transfer-only today (§b); gateway_refund is the ready state, unused until
-- Omise refunds exist. Existing rows (if any) are manual by definition — the
-- NOT NULL DEFAULT backfills them correctly at ADD COLUMN time.
-- ============================================================================
ALTER TABLE public.payment_refunds
  ADD COLUMN IF NOT EXISTS refund_method TEXT NOT NULL DEFAULT 'manual_transfer';

ALTER TABLE public.payment_refunds
  ADD CONSTRAINT payment_refunds_refund_method_chk
  CHECK (refund_method IN ('manual_transfer', 'gateway_refund'));

COMMENT ON COLUMN public.payment_refunds.refund_method IS
  'How the refund is executed. manual_transfer = staff bank transfer + slip (the only live path, §b). gateway_refund = reserved for future Omise refunds (state machine pending→settled/failed lives on the refund status flow).';

-- ============================================================================
-- Verification (metadata assertions — fail the migration if any widening is absent)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rbdde_source_event_type_chk'
      AND pg_get_constraintdef(oid) LIKE '%late_cancellation_forfeiture%'
  ) THEN
    RAISE EXCEPTION 'MIG127_VERIFY_FAILED: disposition source vocabulary not widened';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rbdde_source_event_xor_chk'
      AND pg_get_constraintdef(oid) LIKE '%late_cancellation_forfeiture%'
  ) THEN
    RAISE EXCEPTION 'MIG127_VERIFY_FAILED: disposition XOR guard not widened';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rental_booking_deposit_action_logs_action_check'
      AND pg_get_constraintdef(oid) LIKE '%company_cancel_refund%'
      AND pg_get_constraintdef(oid) LIKE '%return_refund_resume%'
  ) THEN
    RAISE EXCEPTION 'MIG127_VERIFY_FAILED: action-log vocabulary not widened';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_refunds'
      AND column_name = 'refund_method'
  ) THEN
    RAISE EXCEPTION 'MIG127_VERIFY_FAILED: payment_refunds.refund_method missing';
  END IF;
END $$;
