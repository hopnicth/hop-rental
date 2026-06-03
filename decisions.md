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

## 2026-05-31
Decision: Untrack the whole `supabase/.temp/` cache dir via `git rm --cached` (keep local files), not just the one noisy `cli-latest`.
Reason: 8 CLI cache/version markers were tracked; already ignored by `supabase/.gitignore` + root `.gitignore`, so they only generated `git status` noise.
Impact: Supabase temp state is now local-only; commit `b337c3a`.

## 2026-05-31
Decision: `.claude/settings.json` is the tracked/shared Claude Code config; `.claude/settings.local.json` is the git-ignored per-dev file.
Reason: Share a safe command allow-list with the team; keep machine/local prefs out of git.
Impact: Shared permissions committed (`02f80ea`); `supabase gen:*` narrowed to `supabase gen types:*` (`1d9c322`).

## 2026-05-31
Decision: Fix the broad-permission mistake with a forward commit, not a force-push/amend.
Reason: `02f80ea` was already pushed to shared `staging`; rewriting pushed history is riskier than one extra commit.
Impact: Two-commit trail (`02f80ea` -> `1d9c322`); effective state correct, no history rewrite.

## 2026-05-31
Decision: Remove desktop `CategoriesCard` sidebar from homepage permanently; promote `HomeCategoryShortcutRail` to all breakpoints (remove `lg:hidden`).
Reason: Sidebar added layout complexity and narrowed main content to `col-span-9`; full-width `col-span-12` is cleaner for the current content density.
Impact: `CategoriesCard` component is now unused in the app (safe to delete in a separate cleanup); homepage main column is full-width on all breakpoints. Committed `0c38a86`.

## 2026-05-31
Decision: Discard `scripts/translate-i18n.mjs` (Gemini machine-translation script) — do not commit it.
Reason: Directly conflicts with the strict project i18n policy (no machine-generated translations for th/cn/jp; only `[NEEDS_TRANSLATION]` placeholders, human review required).
Impact: Script deleted locally. The `[NEEDS_TRANSLATION]` workflow remains the only approved path.

## 2026-05-31 (TASK 3)
Decision: Override expiry is intentionally deferred to TASK 6.
Reason: `kyc_pickup_overrides` in migration 105 has no expiry column — only `booking_id` and `created_at`. `hasValidPickupOverride` matches by `booking_id` only. No override rows exist before TASK 6 (the super_admin override UI/creation flow has not been built), so there is no production exposure from the lack of expiry in TASK 3. Adding an expiry check now would require schema work that nothing can yet populate.
Impact: Until TASK 6, override validity means "a matching `booking_id` row exists." TASK 6 must design the expiry column, override creation UI, and gate update together — with Opus review. Do not claim overrides expire before TASK 6 ships.

## 2026-05-31 (TASK 3)
Decision: Walk-in customers resolve to `null` profile → `no_profile` → pickup blocked. Walk-in KYC link deferred to TASK 4.
Reason: `walk_in_phone` is a contact field on `kyc_profiles`, not a unique identity key. Matching by phone could bind the wrong verified identity to a walk-in booking, which is a security risk. TASK 4 (POS KYC mode) will create the canonical link.
Impact: Walk-in pickup is blocked at KYC gate until TASK 4 lands. Overrides (super_admin) are the only exception path today.

## 2026-05-31 (TASK 3)
Decision: `idEvidencePresent` field kept as `false` (shape-compat) rather than removed.
Reason: Frontend consumers reference this field. The field had different semantics for registered vs walk-in customers; under `kyc_profiles` the concept is unified. Setting to `false` avoids a breaking shape change without inventing new semantics.
Impact: TASK 4 will decide the correct forward semantics (e.g., `kycProfile !== null`, or removed entirely).

## 2026-05-31 (TASK 3)
Decision: KYC blocker code in readiness changed from `customer_kyc_not_verified` / `walk_in_id_evidence_missing` / `customer_identity_missing` to unified `kyc_pickup_gate_blocked` with `context.kycReason` containing the exact reason.
Reason: The three-branch logic is now a single `resolvePickupKyc` call. A unified code is cleaner; the `kycReason` context carries the detail the UI needs to differentiate cases.
Impact: Frontend that parses the blocker code string must be updated in TASK 5.

## 2026-05-31
Decision: Scratch docs (`20260528 Summary.md`, `augment_final_design_lock_...refund.md`) archived to `docs/archive/` via `git mv`; `.claudeignore` entries repointed to new paths.
Reason: Both matched the new `.gitignore` `[0-9]{8} *.md` / `augment_*.md` scratch-doc rules. Moving preserves git history as renames; repointing `.claudeignore` keeps them out of Claude coding context.
Impact: `docs/archive/` directory created. Committed `76c2085`.

## 2026-05-31
Decision: `docs/phase-2d-booking-deposit-acceptance-checklist.md` and `docs/phase-2e-pos-rental-operational-flow-audit.md` — KEEP in place, not archived.
Reason: Phase-2d is the active guardrail source cited by 9 downstream docs ("do not override without reviewing this doc"). Phase-2e is the design specification for unimplemented POS V3 pickup/return/settlement work.
Impact: Neither file is archived. Both remain at their current paths.

## 2026-05-31
Decision: `docs/customer-cancellation-refund-handoff.md` — defer archive decision.
Reason: Strongest ARCHIVE candidate (superseded handoff note), but contains open no-show policy questions (late-cancellation, undo-no-show, dashboard surfacing) not yet confirmed as captured elsewhere.
Impact: File left in place pending human confirmation that those questions are recorded in decisions.md or the Thai policy file.

## 2026-06-02 (TASK 4.1b — committed `c8866f8`)
Decision: Override authorization for the pickup gate is resolved through ONE shared predicate, `findPickupOverride(overrides, bookingId)` in `server/utils/kyc.ts`. `hasValidPickupOverride` (boolean) and `resolvePickupKyc` (gate) both delegate to it; `resolvePickupKyc` now surfaces `matchedOverrideId` (the exact authorizing override row id, never `overrides[0]`). `KycOverrideEntry.id` is REQUIRED so every override SELECT must include `id` at compile time. The pickup audit snapshot (`rental_booking_fulfillments` 5 KYC columns) is assembled from the same fresh query/`new Date()` that authorized the gate and is write-only audit evidence — never a gate input. Walk-in bookings resolve KYC via `rental_bookings.kyc_profile_id` (FK), registered via `user_id` first; no phone matching.
Reason: A single predicate makes readiness (display) and confirm (authoritative) gates structurally incapable of diverging on override authorization. Required `id` turns a possible runtime gap into a compile-time error. The matched-id snapshot records exactly which override row authorized a given pickup, for audit.
Impact: **TASK 6 carry-forward — `findPickupOverride` must be updated for override expiry selection when override expiry is implemented.** When TASK 6 adds `valid_until` (or equivalent) to `kyc_pickup_overrides`, the expiry/live-now check must be added INSIDE `findPickupOverride` (the single source of truth) so both `hasValidPickupOverride` and `resolvePickupKyc` inherit it without drift. Do NOT add an expiry filter at a call site or in a second predicate. Requires Opus review (security-core gate change). Snapshot invariant to preserve: `kyc_authorized_via='verified'` → `kyc_profile_id NOT NULL`; `='override'` → matched `kyc_override_id NOT NULL`; return events → all 5 KYC snapshot columns NULL.

## TASK 4.2A-3 — KYC attach: locked invariants & decisions

The attach path writes `rental_bookings.kyc_profile_id`, which the pickup gate trusts for walk-in bookings. The pickup gate does not re-prove identity ownership; therefore the attach endpoint is the security boundary for this link.

Attach must enforce:

1. Identity ownership. Attach must re-derive the hash via `hashKycIdentity(identityType, identityValue)` from the captured identity and assert it equals the target profile's `identity_hash`. Never accept a bare client-supplied `profile_id` without identity proof.

2. Verify-before-attach is not required. Attaching a pending profile is allowed. The confirm-time pickup gate re-evaluates fresh KYC state and blocks pending profiles. Attach proves identity linkage; verify proves legitimacy; the gate requires verified status.

3. No phone matching. Resolve identity only by identity hash. `walk_in_phone` is contact metadata only.

4. Walk-in only — both booking and profile. Attach applies only when `booking.user_id IS NULL` AND the attached profile is walk-in-scoped (`kyc_profiles.user_id IS NULL`). Refuse registered bookings (they resolve KYC by `user_id` and ignore `kyc_profile_id`), and refuse registered-user profiles (mirrors 4.2A-2 create-pending, which never reuses a registered profile for walk-in context — otherwise a walk-in could attach a registered user's verified profile by knowing the identity value). The profile registered-scope check runs AFTER the identity-hash proof so registered-ness is never revealed without proving identity ownership.

5. Attach must not verify. Attach must not set `status = verified` and must not mutate any `kyc_profiles.status` or verification/rejection/revocation fields. It only writes the FK on `rental_bookings`.

6. Single writer. `rental_bookings.kyc_profile_id` is settable only via the dedicated attach endpoint:

   `POST /api/admin/rental-bookings/[id]/kyc-attach`

   It must not be writable through generic booking update routes.

7. Server-side authorization. Attach requires `requirePlatformAdmin` and branch-access parity with the existing pickup/readiness path. The acting staff/admin must be authorized to operate the target booking.

8. Re-attach is allowed before pickup, including identity correction. MVP traceability (DECIDED — Option A): there is no separate attach audit log in this phase. The attach response surfaces `oldProfileId` → `newProfileId`, and the pickup fulfillment snapshot (`rental_booking_fulfillments` KYC columns) remains the durable audit record of the final authorizing profile. Intermediate pre-pickup re-attaches are allowed but are not separately audited until a later task. Adding a durable attach audit log (Option B) requires schema/workflow changes and explicit approval.

9. Frozen after pickup. Once a pickup fulfillment snapshot exists for the booking, `kyc_profile_id` must not change unless a separate audited correction flow is designed.

10. Dedupe. Use app-level lookup-before-insert scoped to `user_id IS NULL`. Never reuse a registered profile for walk-in create. No DB unique constraint on `identity_hash` in this phase.

11. PII boundary. All KYC profile API responses must go through `toSafeKycProfile` in `server/utils/kyc-profile-view.ts`.

12. Branch scoping — DECIDED: global KYC identity. KYC profiles are global identity records and are usable across branches. Attach checks operation-level branch access on the booking, not the profile branch. The attached profile's `branch_id` / `verified_branch_id` is not matched against the booking pickup branch. `verified_branch_id` is audit evidence only. If HOPNIC branches later become independent franchises or data-isolated entities, revisit this as branch-scoped behavior.

Open business decisions before verify/document tasks:

- Verify authority: staff-on-site vs super_admin-only.
- Document-required-for-verify: can verify set `verified` without a `kyc_documents` row?

## 2026-06-03 (TASK 4 — KYC verify compliance: RESOLVES the two open questions above)
Attribution: Confirmed by the HOPNIC business/product owner (repo owner, account `hopnic.th@gmail.com`) on **2026-06-03** during TASK 4 review — the owner confirmed that HOPNIC requires retained ID/company-document evidence for KYC verification. This entry records that confirmed compliance requirement.
Decision: HOPNIC KYC verification is **evidence-first (Option A)**. Retained ID/company-document evidence is required before a `kyc_profiles` row may become `verified`. Staff attestation without retained document evidence (Option B) is **not** an allowed normal verification path.
Reason: HOPNIC compliance requires retained document evidence for KYC. `verified` must carry a single, clean meaning — the profile has retained evidence and was properly verified — so the gate, audit snapshot, and any downstream trust can rely on it without ambiguity. A "verified pending evidence" state would split that meaning and let unevidenced profiles pass the pickup gate.
Impact (locked for the verify/document tasks — no application code, migration, or types changed by this entry):

1. **Document retention is required.** A `verified` KYC profile must have retained ID/company-document evidence (`kyc_documents` rows). This is the normal, non-negotiable path.

2. **Normal KYC verify is evidence-first.** The verify path runs with `requireDocumentEvidence = true`. Verify must refuse to set `verified` when no retained `kyc_documents` evidence exists for the profile.

3. **Staff-on-site may verify only after retained document evidence exists.** Normal staff-on-site verification is permitted, but only once retained document evidence is present. Staff cannot attest a profile to `verified` without it.

4. **Super_admin document-later exception is per-pickup only, via `kyc_pickup_overrides`.** When a document cannot be captured at the moment, the only sanctioned bypass is the existing per-pickup override path (`kyc_pickup_overrides`), authorized by super_admin, requiring a `reason` and full audit (optionally a document-deferral reason code / metadata). It authorizes a single pickup; it does NOT verify the profile and does NOT mutate `kyc_profiles.status`. The pickup fulfillment snapshot must honestly record `kyc_authorized_via = 'override'` (never `'verified'`), so audit reflects that evidence was not retained. If the customer returns again before evidence is retained, a fresh override is required — this is correct, because the evidence gap still exists. If a document-later exception needs to record the inspected-document-type physically checked during the exception, that metadata belongs on the `kyc_pickup_overrides` record (override metadata), **never** on `kyc_profiles`.

5. **No reusable profile-level "verified pending evidence" state for MVP.** Document-later exceptions must not create or imply a profile state that is "verified but missing evidence." There is no such status. The profile remains `pending`; only the per-pickup override (point 4) lets that specific pickup proceed.

6. **No `document_type_inspected` column on `kyc_profiles`.** The inspected document type is carried by the stored evidence row itself — `kyc_documents.document_type` is the authoritative record of what document was inspected. Do **not** add a profile-level `kyc_profiles.document_type_inspected` field, and do **not** require it as a separate verify input, because a separate profile field could disagree with the stored `kyc_documents.document_type`. (Supersedes the earlier plan to add `kyc_profiles.document_type_inspected`.)

7. **Document upload API is a prerequisite to the verify API.** Because verify requires retained `kyc_documents` evidence, the document upload API must exist and be usable before the verify API can be implemented or shipped. Verify cannot land first.

8. **Verify API must require valid `kyc_documents` evidence.** A `verified` write requires at least one valid retained `kyc_documents` row for the profile. The inspected document type is read from `kyc_documents.document_type` (authoritative); verify takes **no** separate profile-level document-type input.

9. **`verified` status is single-writer through the verify endpoint.** No other route (generic profile/booking update, attach, create-pending, override) may set `status = verified`. The verify endpoint is the sole writer of that transition, mirroring the attach single-writer discipline (TASK 4.2A-3 point 6).

10. **Verify transition is `pending → verified` only.** The verify endpoint moves a profile from `pending` to `verified` and nothing else. It does not handle rejection, revocation, or re-verification flows; those, if needed, are separate audited transitions designed later.

Storage-policy companion (REQUIRED scope for the document upload task — see point 7): Because HOPNIC will **retain** sensitive KYC document files, the document upload task must explicitly define, before shipping:

- **Retention period** — how long retained KYC documents are kept (and the trigger for the retention clock).
- **Access/read control** — who (which roles) may access/read stored documents; private bucket (`kyc-documents`) + server-mediated, signed-URL access only; no public/anon read.
- **Deletion/purge policy** — how documents are purged at end of retention or on a valid erasure request, including the storage object and the `kyc_documents` row.
- **Audit/access expectations** — access to KYC documents should be logged/auditable (who read what, when); define the audit surface even if minimal for MVP.
- **AV / malware-scanning gap** — record the current **no antivirus/malware-scanning** gap as an explicit decision: either accept the gap for MVP (documented risk) or specify the scanning step. Do not leave it implicit.
- **PDPA considerations** — retention, access, deletion, and audit above must be consistent with PDPA obligations for sensitive personal data.
