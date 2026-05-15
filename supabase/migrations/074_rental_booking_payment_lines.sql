-- 074: Rental booking payment line snapshots and WHT foundation.
-- Phase 1 only: no online deposit payment, receipt numbering, tax invoice, or gateway changes.

CREATE TABLE IF NOT EXISTS public.rental_booking_payment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL,
  tax_category TEXT NOT NULL,
  description_th TEXT NOT NULL,
  description_en TEXT NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  wht_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  wht_rate NUMERIC(7,6) NOT NULL DEFAULT 0 CHECK (wht_rate >= 0),
  wht_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (wht_amount >= 0),
  net_payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (net_payable_amount >= 0),
  is_refundable BOOLEAN NOT NULL DEFAULT FALSE,
  wht_certificate_required BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (line_type IN ('rental_fee', 'refundable_security_deposit', 'delivery_fee', 'service_fee', 'insurance_fee', 'damage_fee', 'late_fee')),
  CHECK (tax_category IN ('rental_income', 'refundable_security_deposit', 'service_income', 'insurance_or_coverage', 'damage_compensation', 'penalty_income', 'non_taxable')),
  CHECK (status IN ('active', 'voided')),
  CHECK (char_length(trim(description_th)) > 0),
  CHECK (char_length(trim(description_en)) > 0),
  CHECK (char_length(trim(source)) > 0),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (abs(net_payable_amount - (gross_amount - wht_amount)) <= 0.01),
  CHECK (
    line_type <> 'refundable_security_deposit'
    OR (
      tax_category = 'refundable_security_deposit'
      AND wht_applicable = FALSE
      AND wht_rate = 0
      AND wht_amount = 0
      AND is_refundable = TRUE
      AND wht_certificate_required = FALSE
    )
  )
);

COMMENT ON TABLE public.rental_booking_payment_lines IS
  'Phase 1 rental monetary line snapshots for rental fee, refundable security deposit, and future service lines with WHT flags.';
COMMENT ON COLUMN public.rental_booking_payment_lines.line_type IS
  'Business line type such as rental_fee or refundable_security_deposit.';
COMMENT ON COLUMN public.rental_booking_payment_lines.tax_category IS
  'Tax/accounting category. Refundable security deposit is non-income and WHT 0.';

DROP TRIGGER IF EXISTS set_rental_booking_payment_lines_updated_at ON public.rental_booking_payment_lines;
CREATE TRIGGER set_rental_booking_payment_lines_updated_at
  BEFORE UPDATE ON public.rental_booking_payment_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_rental_booking_payment_lines_booking_created
  ON public.rental_booking_payment_lines(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_booking_payment_lines_type
  ON public.rental_booking_payment_lines(line_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_booking_payment_lines_active_source
  ON public.rental_booking_payment_lines(booking_id, line_type, source)
  WHERE status = 'active';

ALTER TABLE public.rental_booking_payment_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_booking_payment_lines_service_role_all" ON public.rental_booking_payment_lines;
CREATE POLICY "rental_booking_payment_lines_service_role_all"
  ON public.rental_booking_payment_lines FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON public.rental_booking_payment_lines TO service_role;
