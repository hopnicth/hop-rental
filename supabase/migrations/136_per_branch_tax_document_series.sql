-- ============================================================
-- 136_per_branch_tax_document_series.sql
--
-- Scope:
--   * f_next_document_number: branch-scoped sequence keys for TAX
--     document types ONLY; every legacy type keeps 'global'.
--
-- Key design decisions:
--   * OD-4's original shape (coalesce(p_branch_id,'global') for ALL
--     types) was WITHDRAWN 2026-07-23 against live data: 7 of 9 remote
--     document_sequences rows carry a real branch_id while keyed
--     'global', and all 7 call sites can pass one. Universal keying
--     would have restarted those counters at 1 and re-drawn issued
--     numbers (e.g. BDR-202607-0001, already on an issued document).
--   * TYPE-AWARE KEYING (R1): only the four tax types are branch-scoped.
--     Type list is the design-doc §8.2 contract — keep in sync.
--   * NO GLOBAL FALLBACK FOR TAX TYPES (R2): a tax draw with no branch
--     is a hard refusal, never a silent 'global' draw.
--   * Legacy types are untouched: same key, same rows, same counters.
--     No existing sequence row is read or written differently.
--   * Prefix-constant centralization is Phase 1 CODE (R3), not here.
--   * Number FORMAT is unchanged (prefix-period-number), so BACKLOG B2
--     (does the printed number embed a branch code) stays fully open.
-- ============================================================

CREATE OR REPLACE FUNCTION public.f_next_document_number(
  p_document_type TEXT,
  p_branch_id TEXT,
  p_period TEXT,
  p_prefix TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence_key TEXT := 'global';
  v_next_number INTEGER;
BEGIN
  IF p_document_type IS NULL OR char_length(trim(p_document_type)) = 0 THEN
    RAISE EXCEPTION 'document_type is required';
  END IF;

  IF p_period IS NULL OR p_period !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'period must be in YYYYMM format';
  END IF;

  IF p_prefix IS NULL OR char_length(trim(p_prefix)) = 0 THEN
    RAISE EXCEPTION 'prefix is required';
  END IF;

  -- ═══ [136 NEW BLOCK — START] ═══════════════════════════════════
  -- Tax documents get a per-branch series (OD-4 as revised). Legacy
  -- types fall through with v_sequence_key still 'global', so their
  -- existing rows and counters are reached exactly as before.
  -- Type list must match docs/design/2026-07-23-t-launch-phase0.md §8.2.
  IF p_document_type IN (
       'rental_statement_of_charges',
       'rental_tax_invoice_receipt_full',
       'rental_tax_invoice_receipt_abbreviated',
       'rental_credit_note'
     ) THEN
    IF p_branch_id IS NULL OR char_length(trim(p_branch_id)) = 0 THEN
      RAISE EXCEPTION 'TAX_DOCUMENT_BRANCH_REQUIRED';
    END IF;
    v_sequence_key := p_branch_id;
  END IF;
  -- ═══ [136 NEW BLOCK — END] ═════════════════════════════════════

  INSERT INTO public.document_sequences (
    document_type,
    sequence_key,
    branch_id,
    period,
    prefix,
    last_number
  ) VALUES (
    p_document_type,
    v_sequence_key,
    p_branch_id,
    p_period,
    p_prefix,
    1
  )
  ON CONFLICT (document_type, sequence_key, period)
  DO UPDATE SET
    last_number = public.document_sequences.last_number + 1,
    prefix = EXCLUDED.prefix,
    updated_at = now()
  RETURNING last_number INTO v_next_number;

  RETURN p_prefix || '-' || p_period || '-' || lpad(v_next_number::TEXT, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.f_next_document_number(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_next_document_number(TEXT, TEXT, TEXT, TEXT)
  TO service_role;
