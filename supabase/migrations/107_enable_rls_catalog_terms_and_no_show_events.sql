-- ============================================================
-- 107_enable_rls_catalog_terms_and_no_show_events.sql
--
-- Scope:
--   * Enable Row Level Security on two public tables flagged by the
--     Supabase security linter as "RLS disabled in public schema":
--       - public.catalog_terms
--       - public.rental_booking_no_show_events
--   * Add service_role-only ALL policies so existing server APIs
--     (which all use serverSupabaseServiceRole / adminClient) keep working.
--
-- Key design decisions:
--   * Smallest safe change: ENABLE RLS + a single service_role ALL policy
--     per table. With RLS enabled and only a service_role policy present,
--     anon/authenticated are denied every row and every write — no explicit
--     REVOKE is required (mirrors the sibling event tables in migration 085).
--   * catalog_terms is an ADMIN-ONLY autocomplete dictionary. Audit found it
--     is read solely via service_role in /api/admin/products/suggestions and
--     written solely by SECURITY DEFINER sync triggers (which bypass RLS).
--     It has NO public/storefront consumer, so NO anon/authenticated SELECT
--     policy is granted. (The SECURITY DEFINER triggers from migrations 017 /
--     027 / 052 run as the function owner and are unaffected by RLS.)
--   * rental_booking_no_show_events is an immutable internal audit/event
--     table — the direct sibling of the forfeiture/recognition event tables
--     secured in migration 085. It is accessed only through service_role
--     server APIs (customer + admin), so it gets NO public policy.
-- ============================================================

-- ── public.catalog_terms — admin/service-role-only dictionary ────────────────
ALTER TABLE public.catalog_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_terms_service_role_all" ON public.catalog_terms;
CREATE POLICY "catalog_terms_service_role_all"
  ON public.catalog_terms FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON public.catalog_terms TO service_role;

-- ── public.rental_booking_no_show_events — internal audit/event table ─────────
ALTER TABLE public.rental_booking_no_show_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_booking_no_show_events_service_role_all"
  ON public.rental_booking_no_show_events;
CREATE POLICY "rental_booking_no_show_events_service_role_all"
  ON public.rental_booking_no_show_events FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON public.rental_booking_no_show_events TO service_role;
