-- 088: Add first_name and last_name columns to users table.
-- Splits the existing full_name field into structured first/last name fields.
-- full_name is kept for backward compatibility; the app will prefer first_name + last_name going forward.
-- Existing records: full_name is left as-is; first_name/last_name will be null until user saves from new form.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

COMMENT ON COLUMN public.users.first_name IS 'Given name — structured split from full_name. Populated when user saves profile via new form.';
COMMENT ON COLUMN public.users.last_name  IS 'Family name — structured split from full_name. Populated when user saves profile via new form.';
