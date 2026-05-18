-- 090: Public avatar storage bucket
--
-- Customer profile pictures are uploaded through owner-checked server API
-- (POST /api/user/avatar) and served as public URLs.
-- Files are stored per-user under users/{userId}/avatar.{ext} so re-upload
-- automatically replaces the previous file (upsert=true in the API).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = TRUE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
