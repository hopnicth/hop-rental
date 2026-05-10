-- 061: Audit log for manual rental booking deposit adjustments.

CREATE TABLE IF NOT EXISTS public.rental_booking_deposit_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('manual_update', 'pos_create_override')),
  staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  old_values JSONB,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_action_logs_booking
  ON public.rental_booking_deposit_action_logs(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_action_logs_staff
  ON public.rental_booking_deposit_action_logs(staff_user_id, created_at DESC);

COMMENT ON TABLE public.rental_booking_deposit_action_logs IS
  'Audit trail for staff-created or manually adjusted rental booking deposit amounts.';

COMMENT ON COLUMN public.rental_booking_deposit_action_logs.staff_user_id IS
  'Staff/admin user who performed the deposit change.';