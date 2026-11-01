-- ============================================================
-- 149_collect_denial_log_vocabulary.sql
--
-- Scope (ONE CONSTRAINT ONLY):
--   * modl_operation_chk widened by ONE value:
--     'settlement_payment_confirm_denied'. NOTHING ELSE.
--
-- Key design decisions:
--   * J-2 vocabulary carrying: the value must exist BEFORE the collect
--     endpoint ships, or running code hits a CHECK rejection that
--     best-effort logging SWALLOWS. That is not hypothetical — it was
--     observed live on 2026-11-02: the collect wrapper returned correct
--     refusals (409 on replay, 422 on a bad payment method) while EVERY
--     denial row was silently rejected and never written. The refusal
--     reached the user; the audit trail did not exist. That is the exact
--     §8.9 failure mode the wrapper/RPC split exists to prevent.
--   * Plain DROP (no IF EXISTS) on modl_operation_chk: a wrong constraint
--     name must fail LOUDLY (125:C pattern, as used by 133/134/138/142/144).
--   * The 16 existing values are reproduced VERBATIM from the live
--     constraint (pg_get_constraintdef read-back at 148).
--   * PERMANENCE: modl is append-only; this value is removable only until
--     its first committed use, then permanent.
--   * The collect SUCCESS row keeps operation 'settlement_payment_confirm'
--     and is written IN-RPC (mig-134), atomic with the state flip. This new
--     value is written by the WRAPPER only, on refusal, in a separate
--     transaction (§8.9: an in-function log before RAISE cannot persist —
--     the refusal is the RPC's job, the audit trail is the caller's).
--   * NO-PII INVARIANT (mig 132 table comment) is unchanged: denial rows
--     carry a machine code in denial_reason. Payment references and slip
--     storage paths live on the domain row and are NEVER copied into
--     money_ops_decision_logs.
--   * Additive only — every existing row satisfies the widened constraint,
--     so validation cannot fail and no history is rewritten.
-- ============================================================

ALTER TABLE public.money_ops_decision_logs
  DROP CONSTRAINT modl_operation_chk;
ALTER TABLE public.money_ops_decision_logs
  ADD CONSTRAINT modl_operation_chk CHECK (operation IN (
    -- the 16 live values, preserved verbatim from the current constraint
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
    'settlement_payment_waive_denied',
    'launch_booking_cancel',
    'auto_no_show_cancel',
    -- [149 NEW] wrapper-written collect denial (§8.9), mirroring the 144
    -- waive-denial value. Without it the collect wrapper's denial inserts
    -- are rejected and swallowed by best-effort logging.
    'settlement_payment_confirm_denied'
  ));
