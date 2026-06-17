-- ============================================================
-- 115_manual_payment_requests.sql
--
-- Scope:
--   * Central "manual payment request" model created from checkout. ONE request
--     represents one amount the customer transfers now; it allocates across the
--     sale order and/or rental booking deposit(s) it pays for, and stores ONE
--     slip-evidence trail.
--   * Tables:
--       public.manual_payment_requests        — the request/draft (header)
--       public.manual_payment_request_items    — allocation rows (what it pays)
--       public.manual_payment_request_slips     — central slip evidence
--   * Private bucket: manual-payment-slips (public = FALSE).
--   * RLS: service_role only — all reads/writes go through route-authenticated
--     server APIs (service-role client); customer ownership is enforced in app
--     code; admin slip downloads use short-lived signed URLs.
--
-- Key design decisions:
--   * This is ADDITIVE. It does NOT replace sale_order_payment_slips (mig 114) or
--     rental_booking_deposit_slips (mig 113); it sits above the sale order /
--     rental booking targets as the central customer payment surface.
--   * EVIDENCE ONLY. Creating a request never marks an order paid, never confirms
--     a booking, never deducts inventory, never writes a rental held-balance event,
--     never touches Omise/KYC. Uploading a slip moves the request to pending_review
--     for manual admin review; admin still confirms the sale/booking via the
--     EXISTING admin actions (Mark Payment Received / Mark Deposit Received).
--   * Booking Deposit allocation amounts are a partial-refundable security deposit,
--     not rental revenue and not a VAT point — consistent with mig 113.
--   * Slip files are PII/financial -> private bucket only, signed-URL access only.
--     NEVER catalog-media; NEVER a permanent public URL.
--   * No accounting/invoice/receipt/VAT automation here. No audit-events table
--     (deferred to keep scope focused).
-- ============================================================

-- ── 1. Private bucket ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'manual-payment-slips',
  'manual-payment-slips',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Request header table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.manual_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('sale_only', 'booking_only', 'mixed')),
  status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'pending_review', 'reviewed', 'rejected', 'cancelled')),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  currency TEXT NOT NULL DEFAULT 'THB',
  total_amount_due NUMERIC(12, 2) NOT NULL CHECK (total_amount_due > 0),
  customer_note TEXT NULL,
  admin_note TEXT NULL,
  submitted_at TIMESTAMPTZ NULL,
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by UUID NULL,
  rejected_at TIMESTAMPTZ NULL,
  rejected_by UUID NULL,
  rejected_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.manual_payment_requests IS
  'Central manual bank-transfer payment request created from checkout. ONE amount due now allocated (manual_payment_request_items) across a sale order and/or rental booking deposit(s). Evidence-only: never marks an order paid / confirms a booking / deducts inventory / writes a held-balance event / touches Omise/KYC. Status awaiting_payment -> pending_review (slip uploaded) -> reviewed | rejected; cancelled is customer-initiated before upload.';
COMMENT ON COLUMN public.manual_payment_requests.total_amount_due IS
  'Authoritative amount due now (sale order grand total + booking deposit allocations). Computed server-side from the targets, never trusted from the client.';

-- ── 3. Allocation items table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.manual_payment_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID NOT NULL
    REFERENCES public.manual_payment_requests(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('sale_order', 'rental_booking_deposit')),
  target_id UUID NOT NULL,
  amount_due NUMERIC(12, 2) NOT NULL CHECK (amount_due > 0),
  label TEXT NOT NULL,
  description TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.manual_payment_request_items IS
  'What ONE payment request pays for. sale_only -> 1 sale_order item; booking_only -> 1+ rental_booking_deposit item(s); mixed -> sale_order item + booking deposit item(s). Sum of amount_due equals the request total_amount_due.';

-- ── 4. Central slip evidence table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.manual_payment_request_slips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID NOT NULL
    REFERENCES public.manual_payment_requests(id) ON DELETE CASCADE,
  storage_bucket TEXT NOT NULL DEFAULT 'manual-payment-slips',
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
  sha256_hash TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'reviewed', 'rejected')),
  uploaded_by UUID NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,
  rejected_by UUID NULL,
  rejected_at TIMESTAMPTZ NULL,
  rejected_reason TEXT NULL
);

COMMENT ON TABLE public.manual_payment_request_slips IS
  'Central bank-transfer slip evidence for a manual_payment_requests row. Private (PII) — files live only in the private manual-payment-slips bucket and are served via short-lived signed URLs through route-authenticated server APIs. Uploading evidence never marks an order paid / confirms a booking; admin advances state.';
COMMENT ON COLUMN public.manual_payment_request_slips.storage_bucket IS
  'Always the private manual-payment-slips bucket. Never catalog-media.';

-- ── 5. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_mpr_customer_status_created
  ON public.manual_payment_requests(customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpr_status_created
  ON public.manual_payment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpr_items_request
  ON public.manual_payment_request_items(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_mpr_items_target
  ON public.manual_payment_request_items(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_mpr_slips_request_uploaded
  ON public.manual_payment_request_slips(payment_request_id, uploaded_at DESC);

-- ── 6. updated_at trigger on the header ────────────────────────────────────────

DROP TRIGGER IF EXISTS set_manual_payment_requests_updated_at
  ON public.manual_payment_requests;
CREATE TRIGGER set_manual_payment_requests_updated_at
  BEFORE UPDATE ON public.manual_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 7. RLS — service_role only (level 2 pattern; mirrors 113/114) ──────────────

ALTER TABLE public.manual_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payment_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payment_request_slips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manual_payment_requests_service_role_all"
  ON public.manual_payment_requests;
CREATE POLICY "manual_payment_requests_service_role_all"
  ON public.manual_payment_requests FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "manual_payment_request_items_service_role_all"
  ON public.manual_payment_request_items;
CREATE POLICY "manual_payment_request_items_service_role_all"
  ON public.manual_payment_request_items FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "manual_payment_request_slips_service_role_all"
  ON public.manual_payment_request_slips;
CREATE POLICY "manual_payment_request_slips_service_role_all"
  ON public.manual_payment_request_slips FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

REVOKE ALL ON public.manual_payment_requests FROM anon, authenticated;
REVOKE ALL ON public.manual_payment_request_items FROM anon, authenticated;
REVOKE ALL ON public.manual_payment_request_slips FROM anon, authenticated;
GRANT ALL ON public.manual_payment_requests TO service_role;
GRANT ALL ON public.manual_payment_request_items TO service_role;
GRANT ALL ON public.manual_payment_request_slips TO service_role;

-- ── 8. Assertions (fail the migration early if the contract drifts) ────────────

DO $$
BEGIN
  -- bucket exists and is private
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'manual-payment-slips' AND public = FALSE
  ) THEN
    RAISE EXCEPTION 'manual-payment-slips bucket missing or not private';
  END IF;

  -- RLS enabled on all three tables
  IF NOT (
    SELECT bool_and(relrowsecurity)
    FROM pg_class
    WHERE relname IN (
      'manual_payment_requests',
      'manual_payment_request_items',
      'manual_payment_request_slips'
    )
    AND relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on all manual_payment_request tables';
  END IF;

  -- no direct anon/authenticated privileges on the header
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'manual_payment_requests'
      AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'anon/authenticated still hold grants on manual_payment_requests';
  END IF;
END $$;
