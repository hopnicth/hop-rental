# PROGRESS
Last updated: 2026-06-18 (Order history expandable items + My Rentals section split — branch cart-checkout-to-payment-detail, code NOT pushed)

## 2026-06-18 — Order History UI: expandable item details + My Payments nav ✅

- `app/pages/user/orders/index.vue` — expandable item details per order; lazy-load from `/api/user/orders/[id]` on first expand; cache prevents re-fetch; per-order loading/error states; NuxtImg thumbnail (fallback icon); financial summary (subtotal/discount/shipping/grandTotal) from existing order fields.
- `app/components/header/UserDropdown.vue` — added "My Payments" (`bx:receipt`) item → `/user/payments` between Orders and Wishlist.
- i18n: `ordersPage.items.*` (11 keys) in all 4 locales; `user.payments` in all 4 locales (th real, cn/jp `[NEEDS_TRANSLATION]`).
- Tests: `tests/server/customer-order-history-ui.spec.ts` (11 source-inspection tests); `tests/server/user-qr-ui.spec.ts` +3 My Payments tests. tsc=0; specs green.

## 2026-06-18 — My Rentals: current / historical section split ✅

- `app/pages/user/rentals/index.vue` — split single list into two sections:
  - **Current rentals**: `ACTIVE_STATUSES` (`draft`/`confirmed`/`picked_up`) + pickup date is today or future; sorted by user-controlled pickup sort toggle.
  - **Historical rentals**: `TERMINAL_STATUSES` (`cancelled`/`returned`/`no_show`) OR past pickup date; sorted most-recent first (`compareBookingsByPickupDateDesc`).
  - "Pickup date passed" badge on active-status items with past pickup date (`isPickupPastWithActiveStatus`).
  - Summary cards untouched (come from `confirmedBookings` in `useBooking`).
  - `refundProofByBookingId` watcher updated to `allDisplayedBookings`.
  - Sort toggle shown only when `currentRentals.length > 0`.
- i18n: `rentalsPage.currentSection`, `rentalsPage.historicalSection`, `rentalsPage.pickupDatePassed` in all 4 locales (th real, cn/jp `[NEEDS_TRANSLATION]`).
- Tests: `tests/server/rental-section-split-ui.spec.ts` (31 tests covering constants, helpers, computeds, watcher, template patterns, locale keys, regression guard). tsc=0; 61 targeted tests pass.

## 2026-06-18 — Browser smoke test: manual payment request flow ✅

All 5 smokes run against localhost:3000 + remote Supabase (yzjczvzwmbbeyoodrjwm).

**Smoke 1 (sale only):** `dd680ad2` | ORD-20260617213307-1CB8BA | ฿140 | ✅ pending_review; order NOT auto-paid  
**Smoke 2 (booking only):** `50c68582` | booking `b4a89845` | ฿200 deposit | ✅ pending_review; booking stays Draft  
**Smoke 3 (mixed):** `1f1ff054` | ORD-20260617214425-73C48B + booking `b4a89845` | ฿480 combined | ✅ pending_review; both NOT auto-confirmed  
**Smoke 4 (/user/payments list):** All 3 requests visible; filter tabs present ✅  
**Smoke 5 (related pages):**
- `/user/rentals/[id]` → shows "Related payment request" card with status + "View details" link ✅
- `/admin/orders/[id]` → shows `pending_review` card + manual status actions unchanged ✅
- `/admin/rental-bookings/[id]` → shows `pending_review`+`mixed` card; "Mark Deposit Received" action unchanged ✅
- `/user/orders/[id]` → **BUG: renders orders LIST instead of detail page**; `orders.vue` lacks `<NuxtPage />` so `orders/[orderId].vue` (which contains `PaymentRequestRelatedCard`) never renders

**All safety invariants held:** no Omise, no auto-pay, no auto-confirm, no inventory deduction, no held_balance_events on slip upload.

**Bug to fix:** Add `<NuxtPage />` to `orders.vue` OR rename it to `orders/index.vue` so the nested `[orderId].vue` detail route renders.

## 2026-06-18 — Migration 115 applied to remote (approved) ✅

User explicitly confirmed the linked project (`hopnicth's Project`, ref yzjczvzwmbbeyoodrjwm —
single live/production-like project) as the smoke target and authorized applying ONLY migration 115.
`supabase db push --linked` applied only 115. Remote verified: migration `115|115|115`; 3 tables
reachable via service-role (HTTP 200); anon → 401; bucket `manual-payment-slips` private; service-role
insert + child item + cascade-delete proof clean (0 residue). tsc=0, payment specs 65/65, grep guards clean.
Code NOT pushed; no other migration applied. Interactive browser click-through pending (user-run, no
browser-driving capability here).

## 2026-06-18 — Central manual payment request model ✅

Branch `cart-checkout-to-payment-detail` (base origin/staging `437cf61`). Replaced the
per-target / query-param manual payment pages with ONE central `manual_payment_requests`
model. Cart → create/reuse sale order + draft bookings → create ONE payment request (+
allocation items) → `/user/payments/[id]` (one amount, one slip, evidence-only). Admin
reviews evidence; sale/booking confirmation stays on the EXISTING admin actions. Supports
sale_only / booking_only / mixed.

- **Migration 115** (`e589a1d`): tables `manual_payment_requests`, `manual_payment_request_items`,
  `manual_payment_request_slips`; private bucket `manual-payment-slips`; service_role-only RLS;
  indexes; updated_at trigger; SQL assertions. Types regen `18a2a1f` (transplanted 3 blocks). Local only.
- **Server APIs** (`1da59bb`): customer create/list/detail/slip-upload/cancel/by-target; admin
  list/detail/signed-url-download/review/reject. Utils `manual-payment-request.ts` +
  `manual-payment-request-slip-evidence.ts`. server-utils-index updated.
- **Customer UI** (`0891e7d`): cart → `/user/payments/[id]`; `/user/payments` list + detail pages;
  order/rental detail now link to the related request (history kept, no primary upload here).
  i18n `paymentRequests.*` en/th real, cn/jp placeholders.
- **Admin UI** (`3c8c5bc`): `/admin/manual-payment-requests` list + detail (review/reject, signed-url
  slip view); `AdminPaymentRequestCard` on admin order + rental booking pages.
- **Tests** (`cb4b07f`): 4 new specs (45 tests) + updated 5 flow specs. tsc=0; targeted suites green.

**Safety:** customer upload = evidence only (request → pending_review); never marks order paid,
confirms booking, deducts inventory, writes held balance, or touches Omise/KYC. Admin review/reject
changes only payment-request/slip status. NOT pushed.

**Open/blockers:** real bank account config (placeholder); cn/jp translations; staging browser smoke
(CLI env); future amount-paid/paid-at fields (deferred); migration 115 + types not pushed remote.
Pre-existing unrelated test failures (8 files: POS/admin date+logic, cart-phase-31b-ui, mixed-checkout-ui)
fail at baseline `cbc69e4` — out of scope.

## 2026-06-17 — Cart manual bank-transfer + slip flow (rentals + sale orders) ✅

Branch `cart-manual-transfer-all-items` (base origin/staging `cc7c772`). Online cart payment (Omise card/PromptPay/unified mixed checkout) hidden behind a launch flag `ONLINE_CART_PAYMENT_ENABLED=false`. Both rental bookings and B2C sale orders now use manual bank transfer + slip upload.

- **Migration 114** (`ae8484c`): private bucket `sale-order-payment-slips` (public=false, 10MB, jpeg/png/pdf) + table `sale_order_payment_slips` (FK→orders, RLS service_role-only). SEPARATE from rental slips. + `server/utils/sale-order-payment-slip-evidence.ts`.
- **Customer sale** (`3bcdc92`): `GET /api/user/orders/[id]` (ownership), `POST /api/user/orders/[id]/payment-slip` (awaiting_payment→pending_review, never paid), `app/pages/user/orders/[orderId].vue` (NEW), i18n `ordersPage.paymentSlip.*`.
- **Admin sale** (`0524210`): `sale-order-manual-payment.ts` (mark paid+confirmed, idempotent `f_apply_order_inventory`, cart clear), admin slip list + signed-url routes, `record-payment` route, `AdminOrderPaymentSlips.vue` on admin order detail.
- **Cart** (`53476a5`): online selector + online CTAs hidden; rental CTA → `/user/rentals/[bookingId]`; sale CTA creates a `bank_transfer` order (awaiting_payment) → `/user/orders/[orderId]`; manual guidance for both sections; cart i18n `cart.manual*`.
- **Docs** (this commit): server-utils-index rows for both new utils; progress/handoff/decisions.

**Accounting safety:** rental deposit unchanged (held liability via rental_held_balance_events + confirmRentalBooking). Sale payment uses the existing order paid path (no VAT/revenue exists; none invented); sale payment never touches rental ledgers. Inventory deducted ONLY on admin confirm via the idempotent RPC.

**Deferred / follow-up:** i18n th/cn/jp translations pending (`ordersPage.paymentSlip.*`, `cart.manual*`); browser/staging smoke not run (CLI env); the rental booking-deposit agreement checkbox + mixed-checkout amount preview remain visible but have no actionable online CTA (gated). Not pushed.

## 2026-06-17 — Manual bank-transfer booking deposit flow ✅ (Steps 1–7)

KYC remains PAUSED (unchanged). Implemented a lightweight manual bank-transfer booking-deposit flow — customer uploads slip EVIDENCE (does not confirm), admin clicks "Mark Deposit Received" to confirm.

- **Step 1 — DB/storage** (`204d7a6`): migration `113_rental_deposit_slip_storage.sql` — private bucket `rental-deposit-slips` (public=false, 10MB, jpeg/png/pdf), table `rental_booking_deposit_slips` (RLS service_role-only, status pending_review→reviewed/rejected). No held-balance change needed (source_type/payment_method are free-text; `booking_deposit_collection` already exists).
- **Step 2 — types + util** (`144f3e3`): regenerated types (transplanted only the new table block to keep remote-`--linked` style); `server/utils/rental-deposit-slip-evidence.ts` (magic-byte MIME, 10MB cap, opaque key, private upload, signed-URL helper, safe mapper).
- **Step 3 — customer upload API** (`15e12ca`): `POST /api/user/rental-bookings/[id]/deposit-slip` — ownership + draft-only; never confirms / mutates money.
- **Step 4 — admin visibility + signed access** (`857f10f`): `deposit-slips.get.ts`, `deposit-slips/[slipId]/signed-url.get.ts`, `AdminBookingDepositSlips.vue`. Private signed-URL view only.
- **Step 5 — admin manual confirmation** (`8acc5d2`): `server/utils/rental-manual-deposit-confirmation.ts` + `POST /api/admin/rental-bookings/[id]/record-deposit` + `AdminBookingDepositConfirm.vue`. Records held-balance liability (booking_deposit_collection, manual source, idempotent) then confirms via `confirmRentalBooking` (never sets status directly; never revenue/VAT/Omise).
- **Step 6 — customer UI + i18n** (`a1ba94e`): upload card in `user/rentals/[bookingId].vue`; 9 `rentalsPage.depositSlip.*` keys (en real; th/cn/jp `[NEEDS_TRANSLATION]`).
- **Step 7 — docs** (this commit): server-utils-index rows for both new utils; progress/handoff/decisions.

**Deferred (out of scope this phase):** OCR, bank-API reconciliation, duplicate-slip hash detection, full approve/reject workflow, refund flow, customer viewing their own uploaded slip back. i18n th/cn/jp translations PENDING (see handoff).

## 2026-06-16 — KYC paused; status corrected; Slice ② review gate closed 🔒

- **Status correction:** earlier notes said "Slice ② planned/cleared but not started" — OUTDATED. Slice ② is **DONE, committed, passing**. Latest commit `d29ca7d feat(kyc): add verify, revoke, and verification-history endpoints`.
- **Actual-source review of committed Slice ② = PASS** (auth boundary). All six locked constraints confirmed against real source: super_admin guards on verify/revoke/history; `p_decided_by_role` = true authenticated role (not hardcoded); real `userId` into RPC; history minimized + RLS super_admin-only; RPCs are the single writer authority for state + `valid_until`. 72 tests passing. **Bypassed review gate is now CLOSED.** (Full evidence in handoff.md 2026-06-16.)
- **KYC is paused.** Out of scope until resume: reject/renewal/purge/delete lifecycle, POS V3, staff_on_site, user-account linking, preview/open-in-new-tab.

## Next 📋 — Bank Transfer Slice ① (manual transfer + proof upload)

- **Scope of Slice ① = data/state model + authoritative transition ONLY.** No upload mechanics, no admin review UI, no notifications yet.
- Payment status machine: `awaiting_transfer → proof_submitted → under_review → approved | rejected`.
- One server-side authoritative writer for approve/reject (mirror KYC RPC discipline — client may only reach `proof_submitted`).
- Approval binds to expected amount + specific order/booking; idempotent / replay-safe.
- Reuse `payment_attempts` rather than forking a new payment record where possible.
- Reuse KYC *patterns* (private bucket + server-proxy, immutable decision log, true-identity-into-writer, access logging) but a *separate* domain model from `kyc_documents`.

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

## 2026-06-21 — Partner Taxonomy Architecture Audits (Phase A + Phase B-0.2) ✅

Read-only audits only. No files changed. No migrations. No commits.

- Phase A: Mapped current home page section order, partner API, 20 existing category keys, i18n structure, reusable components.
- Phase B-0.2: Deep audit of `main_categories` shared-table design, all API/utility category code paths, admin UI category forms, existing search_keywords pattern, product/asset tsvector search precedent.
- **4 locked implementation constraints recorded** in decisions.md (B1-1 through B1-4): upsert seed, RLS function grants, fail-closed writes, transactional test rows.
- **Phase B-1 full implementation spec recorded** in HANDOFF.md 2026-06-21 entry — ready to implement.

**5 open product decisions required from CHiP before B-1 can be authored** (see HANDOFF.md 2026-06-21 — Open product decisions).

## In Progress 🔄
- `HomeCategoryShortcutRail.vue` — uncommitted changes (home category shortcuts, pre-existing)
- `app/pages/index.vue` — uncommitted changes (homepage, pre-existing)

## Blocked 🚫
- 20 pre-existing POS V2/V3 test failures (unrelated to KYC work)
  - `pos-v2-pickup-completion.spec.ts`, `admin-pos-v3-*` specs

## Next 📋
- **IMMEDIATE (Partner Taxonomy): Answer 5 open product decisions in HANDOFF.md 2026-06-21, then author Phase B-1 migration** — `partner_categories` + `partner_category_assignments` + 8 seed rows + indexes + RLS (see HANDOFF.md for full spec and 4 locked constraints)
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

---

## Session 2026-06-05 — Phase 2 proxy download: migration 110 + endpoint implemented

### Done ✅
- **Migration 110 committed + pushed + applied to remote/staging** — `4090d78 fix(kyc): allow download action in document access log`
  - Local runbook green (spec §4): baseline reset re-verified clean through 109, then 110-chain reset clean; local behavioral checks passed (`action='download'` insert OK, `'bogus'` rejected by check, UPDATE/DELETE/TRUNCATE still blocked by append-only triggers on an actually-affected row)
  - Remote gate: dry-run showed ONLY 110 pending → applied; metadata-only verification (no probe rows, Decision A/C): remote `kyc_document_access_log_action_chk` now `('upload','download_signed_url','delete','download')`; `result_chk` unchanged
  - **Sequencing invariant honored: remote constraint widened BEFORE any endpoint code deploy** (a deploy-first ordering would 500 every download on the fail-closed allowed log)
- **Phase 2 endpoint implemented and committed locally — `4e3830f feat(kyc): add server-proxy document download endpoint`** (8 files, +1278/−5; Opus security-core source review PASSED after one required fix):
  - `server/api/admin/kyc/documents/[id]/download.get.ts` — pure proxy per `docs/kyc-phase-2-download-spec.md` §2.1 strict order: guard → `asUuidOrNull` classify → uniform no-oracle 403 for non-super_admin (kyc_documents NEVER queried, storage never touched, best-effort denial log, malformed-id purity per Decision G) → 400/404 super_admin-only → fail-closed path validator → MIME allowlist → **fail-closed allowed log BEFORE storage fetch** → `blob.stream()` with `no-store`/`nosniff`/`attachment; filename="kyc-<id>.<ext>"`, Content-Length omitted (Decision D)
  - **Opus-required fix applied: `read_failed` path** — DB read error now returns opaque `KYC_DOCUMENT_READ_FAILED` (raw DB/Supabase error text NEVER reaches the client; real error to server logs only) + best-effort audit row `action='download'`, `result='denied'`, `reason='read_failed'` (valid document_id, no storage path); no allowed row and no storage access on that path; recorded in spec §3.4 (committed in `4e3830f`)
  - `server/utils/kyc-documents.ts` — `'download'` action; `isSafeKycDocumentStoragePath` (extension alternation derived from `KYC_DOCUMENT_MIME_EXTENSIONS`, regex-escaped — single source of truth with the key builder); `kycDocumentExtensionForMime`; `asUuidOrNull`
  - `server/utils/kyc-document-view.ts` — `KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT` (server-internal, never serialized)
  - Tests: `kyc-document-download-api.spec.ts` (25), `kyc-document-download-h3-integration.spec.ts` (2, real-h3 wire proof incl. no-Content-Length + byte round-trip), `kyc-document-upload-utils.spec.ts` +131 lines (validator round-trip via the REAL builder, asUuidOrNull table, escape-literal proof)
  - `docs/index/server-utils-index.md` both rows updated same-commit
- **Validation at commit:** `npx tsc --noEmit` clean; targeted KYC specs 143/143; full `npx vitest run` 2173 passed / 20 failed — the 20 are the documented pre-existing POS baseline (same 6 files), **zero new failures, zero KYC failures**

### Next 📋
- **IMMEDIATE: staging smoke test after deploy** — one real-document download as super_admin against the deployed endpoint: 200 + byte integrity + header set (`no-store`, `attachment`, `nosniff`, allowlisted Content-Type, no Content-Length, no path/bucket leakage) + read-back of the genuine `download/allowed` access-log row (read-only — no probe inserts, no mutation)
- Admin UI for download (separate phase; none shipped here)
- Purge primitive still DEFERRED pending legal retention scope (Decision B)
- Fluid Compute CI guard (`resourceConfig.fluid === true`) still pending (Decision D impact 2)
- Production enablement still blocked by Decision C's five gates

### Notes
- This session's commits: `4090d78` (migration, pushed) → `4e3830f` (endpoint, local until the docs commit lands) → docs commit (this entry)
- No UI, no locale keys, no purge, no `database.types.ts` change anywhere in the batch

### Post-push update (same day): smoke test + cleanup ✅
- Pushed `4090d78..6249cf8`; deployment for `6249cf8` verified READY; **staging smoke test PASSED** on `https://www.hopnic.co.th`: super_admin download → 200, 4096/4096 bytes SHA-256 exact, headers `no-store`/`attachment` (opaque filename)/`nosniff`/`image/jpeg`, NO Content-Length, zero path/bucket/URL leakage; genuine `download`/`allowed` access-log row verified read-only (correct document/actor/bucket/opaque path)
- **Synthetic fixture removed** (post-smoke cleanup, exact ids only): storage object `kyc/2552f565-….jpg` deleted, `kyc_documents` row `bb92221e-…` deleted, `kyc_profiles` row `7a651dfb-…` (literal `smoke-test-…` identity_hash, zero references) deleted; read-backs confirm gone; both KYC tables back to 0 rows — nothing else affected
- **Access-log row PRESERVED** — it now outlives its deleted document/profile, live-confirming the migration-109 audit-survival design
- **Future purge lesson captured as decisions.md Decision H**: fail-closed `action='delete'` audit row BEFORE removal; log failure aborts the purge; no document removed without a committed delete row; manual no-audit-row cleanup acceptable only for this one-off synthetic fixture

---

## Session 2026-06-06 — Fluid Compute guard implemented (manual production-enablement gate; Decision I)

### Done ✅
- **`scripts/check-vercel-fluid.mjs` implemented** (Decision D impact 2 guard, enforcement model amended by Decision I)
  - Pure evaluator (`evaluateFluidGuard`) + thin CLI; Vercel API ONLY (`GET /v9/projects/{VERCEL_PROJECT_ID}[?teamId=…]`) — "build-output evidence" alternative removed (verified: Fluid is project-level, absent from `.vc-config.json`)
  - Three-state fail-loud verdicts: PASS = strict boolean `resourceConfig.fluid === true` + project-id match (exit 0); FAIL = explicit `false` (exit 1); UNKNOWN = auth/API error, id mismatch, missing/non-boolean flag (string `"true"` rejected), shape change (exit 2; never a pass)
  - All non-PASS output carries the production-stop + re-spike directive (Decision D); token from `process.env` only, never printed (interpolated exactly once — the Authorization header; pinned by source-inspection test)
  - Offline dry-run mode `--fixture <file.json>`; all three exit codes demonstrated locally
- `tests/server/vercel-fluid-guard.spec.ts` — 29 tests, fixture-based only (no live API calls): PASS/FAIL/UNKNOWN matrix (17 unknown cases incl. string `"true"`, wrong project id, 401/403/404/500, malformed bodies), exit-code mapping, token-hygiene + API-only source inspection
- `package.json` — added `check:vercel-fluid` script
- Docs: Decision I appended (decisions.md); spec §8 rewritten (manual gate, API-only, verdict table, PENDING live-run status, future-CI condition, enablement-checklist note)
- Validation: `npx tsc --noEmit` clean · new spec 29/29 · full `npx vitest run` 2202 pass / 20 fail — the 20 verified pre-existing at clean HEAD in a temp worktree (same 6 POS-baseline files; zero new failures)

### Next 📋
- **Live one-time Vercel API run of `npm run check:vercel-fluid`** — owner deferred 2026-06-06; needs ephemeral token + `VERCEL_PROJECT_ID` (+ `VERCEL_TEAM_ID` if team-owned; team-vs-personal still undetermined); on PASS, record date + verdict in spec §8 and revoke the token
- When Decision C production work begins: create `docs/kyc-production-enablement-checklist.md` FIRST, listing this check + the five gates
- Optional future: GitHub Actions scheduled monitor — only if owner accepts standing non-read-only Vercel token risk
- (carried) Admin download UI · purge primitive (blocked on retention) · verify endpoint · earlier KYC TASK backlog

### Blocked 🚫
- (unchanged) Production enablement blocked by Decision C's five gates + the pending live Fluid check; purge deferred pending legal retention scope

### Notes
- NOT done by instruction: no GitHub Actions workflow, no standing CI secret, no endpoint changes, no migration, no `database.types.ts`, no UI; nothing staged/committed/pushed; unrelated dirty files untouched
- Team-vs-personal Vercel ownership is unresolvable from the repo (no `.vercel/`, no `VERCEL_*` env vars) — determine from the dashboard URL before the live run

---

## Session 2026-06-06 (later) — KYC production enablement checklist created

### Done ✅
- `docs/kyc-production-enablement-checklist.md` created — single durable operational checklist consolidating Decisions C/D/F/H/I for PRODUCTION enablement of KYC document upload/download (scope/status, owner-legal gates, Fluid gate, storage/security gates, runtime gates incl. manual h3 canary, 10 MB production smoke procedure with audit-residue acceptance + recorded log-row id, rollback path, monitoring, super_admin roster review, purge dependency, sign-off block). No new decision made — consolidation only, so no decisions.md entry.

### Next 📋
- **CRITICAL PATH = owner/legal long-poles (checklist §1): retention duration + AV posture** — longest lead time; start now, everything else can parallel
- Admin download UI on staging — NOT gated by this checklist (staging endpoint already smoke-tested); proceed independently
- Live Fluid check (`npm run check:vercel-fluid`, ephemeral token) — record into checklist §2.1 + spec §8 when run

### Notes
- Docs-only session: no code, no endpoint, no migration, no `database.types.ts`, no UI; unrelated dirty files untouched; nothing staged/committed/pushed

---

## Session 2026-06-06 (later) — Admin KYC Documents Panel v1 implemented (staging)

### Done ✅
- **List endpoint (the one approved backend addition): `GET /api/admin/kyc/profiles/:id/documents`** — requirePlatformAdmin; `asUuidOrNull` id classification (uppercase normalized, junk → 400); profile existence gate (404; bare-id select); `KYC_DOCUMENT_SAFE_SELECT` + `toSafeKycDocument` only (uploaded_at desc); opaque 500 machine codes (`KYC_PROFILE_READ_FAILED` / `KYC_DOCUMENT_LIST_FAILED`); zero storage access; **list access intentionally unlogged in v1** — safe metadata only, lower sensitivity than document delivery; revisit if metadata listing is later deemed auditable (Decision J)
- **Admin UI**: `app/pages/admin/kyc/index.vue` (lookup-first; identity in POST body; raw value cleared from state after every lookup; masked identityLast4 display only) + `app/components/admin/kyc/AdminKycDocumentsPanel.vue` (safe-metadata list, coherence-filtered upload via existing API with issuedAt/expiresAt, super_admin-only Download button via shared `useUserProfile().profile.platformRole`, blob download with Content-Disposition filename + NEXT-TICK object-URL revoke, clean 403/404/500 toasts) + nav entry in staff-visible group + `app/types/admin-kyc.ts` client mirrors
- Tests: `admin-kyc-documents-list-api.spec.ts` (19) + `admin-kyc-documents-panel-ui.spec.ts` (25 — leak guard, no preview, role gate, FormData contract, refresh-after-upload, next-tick revoke, POST lookup, nav/middleware wiring)
- Decision J recorded: admin back-office English-only i18n scope (4-locale rule = customer-facing), unlogged list v1, next-tick revoke
- No migrations, no `database.types.ts`, no `server/utils/` changes (⇒ no index row), no locale files, no POS V3 changes, no booking payload changes

### Next 📋
- Staging manual smoke of the panel (lookup → upload → list → super_admin download; staff sees no Download button); note: object-URL revoke is next-tick by design
- (carried) owner/legal long-poles (checklist §1) remain the production critical path; live Fluid check pending
- Future candidates (explicitly out of v1): verify/approve UI, purge, renewal, retention display, bulk export, previews/thumbnails

### Notes
- Validation: see handoff entry — tsc clean, targeted specs green, full-suite delta = POS-20 baseline only

---

## Session 2026-06-06 (later) — Admin KYC Panel v1 staging smoke test (API-level PASS; one env blocker found)

### Done ✅
- **Staging smoke PASSED at the API level** on `https://www.hopnic.co.th` (deploy `9929c88`), synthetic data only:
  - Synthetic profile `2c9f4de7-ea6d-4d6f-8c50-43427ec34483` (service-role insert, literal `smoke-test-admin-kyc-panel-v1-2026-06-06` identity_hash — same precedent as the Phase 2 smoke) · synthetic 1,048,580-byte JPEG (magic bytes + random)
  - Staff (minted session, logged out after): upload 200 (safe whitelist response), NEW list endpoint 200 (safe fields only), coherence negative `id_card`-on-passport-profile → 422
  - **Staff download oracle**: malformed / nonexistent-uuid / real id → three 403s, identical status+statusMessage+body (only h3's request-URL echo differs) — no existence signal
  - **super_admin download**: 200, `attachment; filename="kyc-453303f1-….jpg"` from server Content-Disposition, `no-store`/`nosniff`/`image/jpeg`, NO Content-Length (streamed), zero storage/bucket/signed leakage in headers
  - **SHA-256 byte integrity: EXACT MATCH** `dbe850f7…` (source fixture vs proxied download, 1,048,580/1,048,580)
  - Audit trail verified read-only: `upload/allowed`(staff) → `download/denied/not_super_admin`(staff) → `download/denied/not_super_admin_malformed_id` with `document_id=null` (Decision G) → `download/allowed`(super_admin); rows `b6904f1a…`/`809d3dd1…`/`3e4649b2…`/`d46e9fa1…` PRESERVED forever (by design)
  - Manual synthetic fixture cleanup (owner-approved, NOT a Decision H purge — that primitive doesn't exist yet): storage object `kyc/88be35db-44d3-47f8-8d11-48147d8b77a6.jpg` deleted (re-fetch 400), `kyc_documents` + `kyc_profiles` rows deleted by exact id; both tables back to 0 rows; no real customer KYC touched; local temp files removed; minted sessions logged out (204/204)

### Blocked 🚫
- **`KYC_HASH_SECRET` is NOT set in the staging Vercel environment** (also absent from local `.env`; only `.env.example` documents it) → `POST /api/admin/kyc/profiles/lookup` and profile create return 500 `KYC_HASH_UNAVAILABLE`. **The /admin/kyc page's lookup flow is dead on staging until the owner sets this env var** (generate per `.env.example`: `openssl rand -hex 32`). This also blocks the in-browser UI portion of the smoke (panel renders only after a successful lookup).

### Next 📋
- Owner: set `KYC_HASH_SECRET` in Vercel (staging env) + local `.env`, redeploy/restart → then run the 2-minute in-browser pass: lookup → panel renders → staff sees no Download button → super_admin click-download **completes in a real browser** (next-tick revoke check) → DevTools: no preview elements, no local/sessionStorage writes
- UI leak/preview/role-gate behavior is meanwhile pinned by the 25-test source-inspection spec (not a substitute for the one-time real-browser click)

### Addendum (same session) — KYC_HASH_SECRET architectural finding recorded (Decision K)
- Verified from the data model before recording: NO raw identity stored anywhere (kyc_profiles = keyed `identity_hash` + masked `identity_last4` only, migration 105; pickup snapshots = status/dates only, migration 106; no plaintext identity column in any migration) → **`KYC_HASH_SECRET` is a permanent, hash-only, NON-ROTATABLE secret (Decision K)**: must exist before the first real profile per environment; backed up outside git; losing it orphans all profiles; compromise = re-collection project, not a config rotation
- `docs/kyc-production-enablement-checklist.md` gained gate **§4.0**: every `.env.example` key present in the deployed environment (explicitly `KYC_HASH_SECRET`) — run BEFORE manual smoke, not during it
- Smoke record (explicit): API smoke passed with synthetic profile/document ONLY; SHA-256 source/download EXACT match; UI runtime/browser portion PENDING the env fix; the missing staging `KYC_HASH_SECRET` caused the UI lookup/profile blocker (environment config issue, NOT a code defect); **no real customer KYC document was downloaded**; the 4 immutable access-log rows from the synthetic smoke are PRESERVED; manual fixture cleanup was NOT a Decision H purge and wrote NO delete audit row (that primitive does not exist yet)
- Owner next: set `KYC_HASH_SECRET` in Vercel staging + local `.env` (never printed/committed) → redeploy → run the owed in-browser UI smoke

---

## Session 2026-06-06 (later) — Admin KYC profile create flow (minimal intake; UI-only)

### Done ✅
- **Endpoint inspection first (no backend gap found — zero backend changes):** `POST /api/admin/kyc/profiles` is requirePlatformAdmin (staff may create); body `customerType`/`identityType`/`identityValue` with coherence guard; returns `{ profile: SafeKycProfile, created, reused }`; dedupes walk-in identities (reuses best `user_id IS NULL` profile, never duplicates, never reuses a registered user's profile); status always `pending`; upload API accepts pending profiles (proven in the 2026-06-06 smoke)
- `/admin/kyc`: "Create pending KYC profile" card (UI-only) shown whenever no profile is selected — customerType select, coherence-mirrored identityType select (individual → national_id|passport; company → juristic_id; auto-resets on customerType change), identity input; POST body-only; raw identity cleared from state in `finally`; success feeds `res.profile` into the SAME `profile` ref/render path as a lookup hit → existing AdminKycDocumentsPanel renders (panel untouched)
- Spec extended (+6, now 31): create POSTs exactly `/api/admin/kyc/profiles`, identity never in URL/query, cleared-after-submit, same-render-path assignment ×2, coherence mirror, create-form-only-when-no-profile, and NO verify/approve/reject/delete/purge affordance (no DELETE/PATCH/PUT methods anywhere in the KYC UI)
- Validation: tsc clean · targeted KYC suites 129/129 · full suite 2252 pass / 20 fail (POS baseline unchanged; +6 = new tests; zero KYC failures)
- Untouched: panel component, POS V3, pickup gate, migrations, `database.types.ts`, `server/utils/`, locale files (Decision J), `app/types/admin-kyc.ts` (create response typed inline)

### Notes
- /admin/kyc standalone is intentional; POS V3 KYC UI wiring remains a later integration
- Flow still requires `KYC_HASH_SECRET` in the environment — create/lookup 500 `KYC_HASH_UNAVAILABLE` until the owner sets it (staging + local); the owed in-browser smoke now covers create → upload → download end-to-end from a bare environment

---

## Session 2026-06-06 (later) — Company KYC VAT requirement recorded for Minimal Verify KYC planning (docs only)

### Verify-planning requirement — company KYC verify-readiness rule (owner-locked)
- For `company + juristic_id`, **`company_cert` is always required**.
- **VAT status must be explicitly recorded by the verifier at verify time** — server-enforced and FAIL-CLOSED: company verification cannot proceed without a recorded VAT status.
- Clean binary enum unless future policy requires otherwise: `vat_registered` | `not_vat_registered`.
- If `vat_registered` → a `vat_certificate` document must exist. If `not_vat_registered` → `vat_certificate` is not required.
- The system must NEVER infer VAT status silently from the presence/absence of `vat_certificate`.
- VAT status lives on the **immutable verification decision/audit record**, together with verifier id, timestamp, outcome, and reviewed document ids.
- Upload remains ADDITIVE: multiple documents can attach to the same `kyc_profile_id`; `company_cert` and `vat_certificate` must coexist under one profile; uploading one type must not block, replace, or imply completion of the other; single-file upload at a time is acceptable (no multi-file picker); `signature` remains optional unless product/legal later decides otherwise.

### Additional Minimal Verify KYC planning notes
- Verify remains **super_admin-only** unless the document-view/download policy changes.
- The verify endpoint must enforce the readiness rule **server-side**; UI checks are convenience only.
- At planning time: inspect whether the current document model has any uniqueness constraint on `(kyc_profile_id, document_type)` that would affect additive uploads or re-upload behavior.
- (Standing from Opus review): verify gets its own immutable profile-level audit trail (NOT `kyc_document_access_log`); thin pickup-gate contract `status = 'verified' AND now < valid_until`; `valid_until = verified_at + 1 year` as a named constant; conscious yes/no on minimal super_admin revoke in v1; reject/renewal/user-linking/POS V3 integration stay out unless explicitly approved; document preview stays blocked.

### Notes
- Docs-only session: no app/server/migration/type/locale/POS V3 changes; implementation NOT started

---

## Session 2026-06-07 — Minimal Verify KYC slice ①: migrations 111 + 112 authored and locally verified (NOT pushed)

### Done ✅
- **Migration 111 — `kyc_pickup_overrides` UPDATE block (Option R rider, separate discoverable migration):** BEFORE UPDATE trigger raises for ALL roles (blocks silent rewriting of override_reason/actor/booking refs); DELETE deliberately still allowed (designed invalidation path); residual risk recorded in the table COMMENT: DELETE erases the trace, accepted until TASK 6 — which MUST preserve the no-UPDATE invariant and replace delete-to-invalidate with an auditable marker
- **Migration 112 — `kyc_verification_decisions` + `kyc_vat_status` enum + atomic RPCs:** 109-style purge-surviving audit (plain UUID snapshots, NO FKs; verifier snapshot decided_by_user_id+name+role; customer_type/identity_type denormalized so CHECKs can bind); fail-closed CHECKs (company VAT, individual no-VAT, valid_until, reviewed-ids ≥1, visual attestation, closed revoke-reason set incl. method='admin_panel' only); append-only triggers (UPDATE/DELETE/TRUNCATE); RLS service-role write + super_admin SELECT; `verify_kyc_profile` / `revoke_kyc_profile` SECURITY DEFINER RPCs (service-role EXECUTE only) doing row-lock → transition check → decision INSERT → profile UPDATE in ONE transaction; valid_until = decided_at + 1 year (sync note with kyc.ts); re-verify of revoked clears the revoked_* mirror (history preserved in decisions); TOCTOU dependency comment recorded (readiness moves into the RPC when Decision H purge ships; reviewed-id ownership already re-checked in-transaction)
- **Local runbook green:** chain reset-clean through 112 (×2 incl. idempotent re-run); behavioral checks ALL PASS — 111: UPDATE blocked / DELETE allowed; 112: 9/9 CHECK rejections, RPC matrix (verify individual ✓ status+method+1y, double-verify ✗, company-no-VAT ✗, foreign reviewed id ✗, non-super_admin role ✗, missing attestation ✗, company+VAT ✓, bad revoke reason ✗, revoke ✓ + mirrors, revoke-non-verified ✗, re-verify-revoked ✓ + mirrors cleared, history 4 rows), decision UPDATE/DELETE/TRUNCATE blocked; **atomicity proven with a GENUINE mid-transaction failure** (decision INSERT succeeded → profile UPDATE failed on actor FK → rollback left 0 decision rows + status pending)
- Validation: `npx tsc --noEmit` clean · full suite 2252/20 = POS baseline unchanged

### Important sequencing note — types regen DEFERRED
- `database.types.ts` regen is intentionally NOT in this commit: the committed file was generated against the LINKED REMOTE (has `__InternalSupabase` + legacy remote FK constraint names); a `--local` regen injects unrelated constraint-name noise. Regen with `--linked` AFTER the approved remote `db push` of 111+112, BEFORE slice ② endpoints (which need the RPC types). tsc is clean meanwhile (nothing references the new objects yet).

### Next 📋
- Owner approval → `supabase db push --linked --dry-run` (must show ONLY 111+112) → push → metadata-only remote verification → `gen types --linked` regen commit
- Slice ②: `server/utils/kyc-verification.ts` + verify/revoke/verification-history endpoints + specs · Slice ③ UI · Slice ④ docs (Decision L + design-doc amendments)

### Blocked 🚫
- Remote migration push awaits explicit approval; production enablement unchanged (Decision C + checklist)

### Addendum (2026-06-07) — SQL review resolutions (pre-push)
- **Validity authority locked:** DB/RPC (`verify_kyc_profile`) is the SINGLE WRITER AUTHORITY for `valid_until` (+1 year fixed in SQL; never an endpoint parameter — drift-proof). 112 §F comment amended to state this. Slice ② TS `KYC_VALIDITY_PERIOD_MONTHS` = mirror for display/readiness/tests only; source-inspection pins both to +1 year.
- **Revoked-shape CHECK added** (reviewer-optional, adopted as low-risk): revoked rows must have `vat_status IS NULL`, `valid_until IS NULL`, `visual_review_confirmed = false`, zero reviewed ids. Local matrix extended: 6/6 new rejections PASS; RPC verify→revoke→re-verify still green; clean reset after.
- **No legitimate UPDATE path on `kyc_pickup_overrides`** (grep-verified): only two SELECT call sites (`rental-fulfillment.ts:254`, `rental-pickup-readiness.ts:395`); zero `.update()/.upsert()/.delete()` chains; the migration-106 hit is an FK definition, not an UPDATE. No INSERT path in runtime code yet either (POS V3 wiring backlog).
- **service_role cannot disable triggers:** verified empirically on local as the actual role (`SET ROLE service_role` → `SET session_replication_role = replica` → permission denied; `rolsuper=f`, `pg_parameter_acl` empty). Remote: same conclusion BY CONSTRUCTION (hosted Supabase service_role is never superuser; the parameter is SUSET) — an arbitrary-SQL remote test is not possible with available credentials (REST key only) and was NOT attempted.
- **Slice ② carried requirement (RPC actor params):** the endpoint MUST pass the authenticated user's TRUE id / name snapshot / platform role from `requireSuperAdmin` into the RPC — never hardcode `p_decided_by_role='super_admin'`; `requireSuperAdmin` remains the real guard; the service-role-only EXECUTE grant is never widened.

### Addendum (2026-06-07, later) — remote apply DONE + linked types regenerated
- **Remote DB:** 111 + 112 applied via `supabase db push --linked` (dry-run before showed exactly the two; dry-run after = "Remote database is up to date"). Metadata verification (read-only, no probe rows): REST count on `kyc_verification_decisions` → 0 rows / HTTP 200 (table + RLS live); `gen types --linked` read the REMOTE catalog and emitted the table, `kyc_vat_status` enum, and both RPC signatures. (`db diff --linked` not run — shadow-DB port conflicts with the running local stack; recorded as the one skipped check.)
- **`database.types.ts` regenerated with `--linked --schema public`** — diff is PURELY ADDITIVE (5 hunks, 91 lines: table block + 2 RPC blocks + enum + constant; ZERO removals, zero non-KYC drift; `__InternalSupabase` header preserved). tsc clean · full suite 2252/20 POS baseline unchanged.
- **OPERATIONAL NOTE (v1 walk-in reality):** grep confirmed there is NO runtime INSERT path for `kyc_pickup_overrides` yet — so in v1, unverified walk-ins can rely on neither `staff_on_site` (not implemented) NOR an app-created override (no creation UI/endpoint exists). **The ONLY v1 path is super_admin pre-verification via `/admin/kyc`** until override creation or staff_on_site ships.
