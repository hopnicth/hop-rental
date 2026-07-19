# Handoff Log

## Claude Code → Claude Code / 2026-07-19 (T3+T4-core Phase 1 COMPLETE — 8 walks + HTTP walk closed; NOT committed, NOT pushed, remote NOT touched)

Task: T3 unified cancel + T4-core (blueprint docs/design/2026-07-19-t3-t4-unified-cancel-and-documents.md @ 18e3cdd), executed as gated migrations 127-132 + 8 flow walks + the HTTP-debt walk. All checkpoints CHiP-accepted. Suite 136 files / 2744 green; tsc clean.

**Status: DONE locally — awaiting closing-package audit → per-file staged commit (owner "go") → later remote apply.**

### REMOTE-APPLY PRECONDITIONS (when that gate comes — read before `db push`)
1. **`--include-all` REQUIRED**: 128 and 131 were created after 129/130/132 chronologically; remote `supabase migration list` will show them as out-of-order pending. Verify the dry-run lists EXACTLY 127,128,129,130,131,132 and nothing else.
2. Remote already has the system actor + `system_configs.system_actor` (T2 apply, 2026-07-19) — mig 126's cron needs it; nothing new required for 127-132.
3. After push: regenerate `database.types.ts` with `--linked` (new tables: sale_order_refunds, money_ops_decision_logs; new orders column inventory_restored_at; RPCs).
4. The 127 disposition-CHECK resolver drops constraints by pg_constraint definition-match (auto-names are 63-char truncated) — it fails loudly on 0/≠1 matches; if remote drifted, STOP and report.
5. Suite + walks were LOCAL-ONLY; no remote smoke has been designed yet for T3 — propose one at the remote gate.

### LOCAL RESIDUE INVENTORY (immutable-by-design rows; wiped by any `db reset --local`)
- `money_ops_decision_logs`: 1 `walk2_probe` denied row (132 append-only probe) + 2 pre-fix denied rows (`order_not_cancellable` on order a4a4…0001; `booking_not_cancellable` on booking a6a6…0002) — all self-labeling.
- `official_documents`: 1 draft probe doc (`test_draft_doc`) — undeletable by the 131 guard, by design.
- Walk fixtures (users 1111/2222/9999, assets W8*/W9 etc., bookings/orders/refunds/documents BDR-202607-0001..0004) — dev data per §b addendum item 6.

### FIXTURE KNOWLEDGE (auth seeding for local HTTP walks)
Raw-SQL-inserted `auth.users` rows break GoTrue (`Database error finding user`) because token columns default NULL. Fix before minting sessions:
`UPDATE auth.users SET confirmation_token='', recovery_token='', email_change_token_new='', email_change='', email_change_token_current='', phone_change='', phone_change_token='', reauthentication_token='' WHERE ...`
Then: admin `generateLink` (magiclink) → `verifyOtp({token_hash})` → cookie `sb-127-auth-token=base64-<base64url(session JSON)>`. ALWAYS revoke after (delete `auth.sessions` + `auth.refresh_tokens` rows). Dev server: use the running `nuxt dev --dotenv .env.local` (LOCAL 54321) — never restart it, never walk against remote.

### What shipped (details in progress.md 2026-07-19 section + decisions.md 2026-07-19 entry)
- Migrations 127-132 (all gated, applied locally, chain contiguous).
- Server: rental-cancellation-policy v2 tier; admin-refunds mark-refunded → RPC; admin-rental-booking-cancel (late-cancel + company); mixed-cancel-orchestration; admin-stuck-deposits; admin-sale-order-cancel; admin-document-void; money-ops-log; endpoints for each; raw-flip + paymentStatus closures in orders [id].patch.ts + admin-order-transitions.
- Tests: 7 new spec files + 4 updated; suite 2744.
- Docs: design doc (annex #7 + sub-convention), OPERATING-MODEL §3 gate rule, MASTER-GAP-MAP T3/T4 rows, BACKLOG, decisions.md, server-utils index (7 rows).

### Next
1. Closing-package audit → commit on explicit owner instruction (five-group staging; DO NOT push).
2. Remote apply gate (preconditions above).
3. Phase 2 (T4-rest) / T5 per the design-doc boundary; walk-1 documents leg for the cancellation notice variants remains suite-level.

---


## Claude Code → Claude Code / 2026-06-21 (Phase A + B-0.2 audits complete — Phase B-1 ready to implement)

Task: Read-only architecture audit of Partner Ecosystem UI + Category/Subcategory Readiness (Phase A) followed by Partner Taxonomy + Search Foundation deep audit (Phase B-0.2). No files changed. No migrations. No commits.

**Status: AUDIT COMPLETE — Phase B-1 implementation ready**

### What the audits established (locked, do not re-derive)

- `main_categories` is a SHARED table (products + assets + partners + content pages). Safe to leave untouched.
- 20 existing partner category keys (`store_*`, `service_*`, `contractor_*`) live in `main_categories` via migration 097. They stay in place during Phase B-1.
- `partner_profiles.main_category_key` (FK) + `secondary_category_keys[]` (GIN array) are the current category mechanism. They are NOT removed in B-1.
- 4 files hardcode the 20 category keys: `partners/index.vue`, `AdminPartnerCreateContainer.vue`, `AdminPartnerDetailContainer.vue`, `PartnerCard.vue`.
- The current public `/api/partners` category filter uses `buildPublicCategoryOrFilter()` → PostgREST OR on `main_category_key.eq.X,secondary_category_keys.cs.{X}`. This keeps working during B-1.
- 5/8 proposed new categories have ZERO mapping to existing keys (`freelance_foremen`, `freelance_engineers`, `plc_programmers` entirely new; `freelance_technicians` and `freelance_safety_officers` are partially ambiguous). Automatic backfill is not safe.
- `partner_capabilities` and `partner_search_terms` tables are DEFERRED (no write path, no AI infrastructure).

### Phase B-1 migration scope (LOCKED)

**One migration commit: `partner_categories` + `partner_category_assignments` + 8 seed rows**

```sql
-- Table 1: partner_categories
CREATE TABLE public.partner_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  parent_id   uuid REFERENCES public.partner_categories(id) ON DELETE RESTRICT,
  level       integer NOT NULL DEFAULT 0,
  icon        text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  is_public   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (level >= 0 AND level <= 3),
  CHECK ((parent_id IS NULL AND level = 0) OR (parent_id IS NOT NULL AND level > 0))
);

-- Table 2: partner_category_assignments
CREATE TABLE public.partner_category_assignments (
  partner_profile_id  uuid REFERENCES public.partner_profiles(id) ON DELETE CASCADE,
  category_id         uuid REFERENCES public.partner_categories(id) ON DELETE RESTRICT,
  is_primary          boolean NOT NULL DEFAULT false,
  source              text NOT NULL DEFAULT 'admin',
  confidence          numeric(4,3),
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_profile_id, category_id),
  CHECK (source IN ('admin', 'ai_extracted', 'backfill', 'partner_self'))
);
```

**Seed: 8 top-level categories (with DO UPDATE, not DO NOTHING — see decisions.md B1-1)**
| slug | icon | sort_order |
|---|---|---|
| construction_materials | i-lucide-brick-wall | 10 |
| contractor_services | i-lucide-handshake | 20 |
| freelance_technicians | i-lucide-wrench | 30 |
| freelance_foremen | i-lucide-clipboard-check | 40 |
| freelance_engineers | i-lucide-ruler | 50 |
| freelance_safety_officers | i-lucide-shield-check | 60 |
| drafting_design | i-lucide-drafting-compass | 70 |
| plc_programmers | i-lucide-cpu | 80 |

**i18n_keys:** `partners.categories.construction_materials`, `partners.categories.contractor_services`, etc.

**Thai labels (for the i18n seed reference):**
- construction_materials → ร้านวัสดุก่อสร้าง
- contractor_services → บริการสำหรับผู้รับเหมา
- freelance_technicians → ช่างอิสระ
- freelance_foremen → Foreman อิสระ
- freelance_engineers → วิศวกรอิสระ
- freelance_safety_officers → จป.อิสระ
- drafting_design → งานเขียนแบบ
- plc_programmers → PLC โปรแกรมเมอร์

**Indexes:**
```sql
CREATE UNIQUE INDEX idx_partner_category_assignments_one_primary
  ON public.partner_category_assignments(partner_profile_id) WHERE is_primary = true;
CREATE INDEX idx_partner_category_assignments_category
  ON public.partner_category_assignments(category_id, partner_profile_id);
CREATE INDEX idx_partner_categories_parent_active
  ON public.partner_categories(parent_id, is_active, sort_order);
CREATE INDEX idx_partner_categories_public_sort
  ON public.partner_categories(is_public, is_active, level, sort_order);
```

### 4 implementation constraints (LOCKED — see decisions.md B1-1 through B1-4)

1. **Seed uses `DO UPDATE SET`** (icon, sort_order, is_active, is_public, updated_at) — NOT `DO NOTHING`
2. **RLS helper function:** `REVOKE ALL ON FUNCTION public.is_public_partner_profile(uuid) FROM PUBLIC` then `GRANT EXECUTE TO anon, authenticated` — immediately after function creation
3. **Fail-closed writes:** NO INSERT/UPDATE/DELETE grants to anon or authenticated. Only `service_role FOR ALL` + public SELECT policies in B-1.
4. **Validation test rows:** Must be transactional (`BEGIN`/`ROLLBACK`). Zero persistent test rows after migration completes.

### What B-1 does NOT change

- `partner_profiles` — no new columns, no column removals, no constraint changes
- `main_categories` — untouched
- `main_category_key` + `secondary_category_keys[]` on `partner_profiles` — remain in place
- Any API routes — public `/api/partners` filter continues working via old fields
- Any UI files — hardcoded category arrays unchanged until Phase B-2

### After B-1 — Phase B-2 scope (NOT this session)

1. Update `AdminPartnerCreateContainer.vue` + `AdminPartnerDetailContainer.vue` to write to `partner_category_assignments` instead of `main_category_key` / `secondary_category_keys` — new multi-select UX
2. Update `GET /api/admin/partners` to expose a `GET /api/admin/partner-categories` route returning the new taxonomy
3. Update `GET /api/partners` filter to JOIN on `partner_category_assignments` — replace `buildPublicCategoryOrFilter()`
4. Update `partners/index.vue` `ALL_PARTNER_CATEGORIES` array → fetch from public API
5. Update `PartnerCard.vue` `CATEGORY_LABELS` map
6. Admin assignment task: super_admin assigns existing partners to new 8 categories before public rail launches

### Files touched this session

None — read-only audit only.

### Open product decisions (unresolved — needs CHiP answer before B-1)

1. Are the 8 new categories a REPLACEMENT for the 3 directoryTypes, or additive?
2. Are the 8 taxonomy slugs and Thai labels final as listed above?
3. Should subcategories for `freelance_technicians` (electrical, plumbing, welding, hvac) be seeded in B-1 or deferred?
4. Who can manage `partner_categories` — super_admin only, or staff too?
5. Is `is_primary` enforced (exactly-one DB constraint) or advisory?

---

## Claude Code → Claude Code / 2026-06-18 (Order history items + My Rentals split — NOT pushed)

Task: (A) Expandable order item details on `/user/orders`; (B) My Payments nav in UserDropdown; (C) Split My Rentals into current/historical sections.

**Files touched:**
- `app/pages/user/orders/index.vue` — expandable items, lazy-load `/api/user/orders/[id]`, cache, loading/error states, financial summary, aria attrs
- `app/components/header/UserDropdown.vue` — My Payments nav item (`bx:receipt`, `/user/payments`)
- `app/pages/user/rentals/index.vue` — section split: `currentRentals`/`historicalRentals`/`allDisplayedBookings`; helpers `isPickupDatePast`, `isHistoricalSection`, `isPickupPastWithActiveStatus`; `compareBookingsByPickupDateDesc`; watcher updated; template two-section layout
- `i18n/locales/en.json`, `th.json`, `cn.json`, `jp.json` — `ordersPage.items.*` (11 keys), `user.payments`, `rentalsPage.currentSection`, `rentalsPage.historicalSection`, `rentalsPage.pickupDatePassed`
- `tests/server/customer-order-history-ui.spec.ts` — 11 new source-inspection tests (NEW FILE)
- `tests/server/user-qr-ui.spec.ts` — 3 My Payments tests appended
- `tests/server/rental-section-split-ui.spec.ts` — 31 source-inspection tests (NEW FILE)

**Status: DONE** — tsc=0; 61 targeted specs pass; no regressions.

**Not pushed.** Branch is `cart-checkout-to-payment-detail`. The earlier open items from the manual payment request handoff (bank account config, cn/jp translations for paymentRequests.*, remote db push, browser smoke) are unchanged.

**Next:** Run browser smoke of the updated order detail expand and rentals sections, then push when ready.

---

## Claude Code → Claude Code / 2026-06-18 (Browser smoke test complete — 5/5 smokes run)

Task: Manual bank-transfer payment flow browser smoke test against localhost:3000 + remote Supabase.

**Status: COMPLETE** — all 5 smokes run. Code unchanged (smoke test only).

**IDs collected:**
- Smoke 1 (sale): payment `dd680ad2`, order `ede7305f` (ORD-20260617213307-1CB8BA), ฿140
- Smoke 2 (booking): payment `50c68582`, booking `b4a89845`, ฿200
- Smoke 3 (mixed): payment `1f1ff054`, order `ba15ba91` (ORD-20260617214425-73C48B), booking `b4a89845`, ฿480

**All safety invariants held:** no Omise, no auto-pay, no auto-confirm, no inventory deduction, no held_balance_events.

**Bug found — must fix before launch:**
- **File:** `app/pages/user/orders.vue` + `app/pages/user/orders/[orderId].vue`
- **Problem:** `orders.vue` acts as the Nuxt parent route for all `/user/orders/*` sub-routes but has no `<NuxtPage />`. Navigating to `/user/orders/[id]` renders `orders.vue` (the list) and silently discards `[orderId].vue` content (which contains `PaymentRequestRelatedCard`).
- **Fix:** Either add `<NuxtPage />` to `orders.vue` or rename `orders.vue` → `orders/index.vue`.

**Next session:** Fix the `orders.vue` / `[orderId].vue` routing bug, then push branch to origin.

---

## Claude Code → Claude Code / 2026-06-18 (Remote migration 115 APPLIED to linked project — code NOT pushed)

User explicitly authorized applying ONLY migration 115 to the linked project
`hopnicth's Project` (ref `yzjczvzwmbbeyoodrjwm` — the single live/production-like DB; no
separate staging). Gate: re-confirmed only 115 pending; additive; no existing-table/data
writes; no VAT/Omise/KYC.

- `supabase db push --linked` → applied 115 only (in-migration assertions passed on remote).
- Remote verified: `migration list` shows `115|115|115`; 3 tables reachable via service-role
  (HTTP 200); anon GET → 401; bucket `manual-payment-slips` `public=false` (jpeg/png/pdf);
  service-role INSERT request + item then cascade DELETE → 0 residue (the insert that 500'd works now).
- Local checks: tsc=0; payment specs 65/65; 7 grep guards clean.
- Code NOT pushed (branch 14 ahead of origin/staging). No other migration applied. No secrets exposed.
- PENDING: interactive browser click-through (sale-only/booking-only/mixed → /user/payments/[id],
  slip upload → pending_review, related order/rental/admin links) — must be run by a human (no
  browser-driving here). DB + endpoint path is proven ready; the runtime 500 root cause is resolved.
- `.env.local` (gitignored) exists for a local-Supabase smoke option; `.env` remains remote (unchanged).

## Claude Code → Claude Code / 2026-06-18 (Central manual payment requests — branch cart-checkout-to-payment-detail, NOT pushed)

Task: Replace per-target/query-param manual payment pages with ONE central
`manual_payment_requests` model. Cart → create/reuse sale order + draft bookings → ONE
payment request (+ allocation items) → `/user/payments/[id]` (one amount, one slip,
evidence-only). Admin reviews evidence; confirmation stays on existing admin actions.

Commits (on top of `437cf61`; 6 new, NOT pushed): `e589a1d` (migration 115) · `18a2a1f`
(types) · `1da59bb` (server APIs + utils + index) · `0891e7d` (customer UI + i18n) ·
`3c8c5bc` (admin UI) · `cb4b07f` (tests).

Locked invariants (verify before changing):
- EVIDENCE ONLY: customer slip upload → request `pending_review`; never marks order paid,
  confirms booking, deducts inventory, writes `rental_held_balance_events`, or touches
  Omise/`payment_attempts`/KYC. Admin review/reject change only manual_payment_request*/
  _slips status. Sale/booking confirmation = existing admin actions only.
- Slips live in PRIVATE bucket `manual-payment-slips`; admin views via short-lived signed
  URL through `GET /api/admin/.../slips/[slipId]/download`. Never public URL.
- Create endpoint computes amounts server-side (order grand_total + booking deposit via
  `calculateBookingDepositDueNow`); client amounts never trusted; enforces ownership +
  order awaiting_payment + booking draft. Reuses an active request covering the same
  target set (safe re-checkout).
- ADDITIVE: existing `sale_order_payment_slips` / `rental_booking_deposit_slips` tables +
  endpoints KEPT (legacy). Central slip table does NOT fan out to them.

Verification: `supabase db reset --local` clean (migration 115 assertions pass); `npx tsc
--noEmit` = 0; 4 new specs (45 tests) + 5 updated flow specs green; grep guards pass.

OPEN ITEMS for next session:
1. **Real bank account config** — `app/utils/payment-account.ts` still placeholder ([TODO]).
2. **cn/jp translations** — `paymentRequests.*` cn/jp are `[NEEDS_TRANSLATION]` (en/th real).
3. **Migration 115 + types are LOCAL only** — remote `db push --linked` + `--linked` regen
   before deploy (same gate as 113/114).
4. **Not pushed** — all 6 commits local.
5. **Browser/staging smoke** not run (CLI env).
6. Deferred: amount-paid / paid-at fields; `manual_payment_request_events` audit table;
   accounting/receipt/VAT. `/user/checkout-payment` kept-but-deprecated (unlinked).
7. **Pre-existing unrelated test failures** (8 files, fail at baseline `cbc69e4`):
   cart-phase-31b-ui, mixed-checkout-ui (old online/mixed cart UI removed earlier),
   admin-pos-v2-rental-bookings, pos-v2-pickup-completion, admin-pos-v3-qr-webhook,
   admin-pos-v3-remaining-security-deposit-payments, admin-operational-documents,
   admin-booking-handover-ui (date/amount/mock/stale-string). Out of scope here.
8. Local task log: `docs/task-runs/manual-payment-requests.md` (gitignored, not committed).

## Claude Code → Claude Code / 2026-06-17 (Cart → manual bank-transfer + slip for rentals AND sale orders — branch cart-manual-transfer-all-items, NOT pushed)

Task: Convert the unified cart to manual bank-transfer + slip upload for BOTH rental bookings and B2C sale items (launch: no online payment).

Branch: `cart-manual-transfer-all-items` (base origin/staging `cc7c772`). 5 commits: `ae8484c` (migration 114 + sale slip util), `3bcdc92` (customer order detail + upload), `0524210` (admin review + Mark Payment Received), `53476a5` (cart manual UX), + docs (this commit). NOT pushed.

Key facts / invariants:
- Online cart payment hidden via local flag `ONLINE_CART_PAYMENT_ENABLED=false` in `app/pages/user/cart.vue` (online selector + card/PromptPay/unified CTAs gated; old code retained, not deleted, for easy re-enable). Flip to true / wire env when online payment is ready.
- SALE slips are SEPARATE from rental slips: bucket `sale-order-payment-slips` + table `sale_order_payment_slips` (migration 114). NEVER reuse rental_booking_deposit_slips / rental-deposit-slips / rental_held_balance_events / confirmRentalBooking for sale.
- Sale order states: created `awaiting_payment` (no online pay) → customer slip upload moves to `pending_review` (never paid) → admin "Mark Payment Received" → `paid`+`confirmed`, idempotent `f_apply_order_inventory`, cart clear. No VAT/revenue (none exists; none invented).
- Rental flow unchanged (held liability + confirmRentalBooking); cart rental CTA now routes to `/user/rentals/[bookingId]` for slip upload.
- Customer order detail page `app/pages/user/orders/[orderId].vue` is NEW (none existed) + new `GET /api/user/orders/[id]`.
- Migration 114 is LOCAL only (db reset --local clean). Remote `db push --linked` + `--linked` types regen needed before deploy.

Verification: db reset --local clean; npx tsc --noEmit = 0; sale-order-payment-slip-evidence (17), user-sale-order-payment-slip-api (9), admin-sale-order-payment-api (10), cart-manual-checkout-ui (9), + rental suites all green.

OPEN ITEMS:
1. i18n PENDING TRANSLATION (th/cn/jp): `ordersPage.paymentSlip.*` + `cart.manual*` placeholders. Grep `NEEDS_TRANSLATION`.
2. Admin sale slip UI (`AdminOrderPaymentSlips.vue`) uses hardcoded English (matches non-i18n'd admin pages).
3. Migration 114 not pushed to remote; branch not pushed.
4. Browser/staging end-to-end smoke not run (CLI env) — verify on deploy.
5. Rental booking-deposit agreement checkbox + mixed-checkout amount preview still render in cart (informational; no actionable online CTA — all gated). Trim later if desired.

## Claude Code → Claude Code / 2026-06-17 (Manual bank-transfer booking-deposit flow — Steps 1–7 DONE, committed on staging, NOT pushed)

Task: Implement a lightweight manual bank-transfer booking-deposit flow. KYC stays PAUSED (untouched).

Flow: customer uploads bank-slip EVIDENCE (status pending_review) → booking stays draft → admin reviews slip → admin clicks "Mark Deposit Received" → held-balance liability recorded + booking confirmed via confirmRentalBooking().

Commits (staging, in order): `204d7a6` (migration) · `144f3e3` (types+util) · `15e12ca` (customer upload API) · `857f10f` (admin visibility+signed access) · `8acc5d2` (admin manual confirm) · `a1ba94e` (customer UI+i18n) · docs commit (this step).

Locked invariants honored (verify before changing):
- Booking deposit = refundable held LIABILITY (rental_held_balance_events, event_type `booking_deposit_collection`). NOT revenue, NOT VAT. money-summary tests still green.
- Uploading a slip never confirms; admin confirmation required. Confirmation only via `confirmRentalBooking()` — status never set directly.
- Slips live in PRIVATE bucket `rental-deposit-slips`; viewed only via short-lived signed URLs. Never catalog-media, never public URLs.
- No Omise / QR / payment_attempts / payment result pages touched. No `rental_payment_events` created (reused held-balance ledger).
- Manual held-balance source_type = `manual_admin_confirmation` via `recordRentalHeldBalanceEvent` (free-text source); idempotent on source_id=bookingId. Confirm is NOT gated on requireBookingDepositHeldBalanceEvent (manual source not in that closed union).

Verification: `supabase db reset --local` clean; targeted suites green; `npx tsc --noEmit` = 0. See progress.md for the smoke summary.

OPEN ITEMS for next session:
1. **i18n PENDING TRANSLATION** — 9 keys under `rentalsPage.depositSlip.*` have `[NEEDS_TRANSLATION]` placeholders in th/cn/jp (en has real values). Grep: `grep -r "NEEDS_TRANSLATION" i18n/locales/`.
2. **Admin component strings are hardcoded English** — `AdminBookingDepositSlips.vue` / `AdminBookingDepositConfirm.vue` follow the existing non-i18n'd admin booking page convention (deliberate consistency choice). Re-evaluate if admin i18n is later adopted.
3. **Migration 113 is LOCAL only** — not pushed to remote. Remote `db push --linked` + types regen `--linked` needed before deploy (same gate as the KYC migrations).
4. **Not pushed** — all 7 commits are local on `staging`.
5. Deferred features: OCR, bank reconciliation, duplicate-slip detection, full approve/reject workflow, refund flow, customer re-viewing own slip.

## Claude Code → Claude Code / 2026-06-16 (KYC PAUSED — Slice ② review gate CLOSED; switching to Bank Transfer Slice ①)

Task: Pause KYC; correct stale status; perform the bypassed actual-source review of committed Slice ②.

Status correction (IMPORTANT): The prior pause summary said "Slice ② endpoints are planned/cleared but not started." That was OUTDATED. Slice ② is DONE, committed, and passing.
- Latest relevant commit: `d29ca7d feat(kyc): add verify, revoke, and verification-history endpoints` (2180 insertions).
- Files live: `server/utils/kyc-verification.ts`, `server/api/admin/kyc/profiles/[id]/verify.post.ts`, `revoke.post.ts`, `verification-history.get.ts`.
- Tests: `kyc-verify-api`, `kyc-revoke-api`, `kyc-verification-history-api`, `kyc-verification-utils` — 72 tests passing (re-run 2026-06-16).

Review gate — NOW CLOSED: Slice ② was pushed without the mandated auth-boundary source review. Review performed 2026-06-16 against the real committed source (not the summary). All six locked constraints CONFIRMED:
1. verify guarded by real `requireSuperAdmin` (verify.post.ts:72) — guard throws 403 if `platformRole !== 'super_admin'` (admin.ts:52).
2. revoke guarded by real `requireSuperAdmin` (revoke.post.ts:56).
3. `p_decided_by_role: platformRole` in BOTH endpoints — true authenticated role from the guard, never a hardcoded literal (verify.post.ts:216, revoke.post.ts:133).
4. real authenticated `userId` passed as `p_decided_by_user_id` (verify.post.ts:214, revoke.post.ts:131).
5. history is `requireSuperAdmin`-only (verification-history.get.ts:40) + RLS super_admin-SELECT-only (mig 112:174); response select excludes ip/ua/actor-id/identity/paths; reviewed_document_ids reduced to a COUNT; RPC errors mapped to opaque 500 (no raw DB text leak).
6. RPCs are the SINGLE WRITER AUTHORITY for state + `valid_until` (mig 112:185): `valid_until := now + interval '1 year'` computed inside the RPC; decision INSERT + profile UPDATE in one `FOR UPDATE` row-locked transaction; append-only enforced by block-mutation trigger; EXECUTE granted to service_role only. RPC also re-checks role (defence-in-depth). Endpoint never computes valid_until (`KYC_VALIDITY_PERIOD_MONTHS` is a display-only mirror).
Verdict: PASS — no code changes required. Review gate closed.

KYC is now SAFE TO PAUSE. No half-written auth surface in tree.

Next when KYC resumes (NOT now): Slice ③+ lifecycle — reject/renewal/purge/delete, POS V3 integration, staff_on_site, user-account linking. All still explicitly out of scope.

Next now: Bank Transfer Slice ① — data/state model + authoritative transition design ONLY (no upload mechanics, no admin UI yet). See decisions.md / progress.md.

## Claude Code → Claude Code / 2026-06-07 (Verify KYC slice ①: migrations 111+112 authored, locally verified — remote push + types regen PENDING approval)

Task: Minimal Verify KYC slice ① (schema/RPC/runbook/behavioral checks only — no endpoints, no UI)
Status: done locally, committed, NOT pushed (git) / NOT applied to remote DB
Critical sequencing for next session:
1. Remote `db push --linked` of 111+112 needs EXPLICIT owner approval (dry-run must show only 111+112)
2. `database.types.ts` regen must use `--linked` AFTER that push (committed types file matches REMOTE generator output — `__InternalSupabase` + legacy FK names; `--local` regen would add unrelated noise; verified 2026-06-07)
3. Slice ② endpoints depend on the regenerated RPC types
Key invariants shipped: decision-before-trust in ONE transaction (RPCs, row-locked); fail-closed VAT/attestation/reviewed-ids CHECKs at DB level; closed revoke-reason set (fraud_suspected|document_invalid|verified_in_error|other, no free text); overrides now UPDATE-immutable (DELETE stays = designed invalidation until TASK 6, residual trace-erasure risk accepted + recorded in table COMMENT)
Atomicity evidence: genuine mid-transaction FK failure rolled back the already-inserted decision row (0 rows, status pending) — single-transaction guarantee proven live

Review resolutions (2026-06-07, pre-push): valid_until authority = DB/RPC (comment amended; TS constant is mirror-only); revoked-shape CHECK added + matrix re-verified (6/6); no UPDATE path on kyc_pickup_overrides (grep: 2 SELECT sites only); service_role cannot set session_replication_role (verified locally as the role; remote by construction, not testable via REST). SLICE ② MUST: pass TRUE authenticated id/name/role from requireSuperAdmin into the RPCs — never hardcode the role param; never widen the EXECUTE grant.

Remote apply DONE (2026-06-07): 111+112 on remote; dry-run clean before+after; linked types regenerated (purely additive, zero drift) and committed separately. OPERATIONAL: no INSERT path for kyc_pickup_overrides exists in runtime code — v1 walk-ins need super_admin pre-verification via /admin/kyc (no staff_on_site, no app-created override yet). NEXT: Slice ② endpoints (verify/revoke/verification-history) per locked plan.

---


## Claude Code → Claude Code / 2026-06-06 (Company KYC VAT rule recorded — Verify KYC planning input; docs only)

Task: record owner-locked company verify-readiness rule before Minimal Verify KYC planning
Status: docs only — no code; Verify implementation NOT started
The rule (full text in progress.md same-date entry):
1. `company + juristic_id` → `company_cert` ALWAYS required
2. VAT status recorded EXPLICITLY by the verifier at verify time — server-enforced, FAIL-CLOSED (no company verification without it); binary enum `vat_registered` | `not_vat_registered`
3. `vat_registered` → `vat_certificate` must exist; `not_vat_registered` → not required; NEVER infer VAT status from document presence/absence
4. VAT status lives on the immutable verification decision/audit record (verifier id, timestamp, outcome, reviewed document ids)
5. Uploads stay additive (`company_cert` + `vat_certificate` coexist; one type never blocks/replaces/implies the other; single-file picker OK; `signature` optional)
Verify-planning checklist additions: super_admin-only unless view/download policy changes; server-side readiness enforcement (UI = convenience); INSPECT whether any uniqueness constraint exists on `(kyc_profile_id, document_type)` before planning additive/re-upload behavior
Standing blockers unchanged: KYC_HASH_SECRET env (staging + local) → redeploy → owed in-browser smoke → THEN produce the Verify KYC plan (plan only)

---


## Claude Code → Claude Code / 2026-06-06 (Admin KYC create-pending-profile flow — UI-only, panel untouched)

Task: minimal admin intake on /admin/kyc — create pending profile → upload documents (real capability, not dev scaffold)
Files: `app/pages/admin/kyc/index.vue` (create card + handler), `tests/server/admin-kyc-documents-panel-ui.spec.ts` (+6 → 31), progress.md, this file
Status: done pending push approval; NO backend changes (create endpoint contract verified sufficient: platform-admin, pending-only, walk-in dedupe via `reused`, SafeKycProfile response)
Reminders: needs `KYC_HASH_SECRET` set before the flow works anywhere; /admin/kyc stays standalone (no POS V3 wiring yet); download still super_admin-only; Decision J EN-only admin UI
Next: owner sets staging+local `KYC_HASH_SECRET` → redeploy → owed in-browser smoke can now start from a BARE staging DB: create profile in UI → upload → list → staff no-Download/403 → super_admin download completes + SHA-256

---


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

---

## Claude Code → next session / 2026-07-07 — next agenda

1. DECISION REQUIRED: ratify or reverse de facto payment flow. Live
   system runs in-system slip upload (mig 115) for BOTH sale orders and
   rental deposits. Approved Phase 0 architecture (LINE/WhatsApp + Mark
   Deposit Received, no in-system slips) was never implemented. Code has
   decided by default — needs explicit ratification or a migration plan
   to Phase 0. Evidence: orphaned depositSlip keys,
   PaymentRequestRelatedCard as live rental path.
2. B-4 — public taxonomy filtering (spec + audit checklist to be
   drafted; params taxCategory/taxSubcategory, never legacy category).
3. Slice 2 Home partner section — BLOCKED on off-limits file decision
   (index.vue, HomeCategoryShortcutRail.vue) + B-4 completion.
4. Backlog: cn/jp structural drift; assigned_by column if self-assign/
   AI extraction lands; 20 red tests (KYC/POS track);
   HOPNIC_COMPANY_INFO casing polish.

---

## Claude Code → next session / 2026-07-09 — ACTIVE WORK: POS V3 Completion Track

Task: Two read-only audits complete; V3 slice plan + payment-flow
ratification recorded (DECISIONS.md 2026-07-09). This entry points all
active work at the POS V3 Completion Track.

Audits (both committed with this entry):
- docs/audit/2026-07-08-launch-readiness-audit.md — R1–R7 vs
  first-branch requirements
- docs/audit/2026-07-09-pos-v3-deep-audit.md — P1–P5 V3 deep audit
  (8 HIGH / 12 MED / 6 LOW findings; surface inventory, deposit-flow
  walkthrough, mode framework, slice gap map, iPad baseline)

Status: audits DONE. Payment flow ratified (mig 115 canonical; Phase 0
abandoned). V3 is the only POS track; slices V3-0 → V3-6.

Next: **V3-0 integrity foundations** (in order):
1. Reproduction test for the cash W1→W2 crash gap (deep audit §P2.5,
   HIGH finding 4 — status "pending reproduction test"). FIRST task —
   gates the migration 119 design.
2. Migration 118 (G1): append-only/UPDATE-guard triggers on payment
   tables.
3. Migration 119 (G2 RPC): atomic W1–W4 deposit finalization +
   idempotent cash same-key finalizer re-entry (QR already recovers).
   Fold in deep-audit findings 11–12: W3 update result never checked
   (finalizer :128-137); doc-task insert error swallowed (:241-243).
   Scope locked in DECISIONS.md 2026-07-09 item 2.
4. Fail-closed fixes + test fixture refresh:
   - 4 qr-webhook fixtures missing `payment_purpose`
     (admin-pos-v3-qr-webhook.spec.ts:188-199)
   - 12 remaining-security-deposit mock-chain fixtures missing `.not()`
     (admin-pos-v3-remaining-security-deposit-payments.spec.ts)
   - pos-v2 date-rot fixture (startDate 2026-05-21) + pickup-completion
     deposit-credit arithmetic drift (1 test each)

P-slice mapping (per docs/payment-flow-ratification-audit.md §4):
P-1 = item 2 above (mig 118 G1 triggers) · P-2 = item 3 (mig 119 G2
RPC, both confirm paths) · P-3 = staff-upload pre-conditions G3/G4/A1
(DECISIONS 2026-07-09 item 1; requires P-1/P-2 first).

RESOLVED (2026-07-09, same commit): docs/payment-flow-ratification-audit.md
and docs/VISION.md are now created from owner-provided content — the
earlier missing-content blocker is closed.

---

## Claude Code → next session / 2026-07-10 — V3-0 COMPLETE (launch gates G1+G2 CLOSED)

V3-0 integrity foundations COMPLETE — all on origin/staging @ 85edf58:
- 03b0fd9 — crash-gap repro (cash W1→W2, audit HIGH-4 confirmed)
- d99ebb0 — mig 118 G1 (append-only guards on manual-payment tables)
- 53bcd8f — mig 119 G2 (atomic deposit-confirm RPC, BOTH paths: POS
  cash/QR + manual slip confirm; findings 11–12 folded in; verified by
  DB-level crash-recovery tests + live POS cash UI + manual slip
  regression)
- 33a2fed — SelectItem booking-detail 500 unblock (deposit-slip
  bookings renderable again; B6 unblocked)
- 85edf58 — fixture refresh (all 20 pre-existing failures cleared;
  tests-only)

Suite: 2611 passed / 0 failed — FIRST fully green run.
Launch gates G1+G2: CLOSED.

NEXT ACTIVE WORK: Flow B continuation from B6 (staff deposit confirm
via both entry points: POS V3 + /admin/rental-bookings), then B3
booking document+QR, per the flow-based approach
(docs/audit/2026-07-09-flow-walkthrough.md §6).

BACKLOG (carry forward, consolidated):
- stale-'finalizing' attempts sweep/alert (orphans from a crash
  between attempt insert and RPC)
- RLS hardening bundle: mig-070 draft-insert policy + confirmBooking
  dead path + legacy upsert migration
- baht-vs-satang decision audit (auditor-owned)
- dev default targets remote DB (invert to local-default)
- empty-string Select values latent on USelectMenu→USelect migration
  (4 sites: admin/alerts:34, admin/assets:337,
  admin/rental-bookings/index:34 [button tabs — safe],
  partners/index:12 [already sentinel-mapped])
- A2 PDPA retention — must design formal purge vs mig-118 delete
  blocks
- glossary sweep (bare ค่ามัดจำ on customer pages)
- A7 tracking missing on order detail page
- B1 branch picker

## Claude Code → next session / 2026-07-14 — Journey-audit phase CLOSED; decision set recorded

**Journey-audit phase COMPLETE.** The 3-case customer-journey audit set is on origin/staging:
- purchase `8886ddb`, rental `2db625a`, mixed `84857de`
  (`docs/audit/2026-07-11-journey-case1-purchase.md`,
  `2026-07-14-journey-case2-rental.md`, `2026-07-14-journey-case3-mixed.md`).

**Owner decision set recorded (2026-07-14)** in `decisions.md` "2026-07-14 — Post-journey-audit
decision set (owner)": §a KYC UNFROZEN (min-KYC individual/juristic, two channels, rental-only);
§b cancellation-money policy (≥7d self-cancel refund / <7d forfeit / no-show auto-forfeit at 00:00 =
first scheduled job / company-cancel full refund / early-return-in-full / sale claims via Line);
§c ERP foundation (money→documents→tax lines, central tax_treatment, VAT/WHT map, 3 reconciliation
loops, branch- + customer-type-aware); §d customer_tax_profiles (3 creation channels, snapshot at
issuance); §e implementation ordering.

**New routing/rules files:** `docs/MASTER-GAP-MAP.md` (T1–T8 table) and `docs/OPERATING-MODEL.md`
(three-party pipeline, flow-based units, SQL gate, suite-green, walkthrough rules). `docs/BACKLOG.md`
restructured to T-tracks (every prior item preserved + reassigned). `claude.md` session-start rule
updated to read the two new files and prefer the 2026-07-14 set on conflict.

**SUPERSEDED (this note's V3-slice track included):** the V3-0→V3-6 slice description above and in the
2026-07-09 entries is superseded by the `MASTER-GAP-MAP.md` **T1–T8** tracks; KYC freeze (2026-06-16 /
2026-07-09 item 5) is superseded by §a. Do not follow the old V3-slice ordering.

**Active work = T1a** (staff-KYC capture + SUPER ADMIN approve queue, linked via User-ID QR) per
`docs/MASTER-GAP-MAP.md`. Next step is the T1a SQL draft → auditor review BEFORE any migration file.

## Claude Code → (next session) / 2026-07-15
Task: T1a Phase 1 — KYC flow repair (staff QR intake, Super Admin queue + verify/reject/revoke callers, customer id-card rail-move, B6/Y5 acceptance re-walk)
Files touched: 31 (see git status) — 5 new endpoints under server/api/admin/kyc/**, rewritten server/api/user/kyc/id-card.post.ts, migrations 120–124 (applied LOCALLY only), /admin/kyc queue+decision UI, SectionKyc intake fields, 7 test specs.
Status: done, NOT committed — owner is running per-file staging review.
Next: commit per audit; then T1b. Local DB state: migrations 120–124 applied; seeded staff@local.test (staff role); test KYC data present (1 verified profile for customer@local.test, 1 pending walk-in company, 1 pending self-serve, booking d4dbc706 picked_up).
Note: local test-account passwords were reset this session (session-notes only, not recorded in docs).

Remote state (2026-07-15, after owner-ruled cleanup): remote project yzjczvzwmbbeyoodrjwm is CLEAN of test data (856 rows / 41 tables / 13 storage objects deleted, audit: docs/audit/2026-07-15-remote-cleanup-and-migration-sync.md); schema at migration 124 = local parity, zero drift; both append-only guards (086 held-balance, 109 KYC access log) verified live via bite-probes after the gated lifts; DB password rotated by owner.

## Claude Code → (next session) / 2026-07-19
Task: T2 Phase 1 — return settlement (Flow 1) + no-show manual/auto (Flow 2). L1/B9 CLOSED.
Status: done locally, NOT committed (package in audit). Suite 2698/2698.
REMOTE STATE (2026-07-19, post-apply): parity through migration 126, zero drift. The nightly no-show job is LIVE ON PRODUCTION (cron 'rental-no-show-auto-mark', fires 17:00 UTC = 00:00 Bangkok, currently against an EMPTY bookings table). Remote system actor cb62c324-4aac-4392-a253-02294fb459f6 in system_configs.
Original preconditions (now satisfied, kept as history):
  1. Create SYSTEM ACTOR on remote FIRST: Auth Admin API — system@hopnic.internal, email_confirm false, ban_duration 876000h, random discarded password; then system_configs key 'system_actor' = {"user_id": "<new uuid>"}; platform_role stays 'customer'.
  2. pg_cron must be enabled on the remote project (mig 126 does CREATE EXTENSION IF NOT EXISTS).
  3. Then db push --linked (125, 126) + the standard post-apply probes (function/cron-count/boundary/negative-actor).
WARNING — local booking state is TIME-MUTABLE from now on: local pg_cron runs the no-show job nightly (17:00 UTC = 00:00 Bangkok); ANY confirmed booking whose start date passes will flip to no_show automatically. Future sessions must expect this.
Local dev residue (append-only/FK-pinned, intentional):
  - Flow-2 fixtures fa/fb/fc/fd…000000… — all terminal no_show, full chains, residue 0. Bookings pinned by non-deletable ledger rows (086 guard).
  - d4dbc706 + b4aefb41 returned with settlements 81a5d86c (REFUND) / 77f2c6d7 (COLLECT); 1abb5868 no_show (manual pair walk).
  - Pre-T2 legacy bookings with non-zero held residue (aaaa/bbbb/dddd-…119, 6666/7777-…500, e44b1fc4, 681f7610) — §b addendum item 6 no-backfill; NOTE: 681f7610 is status confirmed with a FUTURE start (Sep 4) and WILL be auto-marked by the local cron after that date passes.
  - Local cron job 'rental-no-show-auto-mark' is LIVE locally (fires 17:00 UTC daily).
