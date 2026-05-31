-- ============================================================
-- 106_kyc_booking_link_and_pickup_snapshot.sql
--
-- Scope:
--   1. rental_bookings.kyc_profile_id
--      Nullable FK → kyc_profiles(id) ON DELETE SET NULL.
--      For walk-in bookings: points to the KYC profile attached
--      during POS V3 KYC mode.  Gate resolution uses this column;
--      must never be populated by phone matching.
--
--   2. rental_booking_fulfillments — pickup-time KYC snapshot
--      Four nullable columns written once at confirmPickup time:
--        kyc_profile_id         – which profile authorized pickup
--        kyc_status_snapshot    – status observed at confirm time
--        kyc_valid_until_snapshot – valid_until observed at confirm
--        kyc_authorized_via     – 'verified' | 'override'
--        kyc_override_id        – which override row, if via override
--      These are audit evidence only.  The live gate must evaluate
--      fresh KYC state before writing the snapshot; the snapshot
--      itself must never feed back into gate resolution.
--
-- Key design decisions:
--   * kyc_profiles is the identity root (identity_hash).
--     Walk-in KYC is not owned by walk_in_customers (phone-rooted).
--   * rental_bookings.kyc_profile_id is the gate resolution input
--     for walk-in bookings.  Registered-user bookings still resolve
--     by user_id → kyc_profiles.user_id.
--   * Snapshot columns freeze the KYC authorization evidence at the
--     exact moment pickup was confirmed, for post-hoc audit.
--   * rental_booking_fulfillments is effectively append-only by
--     application design (server inserts only; no UPDATE code path).
--     A DB-level immutability trigger is not added here — the table
--     has no authenticated/anon UPDATE grant (service_role only) and
--     the application invariant is sufficient for this phase.
--   * Snapshot consistency (verified → kyc_profile_id, override → kyc_override_id)
--     is enforced by the application's atomic INSERT at confirmPickup time, NOT
--     by DB CHECKs.  DB-level consistency CHECKs would conflict with
--     ON DELETE SET NULL: if the referenced kyc_profiles / kyc_pickup_overrides
--     row is deleted, the FK sets the UUID to NULL while kyc_authorized_via
--     remains 'verified'/'override', which would violate the CHECK and prevent
--     the FK cascade.  The snapshot row must survive parent deletion intact
--     (minus the UUID pointer) as audit evidence.
--   * No new GRANT/REVOKE needed:
--     - rental_bookings: already GRANT SELECT/INSERT/UPDATE/DELETE
--       to authenticated (migration 070). The new kyc_profile_id UUID
--       column is readable by booking owners (low risk — it's an opaque
--       UUID; kyc_profiles itself remains blocked to authenticated).
--     - rental_booking_fulfillments: already REVOKE ALL FROM
--       anon, authenticated; GRANT ALL TO service_role only
--       (migration 070). KYC snapshot columns inherit this grant
--       automatically — no additional action needed.
-- ============================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1.  rental_bookings — add kyc_profile_id reference
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS kyc_profile_id UUID NULL
    REFERENCES public.kyc_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rental_bookings.kyc_profile_id IS
  'Reference to the selected KYC profile for this booking. '
  'Used for walk-in KYC gate resolution at pickup. '
  'Must not be populated by phone matching. '
  'NULL for registered-user bookings (those resolve via user_id → kyc_profiles.user_id).';

CREATE INDEX IF NOT EXISTS idx_rental_bookings_kyc_profile_id
  ON public.rental_bookings (kyc_profile_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2.  rental_booking_fulfillments — pickup-time KYC authorization snapshot
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.rental_booking_fulfillments
  ADD COLUMN IF NOT EXISTS kyc_profile_id UUID NULL
    REFERENCES public.kyc_profiles(id) ON DELETE SET NULL,

  ADD COLUMN IF NOT EXISTS kyc_status_snapshot public.kyc_status NULL,

  ADD COLUMN IF NOT EXISTS kyc_valid_until_snapshot TIMESTAMPTZ NULL,

  ADD COLUMN IF NOT EXISTS kyc_authorized_via TEXT NULL,

  ADD COLUMN IF NOT EXISTS kyc_override_id UUID NULL
    REFERENCES public.kyc_pickup_overrides(id) ON DELETE SET NULL;

-- ── Allowed values for kyc_authorized_via ────────────────────────────────────

ALTER TABLE public.rental_booking_fulfillments
  ADD CONSTRAINT chk_fulfillment_kyc_authorized_via
    CHECK (kyc_authorized_via IS NULL
        OR kyc_authorized_via IN ('verified', 'override'));

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.rental_booking_fulfillments.kyc_profile_id IS
  'Pickup-time KYC authorization snapshot — audit only. '
  'Which kyc_profiles row authorized this pickup. Not a gate resolution input.';

COMMENT ON COLUMN public.rental_booking_fulfillments.kyc_status_snapshot IS
  'Pickup-time KYC authorization snapshot — audit only. '
  'kyc_profiles.status observed at the moment pickup was confirmed.';

COMMENT ON COLUMN public.rental_booking_fulfillments.kyc_valid_until_snapshot IS
  'Pickup-time KYC authorization snapshot — audit only. '
  'kyc_profiles.valid_until observed at the moment pickup was confirmed.';

COMMENT ON COLUMN public.rental_booking_fulfillments.kyc_authorized_via IS
  'Pickup-time KYC authorization snapshot — audit only. '
  'How KYC was satisfied: ''verified'' (live profile) or ''override'' (super_admin exception).';

COMMENT ON COLUMN public.rental_booking_fulfillments.kyc_override_id IS
  'Pickup-time KYC authorization snapshot — audit only. '
  'Which kyc_pickup_overrides row allowed pickup when via = ''override''.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fulfillments_kyc_profile_id
  ON public.rental_booking_fulfillments (kyc_profile_id);

CREATE INDEX IF NOT EXISTS idx_fulfillments_kyc_override_id
  ON public.rental_booking_fulfillments (kyc_override_id);
