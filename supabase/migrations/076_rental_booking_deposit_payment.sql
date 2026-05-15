-- 076: Online Booking Deposit payment foundation.
-- Phase 3 only: no official receipt, tax invoice, refund/no-show automation, or sale checkout changes.

CREATE TABLE IF NOT EXISTS public.rental_booking_payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gateway public.payment_gateway NOT NULL DEFAULT 'omise',
  method public.payment_attempt_method NOT NULL,
  status public.payment_attempt_status NOT NULL DEFAULT 'created',
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  idempotency_key TEXT NOT NULL,
  gateway_charge_id TEXT,
  gateway_source_id TEXT,
  gateway_authorize_uri TEXT,
  qr_image_url TEXT,
  expires_at TIMESTAMPTZ,
  failure_code TEXT,
  failure_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_gateway_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, idempotency_key),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (jsonb_typeof(raw_gateway_response) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_booking_payment_attempts_gateway_charge
  ON public.rental_booking_payment_attempts(gateway, gateway_charge_id)
  WHERE gateway_charge_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_booking_payment_attempts_one_paid
  ON public.rental_booking_payment_attempts(booking_id)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_rental_booking_payment_attempts_booking_created
  ON public.rental_booking_payment_attempts(booking_id, created_at DESC);

DROP TRIGGER IF EXISTS set_rental_booking_payment_attempts_updated_at
  ON public.rental_booking_payment_attempts;
CREATE TRIGGER set_rental_booking_payment_attempts_updated_at
  BEFORE UPDATE ON public.rental_booking_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS booking_deposit_payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS booking_deposit_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (booking_deposit_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS booking_deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_deposit_payment_attempt_id UUID REFERENCES public.rental_booking_payment_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_deposit_policy_version TEXT NOT NULL DEFAULT 'fixed_booking_deposit_v1',
  ADD COLUMN IF NOT EXISTS booking_deposit_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_deposit_terms_version TEXT,
  ADD COLUMN IF NOT EXISTS booking_deposit_confirm_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_deposit_confirm_failure_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rental_bookings_booking_deposit_payment_status_check'
      AND conrelid = 'public.rental_bookings'::regclass
  ) THEN
    ALTER TABLE public.rental_bookings
      ADD CONSTRAINT rental_bookings_booking_deposit_payment_status_check CHECK (
        booking_deposit_payment_status IN (
          'unpaid', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'paid_confirm_failed'
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.rental_booking_deposit_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  payment_attempt_id UUID REFERENCES public.rental_booking_payment_attempts(id) ON DELETE SET NULL,
  accepted_terms_version TEXT NOT NULL,
  terms_snapshot TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, accepted_terms_version),
  CHECK (char_length(trim(accepted_terms_version)) > 0),
  CHECK (char_length(trim(terms_snapshot)) > 0),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_agreements_booking
  ON public.rental_booking_deposit_agreements(booking_id, accepted_at DESC);

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.rental_bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rental_booking_payment_attempt_id UUID REFERENCES public.rental_booking_payment_attempts(id) ON DELETE SET NULL;

ALTER TABLE public.payment_alerts
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.rental_bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rental_booking_payment_attempt_id UUID REFERENCES public.rental_booking_payment_attempts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_alerts_booking
  ON public.payment_alerts(booking_id, created_at DESC)
  WHERE booking_id IS NOT NULL;

ALTER TABLE public.rental_booking_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_booking_deposit_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_booking_payment_attempts_service_role_all"
  ON public.rental_booking_payment_attempts;
CREATE POLICY "rental_booking_payment_attempts_service_role_all"
  ON public.rental_booking_payment_attempts FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "rental_booking_deposit_agreements_service_role_all"
  ON public.rental_booking_deposit_agreements;
CREATE POLICY "rental_booking_deposit_agreements_service_role_all"
  ON public.rental_booking_deposit_agreements FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON public.rental_booking_payment_attempts TO service_role;
GRANT ALL ON public.rental_booking_deposit_agreements TO service_role;

COMMENT ON COLUMN public.rental_bookings.booking_deposit_payment_status IS
  'Phase 3 online Booking Deposit payment state. Main booking status remains draft until confirm validation succeeds.';