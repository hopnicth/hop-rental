-- 081: Customer cancellation / Booking Deposit refund / restriction data foundation.
-- Phase C.1A only: no customer cancellation API, UI, admin refund UI, documents, or gateway refunds.

CREATE TABLE IF NOT EXISTS public.rental_booking_cancellation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'customer',
  cancelled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancellation_initiator TEXT NOT NULL,
  cancellation_source TEXT NOT NULL,
  cancellation_reason_code TEXT,
  cancellation_reason_note TEXT,
  cancellation_source_event_id TEXT,
  previous_status TEXT NOT NULL,
  previous_booking_deposit_payment_status TEXT,
  pickup_date_snapshot DATE,
  cancellation_local_date_snapshot DATE NOT NULL,
  refund_cutoff_date_snapshot DATE,
  refund_policy_version TEXT NOT NULL DEFAULT 'booking_deposit_refund_calendar_day_v1',
  refund_timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  refund_eligible BOOLEAN NOT NULL DEFAULT false,
  refund_amount_due NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refund_amount_due >= 0),
  qualifies_for_restriction BOOLEAN NOT NULL DEFAULT false,
  qualifying_cancellation_count_after INTEGER CHECK (qualifying_cancellation_count_after IS NULL OR qualifying_cancellation_count_after >= 0),
  restriction_window_started_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (actor_type IN ('customer','staff','admin','system')),
  CHECK (cancellation_initiator IN ('customer','staff','admin','pos','system')),
  CHECK (cancellation_source IN ('customer_web','admin_rental_detail','admin_pos','pos_history','system_cleanup','payment_attempt','mixed_checkout','support')),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (char_length(trim(previous_status)) > 0),
  CHECK (char_length(trim(refund_policy_version)) > 0),
  CHECK (refund_timezone = 'Asia/Bangkok'),
  CHECK (cancellation_initiator <> 'customer' OR user_id IS NOT NULL),
  CHECK (qualifies_for_restriction = false OR (cancellation_initiator = 'customer' AND user_id IS NOT NULL))
);

COMMENT ON TABLE public.rental_booking_cancellation_events IS
  'Immutable audit events for rental booking cancellation provenance, refund policy snapshots, and excessive-cancellation counting.';

CREATE INDEX IF NOT EXISTS idx_rental_booking_cancellation_events_booking
  ON public.rental_booking_cancellation_events(booking_id, cancelled_at DESC);
CREATE INDEX IF NOT EXISTS idx_rental_booking_cancellation_events_user_window
  ON public.rental_booking_cancellation_events(user_id, cancelled_at DESC)
  WHERE qualifies_for_restriction = true;
CREATE INDEX IF NOT EXISTS idx_rental_booking_cancellation_events_source
  ON public.rental_booking_cancellation_events(cancellation_initiator, cancellation_source, cancelled_at DESC);

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_initiator TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_source TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_source_event_id UUID REFERENCES public.rental_booking_cancellation_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_refund_eligible BOOLEAN,
  ADD COLUMN IF NOT EXISTS cancellation_refund_amount_due NUMERIC(12,2) CHECK (cancellation_refund_amount_due IS NULL OR cancellation_refund_amount_due >= 0),
  ADD COLUMN IF NOT EXISTS cancellation_refund_cutoff_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_bookings_cancellation_initiator_chk' AND conrelid = 'public.rental_bookings'::regclass) THEN
    ALTER TABLE public.rental_bookings ADD CONSTRAINT rental_bookings_cancellation_initiator_chk CHECK (cancellation_initiator IS NULL OR cancellation_initiator IN ('customer','staff','admin','pos','system'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_bookings_cancellation_source_chk' AND conrelid = 'public.rental_bookings'::regclass) THEN
    ALTER TABLE public.rental_bookings ADD CONSTRAINT rental_bookings_cancellation_source_chk CHECK (cancellation_source IS NULL OR cancellation_source IN ('customer_web','admin_rental_detail','admin_pos','pos_history','system_cleanup','payment_attempt','mixed_checkout','support'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rental_bookings_cancellation_event
  ON public.rental_bookings(cancellation_source_event_id) WHERE cancellation_source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_bookings_cancelled_at
  ON public.rental_bookings(cancelled_at DESC) WHERE cancelled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_type TEXT NOT NULL DEFAULT 'rental_booking_deposit',
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cancellation_event_id UUID REFERENCES public.rental_booking_cancellation_events(id) ON DELETE RESTRICT,
  original_payment_source_type TEXT NOT NULL,
  original_rental_booking_payment_attempt_id UUID REFERENCES public.rental_booking_payment_attempts(id) ON DELETE SET NULL,
  original_mixed_payment_allocation_id UUID REFERENCES public.mixed_payment_allocations(id) ON DELETE SET NULL,
  gateway public.payment_gateway,
  gateway_charge_id TEXT,
  gateway_payment_reference TEXT,
  refund_amount NUMERIC(12,2) NOT NULL CHECK (refund_amount > 0),
  currency_code TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  refund_bank_name TEXT NOT NULL,
  refund_bank_account_number TEXT NOT NULL,
  refund_bank_account_name TEXT NOT NULL,
  refund_contact_phone TEXT NOT NULL,
  customer_note TEXT,
  customer_confirmed_destination_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_admin_review',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_at TIMESTAMPTZ,
  needs_customer_contact_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  processed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  admin_note TEXT,
  manual_transfer_reference TEXT,
  refund_proof_id UUID REFERENCES public.rental_booking_deposit_proofs(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (refund_type IN ('rental_booking_deposit')),
  CHECK (original_payment_source_type IN ('rental_booking_payment_attempt','mixed_payment_allocation')),
  CHECK (status IN ('pending_admin_review','processing','needs_customer_contact','refunded','failed')),
  CHECK (char_length(trim(refund_bank_name)) > 0),
  CHECK (char_length(trim(refund_bank_account_number)) > 0),
  CHECK (char_length(trim(refund_bank_account_name)) > 0),
  CHECK (char_length(trim(refund_contact_phone)) > 0),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (status <> 'processing' OR processing_at IS NOT NULL),
  CHECK (status <> 'needs_customer_contact' OR needs_customer_contact_at IS NOT NULL),
  CHECK (status <> 'refunded' OR refunded_at IS NOT NULL),
  CHECK (status <> 'failed' OR failed_at IS NOT NULL),
  CHECK ((original_payment_source_type = 'rental_booking_payment_attempt' AND original_rental_booking_payment_attempt_id IS NOT NULL) OR (original_payment_source_type = 'mixed_payment_allocation' AND original_mixed_payment_allocation_id IS NOT NULL))
);

COMMENT ON TABLE public.payment_refunds IS
  'Manual refund lifecycle records. Phase C.1A supports Booking Deposit refund obligations only; gateway refunds are intentionally not implemented.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_refunds_one_booking_deposit_per_cancellation
  ON public.payment_refunds(cancellation_event_id)
  WHERE refund_type = 'rental_booking_deposit' AND cancellation_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status_requested
  ON public.payment_refunds(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_booking
  ON public.payment_refunds(booking_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_user
  ON public.payment_refunds(user_id, requested_at DESC) WHERE user_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_payment_refunds_updated_at ON public.payment_refunds;
CREATE TRIGGER set_payment_refunds_updated_at
  BEFORE UPDATE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_reason TEXT,
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_source_event_id UUID REFERENCES public.rental_booking_cancellation_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_cancellation_count INTEGER NOT NULL DEFAULT 0 CHECK (rental_booking_restriction_cancellation_count >= 0),
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_window_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_overridden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_overridden_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_unrestricted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rental_booking_restriction_unrestricted_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_rental_booking_restriction_status_chk' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_rental_booking_restriction_status_chk CHECK (rental_booking_restriction_status IN ('none','restricted','overridden','unrestricted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_rental_booking_restricted_timestamp_chk' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_rental_booking_restricted_timestamp_chk CHECK (rental_booking_restriction_status <> 'restricted' OR rental_booking_restriction_applied_at IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_rental_booking_restriction_status
  ON public.users(rental_booking_restriction_status, rental_booking_restriction_applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_rental_booking_restriction_source_event
  ON public.users(rental_booking_restriction_source_event_id)
  WHERE rental_booking_restriction_source_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_users_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  NEW.platform_role := OLD.platform_role;
  NEW.membership_level := OLD.membership_level;
  NEW.kyc_status := OLD.kyc_status;
  NEW.kyc_rejection_reason := OLD.kyc_rejection_reason;
  NEW.account_status := OLD.account_status;
  NEW.deactivation_requested_at := OLD.deactivation_requested_at;
  NEW.deletion_requested_at := OLD.deletion_requested_at;
  NEW.deleted_at := OLD.deleted_at;
  NEW.anonymized_at := OLD.anonymized_at;
  NEW.deletion_reason := OLD.deletion_reason;
  NEW.lifecycle_note := OLD.lifecycle_note;
  NEW.lifecycle_updated_at := OLD.lifecycle_updated_at;
  NEW.lifecycle_updated_by := OLD.lifecycle_updated_by;
  NEW.rental_booking_restriction_status := OLD.rental_booking_restriction_status;
  NEW.rental_booking_restriction_applied_at := OLD.rental_booking_restriction_applied_at;
  NEW.rental_booking_restriction_reason := OLD.rental_booking_restriction_reason;
  NEW.rental_booking_restriction_source_event_id := OLD.rental_booking_restriction_source_event_id;
  NEW.rental_booking_restriction_cancellation_count := OLD.rental_booking_restriction_cancellation_count;
  NEW.rental_booking_restriction_window_started_at := OLD.rental_booking_restriction_window_started_at;
  NEW.rental_booking_restriction_overridden_at := OLD.rental_booking_restriction_overridden_at;
  NEW.rental_booking_restriction_overridden_by := OLD.rental_booking_restriction_overridden_by;
  NEW.rental_booking_restriction_override_reason := OLD.rental_booking_restriction_override_reason;
  NEW.rental_booking_restriction_unrestricted_at := OLD.rental_booking_restriction_unrestricted_at;
  NEW.rental_booking_restriction_unrestricted_by := OLD.rental_booking_restriction_unrestricted_by;
  RETURN NEW;
END;
$$;

ALTER TABLE public.rental_booking_cancellation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_booking_cancellation_events_service_role_all" ON public.rental_booking_cancellation_events;
CREATE POLICY "rental_booking_cancellation_events_service_role_all"
  ON public.rental_booking_cancellation_events FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "payment_refunds_service_role_all" ON public.payment_refunds;
CREATE POLICY "payment_refunds_service_role_all"
  ON public.payment_refunds FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

GRANT ALL ON public.rental_booking_cancellation_events TO service_role;
GRANT ALL ON public.payment_refunds TO service_role;

COMMENT ON COLUMN public.users.rental_booking_restriction_status IS
  'Dedicated online rental booking restriction status. Do not overload account_status for excessive-cancellation restrictions.';
COMMENT ON COLUMN public.rental_bookings.cancellation_source_event_id IS
  'Latest cancellation provenance event. Do not infer qualifying customer cancellations from status = cancelled alone.';
