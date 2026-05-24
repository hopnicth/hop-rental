-- ============================================================
-- 099_partner_secondary_categories_search_keywords.sql
--
-- Partner Directory MVP — Secondary Categories & Search Keywords.
--
-- Adds to public.partner_profiles:
--   secondary_category_keys  TEXT[] NOT NULL DEFAULT '{}'
--   search_keywords          TEXT[] NOT NULL DEFAULT '{}'
--
-- Design decisions:
--   * No FK constraint on array elements — Postgres cannot enforce
--     REFERENCES on individual TEXT[] elements. App layer validates
--     that each key in secondary_category_keys carries the correct
--     directory_type_ prefix and is absent from main_category_key.
--     Same pattern as service_areas (migration 096).
--   * secondary_category_keys is public-safe: GRANT SELECT to anon
--     and authenticated so it can be returned in public listing payloads
--     and shown as category chips on partner cards.
--   * search_keywords is internal/server-side only: intentionally NOT
--     granted to anon or authenticated. The server API (service_role)
--     reads it for search matching; it is never exposed in public payloads.
--   * Both columns default to '{}', so existing rows require no backfill.
-- ============================================================

-- ── 1. Add columns ────────────────────────────────────────────────────────────

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS secondary_category_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS search_keywords          TEXT[] NOT NULL DEFAULT '{}';

-- ── 2. GIN indexes ────────────────────────────────────────────────────────────
--
-- secondary_category_keys:
--   Supports array-containment filter:
--     secondary_category_keys @> ARRAY['store_electrical_supplies']
--   Used by public category filter to match partners whose secondary
--   categories include the requested key (OR with main_category_key).
--
-- search_keywords:
--   Supports array-overlap search:
--     search_keywords && ARRAY['term']
--   Server-side only — not surfaced in public payloads.

CREATE INDEX IF NOT EXISTS idx_partner_profiles_secondary_categories
  ON public.partner_profiles USING GIN (secondary_category_keys);

CREATE INDEX IF NOT EXISTS idx_partner_profiles_search_keywords
  ON public.partner_profiles USING GIN (search_keywords);

-- ── 3. Column-level grants ────────────────────────────────────────────────────
--
-- secondary_category_keys: public-safe → grant SELECT to anon and authenticated.
-- search_keywords: internal only → intentionally NOT granted.
--
-- Does NOT change any existing column grants or RLS policy logic.

GRANT SELECT (secondary_category_keys)
  ON public.partner_profiles TO anon, authenticated;

-- ── 4. Column comments ────────────────────────────────────────────────────────

COMMENT ON COLUMN public.partner_profiles.secondary_category_keys IS
  'Controlled secondary partner category keys. All keys should share the same directory_type_ prefix as main_category_key (e.g. store_*, service_*, contractor_*). Validated at app layer — no DB FK on array elements. main_category_key must not appear here. GIN-indexed for array containment filter used by public category search.';

COMMENT ON COLUMN public.partner_profiles.search_keywords IS
  'Admin-provided internal search keywords. Used by server-side search matching only (service_role). Never exposed in public payloads — column SELECT not granted to anon or authenticated. GIN-indexed for array overlap search. Examples: trade names, common misspellings, Thai synonyms.';
