-- 094: rental_held_balance_events — Phase 2E-B1.5 event_type gap fix.
-- Extends public.rental_held_balance_events.event_type CHECK to include
-- 'remaining_security_deposit_collection' for POS V3 pickup-phase cash deposit collection.
--
-- Background:
--   Migration 086 created rental_held_balance_events with an inline (auto-named) CHECK
--   on event_type.  The POS V3 remaining-security-deposit endpoint (Phase 2E-B1.5)
--   records eventType = 'remaining_security_deposit_collection', which was not listed.
--   The DB rejected every insert with a CHECK violation; the endpoint caught the failure
--   and returned status = 'paid_confirm_failed'.  The rental_bookings row was still
--   marked paid, but the held-balance ledger entry was silently missing.
--
-- Scope: constraint extension only.
-- No new tables.  No new columns.  No INSERT / UPDATE / DELETE.  No data backfill.
-- No VAT/WHT/revenue/document/POS-V2 changes.
--
-- Pattern: same safe DO-block drop/re-add used in migrations 092 and 093.

-- ── 1. Drop existing auto-named event_type CHECK ──────────────────────────────

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.rental_held_balance_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%event_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.rental_held_balance_events DROP CONSTRAINT %I',
      cname
    );
  END IF;
END $$;

-- ── 2. Re-add with explicit name and extended value list ──────────────────────
-- Preserves all six values from migration 086 and adds the missing Phase 2E-B1.5 value.

ALTER TABLE public.rental_held_balance_events
  ADD CONSTRAINT rental_held_balance_events_event_type_check
  CHECK (event_type IN (
    'booking_deposit_collection',           -- Phase 2B: booking deposit collected at draft confirmation
    'pickup_held_balance_collection',       -- reserved: future pickup held-balance use
    'same_day_held_balance_collection',     -- reserved: future same-day held-balance use
    'settlement_application',              -- return settlement applies held balance
    'refund',                              -- held balance refunded to customer
    'forfeiture',                          -- held balance forfeited (no-show / policy)
    'remaining_security_deposit_collection' -- Phase 2E-B1.5: remaining security deposit collected at pickup
  ));

-- ── 3. Update column comment ──────────────────────────────────────────────────

COMMENT ON COLUMN public.rental_held_balance_events.event_type IS
  'Locked POS V3 held-balance event type.
   Phase 2B: booking_deposit_collection = booking deposit collected at draft confirmation (cash or QR).
   Phase 2E-B1.5: remaining_security_deposit_collection = remaining security deposit balance collected at pickup (cash only).
   Reserved (future): pickup_held_balance_collection, same_day_held_balance_collection.
   Reductions: settlement_application, refund, forfeiture.
   Manual adjustment is intentionally deferred pending policy/approval semantics.';
