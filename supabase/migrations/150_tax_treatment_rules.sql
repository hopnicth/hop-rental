-- ============================================================
-- 150_tax_treatment_rules.sql
--
-- Scope:
--   * NEW public.tax_treatment_rules — the central
--     (charge_type × customer_kind) → VAT/WHT map, effective-dated
--     and append-only.
--   * NEW f_tax_treatment_for(charge_type, customer_kind, at)
--     — fail-closed reader.
--   * Seeds ONLY the charge types the web actually produces today,
--     reading the rate through f_tax_vat_config().
--   * WIRES NOTHING. No writer calls the new reader yet.
--
-- Key design decisions:
--   * KEY IS (charge_type × customer_kind). Branch does NOT
--     participate — a VAT rate is national (CHiP, Q1 2026-11-17).
--     Documents stay branch-aware through their own series
--     (mig-136); that is numbering, not tax.
--   * EFFECTIVE-DATED RULES AND PER-DOCUMENT SNAPSHOTS ARE
--     COMPLEMENTARY (CHiP, Q2). This table explains what was in
--     force on a date; an issued document still snapshots the rate
--     it used, so a later rule never silently re-derives history.
--   * SEEDED ONLY FOR REACHABLE CHARGE TYPES (CHiP, Q3):
--     rental_charge and settlement_discount. The others —
--     notably forfeiture/contractual_penalty at 0% — are
--     DELIBERATELY ABSENT. decisions.md:576 calls that map
--     "locked", but BACKLOG:153 lists forfeiture VAT as item (1)
--     of the accountant confirmation package, "pending
--     professional confirmation", required "before ruling-2
--     forfeitures run against real customers". Seeding it would
--     promote an unconfirmed position to a confirmed one AND make
--     it executable the moment deposits revive, bypassing that
--     gate. A reader that RAISEs is the enforceable form of that
--     backlog line.
--   * APPEND-ONLY, WITH ONE NARROW EXCEPTION: effective_to may be
--     stamped once, NULL → non-NULL, strictly after
--     effective_from. No other column may be UPDATEd, no row may
--     be DELETEd, and the table may not be TRUNCATEd (mig-125 /
--     mig-109 pattern). The exception exists so a rule can be
--     WITHDRAWN WITH NO SUCCESSOR — which is how a rule pending
--     re-confirmation must behave, and is the one thing a
--     derive-the-end-from-the-next-row design cannot express.
--   * NO OVERLAPS, ENFORCED BY TRIGGER NOT `EXCLUDE`: btree_gist
--     is not installed and no migration in this repo uses an
--     exclusion constraint. A trigger avoids a new extension
--     dependency and matches the house idiom. The trigger takes a
--     per-key advisory lock first, because two concurrent
--     transactions inserting overlapping periods would otherwise
--     both pass their own EXISTS check.
--   * effective_from ON THE SEEDS IS '-infinity', NOT now(). The
--     global config was ALREADY applying these values before this
--     table existed, so settlements issued earlier must stay
--     explainable; a rule starting today would orphan them.
--     NOTE FOR PHASE B / UI: PostgREST renders this as the string
--     "-infinity", which JS Date cannot parse. Any future TS or UI
--     reader must special-case the infinite bound. The reader
--     below returns no timestamps, so nothing today is exposed.
--   * THE RATE IS NOT RE-HARDCODED AND NOT RE-READ BY HAND. The
--     seed calls f_tax_vat_config() (mig-134:60), which already
--     validates rate and treatment and RAISEs on a missing or
--     malformed row. A second raw SELECT on system_configs would
--     be a second way to read one source of truth.
--     f_tax_vat_config only ever yields 'vat_inclusive' or
--     'vat_exclusive'; 'no_vat' is permitted by the CHECK below
--     for a future explicit rule but is unreachable from the seed.
--   * WHT COLUMNS EXIST AND STAY DORMANT (decisions.md
--     2026-07-22: juristic customers + WHT parked). Seeds leave
--     them NULL. customer_kind 'any' is used because the launch
--     web does not yet distinguish person from company.
--   * NOT WIRED TO ANY WRITER. One live call passes charge_type
--     NULL — f_write_settlement_charge_line(..., 'penalty',
--     v_penalty_net, ..., NULL) at 148:376, inside
--     f_settle_rental_booking_return. A fail-closed reader would
--     RAISE on it and break the deposit-era penalty path. Wiring,
--     and the decision about what that NULL should become, is
--     phase B under its own scope gate.
-- ============================================================

-- ─── 1. the rules table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tax_treatment_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_type        text NOT NULL,
  customer_kind      text NOT NULL,
  vat_treatment      text NOT NULL,
  vat_rate_percent   numeric(5,2) NOT NULL,
  wht_rate_percent   numeric(5,2),
  wht_type           text,
  effective_from     timestamptz NOT NULL,
  effective_to       timestamptz,
  note               text,
  created_by_user_id uuid REFERENCES public.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ttr_charge_type_chk CHECK (charge_type = ANY (ARRAY[
    'rental_charge','rental_extension','taxable_service_charge',
    'actual_damage','contractual_penalty','pending_review',
    'settlement_discount'])),
  CONSTRAINT ttr_customer_kind_chk
    CHECK (customer_kind IN ('person','company','any')),
  CONSTRAINT ttr_vat_treatment_chk
    CHECK (vat_treatment IN ('vat_inclusive','vat_exclusive','no_vat')),
  CONSTRAINT ttr_vat_rate_chk
    CHECK (vat_rate_percent >= 0 AND vat_rate_percent <= 100),
  CONSTRAINT ttr_no_vat_zero_chk
    CHECK (vat_treatment <> 'no_vat' OR vat_rate_percent = 0),
  CONSTRAINT ttr_wht_rate_chk CHECK (wht_rate_percent IS NULL
    OR (wht_rate_percent >= 0 AND wht_rate_percent <= 100)),
  CONSTRAINT ttr_wht_pair_chk
    CHECK ((wht_rate_percent IS NULL) = (wht_type IS NULL)),
  CONSTRAINT ttr_period_chk
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE public.tax_treatment_rules IS
  'Central (charge_type x customer_kind) -> VAT/WHT map,
   effective-dated and append-only. A charge type with NO rule is
   deliberate: f_tax_treatment_for RAISEs rather than defaulting,
   which keeps the accountant confirmation gate (BACKLOG:153)
   enforceable. WHT columns are dormant until juristic revival.';

CREATE UNIQUE INDEX IF NOT EXISTS ttr_key_from_uidx
  ON public.tax_treatment_rules
     (charge_type, customer_kind, effective_from);

-- ─── 2. no overlapping periods for one key ──────────────
-- The advisory lock is NOT optional. Without it two concurrent
-- transactions inserting overlapping periods for one key each see
-- a clean EXISTS and both commit; the unique index would only
-- catch an identical effective_from. The lock serialises writers
-- per (charge_type, customer_kind) for the rest of the
-- transaction. Namespace 150 is this migration number.
CREATE OR REPLACE FUNCTION public.f_ttr_no_overlap()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    150, hashtext(NEW.charge_type || ':' || NEW.customer_kind));

  IF EXISTS (
    SELECT 1 FROM public.tax_treatment_rules r
     WHERE r.charge_type   = NEW.charge_type
       AND r.customer_kind = NEW.customer_kind
       AND r.id IS DISTINCT FROM NEW.id
       AND tstzrange(r.effective_from, r.effective_to, '[)')
         && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
  ) THEN
    RAISE EXCEPTION
      'TAX_RULE_PERIOD_OVERLAP: % / % overlaps an existing rule',
      NEW.charge_type, NEW.customer_kind;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ttr_no_overlap
  ON public.tax_treatment_rules;
CREATE TRIGGER trg_ttr_no_overlap
  BEFORE INSERT OR UPDATE ON public.tax_treatment_rules
  FOR EACH ROW EXECUTE FUNCTION public.f_ttr_no_overlap();

-- ─── 3. append-only, with the one narrow exception ──────
-- TG_OP is tested BEFORE anything touches OLD, because the
-- TRUNCATE trigger below is statement-level and has no OLD.
CREATE OR REPLACE FUNCTION public.f_ttr_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION
      'TAX_RULE_IMMUTABLE: TRUNCATE is not permitted on tax_treatment_rules';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TAX_RULE_IMMUTABLE: rules are never deleted';
  END IF;

  -- WHAT CHANGED must be judged BEFORE the effective_to branches, or the
  -- message points at the wrong thing: an UPDATE that alters the rate and
  -- leaves effective_to alone would trip "may only be set, never cleared"
  -- and tell the caller it tried to clear a column it never touched. The
  -- refusal was always correct; the explanation was not.
  IF (NEW.id, NEW.charge_type, NEW.customer_kind, NEW.vat_treatment,
      NEW.vat_rate_percent, NEW.wht_rate_percent, NEW.wht_type,
      NEW.effective_from, NEW.note, NEW.created_by_user_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.charge_type, OLD.customer_kind, OLD.vat_treatment,
      OLD.vat_rate_percent, OLD.wht_rate_percent, OLD.wht_type,
      OLD.effective_from, OLD.note, OLD.created_by_user_id, OLD.created_at)
  THEN
    RAISE EXCEPTION 'TAX_RULE_IMMUTABLE: only effective_to may change';
  END IF;

  -- the ONLY permitted mutation: closing an open period, once.
  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'TAX_RULE_IMMUTABLE: effective_to is already set';
  END IF;
  IF NEW.effective_to IS NULL THEN
    RAISE EXCEPTION 'TAX_RULE_IMMUTABLE: effective_to may only be set, never cleared';
  END IF;
  IF NEW.effective_to <= OLD.effective_from THEN
    RAISE EXCEPTION 'TAX_RULE_PERIOD_INVALID: effective_to must follow effective_from';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ttr_append_only
  ON public.tax_treatment_rules;
CREATE TRIGGER trg_ttr_append_only
  BEFORE UPDATE OR DELETE ON public.tax_treatment_rules
  FOR EACH ROW EXECUTE FUNCTION public.f_ttr_append_only();

-- Row-level UPDATE/DELETE triggers do NOT fire on TRUNCATE, so a
-- separate statement-level BEFORE TRUNCATE trigger is required to
-- close that hole (mig-109:120-126, mig-125:157-161). Reuses the
-- same function; TG_OP resolves to 'TRUNCATE'.
DROP TRIGGER IF EXISTS trg_ttr_no_truncate
  ON public.tax_treatment_rules;
CREATE TRIGGER trg_ttr_no_truncate
  BEFORE TRUNCATE ON public.tax_treatment_rules
  FOR EACH STATEMENT EXECUTE FUNCTION public.f_ttr_append_only();

-- Postgres already refuses a direct call to a trigger function ("trigger
-- functions can only be called as triggers"), so this closes no live hole —
-- it keeps these two consistent with how every other function in this track
-- is granted (mig-134), rather than leaving a default PUBLIC EXECUTE behind.
REVOKE ALL ON FUNCTION public.f_ttr_append_only()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.f_ttr_no_overlap()
  FROM PUBLIC, anon, authenticated;

-- ─── 4. RLS — service_role only ─────────────────────────
ALTER TABLE public.tax_treatment_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tax_treatment_rules_service_role_all"
  ON public.tax_treatment_rules;
CREATE POLICY "tax_treatment_rules_service_role_all"
  ON public.tax_treatment_rules FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON public.tax_treatment_rules FROM anon, authenticated;
GRANT ALL ON public.tax_treatment_rules TO service_role;

-- ─── 5. the fail-closed reader ──────────────────────────
CREATE OR REPLACE FUNCTION public.f_tax_treatment_for(
  p_charge_type   text,
  p_customer_kind text DEFAULT 'any',
  p_at            timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kind text := COALESCE(p_customer_kind, 'any');
  v_row  public.tax_treatment_rules%ROWTYPE;
BEGIN
  IF p_charge_type IS NULL THEN
    RAISE EXCEPTION 'TAX_RULE_CHARGE_TYPE_REQUIRED';
  END IF;
  -- NULL is deliberately read as 'any': a caller with no
  -- customer-kind concept yet (the launch web) should get the
  -- generic rule, and that is phase B's first wiring case. A
  -- NON-NULL value outside the vocabulary is a BUG, not a
  -- fallback — a typo must never silently resolve to 'any' and
  -- return a rate the caller did not ask for.
  IF v_kind NOT IN ('person','company','any') THEN
    RAISE EXCEPTION 'TAX_RULE_CUSTOMER_KIND_INVALID: %', p_customer_kind;
  END IF;
  -- an explicit NULL defeats the DEFAULT; refuse it outright
  -- rather than letting it surface as a confusing NOT_FOUND.
  IF p_at IS NULL THEN
    RAISE EXCEPTION 'TAX_RULE_AS_OF_REQUIRED';
  END IF;

  -- an exact customer_kind match beats the 'any' fallback.
  SELECT * INTO v_row FROM public.tax_treatment_rules r
   WHERE r.charge_type = p_charge_type
     AND r.customer_kind IN (v_kind, 'any')
     AND r.effective_from <= p_at
     AND (r.effective_to IS NULL OR r.effective_to > p_at)
   ORDER BY (r.customer_kind <> 'any') DESC, r.effective_from DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAX_RULE_NOT_FOUND: % / % at %',
      p_charge_type, v_kind, p_at;
  END IF;

  RETURN jsonb_build_object(
    'charge_type',      v_row.charge_type,
    'customer_kind',    v_row.customer_kind,
    'vat_treatment',    v_row.vat_treatment,
    'vat_rate_percent', v_row.vat_rate_percent,
    'wht_rate_percent', v_row.wht_rate_percent,
    'wht_type',         v_row.wht_type,
    'rule_id',          v_row.id);
END; $$;

REVOKE ALL ON FUNCTION public.f_tax_treatment_for(text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_tax_treatment_for(text, text, timestamptz)
  TO service_role;

-- ─── 6. seed, through the existing validated reader ─────
DO $$
DECLARE v_cfg jsonb;
BEGIN
  -- f_tax_vat_config() already RAISEs on a missing row, a bad
  -- rate, or an unknown treatment (mig-134:60). Going through it
  -- keeps ONE way to read 'tax.vat' and avoids restating 7 here.
  v_cfg := public.f_tax_vat_config();

  INSERT INTO public.tax_treatment_rules
    (charge_type, customer_kind, vat_treatment, vat_rate_percent,
     effective_from, note)
  SELECT ct, 'any',
         v_cfg->>'treatment',
         (v_cfg->>'rate_percent')::numeric,
         '-infinity'::timestamptz,
         '[150] seeded via f_tax_vat_config(); the global config was already applying this before this table existed'
    FROM unnest(ARRAY['rental_charge','settlement_discount']) AS ct
   WHERE NOT EXISTS (
     SELECT 1 FROM public.tax_treatment_rules r
      WHERE r.charge_type = ct AND r.customer_kind = 'any');
END $$;
