# Handoff Log

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
