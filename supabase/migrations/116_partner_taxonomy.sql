-- ============================================================
-- 116_partner_taxonomy.sql
--
-- Scope:
--   * Creates partner_categories — dedicated taxonomy table for partner
--     directory, separate from main_categories (which serves products/assets).
--   * Creates partner_category_assignments — many-to-many join between
--     partner_profiles and partner_categories.
--   * Seeds 8 approved top-level categories (level 0).
--   * Adds RLS helper function is_public_partner_profile().
--
-- Key design decisions:
--   * Additive only — partner_profiles.main_category_key and
--     secondary_category_keys are untouched. Old columns remain as bridge
--     until manual admin assignment is complete (Phase B-2).
--   * Fail-closed writes: no INSERT/UPDATE/DELETE granted to anon or
--     authenticated in B-1. All writes go through service_role-backed
--     admin API routes (Phase B-2).
--   * Seed uses ON CONFLICT DO UPDATE SET (not DO NOTHING) — safe to
--     replay on supabase db reset --local.
--   * Transactional validation block inserts test rows then raises a
--     sentinel exception to roll them back — zero persistent test rows.
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. RLS helper: visibility predicate for partner_category_assignments
-- ─────────────────────────────────────────────────────────────────────────────

-- SECURITY DEFINER + SET search_path: the function runs as its owner, bypassing
-- partner_profiles RLS entirely. The explicit WHERE is_public = TRUE clause is
-- therefore the sole visibility gate — not partner_profiles SELECT policies.
-- This means assignment visibility cannot change if partner_profiles RLS policies
-- are later modified, added, or reordered. Invoker-rights would couple assignment
-- visibility to whatever partner_profiles policies happen to apply to the caller,
-- which is the fragility we explicitly want to avoid.
-- SET search_path = public, pg_temp prevents search_path injection (no schema
-- controlled by a non-privileged role can shadow public.partner_profiles).
CREATE OR REPLACE FUNCTION public.is_public_partner_profile(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_profiles
    WHERE id = p_id AND is_public = TRUE
  );
$$;

COMMENT ON FUNCTION public.is_public_partner_profile(uuid) IS
  'RLS helper (SECURITY DEFINER) used by partner_category_assignments SELECT policy. '
  'Explicitly checks is_public = TRUE on partner_profiles — not dependent on '
  'partner_profiles RLS policies, which could change independently.';

-- Explicit REVOKE before targeted GRANT: Postgres grants EXECUTE to PUBLIC
-- by default on new functions. Without this REVOKE any database role could
-- call the function regardless of table-level restrictions.
REVOKE ALL ON FUNCTION public.is_public_partner_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_partner_profile(uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. partner_categories
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        NOT NULL,
  parent_id   uuid        REFERENCES public.partner_categories(id) ON DELETE RESTRICT,
  level       integer     NOT NULL DEFAULT 0,
  icon        text,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  is_public   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partner_categories_slug_unique UNIQUE (slug),
  CONSTRAINT partner_categories_slug_format
    CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT partner_categories_level_range
    CHECK (level >= 0 AND level <= 3),
  CONSTRAINT partner_categories_level_parent_consistent
    CHECK (
      (parent_id IS NULL AND level = 0)
      OR (parent_id IS NOT NULL AND level > 0)
    )
);

COMMENT ON TABLE public.partner_categories IS
  'Dedicated partner taxonomy — separate from main_categories (products/assets). '
  'Level 0 = 8 top-level categories seeded in migration 116. '
  'Level 1–3 reserved for future subcategories (parent_id + level infra included). '
  'Assignments live in partner_category_assignments (many-to-many join).';

COMMENT ON COLUMN public.partner_categories.parent_id IS
  'Self-reference for subcategory nesting. NULL on all level-0 rows seeded here.';

COMMENT ON COLUMN public.partner_categories.slug IS
  'Lowercase snake_case identifier. Frontend derives the i18n key as '
  'partners.categories.${slug} — no i18n_key column needed.';

-- public.update_updated_at() was defined in migration 001 without SET search_path.
-- Re-declare here with the pin so this and all existing callers are hardened.
-- Body is identical — only the security attribute changes.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_partner_categories_updated_at ON public.partner_categories;
CREATE TRIGGER set_partner_categories_updated_at
  BEFORE UPDATE ON public.partner_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_partner_categories_parent_active
  ON public.partner_categories(parent_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_partner_categories_public_sort
  ON public.partner_categories(is_public, is_active, level, sort_order);

ALTER TABLE public.partner_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_categories_select_public_active"
  ON public.partner_categories FOR SELECT
  USING (is_active = TRUE AND is_public = TRUE);

CREATE POLICY "partner_categories_service_role_all"
  ON public.partner_categories FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

REVOKE ALL ON public.partner_categories FROM anon, authenticated;
GRANT SELECT ON public.partner_categories TO anon, authenticated;
GRANT ALL ON public.partner_categories TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. partner_category_assignments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_category_assignments (
  partner_profile_id  uuid        NOT NULL
    REFERENCES public.partner_profiles(id) ON DELETE CASCADE,
  category_id         uuid        NOT NULL
    REFERENCES public.partner_categories(id) ON DELETE RESTRICT,
  is_primary          boolean     NOT NULL DEFAULT FALSE,
  source              text        NOT NULL DEFAULT 'admin',
  confidence          numeric(4,3),
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partner_category_assignments_pkey
    PRIMARY KEY (partner_profile_id, category_id),
  CONSTRAINT partner_category_assignments_source_check
    CHECK (source IN ('admin', 'ai_extracted', 'backfill', 'partner_self')),
  CONSTRAINT partner_category_assignments_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0.000 AND confidence <= 1.000))
);

COMMENT ON TABLE public.partner_category_assignments IS
  'Many-to-many join: partner_profiles ↔ partner_categories. '
  'is_primary marks the canonical category (partial unique index enforces at most one per partner). '
  'No rows seeded in B-1 — manual admin assignment via admin form in B-2.';

COMMENT ON COLUMN public.partner_category_assignments.is_primary IS
  'At most one primary assignment per partner, enforced by '
  'idx_partner_category_assignments_one_primary partial unique index. '
  'A partner with zero assignments has no primary; a partner with assignments '
  'must designate exactly one as primary before the assignment is considered complete.';

COMMENT ON COLUMN public.partner_category_assignments.source IS
  'Origin of this assignment: admin (manual), ai_extracted, backfill, or partner_self.';

COMMENT ON COLUMN public.partner_category_assignments.confidence IS
  'AI confidence score 0.000–1.000. NULL for manual admin assignments (source = ''admin'').';

-- At most one primary category per partner (NULL is_primary rows are not constrained)
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_category_assignments_one_primary
  ON public.partner_category_assignments(partner_profile_id)
  WHERE is_primary = TRUE;

-- Fast lookup: all partners in a given category
CREATE INDEX IF NOT EXISTS idx_partner_category_assignments_category
  ON public.partner_category_assignments(category_id, partner_profile_id);

ALTER TABLE public.partner_category_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_category_assignments_select_public"
  ON public.partner_category_assignments FOR SELECT
  USING (public.is_public_partner_profile(partner_profile_id));

CREATE POLICY "partner_category_assignments_service_role_all"
  ON public.partner_category_assignments FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

REVOKE ALL ON public.partner_category_assignments FROM anon, authenticated;
GRANT SELECT ON public.partner_category_assignments TO anon, authenticated;
GRANT ALL ON public.partner_category_assignments TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seed: 8 top-level partner categories
--    ON CONFLICT DO UPDATE SET — safe to replay on reset; icon/sort can be
--    corrected by editing this file and re-running supabase db reset --local.
--    parent_id excluded: identity field that must not drift silently on re-seed.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.partner_categories
  (slug, parent_id, level, icon, sort_order, is_active, is_public)
VALUES
  ('construction_materials',    NULL, 0, 'i-lucide-brick-wall',       10, TRUE, TRUE),
  ('contractor_services',       NULL, 0, 'i-lucide-handshake',        20, TRUE, TRUE),
  ('freelance_technicians',     NULL, 0, 'i-lucide-wrench',           30, TRUE, TRUE),
  ('freelance_foremen',         NULL, 0, 'i-lucide-clipboard-check',  40, TRUE, TRUE),
  ('freelance_engineers',       NULL, 0, 'i-lucide-ruler',            50, TRUE, TRUE),
  ('freelance_safety_officers', NULL, 0, 'i-lucide-shield-check',     60, TRUE, TRUE),
  ('drafting_design',           NULL, 0, 'i-lucide-drafting-compass', 70, TRUE, TRUE),
  ('plc_programmers',           NULL, 0, 'i-lucide-cpu',              80, TRUE, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  icon       = excluded.icon,
  sort_order = excluded.sort_order,
  is_active  = excluded.is_active,
  is_public  = excluded.is_public,
  updated_at = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Transactional validation
--    All test row inserts happen inside a BEGIN...EXCEPTION block.
--    Raising a sentinel exception at the end rolls back the savepoint,
--    removing every test row. The outer EXCEPTION handler catches the
--    sentinel and logs a NOTICE — real errors propagate and abort the migration.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_cat_construction  uuid;
  v_cat_contractor    uuid;
  v_pub_partner_id    uuid;
  v_priv_partner_id   uuid;
  v_count             integer;
BEGIN

  -- ── A. Seed assertions (read-only — rows persist after this block) ────────

  SELECT count(*) INTO v_count
  FROM public.partner_categories
  WHERE level = 0 AND is_active = TRUE AND is_public = TRUE;
  ASSERT v_count = 8,
    format('Expected 8 active public top-level categories, got %s', v_count);

  SELECT count(*) INTO v_count
  FROM public.partner_categories
  WHERE level > 0;
  ASSERT v_count = 0,
    format('Expected 0 subcategory rows in B-1, got %s', v_count);

  SELECT id INTO v_cat_construction
  FROM public.partner_categories WHERE slug = 'construction_materials';
  ASSERT v_cat_construction IS NOT NULL,
    'construction_materials category not found after seed';

  SELECT id INTO v_cat_contractor
  FROM public.partner_categories WHERE slug = 'contractor_services';
  ASSERT v_cat_contractor IS NOT NULL,
    'contractor_services category not found after seed';

  ASSERT (
    SELECT icon FROM public.partner_categories WHERE slug = 'construction_materials'
  ) = 'i-lucide-brick-wall',
    'construction_materials icon mismatch';

  ASSERT (
    SELECT sort_order FROM public.partner_categories WHERE slug = 'plc_programmers'
  ) = 80,
    'plc_programmers sort_order mismatch';

  -- ── B. Ephemeral test partners + assignments (rolled back by sentinel) ────

  v_pub_partner_id  := gen_random_uuid();
  v_priv_partner_id := gen_random_uuid();

  INSERT INTO public.partner_profiles (id, slug, directory_type, name_th, is_public)
  VALUES
    (v_pub_partner_id,  'b1val-pub',  'contractor', 'B1 Validation Public',  TRUE),
    (v_priv_partner_id, 'b1val-priv', 'contractor', 'B1 Validation Private', FALSE);

  -- Primary assignment for public test partner
  INSERT INTO public.partner_category_assignments
    (partner_profile_id, category_id, is_primary, source)
  VALUES
    (v_pub_partner_id, v_cat_construction, TRUE, 'admin');

  -- Assignment for private test partner
  INSERT INTO public.partner_category_assignments
    (partner_profile_id, category_id, is_primary, source)
  VALUES
    (v_priv_partner_id, v_cat_construction, TRUE, 'admin');

  -- ── C. One-primary partial unique index enforcement ───────────────────────

  BEGIN
    INSERT INTO public.partner_category_assignments
      (partner_profile_id, category_id, is_primary, source)
    VALUES
      (v_pub_partner_id, v_cat_contractor, TRUE, 'admin');
    RAISE EXCEPTION
      'CONSTRAINT_NOT_ENFORCED: second is_primary=true was accepted — partial unique index failed';
  EXCEPTION
    WHEN unique_violation THEN NULL; -- expected: idx_partner_category_assignments_one_primary fired
  END;

  -- Non-primary second assignment must be allowed
  INSERT INTO public.partner_category_assignments
    (partner_profile_id, category_id, is_primary, source)
  VALUES
    (v_pub_partner_id, v_cat_contractor, FALSE, 'admin');

  SELECT count(*) INTO v_count
  FROM public.partner_category_assignments
  WHERE partner_profile_id = v_pub_partner_id;
  ASSERT v_count = 2,
    format('Expected 2 assignments for public test partner, got %s', v_count);

  -- ── D. Anon RLS: prove assignment visibility is gated by partner is_public ──
  --
  -- SET LOCAL ROLE is scoped to the current subtransaction. When the sentinel
  -- exception fires and PL/pgSQL rolls back to the implicit savepoint, the role
  -- is restored automatically along with the data changes. The explicit RESET ROLE
  -- below is belt-and-suspenders and makes the intent clear to readers.

  EXECUTE 'SET LOCAL ROLE anon';

  -- anon must see both assignments for the public test partner (primary +
  -- non-primary were inserted in sections B and C above)
  SELECT count(*) INTO v_count
  FROM public.partner_category_assignments
  WHERE partner_profile_id = v_pub_partner_id;
  ASSERT v_count = 2,
    format(
      'anon must see all assignments for a public partner (expected 2, got %s)',
      v_count
    );

  -- anon must see zero assignments for the private test partner
  SELECT count(*) INTO v_count
  FROM public.partner_category_assignments
  WHERE partner_profile_id = v_priv_partner_id;
  ASSERT v_count = 0,
    format(
      'anon must not see any assignments for a private partner (expected 0, got %s)',
      v_count
    );

  EXECUTE 'RESET ROLE';

  -- ── E. Sentinel raise: triggers savepoint rollback, removes test rows ─────

  RAISE EXCEPTION 'B1_VALIDATION_PASSED';

EXCEPTION
  WHEN OTHERS THEN
    IF sqlerrm = 'B1_VALIDATION_PASSED' THEN
      RAISE NOTICE 'migration 116 validation: all assertions passed — test rows rolled back';
    ELSE
      RAISE; -- real failure: propagate to abort the migration
    END IF;
END;
$$;

-- Post-validation sanity: confirm the sentinel rollback cleaned up completely
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.partner_category_assignments;
  ASSERT v_count = 0,
    format(
      'partner_category_assignments must be empty after validation rollback — '
      'got %s rows. Test rows leaked.',
      v_count
    );

  SELECT count(*) INTO v_count
  FROM public.partner_profiles
  WHERE slug IN ('b1val-pub', 'b1val-priv');
  ASSERT v_count = 0,
    format(
      'Validation test partner_profiles rows leaked — '
      'expected 0, got %s.',
      v_count
    );

  RAISE NOTICE 'migration 116 sanity: zero test rows confirmed';
END;
$$;
