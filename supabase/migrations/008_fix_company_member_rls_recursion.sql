-- ============================================================
-- 008_fix_company_member_rls_recursion.sql
--
-- Fix recursive RLS evaluation on public.company_members.
--
-- Symptom:
-- - INSERT/SELECT on tables that check company membership can fail with:
--   "infinite recursion detected in policy for relation \"company_members\""
--
-- Cause:
-- - company_members policies queried public.company_members inside their own
--   policy expressions, which caused recursive RLS evaluation.
--
-- Fix:
-- - Move membership/admin checks into SECURITY DEFINER helper functions.
-- - Recreate policies to use those helpers instead of self-referencing EXISTS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_company_member(target_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = target_company_id
      AND cm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin(target_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = target_company_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'b2b_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_company_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_admin(UUID) TO authenticated;

DROP POLICY IF EXISTS "companies_select_member" ON public.companies;
DROP POLICY IF EXISTS "companies_update_admin" ON public.companies;

CREATE POLICY "companies_select_member"
  ON public.companies FOR SELECT
  USING (public.is_company_member(id));

CREATE POLICY "companies_update_admin"
  ON public.companies FOR UPDATE
  USING (public.is_company_admin(id))
  WITH CHECK (public.is_company_admin(id));

DROP POLICY IF EXISTS "members_select_same_company" ON public.company_members;
DROP POLICY IF EXISTS "members_insert_admin" ON public.company_members;
DROP POLICY IF EXISTS "members_delete_admin" ON public.company_members;
DROP POLICY IF EXISTS "members_update_admin" ON public.company_members;

CREATE POLICY "members_select_same_company"
  ON public.company_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_company_member(company_id)
  );

CREATE POLICY "members_insert_admin"
  ON public.company_members FOR INSERT
  WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "members_delete_admin"
  ON public.company_members FOR DELETE
  USING (public.is_company_admin(company_id));

CREATE POLICY "members_update_admin"
  ON public.company_members FOR UPDATE
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));