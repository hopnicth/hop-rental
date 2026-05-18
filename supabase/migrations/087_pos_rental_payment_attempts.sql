-- 087: POS rental payment attempts — Phase 2B cash Booking Deposit finalization.
-- Adds public.pos_rental_payment_attempts as the POS-specific durable payment source
-- for rental money collection, beginning with cash Booking Deposit only.
-- No PromptPay, card, bank transfer, UI, pickup, same-day, return, WHT, or POS V2 changes.

CREATE TABLE IF NOT EXISTS public.pos_rental_payment_attempts (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_booking_id      UUID        NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  payment_purpose        TEXT        NOT NULL,
  payment_method         TEXT        NOT NULL,
  amount                 NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency_code          TEXT        NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  status                 TEXT        NOT NULL,
  branch_id              TEXT        REFERENCES public.store_branches(id) ON DELETE RESTRICT,
  staff_user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  idempotency_key        TEXT        NOT NULL,
  paid_at                TIMESTAMPTZ,
  failed_at              TIMESTAMPTZ,
  confirm_failed_at      TIMESTAMPTZ,
  confirm_failure_reason TEXT,
  metadata               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rental_booking_id, idempotency_key),
  CHECK (payment_purpose IN ('booking_deposit')),
  CHECK (payment_method IN ('cash')),
  CHECK (status IN ('paid', 'paid_confirm_failed', 'failed', 'cancelled')),
  CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.pos_rental_payment_attempts IS
  'POS V3 Phase 2B: durable POS-specific payment source for rental money collection. Phase 2B scope: cash Booking Deposit only.';
COMMENT ON COLUMN public.pos_rental_payment_attempts.payment_purpose IS
  'Phase 2B: booking_deposit only. Future: pickup_collection, same_day_collection, etc.';
COMMENT ON COLUMN public.pos_rental_payment_attempts.payment_method IS
  'Phase 2B: cash only. Future: promptpay, card, etc.';
COMMENT ON COLUMN public.pos_rental_payment_attempts.status IS
  'paid = collected and booking confirmed (or confirmation attempted). paid_confirm_failed = payment collected but confirmation failed; requires manual review. failed/cancelled = collection did not succeed.';

-- Prevent duplicate successful Booking Deposit collection for the same booking.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_rental_payment_attempts_one_paid_deposit
  ON public.pos_rental_payment_attempts(rental_booking_id, payment_purpose)
  WHERE status = 'paid' AND payment_purpose = 'booking_deposit';

CREATE INDEX IF NOT EXISTS idx_pos_rental_payment_attempts_booking_created
  ON public.pos_rental_payment_attempts(rental_booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_rental_payment_attempts_status
  ON public.pos_rental_payment_attempts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_rental_payment_attempts_branch_created
  ON public.pos_rental_payment_attempts(branch_id, created_at DESC)
  WHERE branch_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_pos_rental_payment_attempts_updated_at
  ON public.pos_rental_payment_attempts;
CREATE TRIGGER set_pos_rental_payment_attempts_updated_at
  BEFORE UPDATE ON public.pos_rental_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.pos_rental_payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_rental_payment_attempts_service_role_all"
  ON public.pos_rental_payment_attempts;
CREATE POLICY "pos_rental_payment_attempts_service_role_all"
  ON public.pos_rental_payment_attempts FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON public.pos_rental_payment_attempts FROM anon, authenticated;
GRANT ALL ON public.pos_rental_payment_attempts TO service_role;

-- Link the booking deposit POS attempt back to rental_bookings.
ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS booking_deposit_pos_attempt_id UUID
    REFERENCES public.pos_rental_payment_attempts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rental_bookings.booking_deposit_pos_attempt_id IS
  'POS V3 Phase 2B: references pos_rental_payment_attempts row that collected the Booking Deposit cash. NULL for online / non-POS bookings.';
