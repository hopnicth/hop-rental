# PROGRESS
Last updated: 2026-06-05 (Vercel streaming spike PASS — Phase 2 locked to pure server-proxy download; spec: `docs/kyc-phase-2-download-spec.md`; see session section at bottom + decisions.md Decisions D/E/F/G)

## Done ✅

### Partner KYC / Verification Flow
- `fix(partners)`: protected KYC documents from staff admin responses (sensitive doc isolation)
- `feat(partners)`: added verification upload and action endpoints (partner-side KYC submission)
- `feat(admin-partners)`: added KYC verification card in admin partner detail view

### Rental / Home Content Updates
- `feat`: added Rented Items section to homepage/index
- `feat`: updated admin contact action from message → call (phone-first contact)

### Dev Tooling
- `chore(dev)`: added safe scheduled daily task runner script (`scripts/translate-i18n.mjs` also added)

### CLAUDE.md / Context System
- Fixed `platform_role = 'admin'` bug in root `claude.md` (correct values: `'staff' | 'super_admin'`)
- Fixed server route example in root `claude.md` — replaced `serverSupabaseClient` with `requirePlatformAdmin(event)`
- Added Sub-guides section to root `claude.md` listing all 9 sub-guide files
- Added strict i18n rules section (`[NEEDS_TRANSLATION]` placeholder, grep command)
- Created `app/components/claude.md` — Nuxt UI conventions, card sizing, chip cap, i18n, hover patterns
- Created `server/api/claude.md` — auth guards, Supabase client selection, error codes, query patterns, webhook
- Created `supabase/claude.md` — migration rules, RLS patterns, column-level grants, storage buckets
- Created `docs/claude.md` — doc status system, locked design decisions, UX button pattern
- Created `app/composables/claude.md` — SSR safety, useState keys, $fetch vs useFetch, composable inventory
- Created `server/utils/claude.md` — SELECT strings, validators, mappers, auth guards inventory
- Created `app/pages/claude.md` — route naming, definePageMeta, layout rules
- Created `tests/server/claude.md` — test structure, mock pattern, naming convention
- Created `app/mappers/claude.md` — mapper purpose, naming, prohibited patterns
- Updated `.claudeignore`: added `docs/schema-snapshots/`, `supabase/snippets/`, `20260528 Summary.md`, `supabase/migrations/`; removed duplicate `ข้อมูล up ขึ้น database/`
- Created `.claude/settings.json` with `{"worktree":{"bgIsolation":"none"}}`

### Auth Race Fix (production first-login bug)
- Root cause confirmed: `confirm.vue` called `navigateTo()` before `fetchProfile(true)` completed, leaving `profile.value = null` → role displayed as "Customer"
- `app/composables/useUserProfile.ts` — added `clearProfile()` and `refreshProfile()`, exposed in return value
- `app/pages/user/confirm.vue` — replaced `watchEffect` with async `watch`, added `didRedirect` guard, awaits `refreshProfile()` before `navigateTo()`
- `app/composables/useAuthSession.ts` — added `clearProfile()` call before `navigateTo` in logout
- `tests/server/auth-confirm-oauth-race.spec.ts` — 22 new source-inspection tests, all passing

### KYC Foundation — TASK 1: Migration 105
- Created `supabase/migrations/105_kyc_foundation.sql`
- ENUMs: `kyc_customer_type`, `kyc_identity_type`, `kyc_document_type`; extended `kyc_status` with `expired` + `revoked`
- Tables: `kyc_profiles`, `kyc_documents`, `kyc_pickup_overrides` — all with RLS, indexes, updated_at trigger
- `kyc-documents` bucket updated to 20 MB
- Reviewed: `PASS` by Opus 4.8 — pushed to staging, commit `31181e9`

### KYC Foundation — TASK 2 + TASK 2.1: Server utils + identity normalization + v1 hash contract
- Commits: `a43eafb` (generated types), `b2105d1` (kyc utils + normalization + v1 hash)
- `server/utils/kyc.ts` — 8 pure exported functions: `hashIdentity`, `maskLast4`, `normalizeKycIdentity`, `hashKycIdentity`, `computeKycReadiness`, `canVerifyCompanyCert`, `computeValidUntil`, `hasValidPickupOverride`, `resolvePickupKyc`
- `tests/server/kyc.spec.ts` — 45/45 tests pass, tsc clean
- `docs/kyc-pos-v3-design.md §4a` — v1 HMAC format + permanence contract documented
- `.env.example` — `KYC_HASH_SECRET` placeholder added
- `app/types/database.types.ts` — regenerated (kyc_profiles, kyc_documents, kyc_pickup_overrides live)
- Reviewed: Opus 4.8 PASS — pushed to staging

### KYC Foundation — TASK 3: Wire KYC gate into pickup readiness + confirm pickup
- `server/utils/rental-pickup-readiness.ts` — replaced `users.kyc_status` / `walk_in_customers.id_card_url` gate with `kyc_profiles` + `kyc_pickup_overrides` lookup via `resolvePickupKyc`; `selectBestKycProfile` helper (prefer verified + latest valid_until; fallback to most-recent by created_at)
- `server/utils/rental-fulfillment.ts` — replaced `assertPickupCustomerEvidence` body with `kyc_profiles`-based gate using fresh `new Date()` at confirm time (TOCTOU-safe)
- `docs/index/server-utils-index.md` — added `rental-pickup-readiness.ts` row; updated `rental-fulfillment.ts` row (domain now includes `kyc`); updated `kyc.ts` row with orphan/migration-plan and plaintext-storage rules
- Tests: +66 new tests (1923 total, 1903 pass, 20 pre-existing failures unchanged); `npx tsc --noEmit` clean
- Reviewed: Opus 4.8 GO — committed `1f151b1`, pushed to staging

### KYC Foundation — TASK 4.1a: Migration 106 (walk-in link + pickup snapshot)
- Created `supabase/migrations/106_kyc_booking_link_and_pickup_snapshot.sql`
- `rental_bookings.kyc_profile_id UUID NULL FK → kyc_profiles(id) ON DELETE SET NULL` + index
- `rental_booking_fulfillments`: 5 KYC snapshot columns (`kyc_profile_id`, `kyc_status_snapshot`, `kyc_valid_until_snapshot`, `kyc_authorized_via`, `kyc_override_id`) + 3 CHECK constraints + 2 indexes
- Two snapshot-consistency CHECKs removed after Opus review (conflict with ON DELETE SET NULL cascade); consistency enforced by application at INSERT time
- Reviewed: Opus 4.8 GO — committed `fc9f281`, pushed to staging

### Migration 102 reset blocker — resolved
- Root cause: hardcoded inventory UUID `e4ad1acc-66df-407e-96c1-6bf87d5b68f4` in statement 4 — UUID does not exist on fresh local reset
- Fix: (1) seed `branch-e12b7a81` via `INSERT … ON CONFLICT DO NOTHING` so trigger auto-creates Default inventory; (2) replace hardcoded UUID with dynamic subquery; (3) add `AND EXISTS` guard
- Pre-apply checks: all NOT NULL/no-default columns confirmed supplied; `is_public = TRUE` explicitly set
- Committed `4aba307 fix(branches): make LKB dedup migration reset-safe`, pushed to staging
- `supabase db reset --local` now passes all 106 migrations cleanly; `npx tsc --noEmit` clean

### KYC Foundation — TASK 4.1b: Audit complete
- Full pre-implementation audit of walk-in KYC gate + snapshot write changes
- Exact code paths mapped: `rental-pickup-readiness.ts`, `rental-fulfillment.ts`, both routes
- Implementation plan locked (see HANDOFF.md 2026-06-02 entry)
- DB types regenerated post-migration 106, committed `bf32905`, pushed to `origin/staging`
- `origin/staging` HEAD: `bf32905 chore(types): regenerate database types for KYC snapshot schema`

## In Progress 🔄
- `HomeCategoryShortcutRail.vue` — uncommitted changes (home category shortcuts, pre-existing)
- `app/pages/index.vue` — uncommitted changes (homepage, pre-existing)

## Blocked 🚫
- 20 pre-existing POS V2/V3 test failures (unrelated to KYC work)
  - `pos-v2-pickup-completion.spec.ts`, `admin-pos-v3-*` specs

## Next 📋
- **IMMEDIATE: TASK 4.1b implementation** — walk-in KYC gate + snapshot write (plan is in HANDOFF.md 2026-06-02):
  - `server/utils/rental-pickup-readiness.ts`: add `kyc_profile_id` to booking SELECT; walk-in branch queries by `rental_bookings.kyc_profile_id` not phone
  - `server/utils/rental-fulfillment.ts`: same booking SELECT fix; add `id` to KycProfileRow + override SELECT; `assertPickupCustomerEvidence` returns `KycPickupSnapshot`; write snapshot to fulfillment INSERT
  - `docs/index/server-utils-index.md`: update both util rows
  - Tests: `rental-pickup-readiness.spec.ts` + `tests/server/utils/rental-fulfillment.spec.ts`
  - One commit. Opus 4.8 review required before push (security-core pickup gate change).
- **TASK 4.2**: `server/api/admin/kyc/profiles/lookup.get.ts` — identity hash lookup endpoint
- **TASK 4 (API)**: `server/api/admin/kyc/profiles/index.post.ts`, `[id]/documents.post.ts`, `[id]/verify.post.ts`
- **TASK 4 (UI)**: POS V3 KYC mode container (`AdminPosV3KycContainer.vue`) — lookup, create, upload, verify; wire into pos-v3 index
- TASK 5: Pickup container KYC gate + state preservation + i18n keys for `kyc_pickup_gate_blocked` / `kyc_pickup_via_override` + walk-in guard idiom unification
- TASK 6: Super admin override creation UI + expiry (`valid_until`) column on `kyc_pickup_overrides` + gate update — Opus review required
- TASK 7: Tests
- Validate auth fix on production domain (first Google OAuth login)
- Consider adding `ensureProfileLoaded()` to default layout for non-admin pages

---

## Session 2026-05-31 — Server-utils index + working-tree housekeeping

### Done ✅
- Server-utils index: rental-ops / inventory / branch-access / admin ops rows — `d18520e`
- Server-utils index maintenance rule added to root `claude.md` + `server/utils/claude.md` — `f5fa16f`
- Stopped tracking `supabase/.temp/*` (8 cache files, local kept) — `b337c3a`
- Shared Claude Code command permissions in `.claude/settings.json`, `supabase` narrowed to `gen types:*` — `02f80ea` + `1d9c322`
- (Full server-utils index phase: 46e89d0 -> d2890bf -> d352b12 -> d18520e -> f5fa16f now complete)
- Archived scratch planning docs into `docs/archive/` — `76c2085`
- `.claude/commands/edit.md` committed — `bf47376`
- `.gitignore` / `.claudeignore` scratch-doc rules — `ae7d327`
- `PartnerCard.vue` chip overflow (horizontal scroll, no wrap) — `7aa6665`
- Homepage full-width layout (removed desktop CategoriesCard sidebar permanently) — `0c38a86`
- `scripts/translate-i18n.mjs` discarded (machine-translation policy conflict)

### Blocked / Deferred 🚫
- `docs/customer-cancellation-refund-handoff.md` archive — deferred pending human confirmation that no-show open policy questions (late-cancellation, undo-no-show, admin dashboard) are captured elsewhere.

### Next 📋
- Confirm whether no-show policy questions in `docs/customer-cancellation-refund-handoff.md` are recorded elsewhere → then archive it (1 `git mv` + 1-line `docs/claude.md` update).
- `app/components/categories_card/CategoriesCard.vue` is now fully unused — safe to delete in a separate cleanup commit.
- (optional) Extend server-utils index to any remaining `server/utils/` files not yet rowed.
- Earlier KYC TASK 3–7 items above remain the standing backlog (unchanged).

### Notes
- `staging` in sync with origin at `76c2085`. Working tree clean.
- `phase-2d-booking-deposit-acceptance-checklist.md` and `phase-2e-pos-rental-operational-flow-audit.md` are KEEP — both load-bearing (see decisions.md 2026-05-31).
- KYC access-log: a permanent non-PII probe row exists in remote/staging `public.kyc_document_access_log` (id `f122e850-2c73-49ec-a6c1-12e961f7fd36`, action `upload`, result `allowed`, reason `remote-verify-probe`). Append-only table — cannot be deleted. Filter with `reason <> 'remote-verify-probe'` during audits. Future immutable-log remote checks must be metadata-only.

---

## Session 2026-06-04/05 — KYC document storage (migration 109) + Phase 1B upload endpoint

### Done ✅
- Migration 109 fully complete on remote/staging: dedicated private bucket `kyc-profile-documents` (10 MB, JPEG/PNG/PDF) + append-only `public.kyc_document_access_log` (UPDATE/DELETE/TRUNCATE-blocking triggers; service_role ALL / super_admin SELECT) — `60bd023`
- Remote storage-policy gate PASSED: zero `storage.objects` policies on remote — server-mediated-only guarantee cleared (human-run Dashboard SQL)
- DB types regenerated for `kyc_document_access_log` (+55 lines, no unrelated churn) — `1f10a03`, pushed
- **Phase 1B upload endpoint — `010ee9b feat(kyc): add document upload endpoint`, pushed to `origin/staging`** (7 files, 2409 insertions):
  - `server/api/admin/kyc/profiles/[id]/documents.post.ts` — requirePlatformAdmin; hard streaming body limit (actual bytes, never Content-Length) → capped-buffer handoff to real h3 multipart via `req.rawBody`; magic-byte MIME only (full 8-byte PNG sig; SVG rejected); 10 MB actual-bytes file cap; documentType coherence on `customer_type × identity_type` (mirrors create guard; fail closed); company_cert requires non-future `issuedAt`; future `issuedAt` rejected for all types; `expiresAt ≥ issuedAt`; opaque `kyc/<uuid>.<ext>` keys; orphan cleanup on insert failure; best-effort upload access log
  - `server/utils/kyc-documents.ts` — limiter, sniffer, key builder, single-IP XFF parser, date validators, access-log writer typed against generated Insert (console.error breadcrumb; `failClosed` reserved for downloads)
  - `server/utils/kyc-document-view.ts` — safe serializer (no storage_path/bucket/URLs/uploader ever)
  - 3 spec files (124 tests incl. real-h3 integration proof + h3 upgrade canary) + 2 rows in `docs/index/server-utils-index.md`
- Two Opus review rounds passed (5 blockers fixed; identity_type coherence confirmation patch applied)
- Validation at commit: `npx tsc --noEmit` clean; 165/165 targeted tests pass

### Next 📋
- **Phase 2 (per decisions.md 2026-06-05 Decision B): super_admin-only server-mediated download endpoint** — fail-closed access logging (`failClosed: true` before signed URL); denied non-super_admin attempts logged WITHOUT loading the document row; uniform 403 (no existence leak); separate commit from purge
- Purge primitive: DEFERRED until legal retention scope decided (no HTTP delete endpoint)
- Production readiness gate (decisions.md 2026-06-05 Decision C): retention duration, AV-gap acceptance, prod storage-policy re-run, h3 canary in prod CI, read-only prod verification — all required before production enablement
- Verify endpoint (evidence-first, requires retained `kyc_documents`) — after download phase
- Earlier KYC TASK backlog (POS V3 KYC UI wiring, TASK 5 i18n, TASK 6 override expiry) — unchanged

### Notes
- `origin/staging` HEAD: `010ee9b` — local in sync; session docs committed separately right after (this commit)
- No migration was added in Phase 1B; `database.types.ts` untouched since `1f10a03`

---

## Session 2026-06-05 — Vercel streaming spike (Phase 2 pre-implementation gate) + Phase 2 spec locked

### Done ✅
- **Vercel streaming spike PASS — Phase 2 = PURE server-proxy download** (decisions.md 2026-06-05 Decision D; full locked spec now tracked at `docs/kyc-phase-2-download-spec.md`)
  - Throwaway branch `spike/vercel-streaming` (commit `99a2038`, never merged, deleted) with one temp route `server/api/_spike/stream.get.ts`; tested against a real Vercel Preview deployment (`dpl_Ae9LzghH3wCtn8C7Txucz6C9cn13`)
  - Synthetic 6 MB stream (incompressible random bytes): 200, exact bytes, SHA-256 match
  - Synthetic 10 MB stream (= KYC bucket max): 200, 10,485,760 bytes, SHA-256 match
  - Real-object pass (mandatory): temp 6 MB `catalog-media` fixture through the exact production shape `storage.download()` → `blob.stream()` → response: 200, end-to-end SHA-256 identical
  - No 413 / FUNCTION_PAYLOAD_TOO_LARGE / truncation anywhere
  - Runtime baseline recorded (Decision D): Nuxt 4.3.1 / Nitro 2.13.1 / `Nitro preset: vercel` / Node λ (not Edge) / nodeVersion 24.x / region iad1 / **Fluid Compute enabled** (`resourceConfig.fluid === true`) / streamed responses carry no Content-Length over HTTP/2 → production endpoint will OMIT Content-Length
  - Hybrid signed-URL fallback shelved as documented contingency (`docs/kyc-phase-2-download-spec.md` §9)
- Schema check: all 5 denial-payload columns (`document_id`, `kyc_profile_id`, `document_type`, `storage_bucket`, `storage_path`) confirmed nullable in migration 109 + generated types — malformed-id deny logging is schema-valid, no migration impact (Decision G)
- Decisions recorded: D (pure proxy + platform baseline + guards), E (download `allowed` semantics + `attachment` disposition), F (PDPA/IP stance), G (malformed-id log purity)
- `docs/kyc-phase-2-download-spec.md` created — single tracked source for the Phase 2 download design (endpoint order, migration 110 runbook, path-validator single source of truth, test matrix, shelved hybrid contingency, Fluid Compute guard, bucket cap coupling)
- Spike cleanup verified: spike branch (remote+local) deleted, preview deployment removed, protection-bypass automation secret revoked (`protectionBypass: {}` after revoke), temp fixture `catalog-media/spike/streaming-fixture-6mb.jpg` deleted (re-fetch 400), local temp files removed; working tree back on `staging` @ `4a43239` with only pre-existing dirty files

### Next 📋
- **Phase 2 implementation per `docs/kyc-phase-2-download-spec.md`**: re-verify `supabase db reset --local` through 109 (last proven at 106) → author migration 110 (widen `kyc_document_access_log_action_chk` to add `'download'`; runbook in spec §4) → endpoint + utils + tests (spec §2/§3/§5)
- Planned enforced guard: CI/deploy-time assertion that Vercel `resourceConfig.fluid === true`; if Fluid Compute is disabled → re-spike before production use (Decision D impact 2)
- Re-run streaming spike if the KYC bucket 10 MB limit is ever raised (Decision D impact 3)
- Optional hardening: 10 MB real-object pass next time a preview spike runs (Decision D impact 4)

### Blocked 🚫
- (unchanged) Production enablement blocked by Decision C's five gates; purge primitive deferred pending legal retention scope

### Notes
- NOT done this session by instruction: no download endpoint code, no migration 110, nothing staged/committed/pushed
- Operational learnings for future preview spikes recorded in HANDOFF.md 2026-06-05 spike entry (SSO bypass secret flow, `catalog-media` MIME allowlist, `sb_secret_…` apikey header)
