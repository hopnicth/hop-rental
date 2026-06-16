-- ============================================================
-- 113_rental_deposit_slip_storage.sql
--
-- Scope:
--   * Private storage foundation for customer-uploaded bank-transfer
--     booking-deposit slip evidence (manual bank transfer flow).
--   * Private bucket: rental-deposit-slips (public = FALSE).
--   * Metadata table: public.rental_booking_deposit_slips.
--   * RLS: service_role only. No anon/authenticated direct access.
--     All reads/writes go through route-authenticated server APIs that
--     use the service-role client; downloads use short-lived signed URLs.
--
-- Key design decisions:
--   * Bank slips contain personal/financial PII. They MUST live in a
--     private bucket (mirrors 072_kyc_documents_private_bucket) and MUST
--     NEVER be stored in catalog-media or exposed via permanent public URLs.
--   * Uploading a slip is evidence only — it never confirms the booking and
--     never mutates money. Admin must still mark the deposit received.
--   * The slip row is mutable on REVIEW fields only (status / reviewed_by /
--     reviewed_at / review_note); it is intentionally NOT append-only, so no
--     block-mutation trigger is added.
--   * No additive change to rental_held_balance_events is needed: its
--     source_type and payment_method are free-text columns (086 only checks
--     char_length(trim(source_type)) > 0), and event_type already includes
--     'booking_deposit_collection' (086/094). A manual bank-transfer deposit
--     is recorded with payment_method/source_type text values — no enum or
--     CHECK extension required.
--
-- Out of scope (explicitly NOT done here):
--   * rental_payment_events (not created).
--   * revenue / VAT / rental_booking_payment_lines (untouched).
--   * Omise / QR / payment_attempts (untouched).
--   * OCR / bank reconciliation / duplicate-hash detection / refund flow.
-- ============================================================

-- ── 1. Private bucket ─────────────────────────────────────────────────────────
-- Mirrors 072_kyc_documents_private_bucket: private, owner-checked server APIs
-- only, no public URLs. 10 MB limit; image/pdf evidence.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rental-deposit-slips',
  'rental-deposit-slips',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Metadata table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rental_booking_deposit_slips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_booking_id UUID NOT NULL
    REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  uploaded_by UUID NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'rental-deposit-slips',
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'reviewed', 'rejected')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_booking_deposit_slips IS
  'Customer-uploaded bank-transfer booking-deposit slip evidence. Private (PII) — files live in the private rental-deposit-slips bucket and are served only via short-lived signed URLs through route-authenticated server APIs. Uploading evidence never confirms a booking and never mutates money; admin manually marks the deposit received.';
COMMENT ON COLUMN public.rental_booking_deposit_slips.status IS
  'pending_review (default on upload) -> reviewed | rejected. Set by admin during manual review. Basic status storage only — no full approve/reject workflow in this phase.';
COMMENT ON COLUMN public.rental_booking_deposit_slips.storage_bucket IS
  'Always the private rental-deposit-slips bucket. Never catalog-media.';

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_slips_booking
  ON public.rental_booking_deposit_slips(rental_booking_id);

CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_slips_uploaded_by
  ON public.rental_booking_deposit_slips(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_slips_status
  ON public.rental_booking_deposit_slips(status);

CREATE INDEX IF NOT EXISTS idx_rental_booking_deposit_slips_uploaded_at
  ON public.rental_booking_deposit_slips(uploaded_at DESC);

-- ── 4. RLS — service_role only (level 2 pattern; mirrors 086) ──────────────────
-- No anon/authenticated direct access. Customers upload and admins read/review
-- through server APIs that enforce ownership / requirePlatformAdmin and use the
-- service-role client.

ALTER TABLE public.rental_booking_deposit_slips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_booking_deposit_slips_service_role_all"
  ON public.rental_booking_deposit_slips;
CREATE POLICY "rental_booking_deposit_slips_service_role_all"
  ON public.rental_booking_deposit_slips FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON public.rental_booking_deposit_slips FROM anon, authenticated;
GRANT ALL ON public.rental_booking_deposit_slips TO service_role;
