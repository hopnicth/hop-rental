-- 028: Asset detail blocks (essay-style content with images + documents)
-- Adds public.assets.detail_blocks (JSONB array of blocks).
-- Each block: { key, title:LocalizedString?, body:LocalizedString?, items:string[]?, images:[], documents:[] }.
-- Also widens catalog-media bucket to accept PDFs for inline document uploads.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS detail_blocks JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.assets.detail_blocks IS
  'Ordered array of essay-style content blocks. Each block has key, optional localized title/body, items, images and documents.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'catalog-media') THEN
    UPDATE storage.buckets
    SET allowed_mime_types = ARRAY[
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf'
        ],
        file_size_limit = GREATEST(file_size_limit, 31457280)
    WHERE id = 'catalog-media';
  END IF;
END $$;
