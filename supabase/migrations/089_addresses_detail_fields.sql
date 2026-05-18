-- 089: Add structured address detail columns to addresses table.
-- Splits free-text full_address into Thai address components for proper display and document generation.
-- full_address is kept for backward compatibility and will reflect the combined street line.
-- Existing records: new columns will be null until user edits/saves address from new form.

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS house_no  TEXT,
  ADD COLUMN IF NOT EXISTS moo       TEXT,
  ADD COLUMN IF NOT EXISTS room_no   TEXT,
  ADD COLUMN IF NOT EXISTS building  TEXT,
  ADD COLUMN IF NOT EXISTS street    TEXT;

COMMENT ON COLUMN public.addresses.house_no  IS 'เลขที่ — house/unit number.';
COMMENT ON COLUMN public.addresses.moo       IS 'หมู่ — village/moo number.';
COMMENT ON COLUMN public.addresses.room_no   IS 'ห้อง — room number.';
COMMENT ON COLUMN public.addresses.building  IS 'อาคาร — building name.';
COMMENT ON COLUMN public.addresses.street    IS 'ถนน — street/road name.';
