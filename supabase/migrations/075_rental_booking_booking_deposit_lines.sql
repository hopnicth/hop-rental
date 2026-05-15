-- 075: Fixed Booking Deposit delta for rental payment lines.
-- Additive patch only. Does not implement online payments, receipts, tax invoices, or no-show automation.

ALTER TABLE public.rental_booking_payment_lines
  ADD COLUMN IF NOT EXISTS applies_to_security_deposit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reduces_remaining_security_deposit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS applied_to_deposit_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS forfeited_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ NULL;

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.rental_booking_payment_lines'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%line_type%'
        OR pg_get_constraintdef(oid) ILIKE '%tax_category%'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.rental_booking_payment_lines DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.rental_booking_payment_lines
  ADD CONSTRAINT rental_booking_payment_lines_line_type_v2_check CHECK (
    line_type IN (
      'rental_fee',
      'booking_deposit',
      'refundable_security_deposit',
      'delivery_fee',
      'service_fee',
      'insurance_fee',
      'damage_fee',
      'late_fee'
    )
  ),
  ADD CONSTRAINT rental_booking_payment_lines_tax_category_v2_check CHECK (
    tax_category IN (
      'rental_income',
      'partial_refundable_security_deposit',
      'refundable_security_deposit',
      'service_income',
      'insurance_or_coverage',
      'damage_compensation',
      'penalty_income',
      'non_taxable'
    )
  ),
  ADD CONSTRAINT rental_booking_payment_lines_deposit_wht_v2_check CHECK (
    line_type NOT IN ('booking_deposit', 'refundable_security_deposit')
    OR (
      tax_category IN ('partial_refundable_security_deposit', 'refundable_security_deposit')
      AND wht_applicable = FALSE
      AND wht_rate = 0
      AND wht_amount = 0
      AND is_refundable = TRUE
      AND wht_certificate_required = FALSE
    )
  ),
  ADD CONSTRAINT rental_booking_payment_lines_booking_deposit_security_v2_check CHECK (
    line_type <> 'booking_deposit'
    OR (
      tax_category = 'partial_refundable_security_deposit'
      AND applies_to_security_deposit = TRUE
      AND reduces_remaining_security_deposit = TRUE
    )
  );

COMMENT ON COLUMN public.rental_booking_payment_lines.applies_to_security_deposit IS
  'True when this line is part of the refundable security deposit lifecycle, including booking_deposit.';
COMMENT ON COLUMN public.rental_booking_payment_lines.reduces_remaining_security_deposit IS
  'True when this paid line reduces the remaining refundable security deposit due at pickup.';
COMMENT ON COLUMN public.rental_booking_payment_lines.applied_to_deposit_at IS
  'Future lifecycle timestamp when Booking Deposit is applied to the pickup security deposit.';
COMMENT ON COLUMN public.rental_booking_payment_lines.forfeited_at IS
  'Future lifecycle timestamp when Booking Deposit is forfeited after cancellation/no-show.';
COMMENT ON COLUMN public.rental_booking_payment_lines.refunded_at IS
  'Future lifecycle timestamp when Booking Deposit is refunded.';