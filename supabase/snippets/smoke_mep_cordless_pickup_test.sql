-- ============================================================
-- DEV / LOCAL ONLY — Smoke data: MEP Cordless Tool Set pickup test
-- Phase 2E-B1: POS V3 Pickup Foundation
--
-- Purpose: creates a confirmed rental booking with totalPickupDueAmount = 0
-- for the asset  /asset/comprehensive-mep-cordless-tool-set-full-set-03ac3e78
-- so you can test the POS V3 pickup flow end-to-end in local/dev.
--
-- !! DO NOT RUN AGAINST PRODUCTION !!
--
-- Run against local Supabase:
--   docker exec -i supabase_db_hop-rental psql -U postgres -d postgres \
--     -f /dev/stdin < supabase/snippets/smoke_mep_cordless_pickup_test.sql
--
-- All IDs are fixed and prefixed with 03ac3e78 for easy identification.
-- A smoke test staff user is created automatically if it does not exist.
-- Rerun-safe: all inserts use ON CONFLICT DO UPDATE / DO NOTHING.
-- ============================================================

DO $$
DECLARE
  v_user_id     UUID   := '03ac3e78-0001-4000-a000-000000000000';
  v_branch_id   TEXT   := NULL;
  v_asset_id    UUID   := '03ac3e78-0001-4000-a000-000000000001';
  v_booking_id  UUID   := '03ac3e78-0001-4000-a000-000000000002';
  v_today       DATE   := current_date;
BEGIN

  -- 0. Smoke test staff user (auth + public) — required for rental_bookings FK
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'smoke-staff-03ac3e78@local.dev',
    crypt('SmokeTest1234!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Smoke Staff MEP"}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, full_name, platform_role, kyc_status)
  VALUES (v_user_id, 'Smoke Staff MEP', 'staff', 'verified')
  ON CONFLICT (id) DO UPDATE SET
    kyc_status    = 'verified',
    platform_role = 'staff',
    updated_at    = now();

  -- 1. Asset: comprehensive MEP cordless tool set
  INSERT INTO public.assets (
    id, code, slug, status,
    name_th, name_en,
    description_th, description_en,
    category_keys, brand,
    daily_rate, deposit_amount,
    min_rental_days, max_rental_days, buffer_days,
    pricing_model, currency_code
  ) VALUES (
    v_asset_id,
    'MEP-CORDLESS-FULL-SET-01',
    'comprehensive-mep-cordless-tool-set-full-set-03ac3e78',
    'active',
    'ชุดเครื่องมือไฟฟ้าไร้สาย MEP (Full Set)',
    'MEP Comprehensive Cordless Tool Set (Full Set)',
    'ชุดเครื่องมือไร้สายครบชุดสำหรับงาน MEP ได้แก่ สว่าน ไขควง เจียร ตัด แบตเตอรี่ และชาร์จเจอร์',
    'Full MEP cordless tool set including drill, impact driver, grinder, cutter, batteries, and charger.',
    ARRAY['mechanic_tools', 'mep'],
    'Generic MEP',
    450.00, 5000.00,
    1, 30, 1,
    'daily', 'THB'
  )
  ON CONFLICT (id) DO UPDATE SET
    name_th = EXCLUDED.name_th,
    status  = EXCLUDED.status,
    updated_at = now();

  -- 2. Confirmed rental booking — pickup allowed per Phase 2E-B1+ deposit-only policy:
  --    · rental fee is DEFERRED to return / settlement (checkout_paid_amount = 0)
  --    · security deposit fully covered by booking_deposit_paid_amount (no remaining due)
  --    · totalPickupDueAmount = remainingSecurityDue = 0 → pickup is not blocked
  --    Uses existing prod-010 / sku-010-default product pair as FK placeholder.
  --    The asset_id links back to the MEP asset above.
  INSERT INTO public.rental_bookings (
    id, user_id,
    product_id, sku_id, product_name,
    asset_id,
    start_date, end_date, rental_days,
    pricing_model, currency_code,
    daily_rate, rental_total,
    deposit_amount,
    status,
    pos_branch_id,
    -- Rental fee total (deferred — NOT paid at pickup; checkout_paid_amount = 0)
    checkout_total_amount, checkout_paid_amount,
    -- Booking deposit covers full security deposit (zero remaining due at pickup)
    booking_deposit_payment_status,
    booking_deposit_paid_amount,
    deposit_payment_status, deposit_paid_amount
  ) VALUES (
    v_booking_id, v_user_id,
    'prod-010', 'sku-010-default', 'ชุดเครื่องมือไฟฟ้าไร้สาย MEP (Full Set)',
    v_asset_id,
    v_today, v_today + INTERVAL '7 days', 7,
    'daily', 'THB',
    450.00, 3150.00,
    5000.00,
    'confirmed',
    v_branch_id,
    3150.00, 0.00,
    'paid',
    5000.00,
    'paid', 5000.00
  )
  ON CONFLICT (id) DO UPDATE SET
    status     = EXCLUDED.status,
    start_date = EXCLUDED.start_date,
    end_date   = EXCLUDED.end_date,
    updated_at = now();

  -- 3. Handover items (tool names only — Phase 2E-B1 scope)
  INSERT INTO public.rental_booking_handover_items
    (booking_id, item_name, sort_order)
  VALUES
    (v_booking_id, 'Cordless drill',    1),
    (v_booking_id, 'Impact driver',     2),
    (v_booking_id, 'Angle grinder',     3),
    (v_booking_id, 'Cutting tool',      4),
    (v_booking_id, 'Battery pack',      5),
    (v_booking_id, 'Charger',           6),
    (v_booking_id, 'Carrying case',     7),
    (v_booking_id, 'Accessory set',     8)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Smoke data inserted: asset_id=%, booking_id=%', v_asset_id, v_booking_id;
END;
$$;
