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
