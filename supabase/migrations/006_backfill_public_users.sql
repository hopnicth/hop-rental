-- ============================================================
-- 006_backfill_public_users.sql
--
-- Backfill legacy auth users into public.users.
--
-- Why:
-- - Migration 001 added a trigger that auto-creates public.users rows
--   for future signups.
-- - But accounts that already existed before that trigger was added can
--   still be missing a matching public.users row.
-- - Tables like carts / rental_bookings reference public.users(id), so
--   those legacy accounts can fail inserts until the profile row exists.
-- ============================================================

INSERT INTO public.users (
  id,
  full_name,
  avatar_url,
  created_at,
  updated_at
)
SELECT
  au.id,
  COALESCE(
    au.raw_user_meta_data ->> 'full_name',
    au.raw_user_meta_data ->> 'name'
  ) AS full_name,
  au.raw_user_meta_data ->> 'avatar_url' AS avatar_url,
  COALESCE(au.created_at, now()) AS created_at,
  now() AS updated_at
FROM auth.users au
LEFT JOIN public.users pu
  ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;