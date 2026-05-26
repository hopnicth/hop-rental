-- ============================================================
-- Migration 101: Partner content blocks
--
-- Adds content_blocks JSONB column to partner_profiles for
-- storing an ordered array of typed content blocks.
--
-- MVP block types:
--   text       — optional title + required plain-text body
--   drive_doc  — title + Google Drive/Docs URL
--   youtube    — optional title + YouTube URL + extracted videoId
--
-- Design decisions:
--   * Array order = public display order (no sort_order sub-key)
--   * Max 20 blocks enforced at application layer, not DB
--   * Public API filters to isVisible=true blocks only
--   * Admin API returns all blocks including hidden (isVisible=false)
--   * content_blocks is public-safe — no sensitive data
--   * GRANT SELECT to anon/authenticated (same pattern as migration 100)
-- ============================================================

-- ── 1. Add column ─────────────────────────────────────────────────────────────

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS content_blocks JSONB NOT NULL DEFAULT '[]';

-- ── 2. Check constraint (must be a JSON array) ────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partner_profiles_content_blocks_check'
      AND conrelid = 'public.partner_profiles'::regclass
  ) THEN
    ALTER TABLE public.partner_profiles
      ADD CONSTRAINT partner_profiles_content_blocks_check
      CHECK (jsonb_typeof(content_blocks) = 'array');
  END IF;
END;
$$;

-- ── 3. Column-level grant ─────────────────────────────────────────────────────
-- content_blocks is public-safe (no KYC/private data).
-- Extends read access for anon/authenticated.
-- Does NOT change any existing column grants or RLS policy logic.

GRANT SELECT (content_blocks)
  ON public.partner_profiles TO anon, authenticated;

-- ── 4. Column comment ─────────────────────────────────────────────────────────

COMMENT ON COLUMN public.partner_profiles.content_blocks IS
  'Ordered array of typed content blocks. '
  'Supported MVP types: text, drive_doc, youtube. '
  'Array order = public display order. '
  'Public API filters to isVisible=true blocks only. '
  'Max 20 blocks enforced at application layer.';
