-- 056: Admin walk-in customer capture and rental fulfillment events

ALTER TYPE public.rental_booking_status ADD VALUE IF NOT EXISTS 'picked_up';
ALTER TYPE public.rental_booking_status ADD VALUE IF NOT EXISTS 'returned';

CREATE TABLE IF NOT EXISTS public.walk_in_customers (
  phone TEXT PRIMARY KEY,
  full_name TEXT,
  linked_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  id_card_url TEXT,
  id_card_storage_path TEXT,
  notes TEXT,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(trim(phone)) > 0)
);

COMMENT ON TABLE public.walk_in_customers IS
  'Phone-primary customer records captured by admins for walk-in bookings before an auth account exists.';
COMMENT ON COLUMN public.walk_in_customers.id_card_storage_path IS
  'Storage path in catalog-media under customer-ids/ used for cleanup/audit.';

CREATE INDEX IF NOT EXISTS idx_walk_in_customers_linked_user
  ON public.walk_in_customers(linked_user_id);

DROP TRIGGER IF EXISTS set_walk_in_customers_updated_at ON public.walk_in_customers;
CREATE TRIGGER set_walk_in_customers_updated_at
  BEFORE UPDATE ON public.walk_in_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.rental_booking_fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('pickup', 'return')),
  status_after public.rental_booking_status NOT NULL,
  signature_url TEXT,
  signature_storage_path TEXT,
  notes TEXT,
  performed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_booking_fulfillments IS
  'Admin pickup/return audit events including optional customer digital signatures.';

CREATE INDEX IF NOT EXISTS idx_rental_booking_fulfillments_booking
  ON public.rental_booking_fulfillments(booking_id, created_at DESC);