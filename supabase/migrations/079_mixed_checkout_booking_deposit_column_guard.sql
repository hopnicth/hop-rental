-- 079: Guard mixed checkout finalization against environments missing
-- Booking Deposit payment columns from migration 076.

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS booking_deposit_payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS booking_deposit_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (booking_deposit_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS booking_deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_deposit_payment_attempt_id UUID REFERENCES public.rental_booking_payment_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_deposit_confirm_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_deposit_confirm_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS booking_deposit_mixed_allocation_id UUID REFERENCES public.mixed_payment_allocations(id) ON DELETE SET NULL;

ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_booking_deposit_payment_status_check;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT rental_bookings_booking_deposit_payment_status_check CHECK (
    booking_deposit_payment_status IN (
      'unpaid', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'paid_confirm_failed'
    )
  );