-- 091: POS document issuance task tracking foundation — Phase 2C-A1.
-- Adds public.pos_document_issuance_tasks for durable tracking of best-effort
-- document preparation after payment finalization.
-- Scope: schema foundation only. No runtime issuance, no endpoint changes,
-- no shared finalizer, no UI, no QR changes, no tax logic.
--
-- Canonical document source linkage (locked):
--   official_documents.source_type = 'rental_held_balance_event'
--   official_documents.source_id   = rental_held_balance_events.id::text
--
-- Future document type to be issued:
--   document_type = 'rental_booking_deposit_confirmation'
--   Customer-facing name: "เอกสารยืนยันการรับเงินมัดจำการจอง"
--   Sequence prefix (runtime): BDC  → e.g. BDC-202506-0001
--   Template key (runtime): rental_booking_deposit_confirmation_v1
--   NOTE: document_sequences rows are created automatically by f_next_document_number()
--   on first issuance call. No seed row is required in this migration.

CREATE TABLE IF NOT EXISTS public.pos_document_issuance_tasks (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What document type this task will issue
  document_type         TEXT          NOT NULL,

  -- Which rental booking this task belongs to (for Booking Detail queries)
  rental_booking_id     UUID          NOT NULL
    REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,

  -- The canonical financial event this document will evidence.
  -- UUID FK (not TEXT soft-reference) because this is a direct, non-polymorphic
  -- relationship: every task row targets exactly one held-balance event.
  -- ON DELETE RESTRICT: the held-balance event must not be deleted while a
  -- task references it. (rental_held_balance_events are already non-deletable
  -- by trigger, so this is belt-and-suspenders.)
  held_balance_event_id UUID          NOT NULL
    REFERENCES public.rental_held_balance_events(id) ON DELETE RESTRICT,

  -- Payment source that triggered the held-balance event.
  -- Stored as soft TEXT references (source_type / source_id pattern) because
  -- cash and QR use different payment attempt tables. This follows the same
  -- polymorphic pattern used elsewhere in this repo.
  payment_source_type   TEXT          NOT NULL,
  payment_source_id     TEXT          NOT NULL,

  -- Issuance task status lifecycle: pending → issued | failed
  -- pending : created after payment confirmation; document not yet prepared
  -- issued  : official_documents row successfully created; official_document_id is set
  -- failed  : document preparation failed; retryable; error fields are set
  status                TEXT          NOT NULL DEFAULT 'pending',

  -- Set once issuance succeeds; NULL while pending or failed
  official_document_id  UUID
    REFERENCES public.official_documents(id) ON DELETE SET NULL,

  -- Failure tracking (non-null when status = 'failed')
  error_code            TEXT,
  error_message         TEXT,

  -- Retry tracking
  attempt_count         INTEGER       NOT NULL DEFAULT 0,
  last_attempted_at     TIMESTAMPTZ,

  -- Convenience timestamp for issued documents (mirrors official_documents.issued_at
  -- denormalized here so the task row is self-contained for workspace queries)
  issued_at             TIMESTAMPTZ,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- One task per held-balance event per document type.
  -- Retry updates the same row; never creates a duplicate.
  UNIQUE (held_balance_event_id, document_type),

  CHECK (status IN ('pending', 'issued', 'failed')),
  CHECK (char_length(trim(document_type)) > 0),
  CHECK (char_length(trim(payment_source_type)) > 0),
  CHECK (char_length(trim(payment_source_id)) > 0),
  CHECK (attempt_count >= 0)
);

COMMENT ON TABLE public.pos_document_issuance_tasks IS
  'POS V3 Phase 2C: durable tracking for best-effort document preparation after Booking Deposit payment confirmation. One row per held-balance event per document type. official_documents remains the canonical issued-document registry.';

COMMENT ON COLUMN public.pos_document_issuance_tasks.held_balance_event_id IS
  'UUID FK to rental_held_balance_events: the canonical financial event this document will evidence. Non-polymorphic direct reference; UUID typed (not TEXT soft-reference).';

COMMENT ON COLUMN public.pos_document_issuance_tasks.payment_source_type IS
  'Polymorphic source type for the payment attempt (e.g. pos_rental_payment_attempt). TEXT soft-reference supports cash and future QR without requiring a single payment attempt table.';

COMMENT ON COLUMN public.pos_document_issuance_tasks.status IS
  'pending = document not yet prepared. issued = official_documents row created successfully. failed = preparation failed; retryable.';

COMMENT ON COLUMN public.pos_document_issuance_tasks.official_document_id IS
  'Set once issuance succeeds. NULL while pending or failed. official_documents is canonical; this FK is a convenience link.';

COMMENT ON COLUMN public.pos_document_issuance_tasks.issued_at IS
  'Denormalized issue timestamp for workspace queries without joining official_documents. Set when status transitions to issued.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary lookup for Booking Detail document section
CREATE INDEX IF NOT EXISTS idx_pos_document_issuance_tasks_booking
  ON public.pos_document_issuance_tasks(rental_booking_id, created_at DESC);

-- POS V3 Documents workspace: filter by status (failed → retry list, issued → history)
CREATE INDEX IF NOT EXISTS idx_pos_document_issuance_tasks_status
  ON public.pos_document_issuance_tasks(status, created_at DESC);

-- Navigate from official_documents back to the issuance task
CREATE INDEX IF NOT EXISTS idx_pos_document_issuance_tasks_official_document
  ON public.pos_document_issuance_tasks(official_document_id)
  WHERE official_document_id IS NOT NULL;

-- ── updated_at trigger ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_pos_document_issuance_tasks_updated_at
  ON public.pos_document_issuance_tasks;
CREATE TRIGGER set_pos_document_issuance_tasks_updated_at
  BEFORE UPDATE ON public.pos_document_issuance_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Row-level security ────────────────────────────────────────────────────────

ALTER TABLE public.pos_document_issuance_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_document_issuance_tasks_service_role_all"
  ON public.pos_document_issuance_tasks;
CREATE POLICY "pos_document_issuance_tasks_service_role_all"
  ON public.pos_document_issuance_tasks FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON public.pos_document_issuance_tasks FROM anon, authenticated;
GRANT ALL ON public.pos_document_issuance_tasks TO service_role;
