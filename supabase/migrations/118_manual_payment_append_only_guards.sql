-- ============================================================
-- 118_manual_payment_append_only_guards.sql
--
-- Scope (G1 — docs/payment-flow-ratification-audit.md F2; DECISIONS 2026-07-09):
--   Append-only / immutability guards on the FIVE manual-payment evidence tables.
--   RLS is service_role-only (mig 113/114/115) and RLS cannot bind service_role;
--   triggers can. Reference pattern: migration 111 (kyc_pickup_overrides).
--     * manual_payment_requests        (mig 115)
--     * manual_payment_request_items   (mig 115)
--     * manual_payment_request_slips   (mig 115)
--     * rental_booking_deposit_slips   (mig 113)  — Scope B (real money confirms here)
--     * sale_order_payment_slips       (mig 114)  — Scope B (real money confirms here)
--
-- Key design decisions:
--   * IMMUTABLE BY DEFAULT. Each guard-update function compares to_jsonb(OLD) vs
--     to_jsonb(NEW) with only the explicit transition-field whitelist removed
--     (jsonb `- text[]`). ANY other column difference RAISEs. Consequence:
--       - ADDING a column to any of these tables requires NO guard change — new
--         columns are immutable automatically (guarded by default).
--       - LOOSENING one (making a new/existing column editable) requires a
--         DELIBERATE edit to that table's whitelist array in a future migration.
--   * manual_payment_request_items has NO legitimate UPDATE at all → an
--     unconditional block-update (mig-111 style), no whitelist.
--   * Guards cover FIELD MUTATION only. Status-transition legality (audit A3)
--     stays endpoint-enforced and remains OPEN — 118 closes the G1 BLOCKER by
--     making amounts, file refs, and accountability fields tamper-proof.
--   * DELETE is blocked on ALL FIVE tables, for all roles, permanently. This is
--     intentional. The future PDPA / retention task (audit A2) MUST design a
--     formal purge path that DROPs these block-delete triggers deliberately
--     (with a committed audit trail) before removing any row — there is no
--     silent delete path by design. items/slips (115) carry ON DELETE CASCADE
--     from the header, but the header DELETE is also blocked, so no cascade path
--     exists; 113/114 FKs are ON DELETE RESTRICT.
--   * Functions do only to_jsonb(NEW/OLD) builtins — no catalog lookups — so
--     search_path is irrelevant (matches mig-111's plain-function style).
-- ============================================================

-- ── manual_payment_requests (mig 115) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manual_payment_requests_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY[
        'status','admin_note','submitted_at',
        'reviewed_at','reviewed_by',
        'rejected_at','rejected_by','rejected_reason',
        'updated_at'
      ]::text[])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY[
        'status','admin_note','submitted_at',
        'reviewed_at','reviewed_by',
        'rejected_at','rejected_by','rejected_reason',
        'updated_at'
      ]::text[])
  THEN
    RAISE EXCEPTION
      'manual_payment_requests: all columns immutable by default except: status, admin_note, submitted_at, reviewed_at, reviewed_by, rejected_at, rejected_by, rejected_reason, updated_at — future columns are guarded automatically (append-only guard, migration 118 / G1).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.manual_payment_requests_block_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'manual_payment_requests rows are append-only: DELETE is not permitted (migration 118 / G1). A formal purge (audit A2) must drop this trigger deliberately.';
END;
$$;

DROP TRIGGER IF EXISTS trg_manual_payment_requests_guard_update ON public.manual_payment_requests;
CREATE TRIGGER trg_manual_payment_requests_guard_update
  BEFORE UPDATE ON public.manual_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.manual_payment_requests_guard_update();

DROP TRIGGER IF EXISTS trg_manual_payment_requests_block_delete ON public.manual_payment_requests;
CREATE TRIGGER trg_manual_payment_requests_block_delete
  BEFORE DELETE ON public.manual_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.manual_payment_requests_block_delete();

COMMENT ON TRIGGER trg_manual_payment_requests_guard_update ON public.manual_payment_requests IS
  'G1 (ratification audit F2; DECISIONS 2026-07-09): all columns immutable by default except: status, admin_note, submitted_at, reviewed_at, reviewed_by, rejected_at, rejected_by, rejected_reason, updated_at — future columns are guarded automatically. Transition legality (A3) stays endpoint-enforced.';
COMMENT ON TRIGGER trg_manual_payment_requests_block_delete ON public.manual_payment_requests IS
  'G1: append-only audit/money-evidence — DELETE blocked for all roles. A formal purge (PDPA/retention, audit A2) must drop this trigger deliberately (migration 118).';

-- ── manual_payment_request_items (mig 115) — no legitimate UPDATE ─────────────
CREATE OR REPLACE FUNCTION public.manual_payment_request_items_block_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'manual_payment_request_items rows are immutable: UPDATE is not permitted — allocation rows never change after insert (migration 118 / G1).';
END;
$$;

CREATE OR REPLACE FUNCTION public.manual_payment_request_items_block_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'manual_payment_request_items rows are append-only: DELETE is not permitted (migration 118 / G1). A formal purge (audit A2) must drop this trigger deliberately.';
END;
$$;

DROP TRIGGER IF EXISTS trg_manual_payment_request_items_block_update ON public.manual_payment_request_items;
CREATE TRIGGER trg_manual_payment_request_items_block_update
  BEFORE UPDATE ON public.manual_payment_request_items
  FOR EACH ROW EXECUTE FUNCTION public.manual_payment_request_items_block_update();

DROP TRIGGER IF EXISTS trg_manual_payment_request_items_block_delete ON public.manual_payment_request_items;
CREATE TRIGGER trg_manual_payment_request_items_block_delete
  BEFORE DELETE ON public.manual_payment_request_items
  FOR EACH ROW EXECUTE FUNCTION public.manual_payment_request_items_block_delete();

COMMENT ON TRIGGER trg_manual_payment_request_items_block_update ON public.manual_payment_request_items IS
  'G1 (ratification audit F2; DECISIONS 2026-07-09): allocation rows are fully immutable — no legitimate in-place UPDATE exists; blocked for all roles (migration 118).';
COMMENT ON TRIGGER trg_manual_payment_request_items_block_delete ON public.manual_payment_request_items IS
  'G1: append-only — DELETE blocked. Header DELETE is also blocked, so no ON DELETE CASCADE path reaches this trigger. Purge (audit A2) must drop this trigger deliberately (migration 118).';

-- ── manual_payment_request_slips (mig 115) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manual_payment_request_slips_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY[
        'status','reviewed_by','reviewed_at',
        'rejected_by','rejected_at','rejected_reason'
      ]::text[])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY[
        'status','reviewed_by','reviewed_at',
        'rejected_by','rejected_at','rejected_reason'
      ]::text[])
  THEN
    RAISE EXCEPTION
      'manual_payment_request_slips: all columns immutable by default except: status, reviewed_by, reviewed_at, rejected_by, rejected_at, rejected_reason — future columns are guarded automatically (append-only guard, migration 118 / G1).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.manual_payment_request_slips_block_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'manual_payment_request_slips rows are append-only: DELETE is not permitted (migration 118 / G1). A formal purge (audit A2) must drop this trigger deliberately.';
END;
$$;

DROP TRIGGER IF EXISTS trg_manual_payment_request_slips_guard_update ON public.manual_payment_request_slips;
CREATE TRIGGER trg_manual_payment_request_slips_guard_update
  BEFORE UPDATE ON public.manual_payment_request_slips
  FOR EACH ROW EXECUTE FUNCTION public.manual_payment_request_slips_guard_update();

DROP TRIGGER IF EXISTS trg_manual_payment_request_slips_block_delete ON public.manual_payment_request_slips;
CREATE TRIGGER trg_manual_payment_request_slips_block_delete
  BEFORE DELETE ON public.manual_payment_request_slips
  FOR EACH ROW EXECUTE FUNCTION public.manual_payment_request_slips_block_delete();

COMMENT ON TRIGGER trg_manual_payment_request_slips_guard_update ON public.manual_payment_request_slips IS
  'G1 (ratification audit F2; DECISIONS 2026-07-09): all columns immutable by default except: status, reviewed_by, reviewed_at, rejected_by, rejected_at, rejected_reason — future columns (incl. file refs) are guarded automatically (migration 118).';
COMMENT ON TRIGGER trg_manual_payment_request_slips_block_delete ON public.manual_payment_request_slips IS
  'G1: slip evidence is append-only — DELETE blocked for all roles. Purge (audit A2) must drop this trigger deliberately (migration 118).';

-- ── rental_booking_deposit_slips (mig 113) — Scope B ──────────────────────────
CREATE OR REPLACE FUNCTION public.rental_booking_deposit_slips_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status','reviewed_by','reviewed_at','review_note']::text[])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','reviewed_by','reviewed_at','review_note']::text[])
  THEN
    RAISE EXCEPTION
      'rental_booking_deposit_slips: all columns immutable by default except: status, reviewed_by, reviewed_at, review_note — future columns are guarded automatically (append-only guard, migration 118 / G1 Scope B).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.rental_booking_deposit_slips_block_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'rental_booking_deposit_slips rows are append-only: DELETE is not permitted (migration 118 / G1 Scope B). A formal purge (audit A2) must drop this trigger deliberately.';
END;
$$;

DROP TRIGGER IF EXISTS trg_rental_booking_deposit_slips_guard_update ON public.rental_booking_deposit_slips;
CREATE TRIGGER trg_rental_booking_deposit_slips_guard_update
  BEFORE UPDATE ON public.rental_booking_deposit_slips
  FOR EACH ROW EXECUTE FUNCTION public.rental_booking_deposit_slips_guard_update();

DROP TRIGGER IF EXISTS trg_rental_booking_deposit_slips_block_delete ON public.rental_booking_deposit_slips;
CREATE TRIGGER trg_rental_booking_deposit_slips_block_delete
  BEFORE DELETE ON public.rental_booking_deposit_slips
  FOR EACH ROW EXECUTE FUNCTION public.rental_booking_deposit_slips_block_delete();

COMMENT ON TRIGGER trg_rental_booking_deposit_slips_guard_update ON public.rental_booking_deposit_slips IS
  'G1 Scope B (ratification audit F2 — "real money confirms here"; DECISIONS 2026-07-09): all columns immutable by default except: status, reviewed_by, reviewed_at, review_note — future columns guarded automatically (migration 118).';
COMMENT ON TRIGGER trg_rental_booking_deposit_slips_block_delete ON public.rental_booking_deposit_slips IS
  'G1 Scope B: append-only — DELETE blocked for all roles. Purge (audit A2) must drop this trigger deliberately (migration 118).';

-- ── sale_order_payment_slips (mig 114) — Scope B ──────────────────────────────
CREATE OR REPLACE FUNCTION public.sale_order_payment_slips_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status','reviewed_by','reviewed_at','review_note']::text[])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','reviewed_by','reviewed_at','review_note']::text[])
  THEN
    RAISE EXCEPTION
      'sale_order_payment_slips: all columns immutable by default except: status, reviewed_by, reviewed_at, review_note — future columns are guarded automatically (append-only guard, migration 118 / G1 Scope B).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sale_order_payment_slips_block_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'sale_order_payment_slips rows are append-only: DELETE is not permitted (migration 118 / G1 Scope B). A formal purge (audit A2) must drop this trigger deliberately.';
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_order_payment_slips_guard_update ON public.sale_order_payment_slips;
CREATE TRIGGER trg_sale_order_payment_slips_guard_update
  BEFORE UPDATE ON public.sale_order_payment_slips
  FOR EACH ROW EXECUTE FUNCTION public.sale_order_payment_slips_guard_update();

DROP TRIGGER IF EXISTS trg_sale_order_payment_slips_block_delete ON public.sale_order_payment_slips;
CREATE TRIGGER trg_sale_order_payment_slips_block_delete
  BEFORE DELETE ON public.sale_order_payment_slips
  FOR EACH ROW EXECUTE FUNCTION public.sale_order_payment_slips_block_delete();

COMMENT ON TRIGGER trg_sale_order_payment_slips_guard_update ON public.sale_order_payment_slips IS
  'G1 Scope B (ratification audit F2; DECISIONS 2026-07-09): all columns immutable by default except: status, reviewed_by, reviewed_at, review_note — future columns guarded automatically (migration 118).';
COMMENT ON TRIGGER trg_sale_order_payment_slips_block_delete ON public.sale_order_payment_slips IS
  'G1 Scope B: append-only — DELETE blocked for all roles. Purge (audit A2) must drop this trigger deliberately (migration 118).';

-- ── Assertion: all TEN triggers present ───────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
      WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
        AND t.tgname IN (
          'trg_manual_payment_requests_guard_update',
          'trg_manual_payment_requests_block_delete',
          'trg_manual_payment_request_items_block_update',
          'trg_manual_payment_request_items_block_delete',
          'trg_manual_payment_request_slips_guard_update',
          'trg_manual_payment_request_slips_block_delete',
          'trg_rental_booking_deposit_slips_guard_update',
          'trg_rental_booking_deposit_slips_block_delete',
          'trg_sale_order_payment_slips_guard_update',
          'trg_sale_order_payment_slips_block_delete'
        )) <> 10 THEN
    RAISE EXCEPTION 'migration 118: expected 10 append-only triggers on the five manual-payment tables';
  END IF;
END $$;
