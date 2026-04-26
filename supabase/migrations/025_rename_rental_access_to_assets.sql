-- 025: Rename rental_access domain to asset
-- Keeps existing data by renaming objects in-place. Safe to run after older migrations;
-- no-op for fresh databases where previous migrations already use asset naming.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'rental_access_status')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'asset_status') THEN
    ALTER TYPE public.rental_access_status RENAME TO asset_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'rental_access_document_visibility')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'asset_document_visibility') THEN
    ALTER TYPE public.rental_access_document_visibility RENAME TO asset_document_visibility;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'rental_access_document_kind')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'asset_document_kind') THEN
    ALTER TYPE public.rental_access_document_kind RENAME TO asset_document_kind;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.rental_accesses') IS NOT NULL AND to_regclass('public.assets') IS NULL THEN ALTER TABLE public.rental_accesses RENAME TO assets; END IF;
  IF to_regclass('public.rental_access_matches') IS NOT NULL AND to_regclass('public.asset_matches') IS NULL THEN ALTER TABLE public.rental_access_matches RENAME TO asset_matches; END IF;
  IF to_regclass('public.rental_access_service_events') IS NOT NULL AND to_regclass('public.asset_service_events') IS NULL THEN ALTER TABLE public.rental_access_service_events RENAME TO asset_service_events; END IF;
  IF to_regclass('public.rental_access_documents') IS NOT NULL AND to_regclass('public.asset_documents') IS NULL THEN ALTER TABLE public.rental_access_documents RENAME TO asset_documents; END IF;
  IF to_regclass('public.rental_access_checklist_templates') IS NOT NULL AND to_regclass('public.asset_checklist_templates') IS NULL THEN ALTER TABLE public.rental_access_checklist_templates RENAME TO asset_checklist_templates; END IF;
  IF to_regclass('public.rental_access_checklist_template_items') IS NOT NULL AND to_regclass('public.asset_checklist_template_items') IS NULL THEN ALTER TABLE public.rental_access_checklist_template_items RENAME TO asset_checklist_template_items; END IF;
  IF to_regclass('public.rental_access_branch_inventory') IS NOT NULL AND to_regclass('public.asset_branch_inventory') IS NULL THEN ALTER TABLE public.rental_access_branch_inventory RENAME TO asset_branch_inventory; END IF;
  IF to_regclass('public.home_featured_rental_accesses') IS NOT NULL AND to_regclass('public.home_featured_assets') IS NULL THEN ALTER TABLE public.home_featured_rental_accesses RENAME TO home_featured_assets; END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.asset_matches') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_matches' AND column_name='rental_access_id') THEN ALTER TABLE public.asset_matches RENAME COLUMN rental_access_id TO asset_id; END IF;
  IF to_regclass('public.asset_service_events') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_service_events' AND column_name='rental_access_id') THEN ALTER TABLE public.asset_service_events RENAME COLUMN rental_access_id TO asset_id; END IF;
  IF to_regclass('public.asset_documents') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_documents' AND column_name='rental_access_id') THEN ALTER TABLE public.asset_documents RENAME COLUMN rental_access_id TO asset_id; END IF;
  IF to_regclass('public.asset_checklist_templates') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_checklist_templates' AND column_name='rental_access_id') THEN ALTER TABLE public.asset_checklist_templates RENAME COLUMN rental_access_id TO asset_id; END IF;
  IF to_regclass('public.asset_branch_inventory') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_branch_inventory' AND column_name='rental_access_id') THEN ALTER TABLE public.asset_branch_inventory RENAME COLUMN rental_access_id TO asset_id; END IF;
  IF to_regclass('public.home_featured_assets') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='home_featured_assets' AND column_name='rental_access_id') THEN ALTER TABLE public.home_featured_assets RENAME COLUMN rental_access_id TO asset_id; END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_bookings' AND column_name='rental_access_id') THEN ALTER TABLE public.rental_bookings RENAME COLUMN rental_access_id TO asset_id; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_bookings' AND column_name='rental_access_code') THEN ALTER TABLE public.rental_bookings RENAME COLUMN rental_access_code TO asset_code; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_bookings' AND column_name='rental_access_slug') THEN ALTER TABLE public.rental_bookings RENAME COLUMN rental_access_slug TO asset_slug; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_bookings' AND column_name='rental_access_name') THEN ALTER TABLE public.rental_bookings RENAME COLUMN rental_access_name TO asset_name; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_bookings' AND column_name='rental_access_thumbnail') THEN ALTER TABLE public.rental_bookings RENAME COLUMN rental_access_thumbnail TO asset_thumbnail; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_bookings' AND column_name='rental_access_snapshot') THEN ALTER TABLE public.rental_bookings RENAME COLUMN rental_access_snapshot TO asset_snapshot; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_booking_checklists' AND column_name='rental_access_id') THEN ALTER TABLE public.rental_booking_checklists RENAME COLUMN rental_access_id TO asset_id; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_booking_documents' AND column_name='rental_access_id') THEN ALTER TABLE public.rental_booking_documents RENAME COLUMN rental_access_id TO asset_id; END IF;
END $$;

ALTER INDEX IF EXISTS idx_rental_accesses_status_hidden_sort RENAME TO idx_assets_status_hidden_sort;
ALTER INDEX IF EXISTS idx_rental_accesses_last_rented_at RENAME TO idx_assets_last_rented_at;
ALTER INDEX IF EXISTS idx_rental_access_matches_product_sort RENAME TO idx_asset_matches_product_sort;
ALTER INDEX IF EXISTS idx_rental_access_matches_access_sort RENAME TO idx_asset_matches_asset_sort;
ALTER INDEX IF EXISTS idx_rental_access_service_events_access_date RENAME TO idx_asset_service_events_asset_date;
ALTER INDEX IF EXISTS idx_rental_access_documents_access_visibility_sort RENAME TO idx_asset_documents_asset_visibility_sort;
ALTER INDEX IF EXISTS idx_rental_access_documents_service_event RENAME TO idx_asset_documents_service_event;
ALTER INDEX IF EXISTS idx_rental_access_checklist_templates_access_kind RENAME TO idx_asset_checklist_templates_asset_kind;
ALTER INDEX IF EXISTS idx_rental_access_checklist_template_items_template_sort RENAME TO idx_asset_checklist_template_items_template_sort;
ALTER INDEX IF EXISTS idx_rental_bookings_access_status_period RENAME TO idx_rental_bookings_asset_status_period;
ALTER INDEX IF EXISTS idx_rental_access_branch_inventory_rental RENAME TO idx_asset_branch_inventory_asset;
ALTER INDEX IF EXISTS idx_rental_access_branch_inventory_inventory RENAME TO idx_asset_branch_inventory_inventory;
ALTER INDEX IF EXISTS idx_rental_access_branch_inventory_branch RENAME TO idx_asset_branch_inventory_branch;
ALTER INDEX IF EXISTS idx_home_featured_rental_accesses_active_sort RENAME TO idx_home_featured_assets_active_sort;
ALTER INDEX IF EXISTS idx_rental_accesses_storage_branch RENAME TO idx_assets_storage_branch;
ALTER INDEX IF EXISTS idx_rental_accesses_storage_inventory RENAME TO idx_assets_storage_inventory;

DO $$
BEGIN
  IF to_regclass('public.assets') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='set_rental_accesses_updated_at' AND tgrelid='public.assets'::regclass) THEN ALTER TRIGGER set_rental_accesses_updated_at ON public.assets RENAME TO set_assets_updated_at; END IF;
  IF to_regclass('public.asset_matches') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='set_rental_access_matches_updated_at' AND tgrelid='public.asset_matches'::regclass) THEN ALTER TRIGGER set_rental_access_matches_updated_at ON public.asset_matches RENAME TO set_asset_matches_updated_at; END IF;
  IF to_regclass('public.asset_branch_inventory') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='set_rental_access_branch_inventory_updated_at' AND tgrelid='public.asset_branch_inventory'::regclass) THEN ALTER TRIGGER set_rental_access_branch_inventory_updated_at ON public.asset_branch_inventory RENAME TO set_asset_branch_inventory_updated_at; END IF;
  IF to_regclass('public.asset_branch_inventory') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='rental_access_branch_inventory_before_sync_branch_trg' AND tgrelid='public.asset_branch_inventory'::regclass) THEN ALTER TRIGGER rental_access_branch_inventory_before_sync_branch_trg ON public.asset_branch_inventory RENAME TO asset_branch_inventory_before_sync_branch_trg; END IF;
  IF to_regclass('public.assets') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='rental_accesses_check_storage_inventory_trg' AND tgrelid='public.assets'::regclass) THEN ALTER TRIGGER rental_accesses_check_storage_inventory_trg ON public.assets RENAME TO assets_check_storage_inventory_trg; END IF;
  IF to_regclass('public.home_featured_assets') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='set_home_featured_rental_accesses_updated_at' AND tgrelid='public.home_featured_assets'::regclass) THEN ALTER TRIGGER set_home_featured_rental_accesses_updated_at ON public.home_featured_assets RENAME TO set_home_featured_assets_updated_at; END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'rental_accesses_check_storage_inventory')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'assets_check_storage_inventory') THEN
    ALTER FUNCTION public.rental_accesses_check_storage_inventory() RENAME TO assets_check_storage_inventory;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'rental_access_branch_inventory_sync_branch')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'asset_branch_inventory_sync_branch') THEN
    ALTER FUNCTION public.rental_access_branch_inventory_sync_branch() RENAME TO asset_branch_inventory_sync_branch;
  END IF;
END $$;

COMMENT ON TABLE public.assets IS 'Public/commercial asset catalog root separated from sale products.';
COMMENT ON TABLE public.asset_matches IS 'Admin-managed product-level matching from assets to products.';
COMMENT ON TABLE public.asset_branch_inventory IS 'Per-inventory rental stock owned by an asset. Not connected to SKUs.';
COMMENT ON TABLE public.home_featured_assets IS 'Super-admin curated asset list for homepage rails.';
