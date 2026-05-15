-- 077: Mixed Checkout backend foundation (Phase 3.2B)
-- Feature-flagged One QR payment tables only. No webhook finalization or documents.

CREATE TABLE IF NOT EXISTS public.mixed_checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cart_id UUID REFERENCES public.carts(id) ON DELETE SET NULL,
  sale_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'validated' CHECK (status IN ('validated','payment_created','paid','finalizing','finalized','partial_finalized','failed','expired','cancelled')),
  checkout_kind TEXT NOT NULL CHECK (checkout_kind IN ('sale_only','rental_deposit_only','mixed')),
  currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  amount_total NUMERIC(12,2) NOT NULL CHECK (amount_total >= 0),
  sale_subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sale_subtotal_amount >= 0),
  shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  booking_deposit_total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (booking_deposit_total_amount >= 0),
  idempotency_key TEXT NOT NULL,
  validation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(validation_snapshot) = 'object'),
  allocation_plan_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(allocation_plan_snapshot) = 'object'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.mixed_payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mixed_checkout_session_id UUID NOT NULL REFERENCES public.mixed_checkout_sessions(id) ON DELETE CASCADE,
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
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  raw_gateway_response JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_gateway_response) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mixed_checkout_session_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.mixed_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mixed_checkout_session_id UUID NOT NULL REFERENCES public.mixed_checkout_sessions(id) ON DELETE CASCADE,
  mixed_payment_attempt_id UUID REFERENCES public.mixed_payment_attempts(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  allocation_type TEXT NOT NULL CHECK (allocation_type IN ('sale_product','shipping','booking_deposit')),
  target_type TEXT NOT NULL CHECK (target_type IN ('order','order_line','shipping','rental_booking')),
  target_id TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  order_line_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  rental_booking_id UUID REFERENCES public.rental_bookings(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  tax_category TEXT NOT NULL,
  wht_rate NUMERIC(6,5) NOT NULL DEFAULT 0 CHECK (wht_rate >= 0),
  wht_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (wht_amount >= 0),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','payment_pending','paid','finalized','paid_confirm_failed','admin_review_required','voided','refunded','partial_refunded')),
  paid_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  failure_code TEXT,
  failure_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    allocation_type <> 'booking_deposit'
    OR (target_type = 'rental_booking' AND rental_booking_id IS NOT NULL AND tax_category = 'partial_refundable_security_deposit' AND wht_rate = 0 AND wht_amount = 0)
  )
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS mixed_checkout_session_id UUID REFERENCES public.mixed_checkout_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mixed_payment_attempt_id UUID REFERENCES public.mixed_payment_attempts(id) ON DELETE SET NULL;

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS booking_deposit_mixed_allocation_id UUID REFERENCES public.mixed_payment_allocations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mixed_payment_attempts_gateway_charge
  ON public.mixed_payment_attempts(gateway, gateway_charge_id) WHERE gateway_charge_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mixed_payment_attempts_one_paid
  ON public.mixed_payment_attempts(mixed_checkout_session_id) WHERE status = 'paid';
CREATE UNIQUE INDEX IF NOT EXISTS idx_mixed_alloc_booking_deposit_once
  ON public.mixed_payment_allocations(mixed_checkout_session_id, rental_booking_id, allocation_type)
  WHERE allocation_type = 'booking_deposit';
CREATE INDEX IF NOT EXISTS idx_mixed_sessions_user_created ON public.mixed_checkout_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mixed_attempts_session_created ON public.mixed_payment_attempts(mixed_checkout_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mixed_allocations_session ON public.mixed_payment_allocations(mixed_checkout_session_id);

DROP TRIGGER IF EXISTS set_mixed_checkout_sessions_updated_at ON public.mixed_checkout_sessions;
CREATE TRIGGER set_mixed_checkout_sessions_updated_at BEFORE UPDATE ON public.mixed_checkout_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS set_mixed_payment_attempts_updated_at ON public.mixed_payment_attempts;
CREATE TRIGGER set_mixed_payment_attempts_updated_at BEFORE UPDATE ON public.mixed_payment_attempts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS set_mixed_payment_allocations_updated_at ON public.mixed_payment_allocations;
CREATE TRIGGER set_mixed_payment_allocations_updated_at BEFORE UPDATE ON public.mixed_payment_allocations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.mixed_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mixed_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mixed_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mixed_checkout_sessions_service_role_all" ON public.mixed_checkout_sessions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "mixed_payment_attempts_service_role_all" ON public.mixed_payment_attempts FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "mixed_payment_allocations_service_role_all" ON public.mixed_payment_allocations FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "mixed_checkout_sessions_select_own" ON public.mixed_checkout_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "mixed_payment_attempts_select_own" ON public.mixed_payment_attempts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "mixed_payment_allocations_select_own" ON public.mixed_payment_allocations FOR SELECT USING (user_id = auth.uid());

GRANT ALL ON public.mixed_checkout_sessions TO service_role;
GRANT ALL ON public.mixed_payment_attempts TO service_role;
GRANT ALL ON public.mixed_payment_allocations TO service_role;
