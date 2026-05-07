-- Per-user saved rental assets and service pages.

CREATE TABLE IF NOT EXISTS public.user_save_list (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('asset', 'service')),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.content_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    (item_type = 'asset' AND asset_id IS NOT NULL AND service_id IS NULL)
    OR
    (item_type = 'service' AND service_id IS NOT NULL AND asset_id IS NULL)
  )
);

COMMENT ON TABLE public.user_save_list IS
  'Rental assets and service content pages each authenticated user saved for later.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_save_list_asset_unique
  ON public.user_save_list (user_id, asset_id)
  WHERE item_type = 'asset';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_save_list_service_unique
  ON public.user_save_list (user_id, service_id)
  WHERE item_type = 'service';

CREATE INDEX IF NOT EXISTS idx_user_save_list_asset_lookup
  ON public.user_save_list (asset_id, created_at DESC)
  WHERE item_type = 'asset';

CREATE INDEX IF NOT EXISTS idx_user_save_list_service_lookup
  ON public.user_save_list (service_id, created_at DESC)
  WHERE item_type = 'service';

ALTER TABLE public.user_save_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own save list" ON public.user_save_list;
CREATE POLICY "Users can read own save list"
  ON public.user_save_list
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own save list" ON public.user_save_list;
CREATE POLICY "Users can insert own save list"
  ON public.user_save_list
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      (
        item_type = 'asset'
        AND EXISTS (
          SELECT 1
          FROM public.assets a
          WHERE a.id = asset_id
            AND a.status = 'active'
            AND a.is_hidden = FALSE
        )
      )
      OR
      (
        item_type = 'service'
        AND EXISTS (
          SELECT 1
          FROM public.content_pages cp
          WHERE cp.id = service_id
            AND cp.content_type = 'service'
            AND cp.is_active = TRUE
        )
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own save list" ON public.user_save_list;
CREATE POLICY "Users can delete own save list"
  ON public.user_save_list
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.user_save_list TO authenticated;