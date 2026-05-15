-- 070: Security-first schema hardening
--
-- Scope:
--   * Enable RLS on sensitive operational tables that previously had no RLS.
--   * Restrict those tables to service-role/server-controlled access.
--   * Remove broad direct client mutation paths for submitted orders/order items.
--   * Limit direct customer rental booking writes to own draft, non-walk-in rows.
--
-- This migration intentionally does not add server utilities, UI, document, tax,
-- print, or payment-allocation flows.

-- ── 1. Enable RLS on sensitive tables and make them service-role only ─────────

ALTER TABLE public.walk_in_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_booking_deposit_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_booking_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_booking_deposit_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_branch_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "walk_in_customers_service_role_all"
  ON public.walk_in_customers;
CREATE POLICY "walk_in_customers_service_role_all"
  ON public.walk_in_customers FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "rental_booking_deposit_proofs_service_role_all"
  ON public.rental_booking_deposit_proofs;
CREATE POLICY "rental_booking_deposit_proofs_service_role_all"
  ON public.rental_booking_deposit_proofs FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "rental_booking_fulfillments_service_role_all"
  ON public.rental_booking_fulfillments;
CREATE POLICY "rental_booking_fulfillments_service_role_all"
  ON public.rental_booking_fulfillments FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "rental_booking_deposit_action_logs_service_role_all"
  ON public.rental_booking_deposit_action_logs;
CREATE POLICY "rental_booking_deposit_action_logs_service_role_all"
  ON public.rental_booking_deposit_action_logs FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "admin_user_branch_access_service_role_all"
  ON public.admin_user_branch_access;
CREATE POLICY "admin_user_branch_access_service_role_all"
  ON public.admin_user_branch_access FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "store_branches_service_role_all"
  ON public.store_branches;
CREATE POLICY "store_branches_service_role_all"
  ON public.store_branches FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON public.walk_in_customers FROM anon, authenticated;
REVOKE ALL ON public.rental_booking_deposit_proofs FROM anon, authenticated;
REVOKE ALL ON public.rental_booking_fulfillments FROM anon, authenticated;
REVOKE ALL ON public.rental_booking_deposit_action_logs FROM anon, authenticated;
REVOKE ALL ON public.admin_user_branch_access FROM anon, authenticated;
REVOKE ALL ON public.store_branches FROM anon, authenticated;

GRANT ALL ON public.walk_in_customers TO service_role;
GRANT ALL ON public.rental_booking_deposit_proofs TO service_role;
GRANT ALL ON public.rental_booking_fulfillments TO service_role;
GRANT ALL ON public.rental_booking_deposit_action_logs TO service_role;
GRANT ALL ON public.admin_user_branch_access TO service_role;
GRANT ALL ON public.store_branches TO service_role;

-- ── 2. Remove broad direct client mutation paths for orders/order_items ───────

DROP POLICY IF EXISTS "orders_insert_own_or_company" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_own_or_company" ON public.orders;
DROP POLICY IF EXISTS "order_items_insert_via_owned_order" ON public.order_items;

-- Preserve SELECT policies, but remove direct client write privileges for
-- submitted financial records. Server/service-role APIs remain responsible for
-- order creation, rollback, cancellation, inventory, payment, and documents.
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;

GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;

-- ── 3. Replace rental booking client writes with draft-only policies ──────────

DROP POLICY IF EXISTS "rental_bookings_insert_own" ON public.rental_bookings;
DROP POLICY IF EXISTS "rental_bookings_update_own" ON public.rental_bookings;
DROP POLICY IF EXISTS "rental_bookings_delete_own" ON public.rental_bookings;

DROP POLICY IF EXISTS "rental_bookings_insert_own_draft" ON public.rental_bookings;
CREATE POLICY "rental_bookings_insert_own_draft"
  ON public.rental_bookings FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'draft'
    AND walk_in_phone IS NULL
  );

DROP POLICY IF EXISTS "rental_bookings_update_own_draft" ON public.rental_bookings;
CREATE POLICY "rental_bookings_update_own_draft"
  ON public.rental_bookings FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND status = 'draft'
    AND walk_in_phone IS NULL
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'draft'
    AND walk_in_phone IS NULL
  );

DROP POLICY IF EXISTS "rental_bookings_delete_own_draft" ON public.rental_bookings;
CREATE POLICY "rental_bookings_delete_own_draft"
  ON public.rental_bookings FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND status = 'draft'
    AND walk_in_phone IS NULL
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_bookings TO authenticated;
GRANT ALL ON public.rental_bookings TO service_role;

COMMENT ON POLICY "rental_bookings_insert_own_draft" ON public.rental_bookings IS
  'Customers may create only their own draft, non-walk-in booking rows. Confirmation and lifecycle changes are server-controlled.';

COMMENT ON POLICY "rental_bookings_update_own_draft" ON public.rental_bookings IS
  'Customers may update only their own draft, non-walk-in booking rows. RLS limits row state; server confirmation must validate final values.';

COMMENT ON POLICY "rental_bookings_delete_own_draft" ON public.rental_bookings IS
  'Customers may delete only their own draft, non-walk-in booking rows. Confirmed/lifecycle records are server-controlled.';
