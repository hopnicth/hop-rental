-- 020: Add business fields to store_branches + inventory audit log

-- ── 0. Ensure store_branches table exists (idempotent) ──
-- Migration 019 should have created this, but we guard against partial apply.

CREATE TABLE IF NOT EXISTS public.store_branches (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name_th     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(trim(id)) > 0),
  CHECK (char_length(trim(code)) > 0),
  CHECK (char_length(trim(name_th)) > 0),
  CHECK (char_length(trim(name_en)) > 0)
);

DROP TRIGGER IF EXISTS set_store_branches_updated_at ON public.store_branches;
CREATE TRIGGER set_store_branches_updated_at
  BEFORE UPDATE ON public.store_branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 1. Extend store_branches with address / phone / email ──

ALTER TABLE public.store_branches
  ADD COLUMN IF NOT EXISTS address_th  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_en  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latitude    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS notes       TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.store_branches.address_th IS 'Full Thai-language address for storefront pickup display.';
COMMENT ON COLUMN public.store_branches.address_en IS 'Full English-language address for storefront pickup display.';
COMMENT ON COLUMN public.store_branches.phone IS 'Branch contact phone number.';
COMMENT ON COLUMN public.store_branches.email IS 'Branch contact email.';
COMMENT ON COLUMN public.store_branches.latitude IS 'GPS latitude for map display.';
COMMENT ON COLUMN public.store_branches.longitude IS 'GPS longitude for map display.';

-- ── 2. Seed สำนักงานใหญ่ (HQ branch) ──

INSERT INTO public.store_branches (
  id, code, name_th, name_en, address_th, address_en, phone, email,
  is_active, sort_order
)
VALUES (
  'branch-hq',
  'HQ',
  'สำนักงานใหญ่',
  'Head Office',
  '888/8 ม.1 ต.พนมสารคาม อ.พนมสารคาม จ.ฉะเชิงเทรา 24120',
  '888/8 Moo 1, Phanom Sarakham, Phanom Sarakham, Chachoengsao 24120',
  '0954792333',
  'info@hopnic.co.th',
  TRUE,
  1
)
ON CONFLICT (id) DO UPDATE
SET code       = EXCLUDED.code,
    name_th    = EXCLUDED.name_th,
    name_en    = EXCLUDED.name_en,
    address_th = EXCLUDED.address_th,
    address_en = EXCLUDED.address_en,
    phone      = EXCLUDED.phone,
    email      = EXCLUDED.email,
    is_active  = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- ── 3. Inventory change audit log ──

CREATE TABLE IF NOT EXISTS public.inventory_change_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL,
  sku_id       TEXT NOT NULL,
  branch_id    TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changed_by   UUID NOT NULL REFERENCES auth.users(id),
  old_values   JSONB,
  new_values   JSONB,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inventory_change_log IS 'Audit trail for every inventory change. Records who made the change and before/after values.';

CREATE INDEX idx_inventory_change_log_inventory
  ON public.inventory_change_log (inventory_id);

CREATE INDEX idx_inventory_change_log_changed_by
  ON public.inventory_change_log (changed_by);

CREATE INDEX idx_inventory_change_log_created_at
  ON public.inventory_change_log (created_at DESC);

ALTER TABLE public.inventory_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_change_log_service_role_all"
  ON public.inventory_change_log
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);
