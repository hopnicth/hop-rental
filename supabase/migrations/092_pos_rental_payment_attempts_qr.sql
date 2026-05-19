-- 092: POS rental payment attempts — Phase 2D-B1 QR Booking Deposit schema foundation.
-- Extends public.pos_rental_payment_attempts to support PromptPay QR lifecycle in addition
-- to the existing cash Booking Deposit path.
-- Extends public.payment_events with a nullable FK to pos_rental_payment_attempts for
-- webhook audit linkage.
--
-- Scope: schema foundation only.
-- No endpoints, no webhook changes, no POS UI, no Omise utilities, no finalizer changes,
-- no cash flow changes, no document/BDC schema changes.
--
-- Locked design decisions implemented here:
--   payment_method = 'promptpay_qr' (explicit QR identifier, not plain 'promptpay')
--   QR lifecycle statuses: pending → finalizing → paid | paid_confirm_failed | failed | expired | cancelled
--   gateway column is nullable TEXT (cash rows remain NULL; QR rows store 'omise')
--   One-active-QR constraint is intentionally NOT added here; enforced in B2 endpoint logic.

-- ── 1. Extend payment_method CHECK ───────────────────────────────────────────
-- The original 087 migration created this constraint without an explicit name.
-- Use a DO block to locate and drop it by content, then re-add it with an
-- explicit name — consistent with the pg_constraint pattern used in migration 021.

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.pos_rental_payment_attempts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_method%';
  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.pos_rental_payment_attempts DROP CONSTRAINT %I',
      cname
    );
  END IF;
END $$;

ALTER TABLE public.pos_rental_payment_attempts
  ADD CONSTRAINT pos_rental_payment_attempts_payment_method_check
  CHECK (payment_method IN ('cash', 'promptpay_qr'));

-- ── 2. Extend status CHECK ────────────────────────────────────────────────────
-- Same approach: locate the auto-named status constraint, drop it, re-add it
-- with explicit name and extended value list.
-- New statuses required for QR lifecycle: pending, finalizing, expired.
-- Existing statuses (paid, paid_confirm_failed, failed, cancelled) are preserved unchanged.

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.pos_rental_payment_attempts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%'
    AND pg_get_constraintdef(oid) NOT LIKE '%payment%'
    AND pg_get_constraintdef(oid) NOT LIKE '%metadata%';
  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.pos_rental_payment_attempts DROP CONSTRAINT %I',
      cname
    );
  END IF;
END $$;

ALTER TABLE public.pos_rental_payment_attempts
  ADD CONSTRAINT pos_rental_payment_attempts_status_check
  CHECK (status IN (
    'pending',            -- QR: charge created, awaiting customer payment
    'finalizing',         -- QR: webhook received, finalization in progress
    'paid',               -- Cash + QR: payment collected and booking finalized (or attempted)
    'paid_confirm_failed',-- Cash + QR: payment collected but booking confirmation failed
    'failed',             -- Cash + QR: payment collection failed
    'expired',            -- QR: charge expired before customer paid
    'cancelled'           -- Cash + QR: attempt voided before collection
  ));

-- ── 3. Add gateway metadata columns ──────────────────────────────────────────
-- Follows naming and type conventions from rental_booking_payment_attempts (076)
-- and mixed_payment_attempts (077).
-- gateway is nullable TEXT (not enum) to stay consistent with pos_rental_payment_attempts'
-- existing TEXT-only design. Cash rows retain gateway = NULL (no gateway involved).
-- QR rows set gateway = 'omise'.

ALTER TABLE public.pos_rental_payment_attempts
  ADD COLUMN IF NOT EXISTS gateway           TEXT,
  ADD COLUMN IF NOT EXISTS gateway_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_source_id TEXT,
  ADD COLUMN IF NOT EXISTS qr_image_url      TEXT,
  ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at        TIMESTAMPTZ;

COMMENT ON COLUMN public.pos_rental_payment_attempts.gateway IS
  'Payment gateway used for this attempt. NULL for cash rows. ''omise'' for PromptPay QR rows.';
COMMENT ON COLUMN public.pos_rental_payment_attempts.gateway_charge_id IS
  'Omise charge ID returned at QR charge creation. Used for webhook fan-out lookup and charge retrieval. NULL for cash rows.';
COMMENT ON COLUMN public.pos_rental_payment_attempts.gateway_source_id IS
  'Omise PromptPay source ID. NULL for cash rows.';
COMMENT ON COLUMN public.pos_rental_payment_attempts.qr_image_url IS
  'PromptPay QR image URL (scannable_code.image.download_uri from Omise). NULL for cash rows.';
COMMENT ON COLUMN public.pos_rental_payment_attempts.expires_at IS
  'QR charge expiry timestamp from Omise. NULL for cash rows.';
COMMENT ON COLUMN public.pos_rental_payment_attempts.expired_at IS
  'Timestamp when this attempt was marked expired (by webhook or reconciliation). NULL for non-expired rows.';

-- ── 4. Webhook fan-out lookup index ──────────────────────────────────────────
-- UNIQUE partial index on (gateway, gateway_charge_id) for fast idempotent lookup
-- of a POS QR attempt from an incoming Omise webhook. The partial predicate
-- (WHERE gateway_charge_id IS NOT NULL) naturally excludes all cash rows.
-- Naming mirrors idx_rental_booking_payment_attempts_gateway_charge (076)
-- and idx_mixed_payment_attempts_gateway_charge (077).

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_rental_payment_attempts_gateway_charge
  ON public.pos_rental_payment_attempts(gateway, gateway_charge_id)
  WHERE gateway_charge_id IS NOT NULL;

-- ── 5. Extend payment_events with POS QR attempt linkage ─────────────────────
-- Mirrors the existing rental_booking_payment_attempt_id (added in 076) and
-- mixed_payment_attempt_id (added in 077) columns on payment_events.
-- ON DELETE SET NULL: consistent with all other FK columns on payment_events.
-- This column is set by the webhook handler after successfully processing a
-- charge.complete event for a POS QR Booking Deposit attempt.

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS pos_rental_payment_attempt_id UUID
    REFERENCES public.pos_rental_payment_attempts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payment_events.pos_rental_payment_attempt_id IS
  'FK to pos_rental_payment_attempts: set by webhook handler when a charge event is resolved to a POS V3 QR Booking Deposit attempt. NULL for all non-POS or cash payment events.';

-- ── 6. Update table comment ───────────────────────────────────────────────────

COMMENT ON TABLE public.pos_rental_payment_attempts IS
  'POS V3: durable POS-specific payment source for rental money collection. Phase 2B: cash Booking Deposit. Phase 2D: PromptPay QR Booking Deposit (gateway columns, QR lifecycle statuses).';
COMMENT ON COLUMN public.pos_rental_payment_attempts.payment_method IS
  'cash = cash collection (Phase 2B). promptpay_qr = PromptPay QR via Omise (Phase 2D). Future: card, bank_transfer, etc.';
COMMENT ON COLUMN public.pos_rental_payment_attempts.status IS
  'pending/finalizing = QR lifecycle states. paid = collected and finalized (cash or QR). paid_confirm_failed = payment collected but confirmation failed. failed/cancelled = did not succeed. expired = QR timed out.';
