-- ============================================================
-- 117_seed_partner_subcategories.sql
--
-- Scope:
--   * Seeds level-1 subcategories under the 8 top-level partner
--     categories created in migration 116.
--   * Data-only — no DDL, no schema change. The parent_id / level /
--     constraints / indexes / RLS already exist from 116.
--
-- Key design decisions:
--   * Parent-prefixed snake_case slugs (e.g. drafting_design_architectural)
--     guarantee the global UNIQUE(slug) constraint can never collide between
--     sibling trees (e.g. contractor "electrical" vs engineer "electrical").
--   * Each row sets level = 1 and a non-null parent_id resolved by parent
--     slug — required by the partner_categories_level_parent_consistent CHECK.
--   * ON CONFLICT (slug) DO UPDATE SET — safe to replay on db reset --local —
--     updates ONLY icon, sort_order, is_active, is_public, updated_at.
--     parent_id and level are IDENTITY fields and are deliberately excluded
--     from the update clause so they can never drift silently on re-seed
--     (mirrors the level-0 seed convention in migration 116).
--   * Slugs are permanent identity. Deactivation later is is_active = false —
--     never DELETE (parent_id ON DELETE RESTRICT + permanent slug).
--   * Validation block asserts the expected level-1 count and that every
--     seeded subcategory links to the correct parent. Read-only — no
--     ephemeral rows, nothing to roll back.
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Seed level-1 subcategories
--    parent_id resolved via subquery on the parent's level-0 slug.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.partner_categories
  (slug, parent_id, level, icon, sort_order, is_active, is_public)
VALUES
  -- construction_materials (parent sort_order 10)
  ('construction_materials_cement_concrete',  (SELECT id FROM public.partner_categories WHERE slug = 'construction_materials'), 1, 'i-lucide-layers',         10, TRUE, TRUE),
  ('construction_materials_steel_rebar',       (SELECT id FROM public.partner_categories WHERE slug = 'construction_materials'), 1, 'i-lucide-grip',           20, TRUE, TRUE),
  ('construction_materials_bricks_blocks',     (SELECT id FROM public.partner_categories WHERE slug = 'construction_materials'), 1, 'i-lucide-brick-wall',     30, TRUE, TRUE),
  ('construction_materials_roofing',           (SELECT id FROM public.partner_categories WHERE slug = 'construction_materials'), 1, 'i-lucide-house',          40, TRUE, TRUE),
  ('construction_materials_electrical_supplies', (SELECT id FROM public.partner_categories WHERE slug = 'construction_materials'), 1, 'i-lucide-zap',          50, TRUE, TRUE),
  ('construction_materials_plumbing_supplies', (SELECT id FROM public.partner_categories WHERE slug = 'construction_materials'), 1, 'i-lucide-droplets',       60, TRUE, TRUE),
  ('construction_materials_paint_finishing',   (SELECT id FROM public.partner_categories WHERE slug = 'construction_materials'), 1, 'i-lucide-paint-roller',   70, TRUE, TRUE),
  ('construction_materials_hardware_tools',    (SELECT id FROM public.partner_categories WHERE slug = 'construction_materials'), 1, 'i-lucide-wrench',         80, TRUE, TRUE),

  -- contractor_services (parent sort_order 20)
  ('contractor_services_general',            (SELECT id FROM public.partner_categories WHERE slug = 'contractor_services'), 1, 'i-lucide-hard-hat',       10, TRUE, TRUE),
  ('contractor_services_structural',         (SELECT id FROM public.partner_categories WHERE slug = 'contractor_services'), 1, 'i-lucide-building',       20, TRUE, TRUE),
  ('contractor_services_electrical',         (SELECT id FROM public.partner_categories WHERE slug = 'contractor_services'), 1, 'i-lucide-zap',            30, TRUE, TRUE),
  ('contractor_services_plumbing_sanitary',  (SELECT id FROM public.partner_categories WHERE slug = 'contractor_services'), 1, 'i-lucide-droplets',       40, TRUE, TRUE),
  ('contractor_services_roofing_steel',      (SELECT id FROM public.partner_categories WHERE slug = 'contractor_services'), 1, 'i-lucide-house',          50, TRUE, TRUE),
  ('contractor_services_finishing',          (SELECT id FROM public.partner_categories WHERE slug = 'contractor_services'), 1, 'i-lucide-paintbrush',     60, TRUE, TRUE),
  ('contractor_services_demolition',         (SELECT id FROM public.partner_categories WHERE slug = 'contractor_services'), 1, 'i-lucide-hammer',         70, TRUE, TRUE),

  -- freelance_technicians (parent sort_order 30)
  ('freelance_technicians_electrician',      (SELECT id FROM public.partner_categories WHERE slug = 'freelance_technicians'), 1, 'i-lucide-zap',           10, TRUE, TRUE),
  ('freelance_technicians_plumber',          (SELECT id FROM public.partner_categories WHERE slug = 'freelance_technicians'), 1, 'i-lucide-droplets',      20, TRUE, TRUE),
  ('freelance_technicians_welder',           (SELECT id FROM public.partner_categories WHERE slug = 'freelance_technicians'), 1, 'i-lucide-flame',         30, TRUE, TRUE),
  ('freelance_technicians_air_conditioning', (SELECT id FROM public.partner_categories WHERE slug = 'freelance_technicians'), 1, 'i-lucide-wind',          40, TRUE, TRUE),
  ('freelance_technicians_carpenter',        (SELECT id FROM public.partner_categories WHERE slug = 'freelance_technicians'), 1, 'i-lucide-hammer',        50, TRUE, TRUE),
  ('freelance_technicians_painter',          (SELECT id FROM public.partner_categories WHERE slug = 'freelance_technicians'), 1, 'i-lucide-paint-roller',  60, TRUE, TRUE),

  -- freelance_foremen (parent sort_order 40)
  ('freelance_foremen_civil',                (SELECT id FROM public.partner_categories WHERE slug = 'freelance_foremen'), 1, 'i-lucide-hard-hat',      10, TRUE, TRUE),
  ('freelance_foremen_mep',                  (SELECT id FROM public.partner_categories WHERE slug = 'freelance_foremen'), 1, 'i-lucide-cable',         20, TRUE, TRUE),
  ('freelance_foremen_finishing',            (SELECT id FROM public.partner_categories WHERE slug = 'freelance_foremen'), 1, 'i-lucide-paintbrush',    30, TRUE, TRUE),

  -- freelance_engineers (parent sort_order 50)
  ('freelance_engineers_civil',              (SELECT id FROM public.partner_categories WHERE slug = 'freelance_engineers'), 1, 'i-lucide-building-2',   10, TRUE, TRUE),
  ('freelance_engineers_structural',         (SELECT id FROM public.partner_categories WHERE slug = 'freelance_engineers'), 1, 'i-lucide-building',     20, TRUE, TRUE),
  ('freelance_engineers_mechanical',         (SELECT id FROM public.partner_categories WHERE slug = 'freelance_engineers'), 1, 'i-lucide-cog',          30, TRUE, TRUE),
  ('freelance_engineers_electrical',         (SELECT id FROM public.partner_categories WHERE slug = 'freelance_engineers'), 1, 'i-lucide-zap',          40, TRUE, TRUE),
  ('freelance_engineers_environmental',      (SELECT id FROM public.partner_categories WHERE slug = 'freelance_engineers'), 1, 'i-lucide-leaf',         50, TRUE, TRUE),

  -- freelance_safety_officers (parent sort_order 60)
  ('freelance_safety_officers_basic',        (SELECT id FROM public.partner_categories WHERE slug = 'freelance_safety_officers'), 1, 'i-lucide-shield',        10, TRUE, TRUE),
  ('freelance_safety_officers_professional', (SELECT id FROM public.partner_categories WHERE slug = 'freelance_safety_officers'), 1, 'i-lucide-shield-check',  20, TRUE, TRUE),
  ('freelance_safety_officers_manager',      (SELECT id FROM public.partner_categories WHERE slug = 'freelance_safety_officers'), 1, 'i-lucide-shield-alert',  30, TRUE, TRUE),

  -- drafting_design (parent sort_order 70)
  ('drafting_design_architectural',          (SELECT id FROM public.partner_categories WHERE slug = 'drafting_design'), 1, 'i-lucide-pen-tool',          10, TRUE, TRUE),
  ('drafting_design_structural',             (SELECT id FROM public.partner_categories WHERE slug = 'drafting_design'), 1, 'i-lucide-ruler',             20, TRUE, TRUE),
  ('drafting_design_mep',                    (SELECT id FROM public.partner_categories WHERE slug = 'drafting_design'), 1, 'i-lucide-cable',             30, TRUE, TRUE),
  ('drafting_design_bim',                    (SELECT id FROM public.partner_categories WHERE slug = 'drafting_design'), 1, 'i-lucide-box',               40, TRUE, TRUE),
  ('drafting_design_interior',               (SELECT id FROM public.partner_categories WHERE slug = 'drafting_design'), 1, 'i-lucide-sofa',              50, TRUE, TRUE),

  -- plc_programmers (parent sort_order 80)
  ('plc_programmers_plc',                    (SELECT id FROM public.partner_categories WHERE slug = 'plc_programmers'), 1, 'i-lucide-cpu',                10, TRUE, TRUE),
  ('plc_programmers_scada_hmi',              (SELECT id FROM public.partner_categories WHERE slug = 'plc_programmers'), 1, 'i-lucide-monitor',            20, TRUE, TRUE),
  ('plc_programmers_automation',             (SELECT id FROM public.partner_categories WHERE slug = 'plc_programmers'), 1, 'i-lucide-bot',                30, TRUE, TRUE),
  ('plc_programmers_robotics',               (SELECT id FROM public.partner_categories WHERE slug = 'plc_programmers'), 1, 'i-lucide-bot',                40, TRUE, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  icon       = excluded.icon,
  sort_order = excluded.sort_order,
  is_active  = excluded.is_active,
  is_public  = excluded.is_public,
  updated_at = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Validation (read-only — asserts counts and parent links)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count   integer;
  v_orphan  integer;
  v_badlvl  integer;
BEGIN
  -- Expected number of level-1 subcategories seeded by this migration
  SELECT count(*) INTO v_count
  FROM public.partner_categories
  WHERE level = 1;
  ASSERT v_count = 41,
    format('Expected 41 level-1 subcategories after seed, got %s', v_count);

  -- Every level-1 row must have a non-null parent that is itself level 0
  SELECT count(*) INTO v_orphan
  FROM public.partner_categories child
  LEFT JOIN public.partner_categories parent ON parent.id = child.parent_id
  WHERE child.level = 1
    AND (parent.id IS NULL OR parent.level <> 0);
  ASSERT v_orphan = 0,
    format('Expected 0 level-1 rows with missing/non-level-0 parent, got %s', v_orphan);

  -- Every level-1 slug must be prefixed with its parent's slug + '_'
  SELECT count(*) INTO v_badlvl
  FROM public.partner_categories child
  JOIN public.partner_categories parent ON parent.id = child.parent_id
  WHERE child.level = 1
    AND child.slug NOT LIKE parent.slug || '\_%';
  ASSERT v_badlvl = 0,
    format('Expected all level-1 slugs to be parent-prefixed, got %s violations', v_badlvl);

  RAISE NOTICE 'migration 117 validation: % level-1 subcategories seeded, all parent links valid', v_count;
END;
$$;
