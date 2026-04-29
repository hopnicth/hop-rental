-- 048: Payment attempts, webhook logs, and payment alerts for Omise / Opn

CREATE TYPE public.payment_gateway AS ENUM ('omise');
CREATE TYPE public.payment_attempt_method AS ENUM ('credit_card', 'promptpay');
CREATE TYPE public.payment_attempt_status AS ENUM (
  'created',
  'pending',
  'requires_action',
  'paid',
  'failed',
  'expired',
  'cancelled',
  'refunded'
);
CREATE TYPE public.payment_event_status AS ENUM (
  'received',
  'processed',
  'ignored',
  'failed'
);

CREATE TABLE public.order_idempotency_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  request_hash    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE public.payment_attempts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gateway              public.payment_gateway NOT NULL DEFAULT 'omise',
  method               public.payment_attempt_method NOT NULL,
  status               public.payment_attempt_status NOT NULL DEFAULT 'created',
  amount               NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency_code        TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  idempotency_key      TEXT NOT NULL,
  gateway_charge_id    TEXT,
  gateway_source_id    TEXT,
  gateway_authorize_uri TEXT,
  qr_image_url         TEXT,
  expires_at           TIMESTAMPTZ,
  failure_code         TEXT,
  failure_message      TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}'::JSONB,
  raw_gateway_response JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, idempotency_key)
);

CREATE TABLE public.payment_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id UUID REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  order_id           UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  gateway            public.payment_gateway NOT NULL DEFAULT 'omise',
  gateway_event_id   TEXT,
  event_type         TEXT NOT NULL,
  gateway_charge_id  TEXT,
  status             public.payment_event_status NOT NULL DEFAULT 'received',
  raw_payload        JSONB NOT NULL DEFAULT '{}'::JSONB,
  signature_header   TEXT,
  processing_error   TEXT,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at       TIMESTAMPTZ
);

CREATE TABLE public.payment_alerts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_attempt_id UUID REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  kind               TEXT NOT NULL,
  audience           TEXT NOT NULL CHECK (audience IN ('admin', 'user')),
  severity           TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message            TEXT NOT NULL,
  metadata           JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_payment_attempts_gateway_charge_unique
  ON public.payment_attempts(gateway, gateway_charge_id)
  WHERE gateway_charge_id IS NOT NULL;

CREATE UNIQUE INDEX idx_payment_attempts_one_paid_per_order
  ON public.payment_attempts(order_id)
  WHERE status = 'paid';

CREATE UNIQUE INDEX idx_payment_events_gateway_event_unique
  ON public.payment_events(gateway, gateway_event_id)
  WHERE gateway_event_id IS NOT NULL;

CREATE INDEX idx_payment_attempts_order_created
  ON public.payment_attempts(order_id, created_at DESC);

CREATE INDEX idx_payment_attempts_user_created
  ON public.payment_attempts(user_id, created_at DESC);

CREATE INDEX idx_payment_events_charge
  ON public.payment_events(gateway, gateway_charge_id);

CREATE TRIGGER set_payment_attempts_updated_at
  BEFORE UPDATE ON public.payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.order_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_attempts_select_own"
  ON public.payment_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "payment_events_select_via_own_attempt"
  ON public.payment_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_attempts pa
      WHERE pa.id = payment_events.payment_attempt_id
        AND pa.user_id = auth.uid()
    )
  );

CREATE POLICY "payment_alerts_select_own_user_alerts"
  ON public.payment_alerts FOR SELECT
  USING (
    audience = 'user'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_alerts.order_id
        AND o.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.payment_attempts IS 'One row per gateway charge attempt; never stores raw card data.';
COMMENT ON TABLE public.payment_events IS 'Idempotent raw webhook/event log for gateway callbacks.';
COMMENT ON TABLE public.payment_alerts IS 'Operational/user notification queue for payment lifecycle events.';