-- 036: Generic content pages for blog, services, and promotions.

CREATE TABLE public.content_pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type    TEXT NOT NULL CHECK (content_type IN ('blog', 'service', 'promotion')),
  slug            TEXT NOT NULL,
  title_th        TEXT NOT NULL,
  title_en        TEXT NOT NULL,
  title_cn        TEXT,
  title_jp        TEXT,
  excerpt_th      TEXT NOT NULL,
  excerpt_en      TEXT NOT NULL,
  excerpt_cn      TEXT,
  excerpt_jp      TEXT,
  cover_image_url TEXT,
  blocks          JSONB NOT NULL DEFAULT '[]'::JSONB,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (content_type, slug),
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CHECK (char_length(title_th) > 0),
  CHECK (char_length(title_en) > 0),
  CHECK (char_length(excerpt_th) > 0),
  CHECK (char_length(excerpt_en) > 0),
  CHECK (jsonb_typeof(blocks) = 'array')
);

COMMENT ON TABLE public.content_pages IS
  'Super-admin managed public content pages for blog, services, and promotions.';

CREATE INDEX idx_content_pages_public_sort
  ON public.content_pages(content_type, is_active, sort_order, published_at DESC, created_at DESC);

CREATE TRIGGER set_content_pages_updated_at
  BEFORE UPDATE ON public.content_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_pages_select_public"
  ON public.content_pages FOR SELECT
  USING (is_active = TRUE);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-media',
  'catalog-media',
  TRUE,
  31457280,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = TRUE,
    file_size_limit = GREATEST(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
    allowed_mime_types = CASE
      WHEN storage.buckets.allowed_mime_types IS NULL THEN EXCLUDED.allowed_mime_types
      ELSE ARRAY(
        SELECT DISTINCT mime_type
        FROM unnest(storage.buckets.allowed_mime_types || EXCLUDED.allowed_mime_types) AS mime_type
        WHERE mime_type IS NOT NULL AND mime_type <> ''
      )
    END;