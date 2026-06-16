-- ============================================================
-- 114_sale_order_payment_slip_storage.sql
--
-- Scope:
--   * Private storage foundation for customer-uploaded bank-transfer
--     SALE ORDER payment slip evidence (manual bank transfer at launch).
--   * Private bucket: sale-order-payment-slips (public = FALSE).
--   * Metadata table: public.sale_order_payment_slips (FK -> public.orders).
--   * RLS: service_role only. No anon/authenticated direct access. All
--     reads/writes go through route-authenticated server APIs that use the
--     service-role client; downloads use short-lived signed URLs.
--
-- Key design decisions:
--   * SALE payment slips are SEPARATE from rental deposit slips. This table is
--     NOT rental_booking_deposit_slips and this bucket is NOT rental-deposit-slips.
--     Sale payment is an order payment, not a rental held-balance liability.
--   * Bank slips contain personal/financial PII -> private bucket only
--     (mirrors 113_rental_deposit_slip_storage / 072_kyc_documents_private_bucket).
--     NEVER catalog-media; NEVER a permanent public URL.
--   * Uploading a slip is evidence only — it never marks the order paid and
--     never deducts inventory. Admin "Mark Payment Received" does that through
--     the existing order payment model + f_apply_order_inventory RPC.
--   * The slip row is mutable on REVIEW fields only (status / reviewed_by /
--     reviewed_at / review_note); not append-only, so no block-mutation trigger.
--
-- Out of scope (explicitly NOT done here):
--   * No order-status schema change (orders already support awaiting_payment).
--   * No rental_held_balance_events / rental_payment_events.
--   * No VAT/revenue logic (none exists for sale orders).
--   * No Omise / payment_attempts changes.
-- ============================================================

-- ── 1. Private bucket ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sale-order-payment-slips',
  'sale-order-payment-slips',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Metadata table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sale_order_payment_slips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL
    REFERENCES public.orders(id) ON DELETE RESTRICT,
  uploaded_by UUID NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'sale-order-payment-slips',
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

COMMENT ON TABLE public.sale_order_payment_slips IS
  'Customer-uploaded bank-transfer SALE ORDER payment slip evidence. Private (PII) — files live in the private sale-order-payment-slips bucket and are served only via short-lived signed URLs through route-authenticated server APIs. Uploading evidence never marks the order paid and never deducts inventory; admin marks payment received via the existing order payment model.';
COMMENT ON COLUMN public.sale_order_payment_slips.status IS
  'pending_review (default on upload) -> reviewed | rejected. Set by admin during manual review. Basic status storage only.';
COMMENT ON COLUMN public.sale_order_payment_slips.storage_bucket IS
  'Always the private sale-order-payment-slips bucket. Never catalog-media.';

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sale_order_payment_slips_order
  ON public.sale_order_payment_slips(order_id);

CREATE INDEX IF NOT EXISTS idx_sale_order_payment_slips_uploaded_by
  ON public.sale_order_payment_slips(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_sale_order_payment_slips_status
  ON public.sale_order_payment_slips(status);

CREATE INDEX IF NOT EXISTS idx_sale_order_payment_slips_uploaded_at
  ON public.sale_order_payment_slips(uploaded_at DESC);

-- ── 4. RLS — service_role only (level 2 pattern; mirrors 086/113) ─────────────

ALTER TABLE public.sale_order_payment_slips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_order_payment_slips_service_role_all"
  ON public.sale_order_payment_slips;
CREATE POLICY "sale_order_payment_slips_service_role_all"
  ON public.sale_order_payment_slips FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON public.sale_order_payment_slips FROM anon, authenticated;
GRANT ALL ON public.sale_order_payment_slips TO service_role;
