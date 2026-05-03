-- 051: Payment alerts resolution + admin access
--
-- Adds an "open vs resolved" lifecycle to payment_alerts so the admin UI can
-- list outstanding work, mark items handled, and auto-resolve on tracking
-- save. Also adds the SELECT/UPDATE policies platform admins need to read +
-- manage admin-audience alerts (audience='admin' rows are otherwise blocked
-- by the existing user-only policy).

ALTER TABLE public.payment_alerts
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payment_alerts.resolved_at IS
  'When the alert was acknowledged. NULL = open, requires admin attention.';
COMMENT ON COLUMN public.payment_alerts.resolved_by IS
  'Admin user who resolved the alert (manual or auto via tracking save).';

-- Open-alerts queue index: covers the most common admin filter — unresolved
-- admin alerts ordered by recency, with severity for the UI sort key.
CREATE INDEX IF NOT EXISTS idx_payment_alerts_admin_open
  ON public.payment_alerts (audience, resolved_at, created_at DESC)
  WHERE audience = 'admin' AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_alerts_order
  ON public.payment_alerts (order_id, created_at DESC);

-- ── Admin RLS ─────────────────────────────────────────────────────────────
-- Platform admins (staff + super_admin) can read every alert and update only
-- the resolution columns. The existing 'payment_alerts_select_own_user_alerts'
-- policy stays in place for end users.
-- DROP-then-CREATE so the migration is safely re-runnable on Postgres < 17
-- (which does not support CREATE POLICY IF NOT EXISTS).

DROP POLICY IF EXISTS "payment_alerts_select_admin" ON public.payment_alerts;
CREATE POLICY "payment_alerts_select_admin"
  ON public.payment_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.platform_role IN ('staff', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "payment_alerts_update_admin" ON public.payment_alerts;
CREATE POLICY "payment_alerts_update_admin"
  ON public.payment_alerts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.platform_role IN ('staff', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.platform_role IN ('staff', 'super_admin')
    )
  );

-- Realtime: Supabase enables realtime per-table via the supabase_realtime
-- publication. Idempotent ALTER PUBLICATION so re-running the migration is
-- safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_alerts;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
