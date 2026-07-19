-- ============================================================
-- 131_official_document_void_reissue.sql
--
-- Scope:
--   * f_void_official_document: the ONLY writer for document voiding
--     (design §B: edits never — void + reissue).
--   * f_mark_official_document_replaced: voided → replaced flip, called by
--     the reissue issuance path after the replacement row exists.
--   * DELETE + TRUNCATE guards on official_documents (109 pattern — the 068
--     finalized-guard blocks UPDATE mutation but never blocked DELETE).
--
-- Key design decisions:
--   * Design contract: docs/design/2026-07-19-t3-t4-unified-cancel-and-documents.md §B.
--   * Void writes ONLY status/voided_at/voided_by/void_reason + a
--     document_events 'voided' row — zero intersection with the 068
--     finalized-guard column groups (068:258-298).
--   * 'voided'/'replaced' already legal in document_events (068:341) and
--     official_documents status (068:243) — no CHECK widening.
--   * Reissue numbering: the replacement takes a FRESH number via
--     f_next_document_number in the issuance path; voided numbers are never
--     reused (reconciliation loop 1 accounts for them as voided).
--   * v_prev_status captured pre-update (gate-130 "state, never infer");
--     the 'voided' event carries voidedFromStatus.
--   * §F operation='document_void' is logged by the WRAPPER (walk 7).
-- ============================================================

CREATE OR REPLACE FUNCTION public.f_void_official_document(
  p_document_id UUID,
  p_actor_user_id UUID,
  p_actor_role TEXT,                 -- 'staff' | 'super_admin' (wrapper enforces super_admin)
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.official_documents%ROWTYPE;
  v_prev_status TEXT;
BEGIN
  IF p_actor_role <> 'super_admin' THEN
    -- Defence-in-depth (mig-112 discipline): void is super_admin-only.
    RAISE EXCEPTION 'DOCUMENT_VOID_SUPER_ADMIN_ONLY';
  END IF;
  IF NULLIF(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'VOID_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_doc
  FROM public.official_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_FOUND';
  END IF;
  IF v_doc.status = 'voided' THEN
    -- Idempotent replay: already voided (reissue may still be pending).
    RETURN jsonb_build_object('ok', true, 'alreadyVoided', true,
                              'document', to_jsonb(v_doc));
  END IF;
  IF v_doc.status NOT IN ('issued', 'printed') THEN
    -- drafts are simply discarded; 'replaced' is terminal.
    RAISE EXCEPTION 'DOCUMENT_NOT_VOIDABLE: %', v_doc.status;
  END IF;
  v_prev_status := v_doc.status;

  UPDATE public.official_documents
  SET status = 'voided',
      voided_at = now(),
      voided_by = p_actor_user_id,
      void_reason = trim(p_reason)
  WHERE id = p_document_id
    AND status = v_prev_status
  RETURNING * INTO v_doc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_VOID_CONFLICT';
  END IF;

  INSERT INTO public.document_events
    (document_id, event_type, staff_user_id, reason, metadata)
  VALUES
    (p_document_id, 'voided', p_actor_user_id, trim(p_reason),
     jsonb_build_object('voidedFromStatus', v_prev_status));

  RETURN jsonb_build_object('ok', true, 'alreadyVoided', false,
                            'document', to_jsonb(v_doc));
END;
$$;

REVOKE ALL ON FUNCTION public.f_void_official_document(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_void_official_document(UUID, UUID, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.f_mark_official_document_replaced(
  p_original_document_id UUID,
  p_replacement_document_id UUID,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original public.official_documents%ROWTYPE;
  v_replacement public.official_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_original
  FROM public.official_documents
  WHERE id = p_original_document_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_FOUND';
  END IF;
  IF v_original.status = 'replaced' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyReplaced', true);
  END IF;
  IF v_original.status <> 'voided' THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_VOIDED: %', v_original.status;
  END IF;

  SELECT * INTO v_replacement
  FROM public.official_documents
  WHERE id = p_replacement_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPLACEMENT_NOT_FOUND';
  END IF;
  -- The reissue chain link is the replacement's original_document_id.
  IF v_replacement.original_document_id IS DISTINCT FROM p_original_document_id THEN
    RAISE EXCEPTION 'REPLACEMENT_LINK_MISMATCH';
  END IF;
  IF v_replacement.status NOT IN ('issued', 'printed') THEN
    RAISE EXCEPTION 'REPLACEMENT_NOT_ISSUED: %', v_replacement.status;
  END IF;

  UPDATE public.official_documents
  SET status = 'replaced'
  WHERE id = p_original_document_id
    AND status = 'voided';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_REPLACE_CONFLICT';
  END IF;

  INSERT INTO public.document_events
    (document_id, event_type, staff_user_id, metadata)
  VALUES
    (p_original_document_id, 'replaced', p_actor_user_id,
     jsonb_build_object('replacementDocumentId', p_replacement_document_id,
                        'replacementDocumentNo', v_replacement.document_no));

  RETURN jsonb_build_object('ok', true, 'alreadyReplaced', false,
                            'replacementDocumentId', p_replacement_document_id);
END;
$$;

REVOKE ALL ON FUNCTION public.f_mark_official_document_replaced(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_mark_official_document_replaced(UUID, UUID, UUID)
  TO service_role;

-- ── DELETE + TRUNCATE guards (109 pattern; 068 never blocked DELETE) ──
CREATE OR REPLACE FUNCTION public.guard_official_document_removal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'official_documents rows cannot be removed (% blocked) — void + reissue, never delete', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_official_documents_block_delete ON public.official_documents;
CREATE TRIGGER trg_official_documents_block_delete
  BEFORE DELETE ON public.official_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_official_document_removal();

DROP TRIGGER IF EXISTS trg_official_documents_block_truncate ON public.official_documents;
CREATE TRIGGER trg_official_documents_block_truncate
  BEFORE TRUNCATE ON public.official_documents
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_official_document_removal();

-- Verification.
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND p.proname IN ('f_void_official_document', 'f_mark_official_document_replaced')) <> 2 THEN
    RAISE EXCEPTION 'MIG131_VERIFY_FAILED: void/replace RPCs missing or not SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.official_documents'::regclass
      AND tgname = 'trg_official_documents_block_delete'
  ) THEN
    RAISE EXCEPTION 'MIG131_VERIFY_FAILED: DELETE guard missing';
  END IF;
END $$;
