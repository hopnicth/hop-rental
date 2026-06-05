# KYC Production Enablement Checklist — document upload/download

> Status: **ACTIVE OPERATIONAL CHECKLIST — production enablement NOT approved yet.**
> Last updated: 2026-06-06
> Consolidates: decisions.md Decisions C (five gates), D (pure proxy + platform baseline), F (PDPA/IP stance), H (purge invariant), I (Fluid guard = manual gate). This file makes NO new decisions.
> Locked spec: `docs/kyc-phase-2-download-spec.md` · audit-log rules: Decision A (read-only / metadata-only / no probe rows in production).
> **Evidence/sign-off fields must contain REFERENCES ONLY.** Do NOT paste credentials, service-role keys, Vercel tokens, signed URLs, or other secrets into this tracked doc — link to where evidence lives (run logs, dashboards, session docs) instead.

---

## 0. Scope / status

- KYC document **upload + download are staging-ready**: endpoint live on staging, smoke-tested 2026-06-05 (200, SHA-256 exact, full safe header set, genuine `download/allowed` log row verified read-only).
- **Production enablement is NOT approved.** Every gate below must be checked off before real KYC document upload/download is enabled in production.
- **This checklist does NOT gate the staging Admin download UI.** The staging UI can be built and tested independently against the already-smoke-tested staging endpoint.
- This checklist exists to LAUNCH and track the owner/legal long-poles — checking a box requires the underlying work to be actually done and evidence recorded, not just acknowledged.

**Critical path:** items 1.1 and 1.2 (retention + AV posture) are owner/legal decisions with the longest lead time. Start them first; everything in §2–§9 can run in parallel or near enablement time.

---

## 1. Owner / legal gates (Decision C items 1–2, F; LONG POLES — start now)

- [ ] **1.1 Retention duration decided and recorded** — owner/legal decides how long KYC documents are retained; record the decision in `decisions.md` (Decision C item 1). This also governs the already-accrued staging access-log data (Decision F) and unblocks the purge primitive scope (Decision B/H).
  - Decided duration: ______ · Recorded in decisions.md entry: ______
- [ ] **1.2 AV/malware scanning posture decided** — either (a) scanning is implemented before enablement, or (b) the owner EXPLICITLY accepts the temporary no-AV risk with compensating controls (super_admin-only access, `attachment` disposition + `nosniff`, MIME allowlist + magic-byte sniffing, 10 MB cap) and the acceptance is recorded in `decisions.md` (Decision C item 2).
  - Chosen posture: ______ · Recorded in decisions.md entry: ______
- [ ] **1.3 PDPA basis confirmed for production** — Decision F (legitimate interest, staff IP/UA in the immutable access log) re-confirmed as applying to production; retention of log data tied to 1.1. Mandatory revisit trigger unchanged: if any customer-facing flow ever writes CUSTOMER IPs to this log, masking/hashing gets its own phase.
- [ ] **1.4 Purge-before-production decision** — owner confirms whether the purge/delete primitive must exist BEFORE production enablement, or remains deferred (current state). If deferred, the owner accepts that production documents cannot be removed until it ships (see §10).
  - Decision: ______ · By: ______ · Date: ______

## 2. Fluid Compute / platform gate (Decisions D impact 2 + I)

- [ ] **2.1 Live Fluid Compute check run manually** — `npm run check:vercel-fluid` with an **EPHEMERAL Vercel token** (create → run → revoke; never stored in repo/`.env`/CI; no standing CI secret — Decision I). PASS only on strict boolean `resourceConfig.fluid === true` + project-id match (exit 0). UNKNOWN (exit 2) is a hard stop, same as FAIL.
  - **If not PASS: production KYC proxy download must NOT be enabled and the streaming spike must be re-run** (Decision D); the shelved signed-URL contingency (spec §9) activates only with owner approval.
  - Date/time: ______ · `VERCEL_PROJECT_ID`: ______ · Result: ______ · Token revoked (confirm): ______
- [ ] **2.2 Bucket cap unchanged** — confirm `kyc-profile-documents` `file_size_limit` is still 10,485,760 bytes (migration 109). If it was ever raised above 10 MB, the streaming spike must be RE-RUN at the new maximum BEFORE enablement (Decision D impact 3).
  - Verified limit: ______ · Date: ______

## 3. Storage / security gates (Decision C item 3)

- [ ] **3.1 Production `storage.objects` policy gate re-run** — zero policies matching the KYC bucket (the staging gate does NOT transfer; policies are environment-specific).
  - Query output / evidence: ______
- [ ] **3.2 Bucket private** — `storage.buckets.public = false` for `kyc-profile-documents` in production.
- [ ] **3.3 No public/signed URLs in the production download path** — server-proxy endpoint (`GET /api/admin/kyc/documents/:id/download`) is the ONLY production download path; no `createSignedUrl`/`getPublicUrl`/redirects (already pinned by source-inspection tests — confirm the deployed commit includes them).
- [ ] **3.4 Production access log clean of probe rows** — `kyc_document_access_log` in production contains ZERO remote-verification probe rows. Probe rows were a staging-only mistake (Decision A); production verification is read-only / metadata-only. The ONLY acceptable production rows are genuine access events, including the labeled synthetic smoke-test row from §5.
  - Verified (read-only query) by: ______ · Date: ______

## 4. App / runtime gates (Decision C item 4; env gate per Decision K)

- [ ] **4.0 Required env vars/secrets present (run FIRST — before any manual smoke)** — every required key in `.env.example` is present in the target deployed environment. Explicitly including **`KYC_HASH_SECRET`**, which is a **permanent, hash-only, NON-ROTATABLE secret** (Decision K): no raw identity is stored anywhere, so it must be set BEFORE the first real KYC profile is created, securely backed up outside git, and treated as unloseable — losing it orphans every existing profile; compromise cannot be cleanly rotated without re-collecting identities. Staging and production secrets are independent. This gate exists because the 2026-06-06 staging smoke hit a missing `KYC_HASH_SECRET` mid-smoke (`KYC_HASH_UNAVAILABLE`); the check must catch that before smoke, not during it.
  - **Confidentiality (Decision K):** identity spaces are structured/guessable — the secret is what stops an attacker holding `identity_hash` values from enumerating candidates and confirming who is enrolled; secret + hash table together compromised = de-anonymization → PDPA breach assessment. Keep secret and hashes in SEPARATE trust zones (today: Vercel env vs Supabase DB — preserve this); protect the secret and its backup at least as strongly as database access; never print, paste, log, or commit the value — presence/evidence references only.
  - Env keys verified present (list): ______ · Verified by: ______ · Date: ______
  - `KYC_HASH_SECRET` backed up outside git (where, by whom): ______
- [ ] **4.1 h3 version pinned/confirmed** — installed h3 is `1.15.5` (current project standard; re-verify against `package-lock.json` at enablement time). If h3 was upgraded, the rawBody canary below MUST pass before enablement.
  - Installed version at enablement: ______
- [ ] **4.2 h3/rawBody canary run** — `npx vitest run tests/server/kyc-document-upload-h3-integration.spec.ts` (includes the "h3 upgrade canary" asserting `readRawBody` still honors the `req.rawBody` pre-read fallback). The repo has NO CI workflow — this canary is MANUAL unless/until CI exists (and adding CI for it would be a separate owner decision per Decision I's standing-token rule if it ever needs secrets).
  - Run date: ______ · Result: ______
- [ ] **4.3 Type check clean** — `npx tsc --noEmit`.
- [ ] **4.4 KYC tests pass** — targeted: `npx vitest run tests/server/kyc-document-download-api.spec.ts tests/server/kyc-document-download-h3-integration.spec.ts tests/server/kyc-document-upload-api.spec.ts tests/server/kyc-document-upload-h3-integration.spec.ts tests/server/kyc-document-upload-utils.spec.ts tests/server/vercel-fluid-guard.spec.ts`.
- [ ] **4.5 Full suite delta acceptable** — `npx vitest run`: zero NEW failures, zero KYC failures; if the known POS baseline (20 failures / 6 files) still exists, confirm it is unchanged.
  - Totals + delta: ______

## 5. Production smoke test (one-time; permanent audit residue accepted)

> Precondition: §1–§4 complete. The staging procedure (progress.md 2026-06-05 post-push update) is the template.

- [ ] **5.1 Residue acceptance recorded BEFORE running** — owner explicitly accepts that this test creates PERMANENT production audit-log rows (the log is append-only and immutable; rows are never deleted or mutated).
  - Accepted by: ______ · Date: ______
- [ ] **5.2 Synthetic non-PII document prepared** — unmistakably labeled synthetic (e.g. `smoke-test-…` identity_hash, synthetic profile, non-PII image/PDF). **Prefer ~10 MB** (just under the bucket cap) — the real-object production path has only been proven at 6 MB (Decision D impact 4); a 10 MB real-object pass closes that recorded evidence gap.
  - Document id: ______ · Profile id: ______ · Size: ______
- [ ] **5.3 Download as super_admin through the production endpoint** and verify ALL of:
  - [ ] HTTP 200, bytes returned; integrity check where practical (SHA-256 of uploaded fixture vs downloaded bytes)
  - [ ] `Cache-Control: no-store`
  - [ ] `Content-Disposition: attachment` (opaque `kyc-<id>.<ext>` filename)
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] allowlisted `Content-Type` (jpeg/png/pdf)
  - [ ] **no `Content-Length`** (Decision D impact 1)
  - [ ] no storage path / bucket / signed-URL leakage in headers or body
- [ ] **5.4 Access-log row verified (read-only)** — `action='download'`, `result='allowed'`, correct document id, opaque storage path, correct actor snapshot.
  - **Access-log row id recorded here as auditor evidence (this row is a TEST):** ______
- [ ] **5.5 Cleanup obeys retention/purge rules** — never delete/mutate access-log rows. Removal of the synthetic storage object / DB rows must follow whatever purge/retention rules are in force at the time (Decision H: if a sanctioned purge primitive exists, use it — fail-closed `delete` audit row BEFORE removal; if not, manual cleanup of THIS synthetic non-PII fixture requires explicit owner approval + a session-doc record, same as the 2026-06-05 staging precedent).
  - Cleanup method + record: ______

## 6. Rollback / disable path (confirm BEFORE enablement)

- [ ] **6.1 Emergency disable path chosen and documented** — there is currently NO feature flag on the download endpoint. Options to confirm/choose (at least one must be tested or walked through before enablement):
  - deploy revert of the enabling commit (Vercel instant rollback to a previous deployment),
  - route disable (small commit removing/guarding the route),
  - Vercel WAF/firewall rule blocking `/api/admin/kyc/documents/*` (platform-level, no deploy), or
  - another approved path.
  - Chosen path: ______ · Walked through by: ______ · Date: ______
- [ ] **6.2 Disable path preserves the audit log** — whatever the path, it must not touch `kyc_document_access_log` (append-only, immutable).

## 7. Monitoring / alerting

- [ ] **7.1 Production monitoring covers:**
  - [ ] KYC download endpoint 5xx rate
  - [ ] `read_failed` audit rows (infrastructure read errors)
  - [ ] `storage_download_failed` correction rows (granted-but-errored deliveries)
  - [ ] `unsafe_path` rows (stored-path validation failures — should be zero, ever)
  - [ ] `invalid_mime` rows (should be zero, ever)
  - [ ] abnormal spikes in denied AND allowed access-log rows (volume anomaly = possible abuse or scraping by a super_admin account)
- [ ] **7.2 Alert ownership defined** — who reviews alerts, on what cadence, and what the response action is (e.g. trigger §6 disable path; review the access log read-only).
  - Reviewer: ______ · Cadence: ______ · Action playbook: ______

## 8. Super admin roster review (production access scope)

- [ ] **8.1 Roster reviewed and minimal** — every production `super_admin` can download EVERY customer's KYC document. Confirm the production `platform_role='super_admin'` roster is exactly the people who need that power, remove anyone who doesn't.
  - Roster at review (count + names/ids): ______ · Reviewed by: ______ · Date: ______

## 9. Purge / retention dependency (Decision H — informational unless 1.4 requires it)

- Purge primitive remains DEFERRED until retention (1.1) is decided.
- If/when purge is built, it is bound by the Decision H invariant: a **fail-closed `action='delete'` audit row** must be durably written BEFORE removing the storage object or any DB row; if that log write fails, the purge ABORTS. **No KYC document is ever removed without a committed delete audit row.**
- `'delete'` is already in the access-log action constraint (migrations 109/110) — no schema change needed.

## 10. Sign-off block

| Field | Value |
|---|---|
| Owner/legal sign-off (name + date/time) | ______ |
| Engineering sign-off (name + date/time) | ______ |
| Environment | production (`https://www.hopnic.co.th`) |
| Vercel project id (`prj_…`) | ______ |
| Vercel team/personal scope | ______ (undetermined as of 2026-06-06 — resolve at §2.1) |
| Supabase project id | `yzjczvzwmbbeyoodrjwm` (confirm production project at sign-off: ______) |
| Evidence links / command outputs | ______ |
| Smoke-test access-log row id (§5.4) | ______ |
| Remaining accepted risks (explicit list) | ______ |

> Enablement is approved ONLY when every checkbox above is checked with evidence recorded, and both sign-off lines are filled. Until then, production KYC document upload/download stays disabled.
