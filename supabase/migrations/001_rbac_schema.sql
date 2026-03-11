-- ============================================================
-- HOPNIC — RBAC Schema Migration
-- Tables: users, companies, company_members
-- + RLS policies + auto-create profile trigger
-- ============================================================

-- ─── 1. ENUM TYPES ──────────────────────────────────────────

CREATE TYPE platform_role  AS ENUM ('customer', 'staff', 'super_admin');
CREATE TYPE membership_level AS ENUM ('bronze', 'silver', 'gold');
CREATE TYPE kyc_status     AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE company_role   AS ENUM ('b2b_admin', 'b2b_user');


-- ─── 2. USERS TABLE ─────────────────────────────────────────
-- 1:1 with auth.users — every signup auto-creates a row here.

CREATE TABLE public.users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        TEXT,
  phone            TEXT,
  avatar_url       TEXT,
  platform_role    platform_role    NOT NULL DEFAULT 'customer',
  membership_level membership_level NOT NULL DEFAULT 'bronze',
  kyc_status       kyc_status       NOT NULL DEFAULT 'pending',
  id_card_url      TEXT,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.users IS 'User profile linked 1:1 to auth.users. Everyone starts as B2C.';
COMMENT ON COLUMN public.users.kyc_status IS 'B2C KYC Status: pending, verified, rejected';
COMMENT ON COLUMN public.users.id_card_url IS 'URL to the uploaded ID card image in Storage';


-- ─── 3. COMPANIES TABLE ─────────────────────────────────────

CREATE TABLE public.companies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT             NOT NULL,
  tax_id           TEXT UNIQUE,
  credit_limit     NUMERIC(12,2)    NOT NULL DEFAULT 0,
  credit_used      NUMERIC(12,2)    NOT NULL DEFAULT 0,
  credit_term_days INTEGER          NOT NULL DEFAULT 0,
  billing_cycle    TEXT             NOT NULL DEFAULT 'cash',  -- cash, EOM, 15th, 25th, upon_delivery
  kyc_status       kyc_status       NOT NULL DEFAULT 'pending',
  kyc_documents    JSONB,                                     -- array of { name, url, uploadedAt }
  billing_address  JSONB,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.companies IS 'Legal entity — credit limits, KYC, billing info.';
COMMENT ON COLUMN public.companies.credit_term_days IS 'Payment term in days: 0 = cash, 30, 45, 60';
COMMENT ON COLUMN public.companies.billing_cycle IS 'Billing cycle: cash, EOM, 15th, 25th, upon_delivery';
COMMENT ON COLUMN public.companies.kyc_documents IS 'KYC documents: [{name, url, uploadedAt}] — ภพ.20, หนังสือรับรองบริษัท';


-- ─── 4. COMPANY_MEMBERS (Junction Table) ────────────────────

CREATE TABLE public.company_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  company_id  UUID         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role        company_role NOT NULL DEFAULT 'b2b_user',
  invited_by  UUID                  REFERENCES public.users(id)     ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (user_id, company_id)
);

COMMENT ON TABLE public.company_members IS 'Junction: user ↔ company with role assignment.';


-- ─── 5. INDEXES ─────────────────────────────────────────────

CREATE INDEX idx_company_members_user    ON public.company_members(user_id);
CREATE INDEX idx_company_members_company ON public.company_members(company_id);
CREATE INDEX idx_companies_tax_id        ON public.companies(tax_id);


-- ─── 6. AUTO-CREATE PROFILE ON SIGNUP (Trigger) ─────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ─── 7. UPDATED_AT AUTO-UPDATE ──────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ─── 8. ROW LEVEL SECURITY (RLS) ────────────────────────────

-- Enable RLS on all tables
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- ── users ──

-- Users can read their own profile OR profiles of colleagues in the same company.
-- This allows b2b_admin to JOIN users to see colleague names (full_name).
CREATE POLICY "users_select_own_or_same_company"
  ON public.users FOR SELECT
  USING (
    auth.uid() = users.id
    OR EXISTS (
      SELECT 1 FROM public.company_members my
      JOIN public.company_members their ON their.company_id = my.company_id
      WHERE my.user_id = auth.uid()
        AND their.user_id = users.id
    )
  );

-- Users can update their own profile (sensitive columns protected by trigger below)
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── companies ──

-- Members can read their company
CREATE POLICY "companies_select_member"
  ON public.companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = id
        AND cm.user_id = auth.uid()
    )
  );

-- Only b2b_admin can update company info
CREATE POLICY "companies_update_admin"
  ON public.companies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = id
        AND cm.user_id = auth.uid()
        AND cm.role = 'b2b_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = id
        AND cm.user_id = auth.uid()
        AND cm.role = 'b2b_admin'
    )
  );

-- ── company_members ──

-- Users can see memberships of their own companies
CREATE POLICY "members_select_same_company"
  ON public.company_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.company_members my
      WHERE my.company_id = company_id
        AND my.user_id = auth.uid()
    )
  );

-- Only b2b_admin can insert (invite) new members
CREATE POLICY "members_insert_admin"
  ON public.company_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'b2b_admin'
    )
  );

-- Only b2b_admin can delete (remove) members
CREATE POLICY "members_delete_admin"
  ON public.company_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'b2b_admin'
    )
  );

-- Only b2b_admin can update roles
CREATE POLICY "members_update_admin"
  ON public.company_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'b2b_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'b2b_admin'
    )
  );

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ─── 9. PROTECT SENSITIVE COLUMNS — users ──────────────────
-- Prevent users from escalating platform_role, membership_level, id_verified
-- via direct API call (e.g. Postman). Only service_role can change these.

CREATE OR REPLACE FUNCTION public.protect_users_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- ถ้าคำสั่งมาจาก Service Role (หลังบ้าน) หรือ Postgres Admin ให้ผ่านได้เลย
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Lock sensitive columns: revert to OLD values
  NEW.platform_role    := OLD.platform_role;
  NEW.membership_level := OLD.membership_level;
  NEW.kyc_status       := OLD.kyc_status;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_users_sensitive
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_users_sensitive_columns();


-- ─── 10. PROTECT FINANCE COLUMNS — companies ──────────────
-- Prevent b2b_admin (via anon key) from changing credit/KYC fields.
-- Only HOPNIC staff via Admin Dashboard (service_role key) can modify these.

CREATE OR REPLACE FUNCTION public.protect_companies_finance_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- ถ้าคำสั่งมาจาก Service Role (หลังบ้าน) หรือ Postgres Admin ให้แก้ไขการเงินได้
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Lock finance & KYC columns: revert to OLD values
  NEW.credit_limit     := OLD.credit_limit;
  NEW.credit_used      := OLD.credit_used;
  NEW.credit_term_days := OLD.credit_term_days;
  NEW.billing_cycle    := OLD.billing_cycle;
  NEW.kyc_status       := OLD.kyc_status;
  NEW.kyc_documents    := OLD.kyc_documents;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_companies_finance
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.protect_companies_finance_columns();
