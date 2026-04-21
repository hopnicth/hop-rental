-- ============================================================
-- 013_rental_access_schema.sql
--
-- Add a public rental-access catalog layer with admin-managed
-- product matching, access documents/service/checklist support,
-- and booking snapshot fields rooted at rental_access.
-- ============================================================

-- ─── 1. ENUM TYPES ──────────────────────────────────────────

CREATE TYPE public.rental_access_status AS ENUM ('draft', 'active', 'archived');

CREATE TYPE public.rental_service_cycle_unit AS ENUM ('day', 'week', 'month', 'year');

CREATE TYPE public.rental_access_document_visibility AS ENUM (
  'public',
  'customer_after_booking',
  'internal'
);

CREATE TYPE public.rental_access_document_kind AS ENUM (
  'manual',
  'certificate',
  'brochure',
  'spec_sheet',
  'service_attachment',
  'internal_note',
  'other'
);

CREATE TYPE public.rental_service_event_type AS ENUM (
  'inspection',
  'preventive_maintenance',
  'repair',
  'cleaning',
  'calibration',
  'other'
);

CREATE TYPE public.rental_checklist_kind AS ENUM (
  'pickup',
  'return',
  'inspection',
  'service'
);

CREATE TYPE public.rental_checklist_status AS ENUM (
  'draft',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE public.rental_checklist_item_response_type AS ENUM (
  'check',
  'text',
  'number'
);

CREATE TYPE public.rental_checklist_item_result AS ENUM (
  'pending',
  'passed',
  'failed',
  'not_applicable'
);

CREATE TYPE public.rental_booking_document_type AS ENUM (
  'repair',
  'fine',
  'damage_evidence',
  'handover',
  'other'
);


-- ─── 2. RENTAL ACCESS CATALOG ───────────────────────────────

CREATE TABLE public.rental_accesses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT NOT NULL UNIQUE,
  slug                  TEXT NOT NULL UNIQUE,
  status                public.rental_access_status NOT NULL DEFAULT 'draft',
  name_th               TEXT NOT NULL,
  name_en               TEXT NOT NULL,
  name_cn               TEXT,
  name_jp               TEXT,
  description_th        TEXT NOT NULL,
  description_en        TEXT NOT NULL,
  description_cn        TEXT,
  description_jp        TEXT,
  category_keys         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  brand                 TEXT,
  thumbnail_url         TEXT,
  image_urls            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  spec_summary          JSONB NOT NULL DEFAULT '{}'::JSONB,
  pricing_model         public.rental_pricing_model NOT NULL DEFAULT 'daily',
  currency_code         TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  daily_rate            NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (daily_rate >= 0),
  weekly_rate           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (weekly_rate >= 0),
  monthly_rate          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_rate >= 0),
  deposit_amount        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  min_rental_days       INTEGER NOT NULL DEFAULT 1 CHECK (min_rental_days > 0),
  max_rental_days       INTEGER NOT NULL DEFAULT 0 CHECK (max_rental_days >= 0),
  buffer_days           INTEGER NOT NULL DEFAULT 0 CHECK (buffer_days >= 0),
  storage_location_code TEXT,
  storage_location_note TEXT,
  service_cycle_value   INTEGER NOT NULL DEFAULT 0 CHECK (service_cycle_value >= 0),
  service_cycle_unit    public.rental_service_cycle_unit,
  last_serviced_at      DATE,
  next_service_due_at   DATE,
  view_count            INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  rental_count          INTEGER NOT NULL DEFAULT 0 CHECK (rental_count >= 0),
  last_rented_at        TIMESTAMPTZ,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_hidden             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (char_length(code) > 0),
  CHECK (char_length(slug) > 0),
  CHECK (max_rental_days = 0 OR max_rental_days >= min_rental_days),
  CHECK (jsonb_typeof(spec_summary) = 'object'),
  CHECK (
    (service_cycle_value = 0 AND service_cycle_unit IS NULL)
    OR (service_cycle_value > 0 AND service_cycle_unit IS NOT NULL)
  )
);

COMMENT ON TABLE public.rental_accesses IS 'Public/commercial rental catalog root separated from sale products and raw rental assets.';
COMMENT ON COLUMN public.rental_accesses.code IS 'Stable business code used by staff/admin and snapped into bookings.';
COMMENT ON COLUMN public.rental_accesses.status IS 'Backoffice lifecycle. Only active + not hidden rows are publicly browsable.';
COMMENT ON COLUMN public.rental_accesses.spec_summary IS 'Public-facing summary/spec payload shown on rental access cards/detail surfaces.';
COMMENT ON COLUMN public.rental_accesses.storage_location_code IS 'Simple storage/yard/location code for MVP backoffice operations.';


CREATE TABLE public.rental_access_matches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_access_id UUID NOT NULL REFERENCES public.rental_accesses(id) ON DELETE CASCADE,
  product_id       TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  match_type       TEXT NOT NULL DEFAULT 'compatible',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (rental_access_id, product_id)
);

COMMENT ON TABLE public.rental_access_matches IS 'Admin-managed product-level matching from rental_accesses to products.';
COMMENT ON COLUMN public.rental_access_matches.match_type IS 'Free-form admin label for placement meaning (for example compatible, primary, replacement).';


CREATE TABLE public.rental_access_service_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_access_id     UUID NOT NULL REFERENCES public.rental_accesses(id) ON DELETE CASCADE,
  event_type           public.rental_service_event_type NOT NULL,
  service_date         DATE NOT NULL,
  title                TEXT NOT NULL,
  details              TEXT,
  vendor_name          TEXT,
  performed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cost_amount          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  currency_code        TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  next_due_at          DATE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_access_service_events IS 'Service date list + detailed maintenance/repair history for each rental access.';


CREATE TABLE public.rental_access_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_access_id   UUID NOT NULL REFERENCES public.rental_accesses(id) ON DELETE CASCADE,
  service_event_id   UUID REFERENCES public.rental_access_service_events(id) ON DELETE SET NULL,
  document_kind      public.rental_access_document_kind NOT NULL DEFAULT 'other',
  visibility         public.rental_access_document_visibility NOT NULL DEFAULT 'internal',
  title              TEXT NOT NULL,
  description        TEXT,
  file_url           TEXT NOT NULL,
  file_name          TEXT,
  mime_type          TEXT,
  file_size_bytes    BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  storage_bucket     TEXT,
  storage_path       TEXT,
  is_downloadable    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  issued_at          DATE,
  expires_at         DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at)
);

COMMENT ON TABLE public.rental_access_documents IS 'Access-level document registry for public docs, customer-after-booking docs, and internal files.';
COMMENT ON COLUMN public.rental_access_documents.visibility IS 'public = visible to everyone, customer_after_booking = visible to customers with a booking, internal = backoffice only.';


CREATE TABLE public.rental_access_checklist_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_access_id UUID NOT NULL REFERENCES public.rental_accesses(id) ON DELETE CASCADE,
  kind             public.rental_checklist_kind NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (rental_access_id, kind, name, version)
);

COMMENT ON TABLE public.rental_access_checklist_templates IS 'Reusable admin-created checklist templates for pickup, return, inspection, and service workflows.';


CREATE TABLE public.rental_access_checklist_template_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES public.rental_access_checklist_templates(id) ON DELETE CASCADE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  label          TEXT NOT NULL,
  instruction    TEXT,
  response_type  public.rental_checklist_item_response_type NOT NULL DEFAULT 'check',
  is_required    BOOLEAN NOT NULL DEFAULT TRUE,
  photo_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_access_checklist_template_items IS 'Checklist item definitions under each rental access checklist template.';


-- ─── 3. BOOKING SNAPSHOT EXTENSION ──────────────────────────

ALTER TABLE public.rental_bookings
  ADD COLUMN rental_access_id UUID REFERENCES public.rental_accesses(id) ON DELETE RESTRICT,
  ADD COLUMN rental_access_code TEXT,
  ADD COLUMN rental_access_slug TEXT,
  ADD COLUMN rental_access_name TEXT,
  ADD COLUMN rental_access_thumbnail TEXT,
  ADD COLUMN rental_access_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN matched_product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN matched_product_name TEXT,
  ADD CONSTRAINT rental_bookings_rental_access_snapshot_object_check
    CHECK (jsonb_typeof(rental_access_snapshot) = 'object');

UPDATE public.rental_bookings
SET
  matched_product_id = COALESCE(matched_product_id, product_id),
  matched_product_name = COALESCE(matched_product_name, product_name)
WHERE matched_product_id IS NULL
   OR matched_product_name IS NULL;

COMMENT ON COLUMN public.rental_bookings.rental_access_id IS 'Future booking root. Nullable during migration so legacy product/SKU-rooted rows remain valid.';
COMMENT ON COLUMN public.rental_bookings.rental_access_code IS 'Snapshot of rental access business code at booking time.';
COMMENT ON COLUMN public.rental_bookings.rental_access_name IS 'Snapshot of rental access name shown to the customer at booking time.';
COMMENT ON COLUMN public.rental_bookings.rental_access_snapshot IS 'JSONB snapshot of access-facing fields for history and analytics even if the source access changes later.';
COMMENT ON COLUMN public.rental_bookings.matched_product_id IS 'Product attribution for the journey that led to the booking, separate from rental_access identity.';


-- ─── 4. BOOKING-LEVEL OPS TABLES ────────────────────────────

CREATE TABLE public.rental_booking_checklists (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  rental_access_id     UUID NOT NULL REFERENCES public.rental_accesses(id) ON DELETE RESTRICT,
  template_id          UUID REFERENCES public.rental_access_checklist_templates(id) ON DELETE SET NULL,
  kind                 public.rental_checklist_kind NOT NULL,
  template_name        TEXT,
  template_version     INTEGER CHECK (template_version IS NULL OR template_version >= 1),
  status               public.rental_checklist_status NOT NULL DEFAULT 'draft',
  performed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

COMMENT ON TABLE public.rental_booking_checklists IS 'Booking-linked checklist executions instantiated from rental access templates.';


CREATE TABLE public.rental_booking_checklist_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_checklist_id UUID NOT NULL REFERENCES public.rental_booking_checklists(id) ON DELETE CASCADE,
  template_item_id     UUID REFERENCES public.rental_access_checklist_template_items(id) ON DELETE SET NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  label                TEXT NOT NULL,
  instruction          TEXT,
  response_type        public.rental_checklist_item_response_type NOT NULL DEFAULT 'check',
  is_required          BOOLEAN NOT NULL DEFAULT TRUE,
  result_status        public.rental_checklist_item_result NOT NULL DEFAULT 'pending',
  checked              BOOLEAN,
  response_text        TEXT,
  response_number      NUMERIC(12,2),
  photo_urls           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  remark               TEXT,
  checked_at           TIMESTAMPTZ,
  checked_by_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_booking_checklist_items IS 'Execution rows for staff tick/remark state during pickup, return, inspection, and service checklists.';


CREATE TABLE public.rental_booking_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  booking_checklist_id UUID REFERENCES public.rental_booking_checklists(id) ON DELETE SET NULL,
  rental_access_id     UUID REFERENCES public.rental_accesses(id) ON DELETE SET NULL,
  document_type        public.rental_booking_document_type NOT NULL DEFAULT 'other',
  visibility           public.rental_access_document_visibility NOT NULL DEFAULT 'internal',
  title                TEXT NOT NULL,
  description          TEXT,
  file_url             TEXT NOT NULL,
  file_name            TEXT,
  mime_type            TEXT,
  file_size_bytes      BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  amount               NUMERIC(12,2) CHECK (amount IS NULL OR amount >= 0),
  currency_code        TEXT NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  issued_at            DATE,
  created_by_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_booking_documents IS 'Booking-specific documents such as damage evidence, repair records, handover files, and fine documents.';


-- ─── 5. INDEXES ─────────────────────────────────────────────

CREATE INDEX idx_rental_accesses_status_hidden_sort
  ON public.rental_accesses(status, is_hidden, sort_order, created_at DESC);

CREATE INDEX idx_rental_accesses_last_rented_at
  ON public.rental_accesses(last_rented_at DESC);

CREATE INDEX idx_rental_access_matches_product_sort
  ON public.rental_access_matches(product_id, sort_order, rental_access_id);

CREATE INDEX idx_rental_access_matches_access_sort
  ON public.rental_access_matches(rental_access_id, sort_order, product_id);

CREATE INDEX idx_rental_access_service_events_access_date
  ON public.rental_access_service_events(rental_access_id, service_date DESC);

CREATE INDEX idx_rental_access_documents_access_visibility_sort
  ON public.rental_access_documents(rental_access_id, visibility, sort_order);

CREATE INDEX idx_rental_access_documents_service_event
  ON public.rental_access_documents(service_event_id);

CREATE INDEX idx_rental_access_checklist_templates_access_kind
  ON public.rental_access_checklist_templates(rental_access_id, kind, is_active, sort_order);

CREATE INDEX idx_rental_access_checklist_template_items_template_sort
  ON public.rental_access_checklist_template_items(template_id, sort_order);

CREATE INDEX idx_rental_bookings_access_status_period
  ON public.rental_bookings(rental_access_id, status, start_date, end_date);

CREATE INDEX idx_rental_bookings_matched_product_created
  ON public.rental_bookings(matched_product_id, created_at DESC);

CREATE INDEX idx_rental_booking_checklists_booking_kind_status
  ON public.rental_booking_checklists(booking_id, kind, status);

CREATE INDEX idx_rental_booking_checklist_items_checklist_sort
  ON public.rental_booking_checklist_items(booking_checklist_id, sort_order);

CREATE INDEX idx_rental_booking_documents_booking_visibility_created
  ON public.rental_booking_documents(booking_id, visibility, created_at DESC);


-- ─── 6. UPDATED_AT TRIGGERS ─────────────────────────────────

CREATE TRIGGER set_rental_accesses_updated_at
  BEFORE UPDATE ON public.rental_accesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_access_matches_updated_at
  BEFORE UPDATE ON public.rental_access_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_access_service_events_updated_at
  BEFORE UPDATE ON public.rental_access_service_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_access_documents_updated_at
  BEFORE UPDATE ON public.rental_access_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_access_checklist_templates_updated_at
  BEFORE UPDATE ON public.rental_access_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_access_checklist_template_items_updated_at
  BEFORE UPDATE ON public.rental_access_checklist_template_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_booking_checklists_updated_at
  BEFORE UPDATE ON public.rental_booking_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_booking_checklist_items_updated_at
  BEFORE UPDATE ON public.rental_booking_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_booking_documents_updated_at
  BEFORE UPDATE ON public.rental_booking_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ─── 7. ROW LEVEL SECURITY ─────────────────────────────────

ALTER TABLE public.rental_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_access_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_access_service_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_access_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_access_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_access_checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_booking_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_booking_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_booking_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_accesses_select_public"
  ON public.rental_accesses FOR SELECT
  USING (status = 'active' AND is_hidden = FALSE);

CREATE POLICY "rental_access_matches_select_public"
  ON public.rental_access_matches FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rental_accesses ra
      WHERE ra.id = rental_access_matches.rental_access_id
        AND ra.status = 'active'
        AND ra.is_hidden = FALSE
    )
    AND EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = rental_access_matches.product_id
        AND p.is_hidden = FALSE
    )
  );

CREATE POLICY "rental_access_documents_select_public_or_customer"
  ON public.rental_access_documents FOR SELECT
  USING (
    (
      visibility = 'public'
      AND EXISTS (
        SELECT 1
        FROM public.rental_accesses ra
        WHERE ra.id = rental_access_documents.rental_access_id
          AND ra.status = 'active'
          AND ra.is_hidden = FALSE
      )
    )
    OR (
      visibility = 'customer_after_booking'
      AND auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.rental_bookings rb
        WHERE rb.rental_access_id = rental_access_documents.rental_access_id
          AND rb.user_id = auth.uid()
          AND rb.status <> 'cancelled'
      )
    )
  );

CREATE POLICY "rental_booking_documents_select_own_visible"
  ON public.rental_booking_documents FOR SELECT
  USING (
    visibility <> 'internal'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.rental_bookings rb
      WHERE rb.id = rental_booking_documents.booking_id
        AND rb.user_id = auth.uid()
    )
  );