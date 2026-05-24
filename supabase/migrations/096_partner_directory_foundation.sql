-- ============================================================
-- 096_partner_directory_foundation.sql
--
-- Partner Directory MVP — schema foundation.
--
-- Creates: partner_profiles table
-- Also:    extends main_categories.entity_types to allow 'partner'
--          (minimum required for future category linkage)
--
-- Key design decisions:
--   * New purpose-built table — does NOT touch service_providers
--     (service_providers is a CMS identity/KYC anchor; see migration 065).
--   * Globally unique slug (not scoped by directory_type).
--   * is_public = FALSE default (unpublished until admin explicitly publishes).
--   * name_th required; name_en optional (app layer falls back to name_th).
--   * Line URL/ID constraints mirror service_providers exactly (migration 066).
--   * maps_url constrained to HTTPS + known Google Maps domains as a safe
--     external CTA link only — NOT a geolocation or radius-search system.
--   * service_areas TEXT[] with GIN index — same pattern as content_pages
--     service_areas column (migration 039).
--   * Private fields (kyc_documents, verified_notes, internal_notes) are
--     column-level revoked from anon and authenticated roles.
--   * update_updated_at() trigger reused from migration 001.
-- ============================================================

-- ── 1. Extend main_categories entity_types to allow 'partner' ────────────────
--
-- Minimum change needed for partner category linkage.
-- Does NOT change any existing category row's entity_types array.
-- Only adds 'partner' as an allowed value in the constraint.

ALTER TABLE public.main_categories
  DROP CONSTRAINT IF EXISTS main_categories_entity_types_chk;

ALTER TABLE public.main_categories
  ADD CONSTRAINT main_categories_entity_types_chk
  CHECK (
    cardinality(entity_types) > 0
    AND entity_types <@ ARRAY[
      'product', 'asset', 'service', 'promotion', 'blog', 'review', 'partner'
    ]::TEXT[]
  );

COMMENT ON COLUMN public.main_categories.entity_types IS
  'Entity/content types that can use this category: product, asset, service, promotion, blog, review, partner.';

-- ── 2. Create partner_profiles table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_profiles (

  -- Identity
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT        NOT NULL,
  directory_type   TEXT        NOT NULL,
  entity_type      TEXT        NOT NULL DEFAULT 'organization',

  -- Display name (TH required; EN optional — app layer falls back to name_th)
  name_th          TEXT        NOT NULL,
  name_en          TEXT,
  tagline_th       TEXT,
  tagline_en       TEXT,
  description_th   TEXT,
  description_en   TEXT,

  -- Visuals
  main_image_url   TEXT,

  -- Category linkage (optional; app layer enforces entity_type = 'partner' filter)
  main_category_key TEXT
    REFERENCES public.main_categories(key)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  -- Service area (vocabulary from thaiServiceAreas.ts; enforced at app layer)
  service_areas    TEXT[]      NOT NULL DEFAULT '{}',

  -- Contact (all optional)
  contact_phone    TEXT,
  contact_email    TEXT,
  line_id          TEXT,
  line_url         TEXT,
  maps_url         TEXT,

  -- Business hours (simple public display text only — not a scheduling system)
  business_hours_text TEXT,

  -- Verification
  is_verified      BOOLEAN     NOT NULL DEFAULT FALSE,
  verified_at      TIMESTAMPTZ,

  -- Visibility / lifecycle (no hard delete — use is_public = FALSE to archive)
  is_public        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_featured      BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order       INTEGER     NOT NULL DEFAULT 0,

  -- Admin-only private fields (column-level revoked from anon/authenticated)
  kyc_documents    JSONB       NOT NULL DEFAULT '{}'::JSONB,
  verified_notes   TEXT,
  internal_notes   TEXT,

  -- Timestamps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Constraints ────────────────────────────────────────────────────────────

  -- Globally unique slug across all partner profiles
  UNIQUE (slug),

  -- Slug format: lowercase alphanumeric + hyphens only, no leading/trailing hyphens
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

  -- Reserved route segments that must never become partner slugs
  CHECK (slug NOT IN (
    'stores', 'services', 'contractors',
    'admin', 'new', 'edit', 'create', 'delete', 'update',
    'list', 'index', 'api', 'partners', 'partner',
    'search', 'filter', 'verified', 'all', 'featured'
  )),

  -- One primary directory type per profile
  CHECK (directory_type IN ('store', 'service', 'contractor')),

  -- Entity type
  CHECK (entity_type IN ('individual', 'organization')),

  -- Display name must be non-empty
  CHECK (char_length(name_th) > 0),

  -- Email format (nullable)
  CHECK (
    contact_email IS NULL OR
    contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),

  -- Line ID format — identical to service_providers constraint (migration 066)
  CHECK (
    line_id IS NULL OR
    line_id ~ '^@?[A-Za-z0-9._-]{2,64}$'
  ),

  -- Line URL — identical to service_providers constraint (migration 066)
  CHECK (
    line_url IS NULL OR
    line_url ~* '^https://(line\.me|lin\.ee|[A-Za-z0-9.-]+\.line\.me)(/|$)'
  ),

  -- Maps URL: HTTPS + Google Maps-specific CTA domains only.
  -- goo.gl (generic legacy shortener) is intentionally excluded.
  -- This is an external link field, NOT a geolocation or radius-search system.
  CHECK (
    maps_url IS NULL OR (
      maps_url ~* '^https://maps\.google\.com(/|\?|#|$)'     OR
      maps_url ~* '^https://www\.google\.com/maps(/|\?|#|$)' OR
      maps_url ~* '^https://maps\.app\.goo\.gl(/|\?|#|$)'
    )
  ),

  -- KYC documents must be a JSON object
  CHECK (jsonb_typeof(kyc_documents) = 'object'),

  -- verified_at may only be set when the profile is verified
  CHECK (verified_at IS NULL OR is_verified = TRUE)
);

-- ── 3. Table and column comments ─────────────────────────────────────────────

COMMENT ON TABLE public.partner_profiles IS
  'HOPNIC Partner Directory MVP. One profile = one directory_type (store/service/contractor). Purpose-built — does not reuse service_providers.';

COMMENT ON COLUMN public.partner_profiles.slug IS
  'Globally unique URL slug. Format: ^[a-z0-9]+(?:-[a-z0-9]+)*$. Reserved route names blocked by constraint.';
COMMENT ON COLUMN public.partner_profiles.directory_type IS
  'Primary directory type: store, service, or contractor. One type per profile only.';
COMMENT ON COLUMN public.partner_profiles.entity_type IS
  'Legal entity type: individual (บุคคลธรรมดา) or organization (นิติบุคคล/ร้านค้า).';
COMMENT ON COLUMN public.partner_profiles.name_th IS
  'Required display name in Thai.';
COMMENT ON COLUMN public.partner_profiles.name_en IS
  'Optional display name in English. App layer falls back to name_th when NULL.';
COMMENT ON COLUMN public.partner_profiles.service_areas IS
  'Array of service-area slugs from thaiServiceAreas.ts vocabulary. Vocabulary enforced at app layer. Empty array = no specific area declared.';
COMMENT ON COLUMN public.partner_profiles.maps_url IS
  'External Google Maps CTA link only. Allowed: maps.google.com, www.google.com/maps, maps.app.goo.gl (HTTPS). goo.gl excluded. NOT a geolocation or radius-search field.';
COMMENT ON COLUMN public.partner_profiles.business_hours_text IS
  'Optional free-text public display field for business/operating hours (e.g. "จันทร์-เสาร์ 08:00-17:00"). Simple display only — not a scheduling, availability, or booking system.';
COMMENT ON COLUMN public.partner_profiles.line_url IS
  'Optional Line contact URL. HTTPS line.me / lin.ee / *.line.me only. Constraint mirrors service_providers (migration 066).';
COMMENT ON COLUMN public.partner_profiles.is_verified IS
  'HOPNIC has reviewed submitted identity/business documents. Does NOT guarantee work quality.';
COMMENT ON COLUMN public.partner_profiles.verified_at IS
  'Timestamp when HOPNIC last set is_verified = TRUE. NULL when unverified.';
COMMENT ON COLUMN public.partner_profiles.is_public IS
  'Public visibility gate. FALSE = unpublished/archived. Public RLS policy enforces is_public = TRUE.';
COMMENT ON COLUMN public.partner_profiles.kyc_documents IS
  'ADMIN-ONLY. KYC document metadata (path/url/filename/mimeType). Files in kyc-documents private bucket. Column-level revoked from anon/authenticated.';
COMMENT ON COLUMN public.partner_profiles.verified_notes IS
  'ADMIN-ONLY. Notes on verification decision. Never exposed in public payloads.';
COMMENT ON COLUMN public.partner_profiles.internal_notes IS
  'ADMIN-ONLY. Internal operational notes. Never exposed in public payloads.';

-- ── 4. Indexes ────────────────────────────────────────────────────────────────

-- Primary listing/filtering: directory type + visibility + sort
CREATE INDEX IF NOT EXISTS idx_partner_profiles_dir_public_sort
  ON public.partner_profiles(directory_type, is_public, sort_order, created_at DESC);

-- Featured/home gateway section
CREATE INDEX IF NOT EXISTS idx_partner_profiles_featured
  ON public.partner_profiles(is_public, is_featured, sort_order);

-- Verification filter
CREATE INDEX IF NOT EXISTS idx_partner_profiles_verified
  ON public.partner_profiles(is_public, is_verified);

-- Category filter
CREATE INDEX IF NOT EXISTS idx_partner_profiles_category
  ON public.partner_profiles(main_category_key, is_public)
  WHERE main_category_key IS NOT NULL;

-- Service areas GIN index — same pattern as content_pages.service_areas (migration 039)
CREATE INDEX IF NOT EXISTS idx_partner_profiles_service_areas
  ON public.partner_profiles USING GIN (service_areas);

-- ── 5. Updated-at trigger ─────────────────────────────────────────────────────
-- Reuses public.update_updated_at() defined in migration 001.

DROP TRIGGER IF EXISTS set_partner_profiles_updated_at ON public.partner_profiles;
CREATE TRIGGER set_partner_profiles_updated_at
  BEFORE UPDATE ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 6. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.partner_profiles ENABLE ROW LEVEL SECURITY;

-- Public visitors and authenticated users can only see published profiles.
DROP POLICY IF EXISTS "partner_profiles_select_public" ON public.partner_profiles;
CREATE POLICY "partner_profiles_select_public"
  ON public.partner_profiles FOR SELECT
  USING (is_public = TRUE);

-- All INSERT/UPDATE/DELETE goes through the server API (service_role).
-- No direct client mutation paths.
DROP POLICY IF EXISTS "partner_profiles_service_role_all" ON public.partner_profiles;
CREATE POLICY "partner_profiles_service_role_all"
  ON public.partner_profiles FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ── 7. Column-level grants ────────────────────────────────────────────────────
--
-- Revoke all direct access first; then explicitly grant only safe public columns.
-- kyc_documents, verified_notes, internal_notes are intentionally NOT granted.

REVOKE ALL ON public.partner_profiles FROM anon, authenticated;

GRANT SELECT (
  id,
  slug,
  directory_type,
  entity_type,
  name_th,
  name_en,
  tagline_th,
  tagline_en,
  description_th,
  description_en,
  main_image_url,
  main_category_key,
  service_areas,
  contact_phone,
  contact_email,
  line_id,
  line_url,
  maps_url,
  business_hours_text,
  is_verified,
  verified_at,
  is_public,
  is_featured,
  sort_order,
  created_at,
  updated_at
) ON public.partner_profiles TO anon, authenticated;

GRANT ALL ON public.partner_profiles TO service_role;
