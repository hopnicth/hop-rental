-- ============================================================
-- 144_waive_denial_log_vocabulary.sql
--
-- Scope (ONE CONSTRAINT ONLY):
--   * modl_operation_chk widened by ONE value:
--     'settlement_payment_waive_denied'. NOTHING ELSE.
--
-- Key design decisions:
--   * J-2 vocabulary carrying: the value must exist BEFORE the waive
--     endpoint ships, so there is never a window where running code
--     hits a CHECK rejection.
--   * Plain DROP (no IF EXISTS) on modl_operation_chk: a wrong
--     constraint name must fail LOUDLY (125:C pattern, as used by
--     133/134/138/142).
--   * The 13 existing values are reproduced VERBATIM from the live
--     constraint (pg_get_constraintdef read-back, local=remote at 143).
--   * PERMANENCE: modl is append-only; this value is removable only
--     until its first committed use, then permanent.
--   * The waive SUCCESS row keeps operation 'settlement_payment_waive'
--     and is written IN-RPC (141:86-89), atomic with the state flip.
--     This new value is written by the WRAPPER only, on refusal, in a
--     separate transaction (§8.9: an in-function log before RAISE
--     cannot persist — refusal is the RPC's job, the audit trail is
--     the caller's).
--   * NO-PII INVARIANT (mig 132 table comment) is unchanged: denial
--     rows carry a machine code in denial_reason. The staff-entered
--     free-text waive reason lives on the domain row
--     (rental_settlement_payment_states.waive_reason, 141:79) and is
--     NEVER copied into money_ops_decision_logs.
-- ============================================================

ALTER TABLE public.money_ops_decision_logs
  DROP CONSTRAINT modl_operation_chk;
ALTER TABLE public.money_ops_decision_logs
  ADD CONSTRAINT modl_operation_chk CHECK (operation IN (
    -- the 13 live values, preserved verbatim from the current constraint
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
    'settlement_discount_granted',
    -- [144 NEW] wrapper-written waive denial (§8.9 half 2)
    'settlement_payment_waive_denied'
  ));
