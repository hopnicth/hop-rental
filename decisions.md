# Design Decisions

## 2026-06-21 — Phase B-1 Partner Taxonomy Migration: 4 locked implementation constraints

These four decisions are LOCKED for the Phase B-1 migration (`partner_categories` + `partner_category_assignments`). They must be enforced in the migration SQL before any code review.

### Decision B1-1 — Seed upsert strategy: `DO UPDATE SET` not `DO NOTHING`
Decision: Category seed rows must use `ON CONFLICT (slug) DO UPDATE SET icon = excluded.icon, sort_order = excluded.sort_order, is_active = excluded.is_active, is_public = excluded.is_public, updated_at = now()` instead of `ON CONFLICT DO NOTHING`.
Reason: `DO NOTHING` silently drops re-seed changes during local reset or re-run. If icon, sort_order, or public flags are corrected before launch, `DO NOTHING` would leave stale values on any environment that had already run the migration. `DO UPDATE SET` ensures local reset always reflects the approved spec. i18n_key and parent_id are intentionally excluded from the update set — those are identity fields that should not silently change.
Impact: Migration is safe to re-run or reset-replay. Any pre-launch taxonomy corrections only require updating the seed SQL, not a new migration.

### Decision B1-2 — RLS helper function permissions: explicit REVOKE + targeted GRANT
Decision: After creating any `public.is_public_partner_profile(uuid)` helper function used in RLS policies, the migration must immediately run `REVOKE ALL ON FUNCTION public.is_public_partner_profile(uuid) FROM PUBLIC;` followed by `GRANT EXECUTE ON FUNCTION public.is_public_partner_profile(uuid) TO anon, authenticated;`.
Reason: Postgres grants EXECUTE to PUBLIC by default on new functions. Without the explicit REVOKE, any database role can execute the helper — including roles that should not be aware of partner visibility logic. The targeted GRANT restores exactly what RLS evaluation requires (anon + authenticated must be able to evaluate the predicate in their SELECT policies) without over-granting.
Impact: Any RLS helper function created in this or future partner-taxonomy migrations must follow this REVOKE → GRANT pattern. This mirrors the column-level grant discipline already used on partner_profiles.

### Decision B1-3 — Write access fail-closed: no INSERT/UPDATE/DELETE grants in B-1
Decision: Phase B-1 must NOT grant INSERT, UPDATE, or DELETE on `partner_categories` or `partner_category_assignments` to `anon` or `authenticated`. No staff or admin write RLS policies are created in this migration. All writes flow exclusively through `service_role`-backed admin API routes (to be built in Phase B-2). The only policies in B-1 are the public SELECT policy and the `service_role FOR ALL` policy.
Reason: Admin write routes do not exist yet. Granting write access before the routes exist creates an open write surface with no application-layer validation or auth guard. The existing partner_profiles pattern (REVOKE ALL → GRANT SELECT specific columns → service_role ALL) is the correct model. Fail-closed is mandatory for any new table that will hold partner taxonomy data.
Impact: Phase B-2 admin form update must route all category assignment writes through service_role (requireSuperAdmin or requirePlatformAdmin guards), same as all other admin partner routes.

### Decision B1-4 — Validation test rows: transactional, rolled back, zero persistence
Decision: Any SQL validation tests performed inside the migration (proving RLS, proving assignment constraints, proving the one-primary partial unique index) must use a `BEGIN` / `ROLLBACK` or `DO $$ BEGIN ... END $$` block that leaves zero rows in the database after the migration completes. If a public test partner is needed to prove anon can see public assignments, it must be cleaned up before the migration ends. If the non-public partner test proves anon cannot see non-public assignments, it must also be cleaned up.
Reason: The KYC post-smoke cleanup (2026-06-06) demonstrated that synthetic/test rows in append-only or audit tables outlive their usefulness and become noise for future auditors. Category and assignment tables are not append-only, so cleanup is mechanically possible — but leaving test rows is still incorrect because future data counts, admin listings, and analytics would include them.
Impact: The migration runbook must include explicit cleanup verification. The local `supabase db reset --local` clean run is the authoritative test environment — the migration must pass a full reset chain cleanly with no orphaned test rows.

---

## 2026-06-21 — Phase B-0 audit findings locked (read-only)

Decision: Two read-only audits (Phase A and Phase B-0.2) establish the following facts as locked design inputs for Phase B-1. No code was changed.
- `main_categories` is a shared multi-entity table (products + assets + partners + content pages). A new `partner_categories` table does NOT conflict with it and does NOT require changing it.
- The 20 existing partner category keys in `main_categories` (seeded in migration 097) remain in place during and after Phase B-1. `partner_profiles.main_category_key` and `secondary_category_keys[]` are NOT removed in Phase B-1 — they are deprecated and cleaned up in a later migration after admin assignments are populated.
- The 8 new top-level partner categories (`construction_materials`, `contractor_services`, `freelance_technicians`, `freelance_foremen`, `freelance_engineers`, `freelance_safety_officers`, `drafting_design`, `plc_programmers`) do not exist in any current table. They are new.
- Automatic backfill from old 20 keys to new 8 categories is NOT done in Phase B-1 — mapping is too ambiguous (11/20 old keys have no clean single mapping). Admin manual assignment via the updated Phase B-2 form is the correct approach.
- `partner_capabilities` and `partner_search_terms` tables are DEFERRED — no write path, no AI infrastructure exists. Existing `search_keywords TEXT[]` on `partner_profiles` is sufficient for V1.
Reason: These findings come from direct source inspection of 20+ files across migrations, API routes, admin components, and composables. Locking them prevents future sessions from re-deriving or contradicting them.
Impact: Phase B-1 migration scope is additive only: 2 new tables + 8 seed rows + RLS/grants/indexes. No existing tables, APIs, or UI files are changed in Phase B-1.

---

## 2026-06-18 (My Rentals section split — display grouping only)
Decision: Split `/user/rentals` into "Current rentals" (active status + non-past pickup) and "Past and completed rentals" (terminal status OR past pickup date). Historical items show `opacity-80`. Items with active status but a past pickup date show a "Pickup date passed" badge and live in the historical section. Historical section sorted most-recent first; current section sorted by user-controlled pickup toggle.
Reason: Users need a quick visual separation between actionable upcoming rentals and historical records. Display-only grouping — no business logic changes, no status mutations, no summary card changes.
Impact: `app/pages/user/rentals/index.vue` (new computeds, helpers, two-section template); 3 new i18n keys in all 4 locales; `tests/server/rental-section-split-ui.spec.ts` regression-guards all pre-existing patterns.

## 2026-06-18 (order history expandable items — lazy-load, not pre-loaded)
Decision: Order items on `/user/orders` are NOT pre-loaded in the list response. They are lazy-loaded per order from the existing `/api/user/orders/[id]` endpoint on first expand, then cached in component state (`detailItems.value[orderId]`).
Reason: `useOrders` list query (`select("*")`) does not join `order_items`; adding a join would make all order data heavier for a feature most users won't need on every page load.
Impact: `app/pages/user/orders/index.vue`; `detailItems`, `loadingDetails`, `detailError` per-order reactive records; new `OrderDetailItem` local type.

## 2026-06-18 (central manual payment requests)
Decision: Replace the per-target order/rental payment pages and the query-param
`/user/checkout-payment` prototype with ONE central `manual_payment_requests` model
(+ `_items` allocation, + `_slips` evidence) as the primary customer payment surface,
reached at `/user/payments/[id]`. Supports sale_only / booking_only / mixed.
Reason: One coherent "one amount due now + one slip" flow across all 3 checkout modes;
order/rental history keep their roles and only link to the related request; durable
(customer can return later) vs the throwaway query-param page.
Impact:
- New migration 115 (3 tables + private bucket `manual-payment-slips` + service_role-only
  RLS + indexes + assertions). ADDITIVE — existing `sale_order_payment_slips` /
  `rental_booking_deposit_slips` tables/endpoints are KEPT (legacy), not replaced; the
  central slip table is the single evidence store for the new flow and does NOT fan out.
- Cart still creates the sale order via the existing `POST /api/orders` (bank_transfer)
  and reuses existing draft bookings, then calls `POST /api/user/manual-payment-requests`
  which computes authoritative amounts server-side (booking deposit via
  `calculateBookingDepositDueNow`) and builds the request; navigates to `/user/payments/[id]`.
- EVIDENCE ONLY: customer slip upload moves the request to `pending_review`; it never marks
  an order paid, confirms a booking, deducts inventory, writes a held-balance event, or
  touches Omise/KYC. Admin review/reject change only payment-request/slip status; admin still
  confirms sale/booking via the EXISTING actions (Mark Payment Received / Mark Deposit Received).
- `/user/checkout-payment` (query-param) KEPT but DEPRECATED/unlinked (avoids breaking its
  2 committed specs); `/user/payments` list IS in MVP; `manual_payment_request_events` audit
  table DEFERRED. Money columns NUMERIC(12,2). i18n en/th real, cn/jp `[NEEDS_TRANSLATION]`.
- Admin pages use hardcoded English (existing non-i18n admin convention).

## 2026-06-17 (cart manual transfer — sale orders)
Decision: For launch, hide all online cart payment (Omise card / PromptPay / unified mixed checkout) behind a local flag `ONLINE_CART_PAYMENT_ENABLED=false` and route BOTH rental bookings and B2C sale orders into a manual bank-transfer + slip-upload flow. Sale orders get their OWN slip subsystem, separate from rentals.
Reason: Launch without a finished online payment integration. A unified "no online payment" cart keeps the customer flow coherent; keeping sale slips separate from rental slips preserves correct accounting (sale payment is an order payment, not a rental held-balance liability).
Impact:
- New private bucket `sale-order-payment-slips` + table `sale_order_payment_slips` (migration 114), modeled on rental migration 113. NEVER catalog-media; never public URLs; signed-URL access only.
- Sale order lifecycle reuses the EXISTING model: created `awaiting_payment` → customer slip upload → `pending_review` (never paid by upload) → admin "Mark Payment Received" → `paid`+`confirmed` via the existing paid-write convention, idempotent `f_apply_order_inventory` RPC, and cart clear. No VAT/revenue logic was invented (the audit found none for sale orders).
- Inventory is deducted ONLY at admin confirmation (decision A1), matching the Omise success path, via the existing idempotent RPC — not a hand-rolled deduction.
- Sale payment NEVER touches rental ledgers (`rental_held_balance_events`), `confirmRentalBooking`, or Omise/`payment_attempts`. `payments.ts` (critical) was not modified.
- New customer order detail page `app/pages/user/orders/[orderId].vue` + ownership-checked `GET /api/user/orders/[id]` (none existed).
- Online payment code is HIDDEN (flag-gated), not deleted, for easy re-enable. Customer i18n uses `[NEEDS_TRANSLATION]` placeholders for th/cn/jp pending translation; admin slip UI uses hardcoded English (matches existing non-i18n'd admin pages).

## 2026-06-17
Decision: Implement the manual bank-transfer booking-deposit flow as slip EVIDENCE + admin manual confirmation, reusing existing infrastructure rather than building a new payment subsystem.
Reason: Avoids a 3rd-party payment provider while keeping money handling correct and auditable. Slip upload is decoupled from confirmation so a customer upload can never confirm a booking or move money.
Impact:
- Slip files use a NEW private bucket `rental-deposit-slips` (migration 113), served only via short-lived signed URLs through route-authenticated server APIs. Never catalog-media; never permanent public URLs. Modeled on the KYC private-bucket pattern (no KYC code touched).
- The booking deposit is recorded as a held-balance LIABILITY (`rental_held_balance_events`, event_type `booking_deposit_collection`, source_type `manual_admin_confirmation`) — never revenue, never VAT, never `rental_booking_payment_lines`. No `rental_payment_events` table was created (the held-balance ledger already fits).
- Booking confirmation goes ONLY through `confirmRentalBooking()`; the manual path omits `requireBookingDepositHeldBalanceEvent` (manual source is not in that helper's closed union) and relies on `requireBookingDepositPaid` + the availability/overlap guard inside confirmation. Idempotent on `source_id = bookingId`.
- No Omise/QR/payment_attempts/payment-result pages touched. KYC remains paused.
- database.types.ts was updated by transplanting ONLY the new table block (not a full `--local` regen) to preserve the committed remote-`--linked` style per the 2026-06-07 handoff constraint.
- Admin slip UI strings are intentionally hardcoded English to match the existing non-i18n'd admin booking detail page; customer-facing strings use i18n with th/cn/jp `[NEEDS_TRANSLATION]` placeholders pending translation.

## 2026-06-16
> **SUPERSEDED 2026-07-14** (see "2026-07-14 — Post-journey-audit decision set (owner)" §a). KYC is **UNFROZEN as of 2026-07-14** — the freeze recorded below is no longer in effect. The historical record is kept for provenance; the "KYC frozen until resume" impact is dead.
Decision: Pause all KYC implementation after Slice ② (verify/revoke/verification-history) and pivot the next slice to a manual bank-transfer payment flow (customer uploads proof-of-transfer image; admin manually reviews/approves; no 3rd-party payment provider for now).
Reason: 3rd-party payment integration is taking too long; a simpler manual flow unblocks the business sooner. Slice ② was first reviewed at-source and confirmed correct (all six locked KYC auth constraints pass, 72 tests green), so the pause leaves no half-written auth surface.
Impact: KYC frozen — reject/renewal/purge/delete lifecycle, POS V3, staff_on_site, and user-account linking remain out of scope until resume. The previously-bypassed Slice ② auth-boundary review gate is now CLOSED (evidence in handoff.md 2026-06-16). Next build is Bank Transfer Slice ① = data/state model + one authoritative approve/reject transition only; it reuses KYC security patterns (private bucket + server-proxy, immutable decision log, true-identity-into-writer, access logging) but keeps a separate domain model from `kyc_documents`.

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
> **SUPERSEDED 2026-07-14** (see "2026-07-14 — Post-journey-audit decision set (owner)" §b). The open cancellation / no-show / late-cancellation policy questions this entry flagged are now **RESOLVED** by the 2026-07-14 cancellation-money policy. This defer note is closed.
Decision: `docs/customer-cancellation-refund-handoff.md` — defer archive decision.
Reason: Strongest ARCHIVE candidate (superseded handoff note), but contains open no-show policy questions (late-cancellation, undo-no-show, dashboard surfacing) not yet confirmed as captured elsewhere.
Impact: File left in place pending human confirmation that those questions are recorded in decisions.md or the Thai policy file.

## 2026-06-02 (TASK 4.1b audit)
Decision: Walk-in KYC gate resolves via `rental_bookings.kyc_profile_id` (direct FK to `kyc_profiles`), NOT by `walk_in_phone` matching.
Reason: Phone is a contact field, not an identity key. A phone-based lookup could bind the wrong verified profile to a booking, which is a security risk. The schema FK set in migration 106 is the intended gate input for walk-in bookings. Registered bookings continue to resolve via `user_id → kyc_profiles.user_id` — the two paths are mutually exclusive (`if (userId)` takes precedence).
Impact: `loadRentalPickupReadiness` and `assertPickupCustomerEvidence` must add `kyc_profile_id` to their booking SELECT strings and branch on it for walk-in resolution. Walk-in bookings with `kyc_profile_id = null` remain blocked (`no_profile`) until TASK 4 UI sets the column.

## 2026-06-02 (TASK 4.1b audit)
Decision: KYC snapshot columns in `rental_booking_fulfillments` are written atomically at `confirmPickup` time by returning a `KycPickupSnapshot` struct from `assertPickupCustomerEvidence` and including it in the fulfillment INSERT.
Reason: The snapshot must freeze the KYC authorization evidence at the exact moment the gate passes — same `new Date()` call that evaluates the gate. Splitting gate evaluation and snapshot write into separate steps would create a TOCTOU window where the snapshot could differ from the gate decision. The snapshot is audit evidence only; it must never feed back into gate resolution.
Impact: `assertPickupCustomerEvidence` return type changes from `void` to `KycPickupSnapshot`. `RentalFulfillmentPrerequisites` gains a `kycSnapshot` field. Override SELECT must include `id` to populate `kyc_override_id`. Profile SELECT must include `id` to populate `kyc_profile_id`. For `return` events, all snapshot columns remain NULL.

## 2026-05-31 (TASK 4.0b + 4.1a)
Decision: Walk-in KYC is NOT owned by `walk_in_customers` (phone-rooted entity). KYC ownership is identity-hash-rooted via `kyc_profiles` only.
Reason: `walk_in_customers` uses `phone TEXT PRIMARY KEY` — there is no stable UUID id column. Adding a phone-based FK for KYC ownership would couple KYC resolution to phone matching, which is explicitly prohibited. Identity-hash-based lookup (`hashKycIdentity`) is the only safe dedup mechanism.
Impact: `kyc_profiles` retains `user_id` as the only owner FK. Walk-in gate resolution uses `rental_bookings.kyc_profile_id` (set explicitly by staff via POS V3 KYC mode), not phone lookup.

## 2026-05-31 (TASK 4.1a)
Decision: `rental_bookings.kyc_profile_id UUID NULL` is the walk-in gate resolution input. Registered-user bookings resolve via `user_id → kyc_profiles.user_id` (unchanged).
Reason: Provides a stable, identity-rooted link from a booking to its KYC profile without phone matching. Staff explicitly sets this column via POS V3 KYC mode — it is never auto-populated by phone.
Impact: Gate code (`rental-pickup-readiness.ts` + `rental-fulfillment.ts`) must be updated in TASK 4 to use `rental_bookings.kyc_profile_id` for walk-in path, rather than the current phone-based `kyc_profiles.walk_in_phone` lookup.

## 2026-05-31 (TASK 4.1a)
Decision: Pickup-time KYC authorization snapshot written to `rental_booking_fulfillments` (5 new columns). No new table created.
Reason: `rental_booking_fulfillments` is already the pickup audit table (one row per pickup/return event, append-only by application design). Adding snapshot columns there avoids a new table and keeps all pickup evidence co-located.
Impact: `rental-fulfillment.ts` `confirmPickup` must write snapshot columns atomically in the same INSERT. Snapshot is audit evidence only — not a gate resolution input. Three CHECK constraints enforce snapshot consistency at the DB layer.

## 2026-05-31 (TASK 4.1a)
Decision: No DB-level immutability trigger on `rental_booking_fulfillments`. Application-layer append-only invariant is sufficient for this phase.
Reason: `rental_booking_fulfillments` is already `REVOKE ALL FROM authenticated/anon; GRANT ALL TO service_role`. Only server-side code writes to it, and no UPDATE code path exists in the application. A trigger would add friction without meaningful security benefit at this stage.
Impact: If a trigger is added later, it should be a separate migration scoped to the KYC snapshot columns, not a whole-row freeze.

## 2026-05-31 (TASK 4.1a)
Decision: Snapshot consistency CHECKs added to `rental_booking_fulfillments`: 'verified' → `kyc_profile_id IS NOT NULL`; 'override' → `kyc_override_id IS NOT NULL`.
Reason: The snapshot is written atomically in a single INSERT at confirmPickup time, so staged-rollout concerns do not apply. DB-level enforcement catches any future implementation bugs that would write an inconsistent snapshot.
Impact: confirmPickup code must supply all required snapshot fields when writing `kyc_authorized_via`. A partial write will be rejected with a CHECK violation.

## 2026-06-02
Decision: Two snapshot-consistency CHECK constraints removed from migration 106 before commit (`chk_fulfillment_kyc_verified_has_profile`, `chk_fulfillment_kyc_override_has_id`).
Reason: Both CHECKs conflict with `ON DELETE SET NULL` on the `kyc_profile_id` / `kyc_override_id` FKs — a cascade nullification would set the UUID to NULL while `kyc_authorized_via` retains `'verified'`/`'override'`, causing a CHECK violation on the existing row. Snapshot consistency is enforced by the application's atomic INSERT at confirmPickup time instead.
Impact: DB-layer immutability is lighter; `confirmPickup` server code owns correctness for snapshot fields. Any refactor to `confirmPickup` must preserve the invariant: `kyc_authorized_via = 'verified'` → `kyc_profile_id NOT NULL`; `kyc_authorized_via = 'override'` → `kyc_override_id NOT NULL`.

## 2026-06-02
Decision: `supabase/migrations/102_lkb_branch_public_and_dedup.sql` was edited despite the "no-edit old migrations" rule (`supabase/CLAUDE.md §8`). Approved as an explicit one-time exception.
Reason: Migration 102 contained a hardcoded inventory UUID (`e4ad1acc-66df-407e-96c1-6bf87d5b68f4`) that does not exist on fresh `db reset --local` (the branch was created out-of-band on staging before migration 102 was written). The UUID blocked every local/CI reset at migration 102, preventing migration 106 from applying in a clean chain. The fix is reset-safety and idempotency only — it does not alter staging runtime data because migration 102 will not re-run remotely.
Impact: `supabase db reset --local` now completes cleanly through migration 106. The rule holds for all other migrations; this exception is specific to migration 102 and the out-of-band branch scenario.

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

## 2026-06-05 (Phase 1B — KYC document upload endpoint, committed `010ee9b`, pushed)
Decision: KYC document upload is server-mediated only via `POST /api/admin/kyc/profiles/[id]/documents` (`requirePlatformAdmin`; no customer self-upload for MVP) into the dedicated private `kyc-profile-documents` bucket (migration 109; no `storage.objects` policies — verified zero on remote). Security gate at the application layer: (a) hard streaming body limit counting ACTUAL bytes (never Content-Length; chunked/spoofed-CL cannot bypass), with the capped buffer handed to h3's multipart parser via the `event.node.req.rawBody` pre-read fallback — proven by a real-h3 integration spec plus an h3-source upgrade canary; (b) magic-byte MIME sniffing only (JPEG `FF D8 FF`, full 8-byte PNG signature, `%PDF-` at offset 0; SVG and everything else rejected 415; client MIME never trusted); (c) opaque `kyc/<random-uuid>.<ext>` object keys never derived from profile id, identity value, or filename; (d) documentType coherence keyed on the profile's `customer_type × identity_type` pair, mirroring the create-time guard — `individual×national_id → id_card|signature`, `individual×passport → passport|signature`, `company×juristic_id → company_cert|vat_certificate|signature`, any other pair fails closed 422; (e) `company_cert` requires `issuedAt`; a future `issuedAt` is rejected for ALL types (Asia/Bangkok); `expiresAt < issuedAt` rejected — capture/sanity only, expiry ENFORCEMENT deferred to the verify/gate phase; (f) the upload access-log write is typed against the generated `kyc_document_access_log` Insert type, best-effort with a `console.error` breadcrumb (`failClosed: true` reserved for downloads); (g) responses go through `toSafeKycDocument` only — no `storage_path`, no bucket, no public/signed URL ever returned.
Reason: The kyc_documents table and the access log are immutable evidence surfaces; every rule above prevents poisoned or leaky evidence (wrong-identity documents, guessable paths, PII in the audit trail, spoofed sizes/types) rather than trusting client input.
Impact: `server/utils/kyc-documents.ts` + `kyc-document-view.ts` are the only sanctioned helpers for KYC document storage/serialization (see `docs/index/server-utils-index.md` rows). 165 targeted tests + tsc gate the contract. An h3 upgrade that drops the `rawBody` fallback fails the integration spec loudly.

## 2026-06-05 (Decision A — session docs + probe row permanence)
Decision: Session docs (`decisions.md`, `handoff.md`, `progress.md`) are committed BEFORE Phase 2 begins. The staging probe-row note is a permanent part of the docs: a non-PII probe row exists in remote/staging `public.kyc_document_access_log` (id `f122e850-2c73-49ec-a6c1-12e961f7fd36`, action `upload`, result `allowed`, reason `remote-verify-probe`, all PII fields NULL). It must never be deleted (the log is append-only by design); audits filter it with `reason <> 'remote-verify-probe'`; all future remote verification of immutable logs must be read-only / metadata-only so no further permanent probe rows are created.
Reason: The probe row outlives every session — undocumented, it would look like an anomaly in future audits. Doc debt accumulating across phases makes handoffs unreliable.
Impact: This commit (docs-only) lands before any Phase 2 file is created. The probe-row note lives in `handoff.md` (2026-06-04 entry) and `progress.md` Notes, now durable on staging.

## 2026-06-05 (Decision B — Phase 2 sequencing)
Decision: Phase 2 starts with the super_admin-only server-mediated download endpoint. Download and purge are SEPARATE commits. The purge primitive is deferred until the legal retention scope is decided. No HTTP delete endpoint yet. Denied non-super_admin download attempts must be logged WITHOUT loading the document row (no document/profile data touched on the deny path). Non-super_admin download must return a uniform 403 that does not reveal whether the document exists.
Reason: Download is the highest-value missing primitive and its fail-closed logging contract (`failClosed: true`) is already reserved in `logKycDocumentAccess`. Purge has legal dependencies (retention duration) that code must not preempt. A deny path that loads the row or varies its response would leak document existence to non-authorized staff.
Impact: Phase 2 commit 1 = download endpoint only. `logKycDocumentAccess(..., { failClosed: true })` is mandatory before issuing any signed URL. Deny-path log entries carry only the requested ids as opaque references, never loaded row data.

## 2026-06-05 (Decision C — production readiness gate for KYC documents)
Decision: Real KYC document upload/download in PRODUCTION is blocked until ALL of: (1) legal retention duration is decided and recorded in decisions.md; (2) the no-AV/malware-scanning gap is remediated or explicitly accepted by the owner and recorded; (3) the production `storage.objects` policy gate is re-run and passes (zero policies matching the KYC bucket); (4) the h3 version/canary check is pinned/run in production CI; (5) production verification never inserts probe rows into immutable logs (read-only / metadata-only checks only).
Reason: Staging verification does not transfer to production: policies, h3 version, and log contents are environment-specific, and retention/AV are owner-level compliance calls that engineering cannot default.
Impact: Phase 2+ code may land on staging, but production enablement requires a recorded check against all five gates. Item (5) makes the staging probe-row mistake structurally unrepeatable in production.

## 2026-06-05 (Decision D — Vercel streaming spike PASS → Phase 2 uses PURE server-proxy download)
Decision: Phase 2 KYC document download is a **pure server-proxy** endpoint. No hybrid signed-URL fallback is built in the initial implementation. This finalizes the proxy pivot and AMENDS Decision B's mechanism wording: the locked contract — a fail-closed `allowed` log row must durably exist before anything capable of granting access leaves the server — now applies to **byte delivery** ("before initiating the storage fetch/stream"), not signed-URL issuance. Decision B's auth/deny-path/sequencing rules (super_admin-only, uniform 403, no row load on deny, download/purge separate commits) are unchanged. The full locked implementation spec is `docs/kyc-phase-2-download-spec.md`.
Reason: A live Vercel Preview spike (throwaway branch `spike/vercel-streaming`, commit `99a2038`, deployment `dpl_Ae9LzghH3wCtn8C7Txucz6C9cn13`, deleted after) proved over the wire, with incompressible random bytes and SHA-256 verification:
  1. Synthetic 6 MB streamed: HTTP 200, 6,291,456/6,291,456 bytes, checksum match (sha256 `8a76f916…`).
  2. Synthetic 10 MB streamed (= KYC bucket max): HTTP 200, 10,485,760/10,485,760 bytes, checksum match (sha256 `f1e7cd6f…`).
  3. REAL-OBJECT pass through the exact production shape `storage.download(path)` → `blob.stream()` → response, against a temporary 6 MB `catalog-media` fixture: HTTP 200, exact bytes, end-to-end checksum identical (sha256 `d7abfb74…`).
  No 413, no FUNCTION_PAYLOAD_TOO_LARGE, no truncation in any test.
Runtime/platform baseline (recorded for future re-verification):
  - Nuxt 4.3.1, Nitro 2.13.1, build log line `Nitro preset: vercel` (zero-config detection)
  - Node.js serverless functions (λ) — NOT Edge runtime; project nodeVersion 24.x; function region iad1
  - **Fluid Compute enabled**: project `resourceConfig.fluid === true` (this is WHY even a 6 MB buffered control response passed — the legacy 4.5 MB buffered-response limit does not apply under Fluid Compute)
  - Streamed responses over HTTP/2 carried NO Content-Length (h2 DATA-frame streaming); the buffered control carried `content-length` — the header difference distinguishes the two delivery paths
Impact:
  1. **Omit Content-Length** on the production download response. Streaming delivered exact bytes without it, and deriving it from `kyc_documents.file_size_bytes` would turn any metadata/object byte drift into a hard protocol failure (truncated/hung response).
  2. **Fluid Compute guard (NOT prose-only):** the pure-proxy decision is contingent on Fluid Compute staying enabled. A later enforced check is planned — CI/deploy-time assertion that `resourceConfig.fluid === true` (Vercel API) or equivalent build-output evidence. If Fluid Compute is ever disabled, KYC proxy download must be RE-SPIKED before any further production use.
  3. **Bucket cap coupling:** pure proxy is approved under the current `kyc-profile-documents` 10 MB file-size limit (migration 109). If that limit is ever raised above 10 MB, the streaming spike must be re-run at the new maximum BEFORE the larger limit ships.
  4. **Evidence limitation (recorded honestly):** the real-object `storage.download()` → `blob.stream()` shape was proven at 6 MB; 10 MB was proven synthetically only. Pure proxy is still accepted because KYC access is low-volume, Fluid Compute is enabled, and 10 MB streamed delivery passed. Optional future hardening: run a 10 MB real-object pass the next time a preview spike is being run anyway.
  5. Hybrid signed-URL fallback (4.0 MB threshold, mint-first order) is shelved, not deleted — documented as the contingency in `docs/kyc-phase-2-download-spec.md` §9, to be activated only if the Fluid Compute guard or a re-spike fails and the owner approves.
  6. All spike artifacts were removed (see progress.md 2026-06-05 spike session): branch + spike route deleted (never merged), Vercel preview deployment removed, protection-bypass automation secret revoked, temporary `catalog-media` fixture deleted, local temp files removed. No endpoint code was written; migration 110 remains untouched.

## 2026-06-05 (Decision E — download access-log semantics + Content-Disposition)
Decision: For the Phase 2 download endpoint, `action='download'`, `result='allowed'` means **access granted and delivery attempted / stream initiated** — the fail-closed log row durably existed BEFORE the server initiated the storage fetch/stream. It does NOT assert the browser fully consumed the bytes (a client abort mid-stream is undetectable and unlogged). The trail's guarantee is one-directional: **no bytes are ever delivered unless the fail-closed `allowed` row exists first**; an `allowed` row does not prove full consumption. If the storage fetch/stream initiation fails AFTER the `allowed` row, a best-effort correction row is written: `result='denied'`, `reason='storage_download_failed'` (the `result` vocabulary is constraint-locked to allowed|denied; the machine reason carries the real meaning). For the shelved signed-URL contingency branch, `action='download_signed_url'`, `result='allowed'` means the URL was minted AND the allowed log durably written before disclosure (issuance-only record — see `docs/kyc-phase-2-download-spec.md` §9). Owner decision: `Content-Disposition` is **`attachment`** (opaque filename `kyc-<documentId>.<ext>`), never `inline`.
Reason: Proxy delivery makes the allowed log a true consumption-attempt record (vs. the issuance-only record a signed URL produces), but full-consumption proof is impossible at the server — recording the semantic honestly prevents future audits from over-reading the trail. `attachment` avoids rendering KYC PDFs under our origin (PDF viewers can execute embedded scripts) at the cost of one click for admins.
Impact: The endpoint orders operations strictly: load row → validate path/MIME → fail-closed allowed log → storage fetch → stream (full order in `docs/kyc-phase-2-download-spec.md` §2.1). The correction row's own failure must not mask the 500 and never retroactively edits the `allowed` row (append-only). Tests must pin: allowed-log-before-fetch call order; log failure → 500 with zero bytes; fetch failure → 500 + best-effort `storage_download_failed` row.

## 2026-06-05 (Decision F — PDPA stance for kyc_document_access_log IP/UA capture)
Decision: The access log continues to store the **full validated single IP** (`parseSingleForwardedIp` → `inet`) and raw user-agent for KYC document access events. Code-only stance; no schema change.
Reason / basis (recorded for PDPA):
  - **Purpose:** forensic attribution of staff/super_admin access to retained KYC evidence — who uploaded/downloaded which document, when, from where. This is the log's reason to exist.
  - **Legal basis:** legitimate interest (PDPA §24(5)) — security/fraud-prevention processing of INTERNAL STAFF actors' IP/UA; proportionate because read access is super_admin-only, writes are service-role-only, anon is revoked, and the data subjects are employees acting in an admin capacity, not customers.
  - **Accrual is real and accepted:** staff IP/UA exposure DOES accrue on staging now, in an immutable, undeletable log. This accrual is accepted under the basis above — it is not claimed to be zero.
  - **Retention:** tied to the production readiness gate (Decision C item 1). The legal retention duration decided there governs this already-accrued staging data as well as future production data.
  - **Masked/hashed IP: deferred,** with rationale — a hash cannot live in the `inet` column without a migration and is trivially reversible over the IPv4 space (sham anonymization); truncation destroys per-actor attribution, defeating the purpose. **Mandatory revisit trigger:** if any customer-facing flow ever writes CUSTOMER IPs to this log, masking/hashing gets its own phase.
Impact: No migration, no types regen. Documented basis travels with the immutable log; future audits read this entry rather than inferring intent.

## 2026-06-05 (Decision G — malformed-id log purity for the immutable KYC access log)
Decision: Raw attacker-controlled route ids must NEVER be written into `kyc_document_access_log` (any column). `document_id` is `uuid NULL` (migration 109) — passing a non-UUID string into the insert payload would make the BEST-EFFORT denied log fail silently, erasing the denial from the trail. Therefore the download endpoint classifies the route id (`asUuidOrNull`) before building any log payload:
  - Non-super_admin + malformed id → uniform 403 (byte-identical to all other non-super_admin responses), NO `kyc_documents` query, best-effort log with `document_id = null`, `reason = 'not_super_admin_malformed_id'`.
  - Non-super_admin + uuid-shaped id → uniform 403, NO `kyc_documents` query, best-effort log with `document_id = <id>`, `reason = 'not_super_admin'`.
  - super_admin + malformed id → 400, best-effort log with `document_id = null`, `reason = 'malformed_document_id'`.
  - The raw malformed string appears NOWHERE in the log row (it is attacker-controlled input and potentially PII-bearing — migration 109 non-PII invariant).
Reason: Closes two traps at once — a silent audit gap (schema-invalid best-effort insert vanishing) and a PII/injection vector into an immutable, undeletable log. The `reason` prefix `not_super_admin…` keeps role-denial audit queries (`reason LIKE 'not_super_admin%'`) complete while the suffix disambiguates the null `document_id`.
Impact: All five denial-payload sibling columns (`document_id`, `kyc_profile_id`, `document_type`, `storage_bucket`, `storage_path`) verified nullable in migration 109 + generated types — every denial path produces a schema-valid insert with no migration. Test matrix in `docs/kyc-phase-2-download-spec.md` §5 pins the malformed-id behavior, including that the raw string is absent from the serialized log payload.

## 2026-06-05 (Decision H — purge lesson from the post-smoke cleanup: fail-closed delete-log-before-removal)
Decision: The future KYC purge/delete primitive (still DEFERRED per Decision B pending legal retention scope) is bound by the **fail-closed delete-log-before-removal invariant**: a sanctioned purge/delete endpoint must write an `action='delete'` audit row to `kyc_document_access_log` BEFORE removing the storage object or any database row; that delete audit row must be **fail-closed, not best-effort** (`logKycDocumentAccess(..., { failClosed: true })`); if the delete audit log write fails, the purge MUST abort and leave the document/object fully in place. Invariant: **no KYC document is ever removed without a committed delete audit row.**
Reason: The 2026-06-05 post-smoke manual cleanup (synthetic fixture: document `bb92221e-8f3e-4fa6-bf2a-b496d2ca77fb`, profile `7a651dfb-0860-4f1e-991e-5961f2e8f9f0`, object `kyc/2552f565-4c4c-4aab-ac49-dde80dc6e722.jpg`) demonstrated both halves of the design:
  1. **Audit-survival confirmed live:** the genuine `download`/`allowed` access-log row outlived the deleted `kyc_documents` and `kyc_profiles` rows — exactly the migration-109 denormalized purge-survival design working as intended.
  2. **Gap exposed:** the manual service-role cleanup wrote NO `delete` audit row — the document's removal is invisible in the access log (only the cleanup session report attests to it). This is acceptable ONLY for that one-off synthetic, non-PII smoke-fixture cleanup; it must never happen for a real customer document.
Impact: `action='delete'` already exists in the access-log action vocabulary (migration 109, preserved through migration 110), so the future purge phase has the required action value available with no schema change. The purge endpoint design must mirror the download endpoint's ordering discipline (fail-closed log precedes the irreversible step). Access-log rows themselves must never be deleted or mutated (append-only triggers enforce this for all roles). Until the purge primitive ships, any further manual cleanup of synthetic fixtures requires explicit owner approval and a session-doc record, same as this one.

## 2026-06-06 (Decision I — Fluid Compute guard: manual production-enablement gate via Vercel API only; no standing CI token)
Decision: AMENDS Decision D impact 2's enforcement wording. The enforced Fluid Compute check is implemented as `scripts/check-vercel-fluid.mjs` (`npm run check:vercel-fluid`) — a **MANUAL production-enablement gate** run with an **EPHEMERAL Vercel token** (create → run → revoke; never stored in the repo, `.env`, or any CI secret) before enabling production KYC proxy download, alongside Decision C's five gates. Two amendments to Decision D impact 2: (1) the "or equivalent build-output evidence" alternative is REMOVED — verified unavailable: Fluid Compute is a project-level Vercel setting that does not appear in build output (`.vc-config.json`), so the Vercel API (`GET /v9/projects/{VERCEL_PROJECT_ID}[?teamId=…]` → `resourceConfig.fluid`) is the ONLY source of truth; (2) the enforcement point moves from "CI/deploy-time" to manual-at-enablement — NO GitHub Actions workflow and NO standing CI secret are created now. Scheduled/CI monitoring remains a FUTURE OPTION only if the owner explicitly accepts the standing-token risk.
Reason: Vercel tokens are not read-only — a long-lived token in GitHub Secrets would carry team/project WRITE risk for a repo that currently has zero CI workflows; GitHub Actions cannot block Vercel Git deploys anyway (detection, not prevention); and the real hard gate belongs at Decision C production-enablement time, where a human runs the check with a throwaway credential. Fluid Compute only changes via deliberate dashboard action, so continuous monitoring buys little against this threat model.
Impact: Script semantics are locked three-state: **PASS** only on strict boolean `resourceConfig.fluid === true` AND response `id` matching `VERCEL_PROJECT_ID` (exit 0); **FAIL** on explicit boolean `false` (exit 1); **UNKNOWN/fail-loud** (exit 2) for auth/API errors, project-id mismatch, missing `resourceConfig`/`fluid`, non-boolean flag (string `"true"` rejected), or any unexpected shape — UNKNOWN is a hard stop, never a pass. Any non-PASS: production KYC proxy download must NOT be enabled and the streaming spike must be RE-RUN per Decision D; the shelved signed-URL contingency (spec §9) activates only with owner approval. Fixture-verified by `tests/server/vercel-fluid-guard.spec.ts` (29 tests; no live API calls in tests; offline CLI dry-run via `--fixture`). **Live-run status: PENDING** — the one-time live Vercel API verification was deferred by the owner on 2026-06-06; spec §8 must not claim live verification until that run reports PASS. When Decision C production work begins, the FIRST step is a consolidated `docs/kyc-production-enablement-checklist.md` listing this check explicitly.

## 2026-06-06 (Decision J — Admin KYC Documents Panel v1 conventions: admin i18n scope, unlogged list, next-tick revoke)
Decision: Three owner-locked conventions for the Admin KYC Documents Panel v1 (staging). (1) **Admin i18n scope:** the strict 4-locale i18n rule (CLAUDE.md "i18n Rules — STRICT") applies to CUSTOMER-FACING surfaces; the internal admin back-office UI is intentionally English-only for now — matching the existing convention across the whole admin layout/components — until a broader admin i18n pass is scheduled. New admin-only UI may ship with hardcoded English and must NOT touch the four locale JSON files. (2) **List access is intentionally unlogged in v1** because it returns safe metadata only and is lower sensitivity than document delivery. Revisit if metadata listing is later deemed auditable. No migration, no widening of the audit action constraint for `list`. (3) **Download object-URL revoke is NEXT-TICK** (`setTimeout(() => URL.revokeObjectURL(url), 0)`), never synchronous after the anchor click — synchronous revoke can cancel the download in some browsers (include in staging smoke-test notes).
Reason: (1) Customer-facing locale completeness is a product requirement; internal staff tooling is single-language today and a piecemeal per-panel i18n would create a mixed half-translated admin. The four locale files also carry unrelated uncommitted work, making per-feature locale edits a staging hazard. (2) The list endpoint returns the PII-free SafeKycDocument whitelist; logging metadata reads would add an audit action value (migration) without a current audit requirement. (3) Browser download behavior with object URLs is asynchronous; the revoke must not race the navigation.
Impact: The Admin KYC Panel v1 (list endpoint + page + component) ships English-only with no locale-file changes. `kyc_document_access_log` vocabulary stays `upload | download_signed_url | delete | download` (migrations 109/110, unchanged). The UI source-inspection spec pins the next-tick revoke pattern. Staging UI remains NOT gated by `docs/kyc-production-enablement-checklist.md`; production exposure stays behind Decision C.

## 2026-06-06 (Decision K — KYC_HASH_SECRET is a permanent, hash-only, NON-ROTATABLE secret)
Decision: `KYC_HASH_SECRET` (the HMAC-SHA256 key in `server/utils/kyc.ts hashIdentity`) is classified as a **special-case permanent secret, not a normal disposable runtime token**. Rules: (1) it MUST be set in every deployed environment BEFORE the first real KYC profile is created there; (2) it MUST be securely backed up outside git (password manager / secret vault — never committed, never printed); (3) it is **effectively non-rotatable**: verified from the data model that NO raw identity value is stored anywhere — `kyc_profiles` holds only keyed `identity_hash` + masked `identity_last4` (migration 105), pickup snapshots hold status/dates only (migration 106), and there is no plaintext identity column in any migration — so LOSING the secret orphans every existing KYC profile (lookups can never reproduce the same hash again), and a COMPROMISE cannot be cleanly rotated without re-collecting identity values from customers or building a lazy re-verification/re-collection flow; (4) a required-env completeness check (every key in `.env.example`, explicitly including `KYC_HASH_SECRET`) is a production-enablement gate and must run BEFORE any manual smoke, not during it (`docs/kyc-production-enablement-checklist.md` §4.0).
Reason: The 2026-06-06 staging smoke found `KYC_HASH_SECRET` missing from the staging Vercel environment (and local `.env`) — `POST /api/admin/kyc/profiles/lookup` returned 500 `KYC_HASH_UNAVAILABLE`, blocking the entire /admin/kyc UI path. That was harmless on staging (zero real profiles; hashing hard-fails closed by design), but the same gap in production after real profiles exist would be an outage, and setting a DIFFERENT value later than the one used at first-profile-creation would silently orphan all earlier profiles. The keyed-hash/no-plaintext design that makes the store PDPA-lean is exactly what makes the key permanent.
Confidentiality (not only availability): Thai national IDs, juristic IDs, and passport numbers are STRUCTURED/GUESSABLE identity spaces — `KYC_HASH_SECRET` is the only thing preventing an attacker who obtains `identity_hash` values from brute-forcing/enumerating candidate identities and confirming who is enrolled. If BOTH the hash table and the secret are compromised, that is **de-anonymization of enrolled identities and a PDPA personal-data exposure requiring breach assessment** — not merely an operational reset/re-verification project. Therefore: the secret and the `identity_hash` values must live in SEPARATE TRUST ZONES — the current architecture already has that strength (secret in the Vercel env, hashes in the Supabase DB) and must keep it; access to the secret AND its backup must be protected at least as strongly as database access; the secret is never printed, pasted, logged, or committed anywhere; records carry presence/evidence references only, never the value.
Impact: Owner sets the secret once per environment (staging now; production at enablement) generated per `.env.example` (`openssl rand -hex 32`), backs it up outside git in a vault protected at least as strongly as DB access, and treats staging and production as INDEPENDENT secrets (they share no profiles). Checklist §4.0 gates production enablement on env completeness and carries the same confidentiality rules. Any future "rotate KYC_HASH_SECRET" request must be treated as a re-collection/re-verification project, not a config change — and a suspected secret-plus-hash-table compromise additionally triggers PDPA breach assessment. No code change required by this decision.

## 2026-07-07 — i18n: cn/jp locale disable, deposit glossary rule, status-enum namespaces

1) 2026-07-07 — i18n: cn/jp locales disabled from public UI (switcher +
   normalizeLocale fold to th). Locale JSON files retained on disk;
   nuxt.config locales untouched. Admin content editor keeps all 4 tabs.
   Re-enable = revert commit d9e15ea.
2) 2026-07-07 — Glossary rule (locked): never bare "มัดจำ" in money-path
   copy — always เงินมัดจำจอง or เงินมัดจำประกัน. Refundable-not-rental-fee
   distinction must survive in any deposit copy.
3) 2026-07-07 — i18n status enums: paymentHistory.status.* maps 1:1 to
   slip enum (manual_payment_request_slips.status, 3 values);
   paymentRequests.* maps to request enum (5 values). Namespaces are
   separate by design — do not conflate.

## 2026-07-09 — Payment-flow ratification, G2 scope, POS V3 track, POS V3 language policy, KYC freeze status

1) Payment flow RATIFIED: in-system slip upload (migration 115,
   `manual_payment_requests` + items + slips) is the CANONICAL payment
   flow. The Phase 0 architecture (LINE/WhatsApp slip + Mark Deposit
   Received, no in-system slips) is FORMALLY ABANDONED — resolves the
   2026-07-07 "ratify or reverse" agenda item (handoff.md 2026-07-07).
   Launch BLOCKERs: G1 — append-only/UPDATE-guard triggers missing on
   payment tables (planned migration 118); G2 — deposit confirm is 4
   non-atomic writes (planned migration 119 RPC).
   Pre-conditions for any future staff-upload-on-behalf feature:
   G3 — reviewer must not equal uploader; G4 — void correction path;
   A1 — slip access logging.

2) G2 RPC scope note: the 2026-07-09 POS V3 deep audit
   (docs/audit/2026-07-09-pos-v3-deep-audit.md §P2.5) VERIFIED a
   cash-path W1→W2 crash gap — money collected, booking stuck in
   `draft`, unrecoverable by retry (same-key retry short-circuits
   without finalizing at booking-deposit-payments.post.ts:150-168;
   new-key retry blocked by the one-paid partial unique index,
   migration 087:41-43). Migration 119 MUST close this: atomic W1–W4
   AND idempotent finalizer re-entry for cash same-key retries (the QR
   path already recovers via the idempotent finalizer).
   Status: HIGH, pending reproduction test (first task of V3-0).
   Also folded into migration 119 scope: W3 booking-update result never
   checked (finalizer :128-137) and doc-task insert error swallowed
   (finalizer :241-243) — deep-audit findings 11–12.
   Scope covers BOTH non-atomic confirm paths: the manual slip
   confirm (rental-manual-deposit-confirmation.ts:168-250, per
   docs/payment-flow-ratification-audit.md F4) and the POS V3
   finalizer path.

3) POS: V3 is the ONLY development track. v1 (currently the only
   sale-capable POS) will be retired at V3-6, after V3 is
   feature-complete (sale + fiscal documents + KYC + return) on a
   single iPad for non-technical front-desk staff.
   Slices: V3-0 integrity foundations → V3-1 sale → V3-2 fiscal docs →
   V3-3 KYC → V3-4 return/settlement → V3-5 iPad UX → V3-6 retire v1/v2.

4) POS V3 i18n/language policy: POS V3 is a STAFF-FACING surface, NOT
   back-office under Decision J (2026-06-06). All copy that front-desk
   staff must read to make decisions (primary action buttons, error
   messages, money/status labels) must be Thai. Technical labels may
   remain English. No mixed-language within one screen section.
   Implementation scheduled in V3-5. Deep-audit finding 18 (zero i18n /
   mixed Thai-English across V3) is accepted as valid (MED).

5) **SUPERSEDED 2026-07-14** (see "2026-07-14 — Post-journey-audit decision set (owner)" §a): KYC freeze is **LIFTED NOW**, not at V3-3. The text below is dead. ~~KYC freeze (DECISIONS.md 2026-06-16, "KYC frozen" impact) REMAINS in
   effect. It will be formally lifted when V3-3 begins, as a recorded
   decision at that time — not now.
   Reason: the KYC backend is test-green (14/14 spec files, 2026-07-09
   deep audit) and V3-4 (return) depends on identity confirmation, so
   KYC stays in the V3 track but behind the freeze gate.~~

## 2026-07-10 — V3-0 integrity foundations complete; suite-green enforced

Decision: V3-0 integrity foundations complete. G1/G2 launch blockers
CLOSED (mig 118/119, verified by reproduction + live regression).
Fixture-rot baseline eliminated — suite green is now the enforced
norm: any future red test is a stop-and-report event, not accepted
debt.
Reason: the 20-failure baseline masked real regressions and made
"tests pass" meaningless as a gate; V3-0 closes both money-integrity
blockers and the observability debt in one slice.
Impact: all future work runs against a 2611/0 baseline; POS V3 track
proceeds to Flow B continuation (B6) with G1+G2 no longer blocking
launch readiness.

## 2026-07-14 — Post-journey-audit decision set (owner)

Context: after the 3-case customer-journey audit (purchase `8886ddb`,
rental `2db625a`, mixed `84857de`), the owner (CHiP) ratified the
following. Where these conflict with older entries, THESE WIN — the
older entries above are marked SUPERSEDED with pointers here. The
implementation routing table is `docs/MASTER-GAP-MAP.md`; the working
rules are `docs/OPERATING-MODEL.md`.

### §a — KYC UNFROZEN (supersedes 2026-06-16 freeze + 2026-07-09 item 5)
Decision: KYC is **UNFROZEN as of 2026-07-14**. It is no longer gated
behind V3-3; it is the first implementation track (T1).
Minimum KYC (rental-only requirement; **sale flows never require KYC**):
- **Individual:** a signed copy of the ID document (image/PDF, marked
  "สำเนาถูกต้อง") + name-on-ID + phone.
- **Juristic:** company affidavit (หนังสือรับรองบริษัท) dated ≤ 6 months
  + Por.Por.20 (ภ.พ.20), BOTH signed + company-sealed by the
  authorized signatory + company name + phone.
- Bound to user ID; **once per user**.
Two channels:
1. **Customer online self-serve** → lands in a **SUPER ADMIN approve
   queue**.
2. **Staff upload on the customer's behalf**, linked via the existing
   **User-ID QR**.
Refusal to provide KYC → **staff cancels** the booking. KYC is required
only for rentals; sale/checkout never triggers it.

### §b — Cancellation money policy (supersedes 2026-05-31 open questions)
- **Customer online self-cancel:** allowed **only ≥ 7 days before the
  start date** → booking-deposit **REFUND**. Refund is **bank transfer
  only**; the customer must supply a **reason + bank account**, and the
  **admin uploads the refund slip** as evidence.
- **< 7 days before start:** **staff-only** handling; deposit is
  **FORFEITED** (no self-service).
- **No-show:** system **auto-marks `no_show` at 00:00 the day after the
  start date** → **auto forfeiture event** (system-attributed,
  audit-trailed). This is the **first scheduled job in the system**.
- **Company-side cancellation:** **SUPER ADMIN only**, reason required,
  **full refund always**.
- **Early return:** charged **in full as booked**; any discount is
  **staff-entered in the settlement's discount/penalty section with a
  note**, at **final settlement only** (never an ad-hoc reduction).
- **Sale claims/returns:** via **Line Official → admin handles**; no
  self-service.

### §c — ERP foundation
Owner framing: "ครบทุกอย่าง ทำตามมาตรฐาน ERP, ไม่รีบแต่เอาจบ, แยก branch."
Three bound layers, each requiring the one before it:
1. **Money events** (exists: `rental_held_balance_events`, order
   payment).
2. **Documents** (mig-068 engine): **every money movement MUST produce
   a numbered document**. Corrections are **void + reissue chains,
   never edits**.
3. **Tax lines per document.**
Central **`tax_treatment` config** — `(line type × customer type) →
vat_rate / wht_rate / wht_type` — **no hardcoded rates anywhere**.
- **VAT map (locked):** deposits = **no VAT** (liability);
  sale / rental / service revenue = **7%**; forfeiture = **0%**.
- **WHT (juristic payers only):** rental **5%**, service **3%** —
  record the tax-withheld credit **and** track receipt of the
  **50-bis (ใบ 50 ทวิ)** certificate.
Three reconciliation loops **must be closeable**: (1) document sequence,
(2) money-vs-documents, (3) deposit liability (collections − releases).
All documents are **branch-aware AND customer-type-aware from day one**.
The back-office accounting UI is **deferred**; the **DB + API must
support it now**.

### §d — customer_tax_profiles (three creation channels)
1. **User self-entry.**
2. **Staff-created for walk-ins with no account** — keyed on
   **phone + tax ID**, `user_id` NULL.
3. **Staff-created for an existing user without customer login** —
   staff locate via **phone search / User-ID QR**.
Rules: **same tax ID → same profile** (dedupe); a walk-in who later
registers is **mergeable by tax ID / phone**; documents always
**SNAPSHOT** tax-profile data **at issuance** (never live reference);
`created_by` is recorded on staff-created profiles.

### §e — Implementation ordering (owner delegated)
`T1a staff-KYC + approve queue → T1b customer online KYC → T2
pickup→return→settlement (ledger release side) → T3 + T4 designed
together (unified void/cancel + document/ERP foundation) → T5–T7` per
`docs/MASTER-GAP-MAP.md`.
- **Flow-based delivery:** the unit of work is "this flow walks
  end-to-end"; **acceptance = a re-walk shows the audit mark IDs
  resolved**.
- **Reusable-by-evidence rule:** anything proven duplicated across
  **≥ 2 flows AND money/document-related** is built **centrally,
  immediately**.

### §a addendum — 2026-07-14 (T1a Phase 1 ratification)

1. **Pending-queue exception to lookup-first.** A list API for the Super Admin
   approve queue is APPROVED as a narrow exception to the lookup-first rule
   (app/pages/admin/kyc/index.vue:5-6). It is restricted to status='pending'
   ONLY, super_admin ONLY, and returns MINIMAL fields (name, customer_type,
   branch, submitted_at). It MUST NOT return identity_hash, identity_last4, or
   phone. Lookup-first remains the rule for every other KYC read.

2. **Auth inversion is MANDATORY for KYC endpoints.** Every endpoint touching
   KYC data (queue list, verify caller, revoke caller, any document access) MUST
   use requirePlatformAdmin + an EXPLICIT super_admin check, so denials are
   audit-logged via logKycDocumentAccess BEFORE throwing — the pattern locked in
   server/api/admin/kyc/documents/[id]/download.get.ts:9-12. requireSuperAdmin
   is FORBIDDEN on these endpoints: it throws before the denial can be logged.
   Each endpoint carries a test pinning this (style:
   tests/server/kyc-document-download-api.spec.ts:553). Staff-level KYC
   endpoints (upload/create) use requirePlatformAdmin as normal.

3. **Customer upload rail-move pulled forward into T1a.** The customer KYC
   upload path (server/api/user/kyc/id-card.post.ts,
   server/api/company/kyc/document.post.ts) writes to the LEGACY kyc-documents
   bucket and never touches kyc_profiles — so nothing it captures can reach
   verification. Moving it onto the kyc_profiles + kyc-profile-documents rails
   is IN SCOPE for T1a (site not live). The legacy bucket is retired as a WRITE
   TARGET in this path but is NOT deleted.
   **Amendment (2026-07-14, owner ruling at T1a Phase 1 close):** the rail-move
   scope is the **id-card path only**. server/api/company/kyc/document.post.ts
   is NOT rail-moved — it writes companies/company_members (B2B company
   onboarding documents), a different domain from rental kyc_profiles.
   Juristic customer self-serve KYC is T1b scope.

4. **One KYC profile per user (§a "once per user") is DB-enforced** via a
   partial unique index on kyc_profiles(user_id) WHERE user_id IS NOT NULL
   (migration 120). Walk-in profiles (user_id NULL) remain unconstrained and
   continue to dedupe on identity_hash. Re-verification updates the existing
   row (verify_kyc_profile blocks only status='verified', migration 112) and
   never requires a second row. Rejected-profile resubmission flips the same
   row back to 'pending' on document upload, recorded via logKycDocumentAccess
   (never a silent state change). Rejection of a PENDING profile is a
   verification decision of the same class as verify/revoke and MUST go through
   a reject_kyc_profile RPC (migration 121, gated separately) — never a direct
   service-role UPDATE.

### §b addendum — 2026-07-15 (T2 Phase 1 ratification, owner)

1. **Settlement is a REAL TABLE** — one row per return settlement: booking ref,
   held total, additional-collection total, penalty lines (amount + note each,
   stored inline — no separate lines table), special discount (staff-entered,
   note REQUIRED per §b early-return rule), net result, customer + staff
   signatures, slip evidence ref, created_by, timestamps. The numbered DOCUMENT
   for a settlement is T4 scope — the table must carry what T4 will need.

2. **Money composition rule (LOCKED):**
   - `settlement_application` = held funds applied to penalties/charges
   - `refund` = held funds returned to the customer
   - `forfeiture` = policy-driven TOTAL seizure (no-show) — never line-item
     deductions
   - NEGATIVE settlements (penalty > held): the shortfall is an ADDITIONAL
     COLLECTION (customer pays in), slip-evidenced like any payment; requires
     a collection-side event type on the held-balance ledger.
   - DB/RPC-enforced invariant per settled booking:
     held + additional collection = settlement_application + refund + forfeiture
     (full release, no residue).

3. **Staff UI must be simple:** the return screen COMPUTES everything and shows
   ONE instruction — "REFUND ฿X to customer" / "COLLECT ฿Y from customer" /
   EVEN. Staff enter only damage penalties (amount + note each), optional
   special discount (+ mandatory note), signatures, slip. No manual arithmetic
   anywhere.

4. **One refund-evidence standard:** the existing assertRefundProof chain,
   extended to §b's full requirements (bank account + slip). Slip capture
   reuses the existing upload/capture surface — never a parallel new one.

5. **No-show auto-mark:** pg_cron → SECURITY DEFINER RPC (sibling discipline:
   self-guarded, row-locked, decision-recorded), 00:00 Asia/Bangkok
   day-after-start per §b — the system's first scheduled job. SYSTEM ACTOR
   (ratified 2026-07-15): dedicated auth user system@hopnic.internal created
   per environment via Auth Admin API — platform_role='customer' (schema
   forbids NULL; 'customer' grants zero admin surface), UNCONFIRMED and
   BANNED (never-login proven: password grant returns user_banned), random
   password discarded, id persisted in system_configs.system_actor. The
   no-show RPC must FAIL LOUDLY if the config row is absent — never fall
   back to a human id or NULL. Auto-forfeiture writes BOTH the held-balance forfeiture
   event AND the disposition event via the same chain as manual no-show.

6. **No backfill:** clean-slate go-forward. Local orphaned held-balance
   fixtures are dev data; the remote ledger is empty (2026-07-15 cleanup).

7. **Legacy deposit_refund_* columns are security-deposit-scoped.** As of T2
   they are authoritative ONLY for bookings without a settlement row (pre-T2 /
   POS v1); for settled bookings the settlement row + held-balance ledger are
   the sole money truth, and all reports/exports must read settlement-first
   (accounting-export fixed accordingly in this checkpoint).

8. **Timezone (owner addendum, 2026-07-19):** business timezone is
   Asia/Bangkok, HARD-CODED as the policy zone in the no-show RPC
   (00:00 Bangkok = 17:00 UTC; Thailand has no DST so the offset is
   constant). The "day after rental start" boundary derives explicitly via
   AT TIME ZONE 'Asia/Bangkok' — never server/client local time, never
   UTC-truncated now(). Boundary tests construct timestamps with explicit
   zone arithmetic (dev machines are NOT in Bangkok; currently UTC+4).

## 2026-07-19 — T3+T4-core Phase 1 (rulings ratified at gates/checkpoints during implementation)

Context: Phase 1 of the T3+T4 blueprint (docs/design/2026-07-19-t3-t4-unified-cancel-and-documents.md
@ 18e3cdd) implemented via the 8-walk plan + HTTP-debt walk; migrations 127-132 (LOCAL ONLY).
The following NEW decisions were ratified by CHiP during the phase:

1) Gate-verdict confirmation rule (STANDING; also in docs/OPERATING-MODEL.md §3): conditional gate
   verdicts resolve ONLY on the auditor's confirming reply; ambiguity = closed. Added after a
   self-adjudicated gate (violation logged, permanent track record).
2) Lock conventions (design annex #7): money writers touching rental_bookings lock the BOOKING
   FIRST (125/126/129 order); order-domain writers lock the ORDER FIRST → inventory → payment
   requests; row-keyed writers do unlocked-read → lock-parent → lock-and-revalidate.
3) Replay semantics SPLIT (ratified at walk 6): orchestration-facing cancels (sale cancel, company
   cancel, document void) short-circuit already-terminal targets as alreadyCancelled/alreadyVoided
   with NO decision row; late-cancel forfeit stays STRICT (409 + denied row) — forfeiting an
   already-cancelled booking is an error, never a silent ok.
4) Evidence-before-money tightening (gate 130): a validated refund proof is MANDATORY at
   mark-refunded (proof-optional behavior removed); ledger release amount is RPC-derived, never
   caller-supplied. Same discipline on sale refund settle (transfer ref + slip evidence).
5) Raw money paths CLOSED: admin orders PATCH status='cancelled' → 409 SALE_ORDER_CANCEL_MOVED;
   paymentStatus 'refunded'/'cancelled' subtracted from ORDER_PAYMENT_STATUS_TRANSITIONS + 409
   SALE_ORDER_PAYMENT_STATUS_MOVED. Two live cancel paths may not coexist.
6) Mixed post-payment bookkeeping: session flips to 'cancelled'; FINALIZED allocations are NEVER
   voided (immutable record of money that moved); 'voided' allocations = pre-payment path only.
7) Customer self-cancel tier: −3d → −7d calendar-day Bangkok, policy version
   booking_deposit_refund_calendar_day_v2 (TS-side; the 082 RPC snapshots the caller-computed
   cutoff). Staff late-cancel forfeit legal ONLY inside the <7d window (inverse guard in mig 129).
8) Migration renumbering (§H amended): 128 sale refunds/cancel · 129 rental cancel RPCs ·
   130 mark-refunded ledger release · 131 void/reissue · 132 money-ops decision log. Gates ride
   walks, not numbers.
9) §F money-ops decision log born before its first consumer; allowed rows fail-closed BEFORE the
   side effect, denied rows best-effort; NO-PII invariant (no reason_text column). Late-cancel/
   retry-confirm are staff-level; company cancel, sale cancel, document void are super_admin via
   the T1a inversion (requirePlatformAdmin + explicit check, denial logged before 403).
Impact: T3 closed (local), T4-core delivered; T4-rest + T5 unblocked per the Phase-1/2 boundary.

## 2026-07-22 — Deposit model ratified: BOOKING GUARANTEE (Model B) + pickup-time conversion flow (CHiP-ratified)

Decision:
a) The HOPNIC deposit model is confirmed as **BOOKING GUARANTEE (Model B** per
   docs/research/2026-07-22-no-show-forfeiture-vat-th.md**)**: the booking deposit is a
   guarantee of the booking and is NEVER applied against rental/service charges; the
   security deposit is fully refundable, reduced only by actual damages/penalties at
   settlement. Both amounts are liabilities end to end. Forfeiture on customer breach
   (no-show / late cancel) is contractual damages — non-VAT per the archived research,
   PENDING the accountant memo (launch blocker in docs/BACKLOG.md).
b) NEW pickup-time conversion flow (TARGET STATE — NOT yet implemented): at pickup the
   booking deposit is formally closed and converted in three explicit documents —
   (1) issue a booking-guarantee refund document for the booking deposit;
   (2) collect the security deposit with the booking deposit netted against it
       (cash collected = security deposit − booking deposit);
   (3) issue a security-deposit receipt for the FULL security amount.
   Three documents, no silent re-label; the money remains a liability throughout.
c) Implementation scope: the conversion document types + tax config land in Phase 2;
   POS pickup-flow wiring lands in T5. Until built, the CURRENT hold-both-until-settlement
   behavior remains the operating state, explicitly noted as pre-conversion-model.
Reason: The archived research (ป.73/2541 vs the damages/penalty ruling line) shows VAT
   treatment follows the substance and paperwork of the deposit from day one; Model B with
   an explicit conversion chain keeps forfeitures defensible as non-VAT contractual damages
   and keeps both deposits out of the VAT base until (if ever) they become consideration.
   A silent re-label of booking deposit → security deposit would blur exactly the
   classification the research warns about.
Impact: Phase-2 document/tax-config design and T5 POS pickup flow must implement the b)
   chain; the current settlement held-total model is partially superseded (design impact
   assessed at Phase-2 kickoff — BACKLOG item); customer-facing "มัดจำ" wording must be
   reviewed for ป.73/2541 exposure (accountant blocker); forfeiture VAT posture unchanged
   (non_vat_contractual_penalty) pending professional confirmation.

## 2026-07-22 — MINIMAL LAUNCH ratified: single money event at return, dual invoice types, tax-point guard (CHiP-ratified)

Decision:
a) MINIMAL LAUNCH scope (individuals only): booking is FREE — NO deposits of any kind
   (no booking deposit, no security deposit). KYC per T1a stays as the pickup gate.
   Pickup = handover note only, no money movement. The SINGLE money event of a rental
   is at RETURN (rental charge + any VAT-bearing add-ons, one payment). Cancellation =
   slot release only — no refund machinery involved because nothing was collected.
b) WEB TAX DOCUMENTS (two-stage chain on the T4-core engine):
   - Stage 1 — STATEMENT OF CHARGES (operations document, series STM-): itemizes what
     will be owed; MUST carry the disclaimer "ไม่ใช่ใบกำกับภาษี..." ; MAY display
     estimated VAT; MUST NOT carry any of the 8 forbidden tax-invoice elements per
     research report 3 (docs/research/2026-07-22-launch-tax-answers.md).
   - Stage 2 — on payment confirmation, a TAX INVOICE/RECEIPT is issued for EVERY
     transaction (series TIR-). The engine supports BOTH full_tax_invoice and
     abbreviated_tax_invoice from day one, selected by a config switch whose value is
     PENDING the accountant's §86/6 eligibility ruling (fail-safe default = full).
   - CREDIT NOTES are in scope from launch (§86/10: must cite the original tax-invoice
     number + reason); issued invoices are NEVER edited — 068/131 immutability + void
     = reissue discipline applies unchanged.
c) INVOICE SCOPE boundary: rental charges + VAT-bearing charges the web already knows
   (late-return rental days, standard service charges) are invoice line items. GENUINE
   damages (non-VAT contractual damages) stay OUTSIDE the web system per CHiP —
   handled off-system until a future track brings them in.
d) TAX-POINT GUARD (system invariant): the document engine MUST refuse to issue any
   tax document (TIR-, credit note) while the settlement is awaiting_payment. The tax
   invoice is issued only after payment is confirmed and is dated the PAYMENT date
   (service tax point = receipt of payment, ม.78/1).
e) ADDRESS CAPTURE is conditional on invoice type: full_tax_invoice requires
   name + address intake (ม.86/4); abbreviated_tax_invoice does not force it.
f) SUPERSEDES (parked, NOT deleted): the deposit/forfeiture machinery (booking
   deposit, security deposit, forfeiture pipeline, deposit-refund documents, the
   2026-07-22 Model-B conversion flow) is FEATURE-GATED OFF for launch. Revival is
   gated on TWO conditions: card-hold (authorization hold) capability + the
   ป.73/2541 professional memo (research report 2 — p73-movable-rental-vat-review:
   for movable-property rental, deposits under any name pull into the VAT base on
   receipt, so cash deposits cannot ship on a liability-only assumption).
   Juristic customers + WHT remain parked.
Reason: Report 2 shows the previous liability-only deposit posture is high-risk under
   ป.73/2541 for movable-asset rental; removing deposits entirely removes the exposure
   and collapses the money flow to one clean, taxable event at return. Report 3
   supplies the operational answers (statement vs invoice separation, §86/6 dual-type
   support, payment-date tax point) that make the minimal model auditable from day one.
Impact: New T-LAUNCH track in MASTER-GAP-MAP (feature-gate deposits off, return-time
   charging, STM-/TIR-/credit-note document types, conditional address intake,
   awaiting_payment guard, sales-VAT report export, cancellation = release). Phase 2 /
   T5 re-scoped around it; deposit revival becomes its own future track behind the two
   gates in f). Accountant answers now gate CONFIG VALUES (invoice-type switch,
   §86/6), not track start.

## 2026-07-23 — Invoice dating, dual-invoice-type flow, penalties, unreachable-customer period (CHiP-ratified)

Decision:
a) INVOICE DATING — tax documents are dated the **STAFF ISSUE DATE** (the moment staff triggers
   issuance), NOT the payment date. **SUPERSESSION:** this replaces the dating clause of the
   2026-07-22 minimal-launch entry d ("dated the PAYMENT date ... ม.78/1"). The 2026-07-22 entry is
   left UNEDITED per the immutability-of-record convention — read it together with this note.
   **The awaiting_payment tax-point GUARD REMAINS UNCHANGED AND IN FULL FORCE:** no tax document
   (TIR-, credit note) may be issued while the settlement is awaiting_payment. Payment confirmation
   is still the precondition for issuance; only the DATE printed on the document changes.
   AUDIT TRAIL: the auditor flagged that staff-issue dating diverges from the ม.78/1 service tax
   point (liability arises on receipt of payment), creating a gap between the tax-point date and
   the document date whenever issuance lags payment. CHiP ruled staff-issue dating as the business
   decision, accepting that divergence. Recorded so the accountant sees the reasoning, not just the
   outcome. Practical consequence to watch: if issuance slips across a VAT-period boundary, the
   document date and the tax point fall in different periods — surface this at the accountant
   meeting even though it is not a blocker.
b) DUAL INVOICE TYPE FLOW (confirms and extends 2026-07-22 b): both full_tax_invoice and
   abbreviated_tax_invoice are supported.
   - Customer requests FULL at payment time -> issue the full tax invoice directly. No abbreviated
     is created, nothing to void.
   - Customer requests FULL AFTER an abbreviated was already issued -> **VOID the abbreviated, then
     issue the full**, dated the (new) issue date per a). The abbreviated is NEVER edited or
     upgraded in place: void = reissue discipline, per mig-068 immutable snapshot + mig-131 void/
     replace chain. The replacement carries its own registry number; the voided document and the
     linkage between them remain permanently readable.
   - Both documents remain in the registry; numbers are never reused or reclaimed.
c) FIXED PENALTIES — confirmed OFF-WEB, re-affirming 2026-07-22 c. Genuine damages and fixed
   penalties are handled off-system; the web issues invoices only for rental charges and the
   VAT-bearing charges it already knows (late-return rental days, standard service charges).
d) UNREACHABLE-CUSTOMER waiting period = **90 DAYS**, **SCOPED TO THE PARKED DEPOSIT MACHINERY
   ONLY** (CHiP ruling): it governs the deposit unreachable-close path
   (booking_deposit_forfeiture_refund_unreachable_v1) after the refund row has failed /
   needs_customer_contact is exhausted. Because deposits are feature-gated off at 2026-07-22 f,
   the value is **DORMANT until deposit revival**. Launch-era unreachable cases (a refund or
   credit note owed after a return payment) are **NOT governed by this period** — they are handled
   case-by-case, off this policy. This closes the 2026-07-19 policy item that stood as
   [CHiP RULING PENDING] in docs/BACKLOG.md.
e) ACCOUNTANT AGENDA RE-SCOPED — only **§86/6 eligibility (B1)** remains in confirmation mode
   (it still sets the full-vs-abbreviated config switch and whether address intake is mandatory).
   The tax-point / dating agenda item (N2) is **CLOSED BY CHiP RULING** per a) — it is no longer a
   question for the accountant, though the divergence noted in a) should be disclosed to them.
   docs/BACKLOG.md updated accordingly in the same commit.
Reason: Staff-issue dating matches how issuance actually happens at the counter and avoids
   back-dating documents to a payment moment staff may not be transacting at. The guard is what
   protects the tax position (nothing issued before money is confirmed), so relaxing the DATE
   without relaxing the GUARD keeps the substantive control intact. Void-then-reissue for the
   abbreviated-to-full upgrade is the only path consistent with the immutability rules already
   shipped in 068/131 — an in-place upgrade would silently rewrite an issued tax document.
Impact: T-LAUNCH document engine implements issue-date dating on TIR-/credit-note types while
   keeping the awaiting_payment guard; the abbreviated->full upgrade path needs the void+reissue
   chain wired to the invoice-type switch; BACKLOG N2 closed, B1 remains open; the 90-day period
   becomes a config constant carried with the parked deposit machinery. No change to c) scope or
   to the deposit parking in 2026-07-22 f).

## 2026-07-23 (addendum) — Tax-invoice series prefixes split (CHiP-ratified)

Decision: the two tax-invoice variants use **DISTINCT series prefixes** — full = `TIR`, abbreviated = `TIA`.
SUPERSESSION: this refines the "series TIR-" wording of the 2026-07-22 minimal-launch entry b, which pre-dated the decision to support both variants as separate document types. The 2026-07-22 entry is left UNEDITED per the immutability-of-record convention; read it together with this addendum.
Reason: the numbering engine keys sequences on (document_type, sequence_key, period) (mig-068:143). Two document types sharing the prefix `TIR` would produce two independent number runs that COLLIDE in the same period — e.g. two different documents both numbered TIR-202607-0001. Distinct prefixes make each series unambiguous in the tax register.
Impact: T-LAUNCH document contract (docs/design/2026-07-23-t-launch-phase0.md §8.2) fixes full=`TIR`, abbreviated=`TIA`, statement=`STM`, credit note=`CDN`. Prefix constants must be centralized — the numbering engine silently overwrites a sequence's prefix on conflict (068:199-201), so inconsistent callers would corrupt a series without erroring.

## 2026-07-24 — Charge taxonomy + staff-charge channel + discount policy (CHiP-ratified; design input for T-LAUNCH)

Decision:
a) CHARGE_TYPE is a TAX-SUBSTANCE classification, SEPARATE from allocation_type (the ledger bucket). Vocabulary and treatment (WHT rates DORMANT until juristic revival):
   - rental_charge — VAT 7% / future WHT 5%
   - rental_extension — per-day late return; substance = continued rental benefit; VAT 7% / future WHT 5%. This is the LAUNCH form of late return; fixed-amount late penalties are NOT offered at launch.
   - taxable_service_charge — VAT 7% / future WHT 3%
   - actual_damage, contractual_penalty — DISABLED_FOR_LAUNCH, REQUIRES_ACCOUNTANT_MEMO, off-web per decisions.md 2026-07-22 c
   - pending_review — BLOCKS payment confirmation AND tax-document issuance (fail-closed classification)
   The 'late_fee'/'penalty' allocation_type values are RETAINED in the CHECK (permanence) but DEPRECATED-FOR-LAUNCH.
   Repair is two legs never conflated: the outbound shop payment vs. the customer charging.
b) STAFF CHARGE CHANNEL (launch): under launch, charges do NOT travel penalty_lines (that stays empty; the settlement row is naturally 0/0/0). Staff enter free-form typed lines { charge_type, amount, note } — MANDATORY charge_type + note, NO service catalogue yet (structure accommodates a future catalogue without migration). CAP 5,000 THB per line, refuse-outright, NO override (split larger charges into audit-visible lines).
c) DISCOUNT POLICY (two-tier, rental-base only): the discountable base = rental_charge + rental_extension ONLY; service lines are NEVER discounted. staff <= 20% of the rental base (mandatory note); super_admin <= 50% (mandatory note); > 50% refused by the system with no override. The tier authority is the LOOKED-UP platform_role (never a caller claim). Every granted discount is logged to money_ops_decision_logs (§F success-path only; the super_admin tier records its authority use).
d) LATE-RETURN CUTOFF: 00:00 Asia/Bangkok exactly, no grace (confirms 134's implementation; no change).
Reason: a single dimension cannot carry both the ledger bucket and the tax substance without the regime-dependent ambiguity that blocked the launch settle (§8.12). Separating charge_type lets launch charges be truthfully classified, discounted within policy, and gated (pending_review) without disturbing the deposit-era settlement algebra.
Impact: migrations 142 (charge_type column + vocabulary) + 143 (staff-charge channel, discount tiers, pending_review gates) — both applied. Accountant agenda: confirm rental_extension as rental income (VAT + future WHT); obtain the actual_damage / contractual_penalty non-VAT memo (docs/BACKLOG.md).

## 2026-07-25 — Launch-era cancellation ruled (K-1; CHiP-ratified)

Decision:
a) SHAPE — a NEW LEAN RPC (`f_cancel_rental_booking_launch`), not an un-gate of the
   deposit-era cancels. Slot release + status + §F log, ZERO money branches. The
   135-gated legacy RPCs stay gated; deposit revival remains a config flip.
b) WHO — BOTH customer self-serve and staff. No approval tier: nothing is
   financially at stake at launch, and the decision log records who acted.
c) CUT-OFF — NONE. A confirmed booking may be cancelled at any time before pickup
   and the slot is released immediately.
d) AUTO-NO-SHOW RETURNS in launch form — bookings past their pickup date auto-cancel
   via a NEW pg_cron job that only releases slots. This is NOT the 137-removed job,
   which forfeited deposits and stays gated. Cut-off 00:00 Asia/Bangkok the day after
   the pickup date (job runs 00:05 ICT = 17:05 UTC; Thailand is a constant UTC+7, no DST).
e) AUDIT — auto rows always carry the `auto_no_show_cancel` operation and manual rows
   `launch_booking_cancel`; a NULL actor is NEVER the discriminator (N-1..N-3).
Reason: launch bookings are free, so cancellation is an inventory event, not a money
   event. A single DB-level writer is the only shape where the three surfaces
   (customer, staff, POS) cannot drift apart — the POS path had been a raw status flip
   with no reason, timestamp or audit row.
Impact: migration 145 + the K-1 application layer; the Case-2 B7 raw-flip debt is
   retired; launch produces no `no_show` rows at all (see the BACKLOG no-show item).

## 2026-07-25 — Accountant gates B1 + B2 CLOSED: dual invoice types live, no branch code in the document number (CHiP-ratified)

Decision:
a) **B1 CLOSED — ABBREVIATED INVOICES ARE PERMITTED.** HOPNIC may issue
   `abbreviated_tax_invoice` for tool-rental service; the dual-type flow ratified
   2026-07-23 b operates in BOTH modes (TIA- abbreviated, TIR- full). This closes the
   §86/6 eligibility question that had stood as the last true accountant confirmation
   gate since 2026-07-22.
   TWO CONDITIONS ATTACH to the permission:
   1. the `charge_type` taxonomy must classify every line correctly — already shipped
      as migrations 142 (schema) + 143 (RPCs), so this condition is SATISFIED at
      ruling time, not outstanding;
   2. the payment document is **ONE COMBINED DOCUMENT** — tax invoice and receipt are
      not separate issuances.
   DOCUMENT HEADERS — EXACT THAI, WORD ORDER FIXED (ใบกำกับภาษี leads in both):
   - TIA- (abbreviated) = "ใบกำกับภาษีอย่างย่อ/ใบเสร็จรับเงิน"
   - TIR- (full)        = "ใบกำกับภาษี/ใบเสร็จรับเงิน"
   The order is part of the ruling, not a formatting preference: the tax-invoice
   nature leads, the receipt function follows.
b) **B2 CLOSED — THE PRINTED DOCUMENT NUMBER DOES NOT EMBED A BRANCH CODE.**
   Migration 136's per-branch sequences stay exactly as applied and
   `f_next_document_number` needs NO change; the number format stays
   `PREFIX-YYYYMM-NNNN` (e.g. TIR-202607-0001). The branch identity is carried by the
   SELLER ADDRESS BLOCK on the template instead:
       บริษัท ฮอปนิค จำกัด (สำนักงานใหญ่ 00000)
       888/8 ม.1 ต.พนมสารคาม อ.พนมสารคาม จ.ฉะเชิงเทรา 24120
       เลขประจำตัวผู้เสียภาษี 0105564155415
   VAT registration is at the HEAD OFFICE.
   This closes the item that "cannot be changed after the first tax document issues";
   because no tax document has issued yet, the closure lands with zero migration cost.
c) **EFFECT ON THE INVOICE-TYPE CONFIG SWITCH.** The switch is no longer PENDING and
   its fail-safe posture is released. It was specified 2026-07-22 b as a config whose
   value awaited the §86/6 ruling, defaulting to "full every time" while unknown.
   B1 supplies the answer: BOTH types are permitted, so the switch stops being a
   global on/off and becomes a PER-TRANSACTION selection driven by the customer, per
   the 2026-07-23 b flow — abbreviated for the ordinary transaction, full when the
   customer asks, and void-then-reissue when they ask after an abbreviated was already
   issued. Address intake follows the type per 2026-07-22 e and is now OPERATIVE
   rather than pending: full requires name + address (ม.86/4), abbreviated does not
   force it. Nothing here relaxes the awaiting_payment tax-point guard or the
   staff-issue-date dating (2026-07-23 a) — both stand unchanged.
d) **TEMPLATE PRINCIPLES for the document layer** (CHiP, 2026-07-25) — design
   requirements recorded now so the build starts from them rather than discovering them:
   1. **SINGLE ISSUANCE + SINGLE RENDER PATH.** Issuance goes through the mig-068
      engine ONLY (re-affirms design doc §0), and rendering goes through ONE shared
      template engine. No surface composes its own document layout.
   2. **UNIFORM THEME/FORMAT across ALL document types**, per accounting-document
      practice: identical layout, seller block, number/date/issuer block, line table
      and VAT block. Types differ ONLY in (i) the document header — the exact Thai in
      item a) — and (ii) the fields that type legally requires (full requires buyer
      name + address; abbreviated does not force it).
   3. **VOID RENDERING.** A voided document renders with a red rubber-stamp-style
      "ยกเลิก" overlay, slightly rotated and stamp-like, with the ORIGINAL CONTENT
      STILL LEGIBLE beneath it for the audit trail. A voided document is never deleted
      and never hidden — this is the visual half of the void=reissue chain, where the
      replacement cites `original_document_id`.
   Detailed template decisions — paper size, bilingual vs Thai-only, stamp position and
   the like — are DEFERRED to the design-delta pass that precedes document-layer
   implementation.
Reason: the §86/6 eligibility answer was the only question whose outcome could have
   forced a different document contract; with abbreviated permitted, the shipped
   design (dual types, distinct prefixes, void=reissue upgrade) is confirmed correct
   as built rather than needing rework. Keeping the branch code out of the number and
   in the address block preserves the mig-068 numbering contract intact — the
   alternative would have required re-composing document numbers, which is exactly the
   change that becomes impossible after the first issuance.
Impact: NO migration is required by either ruling. B1/B2 move to CLOSED in
   docs/BACKLOG.md, leaving THREE accountant items before real documents issue
   (rental_extension income classification; the actual_damage / contractual_penalty
   non-VAT memo; the two disclosure items). The document layer — STM/TIR/TIA/CDN
   issuance wrappers, the abbreviated→full upgrade path, conditional address intake,
   sales-VAT export — is now UNBLOCKED at the accountant boundary but remains
   UNSCHEDULED: it queues AFTER post-merge batch 1 (types regen; the no-show
   0-amount forfeiture-row fix-or-gate). Header strings and the seller address block
   become template content for that work; the exact Thai above is the source of truth.
