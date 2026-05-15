-- 067: Capture POS return deposit refund amounts for accounting export.

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS deposit_refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deposit_refund_amount >= 0),
  ADD COLUMN IF NOT EXISTS deposit_refund_notes TEXT;

COMMENT ON COLUMN public.rental_bookings.deposit_refund_amount IS
  'Actual deposit amount to refund/refunded during POS return settlement.';

COMMENT ON COLUMN public.rental_bookings.deposit_refund_notes IS
  'Staff notes or accounting reference for deposit refund settlement.';

CREATE INDEX IF NOT EXISTS idx_rental_bookings_deposit_refund_export
  ON public.rental_bookings(deposit_refund_status, created_at DESC)
  WHERE deposit_refund_amount > 0;

ALTER TABLE public.rental_booking_deposit_action_logs
  DROP CONSTRAINT IF EXISTS rental_booking_deposit_action_logs_action_check;

ALTER TABLE public.rental_booking_deposit_action_logs
  ADD CONSTRAINT rental_booking_deposit_action_logs_action_check
  CHECK (action IN ('manual_update', 'pos_create_override', 'return_refund'));