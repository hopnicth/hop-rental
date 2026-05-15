-- 068: Document foundation, customer tax profiles, and payment allocations
--
-- Adds official document registry, global document numbering foundation,
-- customer tax profiles, payment allocation ledger, and document audit events.
-- Existing POS/order/rental fields remain unchanged and should continue to be
-- written in parallel during rollout.

-- ── 1. system_configs ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_configs (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(trim(key)) > 0),
  CHECK (jsonb_typeof(value) = 'object')
);

COMMENT ON TABLE public.system_configs IS
  'Global key/value system configuration. Use for document_company_profile and future flexible config.';

DROP TRIGGER IF EXISTS set_system_configs_updated_at ON public.system_configs;
CREATE TRIGGER set_system_configs_updated_at
  BEFORE UPDATE ON public.system_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 2. branch_document_settings ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.branch_document_settings (
  branch_id TEXT PRIMARY KEY REFERENCES public.store_branches(id) ON DELETE CASCADE,
  logo_path TEXT,
  stamp_path TEXT,
  company_name_th TEXT NOT NULL DEFAULT '',
  company_name_en TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  branch_tax_code TEXT NOT NULL DEFAULT '00000',
  address_th TEXT NOT NULL DEFAULT '',
  address_en TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  footer_note TEXT NOT NULL DEFAULT '',
  print_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(print_config) = 'object')
);

COMMENT ON TABLE public.branch_document_settings IS
  'Branch-level document header overrides for official print output.';

DROP TRIGGER IF EXISTS set_branch_document_settings_updated_at ON public.branch_document_settings;
CREATE TRIGGER set_branch_document_settings_updated_at
  BEFORE UPDATE ON public.branch_document_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 3. customer_tax_profiles ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_tax_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  walk_in_phone TEXT REFERENCES public.walk_in_customers(phone) ON UPDATE CASCADE ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_kind TEXT NOT NULL DEFAULT 'person',
  legal_name TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  tax_id_normalized TEXT NOT NULL,
  branch_type TEXT NOT NULL DEFAULT 'none',
  branch_code TEXT NOT NULL DEFAULT '',
  billing_address TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL DEFAULT 'draft',
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (customer_kind IN ('person', 'company')),
  CHECK (branch_type IN ('none', 'head_office', 'branch')),
  CHECK (review_status IN ('draft', 'pending_review', 'approved', 'rejected')),
  CHECK (customer_user_id IS NOT NULL OR walk_in_phone IS NOT NULL OR company_id IS NOT NULL),
  CHECK (char_length(trim(legal_name)) > 0),
  CHECK (char_length(trim(tax_id)) > 0),
  CHECK (char_length(trim(tax_id_normalized)) > 0),
  CHECK (char_length(trim(billing_address)) > 0),
  CHECK (branch_type <> 'branch' OR char_length(trim(branch_code)) > 0),
  CHECK (customer_kind <> 'person' OR branch_type = 'none')
);

COMMENT ON TABLE public.customer_tax_profiles IS
  'Reusable tax invoice identity for full tax invoice, credit note, debit note, and advance tax invoice.';

DROP TRIGGER IF EXISTS set_customer_tax_profiles_updated_at ON public.customer_tax_profiles;
CREATE TRIGGER set_customer_tax_profiles_updated_at
  BEFORE UPDATE ON public.customer_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_customer_tax_profiles_tax_id_normalized
  ON public.customer_tax_profiles(tax_id_normalized);

CREATE INDEX IF NOT EXISTS idx_customer_tax_profiles_user_created
  ON public.customer_tax_profiles(customer_user_id, created_at DESC)
  WHERE customer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_tax_profiles_walk_in_created
  ON public.customer_tax_profiles(walk_in_phone, created_at DESC)
  WHERE walk_in_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_tax_profiles_company_created
  ON public.customer_tax_profiles(company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_tax_profiles_default_user
  ON public.customer_tax_profiles(customer_user_id)
  WHERE is_default = TRUE AND customer_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_tax_profiles_default_walk_in
  ON public.customer_tax_profiles(walk_in_phone)
  WHERE is_default = TRUE AND walk_in_phone IS NOT NULL;

-- ── 4. document_sequences ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  sequence_key TEXT NOT NULL DEFAULT 'global',
  branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  period TEXT NOT NULL,
  prefix TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(trim(document_type)) > 0),
  CHECK (char_length(trim(sequence_key)) > 0),
  CHECK (period ~ '^[0-9]{6}$'),
  CHECK (char_length(trim(prefix)) > 0),
  UNIQUE (document_type, sequence_key, period)
);

COMMENT ON TABLE public.document_sequences IS
  'Sequence allocator table for official document numbers. Initial implementation uses global numbering.';

DROP TRIGGER IF EXISTS set_document_sequences_updated_at ON public.document_sequences;
CREATE TRIGGER set_document_sequences_updated_at
  BEFORE UPDATE ON public.document_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP FUNCTION IF EXISTS public.f_next_document_number(TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.f_next_document_number(
  p_document_type TEXT,
  p_branch_id TEXT,
  p_period TEXT,
  p_prefix TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence_key TEXT := 'global';
  v_next_number INTEGER;
BEGIN
  IF p_document_type IS NULL OR char_length(trim(p_document_type)) = 0 THEN
    RAISE EXCEPTION 'document_type is required';
  END IF;

  IF p_period IS NULL OR p_period !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'period must be in YYYYMM format';
  END IF;

  IF p_prefix IS NULL OR char_length(trim(p_prefix)) = 0 THEN
    RAISE EXCEPTION 'prefix is required';
  END IF;

  INSERT INTO public.document_sequences (
    document_type,
    sequence_key,
    branch_id,
    period,
    prefix,
    last_number
  ) VALUES (
    p_document_type,
    v_sequence_key,
    p_branch_id,
    p_period,
    p_prefix,
    1
  )
  ON CONFLICT (document_type, sequence_key, period)
  DO UPDATE SET
    last_number = public.document_sequences.last_number + 1,
    prefix = EXCLUDED.prefix,
    updated_at = now()
  RETURNING last_number INTO v_next_number;

  RETURN p_prefix || '-' || p_period || '-' || lpad(v_next_number::TEXT, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.f_next_document_number(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_next_document_number(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ── 5. official_documents ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.official_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  document_no TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  original_document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  tax_profile_id UUID REFERENCES public.customer_tax_profiles(id) ON DELETE SET NULL,
  customer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  walk_in_phone TEXT REFERENCES public.walk_in_customers(phone) ON UPDATE CASCADE ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  issued_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  void_reason TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  template_key TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1 CHECK (template_version > 0),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  print_count INTEGER NOT NULL DEFAULT 0 CHECK (print_count >= 0),
  last_printed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'issued', 'printed', 'voided', 'replaced')),
  CHECK (char_length(trim(document_type)) > 0),
  CHECK (char_length(trim(source_type)) > 0),
  CHECK (char_length(trim(source_id)) > 0),
  CHECK (char_length(trim(template_key)) > 0),
  CHECK (jsonb_typeof(snapshot) = 'object'),
  CHECK (status = 'draft' OR NULLIF(trim(document_no), '') IS NOT NULL),
  CHECK (status = 'draft' OR issued_at IS NOT NULL),
  CHECK (status <> 'voided' OR voided_at IS NOT NULL)
);

COMMENT ON TABLE public.official_documents IS
  'Issued official document registry and immutable snapshot store.';

DROP FUNCTION IF EXISTS public.guard_official_document_finalized_updates();
CREATE FUNCTION public.guard_official_document_finalized_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
      RAISE EXCEPTION 'document totals are immutable after issue';
    END IF;

    IF NEW.tax_profile_id IS DISTINCT FROM OLD.tax_profile_id
      OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
      OR NEW.walk_in_phone IS DISTINCT FROM OLD.walk_in_phone
      OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'document customer identity is immutable after issue';
    END IF;

    IF NEW.source_type IS DISTINCT FROM OLD.source_type
      OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
      RAISE EXCEPTION 'document source is immutable after issue';
    END IF;

    IF NEW.template_key IS DISTINCT FROM OLD.template_key
      OR NEW.template_version IS DISTINCT FROM OLD.template_version THEN
      RAISE EXCEPTION 'document template is immutable after issue';
    END IF;

    IF NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
      RAISE EXCEPTION 'snapshot is immutable after issue';
    END IF;

    IF NEW.document_no IS DISTINCT FROM OLD.document_no THEN
      RAISE EXCEPTION 'document number is immutable after issue';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_official_document_finalized_updates ON public.official_documents;
CREATE TRIGGER guard_official_document_finalized_updates
  BEFORE UPDATE ON public.official_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_official_document_finalized_updates();

DROP TRIGGER IF EXISTS set_official_documents_updated_at ON public.official_documents;
CREATE TRIGGER set_official_documents_updated_at
  BEFORE UPDATE ON public.official_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_official_documents_source
  ON public.official_documents(source_type, source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_official_documents_branch_issued
  ON public.official_documents(branch_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_official_documents_type_issued
  ON public.official_documents(document_type, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_official_documents_tax_profile_issued
  ON public.official_documents(tax_profile_id, issued_at DESC)
  WHERE tax_profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_official_documents_document_no
  ON public.official_documents(document_no)
  WHERE document_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_official_documents_idempotency
  ON public.official_documents(source_type, source_id, document_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 6. document_events ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.official_documents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (event_type IN ('draft_created', 'issued', 'printed', 'reprinted', 'voided', 'replaced', 'previewed')),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (event_type <> 'reprinted' OR char_length(trim(coalesce(reason, ''))) > 0)
);

COMMENT ON TABLE public.document_events IS
  'Audit log for document lifecycle events including print and reprint.';

CREATE INDEX IF NOT EXISTS idx_document_events_document_created
  ON public.document_events(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_events_staff_created
  ON public.document_events(staff_user_id, created_at DESC)
  WHERE staff_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_events_type_created
  ON public.document_events(event_type, created_at DESC);

-- ── 7. payment_allocations ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  allocation_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  vat_treatment TEXT NOT NULL DEFAULT 'no_vat',
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  payment_method TEXT,
  payment_reference TEXT NOT NULL DEFAULT '',
  payment_source_type TEXT,
  payment_source_id TEXT,
  external_reference TEXT NOT NULL DEFAULT '',
  proof_storage_bucket TEXT,
  proof_storage_path TEXT,
  proof_url TEXT,
  payment_attempt_id UUID REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  related_document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  original_allocation_id UUID REFERENCES public.payment_allocations(id) ON DELETE SET NULL,
  reversal_of_allocation_id UUID REFERENCES public.payment_allocations(id) ON DELETE SET NULL,
  deposit_lifecycle_status TEXT,
  staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT,
  notes TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(trim(source_type)) > 0),
  CHECK (char_length(trim(source_id)) > 0),
  CHECK (direction IN ('in', 'out')),
  CHECK (allocation_type IN ('security_deposit', 'rental_advance', 'sale_payment', 'remaining_payment', 'refund', 'penalty', 'damage_fee', 'late_fee', 'manual_adjustment')),
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'reversed')),
  CHECK (vat_treatment IN ('no_vat', 'vat_inclusive', 'vat_exclusive', 'exempt', 'out_of_scope')),
  CHECK (abs(gross_amount - (net_amount + vat_amount)) <= 0.01),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (deposit_lifecycle_status IS NULL OR deposit_lifecycle_status IN ('held', 'partially_used', 'refunded', 'forfeited', 'cancelled')),
  CHECK (allocation_type = 'security_deposit' OR deposit_lifecycle_status IS NULL),
  CHECK (allocation_type <> 'security_deposit' OR deposit_lifecycle_status IS NOT NULL),
  CHECK (allocation_type <> 'refund' OR (direction = 'out' AND original_allocation_id IS NOT NULL))
);

COMMENT ON TABLE public.payment_allocations IS
  'Ledger for payment, deposit, advance, refund, and fee allocations linked to sources and documents.';

DROP TRIGGER IF EXISTS set_payment_allocations_updated_at ON public.payment_allocations;
CREATE TRIGGER set_payment_allocations_updated_at
  BEFORE UPDATE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_payment_allocations_source_created
  ON public.payment_allocations(source_type, source_id, allocated_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_branch_created
  ON public.payment_allocations(branch_id, allocated_at DESC)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_allocations_type_created
  ON public.payment_allocations(allocation_type, allocated_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_related_document
  ON public.payment_allocations(related_document_id)
  WHERE related_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_attempt
  ON public.payment_allocations(payment_attempt_id)
  WHERE payment_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_allocations_original_allocation
  ON public.payment_allocations(original_allocation_id)
  WHERE original_allocation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_allocations_source_reference
  ON public.payment_allocations(payment_source_type, payment_source_id)
  WHERE payment_source_type IS NOT NULL OR payment_source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_allocations_idempotency
  ON public.payment_allocations(source_type, source_id, allocation_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 8. row level security ──────────────────────────────────────────────────

ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_document_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_configs_service_role_all" ON public.system_configs;
CREATE POLICY "system_configs_service_role_all"
  ON public.system_configs FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "branch_document_settings_service_role_all" ON public.branch_document_settings;
CREATE POLICY "branch_document_settings_service_role_all"
  ON public.branch_document_settings FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "customer_tax_profiles_service_role_all" ON public.customer_tax_profiles;
CREATE POLICY "customer_tax_profiles_service_role_all"
  ON public.customer_tax_profiles FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "document_sequences_service_role_all" ON public.document_sequences;
CREATE POLICY "document_sequences_service_role_all"
  ON public.document_sequences FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "official_documents_service_role_all" ON public.official_documents;
CREATE POLICY "official_documents_service_role_all"
  ON public.official_documents FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "document_events_service_role_all" ON public.document_events;
CREATE POLICY "document_events_service_role_all"
  ON public.document_events FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "payment_allocations_service_role_all" ON public.payment_allocations;
CREATE POLICY "payment_allocations_service_role_all"
  ON public.payment_allocations FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON public.system_configs TO service_role;
GRANT ALL ON public.branch_document_settings TO service_role;
GRANT ALL ON public.customer_tax_profiles TO service_role;
GRANT ALL ON public.document_sequences TO service_role;
GRANT ALL ON public.official_documents TO service_role;
GRANT ALL ON public.document_events TO service_role;
GRANT ALL ON public.payment_allocations TO service_role;