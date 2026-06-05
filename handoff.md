# Handoff Log

## Claude Code → Claude Code / 2026-06-06 (Admin KYC Panel v1 smoke: API-level PASS, SHA-256 exact; BLOCKER: KYC_HASH_SECRET missing on staging Vercel)

Task: staging smoke test of Admin KYC Documents Panel v1 (deploy `9929c88`)
Status: **API-level PASS** (synthetic-only; byte-exact proxy download; oracle clean; audit rows correct & preserved; fixture cleaned up by exact ids) / **in-browser UI pass BLOCKED**
Blocker for next session: set `KYC_HASH_SECRET` (Vercel staging env + local `.env`, see `.env.example`) — without it `/api/admin/kyc/profiles/lookup` 500s (`KYC_HASH_UNAVAILABLE`) and the /admin/kyc page cannot reach the panel. After setting: do the real-browser pass (lookup → upload → staff no-Download-button → super_admin download COMPLETES → no preview/storage leaks in DevTools). Remember: object-URL revoke is next-tick by design — do not "fix" to synchronous.
Evidence ids (permanent log rows, synthetic test — for future auditors): document `453303f1-d7a0-4612-a9ff-7f5c37da45d3`, profile `2c9f4de7-ea6d-4d6f-8c50-43427ec34483`, log rows `b6904f1a…` (upload/allowed), `809d3dd1…` (denied staff), `3e4649b2…` (denied malformed, document_id null), `d46e9fa1…` (download/allowed super_admin).

### Addendum — Decision K + checklist gate (same day)
- **Decision K recorded:** `KYC_HASH_SECRET` = permanent, hash-only, NON-ROTATABLE (no raw identity stored anywhere — verified in schema). Must be set BEFORE first real profile per environment; back up outside git; staging/production secrets independent. Never print or commit it.
- Checklist §4.0 added: full `.env.example` env completeness (incl. `KYC_HASH_SECRET`) is a production gate run BEFORE manual smoke.
- After owner sets the staging secret + redeploys, run the owed in-browser smoke: lookup renders panel → staff lookup/list/upload, NO Download button, direct download still uniform 403 → super_admin Download button, click-download COMPLETES in a real browser, SHA-256 matches fixture, filename from Content-Disposition → DevTools: no preview/iframe/embed, no storage path/bucket/signed URL/raw identity anywhere.

---


## Claude Code → Claude Code / 2026-06-06 (Admin KYC Documents Panel v1 — staging; two commits, not yet pushed at write time)

Task: Admin KYC Documents Panel v1 (list endpoint + lookup page + panel component + tests; locked decisions 1–6 honored)
Files: `server/api/admin/kyc/profiles/[id]/documents.get.ts` (NEW) · `app/pages/admin/kyc/index.vue` (NEW) · `app/components/admin/kyc/AdminKycDocumentsPanel.vue` (NEW) · `app/types/admin-kyc.ts` (NEW) · `app/layouts/admin.vue` (+1 nav line) · 2 new specs · decisions.md (Decision J) · progress.md · this file
Status: done pending push approval
Key contracts:
1. List endpoint = the single approved backend addition; safe view module only; **list access intentionally unlogged in v1** (safe metadata, lower sensitivity than delivery; revisit if later deemed auditable — Decision J)
2. Admin UI is English-only per Decision J (4-locale rule = customer-facing); the four dirty locale JSONs were NOT touched
3. Download: super_admin-only button (server authoritative; 403 toast on role drift); blob + Content-Disposition filename; **next-tick `URL.revokeObjectURL` — do not "fix" to synchronous, it can cancel downloads** (smoke-test note)
4. Staging UI is NOT gated by the production enablement checklist; production exposure stays behind Decision C
Next: staging manual smoke (lookup → upload → list → download as super_admin; staff must see no Download button)

---


## Claude Code → Claude Code / 2026-06-06 (KYC production enablement checklist created — docs only)

Task: consolidate all KYC production-enablement gates into one operational checklist
Files touched: `docs/kyc-production-enablement-checklist.md` (NEW), `progress.md`, this file
Status: **done** (docs-only; nothing staged/committed/pushed at handoff time)
Next:
1. **Start the long-poles now (checklist §1): retention duration + AV posture** — owner/legal decisions, longest lead time, now the critical path
2. **The checklist is PRODUCTION-ONLY — it must NOT block the staging Admin download UI**; the staging endpoint is already smoke-tested, build the UI independently (i18n keys ×4 locales required)
3. Live Fluid check (§2.1) + production smoke test (§5, prefer ~10 MB synthetic) get recorded INTO the checklist with evidence when run
4. No new decisions.md entry was made — the checklist consolidates existing Decisions C/D/F/H/I

---

## Claude Code → Claude Code / 2026-06-06 (Fluid Compute guard shipped as manual gate — live API run PENDING)

Task: Fluid Compute verification script (Decision D impact 2, enforcement model amended by Decision I)
Files touched: `scripts/check-vercel-fluid.mjs` (new), `tests/server/vercel-fluid-guard.spec.ts` (new), `package.json` (+`check:vercel-fluid`), `docs/kyc-phase-2-download-spec.md` (§8 + lock header), `decisions.md` (Decision I), `progress.md`, this file
Status: **done** (implementation + tests + docs) / **one follow-up pending**: the one-time LIVE Vercel API run
Next:
1. Owner provides an EPHEMERAL Vercel token + `VERCEL_PROJECT_ID` (+ `VERCEL_TEAM_ID` if team-owned — ownership undetermined; check the dashboard URL) → run `npm run check:vercel-fluid` → on PASS, record date + verdict in spec §8 → revoke the token immediately
2. Until that run reports PASS, the Fluid gate counts as NOT satisfied for Decision C production enablement
3. No GitHub Actions / standing CI secret was created (Decision I) — future CI monitor only with explicit owner acceptance of standing-token risk

Verification state: tsc clean · new spec 29/29 · full suite 2202/2222 (20 fails = pre-existing POS baseline, re-verified at clean HEAD in a temp worktree) · all three CLI exit codes demonstrated via `--fixture`

---

## Claude Code → Claude Code (new terminal) / 2026-06-05 (Phase 2 CLOSED — download endpoint live, smoke-tested, cleaned up; handover for terminal switch)

Task: KYC Phase 2 — server-proxy document download (spec: `docs/kyc-phase-2-download-spec.md`)
Status: **DONE** — nothing in progress, nothing blocked mid-task
Files touched this session: see commits below; working tree carries ONLY pre-existing unrelated dirty files

### State at handoff (verified)

- Branch: `staging` @ `8ddb995` — **in full sync with `origin/staging`** (everything pushed)
- Session commit chain (all on remote):
  1. `6125f3a` docs(kyc): record Phase 2 proxy download decision (Decisions D–G + spec file)
  2. `4090d78` fix(kyc): allow download action in document access log (migration 110 — applied to remote DB, metadata-verified)
  3. `4e3830f` feat(kyc): add server-proxy document download endpoint (8 files, Opus-approved after read_failed fix)
  4. `6249cf8` docs(kyc): record Phase 2 proxy download implementation
  5. `8ddb995` docs(kyc): record purge audit requirement (Decision H)
- Deployed + LIVE: smoke test PASSED on `https://www.hopnic.co.th` (200, SHA-256 exact, full safe header set, no Content-Length, genuine `download`/`allowed` access-log row verified read-only)
- Post-smoke cleanup DONE: synthetic fixture removed by exact ids; `kyc_documents` and `kyc_profiles` are both back to **0 rows** on remote; the genuine access-log row for document `bb92221e-…` is PRESERVED forever (by design)
- Validation at close: `npx tsc --noEmit` clean · full `npx vitest run` = 2173 pass / 20 fail — the 20 are the documented pre-existing POS baseline (6 files), **zero KYC failures**
- Working tree (pre-existing, DO NOT TOUCH, never stage): `HomeCategoryShortcutRail.vue`, `HomeHorizontalRail.vue`, `i18n/locales/{cn,en,jp,th}.json`, untracked `.claude/skills/`, `.impeccable/`, `DESIGN.md`, `PRODUCT.md`

### Next (pick up in any order; none started)

1. **Admin download UI** — wire the endpoint into the admin KYC view (needs i18n keys ×4 locales per CLAUDE.md rules; none exist yet)
2. **Purge primitive** — BLOCKED on legal retention decision (Decision C item 1); when unblocked, MUST follow Decision H: fail-closed `action='delete'` log BEFORE removal; abort on log failure; `'delete'` already in the action constraint
3. **Fluid Compute CI guard** — enforced check that Vercel `resourceConfig.fluid === true` (Decision D impact 2); re-spike before production if ever disabled
4. **Verify endpoint** (evidence-first, Decision from 2026-06-03) — next KYC API phase after download
5. Production enablement — still blocked by ALL FIVE Decision C gates (retention, AV gap, prod storage-policy re-run, h3 canary in prod CI, read-only prod verification)

### Hard rules for the next session (read before touching KYC)

- Read `docs/kyc-phase-2-download-spec.md` + decisions.md Decisions A–H before any KYC document work
- `kyc_document_access_log` is append-only and immutable: NEVER delete/mutate rows; remote verification is read-only/metadata-only; never insert probe rows (Decision A)
- Raising the 10 MB KYC bucket cap requires re-running the streaming spike first (Decision D impact 3)
- Server-utils index (`docs/index/server-utils-index.md`) must be updated in the same commit as any `server/utils/` behavior change

### Operational notes (verified this session)

- Supabase CLI is linked (project `yzjczvzwmbbeyoodrjwm`); `.env` has `sb_secret_…` key — Storage REST needs it in BOTH `apikey` and `Authorization: Bearer` headers
- Vercel CLI authed as `hopnicth-9868`; previews are SSO-protected (use Protection Bypass for Automation via API, revoke after); custom domains `hopnic.co.th`/`www` are unprotected; apex 307-redirects to `www`
- super_admin test sessions can be minted via GoTrue admin magic-link (`generate_link` → `verify` → `sb-<ref>-auth-token` cookie = `base64-` + base64url(session JSON)); ALWAYS logout the minted session after

---

## Claude Code → Claude Code / 2026-06-05 (Phase 2 SHIPPED locally: migration 110 on remote + proxy download endpoint committed — next: push + staging smoke test)

### State at handoff

- Branch: `staging`; commits this session: `4090d78` (migration 110 — PUSHED, applied to remote/staging, metadata-verified) → `4e3830f` (endpoint feature — local) → docs commit (this entry)
- Remote DB: `kyc_document_access_log_action_chk` now includes `'download'` — the endpoint can deploy safely (constraint-before-code sequencing honored)
- Opus security-core source review: PASSED after one required fix (read_failed opaque error path)
- Validation: tsc clean · targeted KYC specs 143/143 · full suite 2173 pass / 20 fail = unchanged pre-existing POS baseline (6 files), zero KYC failures
- Working tree after docs commit: only the pre-existing unrelated dirty files (home rails, 4 locale JSONs, DESIGN.md, PRODUCT.md, .claude/, .impeccable/)

### What shipped (see progress.md session section + docs/kyc-phase-2-download-spec.md)

1. **Migration 110** — widened the action check constraint (constraint-only; no types regen). Local runbook + local behavioral verification (insert/check/append-only) green; remote dry-run showed only 110; applied; metadata-only remote verification passed (no probe rows — Decision A/C).
2. **`GET /api/admin/kyc/documents/:id/download`** — pure server-proxy per spec §2.1: uniform no-oracle 403 (non-super_admin never touches kyc_documents/storage), Decision-G malformed-id log purity (`asUuidOrNull`; raw ids never logged), fail-closed allowed log BEFORE storage fetch, best-effort denial rows (`not_super_admin[_malformed_id]` / `malformed_document_id` / `read_failed` / `not_found` / `unsafe_path` / `invalid_mime`) + `storage_download_failed` correction row, map-derived path validator, `attachment` opaque filename, `no-store`/`nosniff`, Content-Length omitted, `blob.stream()` return.
3. **read_failed fix (Opus blocker)** — DB read errors return opaque `KYC_DOCUMENT_READ_FAILED`; raw error server-logs only; best-effort `denied/read_failed` row; no allowed row; no storage access. Spec §3.4 records the general principle: infrastructure failures → opaque machine codes to clients.

### IMMEDIATE NEXT ACTION: push (with owner instruction) → staging smoke test

Smoke test contract (owner-approved; one permanent immutable access-log row is acceptable):
- super_admin auth → GET the endpoint for a real safe/non-sensitive document → expect 200, byte integrity, header set (`no-store`, allowlisted Content-Type, `nosniff`, `attachment; filename="kyc-<id>.<ext>"`, NO Content-Length, no path/bucket/URL leakage)
- READ-ONLY access-log verification: a genuine `download/allowed` row with correct document_id/actor/bucket/opaque path — never insert probe rows, never mutate the log (Decision A)
- If staging has no kyc_documents row yet, create a synthetic non-PII profile+document via service role (record ids in handoff) rather than probing the log directly

### Constraints (unchanged)

- Production enablement blocked by Decision C's five gates; purge deferred (Decision B); Fluid Compute guard + bucket-cap re-spike rules stand (Decision D); immutable-log checks read-only/metadata-only (Decision A)
- No UI, no locale keys in this phase

### POST-PUSH UPDATE (same day): smoke test PASSED + cleanup COMPLETE + purge invariant locked

- Phase 2 endpoint is COMPLETE: pushed (`4090d78..6249cf8`), deployed, and smoke-tested live on `https://www.hopnic.co.th` — 200, exact SHA-256 byte match, full header set (`no-store` / `attachment` / `nosniff` / `image/jpeg` / NO Content-Length, zero path/bucket leakage), genuine `download`/`allowed` access-log row verified read-only
- Smoke cleanup COMPLETE: synthetic fixture fully removed by exact ids (document `bb92221e-…`, profile `7a651dfb-…`, object `kyc/2552f565-….jpg`); both KYC tables back to 0 rows; the genuine access-log row PRESERVED (it now outlives its document — migration-109 purge-survival confirmed live)
- **Future purge phase MUST follow decisions.md 2026-06-05 Decision H**: fail-closed `action='delete'` audit row BEFORE removing object/rows; log-write failure aborts the purge; no document removed without a committed delete audit row. `'delete'` is already in the action vocabulary — no schema change needed.
- **Access-log rows must never be deleted or mutated** (append-only; Decisions A/H)

---

## Claude Code → Claude Code / 2026-06-05 (streaming spike PASS — Phase 2 unblocked as pure proxy; endpoint + migration 110 NOT started)

### State at handoff

- Branch: `staging` @ `4a43239` — in sync with origin; nothing staged or committed this session
- Working tree: docs-only changes pending commit (`decisions.md`, `progress.md`, `handoff.md` — tracked lowercase — plus new `docs/kyc-phase-2-download-spec.md`) + the pre-existing unrelated dirty files (home rails, 4 locale JSONs, DESIGN.md, PRODUCT.md, .claude/, .impeccable/) — do not touch the unrelated ones
- Spike fully cleaned: branch `spike/vercel-streaming` deleted (remote+local, was `99a2038`, never merged), Vercel preview deployment removed, protection-bypass secret revoked, temp fixture `catalog-media/spike/streaming-fixture-6mb.jpg` deleted, `server/api/_spike/` gone
- Migration 110: NOT authored. Download endpoint: NOT implemented. `database.types.ts`: untouched.

### What was completed this session

1. **Vercel streaming spike — PASS on all three tests** (full evidence in decisions.md 2026-06-05 Decision D): synthetic 6 MB + 10 MB random-byte streams and a real-object `storage.download()` → `blob.stream()` pass all delivered exact, checksum-verified bytes from a live Preview URL. No 413 / payload-limit failures.
2. **Phase 2 direction locked: PURE server-proxy** (Decision D) — hybrid signed-URL fallback shelved as documented contingency. Decision B's mechanism wording amended (fail-closed allowed log before BYTE DELIVERY).
3. **`docs/kyc-phase-2-download-spec.md` created** — the single tracked spec for the Phase 2 download design (endpoint order §2.1, internal SELECT §2.2, path-validator single source of truth §2.3, audit table + malformed-id log purity §3, migration 110 runbook §4, test matrix §5, platform guards §8, shelved hybrid contingency §9). Replaces all chat-only "rev-3 plan" references.
4. Download `allowed` semantics + `attachment` disposition recorded (Decision E); PDPA/IP stance recorded (Decision F); malformed-id log purity recorded (Decision G).
5. Access-log denial-payload nullability verified (all 5 sibling columns nullable) — malformed-id deny logging design is schema-valid.

### Operational notes for the next preview spike (learned this session)

- Preview deployments are SSO-protected (`ssoProtection: all_except_custom_domains`) → generate a Protection Bypass for Automation secret via the Vercel API (`PATCH /v1/projects/<id>/protection-bypass`), send as `x-vercel-protection-bypass`, REVOKE after
- `catalog-media` bucket rejects `application/octet-stream` (bucket-level declared-MIME allowlist) — upload spike fixtures with an allowed declared MIME (bytes can still be random)
- Local `.env` has the new `sb_secret_…` key — Storage REST needs it in the `apikey` header (Bearer-only → "Invalid Compact JWS")

### IMMEDIATE NEXT ACTION: Phase 2 implementation per `docs/kyc-phase-2-download-spec.md`

Remaining pre-implementation steps, in order:
1. Re-verify `supabase db reset --local` is clean through 109 (last proven at 106 on 2026-06-02) — spec §4 step 0
2. Author migration 110 — widen `kyc_document_access_log_action_chk` (verified name, migration 109 line 79) to add `'download'`; constraint-only, NO types regen; full runbook in spec §4 (incl. local `action='download'` insert test + metadata-only remote verification)
3. Owner approval of migration 110, then endpoint + utils + tests per spec §2/§3/§5/§6
4. Endpoint specifics locked: pure proxy; OMIT Content-Length; `Content-Disposition: attachment` (owner decision); allowed-log → fetch → stream order; `storage_download_failed` correction row; malformed-id log purity (Decision G)

### Constraints

- Production enablement still blocked by Decision C's five gates (retention, AV gap, prod policy gate, h3 canary in CI, read-only prod verification)
- Fluid Compute guard (Decision D impact 2): plan an enforced CI/deploy-time `resourceConfig.fluid === true` assertion; if disabled → re-spike before production
- Bucket cap coupling (Decision D impact 3): raising the 10 MB KYC bucket limit requires a re-spike first
- Immutable-log verification stays read-only / metadata-only (Decision A); never insert probe rows remotely

---

## Claude Code → Claude Code / 2026-06-05 (Phase 1B upload endpoint shipped — next: Phase 2 download)

### State at handoff

- Branch: `staging`
- Tip commit: `010ee9b feat(kyc): add document upload endpoint` — pushed; `origin/staging` in full sync
- Migration 109 live on remote (bucket `kyc-profile-documents` + append-only `kyc_document_access_log`); remote storage-policy gate passed (zero `storage.objects` policies)
- `npx tsc --noEmit`: clean · 165/165 targeted tests pass
- No migration added in Phase 1B; `database.types.ts` untouched since `1f10a03`

### What was completed (see progress.md 2026-06-04/05 session + decisions.md 2026-06-05 entries)

- Phase 1B upload endpoint + utils + safe serializer + 124 tests (incl. real-h3 integration proof of the `req.rawBody` capped-buffer handoff + h3 upgrade canary)
- Two Opus review rounds: 5 blockers fixed (real-h3 proof, typed access-log Insert + breadcrumb, customer_type×identity_type coherence, issued_at/expires_at capture, full 8-byte PNG signature)
- Session docs committed (this commit) BEFORE Phase 2 per decisions.md 2026-06-05 Decision A

### IMMEDIATE NEXT ACTION: Phase 2 — download endpoint (decisions.md 2026-06-05 Decision B)

- **super_admin-only** server-mediated download; signed URL issued ONLY after `logKycDocumentAccess(..., { failClosed: true })` succeeds
- Denied non-super_admin attempts: log WITHOUT loading the document row; **uniform 403** — must not reveal whether the document exists
- Download and purge are SEPARATE commits; purge primitive DEFERRED until legal retention scope is decided; no HTTP delete endpoint
- Production enablement stays blocked behind decisions.md 2026-06-05 Decision C (retention, AV gap, prod policy gate re-run, h3 canary in prod CI, read-only prod verification)

### Constraints

- Do NOT regenerate types (schema unchanged since `1f10a03`)
- Do NOT touch pre-existing dirty files (home rails, locale JSONs, DESIGN.md, PRODUCT.md, .claude/skills, .impeccable)
- Immutable-log verification: read-only / metadata-only — never insert probe rows (the one permanent probe row is documented below, 2026-06-04 note)

---

## Claude Code → Claude Code / 2026-06-02 (TASK 4.1b audit complete — ready to implement)

### State at handoff

- Branch: `staging`
- Tip commit: `bf32905 chore(types): regenerate database types for KYC snapshot schema`
- `origin/staging` in full sync with local at `bf32905` — no divergence
- Migration 106 is live on remote/staging (verified all 10 schema checks)
- `app/types/database.types.ts` regenerated and pushed (migration 106 KYC columns present)
- `npx tsc --noEmit`: clean (exit 0)

### What was completed this session

1. **Migration 106 remote gate** — dry-run confirmed only 106 pending (102 already applied, not re-run). Applied via `supabase db push --linked`. All 10 schema verification checks passed on remote.

2. **DB types regeneration** — `supabase gen types typescript --project-id yzjczvzwmbbeyoodrjwm --schema public`. Confirmed all 6 migration 106 KYC columns in generated types. Committed `bf32905`, pushed to `origin/staging`.

3. **TASK 4.1b audit (read-only)** — full code-path survey of pickup readiness + confirm pickup. Implementation plan locked. No files changed.

### IMMEDIATE NEXT ACTION: Implement TASK 4.1b

**One commit.** Opus 4.8 review required before push.

**Commit message**: `feat(kyc): resolve walk-in KYC via booking.kyc_profile_id + write pickup snapshot (TASK 4.1b)`

#### Files to change

**`server/utils/rental-pickup-readiness.ts`**

1. `PICKUP_READINESS_BOOKING_SELECT` (line 104): add `, kyc_profile_id`
2. `loadRentalPickupReadiness` — walk-in branch in the `kycProfilesResult` slot of `Promise.all` (currently line 406–413):
   - Old: `Promise.resolve({ data: [], error: null })` always
   - New three-way: `userId` → existing (unchanged) · `!userId && kycProfileId` → `.from("kyc_profiles").select(KYC_PROFILE_SELECT).eq("id", kycProfileId).limit(1)` · `!userId && !kycProfileId` → empty array (unchanged)
   - `kycProfileId` = `nullableText(bookingRow.kyc_profile_id)`

**`server/utils/rental-fulfillment.ts`**

1. `CURRENT_BOOKING_SELECT` (line 101): add `, kyc_profile_id`
2. Local `KycProfileRow` type (line 21): add `id: string`
3. Override SELECT in `assertPickupCustomerEvidence` (line 255): `"booking_id"` → `"id, booking_id"`
4. Profile SELECT in `assertPickupCustomerEvidence` (line 247): `"status, valid_until, created_at"` → `"id, status, valid_until, created_at"`
5. Walk-in branch in `assertPickupCustomerEvidence` (lines 240–244): when `!userId && rowString(row, "kyc_profile_id")`, query `kyc_profiles` by `.eq("id", kyc_profile_id)` (single row) instead of `kycProfile = null`
6. New interface `KycPickupSnapshot` (local):
   ```ts
   interface KycPickupSnapshot {
     kycProfileId: string | null;
     kycStatusSnapshot: string | null;
     kycValidUntilSnapshot: string | null;
     kycAuthorizedVia: 'verified' | 'override';
     kycOverrideId: string | null;
   }
   ```
7. `assertPickupCustomerEvidence`: change return from `void` to `KycPickupSnapshot`. After gate passes, assemble:
   - `via === "kyc_verified"`: `kycAuthorizedVia='verified'`, `kycProfileId=kycProfile!.id`, `kycStatusSnapshot=kycProfile!.status`, `kycValidUntilSnapshot=kycProfile!.valid_until`, `kycOverrideId=null`
   - `via === "override"`: `kycAuthorizedVia='override'`, `kycOverrideId=overrides[0]?.id ?? null`, `kycProfileId=kycProfile?.id ?? null`, `kycStatusSnapshot=kycProfile?.status ?? null`, `kycValidUntilSnapshot=kycProfile?.valid_until ?? null`
8. `RentalFulfillmentPrerequisites` interface: add `kycSnapshot: KycPickupSnapshot | null`
9. `assertRentalFulfillmentPrerequisites`: capture return from `assertPickupCustomerEvidence`, include in returned prerequisites
10. `completeRentalBookingFulfillment` fulfillment INSERT: spread snapshot fields when `eventType === "pickup" && prerequisites.kycSnapshot`

**`docs/index/server-utils-index.md`**: update `rental-pickup-readiness.ts` row (walk-in path changed) and `rental-fulfillment.ts` row (snapshot write added)

#### Tests to update

**`tests/server/rental-pickup-readiness.spec.ts`**:
- `booking()` fixture: add `kyc_profile_id: null` default; allow override to `"kyc-1"`
- New tests: walk-in with `kyc_profile_id` → verified → ready · walk-in with expired profile → blocked with `kycReason: "expired"` · walk-in with `kyc_profile_id = null` → still `no_profile` blocked
- Update test label for "deferred to TASK 4" walk-in test

**`tests/server/utils/rental-fulfillment.spec.ts`**:
- `baseKycProfile`: add `id: "kyc-1"`
- `baseBooking`: add `kyc_profile_id: "kyc-1"` for registered cases; null for walk-in
- Override entries: add `id: "override-1"` alongside existing `booking_id`
- New tests: walk-in with `kyc_profile_id` set + verified → succeeds · walk-in with `kyc_profile_id = null` → blocked · snapshot columns present on pickup success (`kyc_authorized_via = 'verified'`) · override snapshot (`kyc_authorized_via = 'override'`, `kyc_override_id` set) · return event → snapshot null
- Update "walk-in → TASK 4 deferred" test description

#### Key constraints

- Snapshot columns must NEVER feed back into gate resolution — write-only audit evidence
- `assertPickupCustomerEvidence` must use fresh `new Date()` (already does — keep as-is)
- Walk-in with `kyc_profile_id = null` → `no_profile` → blocked (unchanged behavior, new code path)
- Registered bookings: `user_id` path takes precedence; `kyc_profile_id` column not used for registered
- `kyc.ts` unchanged — no new exports needed
- Opus 4.8 review before push (security-core pickup gate + snapshot write)

### Unstaged / untracked (pre-existing — leave alone)

```
 M app/components/home/HomeCategoryShortcutRail.vue
 M app/components/home/HomeHorizontalRail.vue
 M decisions.md
 M handoff.md
 M i18n/locales/cn.json
 M i18n/locales/en.json
 M i18n/locales/jp.json
 M i18n/locales/th.json
 M progress.md
?? .claude/skills/
?? .impeccable/
?? DESIGN.md
?? PRODUCT.md
```

---

## Claude Code → Claude Code / 2026-06-02 (migration 102 pushed — reset blocker resolved)

### State at handoff

- Branch: `staging`
- Tip commit: `4aba307 fix(branches): make LKB dedup migration reset-safe`
- `origin/staging` in full sync with local at `4aba307` — **no divergence**
- `supabase db reset --local`: **PASSES** — all 106 migrations apply cleanly in sequence
- `npx tsc --noEmit`: clean (exit 0)

### What was completed this session

**Pre-apply verification (two checks):**

1. `store_branches` INSERT column completeness — all NOT NULL / no-default columns confirmed supplied in the seed INSERT (`id`, `code`, `name_th`, `name_en`, `is_active`, `is_public`, `sort_order`). No missing required columns.
2. `is_public` for `branch-e12b7a81` — confirmed `TRUE`, set explicitly in both the seed INSERT and the UPDATE. Not relying on `DEFAULT false`.

**Migration 102 fix committed and pushed:**

Commit `4aba307 fix(branches): make LKB dedup migration reset-safe`
- Removed hardcoded `inventory_id = 'e4ad1acc-66df-407e-96c1-6bf87d5b68f4'` from statement 4
- Added statement 1a: `INSERT INTO store_branches … ON CONFLICT (id) DO NOTHING` — seeds `branch-e12b7a81` on fresh reset with `is_public = TRUE`; triggers `store_branches_after_insert_seed_inventories_trg` to auto-create Default + Rental inventories via `gen_random_uuid()`
- Statement 4 now uses dynamic subquery: `SELECT id FROM inventories WHERE branch_id = 'branch-e12b7a81' AND name = 'Default' LIMIT 1`
- Defensive `AND EXISTS` guard so UPDATE is a safe no-op if Default inventory is absent
- Fix is idempotent on staging (branch already exists → `ON CONFLICT DO NOTHING`; sku rows already migrated → `WHERE branch_id = 'store-nikhom-lkb'` matches nothing)

**Push:**
- `git push origin staging` → fast-forward `1f151b1..4aba307`
- Staged and committed only `supabase/migrations/102_lkb_branch_public_and_dedup.sql` — no unrelated files included

**SQL verification (post-reset):**
- `branch-e12b7a81`: exists, `is_active=t`, `is_public=t`
- Exactly 1 Default inventory for `branch-e12b7a81` (fresh `gen_random_uuid()` — hardcoded UUID absent)
- All 8 `sku_branch_inventory` rows: `branch_id=branch-e12b7a81`, `branch_code=LKB`, `inventory_id` → dynamically resolved Default
- `store-nikhom-lkb`: `is_active=f`, `is_public=f`
- `rental_bookings.kyc_profile_id` (uuid, nullable) — migration 106 confirmed applied
- `rental_booking_fulfillments` KYC snapshot columns: `kyc_profile_id`, `kyc_status_snapshot`, `kyc_valid_until_snapshot`, `kyc_authorized_via`, `kyc_override_id` — all present

### IMMEDIATE NEXT ACTIONS (in order)

**Step 1 — Regenerate DB types**

Migration 106 is now on staging and in the reset-clean chain. Types are stale.

```bash
supabase gen types typescript --linked > app/types/database.types.ts
git add app/types/database.types.ts
git commit -m "chore(db): regenerate types from staging schema (post-migration 106)"
git push
```

**Step 2 — TASK 4.2: KYC lookup API endpoint**

New file: `server/api/admin/kyc/profiles/lookup.get.ts`
- Auth: `requirePlatformAdmin(event)`
- Query params: `identityType` (`national_id | juristic_id | passport`), `rawValue`
- Server-side: call `hashKycIdentity(identityType, rawValue)` from `server/utils/kyc.ts`
- Query: `SELECT … FROM kyc_profiles WHERE identity_hash = $hash ORDER BY created_at DESC`
- Return: profile (status, identity_last4, customer_type, etc.) or `{ profile: null }`
- Raw identity value must NEVER be logged or stored — only the hash hits the DB
- Update `docs/index/server-utils-index.md` if a new server util is created

**Step 3 — TASK 4 (UI + API + gate wiring)** — see prior handoff entry for full spec

### Unstaged / untracked (pre-existing — leave alone)

```
 M app/components/home/HomeCategoryShortcutRail.vue
 M app/components/home/HomeHorizontalRail.vue
 M decisions.md
 M handoff.md
 M i18n/locales/cn.json
 M i18n/locales/en.json
 M i18n/locales/jp.json
 M i18n/locales/th.json
 M progress.md
?? .claude/skills/
?? .impeccable/
?? DESIGN.md
?? PRODUCT.md
```

None of these are staged or committed. Stage and commit session docs (`decisions.md`, `handoff.md`, `progress.md`) as a separate docs commit if desired before continuing.

### Constraints

- Do NOT run `supabase db push` — migrations 105 and 106 are already on staging
- Do NOT regenerate types until Step 1 above is run (linked project = staging)
- `KYC_HASH_SECRET` must be set in env before any hash-based lookup or create route is tested
- All new KYC intake code must call `hashKycIdentity` — never `hashIdentity` directly on raw input
- `kyc_authorized_via` in fulfillment snapshot: write `'verified'` or `'override'` only
- Snapshot consistency (`verified → kyc_profile_id NOT NULL`, `override → kyc_override_id NOT NULL`) enforced by application at INSERT time
- Model strategy: Sonnet 4.6 drafts; Opus 4.8 reviews security-core (KYC hashing, RLS, pickup gate changes) before commit

---

## Claude Code → Claude Code (new terminal) / 2026-06-01 (migration 102 fix + migration 106 ready to push)

### State at handoff

- Branch: `staging`
- Local-only commit (NOT pushed): `fc9f281 feat(kyc): add booking KYC link and pickup snapshot schema`
  - Contains only: `supabase/migrations/106_kyc_booking_link_and_pickup_snapshot.sql`
- Unstaged/uncommitted modified file: `supabase/migrations/102_lkb_branch_public_and_dedup.sql`
  - The 102 fix is **not yet committed**
- Unstaged: `decisions.md`, `handoff.md`, `progress.md` (session docs — stage and commit as usual)
- `npx tsc --noEmit`: clean (exit 0)
- `supabase db reset --local`: **NOW PASSES** — all 106 migrations apply cleanly in sequence

### What was completed this session

**TASK 4.1a — Migration 106 reviewed and locally committed:**

File: `supabase/migrations/106_kyc_booking_link_and_pickup_snapshot.sql`

- `rental_bookings.kyc_profile_id UUID NULL` FK → `kyc_profiles(id)` ON DELETE SET NULL + index + comment
- `rental_booking_fulfillments`: 5 KYC pickup-time snapshot columns + 1 allowed-values CHECK + 2 FKs + 2 indexes + 5 comments
- Two snapshot-consistency CHECKs (`chk_fulfillment_kyc_verified_has_profile`, `chk_fulfillment_kyc_override_has_id`) were **removed** after review — they conflict with `ON DELETE SET NULL` (FK cascade would set UUID to NULL while `kyc_authorized_via` stays `'verified'`/`'override'`, violating the CHECK). Consistency is enforced by the application's atomic INSERT at confirmPickup time instead.
- Commit: `fc9f281` — local only, **not pushed**

**Migration 102 reset blocker — audited and fixed:**

Root cause: `102_lkb_branch_public_and_dedup.sql` statement 4 hardcoded inventory UUID `e4ad1acc-66df-407e-96c1-6bf87d5b68f4` (canonical Default pool for `branch-e12b7a81`). That branch was created out-of-band on staging before migration 102 was written. On fresh `db reset --local`, the branch and its inventory never existed, causing the `sku_branch_inventory_sync_branch_id_trg` trigger (migration 021) to raise `SQLSTATE P0001`.

Fix applied to `102_lkb_branch_public_and_dedup.sql` (3 hunks, NOT yet committed):
1. Added statement 1a: `INSERT INTO store_branches (branch-e12b7a81 …) ON CONFLICT (id) DO NOTHING` — causes the `store_branches_after_insert_seed_inventories_trg` (migration 023) to auto-create Default + Rental inventories via `gen_random_uuid()`. `is_public = TRUE` set explicitly.
2. Replaced hardcoded `inventory_id = 'e4ad1acc-...'` with dynamic subquery: `(SELECT id FROM inventories WHERE branch_id = 'branch-e12b7a81' AND name = 'Default' LIMIT 1)`.
3. Added `AND EXISTS (...)` guard so the UPDATE is a safe no-op if the Default inventory is absent.

SQL verification after reset confirms:
- `branch-e12b7a81` exists, `is_active=t`, `is_public=t`
- Exactly 1 Default inventory for `branch-e12b7a81` (fresh `gen_random_uuid()` — NOT `e4ad1acc-...`)
- Hardcoded UUID `e4ad1acc-...` does NOT exist in `inventories` (not needed)
- All 8 `sku_branch_inventory` rows remapped: `branch_id=branch-e12b7a81`, `branch_code=LKB`
- `store-nikhom-lkb`: `is_active=f`, `is_public=f`
- Migration 106 reached and applied: `rental_bookings.kyc_profile_id` and all 5 fulfillment KYC columns confirmed present

### IMMEDIATE NEXT ACTIONS (in order)

**Step 1 — Commit migration 102 fix**

```bash
git add supabase/migrations/102_lkb_branch_public_and_dedup.sql
git commit -m "fix(db): make migration 102 self-contained — seed canonical LKB branch and use dynamic inventory lookup"
```

**Step 2 — Commit session docs**

```bash
git add decisions.md handoff.md progress.md
git commit -m "docs: record TASK 4.1a review + migration 102 reset blocker fix session"
```

**Step 3 — Push both commits to staging**

```bash
git push
```

Confirm remote accepts both commits. Migration 102 change is safe on staging: `ON CONFLICT (id) DO NOTHING` skips the branch INSERT (branch already exists), dynamic lookup finds the existing `e4ad1acc-...` inventory unchanged.

**Step 4 — Regenerate DB types**

Migration 106 adds columns to `rental_bookings` and `rental_booking_fulfillments`. Types are stale.

```bash
supabase gen types typescript --linked > app/types/database.types.ts
git add app/types/database.types.ts
git commit -m "chore(db): regenerate types from staging schema (post-migration 106)"
git push
```

**Step 5 — Continue TASK 4.2: KYC lookup API endpoint**

New file: `server/api/admin/kyc/profiles/lookup.get.ts`
- Auth: `requirePlatformAdmin(event)`
- Query params: `identityType` (`national_id | juristic_id | passport`), `rawValue`
- Server-side: call `hashKycIdentity(identityType, rawValue)` from `server/utils/kyc.ts`
- Query: `SELECT … FROM kyc_profiles WHERE identity_hash = $hash ORDER BY created_at DESC`
- Return: profile (status, identity_last4, customer_type, etc.) or `{ profile: null }`
- Raw identity value must NEVER be logged or stored — only the hash hits the DB
- Add row to `docs/index/server-utils-index.md` if a new server util is created

### DO NOT TOUCH (pre-existing dirty — leave alone)

- `app/pages/index.vue` (M — pre-existing, unrelated)
- `app/components/home/HomeCategoryShortcutRail.vue` (M — pre-existing, unrelated)

### Constraints

- Do NOT run `supabase db push` until Step 3 above (sequential — 102 fix must go with 106)
- Do NOT regenerate types until migration 106 is on staging (Step 3 before Step 4)
- `KYC_HASH_SECRET` must be set in env before any hash-based lookup or create route is tested
- All new KYC intake code must call `hashKycIdentity` — never `hashIdentity` directly on raw input
- `kyc_authorized_via` in fulfillment snapshot: write `'verified'` or `'override'` only — CHECK constraint rejects anything else
- Snapshot consistency (`verified → kyc_profile_id NOT NULL`, `override → kyc_override_id NOT NULL`) enforced by application at INSERT time, not by DB CHECK
- Model strategy: Sonnet 4.6 drafts; Opus 4.8 reviews security-core (KYC hashing, RLS, pickup gate changes) before commit

### git status at handoff

```
 M decisions.md
 M handoff.md
 M progress.md
 M supabase/migrations/102_lkb_branch_public_and_dedup.sql
?? .claude/skills/
```

Commit `fc9f281` (migration 106) is local only — not yet pushed.

---

## Claude Code → Claude Code (new terminal) / 2026-05-31 (TASK 4.1a done → Opus review + TASK 4.2)

### State at handoff

- Branch: `staging`
- Tip commit: `1f151b1 feat(kyc): wire KYC pickup gate into readiness + confirm (TASK 3)`
- Working tree: **one untracked file** — `supabase/migrations/106_kyc_booking_link_and_pickup_snapshot.sql`
  - Everything else: `handoff.md`, `progress.md` pre-existing uncommitted session docs (not new)
- Test suite: 1923 total, 1903 pass, 20 pre-existing failures (unchanged — no code touched this session)
- `npx tsc --noEmit`: clean

### What was completed this session

**TASK 4.0 audit (read-only):** Full pre-implementation survey of POS V3 KYC mode — mapped what exists vs. what TASK 4 must build. No files changed.

**TASK 4.0b audit (read-only):** Walk-in customer entity model audit — confirmed `walk_in_customers` is phone-primary (no UUID id), `rental_bookings` has no stable UUID FK to walk-in entity. Architecture decision locked: KYC is identity-hash-rooted via `kyc_profiles`, not phone-rooted. See DECISIONS.md 2026-05-31 (TASK 4.0b + 4.1a).

**TASK 4.1a — Migration 106 created (NOT committed):**
- File: `supabase/migrations/106_kyc_booking_link_and_pickup_snapshot.sql`
- `rental_bookings.kyc_profile_id UUID NULL FK → kyc_profiles(id) ON DELETE SET NULL` + index
- `rental_booking_fulfillments`: 5 KYC snapshot columns + 3 CHECK constraints + 2 indexes
- Validated on local DB via `docker exec supabase_db_hop-rental psql` (reset failed at mig 102, see below)
- `npx tsc --noEmit` clean

### DO NOT TOUCH (pre-existing dirty — leave alone)

- `app/pages/index.vue` (M — pre-existing)
- `app/components/home/HomeCategoryShortcutRail.vue` (M — pre-existing)

### IMMEDIATE NEXT ACTION

**Step 1 — Opus 4.8 review of migration 106 (security-core schema change — required before commit)**

Prompt Opus with:
- The full diff of `supabase/migrations/106_kyc_booking_link_and_pickup_snapshot.sql`
- `docs/kyc-pos-v3-design.md` §3, §4, §9 (pickup gate, identity model, override model)
- `decisions.md` 2026-05-31 (TASK 4.0b + TASK 4.1a blocks)
- Review focus: FK direction correctness, CHECK constraint completeness, ON DELETE SET NULL safety, RLS grant analysis, snapshot-vs-gate separation

**Step 2 — After Opus GO: commit migration 106**

```bash
git add supabase/migrations/106_kyc_booking_link_and_pickup_snapshot.sql
git commit -m "feat(kyc): add walk-in booking KYC link + pickup fulfillment snapshot (TASK 4.1a)"
```

**Step 3 — Regenerate DB types**

```bash
supabase gen types typescript --linked > app/types/database.types.ts
git add app/types/database.types.ts
git commit -m "chore(db): regenerate types from staging schema (post-migration 106)"
```

**Step 4 — TASK 4.2: KYC lookup API endpoint**

New file: `server/api/admin/kyc/profiles/lookup.get.ts`
- Auth: `requirePlatformAdmin(event)`
- Query params: `identityType` (national_id | juristic_id | passport), `rawValue` (raw identity string)
- Server-side: call `hashKycIdentity(identityType, rawValue)` from `server/utils/kyc.ts`
- Query: `SELECT ... FROM kyc_profiles WHERE identity_hash = $hash ORDER BY created_at DESC`
- Return: profile (with status, identity_last4, customer_type, etc.) or `{ profile: null }`
- Raw identity value must NEVER be logged or stored — only the hash is used in the query
- Add to `docs/index/server-utils-index.md` if a new server util is created

**Step 5 — TASK 4 (main): POS V3 KYC mode UI + API routes**

See `docs/kyc-pos-v3-design.md §10, §4, §8, §11` for the full spec.

New API routes needed (all require `requirePlatformAdmin`):
- `server/api/admin/kyc/profiles/index.post.ts` — create profile
- `server/api/admin/kyc/profiles/[id]/documents.post.ts` — upload to private `kyc-documents` bucket + insert `kyc_documents` row
- `server/api/admin/kyc/profiles/[id]/verify.post.ts` — set verified + compute `valid_until` via `computeValidUntil`

New component: `app/components/admin/pos/AdminPosV3KycContainer.vue`
- Identity input (type selector + raw value field)
- Hash + lookup via new endpoint
- Profile display (status, last4, docs uploaded)
- Create profile form if not found
- Document upload (id_card required; signature required; company docs for company type)
- Verify CTA

Wire into `app/pages/admin/pos-v3/index.vue`:
- Add `v-if="activeMode === 'kyc'"` section mounting `AdminPosV3KycContainer`
- Pass `userContext` (resolved user) to the container when available
- After KYC attach: set `rental_bookings.kyc_profile_id` on the booking via PATCH endpoint

**Step 6 — TASK 4 gate wiring (after UI is done)**

Update `server/utils/rental-pickup-readiness.ts`:
- Walk-in path: read `rental_bookings.kyc_profile_id` → look up `kyc_profiles` by that ID
- (Current code still queries by `walk_in_phone` from the old design — replace)

Update `server/utils/rental-fulfillment.ts` `assertPickupCustomerEvidence`:
- Same: use `rental_bookings.kyc_profile_id` for walk-in lookup
- Write KYC snapshot columns to `rental_booking_fulfillments` at INSERT time

Both files require Opus 4.8 review before commit.

### Known local environment issue

`supabase db reset --local` and `supabase db push --local` both fail at migration 102 (`sku_branch_inventory` update references inventory UUID `e4ad1acc-...` not present in local seed). This is a pre-existing issue unrelated to KYC work.

**Workaround for local migration validation:**
Apply migrations directly via docker:
```bash
docker exec -i supabase_db_hop-rental psql -U postgres -d postgres < supabase/migrations/NNN_name.sql
```

Validate with:
```bash
docker exec supabase_db_hop-rental psql -U postgres -d postgres -c "SELECT ..."
```

### Constraints

- Do NOT run `supabase db push` to staging — migration 106 must get Opus review first
- Do NOT regenerate types until migration 106 is committed to staging
- Do NOT touch DO-NOT-TOUCH files above
- KYC_HASH_SECRET must be set before any hash-based lookup or create route is tested
- All new KYC intake: call `hashKycIdentity` — never `hashIdentity` directly
- `kyc_authorized_via` in fulfillments snapshot: write 'verified' or 'override' only — CHECK constraints will reject anything else

---

## Claude Code → Claude Code (new terminal) / 2026-05-31 (TASK 3 done → TASK 4)

### State at handoff

- Branch: `staging`
- Tip commit: `1f151b1 feat(kyc): wire KYC pickup gate into readiness + confirm (TASK 3)`
- Working tree: **clean** (all TASK 3 files committed and pushed)
- Test suite: 1923 total, 1903 pass, 20 pre-existing failures (unchanged)
- `npx tsc --noEmit`: clean

### What was completed this session

TASK 3 — KYC pickup gate wired into both gate points:
- `server/utils/rental-pickup-readiness.ts`: reads `kyc_profiles` + `kyc_pickup_overrides`, calls `resolvePickupKyc`
- `server/utils/rental-fulfillment.ts`: `assertPickupCustomerEvidence` replaced with fresh `kyc_profiles`-based gate (TOCTOU-safe `new Date()`)
- `docs/index/server-utils-index.md`: new `rental-pickup-readiness.ts` row; updated `rental-fulfillment.ts` and `kyc.ts` rows
- `docs/kyc-pos-v3-design.md §9`: override no-expiry / TASK 6 deferral note added
- All session decisions recorded in `decisions.md`

Reviewed: Opus 4.8 — GO (no blockers)

### DO NOT TOUCH (pre-existing dirty/unrelated — leave alone)

These files have pre-existing uncommitted changes. Do NOT stage or modify them:
- `app/pages/index.vue`
- `app/components/home/HomeCategoryShortcutRail.vue`
- `scripts/translate-i18n.mjs` (already deleted, do not re-create)

### Immediate next action: TASK 4

**TASK 4 — POS V3 KYC mode UI** (lookup, submit, verify) per `docs/kyc-pos-v3-design.md §10 + §4`.

Entry point: POS V3 "KYC mode" tab — staff looks up customer by identity, finds/creates `kyc_profiles` row, submits documents, marks verified.

Key design references:
- `docs/kyc-pos-v3-design.md §4` — identity normalization + `hashKycIdentity` contract
- `docs/kyc-pos-v3-design.md §4a` — v1 HMAC format (permanent — do not change)
- `docs/kyc-pos-v3-design.md §8` — KYC type requirements (individual vs company)
- `docs/kyc-pos-v3-design.md §11` — staff/super_admin authority
- Migration 105 — `kyc_profiles`, `kyc_documents`, `kyc_pickup_overrides` schema + RLS

Model strategy: Sonnet 4.6 drafts; Opus 4.8 reviews security-core (hashing, RLS, profile create/verify) before commit.

### Open items carried forward

1. **TASK 4/5** — walk-in guard idiom unification: `rental-pickup-readiness.ts` uses `userId === ""` (empty string), `rental-fulfillment.ts` uses `if (userId)` (falsy). Unify behind one predicate when walk-in path grows.
2. **TASK 5** — i18n / frontend rendering: add th/en/cn/jp keys for `kyc_pickup_gate_blocked`, `kycReason` values (`expired`, `pending`, `rejected`, `revoked`, `no_profile`), and `kyc_pickup_via_override`. Audit readiness UI for raw English message leakage.
3. **TASK 6** — override expiry: add `valid_until` to `kyc_pickup_overrides` (new migration), update gate. Requires Opus review. Do NOT implement before TASK 6.

### Constraints

- Do NOT run `supabase db push` — migration 105 already on staging
- Do NOT regenerate types unless a new migration is added
- Do NOT touch DO-NOT-TOUCH files above
- KYC_HASH_SECRET must be set in env before testing identity hashing
- All new KYC intake code must call `hashKycIdentity` — never `hashIdentity` directly on raw input

---

## Claude Chat → Claude Code / 2026-05-29

### Task 1: CLAUDE.md system audit and repair
Files touched:
- `claude.md` — fixed `platform_role` enum bug (line 100), fixed server route example (used `serverSupabaseClient`), added Sub-guides section, added strict i18n rules
- `.claudeignore` — added 4 new exclusions, removed duplicate entry
- `.claude/settings.json` — created with `bgIsolation: none`
- Created: `app/components/claude.md`, `server/api/claude.md`, `supabase/claude.md`, `docs/claude.md`, `app/composables/claude.md`, `server/utils/claude.md`, `app/pages/claude.md`, `tests/server/claude.md`, `app/mappers/claude.md`

Status: Complete. All 9 sub-guides written. Root claude.md corrected.

Next: No action needed. Sub-guides will auto-load via the Sub-guides index in root claude.md.

---

### Task 2: Production Google OAuth first-login auth/profile race fix
Files touched:
- `app/pages/user/confirm.vue` — replaced `watchEffect` with async `watch`, added `didRedirect` ref, calls `clearProfile()` + awaits `refreshProfile()` + uses `navigateTo(..., { replace: true })`
- `app/composables/useUserProfile.ts` — added `clearProfile()` (resets `profile` and `error` to null) and `refreshProfile()` (wraps `fetchProfile(true)`), both exposed in return value
- `app/composables/useAuthSession.ts` — destructures `clearProfile` from `useUserProfile`, calls it before `navigateTo("/user/login")` in logout
- `tests/server/auth-confirm-oauth-race.spec.ts` — new file, 22 source-inspection tests

Status: Code complete. Not committed. Awaiting production validation.

Validation:
- `npx tsc --noEmit` → 0 errors
- 25/25 targeted tests pass (auth-confirm-oauth-race, user-profile-api, admin-layout-role-badge-ui)
- 1837/1857 total tests pass — 20 failures are pre-existing POS V2/V3 failures, confirmed unrelated

Remaining risk:
- If `@nuxtjs/supabase` writes the HttpOnly session cookie asynchronously after `SIGNED_IN` fires, the first `refreshProfile()` attempt could still get a 401. The catch block redirects anyway. The `admin.vue` `ensureProfileLoaded()` on mount acts as the fallback for admin pages. Non-admin pages have no fallback — consider adding `ensureProfileLoaded()` to the default layout.

Do not commit/push until production smoke test passes.

---

## Claude Code → Claude Code / 2026-05-30

### KYC Foundation — TASK 1, TASK 2, TASK 2.1

#### TASK 1: Migration 105 — `supabase/migrations/105_kyc_foundation.sql`
Status: **DONE — pushed to staging, commit `31181e9`**

- 3 new ENUMs: `kyc_customer_type`, `kyc_identity_type`, `kyc_document_type`; extended `kyc_status` with `expired` + `revoked`
- Tables: `kyc_profiles`, `kyc_documents`, `kyc_pickup_overrides` with full RLS, indexes, `updated_at` trigger
- `branch_id` / `verified_branch_id` are `text` (matches `store_branches.id` text PK)
- `booking_id` in `kyc_pickup_overrides` is `uuid` → `rental_bookings(id)` FK
- `kyc-documents` bucket updated to 20 MB
- Reviewed: Opus 4.8 `PASS`, no blockers

#### TASK 2 + TASK 2.1: KYC server utils + identity normalization + v1 hash contract
Status: **DONE — pushed to staging**
- `a43eafb` — `chore(db): commit generated database types from staging schema (post-migration 105)`
- `b2105d1` — `feat(kyc): identity normalization + v1 hash contract (TASK 2 + 2.1)`

Files committed:
- `server/utils/kyc.ts` — 8 pure exported functions: `hashIdentity`, `maskLast4`, `normalizeKycIdentity`, `hashKycIdentity`, `computeKycReadiness`, `canVerifyCompanyCert`, `computeValidUntil`, `hasValidPickupOverride`, `resolvePickupKyc`
- `tests/server/kyc.spec.ts` — 45/45 tests pass, tsc clean
- `app/types/database.types.ts` — regenerated (kyc_profiles, kyc_documents, kyc_pickup_overrides live)
- `.env.example` — `KYC_HASH_SECRET=replace-with-secure-random-secret`
- `docs/kyc-pos-v3-design.md §4a` — v1 HMAC format + permanence contract documented

Hash contract (v1, PERMANENT): `hashIdentity(\`v1:${identityType}:${normalizedValue}\`)`
Reviewed: Opus 4.8 PASS — no blockers

---

## Claude Code → Claude Code / 2026-05-31 (TASK 3)

Task: Wire KYC gate into pickup readiness + confirm pickup.

Files touched:
- `server/utils/rental-pickup-readiness.ts` — new `selectBestKycProfile` helper; `buildRentalPickupReadiness` gets `kycProfile` + `kycOverrides` inputs; KYC block replaced with `resolvePickupKyc`; `loadRentalPickupReadiness` adds `kyc_profiles` + `kyc_pickup_overrides` queries to Promise.all; `users` SELECT reduced to `id, full_name, phone`; `walk_in_customers` SELECT reduced to `phone, full_name`
- `server/utils/rental-fulfillment.ts` — `resolvePickupKyc` import; `selectBestKycProfile` helper; `assertPickupCustomerEvidence` body replaced with `kyc_profiles` + `kyc_pickup_overrides` resolution (fresh `new Date()` — TOCTOU-safe)
- `docs/index/server-utils-index.md` — new `rental-pickup-readiness.ts` row; updated `rental-fulfillment.ts` row; updated `kyc.ts` row
- `tests/server/rental-pickup-readiness.spec.ts` — full rewrite: swapped `users.kyc_status` mock for `kyc_profiles` + `kyc_pickup_overrides`; 25+ new test cases
- `tests/server/utils/rental-fulfillment.spec.ts` — added `kycProfiles`/`kycOverrides` to scenario and `listResult`; replaced old KYC/walk-in error tests; 12+ new test cases
- `tests/server/pos-v2-pickup-completion.spec.ts` — added `kycProfiles`/`kycOverrides` to mockState + tableResult + beforeEach; updated "rejects when readiness is blocked" test

Status: **in-progress — NOT committed** (pending Opus 4.8 review)

Test results:
- 1923 total tests, 1903 pass, 20 fail (all 20 are pre-existing POS V2/V3 failures — same as before TASK 3)
- New tests: 66 (1923 − 1857 baseline)
- `npx tsc --noEmit` → clean

Judgment calls made (see DECISIONS.md for full rationale):
- Walk-in → `null` profile → `no_profile` blocked (TASK 4 deferred)
- `idEvidencePresent = false` (shape-compat, hollow — TASK 4 decides)
- Blocker code: `customer_kyc_not_verified` → `kyc_pickup_gate_blocked` + `context.kycReason`
- Override path emits warning `kyc_pickup_via_override` (not a blocker)
- `mockClient` in fulfillment test defaults to blocked-by-default; non-KYC tests opt in with `kycProfiles: [baseKycProfile]` explicitly

Open items (non-blocking — carry to TASK 4/5):

1. **Walk-in guard idiom cleanup** — behavior is correct in TASK 3, but the two gate files detect walk-in differently:
   - `rental-pickup-readiness.ts`: keyed on `userId === ""` (empty string from `text()` helper)
   - `rental-fulfillment.ts`: keyed on `if (userId)` (falsy check)
   Both are safe today, but TASK 4/5 should unify behind one explicit predicate (e.g. `const isWalkIn = !userId`) to prevent future drift as the walk-in path grows.

2. **TASK 5 i18n / frontend rendering** — TASK 3 emits machine codes only:
   - Blocker code: `kyc_pickup_gate_blocked`
   - `kycReason` context values: `expired`, `pending`, `rejected`, `revoked`, `no_profile`
   - Warning code: `kyc_pickup_via_override` (override-warning display belongs here, not TASK 6)
   TASK 5 must: (a) render staff-facing UI from these codes — never display raw `statusMessage` strings to users; (b) add th/en/cn/jp i18n keys for each code; (c) audit current readiness UI to confirm it does not leak raw English blocker messages — fix in TASK 5 if it does.

3. **TASK 6 override expiry (backend only)** — `kyc_pickup_overrides` currently has no expiry column. Deferred because no override rows exist until TASK 6 builds the super_admin creation UI. TASK 6 must:
   - Add `valid_until timestamptz NULL` (or equivalent) to `kyc_pickup_overrides` via a new migration
   - Update `hasValidPickupOverride` / `resolvePickupKyc` gate to honor expiry (live check, same pattern as KYC `valid_until`)
   - Super_admin override creation must set an expiry at write time
   - Requires Opus review before implementation (schema + gate change)
   Do NOT implement any expiry logic before TASK 6. Do NOT assign override-display or i18n to TASK 6.

Status: **DONE — Opus 4.8 GO — committed `1f151b1`, pushed to staging.**

Next: TASK 4 (POS V3 KYC mode UI — see below)

### IMMEDIATE NEXT ACTION

1. **TASK 3** — wire `resolvePickupKyc` into `loadRentalPickupReadiness` + `confirmPickup` endpoint
   - Server-authoritative, live `valid_until > now()` compute; reads ONLY `kyc_profiles`
   - Gets Opus 4.8 review before push
2. TASK 4 — POS v3 KYC mode UI (lookup, submit, verify)
3. TASK 5 — pickup container gate + redirect + state preserve (`bookingId`, `returnTo`)
4. TASK 6 — super_admin override + revoke
5. TASK 7 — tests

---

### Open / non-blocking

- **CONFIRMED**: `normalizeKycIdentity` regex `/[\s­-‐-―−]/g` includes `­` (soft hyphen) ✅
- **CONFIRMED**: `docs/kyc-pos-v3-design.md §4a` contains the permanence note ✅
- **Cleanup later**: `supabase/.temp/cli-latest` is tracked by git — `git rm --cached supabase/.temp/cli-latest` + add to `.gitignore`

---

### Constraints for next session

- Branch: `staging`, tip `b2105d1`
- Linked project: `yzjczvzwmbbeyoodrjwm` ("hopnicth's Project") — only project in org, confirmed staging
- Do NOT touch (pre-existing dirty, unrelated to KYC):
  `app/pages/index.vue`, `app/components/home/HomeCategoryShortcutRail.vue`, `scripts/translate-i18n.mjs`
- Do NOT run `supabase db push` — migration 105 already on staging
- Do NOT regenerate types — schema has not changed since last regeneration
- Model strategy: Sonnet 4.6 drafts code; Opus 4.8 reviews security-core (hashing, RLS, pickup gate) before each TASK commit

---

### git status at handoff (after this docs commit)

```
 M app/components/home/HomeCategoryShortcutRail.vue   ← pre-existing
 M app/pages/index.vue                                ← pre-existing
 M supabase/.temp/cli-latest                          ← tracked, cleanup later
?? scripts/translate-i18n.mjs                         ← pre-existing
```

---

## Claude Code → Claude Code (new terminal) / 2026-05-31

Task: Server-utils index phase wrap-up + working-tree housekeeping.
Branch `staging` — in sync with `origin/staging` at `1d9c322`.

Commits this session (all pushed):
- `d18520e` docs(index): rental-ops / inventory / branch-access / admin ops rows (Task 3 commit 2b)
- `f5fa16f` docs(claude): server-utils index maintenance rule (root `claude.md` + `server/utils/claude.md`)
- `b337c3a` chore(git): stop tracking `supabase/.temp/*` (8 cache files untracked via `git rm --cached`; local files kept; already ignored)
- `02f80ea` chore(claude): add shared safe command permissions to `.claude/settings.json`
- `1d9c322` chore(claude): narrow `supabase gen:*` -> `supabase gen types:*`

Note: `02f80ea` accidentally shipped broad `supabase gen:*`; corrected forward in `1d9c322` (chosen over force-push since `02f80ea` was already pushed). Effective state correct, no history rewrite.

Convention confirmed: `.claude/settings.json` = tracked/shared; `.claude/settings.local.json` = git-ignored per-dev.

Status: DONE (server-utils index phase complete; housekeeping done).

Pre-existing dirty/untracked — LEAVE UNTOUCHED unless told (not mine):
- `app/components/home/HomeCategoryShortcutRail.vue` (M — rail no longer `lg:hidden`)
- `app/pages/index.vue` (M — desktop CategoriesCard commented out, main col -> col-span-12)
- `scripts/translate-i18n.mjs` (?? — Gemini i18n translator; conflicts with "no machine translation" i18n rule -> human decision)
- `.claude/commands/edit.md` (?? — new, appeared this session; review separately)
- NOTE: `nuxt.config.ts` (devtools toggle) is NO LONGER dirty as of this handoff.

Next:
- Decide fate of the dirty/untracked files above (UI pair = one logical commit after removing commented-out block; translate script + edit.md = review).
- If continuing index work: extend index to any remaining `server/utils/` files not yet rowed.

---

## Claude Code → Claude Code (new terminal) / 2026-05-31 (session 2)

Task: Working-tree reconciliation + docs-cleanup.
Branch `staging` — in sync with `origin/staging` at `76c2085`. Working tree clean.

Commits this session (all pushed):
- `ae7d327` chore(git): ignore scratch docs and Claude noise (`.gitignore` + `.claudeignore` scratch rules)
- `847d60b` docs: record server-utils index and housekeeping session (session docs from prior session)
- `bf47376` chore(claude): add edit workflow command (`.claude/commands/edit.md`)
- `7aa6665` fix(partners): prevent card chips from increasing card height (`PartnerCard.vue` chip overflow)
- `0c38a86` feat(home): replace desktop categories sidebar with full-width layout (removed `CategoriesCard` sidebar permanently; `HomeCategoryShortcutRail` now all-breakpoint; `HomeHorizontalRail` spacing; `index.vue` full `col-span-12`)
- `76c2085` docs(cleanup): archive scratch planning docs (`20260528 Summary.md` + `augment_final_design_lock...refund.md` → `docs/archive/`; `.claudeignore` repointed; `progress.md` updated)

Discarded (not committed):
- `scripts/translate-i18n.mjs` — rm'd; conflicts with no-machine-translation i18n policy.

Docs audit completed (read-only, no further cleanup):
- `docs/phase-2d-booking-deposit-acceptance-checklist.md` → KEEP (9 inbound guardrail refs; active locked decisions)
- `docs/phase-2e-pos-rental-operational-flow-audit.md` → KEEP (spec for unimplemented POS V3 pickup/return/settlement work)
- `docs/customer-cancellation-refund-handoff.md` → DEFERRED (lean ARCHIVE but open no-show policy questions not confirmed captured elsewhere)

Unused component flagged (not deleted):
- `app/components/categories_card/CategoriesCard.vue` — now fully unused after homepage layout change. Safe to delete in a separate cleanup commit.

Next for new terminal:
1. Confirm whether no-show open questions (late-cancellation policy, undo-no-show, admin dashboard surfacing) are captured in decisions.md or Thai policy file → then archive `docs/customer-cancellation-refund-handoff.md` (1 `git mv` + 1-line `docs/claude.md` table row update).
2. Delete `app/components/categories_card/CategoriesCard.vue` (standalone cleanup commit).
3. Continue KYC TASK 3–7 backlog (unchanged from prior sessions) or extend server-utils index.

Status: DONE (this session complete; working tree clean; all pushes confirmed).

## KYC access-log remote verification probe row (2026-06-04)
A permanent, non-PII verification probe row exists in remote/staging `public.kyc_document_access_log` (the table is append-only by design — DO NOT attempt to delete it):
- id: `f122e850-2c73-49ec-a6c1-12e961f7fd36`
- action: `upload` · result: `allowed` · reason: `remote-verify-probe` · all PII/document fields NULL
Filter it out (e.g. `WHERE reason <> 'remote-verify-probe'`) in any audit/log review.
Process note: future remote verification of immutable logs must be **read-only / metadata-only** (no insert-based checks) so no further permanent probe rows are created.
