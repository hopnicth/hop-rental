-- 073: Rental pickup/return fulfillment audit hardening.
-- Adds only operational evidence/audit fields. This does not implement tax invoices,
-- official receipts, official document numbering, PDFs, or payment_allocations.

ALTER TABLE public.rental_booking_fulfillments
  ADD COLUMN IF NOT EXISTS booking_checklist_id UUID REFERENCES public.rental_booking_checklists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS pickup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rental_booking_fulfillments_checklist
  ON public.rental_booking_fulfillments(booking_checklist_id)
  WHERE booking_checklist_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rental_booking_fulfillments_branch_event
  ON public.rental_booking_fulfillments(branch_id, event_at DESC)
  WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_booking_fulfillments_idempotency
  ON public.rental_booking_fulfillments(booking_id, event_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rental_bookings_pickup_branch_at
  ON public.rental_bookings(pickup_branch_id, pickup_at DESC)
  WHERE pickup_branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rental_bookings_return_branch_at
  ON public.rental_bookings(return_branch_id, returned_at DESC)
  WHERE return_branch_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.rental_booking_fulfillments
    WHERE event_type IN ('pickup', 'return')
    GROUP BY booking_id, event_type
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_booking_fulfillments_one_event
      ON public.rental_booking_fulfillments(booking_id, event_type)
      WHERE event_type IN ('pickup', 'return');
  ELSE
    RAISE NOTICE 'Skipped unique pickup/return fulfillment index because duplicate historical events exist.';
  END IF;
END $$;

COMMENT ON COLUMN public.rental_booking_fulfillments.booking_checklist_id IS
  'Completed pickup/return checklist used as operational evidence for this fulfillment event.';
COMMENT ON COLUMN public.rental_booking_fulfillments.branch_id IS
  'Branch where staff performed the pickup/return fulfillment event.';
COMMENT ON COLUMN public.rental_booking_fulfillments.event_at IS
  'Business timestamp for the pickup/return event, separate from insert created_at.';
COMMENT ON COLUMN public.rental_booking_fulfillments.idempotency_key IS
  'Optional client/server idempotency key to protect staff retry/double-submit flows.';
COMMENT ON COLUMN public.rental_bookings.pickup_at IS
  'Actual operational pickup timestamp recorded by server-side fulfillment.';
COMMENT ON COLUMN public.rental_bookings.returned_at IS
  'Actual operational return timestamp recorded by server-side fulfillment.';
COMMENT ON COLUMN public.rental_bookings.pickup_branch_id IS
  'Actual branch where pickup was completed.';
COMMENT ON COLUMN public.rental_bookings.return_branch_id IS
  'Actual branch where return was completed.';
