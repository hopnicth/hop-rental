-- ============================================================
-- 130_refund_mark_refunded_ledger_release.sql
--
-- Scope:
--   * f_mark_rental_booking_refund_refunded: atomic money writer for the
--     admin mark-refunded transition on rental booking-deposit refunds.
--     payment_refunds → 'refunded' + full held-balance ledger release +
--     residue-0 assertion + cancel_refund action-log row, ONE transaction.
--
-- Key design decisions:
--   * Design contract: docs/design/2026-07-19-t3-t4-unified-cancel-and-documents.md
--     §A case 1/3 (refund-side ledger close), deferred-release guard (b),
--     annex #7 lock convention (booking first).
--   * EVIDENCE BEFORE MONEY: manual_transfer_reference AND a validated refund
--     proof (proof_kind='refund', same booking) are hard requirements — the
--     ledger refund event cannot exist without slip evidence. This TIGHTENS
--     the previous TS behavior where the proof was optional (ratified gate 130).
--   * Full release: refund event amount = net ledger held, DERIVED in-txn
--     (126/129 sign convention); residue re-asserted = 0 (125 discipline).
--   * Status transitions for non-money actions stay in TS; only mark-refunded
--     moves into SQL (it is the only money-writing transition).
--   * Document issuance stays in the TS wrapper (engine work is T4-core).
-- ============================================================

CREATE OR REPLACE FUNCTION public.f_mark_rental_booking_refund_refunded(
  p_refund_id UUID,
  p_actor_user_id UUID,
  p_actor_role TEXT,                    -- 'staff' | 'super_admin'
  p_manual_transfer_reference TEXT DEFAULT NULL,  -- falls back to stored value
  p_refund_proof_id UUID DEFAULT NULL,            -- falls back to linked proof
  p_branch_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id UUID;
  v_refund public.payment_refunds%ROWTYPE;
  v_prev_status TEXT;
  v_proof_id UUID;
  v_proof RECORD;
  v_ref TEXT;
  v_now TIMESTAMPTZ := now();
  v_held NUMERIC := 0;
  v_residue NUMERIC := 0;
  v_currency TEXT;
BEGIN
  IF p_actor_role NOT IN ('staff', 'super_admin') THEN
    RAISE EXCEPTION 'REFUND_ACTOR_ROLE_INVALID';
  END IF;

  -- STANDING LOCK CONVENTION (design annex #7, ratified gate 130): every
  -- money writer touching both rental_bookings and a money row locks the
  -- BOOKING FIRST (125/126/129 order). This writer is keyed on the refund
  -- row, so: unlocked read to resolve booking_id → lock booking → lock and
  -- REVALIDATE the refund row.
  SELECT booking_id INTO v_booking_id
  FROM public.payment_refunds
  WHERE id = p_refund_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUND_NOT_FOUND';
  END IF;

  PERFORM 1 FROM public.rental_bookings
  WHERE id = v_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  SELECT * INTO v_refund
  FROM public.payment_refunds
  WHERE id = p_refund_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUND_NOT_FOUND';
  END IF;

  -- All gates below run on the LOCKED read (the unlocked read resolved
  -- booking_id only; booking_id is immutable on payment_refunds rows).
  IF v_refund.refund_type <> 'rental_booking_deposit' THEN
    RAISE EXCEPTION 'REFUND_TYPE_UNSUPPORTED';
  END IF;
  IF v_refund.status = 'refunded' THEN
    -- Idempotent replay: money already released (residue proven 0 at the
    -- original commit); wrapper handles document reissue paths.
    RETURN jsonb_build_object('ok', true, 'alreadyRefunded', true,
                              'refund', to_jsonb(v_refund));
  END IF;
  IF v_refund.status NOT IN ('pending_admin_review', 'processing') THEN
    RAISE EXCEPTION 'REFUND_TRANSITION_INVALID: %', v_refund.status;
  END IF;
  v_prev_status := v_refund.status;

  v_ref := coalesce(
    NULLIF(trim(coalesce(p_manual_transfer_reference, '')), ''),
    NULLIF(trim(coalesce(v_refund.manual_transfer_reference, '')), ''));
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'MANUAL_TRANSFER_REFERENCE_REQUIRED';
  END IF;

  -- EVIDENCE ORDER: a refund proof is REQUIRED before any money writes.
  v_proof_id := coalesce(p_refund_proof_id, v_refund.refund_proof_id);
  IF v_proof_id IS NULL THEN
    RAISE EXCEPTION 'REFUND_PROOF_REQUIRED';
  END IF;
  SELECT id, booking_id, proof_kind, amount INTO v_proof
  FROM public.rental_booking_deposit_proofs
  WHERE id = v_proof_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUND_PROOF_NOT_FOUND';
  END IF;
  IF v_proof.booking_id IS DISTINCT FROM v_refund.booking_id
     OR v_proof.proof_kind <> 'refund' THEN
    RAISE EXCEPTION 'REFUND_PROOF_MISMATCH';
  END IF;

  -- Full net held, DERIVED (sign convention per 125/126/129).
  SELECT COALESCE(SUM(
    CASE WHEN event_type IN ('booking_deposit_collection',
                             'pickup_held_balance_collection',
                             'same_day_held_balance_collection',
                             'remaining_security_deposit_collection',
                             'settlement_additional_collection')
         THEN amount ELSE -amount END), 0),
         COALESCE(MAX(NULLIF(upper(currency_code), '')), 'THB')
    INTO v_held, v_currency
    FROM public.rental_held_balance_events
   WHERE rental_booking_id = v_refund.booking_id AND status = 'posted';

  IF v_held > 0 AND v_proof.amount <= 0 THEN
    RAISE EXCEPTION 'REFUND_PROOF_AMOUNT_REQUIRED';
  END IF;

  UPDATE public.payment_refunds
  SET status = 'refunded',
      refunded_at = v_now,
      manual_transfer_reference = v_ref,
      refund_proof_id = v_proof_id,
      processed_by_user_id = p_actor_user_id
  WHERE id = p_refund_id
    AND status = v_prev_status
  RETURNING * INTO v_refund;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUND_TRANSITION_CONFLICT';
  END IF;

  IF v_held > 0 THEN
    INSERT INTO public.rental_held_balance_events
      (rental_booking_id, event_type, amount, currency_code, status,
       source_type, source_id, staff_user_id, branch_id, idempotency_key,
       metadata)
    VALUES
      (v_refund.booking_id, 'refund', v_held, v_currency, 'posted',
       'cancellation_refund', p_refund_id::text, p_actor_user_id, p_branch_id,
       'cancellation-refund-' || p_refund_id::text,
       jsonb_build_object('paymentRefundId', p_refund_id,
                          'cancellationEventId', v_refund.cancellation_event_id,
                          'ledgerHeldTotalAtRefund', v_held,
                          'refundProofId', v_proof_id));
  END IF;

  -- Full-release invariant: residue must be 0 (125 discipline).
  SELECT COALESCE(SUM(
    CASE WHEN event_type IN ('booking_deposit_collection',
                             'pickup_held_balance_collection',
                             'same_day_held_balance_collection',
                             'remaining_security_deposit_collection',
                             'settlement_additional_collection')
         THEN amount ELSE -amount END), 0)
    INTO v_residue
    FROM public.rental_held_balance_events
   WHERE rental_booking_id = v_refund.booking_id AND status = 'posted';
  IF v_residue <> 0 THEN
    RAISE EXCEPTION 'CANCEL_REFUND_INVARIANT_VIOLATION: residue %', v_residue;
  END IF;

  INSERT INTO public.rental_booking_deposit_action_logs
    (booking_id, action, staff_user_id, branch_id, old_values, new_values,
     change_summary, reason)
  VALUES
    (v_refund.booking_id, 'cancel_refund', p_actor_user_id, p_branch_id,
     jsonb_build_object('refundStatus', v_prev_status),
     jsonb_build_object('refundStatus', 'refunded',
                        'paymentRefundId', p_refund_id,
                        'ledgerReleasedAmount', v_held,
                        'manualTransferReference', v_ref,
                        'refundProofId', v_proof_id),
     'cancellation refund ' || p_refund_id::text ||
       ' marked refunded; held-balance released in full (' || v_held::text || ')',
     NULL);

  RETURN jsonb_build_object(
    'ok', true, 'alreadyRefunded', false,
    'refund', to_jsonb(v_refund),
    'ledgerReleasedAmount', v_held,
    'ledgerResidue', v_residue
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_mark_rental_booking_refund_refunded(
  UUID, UUID, TEXT, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.f_mark_rental_booking_refund_refunded(
  UUID, UUID, TEXT, TEXT, UUID, TEXT
) TO service_role;

-- Verification: function exists, SECURITY DEFINER, service_role-only EXECUTE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'f_mark_rental_booking_refund_refunded'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'MIG130_VERIFY_FAILED: RPC missing or not SECURITY DEFINER';
  END IF;
END $$;
