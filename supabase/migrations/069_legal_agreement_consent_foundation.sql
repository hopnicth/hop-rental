-- 069: Legal agreement versioning and consent acceptance foundation
--
-- Adds immutable legal agreement versions, non-deletable consent acceptance logs,
-- optional evidence files for Admin/POS assisted flows, and service-role-only RLS.
-- No UI/API implementation is included in this batch.

-- ── 1. agreement_versions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agreement_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_type TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  content_format TEXT NOT NULL DEFAULT 'markdown',
  content_body TEXT NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  rendered_text_hash TEXT NOT NULL DEFAULT '',
  effective_from TIMESTAMPTZ,
  effective_until TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  retired_at TIMESTAMPTZ,
  retired_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  replaces_version_id UUID REFERENCES public.agreement_versions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (agreement_type IN (
    'terms_of_service',
    'privacy_policy',
    'rental_agreement',
    'damage_loss_policy',
    'damage_protection_terms',
    'kyc_consent'
  )),
  CHECK (status IN ('draft', 'published', 'retired')),
  CHECK (content_format IN ('markdown', 'html')),
  CHECK (char_length(trim(version)) > 0),
  CHECK (char_length(trim(title)) > 0),
  CHECK (char_length(trim(content_body)) > 0),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
  CHECK (
    status = 'draft'
    OR (
      effective_from IS NOT NULL
      AND published_at IS NOT NULL
      AND published_by IS NOT NULL
      AND char_length(trim(content_hash)) > 0
      AND char_length(trim(rendered_text_hash)) > 0
    )
  ),
  CHECK (
    status <> 'retired'
    OR (effective_until IS NOT NULL AND retired_at IS NOT NULL AND retired_by IS NOT NULL)
  ),
  UNIQUE (agreement_type, version)
);

COMMENT ON TABLE public.agreement_versions IS
  'Versioned legal agreements. Published/retired content is immutable; create a new version for wording changes.';

CREATE INDEX IF NOT EXISTS idx_agreement_versions_type_status_effective
  ON public.agreement_versions(agreement_type, status, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_agreement_versions_status_effective
  ON public.agreement_versions(status, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_agreement_versions_replaces
  ON public.agreement_versions(replaces_version_id)
  WHERE replaces_version_id IS NOT NULL;

-- ── 2. agreement_versions guards ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.validate_agreement_version_state();
CREATE FUNCTION public.validate_agreement_version_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_overlap BOOLEAN;
BEGIN
  IF NEW.status = 'published' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.agreement_versions av
      WHERE av.id <> NEW.id
        AND av.agreement_type = NEW.agreement_type
        AND av.status = 'published'
        AND tstzrange(av.effective_from, COALESCE(av.effective_until, 'infinity'::timestamptz), '[)')
          && tstzrange(NEW.effective_from, COALESCE(NEW.effective_until, 'infinity'::timestamptz), '[)')
    ) INTO v_has_overlap;

    IF v_has_overlap THEN
      RAISE EXCEPTION 'published agreement version window overlaps for type %', NEW.agreement_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.guard_agreement_version_finalized_updates();
CREATE FUNCTION public.guard_agreement_version_finalized_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.agreement_type IS DISTINCT FROM OLD.agreement_type
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.content_format IS DISTINCT FROM OLD.content_format
      OR NEW.content_body IS DISTINCT FROM OLD.content_body
      OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
      OR NEW.rendered_text_hash IS DISTINCT FROM OLD.rendered_text_hash
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
      OR NEW.published_by IS DISTINCT FROM OLD.published_by
      OR NEW.replaces_version_id IS DISTINCT FROM OLD.replaces_version_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'published agreement version content and identity are immutable';
    END IF;

    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'finalized agreement version cannot return to draft';
    END IF;

    IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
      RAISE EXCEPTION 'retired agreement version cannot be republished';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.guard_agreement_version_finalized_delete();
CREATE FUNCTION public.guard_agreement_version_finalized_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'published or retired agreement versions cannot be deleted';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS validate_agreement_version_state ON public.agreement_versions;
CREATE TRIGGER validate_agreement_version_state
  BEFORE INSERT OR UPDATE ON public.agreement_versions
  FOR EACH ROW EXECUTE FUNCTION public.validate_agreement_version_state();

DROP TRIGGER IF EXISTS guard_agreement_version_finalized_updates ON public.agreement_versions;
CREATE TRIGGER guard_agreement_version_finalized_updates
  BEFORE UPDATE ON public.agreement_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_agreement_version_finalized_updates();

DROP TRIGGER IF EXISTS guard_agreement_version_finalized_delete ON public.agreement_versions;
CREATE TRIGGER guard_agreement_version_finalized_delete
  BEFORE DELETE ON public.agreement_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_agreement_version_finalized_delete();

DROP TRIGGER IF EXISTS set_agreement_versions_updated_at ON public.agreement_versions;
CREATE TRIGGER set_agreement_versions_updated_at
  BEFORE UPDATE ON public.agreement_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 3. agreement_acceptance_logs ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agreement_acceptance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_version_id UUID NOT NULL REFERENCES public.agreement_versions(id) ON DELETE RESTRICT,
  agreement_type TEXT NOT NULL,
  agreement_version TEXT NOT NULL,
  agreement_title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  rendered_text_hash TEXT NOT NULL,
  customer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  walk_in_phone TEXT REFERENCES public.walk_in_customers(phone) ON UPDATE CASCADE ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.rental_bookings(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  official_document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  accepted_channel TEXT NOT NULL,
  consent_action TEXT NOT NULL,
  customer_confirmation_method TEXT NOT NULL DEFAULT 'web_checkbox',
  staff_remark TEXT NOT NULL DEFAULT '',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'accepted',
  status_reason TEXT NOT NULL DEFAULT '',
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  correction_of_acceptance_id UUID REFERENCES public.agreement_acceptance_logs(id) ON DELETE SET NULL,
  request_id TEXT,
  session_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (agreement_type IN (
    'terms_of_service',
    'privacy_policy',
    'rental_agreement',
    'damage_loss_policy',
    'damage_protection_terms',
    'kyc_consent'
  )),
  CHECK (char_length(trim(agreement_version)) > 0),
  CHECK (char_length(trim(agreement_title)) > 0),
  CHECK (char_length(trim(content_hash)) > 0),
  CHECK (char_length(trim(rendered_text_hash)) > 0),
  CHECK (char_length(trim(source_type)) > 0),
  CHECK (accepted_channel IN ('web', 'admin_pos', 'staff_assisted', 'line', 'email', 'paper', 'phone', 'imported')),
  CHECK (consent_action IN ('checkbox', 'button_click', 'signature', 'staff_attestation', 'imported')),
  CHECK (customer_confirmation_method IN (
    'web_checkbox',
    'walk_in_verbal',
    'signed_paper',
    'line',
    'email',
    'phone',
    'staff_attestation',
    'imported',
    'other'
  )),
  CHECK (status IN ('accepted', 'revoked', 'cancelled', 'corrected')),
  CHECK (jsonb_typeof(evidence_snapshot) = 'object'),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (customer_user_id IS NOT NULL OR walk_in_phone IS NOT NULL OR company_id IS NOT NULL),
  CHECK (
    accepted_channel <> 'web'
    OR (ip_address IS NOT NULL AND char_length(trim(coalesce(user_agent, ''))) > 0)
  ),
  CHECK (
    accepted_channel NOT IN ('admin_pos', 'staff_assisted')
    OR (
      staff_user_id IS NOT NULL
      AND char_length(trim(staff_remark)) > 0
      AND customer_confirmation_method IN ('walk_in_verbal', 'signed_paper', 'line', 'email', 'phone', 'staff_attestation', 'other')
    )
  ),
  CHECK (
    status = 'accepted'
    OR (
      status_changed_at IS NOT NULL
      AND status_changed_by IS NOT NULL
      AND char_length(trim(status_reason)) > 0
    )
  )
);

COMMENT ON TABLE public.agreement_acceptance_logs IS
  'Non-deletable proof that a customer or walk-in customer accepted a specific legal agreement version in a specific context.';

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_user_created
  ON public.agreement_acceptance_logs(customer_user_id, accepted_at DESC)
  WHERE customer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_walk_in_created
  ON public.agreement_acceptance_logs(walk_in_phone, accepted_at DESC)
  WHERE walk_in_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_company_created
  ON public.agreement_acceptance_logs(company_id, accepted_at DESC)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_booking_type
  ON public.agreement_acceptance_logs(booking_id, agreement_type, accepted_at DESC)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_order_type
  ON public.agreement_acceptance_logs(order_id, agreement_type, accepted_at DESC)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_document_type
  ON public.agreement_acceptance_logs(official_document_id, agreement_type, accepted_at DESC)
  WHERE official_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_type_version_created
  ON public.agreement_acceptance_logs(agreement_type, agreement_version, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_staff_created
  ON public.agreement_acceptance_logs(staff_user_id, accepted_at DESC)
  WHERE staff_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_status_created
  ON public.agreement_acceptance_logs(status, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_correction
  ON public.agreement_acceptance_logs(correction_of_acceptance_id)
  WHERE correction_of_acceptance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_idempotency_user
  ON public.agreement_acceptance_logs(agreement_version_id, source_type, source_id, customer_user_id)
  WHERE source_id IS NOT NULL AND customer_user_id IS NOT NULL AND status = 'accepted';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_idempotency_walk_in
  ON public.agreement_acceptance_logs(agreement_version_id, source_type, source_id, walk_in_phone)
  WHERE source_id IS NOT NULL AND walk_in_phone IS NOT NULL AND status = 'accepted';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agreement_acceptance_logs_idempotency_company
  ON public.agreement_acceptance_logs(agreement_version_id, source_type, source_id, company_id)
  WHERE source_id IS NOT NULL AND company_id IS NOT NULL AND status = 'accepted';

-- ── 4. agreement_acceptance_logs guards ──────────────────────────────────────

DROP FUNCTION IF EXISTS public.validate_agreement_acceptance_version_snapshot();
CREATE FUNCTION public.validate_agreement_acceptance_version_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_version public.agreement_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_version
  FROM public.agreement_versions
  WHERE id = NEW.agreement_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agreement version % not found', NEW.agreement_version_id;
  END IF;

  IF v_version.status NOT IN ('published', 'retired') THEN
    RAISE EXCEPTION 'agreement acceptance cannot reference draft agreement version %', NEW.agreement_version_id;
  END IF;

  IF NEW.agreement_type IS DISTINCT FROM v_version.agreement_type
    OR NEW.agreement_version IS DISTINCT FROM v_version.version
    OR NEW.agreement_title IS DISTINCT FROM v_version.title
    OR NEW.content_hash IS DISTINCT FROM v_version.content_hash
    OR NEW.rendered_text_hash IS DISTINCT FROM v_version.rendered_text_hash THEN
    RAISE EXCEPTION 'agreement acceptance snapshot does not match referenced agreement version';
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.guard_agreement_acceptance_log_updates();
CREATE FUNCTION public.guard_agreement_acceptance_log_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.agreement_version_id IS DISTINCT FROM OLD.agreement_version_id
    OR NEW.agreement_type IS DISTINCT FROM OLD.agreement_type
    OR NEW.agreement_version IS DISTINCT FROM OLD.agreement_version
    OR NEW.agreement_title IS DISTINCT FROM OLD.agreement_title
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.rendered_text_hash IS DISTINCT FROM OLD.rendered_text_hash
    OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
    OR NEW.walk_in_phone IS DISTINCT FROM OLD.walk_in_phone
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
    OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.official_document_id IS DISTINCT FROM OLD.official_document_id
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.accepted_channel IS DISTINCT FROM OLD.accepted_channel
    OR NEW.consent_action IS DISTINCT FROM OLD.consent_action
    OR NEW.customer_confirmation_method IS DISTINCT FROM OLD.customer_confirmation_method
    OR NEW.staff_remark IS DISTINCT FROM OLD.staff_remark
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
    OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
    OR NEW.staff_user_id IS DISTINCT FROM OLD.staff_user_id
    OR NEW.evidence_snapshot IS DISTINCT FROM OLD.evidence_snapshot
    OR NEW.correction_of_acceptance_id IS DISTINCT FROM OLD.correction_of_acceptance_id
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.session_id IS DISTINCT FROM OLD.session_id
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'agreement acceptance evidence is immutable; only status fields may change';
  END IF;

  IF OLD.status <> 'accepted' AND NEW.status = 'accepted' THEN
    RAISE EXCEPTION 'revoked, cancelled, or corrected acceptance logs cannot return to accepted';
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.prevent_agreement_acceptance_log_delete();
CREATE FUNCTION public.prevent_agreement_acceptance_log_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'agreement acceptance logs cannot be deleted';
END;
$$;

DROP TRIGGER IF EXISTS validate_agreement_acceptance_version_snapshot ON public.agreement_acceptance_logs;
CREATE TRIGGER validate_agreement_acceptance_version_snapshot
  BEFORE INSERT OR UPDATE ON public.agreement_acceptance_logs
  FOR EACH ROW EXECUTE FUNCTION public.validate_agreement_acceptance_version_snapshot();

DROP TRIGGER IF EXISTS guard_agreement_acceptance_log_updates ON public.agreement_acceptance_logs;
CREATE TRIGGER guard_agreement_acceptance_log_updates
  BEFORE UPDATE ON public.agreement_acceptance_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agreement_acceptance_log_updates();

DROP TRIGGER IF EXISTS prevent_agreement_acceptance_log_delete ON public.agreement_acceptance_logs;
CREATE TRIGGER prevent_agreement_acceptance_log_delete
  BEFORE DELETE ON public.agreement_acceptance_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_agreement_acceptance_log_delete();

-- ── 5. agreement_evidence_files ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agreement_evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acceptance_id UUID NOT NULL REFERENCES public.agreement_acceptance_logs(id) ON DELETE RESTRICT,
  file_type TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_hash TEXT NOT NULL DEFAULT '',
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (file_type IN ('signed_form', 'line_screenshot', 'email_pdf', 'signature_image', 'other')),
  CHECK (char_length(trim(storage_bucket)) > 0),
  CHECK (char_length(trim(storage_path)) > 0),
  CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.agreement_evidence_files IS
  'Private evidence files attached to agreement acceptance logs for Admin/POS and staff-assisted consent.';

CREATE INDEX IF NOT EXISTS idx_agreement_evidence_files_acceptance
  ON public.agreement_evidence_files(acceptance_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_agreement_evidence_files_uploaded_by
  ON public.agreement_evidence_files(uploaded_by, uploaded_at DESC)
  WHERE uploaded_by IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agreement_evidence_files_storage_path
  ON public.agreement_evidence_files(storage_bucket, storage_path);

DROP FUNCTION IF EXISTS public.prevent_agreement_evidence_file_update_delete();
CREATE FUNCTION public.prevent_agreement_evidence_file_update_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'agreement evidence files are append-only and cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS prevent_agreement_evidence_file_update ON public.agreement_evidence_files;
CREATE TRIGGER prevent_agreement_evidence_file_update
  BEFORE UPDATE ON public.agreement_evidence_files
  FOR EACH ROW EXECUTE FUNCTION public.prevent_agreement_evidence_file_update_delete();

DROP TRIGGER IF EXISTS prevent_agreement_evidence_file_delete ON public.agreement_evidence_files;
CREATE TRIGGER prevent_agreement_evidence_file_delete
  BEFORE DELETE ON public.agreement_evidence_files
  FOR EACH ROW EXECUTE FUNCTION public.prevent_agreement_evidence_file_update_delete();

-- ── 6. helper RPC ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.f_get_active_agreement_version(TEXT, TIMESTAMPTZ);
CREATE FUNCTION public.f_get_active_agreement_version(
  p_agreement_type TEXT,
  p_as_of TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  id UUID,
  agreement_type TEXT,
  version TEXT,
  title TEXT,
  content_format TEXT,
  content_body TEXT,
  content_hash TEXT,
  rendered_text_hash TEXT,
  effective_from TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    av.id,
    av.agreement_type,
    av.version,
    av.title,
    av.content_format,
    av.content_body,
    av.content_hash,
    av.rendered_text_hash,
    av.effective_from
  FROM public.agreement_versions av
  WHERE av.agreement_type = p_agreement_type
    AND av.status = 'published'
    AND av.effective_from <= p_as_of
    AND (av.effective_until IS NULL OR av.effective_until > p_as_of)
  ORDER BY av.effective_from DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.f_get_active_agreement_version(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_get_active_agreement_version(TEXT, TIMESTAMPTZ) TO service_role;

-- ── 7. row level security ────────────────────────────────────────────────────

ALTER TABLE public.agreement_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_acceptance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_evidence_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agreement_versions_service_role_all" ON public.agreement_versions;
CREATE POLICY "agreement_versions_service_role_all"
  ON public.agreement_versions FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "agreement_acceptance_logs_service_role_all" ON public.agreement_acceptance_logs;
CREATE POLICY "agreement_acceptance_logs_service_role_all"
  ON public.agreement_acceptance_logs FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "agreement_evidence_files_service_role_all" ON public.agreement_evidence_files;
CREATE POLICY "agreement_evidence_files_service_role_all"
  ON public.agreement_evidence_files FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON public.agreement_versions FROM anon, authenticated;
REVOKE ALL ON public.agreement_acceptance_logs FROM anon, authenticated;
REVOKE ALL ON public.agreement_evidence_files FROM anon, authenticated;

GRANT ALL ON public.agreement_versions TO service_role;
GRANT ALL ON public.agreement_acceptance_logs TO service_role;
GRANT ALL ON public.agreement_evidence_files TO service_role;
