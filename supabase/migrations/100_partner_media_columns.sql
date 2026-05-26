-- ============================================================
-- Migration 100: Partner media columns
--
-- Adds two nullable TEXT columns to partner_profiles for
-- structured media uploaded and processed server-side via
-- the catalog-media public bucket:
--
--   thumbnail_image_url — square/portrait crop (card grid)
--   cover_image_url     — wide banner crop (detail hero)
--
-- Both are public-safe: GRANT SELECT to anon and authenticated.
-- The existing main_image_url column is preserved as a
-- backward-compatible fallback in the UI fallback chain:
--   thumbnail_image_url → cover_image_url → main_image_url → placeholder
-- ============================================================

-- ── 1. Add columns ────────────────────────────────────────────────────────────

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS thumbnail_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url     TEXT;

-- ── 2. Column-level grants ────────────────────────────────────────────────────
-- Both columns are public-safe (no sensitive data).
-- Extend read access for anon/authenticated.
-- Does NOT change any existing column grants or RLS policy logic.

GRANT SELECT (thumbnail_image_url, cover_image_url)
  ON public.partner_profiles TO anon, authenticated;

-- ── 3. Column comments ────────────────────────────────────────────────────────

COMMENT ON COLUMN public.partner_profiles.thumbnail_image_url IS
  'Optional square/portrait thumbnail image URL (public catalog-media bucket, WebP, server-processed). Used as primary image on partner cards. UI fallback: thumbnail_image_url → cover_image_url → main_image_url → placeholder.';

COMMENT ON COLUMN public.partner_profiles.cover_image_url IS
  'Optional wide banner cover image URL (public catalog-media bucket, WebP, server-processed). Used as hero image on partner detail page. UI fallback: cover_image_url → main_image_url → placeholder.';
