-- 035: Allow SVG uploads for Home partner logos in the shared catalog-media bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-media',
  'catalog-media',
  TRUE,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = GREATEST(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
    allowed_mime_types = CASE
      WHEN storage.buckets.allowed_mime_types IS NULL THEN EXCLUDED.allowed_mime_types
      ELSE ARRAY(
        SELECT DISTINCT mime_type
        FROM unnest(
          storage.buckets.allowed_mime_types || ARRAY['image/svg+xml']::text[]
        ) AS mime_type
        WHERE mime_type IS NOT NULL AND mime_type <> ''
      )
    END;