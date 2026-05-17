-- 086: Rental held-balance event foundation.
-- POS V3 Model B foundation only: no event writers, finalizer integration,
-- confirmation hardening, POS UI, Return Settlement, WHT, or POS V2 changes.

CREATE TABLE IF NOT EXISTS public.rental_held_balance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  status TEXT NOT NULL DEFAULT 'posted',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  payment_method TEXT,
  branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (event_type IN (
    'booking_deposit_collection',
    'pickup_held_balance_collection',
    'same_day_held_balance_collection',
    'settlement_application',
    'refund',
    'forfeiture'
  )),
  CHECK (status IN ('posted', 'voided')),
  CHECK (char_length(trim(source_type)) > 0),
  CHECK (char_length(trim(source_id)) > 0),
  CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.rental_held_balance_events IS
  'Canonical rental-specific held-balance lifecycle event ledger for POS V3 Model B. Booking/pickup/same-day collections remain held balance until Return Settlement applies, refunds, or forfeits them.';
COMMENT ON COLUMN public.rental_held_balance_events.event_type IS
  'Locked POS V3 held-balance event type. Manual adjustment is intentionally deferred pending policy/approval semantics.';
COMMENT ON COLUMN public.rental_held_balance_events.amount IS
  'Held-balance event amount in currency_code. Pre-settlement collections are liabilities, not rental revenue.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_held_balance_events_source
  ON public.rental_held_balance_events(source_type, source_id, event_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_held_balance_events_idempotency
  ON public.rental_held_balance_events(rental_booking_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rental_held_balance_events_booking
  ON public.rental_held_balance_events(rental_booking_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_held_balance_events_type
  ON public.rental_held_balance_events(event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_held_balance_events_occurred
  ON public.rental_held_balance_events(occurred_at DESC);

CREATE OR REPLACE FUNCTION public.guard_rental_held_balance_event_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.rental_booking_id IS DISTINCT FROM NEW.rental_booking_id
    OR OLD.event_type IS DISTINCT FROM NEW.event_type
    OR OLD.amount IS DISTINCT FROM NEW.amount
    OR OLD.currency_code IS DISTINCT FROM NEW.currency_code
    OR OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
    OR OLD.source_type IS DISTINCT FROM NEW.source_type
    OR OLD.source_id IS DISTINCT FROM NEW.source_id
    OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
    OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
    OR OLD.staff_user_id IS DISTINCT FROM NEW.staff_user_id
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'rental held-balance event evidence is immutable; create a compensating event instead';
  END IF;
  IF OLD.status = 'voided' AND NEW.status <> 'voided' THEN
    RAISE EXCEPTION 'voided rental held-balance events cannot be reposted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_rental_held_balance_event_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rental held-balance events are non-deletable';
END;
$$;

DROP TRIGGER IF EXISTS guard_rental_held_balance_event_updates
  ON public.rental_held_balance_events;
CREATE TRIGGER guard_rental_held_balance_event_updates
  BEFORE UPDATE ON public.rental_held_balance_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_rental_held_balance_event_updates();

DROP TRIGGER IF EXISTS prevent_rental_held_balance_event_delete
  ON public.rental_held_balance_events;
CREATE TRIGGER prevent_rental_held_balance_event_delete
  BEFORE DELETE ON public.rental_held_balance_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_rental_held_balance_event_delete();

ALTER TABLE public.rental_held_balance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_held_balance_events_service_role_all"
  ON public.rental_held_balance_events;
CREATE POLICY "rental_held_balance_events_service_role_all"
  ON public.rental_held_balance_events FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON public.rental_held_balance_events FROM anon, authenticated;
GRANT ALL ON public.rental_held_balance_events TO service_role;