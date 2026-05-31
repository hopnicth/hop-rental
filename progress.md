# PROGRESS
Last updated: 2026-05-31

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

## In Progress 🔄
- `HomeCategoryShortcutRail.vue` — uncommitted changes (home category shortcuts, pre-existing)
- `app/pages/index.vue` — uncommitted changes (homepage, pre-existing)

## Blocked 🚫
- 20 pre-existing POS V2/V3 test failures (unrelated to KYC work)
  - `pos-v2-pickup-completion.spec.ts`, `admin-pos-v3-*` specs

## Next 📋
- **IMMEDIATE**: TASK 3 — wire `resolvePickupKyc` into `loadRentalPickupReadiness` + `confirmPickup` endpoint (Opus 4.8 review before push)
- TASK 4: POS v3 KYC mode UI (lookup, submit, verify)
- TASK 5: Pickup container KYC gate + state preservation
- TASK 6: Super admin override + revoke flow
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
- Archived scratch planning docs into `docs/archive/`: `20260528 Summary.md` + `augment_final_design_lock_customer_docs_cancel_refund.md` (matched new `.gitignore` scratch rules); `.claudeignore` entries repointed to the `docs/archive/` paths so they stay out of Claude context.

### Next 📋
- Decide fate of pre-existing dirty/untracked files:
  - `app/components/home/HomeCategoryShortcutRail.vue` + `app/pages/index.vue` (homepage layout change — remove commented-out block, commit as one logical change)
  - `scripts/translate-i18n.mjs` (Gemini i18n translator — conflicts with "no machine translation" rule; human decision)
  - `.claude/commands/edit.md` (new untracked — review)
- (optional) Extend server-utils index to any remaining `server/utils/` files not yet rowed

### Notes
- `staging` in sync with origin at `1d9c322`.
- `nuxt.config.ts` is no longer dirty as of this update.
- Earlier KYC TASK 3–7 items above remain the standing backlog (unchanged).
