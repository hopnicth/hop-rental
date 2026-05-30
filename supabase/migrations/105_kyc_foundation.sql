-- ============================================================
-- 105_kyc_foundation.sql
--
-- Scope:
--   * New ENUMs: kyc_customer_type, kyc_identity_type, kyc_document_type
--   * Extend existing kyc_status ENUM with 'expired' and 'revoked' values
--   * Table kyc_profiles  — dedicated identity record (user_id nullable,
--     supports both registered users and walk-in customers)
--   * Table kyc_documents — private document storage references
--   * Table kyc_pickup_overrides — super-admin-only booking exception audit log
--   * updated_at trigger on kyc_profiles
--   * Indexes on all 3 tables for common lookup patterns
--   * RLS: service_role ALL; super_admin ALL; staff SELECT/INSERT/UPDATE;
--          registered-user owner SELECT; anon blocked on all 3 tables
--   * Ensure kyc-documents private bucket (file_size_limit updated to 20 MB)
--
-- Key design decisions:
--   * KYC is NOT embedded in public.users — kyc_profiles is standalone.
--   * user_id nullable: supports registered users AND walk-in customers.
--   * No plaintext national ID / passport / juristic ID stored — hash + last4 only.
--   * branch_id columns are text to match store_branches.id (text PK).
--   * kyc_pickup_overrides: only super_admin may write; staff read-only.
--     Override does NOT set kyc_profiles.status to verified — audit record only.
--   * Pickup gate reads kyc_profiles exclusively; ignores legacy users.kyc_status.
--   * ALTER TYPE ADD VALUE follows the pattern in migrations 056, 078, 084.
-- ============================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1.  NEW ENUMS
--     Use DO/EXCEPTION pattern so the migration is safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.kyc_customer_type AS ENUM (
    'individual',
    'company'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.kyc_identity_type AS ENUM (
    'national_id',
    'passport',
    'juristic_id'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.kyc_document_type AS ENUM (
    'id_card',
    'signature',
    'vat_certificate',
    'company_cert'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2.  EXTEND EXISTING kyc_status ENUM
--     Adds 'expired' and 'revoked' to the existing 3-value set
--     (pending / verified / rejected).  IF NOT EXISTS is idempotent.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TYPE public.kyc_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.kyc_status ADD VALUE IF NOT EXISTS 'revoked';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3.  TABLE: kyc_profiles
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kyc_profiles (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id               uuid        NULL REFERENCES public.users(id) ON DELETE SET NULL,

  customer_type         public.kyc_customer_type NOT NULL,
  identity_type         public.kyc_identity_type NOT NULL,

  -- Identity stored as hash + last4 only — plaintext NEVER stored
  identity_hash         text        NOT NULL,
  identity_last4        text        NOT NULL,

  -- branch_id is text to match store_branches.id (text PK)
  branch_id             text        NULL REFERENCES public.store_branches(id) ON DELETE SET NULL,
  walk_in_phone         text        NULL,

  status                public.kyc_status NOT NULL DEFAULT 'pending',

  -- Verification audit fields
  verified_at           timestamptz NULL,
  valid_until           timestamptz NULL,
  verified_by_user_id   uuid        NULL REFERENCES public.users(id) ON DELETE SET NULL,
  verified_branch_id    text        NULL REFERENCES public.store_branches(id) ON DELETE SET NULL,
  verification_method   text        NULL,

  -- Rejection audit fields
  rejected_at           timestamptz NULL,
  rejection_reason_code text        NULL,
  rejection_note        text        NULL,

  -- Revocation audit fields
  revoked_at            timestamptz NULL,
  revoked_by_user_id    uuid        NULL REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_reason_code   text        NULL,
  revoked_note          text        NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kyc_profiles_pkey PRIMARY KEY (id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4.  TABLE: kyc_documents
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  kyc_profile_id        uuid        NOT NULL REFERENCES public.kyc_profiles(id) ON DELETE CASCADE,

  document_type         public.kyc_document_type NOT NULL,
  storage_path          text        NOT NULL,  -- private bucket path; never a public URL

  issued_at             date        NULL,
  expires_at            date        NULL,

  uploaded_by_user_id   uuid        NULL REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kyc_documents_pkey PRIMARY KEY (id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5.  TABLE: kyc_pickup_overrides
--     Immutable audit log — super_admin only may insert.
--     Does NOT change kyc_profiles.status; records that pickup was allowed
--     by exception for a specific booking.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kyc_pickup_overrides (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  booking_id              uuid        NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  kyc_profile_id          uuid        NULL REFERENCES public.kyc_profiles(id) ON DELETE SET NULL,
  branch_id               text        NULL REFERENCES public.store_branches(id) ON DELETE SET NULL,
  overridden_by_user_id   uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  override_reason         text        NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kyc_pickup_overrides_pkey PRIMARY KEY (id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 6.  updated_at TRIGGER — kyc_profiles only
--     Uses public.update_updated_at() from migration 001.
-- ──────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_kyc_profiles_updated_at ON public.kyc_profiles;
CREATE TRIGGER set_kyc_profiles_updated_at
  BEFORE UPDATE ON public.kyc_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- 7.  INDEXES
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_kyc_profiles_identity_hash
  ON public.kyc_profiles (identity_hash);

CREATE INDEX IF NOT EXISTS idx_kyc_profiles_user_id
  ON public.kyc_profiles (user_id);

CREATE INDEX IF NOT EXISTS idx_kyc_profiles_walk_in_phone
  ON public.kyc_profiles (walk_in_phone);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_kyc_profile_id
  ON public.kyc_documents (kyc_profile_id);

CREATE INDEX IF NOT EXISTS idx_kyc_pickup_overrides_booking_id
  ON public.kyc_pickup_overrides (booking_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 8.  ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.kyc_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_pickup_overrides  ENABLE ROW LEVEL SECURITY;

-- Block public/anon access on all 3 tables (defence-in-depth alongside RLS default deny)
REVOKE ALL ON public.kyc_profiles        FROM anon;
REVOKE ALL ON public.kyc_documents       FROM anon;
REVOKE ALL ON public.kyc_pickup_overrides FROM anon;

-- ── 8a. kyc_profiles ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "kyc_profiles_service_role_all"    ON public.kyc_profiles;
DROP POLICY IF EXISTS "kyc_profiles_super_admin_all"     ON public.kyc_profiles;
DROP POLICY IF EXISTS "kyc_profiles_staff_select"        ON public.kyc_profiles;
DROP POLICY IF EXISTS "kyc_profiles_staff_insert"        ON public.kyc_profiles;
DROP POLICY IF EXISTS "kyc_profiles_staff_update"        ON public.kyc_profiles;
DROP POLICY IF EXISTS "kyc_profiles_select_own"          ON public.kyc_profiles;

-- service_role: all operations (all admin server routes use serverSupabaseServiceRole)
CREATE POLICY "kyc_profiles_service_role_all"
  ON public.kyc_profiles FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- super_admin: full access via authenticated JWT
CREATE POLICY "kyc_profiles_super_admin_all"
  ON public.kyc_profiles FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = 'super_admin'::public.platform_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = 'super_admin'::public.platform_role
  ));

-- staff: SELECT (staff + super_admin)
CREATE POLICY "kyc_profiles_staff_select"
  ON public.kyc_profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = ANY (ARRAY[
        'staff'::public.platform_role,
        'super_admin'::public.platform_role
      ])
  ));

-- staff: INSERT (staff + super_admin)
CREATE POLICY "kyc_profiles_staff_insert"
  ON public.kyc_profiles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = ANY (ARRAY[
        'staff'::public.platform_role,
        'super_admin'::public.platform_role
      ])
  ));

-- staff: UPDATE (staff + super_admin)
CREATE POLICY "kyc_profiles_staff_update"
  ON public.kyc_profiles FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = ANY (ARRAY[
        'staff'::public.platform_role,
        'super_admin'::public.platform_role
      ])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = ANY (ARRAY[
        'staff'::public.platform_role,
        'super_admin'::public.platform_role
      ])
  ));

-- registered user: read own profile only (user_id = auth.uid())
CREATE POLICY "kyc_profiles_select_own"
  ON public.kyc_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 8b. kyc_documents ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "kyc_documents_service_role_all"   ON public.kyc_documents;
DROP POLICY IF EXISTS "kyc_documents_super_admin_all"    ON public.kyc_documents;
DROP POLICY IF EXISTS "kyc_documents_staff_select"       ON public.kyc_documents;
DROP POLICY IF EXISTS "kyc_documents_staff_insert"       ON public.kyc_documents;
DROP POLICY IF EXISTS "kyc_documents_staff_update"       ON public.kyc_documents;
DROP POLICY IF EXISTS "kyc_documents_select_own"         ON public.kyc_documents;

-- service_role: all operations
CREATE POLICY "kyc_documents_service_role_all"
  ON public.kyc_documents FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- super_admin: full access via authenticated JWT
CREATE POLICY "kyc_documents_super_admin_all"
  ON public.kyc_documents FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = 'super_admin'::public.platform_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = 'super_admin'::public.platform_role
  ));

-- staff: SELECT (staff + super_admin)
CREATE POLICY "kyc_documents_staff_select"
  ON public.kyc_documents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = ANY (ARRAY[
        'staff'::public.platform_role,
        'super_admin'::public.platform_role
      ])
  ));

-- staff: INSERT (staff + super_admin)
CREATE POLICY "kyc_documents_staff_insert"
  ON public.kyc_documents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = ANY (ARRAY[
        'staff'::public.platform_role,
        'super_admin'::public.platform_role
      ])
  ));

-- staff: UPDATE (staff + super_admin)
CREATE POLICY "kyc_documents_staff_update"
  ON public.kyc_documents FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = ANY (ARRAY[
        'staff'::public.platform_role,
        'super_admin'::public.platform_role
      ])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = ANY (ARRAY[
        'staff'::public.platform_role,
        'super_admin'::public.platform_role
      ])
  ));

-- registered user: read own documents via kyc_profile ownership
CREATE POLICY "kyc_documents_select_own"
  ON public.kyc_documents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kyc_profiles kp
    WHERE kp.id = kyc_documents.kyc_profile_id
      AND kp.user_id = auth.uid()
  ));

-- ── 8c. kyc_pickup_overrides ─────────────────────────────────────────────────
-- Staff: SELECT only.  Super admin: ALL.  No access for other authenticated or anon.

DROP POLICY IF EXISTS "kyc_pickup_overrides_service_role_all"    ON public.kyc_pickup_overrides;
DROP POLICY IF EXISTS "kyc_pickup_overrides_super_admin_all"     ON public.kyc_pickup_overrides;
DROP POLICY IF EXISTS "kyc_pickup_overrides_staff_select"        ON public.kyc_pickup_overrides;

-- service_role: all operations
CREATE POLICY "kyc_pickup_overrides_service_role_all"
  ON public.kyc_pickup_overrides FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- super_admin: full access (only role that may create override records)
CREATE POLICY "kyc_pickup_overrides_super_admin_all"
  ON public.kyc_pickup_overrides FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = 'super_admin'::public.platform_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = 'super_admin'::public.platform_role
  ));

-- staff: SELECT only — cannot INSERT, UPDATE, or DELETE override records
CREATE POLICY "kyc_pickup_overrides_staff_select"
  ON public.kyc_pickup_overrides FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = ANY (ARRAY[
        'staff'::public.platform_role,
        'super_admin'::public.platform_role
      ])
  ));

-- ──────────────────────────────────────────────────────────────────────────────
-- 9.  STORAGE BUCKET: kyc-documents
--     Bucket was created in migration 072 (5 MB limit).
--     Update file_size_limit to 20 MB for document uploads (per design spec).
--     ON CONFLICT ensures this is safe to re-run even if bucket already exists.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  FALSE,
  20971520,  -- 20 MB
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public           = FALSE,
      file_size_limit  = 20971520,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf'];
