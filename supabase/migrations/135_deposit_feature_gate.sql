-- ============================================================
-- 135_deposit_feature_gate.sql
--
-- Scope:
--   * system_configs 'deposits.enabled' seed, default FALSE (gated).
--   * f_deposits_enabled() — fail-closed reader (K-5).
--   * Layer-1 DB gate on the four deposit-writing RPCs, via
--     RENAME-AND-WRAP: the original body is RENAMED to *_ungated and a
--     new same-signature wrapper carries the guard and delegates.
--
-- Why rename-and-wrap instead of CREATE OR REPLACE (method ruling
-- 2026-07-23): the four bodies total 737 lines of money-critical logic
-- (deposit capture, cancel/forfeit, customer refund, no-show sweep).
-- Re-typing them to prepend a guard would put a silent transcription
-- error into the forfeiture/refund math, and a 737-line "delta proof"
-- is not auditable. RENAME moves the body byte-identically (md5-verified),
-- so the reviewable surface is four short wrappers.
--
-- Key design decisions:
--   * Deposits are PARKED, not deleted (decisions 2026-07-22 f). Nothing
--     is dropped; every table, CHECK vocabulary and historical row stays.
--   * REVIVAL = UPDATE the config row to {"enabled": true}. NO migration.
--     The wrapper pair STAYS forever; it is not unwound by revival.
--   * The guard is the FIRST statement in each wrapper, before any lock
--     or write (OPERATING-MODEL §3: guard before the side effect).
--   * Absent/malformed config = GATED (false), never open. This
--     deliberately DIVERGES from f_tax_vat_config (134), which RAISEs:
--     an unknown VAT rate must stop the world, but "no one enabled
--     deposits" safely reads as OFF and must not break the launch path.
--   * NOT gated: f_settle_rental_booking_return (THE LAUNCH PATH — its
--     deposit branches self-disable at held=0) and
--     f_rental_no_show_boundary_passed (pure STABLE date predicate).
--   * Gated attempts are NOT logged to money_ops_decision_logs (K-4):
--     a config refusal is not a money decision, and §8.9 established
--     that an in-function log followed by RAISE cannot persist anyway.
-- ============================================================

-- ── A. Config seed: gated by default
INSERT INTO public.system_configs (key, value, description)
VALUES ('deposits.enabled',
        jsonb_build_object('enabled', false),
        'Deposit machinery feature gate (decisions.md 2026-07-22 f). false = booking/security deposits are OFF for minimal launch. Revival: set {"enabled": true} — no migration needed. Read fail-closed by f_deposits_enabled(); absent or malformed = GATED.')
ON CONFLICT (key) DO NOTHING;

-- ── B. Fail-closed reader (K-5: absent/malformed => FALSE, never RAISE)
CREATE OR REPLACE FUNCTION public.f_deposits_enabled()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg jsonb;
BEGIN
  SELECT value INTO v_cfg FROM public.system_configs WHERE key = 'deposits.enabled';
  IF NOT FOUND OR v_cfg IS NULL THEN
    RETURN false;                                   -- absent => GATED
  END IF;
  IF jsonb_typeof(v_cfg->'enabled') <> 'boolean' THEN
    RETURN false;                                   -- malformed => GATED
  END IF;
  RETURN coalesce((v_cfg->>'enabled')::boolean, false);
END;
$$;
REVOKE ALL ON FUNCTION public.f_deposits_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_deposits_enabled() TO service_role;

-- ══════════════════════════════════════════════════════════════
-- PAIR 1 — f_confirm_rental_booking_deposit (119:42)
-- Deposit capture. REFUSE ENTIRELY: no non-deposit path exists.
-- The body lives on unchanged in *_ungated; revival = config flip only.
-- ══════════════════════════════════════════════════════════════
ALTER FUNCTION public.f_confirm_rental_booking_deposit(
  uuid, text, text, uuid, numeric, text, text, text, uuid, text, jsonb
) RENAME TO f_confirm_rental_booking_deposit_ungated;

CREATE FUNCTION public.f_confirm_rental_booking_deposit(
  p_booking_id      uuid,
  p_source_type     text,
  p_source_id       text,
  p_attempt_id      uuid,
  p_amount          numeric,
  p_currency_code   text,
  p_payment_method  text,
  p_branch_id       text,
  p_staff_user_id   uuid,
  p_idempotency_key text,
  p_event_metadata  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.f_deposits_enabled() THEN
    RAISE EXCEPTION 'DEPOSITS_DISABLED';
  END IF;
  RETURN public.f_confirm_rental_booking_deposit_ungated(
    p_booking_id, p_source_type, p_source_id, p_attempt_id, p_amount,
    p_currency_code, p_payment_method, p_branch_id, p_staff_user_id,
    p_idempotency_key, p_event_metadata
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_confirm_rental_booking_deposit_ungated(
  uuid, text, text, uuid, numeric, text, text, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.f_confirm_rental_booking_deposit(
  uuid, text, text, uuid, numeric, text, text, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_confirm_rental_booking_deposit(
  uuid, text, text, uuid, numeric, text, text, text, uuid, text, jsonb
) TO service_role;

-- ══════════════════════════════════════════════════════════════
-- PAIR 2 — f_cancel_rental_booking_admin (129:28)
-- BOTH modes are deposit-shaped (forfeit / company refund). Refused
-- per-mode so the error names which path was blocked.
-- NOTE: launch-era cancellation (slot release) must NOT route here —
-- this is the deposit-era cancel path. Merge-blocker: a launch cancel
-- path must exist before feature/t-launch merges (CHiP, K-1).
-- ══════════════════════════════════════════════════════════════
ALTER FUNCTION public.f_cancel_rental_booking_admin(
  text, uuid, uuid, text, text, timestamptz, date, date, date, text,
  numeric, text, uuid, uuid, public.payment_gateway, text, text, text,
  text, text, text, text
) RENAME TO f_cancel_rental_booking_admin_ungated;

CREATE FUNCTION public.f_cancel_rental_booking_admin(
  p_mode                                       text,
  p_booking_id                                 uuid,
  p_actor_user_id                              uuid,
  p_actor_role                                 text,
  p_reason                                     text,
  p_cancelled_at                               timestamptz,
  p_pickup_local_date                          date,
  p_cancellation_local_date                    date,
  p_refund_cutoff_date                         date,
  p_refund_policy_version                      text,
  p_refund_amount                              numeric DEFAULT NULL::numeric,
  p_original_payment_source_type               text DEFAULT NULL::text,
  p_original_rental_booking_payment_attempt_id uuid DEFAULT NULL::uuid,
  p_original_mixed_payment_allocation_id       uuid DEFAULT NULL::uuid,
  p_gateway                                    public.payment_gateway DEFAULT NULL::public.payment_gateway,
  p_gateway_charge_id                          text DEFAULT NULL::text,
  p_gateway_payment_reference                  text DEFAULT NULL::text,
  p_currency_code                              text DEFAULT 'THB'::text,
  p_refund_bank_name                           text DEFAULT NULL::text,
  p_refund_bank_account_number                 text DEFAULT NULL::text,
  p_refund_bank_account_name                   text DEFAULT NULL::text,
  p_refund_contact_phone                       text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.f_deposits_enabled() THEN
    IF p_mode = 'late_cancel_forfeit' THEN
      RAISE EXCEPTION 'DEPOSITS_DISABLED_CANCEL_FORFEIT';
    ELSIF p_mode = 'company_cancel_refund' THEN
      RAISE EXCEPTION 'DEPOSITS_DISABLED_CANCEL_REFUND';
    ELSE
      -- Unknown mode while gated: refuse without leaking which modes exist.
      RAISE EXCEPTION 'DEPOSITS_DISABLED';
    END IF;
  END IF;
  RETURN public.f_cancel_rental_booking_admin_ungated(
    p_mode, p_booking_id, p_actor_user_id, p_actor_role, p_reason,
    p_cancelled_at, p_pickup_local_date, p_cancellation_local_date,
    p_refund_cutoff_date, p_refund_policy_version, p_refund_amount,
    p_original_payment_source_type,
    p_original_rental_booking_payment_attempt_id,
    p_original_mixed_payment_allocation_id, p_gateway,
    p_gateway_charge_id, p_gateway_payment_reference, p_currency_code,
    p_refund_bank_name, p_refund_bank_account_number,
    p_refund_bank_account_name, p_refund_contact_phone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_cancel_rental_booking_admin_ungated(
  text, uuid, uuid, text, text, timestamptz, date, date, date, text,
  numeric, text, uuid, uuid, public.payment_gateway, text, text, text,
  text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.f_cancel_rental_booking_admin(
  text, uuid, uuid, text, text, timestamptz, date, date, date, text,
  numeric, text, uuid, uuid, public.payment_gateway, text, text, text,
  text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_cancel_rental_booking_admin(
  text, uuid, uuid, text, text, timestamptz, date, date, date, text,
  numeric, text, uuid, uuid, public.payment_gateway, text, text, text,
  text, text, text, text
) TO service_role;

-- ══════════════════════════════════════════════════════════════
-- PAIR 3 — f_cancel_customer_rental_booking_refund_request (082:20)
-- Wholly a deposit-refund request. REFUSE ENTIRELY. Customer-facing
-- cancellation must be re-pointed at a slot-release path in Phase 1.
-- ══════════════════════════════════════════════════════════════
ALTER FUNCTION public.f_cancel_customer_rental_booking_refund_request(
  uuid, uuid, timestamptz, text, text, date, date, date, text, text,
  numeric, text, uuid, uuid, public.payment_gateway, text, text, text,
  text, text, text, text, text, timestamptz
) RENAME TO f_cancel_customer_rental_booking_refund_request_ungated;

CREATE FUNCTION public.f_cancel_customer_rental_booking_refund_request(
  p_booking_id                                 uuid,
  p_user_id                                    uuid,
  p_cancelled_at                               timestamptz,
  p_cancellation_reason_code                   text,
  p_cancellation_reason_note                   text,
  p_pickup_local_date                          date,
  p_cancellation_local_date                    date,
  p_refund_cutoff_date                         date,
  p_refund_policy_version                      text,
  p_refund_timezone                            text,
  p_refund_amount                              numeric,
  p_original_payment_source_type               text,
  p_original_rental_booking_payment_attempt_id uuid,
  p_original_mixed_payment_allocation_id       uuid,
  p_gateway                                    public.payment_gateway,
  p_gateway_charge_id                          text,
  p_gateway_payment_reference                  text,
  p_currency_code                              text,
  p_refund_bank_name                           text,
  p_refund_bank_account_number                 text,
  p_refund_bank_account_name                   text,
  p_refund_contact_phone                       text,
  p_refund_customer_note                       text,
  p_restriction_window_started_at              timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.f_deposits_enabled() THEN
    RAISE EXCEPTION 'DEPOSITS_DISABLED_CUSTOMER_REFUND';
  END IF;
  RETURN public.f_cancel_customer_rental_booking_refund_request_ungated(
    p_booking_id, p_user_id, p_cancelled_at, p_cancellation_reason_code,
    p_cancellation_reason_note, p_pickup_local_date,
    p_cancellation_local_date, p_refund_cutoff_date,
    p_refund_policy_version, p_refund_timezone, p_refund_amount,
    p_original_payment_source_type,
    p_original_rental_booking_payment_attempt_id,
    p_original_mixed_payment_allocation_id, p_gateway,
    p_gateway_charge_id, p_gateway_payment_reference, p_currency_code,
    p_refund_bank_name, p_refund_bank_account_number,
    p_refund_bank_account_name, p_refund_contact_phone,
    p_refund_customer_note, p_restriction_window_started_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_cancel_customer_rental_booking_refund_request_ungated(
  uuid, uuid, timestamptz, text, text, date, date, date, text, text,
  numeric, text, uuid, uuid, public.payment_gateway, text, text, text,
  text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.f_cancel_customer_rental_booking_refund_request(
  uuid, uuid, timestamptz, text, text, date, date, date, text, text,
  numeric, text, uuid, uuid, public.payment_gateway, text, text, text,
  text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_cancel_customer_rental_booking_refund_request(
  uuid, uuid, timestamptz, text, text, date, date, date, text, text,
  numeric, text, uuid, uuid, public.payment_gateway, text, text, text,
  text, text, text, text, text, timestamptz
) TO service_role;

-- ══════════════════════════════════════════════════════════════
-- PAIR 4 — f_auto_mark_rental_no_shows (126:58)
-- No-show sweep + deposit forfeiture. REFUSE ENTIRELY.
-- Belt AND braces with 137: 135 gates the FUNCTION, 137 removes the
-- pg_cron SCHEDULE. Unscheduling is not gating — the function stays
-- callable manually or by any future scheduler, so both are required.
-- It normally RETURNS jsonb rather than raising; the gate RAISEs so a
-- gated call is unambiguous rather than an empty-looking success.
-- ══════════════════════════════════════════════════════════════
ALTER FUNCTION public.f_auto_mark_rental_no_shows()
  RENAME TO f_auto_mark_rental_no_shows_ungated;

CREATE FUNCTION public.f_auto_mark_rental_no_shows()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.f_deposits_enabled() THEN
    RAISE EXCEPTION 'DEPOSITS_DISABLED_NO_SHOW_SWEEP';
  END IF;
  RETURN public.f_auto_mark_rental_no_shows_ungated();
END;
$$;

REVOKE ALL ON FUNCTION public.f_auto_mark_rental_no_shows_ungated()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.f_auto_mark_rental_no_shows()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_auto_mark_rental_no_shows() TO service_role;
