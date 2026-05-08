-- 057: POS rental booking creation and deposit proof tracking

ALTER TABLE public.rental_bookings
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS walk_in_phone TEXT REFERENCES public.walk_in_customers(phone) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deposit_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deposit_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS deposit_payment_method TEXT CHECK (deposit_payment_method IN ('cash', 'qr_transfer', 'bank_transfer', 'card', 'other')),
  ADD COLUMN IF NOT EXISTS deposit_payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (deposit_payment_status IN ('unpaid', 'pending_review', 'paid', 'refunded', 'partial_refund')),
  ADD COLUMN IF NOT EXISTS deposit_refund_status TEXT NOT NULL DEFAULT 'not_refunded' CHECK (deposit_refund_status IN ('not_refunded', 'pending', 'refunded', 'forfeited', 'not_applicable')),
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_notes TEXT;

ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_customer_ref_chk;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT rental_bookings_customer_ref_chk
  CHECK (user_id IS NOT NULL OR walk_in_phone IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_walk_in_phone_created
  ON public.rental_bookings(walk_in_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_deposit_status
  ON public.rental_bookings(deposit_payment_status, deposit_refund_status, created_at DESC);

COMMENT ON COLUMN public.rental_bookings.walk_in_phone IS
  'POS walk-in customer reference. Allows rental bookings before the customer has an auth account.';
COMMENT ON COLUMN public.rental_bookings.deposit_paid_amount IS
  'Actual deposit amount received by staff at POS.';
COMMENT ON COLUMN public.rental_bookings.deposit_payment_method IS
  'How the POS deposit was received: cash, QR transfer, bank transfer, card, or other.';
COMMENT ON COLUMN public.rental_bookings.deposit_payment_status IS
  'Deposit collection state for POS/admin workflows.';
COMMENT ON COLUMN public.rental_bookings.deposit_refund_status IS
  'Deposit return state for return/settlement workflows.';

CREATE TABLE IF NOT EXISTS public.rental_booking_deposit_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  proof_kind TEXT NOT NULL DEFAULT 'payment' CHECK (proof_kind IN ('payment', 'refund')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_method TEXT CHECK (payment_method IN ('cash', 'qr_transfer', 'bank_transfer', 'card', 'other')),
  file_url TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'catalog-media',
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  notes TEXT,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_proofs_booking
  ON public.rental_booking_deposit_proofs(booking_id, proof_kind, created_at DESC);

COMMENT ON TABLE public.rental_booking_deposit_proofs IS
  'Uploaded POS deposit/refund proof files such as transfer slips or cash photos.';