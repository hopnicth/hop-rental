-- 071: Account lifecycle soft-delete foundation
--
-- This migration intentionally does NOT delete from auth.users and does not add
-- any hard-delete workflow. Account closure should be implemented as a
-- service-role soft-delete/anonymization process that preserves legal rental,
-- payment, tax, and audit records.

-- ── 1. Lifecycle columns on public.users ─────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deactivation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_note TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.account_status IS
  'Non-destructive account lifecycle status. Do not hard-delete auth.users for customer deletion requests.';
COMMENT ON COLUMN public.users.deactivation_requested_at IS
  'Timestamp when the user requested temporary deactivation.';
COMMENT ON COLUMN public.users.deletion_requested_at IS
  'Timestamp when the user requested account deletion under PDPA/GDPR-style processes.';
COMMENT ON COLUMN public.users.deleted_at IS
  'Timestamp when the account was soft-deleted. Legal transaction records remain retained.';
COMMENT ON COLUMN public.users.anonymized_at IS
  'Timestamp when personally identifiable profile fields were anonymized.';
COMMENT ON COLUMN public.users.deletion_reason IS
  'Optional user/admin supplied deletion reason retained for lifecycle audit.';
COMMENT ON COLUMN public.users.lifecycle_note IS
  'Internal lifecycle processing note. Do not expose as editable profile data.';
COMMENT ON COLUMN public.users.lifecycle_updated_at IS
  'Timestamp of the latest lifecycle state transition.';
COMMENT ON COLUMN public.users.lifecycle_updated_by IS
  'Staff/service user that processed the latest lifecycle state transition.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_account_status_chk'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_account_status_chk
      CHECK (account_status IN (
        'active',
        'deactivated',
        'deletion_requested',
        'anonymized',
        'deleted'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_deleted_state_timestamp_chk'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_deleted_state_timestamp_chk
      CHECK (account_status <> 'deleted' OR deleted_at IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_anonymized_state_timestamp_chk'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_anonymized_state_timestamp_chk
      CHECK (account_status <> 'anonymized' OR anonymized_at IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_account_status
  ON public.users(account_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_deletion_requested_at
  ON public.users(deletion_requested_at DESC)
  WHERE deletion_requested_at IS NOT NULL;

-- ── 2. Keep lifecycle fields service-role managed ────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_users_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Lock role, KYC, and account lifecycle columns from direct authenticated API
  -- updates. Future account deletion requests should go through audited
  -- service-role endpoints, not direct public.users updates.
  NEW.platform_role              := OLD.platform_role;
  NEW.membership_level           := OLD.membership_level;
  NEW.kyc_status                 := OLD.kyc_status;
  NEW.kyc_rejection_reason       := OLD.kyc_rejection_reason;
  NEW.account_status             := OLD.account_status;
  NEW.deactivation_requested_at  := OLD.deactivation_requested_at;
  NEW.deletion_requested_at      := OLD.deletion_requested_at;
  NEW.deleted_at                 := OLD.deleted_at;
  NEW.anonymized_at              := OLD.anonymized_at;
  NEW.deletion_reason            := OLD.deletion_reason;
  NEW.lifecycle_note             := OLD.lifecycle_note;
  NEW.lifecycle_updated_at       := OLD.lifecycle_updated_at;
  NEW.lifecycle_updated_by       := OLD.lifecycle_updated_by;
  RETURN NEW;
END;
$$;

-- ── 3. Guard against public.users hard delete ────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_public_users_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow trusted maintenance roles to repair/account-sync records. Customer
  -- lifecycle flows must still prefer soft-delete/anonymization updates.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Hard deleting public.users is disabled; use account_status/deleted_at/anonymized_at lifecycle fields instead';
END;
$$;

DROP TRIGGER IF EXISTS prevent_public_users_hard_delete ON public.users;
CREATE TRIGGER prevent_public_users_hard_delete
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_public_users_hard_delete();

COMMENT ON FUNCTION public.prevent_public_users_hard_delete() IS
  'Prevents client-side public.users hard deletes while allowing trusted service-role/postgres maintenance bypass.';