-- ============================================================
-- 138_tax_issuance_decision_log_vocabulary.sql
--
-- Scope:
--   * Widen modl_operation_chk with the TAX-DOCUMENT ISSUANCE values.
--     NOTHING ELSE. This is the LAST vocabulary migration.
--
-- Key design decisions:
--   * OD-6 requires every TIR-/TIA-/credit-note issuance to be logged
--     to money_ops_decision_logs with the issuing actor. These are the
--     values those Phase 1 wrappers will write.
--   * SCOPE NARROWED TWICE before reaching here, per the J-2 standing
--     principle (a migration carries the vocabulary it needs):
--       133 carried 'settlement_zero_due_auto_paid';
--       134 carried 'settlement_payment_confirm',
--           'settlement_payment_waive',
--           'settlement_state_migration_backfill'.
--     What remains for 138 is strictly the issuance vocabulary.
--   * DELIBERATE OMISSIONS (argued at the 138 gate, recorded here so a
--     future reader does not "fix" them):
--       - NO 'tax_document_upgrade': the abbreviated->full path
--         decomposes into 'document_void' (existing, logged by the 131
--         wrapper) + 'tax_document_issue'. The atomic linkage lives in
--         official_documents.original_document_id and document_events,
--         which is the correct layer.
--       - NO STM- value: the statement of charges is an OPERATIONS
--         document, not a tax document — no money, no tax point, guard-
--         exempt. Its issuance is audited in document_events.
--   * Credit-note issuance gets its OWN value because it REDUCES
--     previously recognised revenue (money-destructive, the table's
--     stated purpose), and modl has no metadata column in which the
--     distinction could otherwise live.
--   * Plain DROP: a wrong constraint name must fail loudly (125:C
--     pattern, as used by 133 and 134).
-- ============================================================

ALTER TABLE public.money_ops_decision_logs
  DROP CONSTRAINT modl_operation_chk;
ALTER TABLE public.money_ops_decision_logs
  ADD CONSTRAINT modl_operation_chk CHECK (operation IN (
    -- the 10 existing values, preserved verbatim from the live constraint
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
    -- [138 NEW] tax-document issuance (OD-6)
    'tax_document_issue',
    'tax_credit_note_issue'
  ));
