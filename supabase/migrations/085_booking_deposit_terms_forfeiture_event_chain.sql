-- 085: Booking Deposit terms governance + forfeiture event chain foundation.
-- Backend/accounting foundation only: no receipt issuance, no notices, no UI, no POS V2,
-- and no late-cancellation or no-show eligibility behavior changes.

-- ── 1. Allow Booking Deposit Terms in canonical agreement tables ──────────────

ALTER TABLE public.agreement_versions
  DROP CONSTRAINT IF EXISTS agreement_versions_agreement_type_check;
ALTER TABLE public.agreement_versions
  ADD CONSTRAINT agreement_versions_agreement_type_check CHECK (agreement_type IN (
    'terms_of_service',
    'privacy_policy',
    'rental_agreement',
    'damage_loss_policy',
    'damage_protection_terms',
    'kyc_consent',
    'booking_deposit_terms'
  ));

ALTER TABLE public.agreement_acceptance_logs
  DROP CONSTRAINT IF EXISTS agreement_acceptance_logs_agreement_type_check;
ALTER TABLE public.agreement_acceptance_logs
  ADD CONSTRAINT agreement_acceptance_logs_agreement_type_check CHECK (agreement_type IN (
    'terms_of_service',
    'privacy_policy',
    'rental_agreement',
    'damage_loss_policy',
    'damage_protection_terms',
    'kyc_consent',
    'booking_deposit_terms'
  ));

COMMENT ON CONSTRAINT agreement_versions_agreement_type_check ON public.agreement_versions IS
  'Includes booking_deposit_terms so Booking Deposit wording can be governed as canonical published legal content.';

-- ── 2. Link booking-specific deposit agreement snapshots to canonical evidence ─

ALTER TABLE public.rental_booking_deposit_agreements
  ADD COLUMN IF NOT EXISTS agreement_version_id UUID REFERENCES public.agreement_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agreement_acceptance_log_id UUID REFERENCES public.agreement_acceptance_logs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rendered_text_hash TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_agreements_version
  ON public.rental_booking_deposit_agreements(agreement_version_id)
  WHERE agreement_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_agreements_acceptance
  ON public.rental_booking_deposit_agreements(agreement_acceptance_log_id)
  WHERE agreement_acceptance_log_id IS NOT NULL;

COMMENT ON TABLE public.rental_booking_deposit_agreements IS
  'Booking/payment-specific Booking Deposit Terms acceptance snapshot. Canonical wording/evidence should link to agreement_versions and agreement_acceptance_logs when available.';

-- ── 3. Deposit disposition events ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rental_booking_deposit_disposition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source_event_type TEXT NOT NULL,
  no_show_event_id UUID REFERENCES public.rental_booking_no_show_events(id) ON DELETE RESTRICT,
  cancellation_event_id UUID REFERENCES public.rental_booking_cancellation_events(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'admin',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disposition TEXT NOT NULL DEFAULT 'forfeited',
  forfeited_amount NUMERIC(12,2) NOT NULL CHECK (forfeited_amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  booking_deposit_payment_source_type TEXT,
  rental_booking_payment_attempt_id UUID REFERENCES public.rental_booking_payment_attempts(id) ON DELETE SET NULL,
  mixed_payment_allocation_id UUID REFERENCES public.mixed_payment_allocations(id) ON DELETE SET NULL,
  agreement_version_id UUID REFERENCES public.agreement_versions(id) ON DELETE SET NULL,
  agreement_acceptance_log_id UUID REFERENCES public.agreement_acceptance_logs(id) ON DELETE SET NULL,
  accepted_terms_version TEXT,
  terms_accepted_at TIMESTAMPTZ,
  policy_version TEXT NOT NULL DEFAULT 'booking_deposit_forfeiture_v1',
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_event_type IN ('no_show', 'admin_agreed_cancellation')),
  CHECK (actor_type IN ('admin', 'staff', 'system')),
  CHECK (disposition IN ('forfeited')),
  CHECK (char_length(currency_code) = 3),
  CHECK (char_length(trim(policy_version)) > 0),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (
    (source_event_type = 'no_show' AND no_show_event_id IS NOT NULL AND cancellation_event_id IS NULL)
    OR (source_event_type = 'admin_agreed_cancellation' AND cancellation_event_id IS NOT NULL AND no_show_event_id IS NULL)
  ),
  CHECK (booking_deposit_payment_source_type IS NULL OR booking_deposit_payment_source_type IN (
    'rental_booking_payment_attempt',
    'mixed_payment_allocation',
    'legacy_deposit_field'
  ))
);

COMMENT ON TABLE public.rental_booking_deposit_disposition_events IS
  'Authoritative terminal Booking Deposit outcome events. Phase 3.1 creates forfeited no-show dispositions only; future admin-agreed cancellation reuses the same table.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_deposit_disposition_one_per_booking
  ON public.rental_booking_deposit_disposition_events(booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_deposit_disposition_no_show
  ON public.rental_booking_deposit_disposition_events(no_show_event_id)
  WHERE no_show_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_deposit_disposition_cancellation
  ON public.rental_booking_deposit_disposition_events(cancellation_event_id)
  WHERE cancellation_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_deposit_disposition_occurred
  ON public.rental_booking_deposit_disposition_events(occurred_at DESC);

-- ── 4. Financial recognition events ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.financial_recognition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recognition_type TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'rental_booking_deposit_disposition_event',
  source_id UUID NOT NULL REFERENCES public.rental_booking_deposit_disposition_events(id) ON DELETE RESTRICT,
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  recognized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recognized_amount NUMERIC(12,2) NOT NULL CHECK (recognized_amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  revenue_category TEXT NOT NULL DEFAULT 'contractual_penalty_damage_deposit_forfeiture',
  tax_treatment TEXT NOT NULL DEFAULT 'non_vat_contractual_penalty',
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (vat_rate = 0),
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount = 0),
  wht_treatment TEXT NOT NULL DEFAULT 'not_subject_to_wht',
  wht_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (wht_rate = 0),
  wht_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (wht_amount = 0),
  status TEXT NOT NULL DEFAULT 'recognized',
  related_document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (recognition_type IN ('booking_deposit_forfeiture_income')),
  CHECK (source_type = 'rental_booking_deposit_disposition_event'),
  CHECK (status IN ('recognized', 'reversed')),
  CHECK (tax_treatment = 'non_vat_contractual_penalty'),
  CHECK (wht_treatment = 'not_subject_to_wht'),
  CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.financial_recognition_events IS
  'Accounting recognition events. Phase 3.1 recognizes forfeited Booking Deposit as non-VAT, non-WHT contractual penalty/damages income; receipts are not implemented here.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_recognition_source_type
  ON public.financial_recognition_events(source_type, source_id, recognition_type);
CREATE INDEX IF NOT EXISTS idx_financial_recognition_booking
  ON public.financial_recognition_events(booking_id, recognized_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_recognition_recognized
  ON public.financial_recognition_events(recognized_at DESC);

-- ── 5. Row level security ─────────────────────────────────────────────────────

ALTER TABLE public.rental_booking_deposit_disposition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_recognition_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_deposit_disposition_events_service_role_all"
  ON public.rental_booking_deposit_disposition_events;
CREATE POLICY "booking_deposit_disposition_events_service_role_all"
  ON public.rental_booking_deposit_disposition_events FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "financial_recognition_events_service_role_all"
  ON public.financial_recognition_events;
CREATE POLICY "financial_recognition_events_service_role_all"
  ON public.financial_recognition_events FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON public.rental_booking_deposit_disposition_events TO service_role;
GRANT ALL ON public.financial_recognition_events TO service_role;