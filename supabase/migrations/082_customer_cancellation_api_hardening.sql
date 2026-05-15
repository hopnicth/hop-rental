-- 082: Customer cancellation API idempotency/concurrency hardening.
-- Keeps the C.1B self-service cancellation flow from creating duplicate
-- customer cancellation events or Booking Deposit refund obligations.

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_booking_cancellation_events_one_customer_web_per_booking
  ON public.rental_booking_cancellation_events(booking_id)
  WHERE cancellation_initiator = 'customer'
    AND cancellation_source = 'customer_web';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_refunds_one_booking_deposit_per_booking
  ON public.payment_refunds(booking_id)
  WHERE refund_type = 'rental_booking_deposit';

COMMENT ON INDEX public.idx_rental_booking_cancellation_events_one_customer_web_per_booking IS
  'Idempotency guard: a rental booking can have only one customer_web self-service cancellation event.';

COMMENT ON INDEX public.idx_payment_refunds_one_booking_deposit_per_booking IS
  'Idempotency guard: a rental booking can have only one manual Booking Deposit refund request.';

CREATE OR REPLACE FUNCTION public.f_cancel_customer_rental_booking_refund_request(
  p_booking_id UUID,
  p_user_id UUID,
  p_cancelled_at TIMESTAMPTZ,
  p_cancellation_reason_code TEXT,
  p_cancellation_reason_note TEXT,
  p_pickup_local_date DATE,
  p_cancellation_local_date DATE,
  p_refund_cutoff_date DATE,
  p_refund_policy_version TEXT,
  p_refund_timezone TEXT,
  p_refund_amount NUMERIC,
  p_original_payment_source_type TEXT,
  p_original_rental_booking_payment_attempt_id UUID,
  p_original_mixed_payment_allocation_id UUID,
  p_gateway public.payment_gateway,
  p_gateway_charge_id TEXT,
  p_gateway_payment_reference TEXT,
  p_currency_code TEXT,
  p_refund_bank_name TEXT,
  p_refund_bank_account_number TEXT,
  p_refund_bank_account_name TEXT,
  p_refund_contact_phone TEXT,
  p_refund_customer_note TEXT,
  p_restriction_window_started_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.rental_bookings%ROWTYPE;
  v_updated_booking public.rental_bookings%ROWTYPE;
  v_event public.rental_booking_cancellation_events%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_existing_event public.rental_booking_cancellation_events%ROWTYPE;
  v_existing_refund public.payment_refunds%ROWTYPE;
  v_count INTEGER := 0;
  v_restriction_status TEXT := 'none';
BEGIN
  SELECT * INTO v_booking
  FROM public.rental_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF v_booking.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'BOOKING_ACCESS_DENIED';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    SELECT * INTO v_existing_event
    FROM public.rental_booking_cancellation_events
    WHERE booking_id = p_booking_id
      AND cancellation_initiator = 'customer'
      AND cancellation_source = 'customer_web'
    ORDER BY cancelled_at DESC
    LIMIT 1;

    IF v_existing_event.id IS NOT NULL THEN
      SELECT * INTO v_existing_refund
      FROM public.payment_refunds
      WHERE cancellation_event_id = v_existing_event.id
      LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'alreadyCancelled', true,
      'bookingId', p_booking_id,
      'cancellationEventId', v_existing_event.id,
      'refundRequest', to_jsonb(v_existing_refund)
    );
  END IF;

  IF v_booking.status = 'draft' THEN
    RAISE EXCEPTION 'BOOKING_NOT_CONFIRMED';
  END IF;
  IF v_booking.status IN ('picked_up', 'returned') THEN
    RAISE EXCEPTION 'BOOKING_ALREADY_FULFILLED';
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'BOOKING_NOT_CANCELLABLE';
  END IF;
  IF v_booking.booking_deposit_payment_status <> 'paid' THEN
    RAISE EXCEPTION 'BOOKING_DEPOSIT_NOT_PAID';
  END IF;
  IF p_refund_amount <= 0 THEN
    RAISE EXCEPTION 'BOOKING_DEPOSIT_REFUND_AMOUNT_NOT_RESOLVED';
  END IF;
  IF p_cancellation_local_date > p_refund_cutoff_date THEN
    RAISE EXCEPTION 'CANCELLATION_REFUND_CUTOFF_PASSED';
  END IF;
  IF p_original_payment_source_type = 'rental_booking_payment_attempt'
     AND p_original_rental_booking_payment_attempt_id IS NULL THEN
    RAISE EXCEPTION 'ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED';
  END IF;
  IF p_original_payment_source_type = 'mixed_payment_allocation'
     AND p_original_mixed_payment_allocation_id IS NULL THEN
    RAISE EXCEPTION 'ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED';
  END IF;

  -- Serialize cancellation restriction counting per customer. Without this lock,
  -- concurrent cancellations of different bookings by the same user can both count
  -- the same prior total and miss applying the >5 restriction.
  PERFORM 1
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_ACCESS_DENIED';
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
    p_booking_id, p_user_id, p_user_id, 'customer', p_cancelled_at,
    'customer', 'customer_web', NULLIF(trim(coalesce(p_cancellation_reason_code, '')), ''),
    NULLIF(trim(coalesce(p_cancellation_reason_note, '')), ''), v_booking.status,
    v_booking.booking_deposit_payment_status, p_pickup_local_date,
    p_cancellation_local_date, p_refund_cutoff_date,
    p_refund_policy_version, p_refund_timezone, true, p_refund_amount,
    true, jsonb_build_object('originalPaymentSourceType', p_original_payment_source_type)
  ) RETURNING * INTO v_event;

  UPDATE public.rental_bookings
  SET status = 'cancelled',
      cancelled_at = p_cancelled_at,
      cancelled_by_user_id = p_user_id,
      cancellation_initiator = 'customer',
      cancellation_source = 'customer_web',
      cancellation_reason = COALESCE(
        NULLIF(trim(coalesce(p_cancellation_reason_note, '')), ''),
        NULLIF(trim(coalesce(p_cancellation_reason_code, '')), '')
      ),
      cancellation_source_event_id = v_event.id,
      cancellation_refund_eligible = true,
      cancellation_refund_amount_due = p_refund_amount,
      cancellation_refund_cutoff_date = p_refund_cutoff_date
  WHERE id = p_booking_id
    AND status = 'confirmed'
  RETURNING * INTO v_updated_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_CANCELLATION_CONFLICT';
  END IF;

  INSERT INTO public.payment_refunds (
    refund_type, booking_id, user_id, cancellation_event_id,
    original_payment_source_type, original_rental_booking_payment_attempt_id,
    original_mixed_payment_allocation_id, gateway, gateway_charge_id,
    gateway_payment_reference, refund_amount, currency_code,
    refund_bank_name, refund_bank_account_number, refund_bank_account_name,
    refund_contact_phone, customer_note, customer_confirmed_destination_at,
    status, requested_at, metadata
  ) VALUES (
    'rental_booking_deposit', p_booking_id, p_user_id, v_event.id,
    p_original_payment_source_type, p_original_rental_booking_payment_attempt_id,
    p_original_mixed_payment_allocation_id, p_gateway, p_gateway_charge_id,
    p_gateway_payment_reference, p_refund_amount, upper(p_currency_code),
    p_refund_bank_name, p_refund_bank_account_number, p_refund_bank_account_name,
    p_refund_contact_phone, NULLIF(trim(coalesce(p_refund_customer_note, '')), ''),
    p_cancelled_at, 'pending_admin_review', p_cancelled_at,
    jsonb_build_object('cancellationPolicyVersion', p_refund_policy_version)
  ) RETURNING * INTO v_refund;

  SELECT count(*) INTO v_count
  FROM public.rental_booking_cancellation_events
  WHERE user_id = p_user_id
    AND qualifies_for_restriction = true
    AND cancelled_at >= p_restriction_window_started_at
    AND cancelled_at <= p_cancelled_at;

  UPDATE public.rental_booking_cancellation_events
  SET qualifying_cancellation_count_after = v_count,
      restriction_window_started_at = p_restriction_window_started_at
  WHERE id = v_event.id
  RETURNING * INTO v_event;

  IF v_count > 5 THEN
    v_restriction_status := 'restricted';
    UPDATE public.users
    SET rental_booking_restriction_status = 'restricted',
        rental_booking_restriction_applied_at = p_cancelled_at,
        rental_booking_restriction_reason = 'excessive_customer_rental_cancellations',
        rental_booking_restriction_source_event_id = v_event.id,
        rental_booking_restriction_cancellation_count = v_count,
        rental_booking_restriction_window_started_at = p_restriction_window_started_at
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyCancelled', false,
    'booking', to_jsonb(v_updated_booking),
    'cancellationEvent', to_jsonb(v_event),
    'refund', to_jsonb(v_refund),
    'restriction', jsonb_build_object(
      'status', v_restriction_status,
      'count', v_count,
      'windowStartedAt', p_restriction_window_started_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_cancel_customer_rental_booking_refund_request(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT, NUMERIC,
  TEXT, UUID, UUID, public.payment_gateway, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.f_cancel_customer_rental_booking_refund_request(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT, NUMERIC,
  TEXT, UUID, UUID, public.payment_gateway, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TIMESTAMPTZ
) TO service_role;