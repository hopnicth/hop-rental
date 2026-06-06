-- ============================================================
-- 112: kyc_verification_decisions — immutable verify/revoke decision audit
--      + kyc_vat_status enum + atomic verify/revoke RPCs
--
-- Minimal Verify KYC v1 (plan locked 2026-06-06; decisions.md Decision L to
-- be recorded in the docs slice). Verify is a TRUST-GRANTING DECISION, not a
-- document-access event — it must NOT write kyc_document_access_log.
--
-- Design (mirrors migration 109's purge-surviving audit pattern):
--   * Plain UUID snapshots, NO FKs — decision rows survive profile/document
--     purge and user deletion. Verifier identity is snapshotted
--     (decided_by_user_id + decided_by_name + decided_by_role), never only an
--     FK that could be nulled.
--   * customer_type / identity_type are DENORMALIZED onto the row because
--     CHECK constraints cannot reference kyc_profiles.
--   * Append-only: UPDATE/DELETE/TRUNCATE blocked for all roles by trigger.
--   * No free-text note column in v1 (structured reason codes only) — a note
--     would be immutable PII subject to retention/PDPA handling.
--   * visual_review_confirmed records the verifier's explicit human
--     attestation in immutable history (fail-closed CHECK for 'verified').
--   * VAT rule (company + juristic_id): vat_status is an EXPLICIT verifier
--     attestation — never inferred from document presence/absence. Fail-closed
--     at endpoint AND at DB level (CHECK below).
--   * Transaction model: verify/revoke = ONE Postgres transaction via the
--     SECURITY DEFINER RPCs below (decision INSERT + kyc_profiles UPDATE,
--     row-locked). No decision-first/correction-row pattern — unlike document
--     download there is no storage boundary, so plain atomicity is available.
--   * INVARIANT: the schema stores ONLY opaque ids and structured codes —
--     never customer names, identity numbers, hashes, or document numbers.
--     decided_by_name is INTERNAL STAFF metadata (Decision F reasoning).
--
-- TOCTOU note (recorded dependency): document-type readiness (which document
-- types exist / recency) is validated in TypeScript BEFORE the RPC. That is
-- acceptable in v1 ONLY because kyc_documents has no delete primitive. When
-- Decision H purge/delete ships, readiness validation must move inside the
-- RPC/transaction (the RPC already re-checks reviewed-id ownership inside the
-- transaction as partial mitigation).
-- ============================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- A. ENUM: kyc_vat_status (binary by owner decision)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE public.kyc_vat_status AS ENUM ('vat_registered', 'not_vat_registered');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- B. TABLE: kyc_verification_decisions
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kyc_verification_decisions (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),

  -- Plain UUID snapshot (NO FK) — survives profile purge.
  kyc_profile_id           uuid        NOT NULL,
  -- Denormalized so CHECKs can depend on them; snapshots survive purge.
  customer_type            public.kyc_customer_type NOT NULL,
  identity_type            public.kyc_identity_type NOT NULL,

  -- Durable verifier snapshot — deleted user records must not erase the actor.
  decided_by_user_id       uuid        NOT NULL,
  decided_by_name          text        NULL,   -- public.users.full_name at decision time (staff metadata)
  decided_by_role          text        NOT NULL,

  decided_at               timestamptz NOT NULL DEFAULT now(),
  outcome                  text        NOT NULL,
  method                   text        NOT NULL DEFAULT 'admin_panel',

  reviewed_document_ids    uuid[]      NOT NULL DEFAULT '{}',
  visual_review_confirmed  boolean     NOT NULL DEFAULT false,

  vat_status               public.kyc_vat_status NULL,
  valid_until              timestamptz NULL,   -- produced by 'verified' decisions
  reason_code              text        NULL,   -- structured; 'revoked' only

  ip_address               inet        NULL,   -- best-effort actor forensics (Decision F parity)
  user_agent               text        NULL,

  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kyc_verification_decisions_pkey PRIMARY KEY (id),
  CONSTRAINT kyc_verification_decisions_outcome_chk
    CHECK (outcome IN ('verified', 'revoked')),
  CONSTRAINT kyc_verification_decisions_method_chk
    CHECK (method IN ('admin_panel')),  -- widen when staff_on_site ships
  -- Fail-closed VAT attestation: a company verification REQUIRES vat_status.
  CONSTRAINT kyc_verification_decisions_company_vat_chk
    CHECK (outcome <> 'verified' OR customer_type <> 'company' OR vat_status IS NOT NULL),
  -- VAT status never attaches to non-company profiles.
  CONSTRAINT kyc_verification_decisions_individual_vat_chk
    CHECK (customer_type = 'company' OR vat_status IS NULL),
  -- A verification must produce validity, evidence, and explicit attestation.
  CONSTRAINT kyc_verification_decisions_verified_valid_until_chk
    CHECK (outcome <> 'verified' OR valid_until IS NOT NULL),
  CONSTRAINT kyc_verification_decisions_verified_reviewed_chk
    CHECK (outcome <> 'verified' OR cardinality(reviewed_document_ids) >= 1),
  CONSTRAINT kyc_verification_decisions_verified_attested_chk
    CHECK (outcome <> 'verified' OR visual_review_confirmed = true),
  -- Revoke carries a structured reason from the closed v1 set; verify carries none.
  CONSTRAINT kyc_verification_decisions_reason_chk
    CHECK (
      (outcome = 'revoked' AND reason_code IN ('fraud_suspected', 'document_invalid', 'verified_in_error', 'other'))
      OR (outcome <> 'revoked' AND reason_code IS NULL)
    ),
  -- Revoked rows are exactly as strict as verified rows: a revoke decision
  -- carries no VAT attestation, no validity, no review attestation, and no
  -- reviewed-evidence set (review hardening, 2026-06-07).
  CONSTRAINT kyc_verification_decisions_revoked_shape_chk
    CHECK (
      outcome <> 'revoked'
      OR (
        vat_status IS NULL
        AND valid_until IS NULL
        AND visual_review_confirmed = false
        AND cardinality(reviewed_document_ids) = 0
      )
    )
);

COMMENT ON TABLE public.kyc_verification_decisions IS
  'Append-only audit of KYC profile verify/revoke decisions (trust-granting events; NOT document access — that is kyc_document_access_log). Denormalized, FK-free snapshots so rows survive profile/document purge and user deletion. INVARIANT: stores ONLY opaque UUIDs and structured codes — never customer names, identity numbers/hashes, or document numbers; decided_by_name is internal-staff metadata. No free-text fields (v1): reason_code is a closed set; reason_code=''other'' deliberately carries no elaboration.';

-- ──────────────────────────────────────────────────────────────────────────────
-- C. Indexes
-- ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kyc_verification_decisions_profile
  ON public.kyc_verification_decisions (kyc_profile_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_verification_decisions_actor
  ON public.kyc_verification_decisions (decided_by_user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verification_decisions_decided_at
  ON public.kyc_verification_decisions (decided_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- D. Append-only triggers — raise on UPDATE/DELETE (row) and TRUNCATE (statement)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kyc_verification_decisions_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'kyc_verification_decisions is append-only; % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_verification_decisions_no_mutate
  ON public.kyc_verification_decisions;
CREATE TRIGGER trg_kyc_verification_decisions_no_mutate
  BEFORE UPDATE OR DELETE ON public.kyc_verification_decisions
  FOR EACH ROW EXECUTE FUNCTION public.kyc_verification_decisions_block_mutation();

DROP TRIGGER IF EXISTS trg_kyc_verification_decisions_no_truncate
  ON public.kyc_verification_decisions;
CREATE TRIGGER trg_kyc_verification_decisions_no_truncate
  BEFORE TRUNCATE ON public.kyc_verification_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION public.kyc_verification_decisions_block_mutation();

-- ──────────────────────────────────────────────────────────────────────────────
-- E. RLS / grants
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.kyc_verification_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kyc_verification_decisions FROM anon;

DROP POLICY IF EXISTS "kyc_verification_decisions_service_role_all"   ON public.kyc_verification_decisions;
DROP POLICY IF EXISTS "kyc_verification_decisions_super_admin_select" ON public.kyc_verification_decisions;

-- service_role: writes happen ONLY through the RPCs via the service-role client.
CREATE POLICY "kyc_verification_decisions_service_role_all"
  ON public.kyc_verification_decisions FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- super_admin: SELECT only (decision review). No staff read; no anon.
CREATE POLICY "kyc_verification_decisions_super_admin_select"
  ON public.kyc_verification_decisions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.platform_role = 'super_admin'::public.platform_role
  ));

-- ──────────────────────────────────────────────────────────────────────────────
-- F. RPC: verify_kyc_profile — ONE transaction: decision INSERT + profile UPDATE
--    Validity rule: valid_until = decided_at + 1 year (design §7).
--    AUTHORITY: this RPC is the SINGLE WRITER AUTHORITY for valid_until — the
--    period is fixed here, never passed in by the endpoint (an endpoint-supplied
--    period could drift/bug into wrong validity). The TS constant
--    (server/utils/kyc.ts computeValidUntil / KYC_VALIDITY_PERIOD_MONTHS) is a
--    MIRROR for display/readiness/tests only; source-inspection tests pin the
--    two to the same +1 year value.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_kyc_profile(
  p_profile_id            uuid,
  p_decided_by_user_id    uuid,
  p_decided_by_name       text,
  p_decided_by_role       text,
  p_reviewed_document_ids uuid[],
  p_visual_review_confirmed boolean,
  p_vat_status            public.kyc_vat_status DEFAULT NULL,
  p_ip_address            inet DEFAULT NULL,
  p_user_agent            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile     public.kyc_profiles%ROWTYPE;
  v_now         timestamptz := now();
  v_valid_until timestamptz;
  v_owned_count integer;
  v_decision_id uuid;
BEGIN
  -- Defence-in-depth: the endpoint guard is requireSuperAdmin; re-assert here.
  IF p_decided_by_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'KYC_VERIFY_SUPER_ADMIN_ONLY';
  END IF;
  IF p_decided_by_user_id IS NULL THEN
    RAISE EXCEPTION 'KYC_VERIFY_ACTOR_REQUIRED';
  END IF;
  IF p_visual_review_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'KYC_VISUAL_REVIEW_REQUIRED';
  END IF;
  IF p_reviewed_document_ids IS NULL OR cardinality(p_reviewed_document_ids) < 1 THEN
    RAISE EXCEPTION 'KYC_REVIEWED_DOCUMENTS_REQUIRED';
  END IF;

  -- Row lock: closes the concurrent double-verify race.
  SELECT * INTO v_profile FROM public.kyc_profiles
   WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KYC_PROFILE_NOT_FOUND';
  END IF;

  -- Re-verify is allowed for ANY non-verified status (pending/expired/revoked).
  IF v_profile.status = 'verified' THEN
    RAISE EXCEPTION 'KYC_PROFILE_ALREADY_VERIFIED';
  END IF;

  -- VAT attestation (fail-closed; CHECKs enforce again at insert).
  IF v_profile.customer_type = 'company' AND p_vat_status IS NULL THEN
    RAISE EXCEPTION 'KYC_VAT_STATUS_REQUIRED';
  END IF;
  IF v_profile.customer_type <> 'company' AND p_vat_status IS NOT NULL THEN
    RAISE EXCEPTION 'KYC_VAT_STATUS_NOT_APPLICABLE';
  END IF;

  -- In-transaction re-check: every reviewed id belongs to THIS profile
  -- (partial TOCTOU mitigation; full document-type readiness stays in TS
  -- until the purge primitive forces it in here).
  SELECT count(*) INTO v_owned_count
    FROM public.kyc_documents d
   WHERE d.id = ANY (p_reviewed_document_ids)
     AND d.kyc_profile_id = p_profile_id;
  IF v_owned_count <> cardinality(p_reviewed_document_ids) THEN
    RAISE EXCEPTION 'KYC_REVIEWED_DOCUMENTS_MISMATCH';
  END IF;

  v_valid_until := v_now + interval '1 year';

  INSERT INTO public.kyc_verification_decisions (
    kyc_profile_id, customer_type, identity_type,
    decided_by_user_id, decided_by_name, decided_by_role,
    decided_at, outcome, method,
    reviewed_document_ids, visual_review_confirmed,
    vat_status, valid_until, reason_code,
    ip_address, user_agent
  ) VALUES (
    v_profile.id, v_profile.customer_type, v_profile.identity_type,
    p_decided_by_user_id, p_decided_by_name, p_decided_by_role,
    v_now, 'verified', 'admin_panel',
    p_reviewed_document_ids, p_visual_review_confirmed,
    p_vat_status, v_valid_until, NULL,
    p_ip_address, p_user_agent
  ) RETURNING id INTO v_decision_id;

  -- Current-state mirror. Re-verify of a revoked profile clears the revoked_*
  -- mirror columns — history is preserved in the decision table.
  UPDATE public.kyc_profiles SET
    status               = 'verified',
    verified_at          = v_now,
    valid_until          = v_valid_until,
    verified_by_user_id  = p_decided_by_user_id,
    verification_method  = 'admin_panel',
    revoked_at           = NULL,
    revoked_by_user_id   = NULL,
    revoked_reason_code  = NULL,
    revoked_note         = NULL
  WHERE id = v_profile.id;

  RETURN jsonb_build_object(
    'decision_id', v_decision_id,
    'outcome', 'verified',
    'decided_at', v_now,
    'valid_until', v_valid_until
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- G. RPC: revoke_kyc_profile — ONE transaction: decision INSERT + profile UPDATE
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_kyc_profile(
  p_profile_id         uuid,
  p_decided_by_user_id uuid,
  p_decided_by_name    text,
  p_decided_by_role    text,
  p_reason_code        text,
  p_ip_address         inet DEFAULT NULL,
  p_user_agent         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile     public.kyc_profiles%ROWTYPE;
  v_now         timestamptz := now();
  v_decision_id uuid;
BEGIN
  IF p_decided_by_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'KYC_REVOKE_SUPER_ADMIN_ONLY';
  END IF;
  IF p_decided_by_user_id IS NULL THEN
    RAISE EXCEPTION 'KYC_REVOKE_ACTOR_REQUIRED';
  END IF;
  IF p_reason_code IS NULL
     OR p_reason_code NOT IN ('fraud_suspected', 'document_invalid', 'verified_in_error', 'other') THEN
    RAISE EXCEPTION 'KYC_REVOKE_REASON_INVALID';
  END IF;

  SELECT * INTO v_profile FROM public.kyc_profiles
   WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KYC_PROFILE_NOT_FOUND';
  END IF;
  IF v_profile.status <> 'verified' THEN
    RAISE EXCEPTION 'KYC_PROFILE_NOT_VERIFIED';
  END IF;

  INSERT INTO public.kyc_verification_decisions (
    kyc_profile_id, customer_type, identity_type,
    decided_by_user_id, decided_by_name, decided_by_role,
    decided_at, outcome, method,
    reviewed_document_ids, visual_review_confirmed,
    vat_status, valid_until, reason_code,
    ip_address, user_agent
  ) VALUES (
    v_profile.id, v_profile.customer_type, v_profile.identity_type,
    p_decided_by_user_id, p_decided_by_name, p_decided_by_role,
    v_now, 'revoked', 'admin_panel',
    '{}', false,
    NULL, NULL, p_reason_code,
    p_ip_address, p_user_agent
  ) RETURNING id INTO v_decision_id;

  -- Current-state mirror; valid_until left as historical data — the pickup
  -- gate fails on status before it ever reads valid_until.
  UPDATE public.kyc_profiles SET
    status              = 'revoked',
    revoked_at          = v_now,
    revoked_by_user_id  = p_decided_by_user_id,
    revoked_reason_code = p_reason_code
  WHERE id = v_profile.id;

  RETURN jsonb_build_object(
    'decision_id', v_decision_id,
    'outcome', 'revoked',
    'decided_at', v_now,
    'reason_code', p_reason_code
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- H. RPC grants — service_role only (endpoints call via the service-role client)
-- ──────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.verify_kyc_profile(uuid, uuid, text, text, uuid[], boolean, public.kyc_vat_status, inet, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_kyc_profile(uuid, uuid, text, text, text, inet, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_kyc_profile(uuid, uuid, text, text, uuid[], boolean, public.kyc_vat_status, inet, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_kyc_profile(uuid, uuid, text, text, text, inet, text) TO service_role;
