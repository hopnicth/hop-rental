-- 078: Mixed Checkout payment finalization (Phase 3.2D)

ALTER TYPE public.payment_attempt_status ADD VALUE IF NOT EXISTS 'finalizing';
ALTER TYPE public.payment_attempt_status ADD VALUE IF NOT EXISTS 'finalized';
ALTER TYPE public.payment_attempt_status ADD VALUE IF NOT EXISTS 'partial_finalized';
ALTER TYPE public.payment_attempt_status ADD VALUE IF NOT EXISTS 'finalization_failed';

ALTER TABLE public.mixed_checkout_sessions
  DROP CONSTRAINT IF EXISTS mixed_checkout_sessions_status_check;
ALTER TABLE public.mixed_checkout_sessions
  ADD CONSTRAINT mixed_checkout_sessions_status_check
  CHECK (status IN (
    'validated','payment_created','paid','finalizing','finalized',
    'partial_finalized','finalization_failed','failed','expired','cancelled'
  ));

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS mixed_checkout_session_id UUID REFERENCES public.mixed_checkout_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mixed_payment_attempt_id UUID REFERENCES public.mixed_payment_attempts(id) ON DELETE SET NULL;

ALTER TABLE public.payment_alerts
  ADD COLUMN IF NOT EXISTS mixed_checkout_session_id UUID REFERENCES public.mixed_checkout_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mixed_payment_attempt_id UUID REFERENCES public.mixed_payment_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mixed_payment_allocation_id UUID REFERENCES public.mixed_payment_allocations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_events_mixed_session
  ON public.payment_events(mixed_checkout_session_id, received_at DESC)
  WHERE mixed_checkout_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_alerts_mixed_session
  ON public.payment_alerts(mixed_checkout_session_id, created_at DESC)
  WHERE mixed_checkout_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_alerts_mixed_open
  ON public.payment_alerts(mixed_checkout_session_id, kind, resolved_at)
  WHERE mixed_checkout_session_id IS NOT NULL AND audience = 'admin';
