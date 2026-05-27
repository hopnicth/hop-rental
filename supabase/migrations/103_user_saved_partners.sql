-- 103: Per-user saved/bookmarked partner profiles.
--
-- Allows authenticated users to save (bookmark) partner profiles they are
-- interested in. The feature mirrors the user_wishlist (products) and
-- user_save_list (assets/services) patterns already in the schema.
--
-- Server endpoints must manually enforce that user_id = authenticated user id
-- because service_role bypasses RLS.

CREATE TABLE IF NOT EXISTS public.user_saved_partners (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partner_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, partner_id)
);

COMMENT ON TABLE public.user_saved_partners IS
  'Partner profiles each authenticated user saved/bookmarked.';

COMMENT ON COLUMN public.user_saved_partners.user_id IS
  'References public.users(id) — same UUID as auth.uid().';

COMMENT ON COLUMN public.user_saved_partners.partner_id IS
  'References public.partner_profiles(id) — must be a public partner.';

COMMENT ON COLUMN public.user_saved_partners.created_at IS
  'Timestamp when the user saved this partner.';

-- Index for analytics: which partners are saved most, ordered by recency
CREATE INDEX IF NOT EXISTS idx_user_saved_partners_partner_id
  ON public.user_saved_partners (partner_id, created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.user_saved_partners ENABLE ROW LEVEL SECURITY;

-- SELECT: users can only read their own saved partners
DROP POLICY IF EXISTS "Users can read own saved partners"
  ON public.user_saved_partners;
CREATE POLICY "Users can read own saved partners"
  ON public.user_saved_partners
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: users can only save public partners into their own list
DROP POLICY IF EXISTS "Users can insert own saved partners"
  ON public.user_saved_partners;
CREATE POLICY "Users can insert own saved partners"
  ON public.user_saved_partners
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.partner_profiles p
      WHERE p.id = partner_id
        AND p.is_public = TRUE
    )
  );

-- DELETE: users can only unsave their own rows
DROP POLICY IF EXISTS "Users can delete own saved partners"
  ON public.user_saved_partners;
CREATE POLICY "Users can delete own saved partners"
  ON public.user_saved_partners
  FOR DELETE
  USING (auth.uid() = user_id);

-- ── Grants ────────────────────────────────────────────────────────────────────
-- authenticated role may SELECT, INSERT, DELETE — subject to RLS policies above.
-- anon role is intentionally not granted any access.
-- service_role bypasses RLS and has implicit full access (no explicit grant needed).

GRANT SELECT, INSERT, DELETE ON public.user_saved_partners TO authenticated;
