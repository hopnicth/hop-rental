-- Migration 040
-- 1. Extend content_pages.content_type to include 'review'
-- 2. Add junction tables linking content_pages to products and assets

ALTER TABLE public.content_pages
  DROP CONSTRAINT IF EXISTS content_pages_content_type_check;

ALTER TABLE public.content_pages
  ADD CONSTRAINT content_pages_content_type_check
  CHECK (content_type IN ('blog', 'service', 'promotion', 'review'));


CREATE TABLE IF NOT EXISTS public.content_page_products (
  content_page_id UUID NOT NULL REFERENCES public.content_pages(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES public.products(id)     ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (content_page_id, product_id)
);

COMMENT ON TABLE public.content_page_products IS
  'Many-to-many link from a content_pages row (typically content_type=review) to one or more products.';

CREATE INDEX IF NOT EXISTS content_page_products_product_idx
  ON public.content_page_products (product_id, sort_order);

ALTER TABLE public.content_page_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_page_products_select_public"
  ON public.content_page_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.content_pages cp
      WHERE cp.id = content_page_products.content_page_id
        AND cp.is_active = TRUE
    )
  );


CREATE TABLE IF NOT EXISTS public.content_page_assets (
  content_page_id UUID NOT NULL REFERENCES public.content_pages(id) ON DELETE CASCADE,
  asset_id        UUID NOT NULL REFERENCES public.assets(id)        ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (content_page_id, asset_id)
);

COMMENT ON TABLE public.content_page_assets IS
  'Many-to-many link from a content_pages row (typically content_type=review) to one or more assets.';

CREATE INDEX IF NOT EXISTS content_page_assets_asset_idx
  ON public.content_page_assets (asset_id, sort_order);

ALTER TABLE public.content_page_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_page_assets_select_public"
  ON public.content_page_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.content_pages cp
      WHERE cp.id = content_page_assets.content_page_id
        AND cp.is_active = TRUE
    )
  );
