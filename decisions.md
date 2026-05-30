# Design Decisions

## 2026-05-29
Decision: Fix OAuth first-login race in `confirm.vue` by awaiting `refreshProfile()` before `navigateTo()`, not by adding `exchangeCodeForSession()` manually.
Reason: `@nuxtjs/supabase` already handles the PKCE code exchange automatically. Adding a manual exchange would double-exchange the code and break the flow. The race was purely in the redirect timing, not in the token exchange.
Impact: `confirm.vue` now shows the loading spinner for an extra ~200–500ms on first login while the profile is fetched. Acceptable UX trade-off vs. incorrect role display.

## 2026-05-29
Decision: `clearProfile()` in `confirm.vue` is gated on `!profile.value || profile.value.id !== newUser.id`.
Reason: A logged-in user navigating to `/user/confirm` directly would otherwise have their correctly-loaded profile wiped and re-fetched unnecessarily. The guard preserves the profile when it already belongs to the correct user.
Impact: No profile flash for the edge case of navigating to the callback page while already authenticated.

## 2026-05-29
Decision: `server/api/user/index.get.ts` left unchanged — returns `{ profile: null }` when `public.users` row is missing.
Reason: This is correct behavior. The row-missing case is distinct from a 401. The fix belongs in the client timing (confirm.vue), not in the server response shape. Changing the server to return 404 on missing row would break the PUT upsert flow.
Impact: Callers that receive `{ profile: null }` must not default `platform_role` to `'customer'` — enforced by `clearProfile()` preventing stale state from persisting.

## 2026-05-29
Decision: Use module-level singleton pattern for `useUserProfile` state (`profile`, `loading`, `error` as module-level refs).
Reason: Already in use across the codebase. Not changed in this session. The watcher guard `!isUserProfileInitialized` ensures only one watcher runs per client session.
Impact: `clearProfile()` resets the shared module-level state, affecting all consumers immediately — which is the desired behavior on logout and OAuth callback.

## 2026-05-29
Decision: `platform_role` enum in `claude.md` corrected to `'staff' | 'super_admin'` (no `'admin'` value).
Reason: The DB enum `platform_role` has values `'customer'`, `'staff'`, `'super_admin'`. The previous `claude.md` had `'admin'` which does not exist, causing Claude to generate broken auth checks.
Impact: All future Claude-generated admin auth code will use the correct role values and the correct helpers (`requirePlatformAdmin` / `requireSuperAdmin`).

## 2026-05-29
Decision: `.claudeignore` now excludes `supabase/migrations/` (104 SQL files).
Reason: Migration files are write-append only. The current schema is always in the latest few files. Scanning all 104 files on every schema task burns tokens without benefit. The `supabase/claude.md` key-tables reference provides sufficient context.
Impact: Claude will not auto-read migration history. If specific migration context is needed, the file must be explicitly requested.

## 2026-05-30
Decision: KYC identity hashing uses HMAC-SHA256 with a server-side secret (`KYC_HASH_SECRET`), storing only hash + last4. No plaintext identity number is ever persisted.
Reason: PDPA and security risk reduction — stores the minimum needed for identity matching without exposing PII in the database. HMAC with a secret makes the hash non-invertible even if the DB is compromised. `node:crypto createHmac` used (no external dependency).
Impact: `hashIdentity()` in `server/utils/kyc.ts` throws if `KYC_HASH_SECRET` is missing or empty. Secret must be set in all environments. Key rotation requires re-hashing all existing records.

## 2026-05-30
Decision: TypeScript types for KYC tables are generated via `supabase gen types typescript --linked` against the staging project (`yzjczvzwmbbeyoodrjwm`). Hand-writing types for KYC tables is prohibited.
Reason: The linked project is the only project in the org; there is no separate production project to confuse with. Generated types are authoritative and include FK relationships. Hand-written types diverge silently.
Impact: After any KYC schema change (migration), regenerate types before writing server utils or tests. Command: `supabase gen types typescript --linked > app/types/database.types.ts`.

## 2026-05-30
Decision: `kyc_pickup_overrides` records a booking-specific exception and must NEVER mutate `kyc_profiles.status`. An override means pickup was allowed by exception — it does not mean the customer is KYC-verified.
Reason: Override records are an audit trail for super-admin exceptions. Treating them as a KYC approval would silently elevate a customer's trust level across all future bookings, which violates the per-booking scope of the exception.
Impact: `resolvePickupKyc()` returns `via: 'override'` when an override allows pickup — callers must not interpret this as `kyc_verified`. The override record sits in `kyc_pickup_overrides`, not in `kyc_profiles`.

## 2026-05-30
Decision: KYC identity normalization is handled by a dedicated `normalizeKycIdentity(type, raw)` function — pure, exported, separate from `hashIdentity`. Rules per type (Unicode NFKC applied first for all): `national_id` and `juristic_id` strip all whitespace and dash-family characters then assert `/^\d{13}$/` (kept as string, never `parseInt`); `passport` applies `.toUpperCase()` (NOT `toLocaleUpperCase` — locale-independent) then strips whitespace and dashes then asserts `/^[A-Z0-9]+$/`. Throws on format mismatch; error messages must contain NO raw or normalized identity value (no PII in logs). Format checks only — Thai national_id / juristic_id checksum validation is out of scope and lives in the verify flow. Full spec in `docs/kyc-pos-v3-design.md §4a`.
Reason: Same identity submitted in different formats (e.g., with or without dashes, uppercase vs lowercase for passport) must produce the same hash. Normalizing in a single well-tested function, not inside `hashIdentity`, keeps the hash function low-level and testable.
Impact: All callers MUST pass raw input through `normalizeKycIdentity` before hashing. `hashIdentity` itself stays un-normalized and is no longer a valid direct entry point for identity data.

## 2026-05-30
Decision: KYC identity hash contract (v1, PERMANENT): `hashKycIdentity(type, raw)` normalizes then calls `hashIdentity(\`v1:${identityType}:${normalizedValue}\`)`. The `v1:` prefix and field ordering are an immutable storage contract — changing either orphans all stored `identity_hash` values and requires a deliberate migration plan. ALL intake, search, lookup, and pickup-gate code must call `hashKycIdentity`; calling `hashIdentity` directly on raw user input is forbidden. `identity_last4` must be derived from the normalized canonical value, not the raw input.
Reason: `national_id` and `juristic_id` share the same 13-digit format — without the type segment the same digits hash identically across types. The `v1:` prefix makes any future format change unambiguous and distinguishable from existing stored hashes.
Impact: `hashIdentity` stays unchanged as a low-level primitive (HMAC-SHA256 over exact string, throws on missing/empty `KYC_HASH_SECRET`). `hashKycIdentity` is the only safe public entry point. Key rotation OR prefix/separator change requires re-hashing all stored `identity_hash` values.

## 2026-05-30
Decision: Model strategy for KYC build — Opus 4.8 drafts AND reviews security-core work (migrations, `server/utils/kyc.ts` hash/normalize, pickup gate, RLS); Sonnet 4.6 drafts UI, glue code, and tests. Opus reviews are surgical: diff + design-doc only, not whole-repo context.
Reason: Security-core code (hashing, normalization, RLS, pickup gate) carries high risk if wrong; Opus review catches issues that Sonnet might miss. UI and glue code is lower-risk and benefits from Sonnet's speed.
Impact: Every security-core PR step gets an Opus review pass before the next TASK begins. Review prompts should be scoped to the diff, not the full codebase.
