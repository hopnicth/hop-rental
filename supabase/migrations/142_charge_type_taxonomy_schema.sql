-- ============================================================
-- 142_charge_type_taxonomy_schema.sql
--
-- Scope (SCHEMA ONLY — 142 = schema half of the M-2 split; RPC half = 143):
--   * payment_allocations.charge_type — the TAX-SUBSTANCE column.
--   * Its 6-value CHECK.
--   * modl_operation_chk widened by ONE value for the discount log.
--   NOTHING ELSE.
--
-- Key design decisions:
--   * charge_type is a FIRST-CLASS COLUMN, not metadata. It drives VAT/WHT
--     substance and it GATES money + tax issuance (pending_review blocks
--     payment confirmation and tax-document issuance, wired in 143). A
--     fail-closed gate cannot live in free-form JSON — same reasoning that
--     made vat_treatment (068) and operation (132) typed columns.
--   * SEPARATE DIMENSION from allocation_type: allocation_type is the
--     ledger bucket (rental_charge / service_charge / late_fee / ...),
--     charge_type is the tax substance. A taxable_service_charge line is
--     allocation_type='service_charge' + charge_type='taxable_service_charge'.
--     allocation_type's CHECK is NOT touched; 'late_fee'/'penalty' are
--     RETAINED (permanence) but DEPRECATED-FOR-LAUNCH.
--   * NULLABLE, deliberately. Existing/other allocation rows (deposits,
--     sale payments, mixed-checkout) have no tax-substance classification.
--     NULL means "not a launch staff-charge line" and is invisible to the
--     pending_review and disabled-type gates. This avoids a backfill of
--     historical money rows — nothing is rewritten by this migration.
--   * DISABLED-BUT-REPRESENTABLE: actual_damage and contractual_penalty are
--     in the CHECK (a future off-web/juristic revival needs them) but 143
--     REFUSES them at settle (CHARGE_TYPE_DISABLED_FOR_LAUNCH). Representable
--     is not the same as offerable.
--   * pending_review is a SYSTEM state, never a staff input (143 refuses it
--     as input); when present it BLOCKS payment confirm + tax issuance.
--   * NO WHT column. The taxonomy implies future WHT rates (rental 5%,
--     service 3%) but WHT stays parked with juristic customers
--     (decisions.md 2026-07-22 f). Storing a rate now would be dead schema.
--   * modl value carried HERE, not in 143, per the J-2 standing principle:
--     the vocabulary must exist before any code can write it, so there is
--     never a window where a running RPC hits a CHECK rejection.
--   * Plain DROP on modl_operation_chk: a wrong constraint name must fail
--     loudly (125:C pattern, as used by 133/134/138).
-- ============================================================

-- ── A. The tax-substance column
ALTER TABLE public.payment_allocations
  ADD COLUMN IF NOT EXISTS charge_type text NULL;

COMMENT ON COLUMN public.payment_allocations.charge_type IS
  'TAX-SUBSTANCE classification, separate from allocation_type (which is the ledger bucket). rental_charge / rental_extension = rental income (VAT 7%; future WHT 5%). taxable_service_charge = service income (VAT 7%; future WHT 3%). actual_damage / contractual_penalty = representable but DISABLED FOR LAUNCH (off-web per decisions.md 2026-07-22 c; require accountant memo). pending_review = fail-closed classification: BLOCKS payment confirmation and tax-document issuance. NULL = not a launch staff-charge line (deposits, sale payments, historical rows) and invisible to those gates.';

-- ── B. The closed vocabulary
ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_charge_type_chk CHECK (
    charge_type IS NULL OR charge_type IN (
      'rental_charge',
      'rental_extension',
      'taxable_service_charge',
      'actual_damage',
      'contractual_penalty',
      'pending_review'
    )
  );

-- ── C. Partial index: the pending_review gate is a hot-path lookup in 143
--      (confirm + tax issuance both ask "does this settlement have any
--      pending_review line?"). Partial so it stays tiny — at launch, empty.
CREATE INDEX IF NOT EXISTS idx_payment_allocations_pending_review
  ON public.payment_allocations (source_type, source_id)
  WHERE charge_type = 'pending_review';

-- ── D. modl vocabulary: the discount success log (J-2 carrying)
--      Success path ONLY — a refused discount RAISEs and the denial is the
--      WRAPPER's duty (§8.9: an in-function log before RAISE cannot persist).
ALTER TABLE public.money_ops_decision_logs
  DROP CONSTRAINT modl_operation_chk;
ALTER TABLE public.money_ops_decision_logs
  ADD CONSTRAINT modl_operation_chk CHECK (operation IN (
    -- the 12 existing values, preserved verbatim from the live constraint
    'company_cancel',
    'late_cancel_forfeit',
    'document_void',
    'sale_cancel_paid',
    'refund_mark_refunded',
    'manual_stock_adjustment',
    'settlement_zero_due_auto_paid',
    'settlement_payment_confirm',
    'settlement_payment_waive',
    'settlement_state_migration_backfill',
    'tax_document_issue',
    'tax_credit_note_issue',
    -- [142 NEW] discount granted (incl. the super_admin 20-50% authority tier)
    'settlement_discount_granted'
  ));
