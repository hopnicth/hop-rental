-- ============================================================
-- 098_partner_business_hours_foundation.sql
--
-- Partner Directory MVP — Business Hours structured foundation.
--
-- Adds to public.partner_profiles:
--   business_hours_preset_key  TEXT NULL
--   business_hours_timezone    TEXT NOT NULL DEFAULT 'Asia/Bangkok'
--
-- business_hours_text is preserved unchanged as the public display field.
-- No schedule rows table is created (deferred to a future phase).
--
-- IMPLEMENTATION NOTE — future openNow filter (Phase 1C-2B.6+):
--   Open Now eligibility checks MUST be applied BEFORE final pagination.
--   "Paginate first, then filter in memory" returns incomplete result pages.
--   Use the partial index below or a pre-filter sub-query to select
--   candidates first, then paginate the already-filtered set.
-- ============================================================

-- ── 1. Add columns ────────────────────────────────────────────────────────────

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS business_hours_preset_key TEXT,
  ADD COLUMN IF NOT EXISTS business_hours_timezone    TEXT NOT NULL DEFAULT 'Asia/Bangkok';

-- ── 2. Constraints ────────────────────────────────────────────────────────────
--
-- business_hours_preset_key:
--   NULL = unspecified / custom free text / legacy text-only row.
--   NULL rows are excluded from future Open Now filtering.
--   by_appointment is structurally known but also excluded from Open Now.
--
-- DROP … IF EXISTS before ADD makes each ADD idempotent on re-run.

ALTER TABLE public.partner_profiles
  DROP CONSTRAINT IF EXISTS partner_profiles_bh_preset_key_chk;

ALTER TABLE public.partner_profiles
  ADD CONSTRAINT partner_profiles_bh_preset_key_chk
  CHECK (
    business_hours_preset_key IS NULL OR
    business_hours_preset_key IN (
      'open_24h',
      'by_appointment',
      'everyday_0900_1800',
      'mon_fri_0900_1800',
      'mon_sat_0900_1800',
      'sat_sun_0900_1800'
    )
  );

-- business_hours_timezone: Asia/Bangkok only for MVP.
-- Expand the allowed values in a future migration if needed.

ALTER TABLE public.partner_profiles
  DROP CONSTRAINT IF EXISTS partner_profiles_bh_timezone_chk;

ALTER TABLE public.partner_profiles
  ADD CONSTRAINT partner_profiles_bh_timezone_chk
  CHECK (business_hours_timezone = 'Asia/Bangkok');

-- ── 3. Index ──────────────────────────────────────────────────────────────────
-- Partial index: public rows with a known preset key only.
-- Supports future Open Now candidate pre-filtering without a full table scan.
-- by_appointment rows are indexed here; exclusion happens in the application layer.

CREATE INDEX IF NOT EXISTS idx_partner_profiles_bh_preset_key
  ON public.partner_profiles (business_hours_preset_key, is_public)
  WHERE business_hours_preset_key IS NOT NULL;

-- ── 4. Column-level grants ────────────────────────────────────────────────────
-- Extend read access for anon/authenticated to the two new non-sensitive columns.
-- Does NOT change any existing column grants or RLS policy logic.

GRANT SELECT (business_hours_preset_key, business_hours_timezone)
  ON public.partner_profiles TO anon, authenticated;

-- ── 5. Column comments ────────────────────────────────────────────────────────

COMMENT ON COLUMN public.partner_profiles.business_hours_preset_key IS
  'Machine-readable business hours preset key. NULL = custom free text, unspecified, or legacy text-only row — excluded from Open Now filtering. open_24h = always open. by_appointment = structurally known but excluded from Open Now. Allowed non-NULL values enforced by constraint.';

COMMENT ON COLUMN public.partner_profiles.business_hours_timezone IS
  'IANA timezone used to interpret business hours. Default and MVP-only allowed value: Asia/Bangkok. Expand the constraint in a future migration if multi-timezone support is required.';

-- Reinforce display-only intent on the existing column.
COMMENT ON COLUMN public.partner_profiles.business_hours_text IS
  'Optional free-text public display field for business/operating hours. Display only — NEVER used as source of truth for Open Now logic. Use business_hours_preset_key for machine-readable Open Now eligibility.';

-- ── 6. Backfill ───────────────────────────────────────────────────────────────
-- Existing rows whose business_hours_text exactly matches a known preset display
-- string receive the corresponding preset key retroactively.
--
-- Only rows where:
--   business_hours_text IS NOT NULL  AND  business_hours_preset_key IS NULL
--
-- Thai strings verified from exact UTF-8 source:
--   app/components/admin/partners/AdminPartnerCreateContainer.vue  (lines 123–128)
--
-- Custom text rows and NULL text rows retain business_hours_preset_key = NULL.

UPDATE public.partner_profiles
SET business_hours_preset_key =
  CASE business_hours_text
    WHEN 'ทุกวัน 09:00-18:00'        THEN 'everyday_0900_1800'
    WHEN 'จันทร์-ศุกร์ 09:00-18:00'  THEN 'mon_fri_0900_1800'
    WHEN 'จันทร์-เสาร์ 09:00-18:00'  THEN 'mon_sat_0900_1800'
    WHEN 'เสาร์-อาทิตย์ 09:00-18:00' THEN 'sat_sun_0900_1800'
    WHEN 'เปิด 24 ชั่วโมง'            THEN 'open_24h'
    WHEN 'ตามนัดหมาย'                THEN 'by_appointment'
    ELSE NULL
  END
WHERE business_hours_text IS NOT NULL
  AND business_hours_preset_key IS NULL;
