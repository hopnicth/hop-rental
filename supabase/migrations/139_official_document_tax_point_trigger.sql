-- ============================================================
-- 139_official_document_tax_point_trigger.sql
--
-- Scope:
--   * guard_official_document_tax_point() + a BEFORE INSERT trigger on
--     official_documents. NOTHING ELSE.
--
-- Purpose: make the tax-point guard UN-BYPASSABLE. Until now the guard
-- (133) was enforced only where a wrapper chose to call it, with §0's
-- central-engine constraint as the standing defense. This trigger moves
-- enforcement to the table itself: any INSERT of a tax document — from
-- any surface, including a direct INSERT that bypasses every wrapper —
-- is checked. 139 is §0's DB-level enforcement (L-4).
--
-- Key design decisions:
--   * TAX-TYPE TEST IS FIRST. Every non-tax insert returns before any
--     lookup, so all legacy document types are a strict no-op. Do NOT
--     reorder this test.
--   * THE LIST HERE MUST EQUAL 133's LIST (133:125-128) — three types.
--     STM is DELIBERATELY ABSENT: it is an operations document issued
--     BEFORE payment and is guard-exempt (design §8.2).
--     136's list (136:58-62) is a deliberate SUPERSET including STM,
--     because that list governs per-branch NUMBERING, not the guard.
--     INVARIANT: 139 == 133 (3 types). 136 ⊃ 133. Never add STM here.
--   * SOURCE MAPPING (L-1/L-2 ruling): tax documents carry
--     source_type='rental_booking_settlement' + source_id=settlement id.
--     'rental_booking' is retained as a second arm (used today by RBK /
--     pickup / return forms). Any other source_type fails closed.
--   * SECURITY DEFINER, owner postgres (L-3): the guard must not depend
--     on the inserting role holding EXECUTE on the 133 assert.
--   * FAILS CLOSED on every unmappable case. A tax document whose
--     booking cannot be identified is exactly the row that must not exist.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_official_document_tax_point()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_uuid uuid;
  v_booking_id  uuid;
BEGIN
  -- ── FIRST TEST: non-tax documents are untouched. Must mirror 133:125-128.
  IF NEW.document_type IS NULL OR NEW.document_type NOT IN (
       'rental_tax_invoice_receipt_full',
       'rental_tax_invoice_receipt_abbreviated',
       'rental_credit_note'
     ) THEN
    RETURN NEW;
  END IF;

  -- ── source_id must be a uuid; a bad cast surfaces as a NAMED error,
  --    never a bare 22P02 from deep inside a trigger.
  BEGIN
    v_source_uuid := NEW.source_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'TAX_DOCUMENT_SOURCE_ID_INVALID: %', NEW.source_id;
  END;

  -- ── Two mapping arms (L-1/L-2). Anything else fails closed.
  IF NEW.source_type = 'rental_booking_settlement' THEN
    SELECT s.booking_id INTO v_booking_id
      FROM public.rental_booking_settlements s
     WHERE s.id = v_source_uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TAX_DOCUMENT_SETTLEMENT_NOT_FOUND: %', v_source_uuid;
    END IF;
  ELSIF NEW.source_type = 'rental_booking' THEN
    v_booking_id := v_source_uuid;
  ELSE
    RAISE EXCEPTION 'TAX_DOCUMENT_SOURCE_UNMAPPED: %', coalesce(NEW.source_type, '(null)');
  END IF;

  -- ── The 133 guard, unchanged. Raises TAX_DOCUMENT_BLOCKED_AWAITING_PAYMENT
  --    / TAX_DOCUMENT_SETTLEMENT_STATE_MISSING / TAX_DOCUMENT_STATE_UNKNOWN.
  PERFORM public.f_assert_tax_document_issuable(v_booking_id, NEW.document_type);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_official_document_tax_point()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_official_documents_tax_point_guard
  ON public.official_documents;
CREATE TRIGGER trg_official_documents_tax_point_guard
  BEFORE INSERT ON public.official_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_official_document_tax_point();
