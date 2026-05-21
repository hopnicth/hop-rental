-- 093: POS rental payment attempts — Phase 2E-B1.5 remaining security deposit collection.
-- Extends public.pos_rental_payment_attempts.payment_purpose CHECK to include
-- 'remaining_security_deposit' for POS V3 pickup-phase cash deposit collection.
--
-- Scope: constraint extension only.
-- No new tables, no new columns.
-- Same DO-block drop/re-add pattern as migration 092 (payment_method extension).

-- ── 1. Extend payment_purpose CHECK ──────────────────────────────────────────
-- Locate the auto-named constraint (from 087 inline CHECK) and drop it.
-- Re-add with explicit name and extended value list.

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.pos_rental_payment_attempts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_purpose%';
  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.pos_rental_payment_attempts DROP CONSTRAINT %I',
      cname
    );
  END IF;
END $$;

ALTER TABLE public.pos_rental_payment_attempts
  ADD CONSTRAINT pos_rental_payment_attempts_payment_purpose_check
  CHECK (payment_purpose IN (
    'booking_deposit',           -- Phase 2B: collected at draft confirmation
    'remaining_security_deposit' -- Phase 2E-B1.5: remaining balance collected at pickup
  ));

-- ── 2. Unique partial index for remaining security deposit ────────────────────
-- Prevents duplicate successful remaining-deposit collection for the same booking.
-- Mirrors idx_pos_rental_payment_attempts_one_paid_deposit (087) for booking_deposit.

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_rental_payment_attempts_one_paid_remaining_deposit
  ON public.pos_rental_payment_attempts(rental_booking_id, payment_purpose)
  WHERE status = 'paid' AND payment_purpose = 'remaining_security_deposit';

-- ── 3. Update column comment ──────────────────────────────────────────────────

COMMENT ON COLUMN public.pos_rental_payment_attempts.payment_purpose IS
  'Phase 2B: booking_deposit = collected at draft confirmation (cash or QR).
   Phase 2E-B1.5: remaining_security_deposit = remaining security deposit balance collected at pickup (cash only).';

COMMENT ON TABLE public.pos_rental_payment_attempts IS
  'POS V3: durable POS-specific payment source for rental money collection.
   Phase 2B: cash Booking Deposit.
   Phase 2D: PromptPay QR Booking Deposit (gateway columns, QR lifecycle statuses).
   Phase 2E-B1.5: cash Remaining Security Deposit at pickup.';
