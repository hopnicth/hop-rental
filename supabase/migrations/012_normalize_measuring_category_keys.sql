-- ============================================================
-- HOPNIC — Migration 012: Normalize measuring_tools sub-category keys
-- ============================================================
-- Seed 005 introduced ad-hoc keys (me02/me03/me04) that do not match the
-- frontend mockSubCategories (mt02/mt03/mt04). Replace them in place so
-- the filter UI can resolve labels from i18n.
-- ============================================================

UPDATE public.products
SET category_keys = array_replace(category_keys, 'me02', 'mt02')
WHERE 'me02' = ANY(category_keys);

UPDATE public.products
SET category_keys = array_replace(category_keys, 'me03', 'mt03')
WHERE 'me03' = ANY(category_keys);

UPDATE public.products
SET category_keys = array_replace(category_keys, 'me04', 'mt04')
WHERE 'me04' = ANY(category_keys);
