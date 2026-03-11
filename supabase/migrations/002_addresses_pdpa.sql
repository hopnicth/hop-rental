-- ============================================================
-- HOPNIC — Migration 002: Addresses + PDPA + KYC Rejection
-- ============================================================

-- ─── 1. ADD COLUMNS TO users ──────────────────────────────

ALTER TABLE public.users
  ADD COLUMN pdpa_consent_url     TEXT,
  ADD COLUMN pdpa_consented_at    TIMESTAMPTZ,
  ADD COLUMN kyc_rejection_reason TEXT;

COMMENT ON COLUMN public.users.pdpa_consent_url IS 'URL of PDPA terms document the user agreed to';
COMMENT ON COLUMN public.users.pdpa_consented_at IS 'Timestamp when user gave PDPA consent';
COMMENT ON COLUMN public.users.kyc_rejection_reason IS 'Reason for KYC rejection (set by admin only)';

-- ─── 2. ADD COLUMN TO companies ───────────────────────────

ALTER TABLE public.companies
  ADD COLUMN kyc_rejection_reason TEXT;

COMMENT ON COLUMN public.companies.kyc_rejection_reason IS 'Reason for company KYC rejection (set by admin only)';

-- ─── 3. ADDRESSES TABLE ──────────────────────────────────

CREATE TABLE public.addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.users(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  contact_name  TEXT,
  contact_phone TEXT,
  is_default    BOOLEAN     NOT NULL DEFAULT false,
  full_address  TEXT        NOT NULL,
  sub_district  TEXT,
  district      TEXT,
  province      TEXT,
  postal_code   TEXT,
  latitude      NUMERIC(10,8),
  longitude     NUMERIC(11,8),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT address_has_owner
    CHECK (user_id IS NOT NULL OR company_id IS NOT NULL)
);

COMMENT ON TABLE  public.addresses IS 'Delivery addresses — polymorphic owner (user OR company)';
COMMENT ON COLUMN public.addresses.title IS 'Label: สำนักงานใหญ่, หน้างานระยอง, บ้านพัก';

-- ─── 4. INDEXES ──────────────────────────────────────────

CREATE INDEX idx_addresses_user    ON public.addresses(user_id);
CREATE INDEX idx_addresses_company ON public.addresses(company_id);

-- ─── 5. UPDATED_AT TRIGGER (reuses fn from 001) ─────────

CREATE TRIGGER set_addresses_updated_at
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 6. RLS FOR ADDRESSES ────────────────────────────────

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- SELECT: own addresses OR company addresses (if member)
CREATE POLICY "addresses_select_own_or_company"
  ON public.addresses FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = addresses.company_id
        AND cm.user_id    = auth.uid()
    )
  );

-- INSERT personal address
CREATE POLICY "addresses_insert_personal"
  ON public.addresses FOR INSERT
  WITH CHECK (user_id = auth.uid() AND company_id IS NULL);

-- INSERT company address (b2b_admin only)
CREATE POLICY "addresses_insert_company"
  ON public.addresses FOR INSERT
  WITH CHECK (
    company_id IS NOT NULL AND user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = addresses.company_id
        AND cm.user_id    = auth.uid()
        AND cm.role        = 'b2b_admin'
    )
  );

-- UPDATE personal address
CREATE POLICY "addresses_update_personal"
  ON public.addresses FOR UPDATE
  USING      (user_id = auth.uid() AND company_id IS NULL)
  WITH CHECK (user_id = auth.uid() AND company_id IS NULL);

-- UPDATE company address (b2b_admin only)
CREATE POLICY "addresses_update_company"
  ON public.addresses FOR UPDATE
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = addresses.company_id
        AND cm.user_id    = auth.uid()
        AND cm.role        = 'b2b_admin'
    )
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = addresses.company_id
        AND cm.user_id    = auth.uid()
        AND cm.role        = 'b2b_admin'
    )
  );

-- DELETE personal address
CREATE POLICY "addresses_delete_personal"
  ON public.addresses FOR DELETE
  USING (user_id = auth.uid() AND company_id IS NULL);

-- DELETE company address (b2b_admin only)
CREATE POLICY "addresses_delete_company"
  ON public.addresses FOR DELETE
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = addresses.company_id
        AND cm.user_id    = auth.uid()
        AND cm.role        = 'b2b_admin'
    )
  );

-- ─── 7. UPDATE SENSITIVE COLUMN TRIGGERS ─────────────────
-- Re-create with new columns added to protection list.

CREATE OR REPLACE FUNCTION public.protect_users_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Lock sensitive columns: revert to OLD values
  NEW.platform_role         := OLD.platform_role;
  NEW.membership_level      := OLD.membership_level;
  NEW.kyc_status            := OLD.kyc_status;
  NEW.kyc_rejection_reason  := OLD.kyc_rejection_reason;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_companies_finance_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  NEW.credit_limit          := OLD.credit_limit;
  NEW.credit_used           := OLD.credit_used;
  NEW.credit_term_days      := OLD.credit_term_days;
  NEW.billing_cycle         := OLD.billing_cycle;
  NEW.kyc_status            := OLD.kyc_status;
  NEW.kyc_documents         := OLD.kyc_documents;
  NEW.kyc_rejection_reason  := OLD.kyc_rejection_reason;
  RETURN NEW;
END;
$$;

-- ─── 8. ENSURE SINGLE DEFAULT ADDRESS PER OWNER ──────────

CREATE OR REPLACE FUNCTION public.ensure_single_default_address()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default = true THEN
    IF NEW.user_id IS NOT NULL THEN
      UPDATE public.addresses SET is_default = false
       WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
    END IF;
    IF NEW.company_id IS NOT NULL THEN
      UPDATE public.addresses SET is_default = false
       WHERE company_id = NEW.company_id AND id != NEW.id AND is_default = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_default_address
  AFTER INSERT OR UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_address();

