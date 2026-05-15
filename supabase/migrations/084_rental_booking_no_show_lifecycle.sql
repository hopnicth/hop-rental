-- 084: Rental booking no-show lifecycle foundation.
-- Focused no-show support only: no late-cancellation changes, no cron jobs,
-- no refund rows, no POS V2, and no official accounting documents.

ALTER TYPE public.rental_booking_status ADD VALUE IF NOT EXISTS 'no_show';

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_marked_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS no_show_reason TEXT,
  ADD COLUMN IF NOT EXISTS no_show_source_event_id UUID;

CREATE TABLE IF NOT EXISTS public.rental_booking_no_show_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  admin_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pickup_date_snapshot DATE NOT NULL,
  previous_status TEXT NOT NULL DEFAULT 'confirmed',
  previous_deposit_refund_status TEXT,
  deposit_outcome TEXT NOT NULL DEFAULT 'booking_deposit_forfeited_no_refund',
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (previous_status = 'confirmed'),
  CHECK (deposit_outcome IN ('booking_deposit_forfeited_no_refund')),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_booking_no_show_events_booking
  ON public.rental_booking_no_show_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_rental_booking_no_show_events_marked_at
  ON public.rental_booking_no_show_events(marked_at DESC);

ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_no_show_event_fk;
ALTER TABLE public.rental_bookings
  ADD CONSTRAINT rental_bookings_no_show_event_fk
  FOREIGN KEY (no_show_source_event_id)
  REFERENCES public.rental_booking_no_show_events(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rental_bookings_no_show_at
  ON public.rental_bookings(no_show_at DESC)
  WHERE no_show_at IS NOT NULL;

COMMENT ON TABLE public.rental_booking_no_show_events IS
  'Immutable admin no-show events for confirmed rental bookings whose pickup date has passed. No-show retains/forfeits Booking Deposit and does not create payment_refunds rows.';
COMMENT ON COLUMN public.rental_bookings.no_show_at IS
  'Timestamp when staff marked this confirmed rental booking as no-show.';
COMMENT ON COLUMN public.rental_bookings.no_show_marked_by_user_id IS
  'Staff/admin user who marked this rental booking as no-show.';
COMMENT ON COLUMN public.rental_bookings.no_show_reason IS
  'Optional staff note explaining the no-show decision.';
COMMENT ON COLUMN public.rental_bookings.no_show_source_event_id IS
  'Immutable no-show event proving the operational no-show and Booking Deposit no-refund outcome.';