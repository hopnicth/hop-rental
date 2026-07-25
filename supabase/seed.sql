-- =============================================================================
-- HOPNIC — LOCAL DEVELOPMENT SEED  (supabase/seed.sql)
-- =============================================================================
-- !! LOCAL ONLY. THIS FILE MUST NEVER REACH A LINKED REMOTE. !!
--
-- HOW THAT IS PREVENTED — two independent mechanisms:
--
--   1. TOOLING. Seed files are read ONLY by `supabase db reset`, which rebuilds
--      the local Docker Postgres (config.toml: [db.seed] enabled = true,
--      sql_paths = ["./seed.sql"]). The command this project uses to apply
--      schema to the remote is `supabase db push --linked` (OD-1), and db push
--      reads supabase/migrations/ ONLY — it never reads seed files. There is no
--      code path by which a normal remote apply executes this file.
--
--   2. RUNTIME GUARD (below). Mechanism 1 is a convention and can be defeated by
--      piping this file into psql against the wrong URL. The guard makes that
--      fail closed: the seed REFUSES to run against any database that already
--      holds auth users or rental bookings. A freshly reset local DB has zero of
--      both; the production project has many. Guard before the side effect,
--      fail closed (OPERATING-MODEL §3).
--
-- MONEY UNITS — flagged for the auditor: the task brief said "satang amounts".
-- The repo convention in these tables is NOT satang. `f_settle_rental_booking_return`
-- computes with round(x, 2) throughout, and server/utils/rental-return-settlement.ts:215
-- rounds to 2 decimals. The columns are numeric and carry BAHT with 2 decimal
-- places. Seeding satang integers would inflate every amount 100x and make the
-- settle walk meaningless. This seed therefore uses BAHT/2dp. Raising rather
-- than silently picking a side, per the standing baht-vs-satang BACKLOG item.
--
-- IDENTITIES ARE FAKE BY CONSTRUCTION: emails use the reserved .invalid TLD
-- (RFC 2606 — guaranteed non-routable), names are "SEED ...", phones are
-- SEED-prefixed non-numbers, and the KYC identity_hash is a labelled constant,
-- NOT a hash of any real identity document.
--
-- FIXTURE PASSWORD: 'seedlocal-not-a-secret'. Committed deliberately — it
-- unlocks nothing but a throwaway local container. AUDITOR: flagging explicitly
-- because it is a credential in a tracked file; say the word and I move it to an
-- env var read at reset time instead.
--
-- UUIDs are deterministic and readable (5eed... = "seed"). All carry RFC-4122
-- version nibble 4 and variant nibble 8, so they pass both the server-side
-- asUuidOrNull and the stricter client-side SectionKyc.isUuid (BACKLOG notes
-- that check rejects non-RFC uuids — earlier fixtures using 3333... hit it).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. FAIL-CLOSED GUARD
-- -----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_auth_users     bigint;
  v_bookings       bigint;
BEGIN
  SELECT count(*) INTO v_auth_users FROM auth.users;
  SELECT count(*) INTO v_bookings   FROM public.rental_bookings;

  IF v_auth_users > 0 OR v_bookings > 0 THEN
    RAISE EXCEPTION
      'HOPNIC_SEED_REFUSED: database is not an empty local instance (auth.users=%, rental_bookings=%). This seed is LOCAL-ONLY and will not run against a populated database.',
      v_auth_users, v_bookings
      USING HINT = 'If you meant to reseed locally, run: supabase db reset';
  END IF;
END
$guard$;


-- -----------------------------------------------------------------------------
-- 1. BRANCH + INVENTORY
-- -----------------------------------------------------------------------------
INSERT INTO public.store_branches
  (id, code, name_th, name_en, is_active, is_public, sort_order, address_th, address_en, phone)
VALUES
  ('seed-branch-01', 'SEED01', 'สาขาทดสอบ (SEED)', 'SEED Test Branch',
   true, true, 1, 'ที่อยู่ทดสอบ', 'Seed address', 'SEED-0000000000');

-- NO explicit inventories INSERT. The store_branches AFTER INSERT trigger
-- (store_branches_after_insert_seed_inventories_trg) already creates two rows for
-- the new branch: 'Default' (is_default=TRUE) and 'Rental' (is_default_rental=TRUE).
-- Adding our own default/default-rental inventory violates the partial unique
-- indexes idx_inventories_one_default_per_branch and
-- idx_inventories_one_default_rental_per_branch. The seed uses the
-- trigger-created 'Rental' inventory instead (looked up in §4).


-- -----------------------------------------------------------------------------
-- 2. AUTH USERS + PLATFORM ROLES
--    public.users rows are created automatically by the on_auth_user_created
--    trigger (it copies id/full_name/avatar_url and defaults platform_role to
--    'customer'), so roles are applied by UPDATE afterwards — never by a second
--    INSERT, which would collide with the trigger.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  -- GoTrue scans these into non-nullable Go strings and none of them carries a
  -- column default, so a raw INSERT that omits them leaves NULL and every login
  -- fails with "Database error querying schema" (progress.md:40, 2026-07-19).
  confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-8000-000000000001'::uuid,
   'authenticated', 'authenticated', 'seed-customer@seed.invalid',
   crypt('seedlocal-not-a-secret', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"SEED Customer One"}'::jsonb,
   '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-8000-000000000002'::uuid,
   'authenticated', 'authenticated', 'seed-staff@seed.invalid',
   crypt('seedlocal-not-a-secret', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"SEED Staff One"}'::jsonb,
   '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-8000-000000000003'::uuid,
   'authenticated', 'authenticated', 'seed-superadmin@seed.invalid',
   crypt('seedlocal-not-a-secret', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"SEED Super Admin"}'::jsonb,
   '', '', '', '');

-- Email identities — GoTrue password grant requires an identities row per user.
INSERT INTO auth.identities
  (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('5eed0000-0000-4000-8000-000000000001',
   '5eed0000-0000-4000-8000-000000000001'::uuid,
   '{"sub":"5eed0000-0000-4000-8000-000000000001","email":"seed-customer@seed.invalid","email_verified":true,"phone_verified":false}'::jsonb,
   'email', now(), now(), now()),
  ('5eed0000-0000-4000-8000-000000000002',
   '5eed0000-0000-4000-8000-000000000002'::uuid,
   '{"sub":"5eed0000-0000-4000-8000-000000000002","email":"seed-staff@seed.invalid","email_verified":true,"phone_verified":false}'::jsonb,
   'email', now(), now(), now()),
  ('5eed0000-0000-4000-8000-000000000003',
   '5eed0000-0000-4000-8000-000000000003'::uuid,
   '{"sub":"5eed0000-0000-4000-8000-000000000003","email":"seed-superadmin@seed.invalid","email_verified":true,"phone_verified":false}'::jsonb,
   'email', now(), now(), now());

UPDATE public.users SET
  platform_role = 'customer', first_name = 'SEED', last_name = 'Customer',
  full_name = 'SEED Customer One', phone = 'SEED-0000000001', kyc_status = 'verified'
WHERE id = '5eed0000-0000-4000-8000-000000000001'::uuid;

UPDATE public.users SET
  platform_role = 'staff', first_name = 'SEED', last_name = 'Staff',
  full_name = 'SEED Staff One', phone = 'SEED-0000000002'
WHERE id = '5eed0000-0000-4000-8000-000000000002'::uuid;

UPDATE public.users SET
  platform_role = 'super_admin', first_name = 'SEED', last_name = 'SuperAdmin',
  full_name = 'SEED Super Admin', phone = 'SEED-0000000003'
WHERE id = '5eed0000-0000-4000-8000-000000000003'::uuid;


-- -----------------------------------------------------------------------------
-- 3. KYC PROFILE (customer) — the pickup gate. Without a verified profile the
--    pickup path returns 422 no_profile (BACKLOG T2 deadlock), so the picked_up
--    fixture below could not legitimately exist.
--    identity_hash is a LABELLED CONSTANT, not a hash of any real document.
-- -----------------------------------------------------------------------------
INSERT INTO public.kyc_profiles (
  id, user_id, customer_type, identity_type,
  identity_hash, identity_last4, holder_name,
  status, verified_at, valid_until,
  verified_by_user_id, verified_branch_id, verification_method, branch_id
)
VALUES (
  '5eed0000-0000-4000-8000-0000000000c1'::uuid,
  '5eed0000-0000-4000-8000-000000000001'::uuid,
  'individual', 'national_id',
  'SEED-FAKE-IDENTITY-HASH-NOT-A-REAL-DOCUMENT-0001', '0001', 'SEED Customer One',
  'verified', now(), now() + interval '365 days',
  '5eed0000-0000-4000-8000-000000000003'::uuid, 'seed-branch-01', 'staff_counter', 'seed-branch-01'
);


-- -----------------------------------------------------------------------------
-- 4. ASSETS (+ branch inventory)
--    Three assets so the four bookings below can never trip the
--    rental_bookings_prevent_blocking_overlap trigger, which blocks overlapping
--    date ranges on the SAME asset when status is 'confirmed' or 'picked_up'.
-- -----------------------------------------------------------------------------
INSERT INTO public.assets (
  id, code, slug, status, name_th, name_en, description_th, description_en,
  main_category_key, pricing_model, currency_code,
  daily_rate, weekly_rate, monthly_rate, deposit_amount,
  min_rental_days, storage_branch_id, sort_order
)
VALUES
  ('5eed0000-0000-4000-8000-0000000000a1'::uuid, 'SEED-A1', 'seed-asset-one',
   'active', 'เครื่องมือทดสอบ 1 (SEED)', 'SEED Tool One',
   'รายละเอียดทดสอบ', 'Seed description', 'others', 'daily', 'THB',
   500.00, 3000.00, 11000.00, 0.00, 1, 'seed-branch-01', 1),

  ('5eed0000-0000-4000-8000-0000000000a2'::uuid, 'SEED-A2', 'seed-asset-two',
   'active', 'เครื่องมือทดสอบ 2 (SEED)', 'SEED Tool Two',
   'รายละเอียดทดสอบ', 'Seed description', 'others', 'daily', 'THB',
   500.00, 3000.00, 11000.00, 0.00, 1, 'seed-branch-01', 2),

  ('5eed0000-0000-4000-8000-0000000000a3'::uuid, 'SEED-A3', 'seed-asset-three',
   'active', 'เครื่องมือทดสอบ 3 (SEED)', 'SEED Tool Three',
   'รายละเอียดทดสอบ', 'Seed description', 'others', 'daily', 'THB',
   500.00, 3000.00, 11000.00, 0.00, 1, 'seed-branch-01', 3);

INSERT INTO public.asset_branch_inventory
  (asset_id, inventory_id, branch_id, branch_code, branch_name, on_hand, available)
SELECT a.id,
       (SELECT i.id FROM public.inventories i
         WHERE i.branch_id = 'seed-branch-01' AND i.name = 'Rental'),
       'seed-branch-01', 'SEED01', 'SEED Test Branch', 1, 1
FROM public.assets a
WHERE a.code IN ('SEED-A1', 'SEED-A2', 'SEED-A3');


-- -----------------------------------------------------------------------------
-- 5. RENTAL BOOKINGS — DATE REASONING AGAINST THE 00:05 AUTO-CANCEL CRON
--
-- The cron job 'rental-launch-auto-cancel' runs '5 17 * * *' UTC = 00:05
-- Asia/Bangkok and calls f_auto_cancel_expired_rental_bookings, whose predicate
-- is EXACTLY:
--       status = 'confirmed' AND start_date < (now() AT TIME ZONE 'Asia/Bangkok')::date
-- Only 'confirmed' bookings with a STRICTLY past start_date are swept. Every
-- date below is chosen against that predicate:
--
--   A  confirmed,  start = today+7  -> start_date is in the FUTURE, so the sweep
--                                     cannot touch it. A survives at least a
--                                     week of nightly runs, which is what makes
--                                     it a stable target for the three cancel
--                                     walks (customer / staff / POS).
--   B  picked_up,  start = today-2  -> past dates, but the predicate filters on
--                                     status='confirmed' only, so a picked_up
--                                     booking is immune regardless of dates.
--                                     end_date = today so late_days floors to 0
--                                     and the settle walk gets a clean baseline
--                                     charge with no rental_extension line.
--   C  confirmed,  start = today-1  -> DELIBERATELY sweepable. This is the
--                                     fixture FOR the auto-cancel walk. It is
--                                     consumed by design: whether the walk calls
--                                     the sweep manually or the 00:05 cron fires
--                                     first, C ends up cancelled. It will NOT
--                                     survive to a second day — reseed to repeat
--                                     the auto-cancel walk.
--   D  returned,   start = today-10 -> terminal status, outside both the sweep
--                                     predicate and the overlap trigger. Carries
--                                     the pre-built settlement in §6.
--
-- 134 asserts rental_days = (end_date - start_date) and refuses to settle a
-- self-inconsistent booking, so every row below satisfies that exactly (2 days).
-- end_date is EXCLUSIVE per the ratified semantic (design §8.10).
-- -----------------------------------------------------------------------------
INSERT INTO public.rental_bookings (
  id, user_id, asset_id, asset_code, asset_slug, asset_name,
  product_name, booker_name, booker_phone,
  start_date, end_date, rental_days,
  pricing_model, currency_code, daily_rate, rental_total,
  deposit_amount, status,
  pickup_branch_id, kyc_profile_id, pickup_at, returned_at
)
VALUES
  -- A — confirmed, future pickup: target for customer/staff/POS cancel walks
  ('5eed0000-0000-4000-8000-0000000000b1'::uuid,
   '5eed0000-0000-4000-8000-000000000001'::uuid,
   '5eed0000-0000-4000-8000-0000000000a1'::uuid, 'SEED-A1', 'seed-asset-one', 'SEED Tool One',
   'SEED Tool One', 'SEED Customer One', 'SEED-0000000001',
   (CURRENT_DATE + 7), (CURRENT_DATE + 9), 2,
   'daily', 'THB', 500.00, 1000.00,
   0.00, 'confirmed',
   'seed-branch-01', '5eed0000-0000-4000-8000-0000000000c1'::uuid, NULL, NULL),

  -- B — picked_up, returning today: target for the 13-arg settle walk
  ('5eed0000-0000-4000-8000-0000000000b2'::uuid,
   '5eed0000-0000-4000-8000-000000000001'::uuid,
   '5eed0000-0000-4000-8000-0000000000a2'::uuid, 'SEED-A2', 'seed-asset-two', 'SEED Tool Two',
   'SEED Tool Two', 'SEED Customer One', 'SEED-0000000001',
   (CURRENT_DATE - 2), CURRENT_DATE, 2,
   'daily', 'THB', 500.00, 1000.00,
   0.00, 'picked_up',
   'seed-branch-01', '5eed0000-0000-4000-8000-0000000000c1'::uuid, now() - interval '2 days', NULL),

  -- C — confirmed, pickup date already passed: target for the auto-cancel sweep
  ('5eed0000-0000-4000-8000-0000000000b3'::uuid,
   '5eed0000-0000-4000-8000-000000000001'::uuid,
   '5eed0000-0000-4000-8000-0000000000a3'::uuid, 'SEED-A3', 'seed-asset-three', 'SEED Tool Three',
   'SEED Tool Three', 'SEED Customer One', 'SEED-0000000001',
   (CURRENT_DATE - 1), (CURRENT_DATE + 1), 2,
   'daily', 'THB', 500.00, 1000.00,
   0.00, 'confirmed',
   'seed-branch-01', '5eed0000-0000-4000-8000-0000000000c1'::uuid, NULL, NULL),

  -- D — returned: carries the awaiting_payment settlement for the waive walks
  ('5eed0000-0000-4000-8000-0000000000b4'::uuid,
   '5eed0000-0000-4000-8000-000000000001'::uuid,
   '5eed0000-0000-4000-8000-0000000000a1'::uuid, 'SEED-A1', 'seed-asset-one', 'SEED Tool One',
   'SEED Tool One', 'SEED Customer One', 'SEED-0000000001',
   (CURRENT_DATE - 10), (CURRENT_DATE - 8), 2,
   'daily', 'THB', 500.00, 1000.00,
   0.00, 'returned',
   'seed-branch-01', '5eed0000-0000-4000-8000-0000000000c1'::uuid,
   now() - interval '10 days', now() - interval '8 days');


-- -----------------------------------------------------------------------------
-- 6. SETTLEMENT IN awaiting_payment (booking D)
--
-- Shape is the ratified LAUNCH shape (design §8.7 / §8.12, Option A): launch
-- keeps penalty_lines EMPTY, so the settlement row is naturally 0/0/0 and the
-- charge travels the typed staff-charge channel instead. That satisfies every
-- CHECK on the table without inventing deposit-era money:
-- penalty_total is a STORED GENERATED column
-- (GENERATED ALWAYS AS f_penalty_lines_total(penalty_lines)) and MUST be omitted
-- from the column list — inserting it raises SQLSTATE 428C9. With penalty_lines
-- '[]' the generated value is 0, so the composition check still holds:
--   rbs_applied_composition_chk : 0 = 0 - 0
--   rbs_full_release_invariant_chk : 0 + 0 = 0 + 0
--   rbs_slip_required_chk : refund=0 AND additional=0, so no slip required
--
-- The money the customer owes lives on the payment-state row's amount_due
-- (writer-derived at settle time per I-3/J-4; set directly here because this
-- fixture is pre-built rather than produced by the RPC).
--
-- Seeding this independently of booking B is deliberate: the waive walks must
-- not depend on the settle walk having passed first. If settle fails, waive is
-- still exercisable, and the two failures stay distinguishable.
-- -----------------------------------------------------------------------------
INSERT INTO public.rental_booking_settlements (
  id, booking_id, held_total, penalty_lines,
  special_discount_amount, settlement_applied_amount, refund_amount,
  additional_collection_amount, currency_code,
  customer_signature_path, staff_signature_path,
  created_by_user_id, branch_id
)
VALUES (
  '5eed0000-0000-4000-8000-0000000000d1'::uuid,
  '5eed0000-0000-4000-8000-0000000000b4'::uuid,
  0.00, '[]'::jsonb,
  0.00, 0.00, 0.00,
  0.00, 'THB',
  'seed/signatures/customer-seed.png', 'seed/signatures/staff-seed.png',
  '5eed0000-0000-4000-8000-000000000002'::uuid, 'seed-branch-01'
);

INSERT INTO public.rental_settlement_payment_states (
  id, settlement_id, booking_id, state, amount_due, amount_paid, currency_code
)
VALUES (
  '5eed0000-0000-4000-8000-0000000000e1'::uuid,
  '5eed0000-0000-4000-8000-0000000000d1'::uuid,
  '5eed0000-0000-4000-8000-0000000000b4'::uuid,
  'awaiting_payment', 1000.00, 0.00, 'THB'
);


-- -----------------------------------------------------------------------------
-- 7. WHAT THIS SEED DELIBERATELY DOES NOT CREATE
--    - No money_ops_decision_logs rows. That table is append-only (mig-132) and
--      its rows are the EVIDENCE the smoke is trying to produce. Pre-seeding it
--      would contaminate the very signal the §F denial walk checks for.
--    - No official_documents rows. Documents must be minted through the mig-068
--      engine (design §0 hard constraint) — never inserted directly, in any
--      surface. A seeded document would be exactly the bypass §0 forbids.
--    - No deposit-era rows. deposits.enabled is {"enabled": false} at launch;
--      seeding deposit money would be the fiction family §8.8 warns about.
-- -----------------------------------------------------------------------------

DO $report$
DECLARE v_u bigint; v_a bigint; v_b bigint; v_s bigint;
BEGIN
  SELECT count(*) INTO v_u FROM public.users;
  SELECT count(*) INTO v_a FROM public.assets;
  SELECT count(*) INTO v_b FROM public.rental_bookings;
  SELECT count(*) INTO v_s FROM public.rental_settlement_payment_states;
  RAISE NOTICE 'HOPNIC seed applied: % users, % assets, % bookings, % payment-states', v_u, v_a, v_b, v_s;
END
$report$;
