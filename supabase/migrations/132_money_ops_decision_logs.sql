-- ============================================================
-- 132_money_ops_decision_logs.sql
--
-- Scope:
--   * money_ops_decision_logs: append-only audit of allow/deny decisions on
--     money-destructive admin operations (design §F; T1a inversion pattern
--     extended). Born BEFORE its first consumer (walk-2 forfeiture endpoint).
--
-- Key design decisions:
--   * Mirror of kyc_document_access_log (109): plain-UUID snapshots (no FK,
--     survives entity purge), closed vocabularies, best-effort ip/ua,
--     append-only triggers, service_role ALL + super_admin SELECT.
--   * NO-PII INVARIANT: opaque UUIDs, closed vocab, numeric amounts ONLY.
--     Never names/phones/bank details/transfer refs/slip paths/free text.
--     Hence NO reason_text column — business reasons live on domain rows.
--   * Writer split: 'allowed' rows fail-closed BEFORE the side effect;
--     'denied' rows best-effort (never block the 403).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.money_ops_decision_logs (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  operation      text        NOT NULL,
  decision       text        NOT NULL,
  denial_reason  text        NULL,      -- machine code, e.g. 'not_super_admin' | 'malformed_entity_id'
  actor_user_id  uuid        NULL,
  actor_role     text        NULL,      -- snapshot of platform_role
  entity_type    text        NULL,      -- null only for malformed-target denials
  entity_id      uuid        NULL,      -- plain UUID snapshot, NO FK; null if malformed
  amount         numeric(12,2) NULL,    -- money at stake, when resolved
  currency_code  text        NULL,
  ip_address     inet        NULL,      -- best-effort
  user_agent     text        NULL,      -- best-effort
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT money_ops_decision_logs_pkey PRIMARY KEY (id),
  CONSTRAINT modl_operation_chk CHECK (operation IN (
    'company_cancel',
    'late_cancel_forfeit',
    'document_void',
    'sale_cancel_paid',
    'refund_mark_refunded',
    'manual_stock_adjustment'
  )),
  CONSTRAINT modl_decision_chk CHECK (decision IN ('allowed', 'denied')),
  CONSTRAINT modl_denial_reason_chk CHECK (
    (decision = 'allowed' AND denial_reason IS NULL)
    OR (decision = 'denied' AND char_length(trim(coalesce(denial_reason, ''))) > 0)
  ),
  CONSTRAINT modl_entity_type_chk CHECK (entity_type IS NULL OR entity_type IN (
    'rental_booking', 'sale_order', 'official_document', 'payment_refund'
  )),
  CONSTRAINT modl_currency_chk CHECK (currency_code IS NULL OR char_length(currency_code) = 3),
  CONSTRAINT modl_amount_chk CHECK (amount IS NULL OR amount >= 0)
);

COMMENT ON TABLE public.money_ops_decision_logs IS
  'Append-only audit of allow/deny decisions on money-destructive admin operations (company cancel, forfeiture, void, paid-order cancel, refund execution, manual stock adjustment). Denormalized plain-UUID snapshots (no FK) so rows survive entity purge. super_admin SELECT only. INVARIANT: stores ONLY opaque UUIDs, closed vocabularies, and numeric amounts. NEVER customer names, phone numbers, bank account numbers/names, transfer references, slip paths/URLs, or free-text business reasons — those live on the domain rows. Allowed rows are written FAIL-CLOSED before the side effect; denied rows are best-effort (a denial log failure must never block the 403).';

CREATE INDEX IF NOT EXISTS idx_modl_entity  ON public.money_ops_decision_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_modl_actor   ON public.money_ops_decision_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modl_created ON public.money_ops_decision_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modl_denied  ON public.money_ops_decision_logs (operation, created_at DESC)
  WHERE decision = 'denied';

-- Append-only guards (086/109 pattern).
CREATE OR REPLACE FUNCTION public.guard_money_ops_decision_log_mutations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'money_ops_decision_logs is append-only (% blocked)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_money_ops_decision_logs_no_mutate ON public.money_ops_decision_logs;
CREATE TRIGGER trg_money_ops_decision_logs_no_mutate
  BEFORE UPDATE OR DELETE ON public.money_ops_decision_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_money_ops_decision_log_mutations();

DROP TRIGGER IF EXISTS trg_money_ops_decision_logs_no_truncate ON public.money_ops_decision_logs;
CREATE TRIGGER trg_money_ops_decision_logs_no_truncate
  BEFORE TRUNCATE ON public.money_ops_decision_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_money_ops_decision_log_mutations();

-- RLS: service_role writes; super_admin may read.
ALTER TABLE public.money_ops_decision_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.money_ops_decision_logs FROM anon, authenticated;
GRANT ALL ON public.money_ops_decision_logs TO service_role;

DROP POLICY IF EXISTS "money_ops_decision_logs_service_role_all" ON public.money_ops_decision_logs;
CREATE POLICY "money_ops_decision_logs_service_role_all"
  ON public.money_ops_decision_logs FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "money_ops_decision_logs_super_admin_select" ON public.money_ops_decision_logs;
CREATE POLICY "money_ops_decision_logs_super_admin_select"
  ON public.money_ops_decision_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.platform_role = 'super_admin'
  ));

-- Verification (metadata assertions).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'modl_operation_chk'
      AND pg_get_constraintdef(oid) LIKE '%late_cancel_forfeit%'
  ) THEN
    RAISE EXCEPTION 'MIG132_VERIFY_FAILED: operation vocabulary missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.money_ops_decision_logs'::regclass
      AND tgname = 'trg_money_ops_decision_logs_no_mutate'
  ) THEN
    RAISE EXCEPTION 'MIG132_VERIFY_FAILED: append-only guard missing';
  END IF;
END $$;
