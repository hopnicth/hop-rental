# Launch-Readiness Audit — First-Branch Requirements

- **Date:** 2026-07-09 (filed under 2026-07-08 per request)
- **Scope:** R1–R7 first-branch requirements, read-only. No code changes were made.
- **Method:** 7 parallel evidence investigations. Evidence = file paths + line refs + migration reads + actual test runs (`npx vitest run` on the 29 POS/KYC spec files). Where a capability could not be verified in code/schema, it is marked NOT FOUND — nothing in this document is asserted from docs or memory alone.
- **Status:** NOT COMMITTED — tracking decision pending review.

---

## 1. Executive Summary

### Verdict table

| Req | Capability | Verdict |
|---|---|---|
| R1 | Customer tracks rental status end-to-end | **PARTIAL** — all 6 DB states render in customer UI, but badge-only; no timeline, no realtime, zero notifications |
| R2 | POS issues documents to customers | **PARTIAL** — 8 rental docs are real, numbered, printable; sale receipt / tax invoice / rental contract / quotation NOT FOUND; no PDF engine |
| R3 | POS sells items from branch stock | **EXISTS** — POS v1 only; per-branch stock (`sku_branch_inventory`) is source of truth; idempotent decrement RPC + void/restock |
| R4 | POS KYC for walk-in customers | **PARTIAL** — backend (hashing, dedupe, docs, pickup gate) fully built and test-green; POS UI is a dead placeholder; verify/revoke RPCs have zero callers |
| R5 | Staff-on-behalf booking | **EXISTS** — 4 POS creation endpoints across 3 generations, phone/name lookup, `pos_staff_user_id` actor logging, user_id-OR-walk_in_phone verified in schema + code |
| R6 | Legacy sweep | 19 findings — orphaned POS v2 shell (with one live v3 dependency), 5+ orphaned tables, 2 parallel document systems, 2 parallel KYC systems, env-frozen mixed checkout |
| R7 | Branch readiness | **Stock: branch-ready** (NOT NULL + FK). **Money: zero branch dimension.** Bookings: nullable-only, un-FK'd `hub_id`. Enforcement leaky (POS v1 unenforced, fail-open guards) |

### Distance to first-branch launch

- **Genuinely done (single branch):** POS v1 sale from real per-branch stock (guard → decrement → void/restock, tested); staff-on-behalf booking with staff attribution; rental document engine (8 numbered, immutable, printable docs incl. POS auto-issue); walk-in KYC backend (all 14 KYC spec files pass); customer sees every booking state at badge level.
- **Partial — the launch-blocking half is missing:** no fiscal documents (sale receipt / tax invoice are dead "coming soon" buttons; no contract; no quotation) despite the doc engine existing; POS staff have **no screen** to capture walk-in KYC (dead nav buttons, verify/revoke never wired, production enablement explicitly not approved); customer tracking is badge-only with no live updates or notifications; company letterhead settings have no admin UI (hardcoded tax-ID fallbacks in a component).
- **Doesn't exist at all:** any notification infrastructure (email/SMS/push); PDF generation; cash-drawer / POS-session model; per-sale stock movement ledger; branch dimension on money tables (payments, refunds, payment lines).
- **Structural debt:** the only sale-capable POS is v1 (3,734-line legacy page) while v3 — the strategic build — can't sell or do KYC; pos-v2 is an orphaned shell that v3 nonetheless depends on for pickup-readiness; branch access is unenforced exactly where money moves (POS v1) and fails open when the access table is missing. The 18 failing tests are fixture rot, not broken features — but they mask real signal until refreshed.

---

## 2. Per-Requirement Detail

### R1 — Customer can track rental status end-to-end: PARTIAL

**Verdict: PARTIAL.** Customers can see every booking status as a badge on both list and detail pages, but there is no status timeline/stepper, no real-time updates (fetch-on-load only), and no notifications of any kind on status change.

**What works**

- **DB enum is complete (6 values)**, type `public.rental_booking_status`:

  | Value | Migration | Line |
  |---|---|---|
  | `draft`, `confirmed`, `cancelled` | `supabase/migrations/004_catalog_booking_asset_ledger.sql` | 20 |
  | `picked_up`, `returned` | `supabase/migrations/056_admin_walkin_fulfillment.sql` | 3–4 |
  | `no_show` | `supabase/migrations/084_rental_booking_no_show_lifecycle.sql` | 5 |

  Column: `status rental_booking_status NOT NULL DEFAULT 'draft'` (`004:194`).
- **Customer UI renders all 6 states** — no DB state is hidden:
  - Client normalizer mirrors the enum: `app/composables/useBooking.ts:82-92` (`normalizeBookingStatus`).
  - i18n labels for all 6 exist (`rentalsPage.status.*` in `i18n/locales/en.json`): Draft, Confirmed, Picked up, Returned, Cancelled, No-show.
  - List page `app/pages/user/rentals/index.vue`: `ACTIVE_STATUSES = ["draft","confirmed","picked_up"]`, `TERMINAL_STATUSES = ["cancelled","returned","no_show"]` (`:9-10`); label map `:175-177`; badge color map `:179-186`; badges rendered `:423-431` (current) and `:592-600` (historical); contextual "pickup tomorrow" badge `:432`, `:601`.
  - Detail page `app/pages/user/rentals/[bookingId].vue`: `statusText()` `:196-198`; status badge `:390`; deposit-status badge `:391-395`; conditional alerts for `no_show` (`:399-406`, `:610-616`) and cancelled/refunded (`:656-676`).
- Caveat: `picked_up`/`returned`/`no_show` are only ever *set* by admin/POS flows — but they do display when set.

**What's missing**

- **No timeline/stepper** — grep for stepper/timeline/progress in `app/pages/user/rentals/` returned nothing; status is a flat `UBadge`.
- **No realtime, no polling:**
  - Data source is a one-shot query: `app/composables/useBooking.ts:788-792` (`supabase.from("rental_bookings").select("*").eq("user_id", userId)`), triggered by bootstrap/auth-watch (`:1195-1210`); `refreshBookings` (`:674-682`) only called manually (e.g. after cancel, `[bookingId].vue:330`).
  - Detail page fetches once on navigation: `[bookingId].vue:342-349` → `$fetch(/api/user/rental-bookings/${id})` (`:243-245`).
  - Grep for `.channel(`/`subscribe`/`postgres_changes` hits only `useChat.ts`, `useAdminPaymentAlerts.ts`, `useAdminRefundWork.ts` and chat/admin pages — never `useBooking.ts` or the rental pages. No `setInterval` polling either.
  - Consequence: admin marking a booking `picked_up`/`returned`/`no_show` is invisible to the customer until a manual reload.
- **Notifications: NOT FOUND** — no `nodemailer`/`resend`/`sendgrid`/`postmark`/`mailgun`/`smtp`/`twilio`/`fcm`/`web-push` in `package.json` or `server/`; no notifications table in any migration; `server/utils/admin-alerts.ts` is admin-side only; status-transition utils (`rental-booking-no-show.ts`, `rental-booking-confirmation.ts`, POS pickup/return utils) write DB rows/documents but dispatch no customer notification.

---

### R2 — POS: staff can issue documents to customers: PARTIAL

**Verdict: PARTIAL.** A real, non-trivial document subsystem exists (`official_documents` registry, DB-side numbering, immutable snapshots, print pages, company-header settings) — but it covers **rental-lifecycle documents only**. No PDF generation anywhere (browser `window.print()` only), no sale receipt, no tax invoice (explicit "coming soon" placeholder in POS), no rental contract document, no quotation document.

**What works**

- **Document registry:** `official_documents` — `document_type`, `document_no`, status (`draft/issued/printed/voided/replaced`), `template_key`/`template_version`, immutable `snapshot JSONB`, `print_count`, `idempotency_key`, subtotal/vat/total (`supabase/migrations/068_document_foundation_tax_profiles_allocations.sql:213`). Immutability trigger `guard_official_document_finalized_updates` ("document totals are immutable after issue").
- **Numbering:** `document_sequences` table + `f_next_document_number(p_document_type, sequence_key, period, prefix)` → `PREFIX-PERIOD-0001` (`068:129-204`, format at `:204`); service_role-only EXECUTE (`:208-209`). Callers: `server/utils/admin-refunds.ts:401`, `server/utils/customer-rental-booking-detail.ts:566`, `server/utils/rental-booking-no-show-documents.ts:120`.
- **8 rental document types issued today (all working end-to-end):**
  - `rental_pickup_form` / `rental_return_form` — `app/utils/admin-documents.ts:8-11`; templates `rental_pickup_form_a5`/`rental_return_form_a5`, prefixes `PICK`/`RET`; state-guarded issuance in `server/utils/admin-rental-operational-documents.ts` (`assertIssueState`, lines 55-77; pickup guard :59-67 — "Pickup form can be issued only after pickup fulfillment" :65; return guard :68-76). [Re-pinned 2026-07-09 against staging.]
  - `rental_booking_deposit_confirmation` — `server/utils/admin-rental-booking-deposit-confirmation-document.ts:10-13`.
  - `booking_deposit_forfeiture_ordinary_receipt`, `rental_booking_no_show_forfeiture_notice` — `server/utils/rental-booking-no-show-documents.ts:15-18` (explicitly `is_tax_invoice: false` at `:395`).
  - `rental_booking_deposit_refund_confirmation` — `server/utils/admin-refunds.ts:30`.
  - `rental_booking_cancellation_confirmation` — `server/utils/rental-booking-cancellation.ts:28`.
  - Customer-self-issuable: `rental_booking_confirmation` (prefix `RBK`), `rental_booking_deposit_payment_confirmation` (prefix `BDP`) — `server/utils/customer-rental-booking-detail.ts:37-48,566`; endpoint `server/api/user/rental-bookings/[id]/documents/[documentType].post.ts`; UI `app/pages/user/rentals/[bookingId].vue:279-284`.
- **Print routes (browser print, staff + customer):**
  - `app/pages/admin/rental-bookings/[id]/print.vue` — `window.print()` `:65`, `@media print` `:977`; renders pickup/handover + return forms (`:24-27`) from `/api/admin/rental-bookings/[id]/print-form` (`:74`); staff-only (`:8-12`). Ad-hoc print — no document number.
  - `app/pages/admin/documents/[id]/print.vue` — `window.print()` `:240`, `@media print` `:1012`; renders issued `official_documents` snapshots (`:10-16, 55-90`); records printed/reprinted events with reason (`:32`) via `server/api/admin/documents/[id]/events.post.ts`.
  - `app/pages/user/documents/[id]/print.vue` — `window.print()` `:330`, `@media print` `:730`; document_type checks `:42-58`.
  - POS v1 links to pickup/return print: `app/pages/admin/pos.vue:890-892` (`printFormUrl()`).
- **POS async issuance pipeline:** `pos_document_issuance_tasks` (`supabase/migrations/091_pos_document_issuance_tasks.sql:19`; status `pending → issued | failed`; comment `:12` scopes it to `rental_booking_deposit_confirmation`). Driven by `server/utils/pos-rental-booking-deposit-finalizer.ts` (cash + QR); staff retry endpoint `server/api/admin/rental-bookings/[id]/documents/booking-deposit-confirmation/retry.post.ts`. Tests: `tests/server/admin-operational-documents.spec.ts`, `admin-rental-booking-deposit-confirmation-document.spec.ts`, `admin-pos-v3-booking-deposit-payments.spec.ts`, `admin-pos-v3-qr-booking-deposit.spec.ts`.
- **Company info:** `system_configs` key `document_company_profile` (`068:10-22`) + `branch_document_settings` (company name th/en, tax_id, branch_tax_code, addresses, phone, email, logo/stamp paths, footer note — `068:31+`); resolver `resolveDocumentHeaderSnapshot()` in `server/utils/admin-documents.ts:150-180` (branch overrides global, fallback "HOPNIC").
- Staff issuance UI: `app/pages/admin/rental-bookings/[id].vue:50-292` (issue pickup/return forms, no-show forfeiture docs; `documentPrintUrl()` `:240`).

**What's missing (per document type)**

| Document type | Verdict | Evidence |
|---|---|---|
| Sale receipt (ใบเสร็จ) | **NOT FOUND** | `server/api/admin/pos/sales.post.ts` issues no `official_documents` row and calls no numbering function (grep: zero hits). Only rental-money confirmations exist. |
| Tax invoice (ใบกำกับภาษี full/ABB) | **NOT FOUND (dead placeholder)** | POS v1 buttons show "Feature coming soon" — `showPrintPlaceholder()` `app/pages/admin/pos.vue:835-845` ("พิมพ์ใบกำกับภาษี (Full)" / "อย่างย่อ"). POS v2 declares it out of scope (`app/pages/admin/pos-v2/index.vue:700`). Foundation exists (`customer_tax_profiles` 068:61-90, vat columns, `official_documents.tax_profile_id`) but no issuer, no template. `documentNo` in POS history is just `order_number || id` (`server/api/admin/pos/history.get.ts:193,214`) — not an official number. |
| Rental contract (สัญญาเช่า) | **NOT FOUND as printable document** | Only consent-hash records: `agreement_versions` + acceptance logs (`069_legal_agreement_consent_foundation.sql:9`) and booking-deposit-terms acceptance (migration 085). No contract template/print route. |
| Quotation (ใบเสนอราคา) | **NOT FOUND as document** | `checkoutMode: "quotation"` exists on orders (`server/api/orders.post.ts:62,207` — B2B skips payment); i18n promises "A quotation will be sent to your email" (`en.json:787`) but no generation/sending code; `app/components/account/SectionQuotations.vue:2-4` is an explicit "Coming soon UI" placeholder. |
| PDF engine | **NOT FOUND** | No jspdf/pdfmake/puppeteer/pdf-lib/html2canvas/@react-pdf/pdfkit in `package.json`. Only "pdf" hits are upload MIME allowlists (e.g. `server/api/admin/rental-bookings/[id]/documents/index.post.ts`). No mailer infra either. |
| Company-profile admin UI | **NOT FOUND** | Grep for `branch_document_settings`/`document_company_profile` outside server utils hits only `app/types/database.types.ts:1069`. Values must be seeded directly in DB; otherwise hardcoded fallbacks in `app/components/documents/OfficialDocumentHeader.vue` apply — `HOPNIC_TAX_ID = "0105564155415"` (`:5`), address, phone "095-479-2333", email "info@hopnic.co.th". |
| Tax-profile consumption | Captured, never used | `customer_tax_profiles` (068:61-90) with UI `app/components/account/SectionTaxProfile.vue` — but no issued document type populates `official_documents.tax_profile_id`. |

- POS v2 "Documents / Reprint" nav is an admitted placeholder: `app/pages/admin/pos-v2/index.vue:253-257` ("remain future placeholders in this shell").
- POS v3 has no documents workspace page — it exists only as the backend `pos_document_issuance_tasks` pipeline; the "POS V3 Documents workspace" is referenced only in migration comments (091:105-106).

---

### R3 — POS: sell items from branch stock: EXISTS

| Capability | Verdict |
|---|---|
| (a) POS sale flow | **EXISTS** (POS v1 only; v2/v3 are rental-focused) |
| (b) Branch-level stock | **EXISTS** (`sku_branch_inventory` per branch + `inventories` pools) |
| (c) Stock decrement on sale | **EXISTS** (RPC `f_apply_order_inventory`, wired to POS sale and web payment paths) |

**POS page generations**

- **POS v1 — `/admin/pos` (`app/pages/admin/pos.vue`)** — BOTH sale and rental; the only version that creates a sale. Mode switch `type PosTransactionMode = "rental" | "sale"` (`:173`, `:217`). Sale: `createPosSale()` → `POST /api/admin/pos/sales` (`:1916`); failure stores a local draft under `hop-admin-pos-pending-sale:v1` (`:1929`). Rental: `POST /api/admin/pos/bookings` (`:1856`, `:1953`). Supporting endpoints: `pos/branches` (`:1030`), `pos/catalog` (`:1054`), `pos/history` (`:1106`), `pos/booking-blocks` (`:1134`), `pos/history/cancel` (`:859`, void + restock), `pos/accounting-export` (`:572`).
- **POS v2 — `/admin/pos-v2`** — RENTAL only (future booking + pickup). No sale-creation endpoint under `server/api/admin/pos-v2/` (only `rental-bookings.post.ts`, `pickup-readiness.get.ts`, `pickup-complete.post.ts`). Sale: NOT FOUND.
- **POS v3 — `/admin/pos-v3`** — rental workflows + read-only sale-order lookup. Modes `"sale" | "booking" | "kyc"` (`index.vue:31`) but "sale" mode only looks up existing orders: `/api/admin/orders/queue` (`:455`), `GET /api/admin/orders/{id}` (`:507-508`); `AdminPosV3OrderContext.vue` makes zero `$fetch` calls. Sale creation: NOT FOUND (defers to existing order flow / `record-payment`).

**Tables a POS sale writes** (`server/api/admin/pos/sales.post.ts`, auth `requirePlatformAdmin` `:54-55`)

1. `walk_in_customers` upsert when walk-in phone given (`:95`).
2. `orders` insert with POS columns `pos_branch_id/code/name`, `pos_paid_amount`, `pos_payment_method`, `pos_staff_user_id`; `status: isPaid ? "completed" : "confirmed"`, `payment_status: isPaid ? "paid" : "pending_review"` (`:231-268`). POS columns added in `supabase/migrations/059_admin_pos_full_function.sql:35-41`.
3. `order_items` insert (`:278`; rollback deletes the order on failure `:285`).
4. RPC `f_apply_order_inventory` when paid (`:289-299`).

- Pre-insert stock guard: per-branch availability check from `sku_branch_inventory` filtered by `branch_id` and `inventory_kind IN ('sale','shared')`, 409 on shortfall (`:130-148`, `:167-173`).
- `payment_attempts` is NOT written by POS sale — writers are the online payment utils (`server/utils/payments.ts`, `server/api/payments/initiate.post.ts`). No `pos_sessions`/`pos_sales` tables exist (grep of migrations finds only function `f_cancel_pos_sale`, migration 064).

**Branch-level stock schema**

- `sku_branch_inventory` — `supabase/migrations/018_sku_branch_inventory.sql:38-62`: `product_id, sku_id, inventory_kind, branch_id, branch_code, branch_name, on_hand, available, reserved, incoming, safety_stock, notes`; CHECKs `available <= on_hand`, `reserved <= on_hand`, `available + reserved <= on_hand`; `UNIQUE (sku_id, inventory_kind, branch_id)`. Table comment: "Source-of-truth per-branch inventory rows for each SKU."
- `inventories` — `021_multi_inventory_per_branch.sql:9-22`: logical pools per branch (`branch_id REFERENCES store_branches`, one default per branch via partial unique index); `sku_branch_inventory.inventory_id` added `021:79`.
- `inventory_kind` (`sale | rental | shared`) restored in `060_restore_sku_inventory_kind.sql:15`.
- `asset_branch_inventory` — `024_asset_branch_inventory.sql:10-33`: per-inventory rental stock for assets ("Not connected to SKUs").
- Global column is derived only: `product_skus.stock` is a "Compatibility summary … derived from sku_branch_inventory" synced by `sync_product_sku_inventory_summary` (`018:106`) via trigger (`018:164`).

**What decrements stock**

- RPC `f_apply_order_inventory(p_order_id)` — defined migration 050, branch-aware version `062_update_apply_order_inventory.sql:4-68`: locks the order, idempotent via `orders.inventory_applied_at`, per order_item deducts `on_hand`/`available` from `sku_branch_inventory` (`inventory_kind IN ('sale','shared')`, scoped to `orders.pos_branch_id` when set, FIFO by created_at), raises on insufficient stock, re-syncs summaries (`062:31-63`).
- Callers: POS sale (`sales.post.ts:290-295`); Omise web checkout (`server/utils/payments.ts:182` via `applyGatewayResult()` `:153`; failures raise admin alert `inventory_apply_failed` `:186-194`; design in `050_payment_inventory_hook.sql:1-11`); manual slip verification (`server/utils/sale-order-manual-payment.ts:77`, used by `server/api/admin/orders/[id]/record-payment.post.ts`); manual retry (`server/api/admin/orders/[id]/apply-inventory.post.ts:53`; UI `app/pages/admin/orders/[id].vue:254`, `app/pages/admin/alerts/index.vue:87`).
- Reverse/restock on void: `f_cancel_pos_sale` (`064_cancel_pos_sale_restock.sql:11`; stamps `inventory_reversed_at`), called from `server/api/admin/pos/history/cancel.post.ts:32`.

**`/admin/branches-inventory` page** — 3-level manager: branches → inventories → SKU stock rows. Branch CRUD `/api/admin/branches` (`branches-inventory.vue:149, 311-312`); pool CRUD `/api/admin/branches/{id}/inventories` (`:257, 350-351, 396`); stock rows `/api/admin/inventories/{id}/stock` (`:281, 432-433, 477`) — POST writes `sku_branch_inventory` (`server/api/admin/inventories/[inventoryId]/stock/index.post.ts:57`) and logs to `inventory_change_log` (`:78`).

**Caveats / gaps**

- POS v2 and v3 have NO sale-creation capability.
- POS sale records payment as fields on `orders` — no `payment_attempts` row, no cash-drawer/POS-session model.
- `inventory_change_log` (`020:76-88`) is written only by manual admin edits — `f_apply_order_inventory` (062) and `f_cancel_pos_sale` (064) update `sku_branch_inventory` directly with no log insert. **No per-sale stock-movement ledger.** No `stock_movements`/`inventory_transactions` tables exist.
- Tests: `tests/server/admin-pos-api.spec.ts`, `admin-pos.spec.ts`.

---

### R4 — POS: KYC for walk-in customers: PARTIAL

**Verdict: PARTIAL.** Server-side KYC foundation is real, wired, and tested (green); the POS-facing walk-in KYC UI is a dead placeholder; verify/revoke DB RPCs have no application caller; the failing tests are stale-fixture drift in POS *payment* specs, not KYC.

**identity_hash flow — EXISTS (fully implemented)**

- Computed in `server/utils/kyc.ts`:
  - `hashIdentity()` `:99` — hex HMAC-SHA256 keyed by env `KYC_HASH_SECRET` (`:100`); hard-fails if secret missing (`:103`).
  - `normalizeKycIdentity()` `:144` — NFKC, strips dashes/whitespace, asserts `/^\d{13}$/` for national_id/juristic_id, `/^[A-Z0-9]+$/` for passport; error messages carry no PII.
  - `hashKycIdentity()` `:182` — single authorized entry point; HMAC input `v1:${identityType}:${normalizedValue}` (comment `:178`). Calling `hashIdentity` on raw input is documented FORBIDDEN.
- Used for: walk-in profile create + dedupe (`server/api/admin/kyc/profiles/index.post.ts:60,136-162` — never reuses a registered user's profile); lookup-by-identity (`server/api/admin/kyc/profiles/lookup.post.ts:102`); ownership proof on booking attach — re-derives hash, constant-time compare via `timingSafeEqual` (`server/api/admin/rental-bookings/[id]/kyc-attach.post.ts:182-200`; "A bare profileId is NEVER sufficient" `:45`). Never returned to clients (`server/utils/kyc-profile-view.ts:12,64` whitelist mapper strips it).
- Stored/indexed: `supabase/migrations/105_kyc_foundation.sql:81` (`identity_hash text NOT NULL`), index `:168-169`.

**KYC schema — EXISTS**

- `kyc_profiles` (`105:73` — CREATE TABLE; re-pinned 2026-07-09): `user_id uuid NULL` — "supports registered users AND walk-in customers"; `customer_type`/`identity_type` enums; `identity_hash` + `identity_last4` (no plaintext ID); `branch_id`; `walk_in_phone`; `status` (pending/verified/rejected/expired/revoked); verify/reject/revoke audit columns.
- `kyc_documents`: `kyc_profile_id` FK, `document_type` enum, private `storage_path`; migration 108 adds passport type + mime/size.
- `kyc_pickup_overrides`: super_admin-only booking exception audit; UPDATE blocked by trigger (`111_kyc_pickup_overrides_block_update.sql`).
- Booking link: `106_kyc_booking_link_and_pickup_snapshot.sql` — `rental_bookings.kyc_profile_id` ("must never be populated by phone matching") + pickup-time KYC snapshot columns on `rental_booking_fulfillments`.
- 109/110: private bucket `kyc-profile-documents` (10 MB) + append-only `kyc_document_access_log`.
- `112_kyc_verification_decisions.sql`: immutable decision audit + SECURITY DEFINER RPCs `verify_kyc_profile` (`:192`) and `revoke_kyc_profile` (`:304`).
- User-vs-walk-in resolution + pickup gate: `server/utils/rental-fulfillment.ts:221-249` — registered by `user_id`, walk-in by `rental_bookings.kyc_profile_id`; walk-in with null profile → blocked. Live expiry check `computeKycReadiness` (`server/utils/kyc.ts:200`).

**POS UI — dead placeholder; separate admin page is wired**

- POS v3 (`app/pages/admin/pos-v3/index.vue`): `"kyc"` mode exists (`:31`) with nav button (`app/components/admin/pos/AdminPosV3ModeNav.vue:31-34` — "Customer registration and identity work will plug in later") but **no panel renders for kyc mode** — every mode-gated block checks `activeMode === 'booking'` only (`:773, 790, 807, 880, 932, 944`); scope alert `:700`: "…KYC, and fiscal workflows are not implemented here."
- POS v2 (`app/pages/admin/pos-v2/index.vue:246-248`): "Customers / KYC" tile — "Lookup, walk-in creation, KYC capture, and tax profiles will be layered in later phases." It does display live KYC status from the wired pickup-readiness endpoint (`:1005`).
- POS v1 (`app/pages/admin/pos.vue`): wired **legacy** ID-card upload for registered users — `/api/admin/customers/id-card` (`:1520`), signed-url viewer (`:1555`), legacy `kyc-documents` bucket + `users.kyc_status` badge (`:300-319, 2433-2471`). This is the old users-embedded flow, not `kyc_profiles`.
- Wired non-POS admin UI: `app/pages/admin/kyc/index.vue` — `/api/admin/kyc/profiles/lookup` (`:130`), create-pending `/api/admin/kyc/profiles` (`:91`); `app/components/admin/kyc/AdminKycDocumentsPanel.vue` wired to documents list/upload/download (`:77, 146, 178`). **Walk-in phone capture in this form: NOT FOUND** (sends customerType/identityType/identityValue only).
- No UI caller for `kyc-attach` — grep in `app/` returns nothing; booking-attach is API-only.

**"Slice ②" — NOT FOUND as a marker; endpoints are functional**

- Literal "Slice ②" appears nowhere in the repo; "Slice" hits are unrelated home/partners plan docs. The KYC plan `docs/kyc-pos-v3-design.md` ("LOCKED", 2026-05-30) uses TASK/Phase numbering.
- The only "frozen" marker is a business rule, not a stub: `KYC_ATTACH_FROZEN_AFTER_PICKUP` — 409 once booking is past pickup (`kyc-attach.post.ts:178`).
- Walk-in KYC endpoints — all functional, none throw 501/TODO, none commented out: `admin/kyc/profiles/index.post.ts`, `lookup.post.ts`, `[id]/documents.{get,post}.ts`, `admin/kyc/documents/[id]/download.get.ts` (super_admin proxy), `admin/rental-bookings/[id]/kyc-attach.post.ts`, pickup gate via `admin/pos-v2/rental-bookings/[id]/pickup-readiness.get.ts` → `loadRentalPickupReadiness`.
- Genuine gaps: (a) `verify_kyc_profile`/`revoke_kyc_profile` exist in DB (112) and generated types (`app/types/database.types.ts:7798,7860`) but **zero callers** in `server/` or `app/`; (b) production enablement of document upload/download explicitly NOT approved (`docs/kyc-production-enablement-checklist.md` §0: "staging-ready… Production enablement is NOT approved").

**Test triage (actual run of all 29 POS/KYC specs)**

Result: **Test Files 4 failed | 25 passed (29); Tests 18 failed | 848 passed (866).** **All 14 KYC spec files pass** (kyc.spec, kyc-attach-api, kyc-profile-create/lookup, kyc-document-upload/download + h3 integrations, admin-kyc-documents-*, user-kyc-api, company-kyc-api). All failures are stale fixtures behind evolved implementations — none are TDD-ahead-of-unbuilt-features:

1. `admin-pos-v3-remaining-security-deposit-payments.spec.ts` — 12 fail: `TypeError: adminClient.from(...)...not is not a function` at `remaining-security-deposit-payments.post.ts:226` — endpoint added `.not("gateway_charge_id", "is", null)`; the spec's Supabase mock never implemented `.not()`. Mock drift; endpoint implemented.
2. `admin-pos-v3-qr-webhook.spec.ts` — 4 fail: webhook (`server/api/webhooks/omise.post.ts:244-329`) now fans out by `payment_purpose`; fixture `basePosAttempt` (spec `:188-198`) has no `payment_purpose` → unknown-purpose branch. Fixture predates the fan-out; the dedicated purpose specs pass.
3. `admin-pos-v2-rental-bookings.spec.ts` — 1 fail: `startDate cannot be in the past` — fixture hardcodes `"2026-05-21"` (spec `:120`); today is 2026-07-09. Date rot.
4. `pos-v2-pickup-completion.spec.ts` — 1 fail: server (`server/utils/pos-v2-rental-pickup-completion.ts:185-191`) now credits an extra 200 vs the old fixture (both `booking_deposit_paid_amount: 200` and `deposit_paid_amount: 200` set). Deposit-credit arithmetic drift.

---

### R5 — Staff-on-behalf booking: EXISTS

**Verdict: EXISTS.** Staff can create rental bookings on behalf of customers via three generations of POS endpoints, all admin-gated, all wired to admin UI, with actor logging via `pos_staff_user_id`.

**Creation endpoints** (no generic `POST /api/admin/rental-bookings` exists — that directory has only `index.get.ts`, `[id].get.ts`, `[id].patch.ts`; creation lives in POS routes):

| Endpoint | Status created | Identity | Actor | Notes |
|---|---|---|---|---|
| `server/api/admin/pos/bookings.post.ts` (v1) | `confirmed` (`:307`) + immediate deposit fields (`:308-317`) | `userId` OR `walkInPhone`/`bookerPhone` (`:120-123`); 422 if neither (`:129-134`); upserts `walk_in_customers` (`:218-231`) | `pos_staff_user_id: adminUserId` (`:321`) | Guard `requirePlatformAdmin` (`:116-117`). Validates dates (`:91-112`), active branch (`:156-167`), active asset (`:169-185`), min/max days (`:188-195`), rate > 0 (`:197-203`), availability (`assertRentalBookingAvailability` `:267-271`). Does NOT pre-validate userId existence (FK only). |
| `server/api/admin/pos-v2/rental-bookings.post.ts` | `confirmed` (`:300`) | same rule (`:130-140`); walk-in upsert (`:235-246`) | `pos_staff_user_id` (`:315`) | Extra: staff branch access check (`:106-121`, "No POS access for selected branch") |
| `server/api/admin/pos-v3/rental-bookings/drafts.post.ts` | `draft` (`:367`) | rule at `:180-184`; validates customer exists (`:128-141`) | `pos_staff_user_id` (`:384`) | Branch access check (`:105-121`) |
| `server/api/admin/pos-v3/rental-bookings/same-day.post.ts` | `confirmed` (`:368`) | rule at `:181-184`; customer existence (`:129-141`) | `pos_staff_user_id` (`:385`) | Enforces today start (`SAME_DAY_RENTAL_REQUIRES_TODAY_START_DATE` `:203`); asset-at-branch check (`:256-257`) |

**Customer lookup — EXISTS:** `server/api/admin/customers/lookup.get.ts` (`requirePlatformAdmin` `:44`): `users` by phone or full_name ilike (`:59-64`); `walk_in_customers` by phone or linked_user_id (`:79-92`); returns recent bookings (`:94-138`). **Email lookup: NOT FOUND.** Also `server/api/admin/customers/id-card.post.ts` for ID-card upload.

**Actor logging — EXISTS (POS-specific; no generic audit_log):**

- `rental_bookings.pos_staff_user_id UUID REFERENCES public.users(id)` — `supabase/migrations/059_admin_pos_full_function.sql:61` (plus `pos_branch_id/code/name` `:58-60`); populated by all four endpoints.
- `rental_booking_deposit_action_logs.staff_user_id` — `061_rental_booking_deposit_action_logs.sql:7`.
- No `created_by` on `rental_bookings`; no generic `audit_log` table. Audit is domain-event tables carrying `staff_user_id`: `rental_held_balance_events` (086:17), `rental_booking_no_show_events` (084), `rental_booking_cancellation_events` (081), `document_events` (068:337).

**Admin UI — WIRED:** `app/pages/admin/pos.vue` — lookup `:1252`; booking POSTs `:1856, 1953`. `app/pages/admin/pos-v2/index.vue` — lookup `:387`; create `:454`. `app/pages/admin/pos-v3/index.vue` — same-day `:149`; lookup `:452`. `app/components/admin/pos/AdminPosV3FutureBookingDraftContainer.vue` — draft POST `:329`.

**`user_id OR walk_in_phone` — VERIFIED (schema + code):** schema CHECK `rental_bookings_customer_ref_chk (user_id IS NOT NULL OR walk_in_phone IS NOT NULL)` — `057_admin_pos_booking_deposits.sql:19-21` (drops NOT NULL on user_id `:3-4`); same pattern for `orders` (`059:44-47`). Enforced pre-insert with 422 in all four endpoints; endpoints null out `walk_in_phone` when `user_id` present (e.g. `pos/bookings.post.ts:279`).

**Minor gaps:** no email lookup; no `created_by` on `rental_bookings` (actor captured only for POS-created rows); POS v1 does not pre-validate `userId` existence.

---

### R7 — Branch readiness: gap surface

**Branches table — EXISTS:** `public.store_branches` — `supabase/migrations/020_branch_business_fields_and_inventory_log.sql:6-19` (guarded CREATE; comment `:4` says 019 should have created it but 019 only FKs to it, `019:190`). Columns: `id TEXT PK, code UNIQUE, name_th/en, is_active, sort_order, timestamps` (`020:7-14`) + `address_th/en, phone, email, latitude, longitude, notes` (`020:28-35`). **Single seeded branch `'branch-hq'`** (`020:46-61`). RLS + service-role-only policy (`070_security_first_schema_hardening.sql:19,56-59`).

**Branch scoping per table**

| Table | Branch column |
|---|---|
| **MONEY** | |
| `orders` | PARTIAL — none at creation (`007_orders_schema.sql:28`); later `pos_branch_id` nullable (`059:36`), `pickup_branch_id` nullable pickup-mode-only (`083_admin_sale_order_queue_foundation.sql:18`). Online sale orders have NO branch. |
| `order_items` | ABSENT (`007:61`) |
| `payment_attempts` | ABSENT (`049_payment_schema.sql:32`; zero "branch" matches in 049) |
| `payment_refunds` | ABSENT (`081_customer_cancellation_refund_foundation.sql:78`) |
| `rental_booking_payment_lines` / `_deposit_lines` / `rental_booking_payment_attempts` | ABSENT (`074:4`, 075, `076:4`) |
| `rental_held_balance_events` (money-hold ledger) | `branch_id` TEXT **nullable** (`086:16`) |
| `manual_payment_requests` (+items/slips) | ABSENT (`115:52,81,100`) |
| **STOCK** | |
| `sku_branch_inventory` | `branch_id` NOT NULL (`018:43`; FK `019:190`) |
| `inventories` | `branch_id` NOT NULL FK (`021:11`) |
| `asset_branch_inventory` | `branch_id` NOT NULL, trigger-synced (`024:14,54-75`) |
| `inventory_change_log` | `branch_id` NOT NULL (`020:80`) |
| `products` / `product_skus` | ABSENT — global catalog (`004:55,104`); scoping delegated to inventory tables |
| **BOOKINGS** | |
| `rental_bookings` | PARTIAL — `hub_id` free TEXT, **no FK**, nullable (`004:182`); `pos_branch_id` nullable (`059:58`); `pickup_branch_id`/`return_branch_id` nullable (`073:14-15`). No NOT NULL branch. |
| `rental_assets` (legacy ledger) | `hub_id` free TEXT, no FK (`004:215`) |
| `assets` | `storage_branch_id` nullable (`023:103`) |
| `rental_booking_fulfillments` | `branch_id` nullable (`073:7`) |
| `rental_booking_deposit_action_logs` | `branch_id` nullable (`061:8`) |
| **POS** | |
| `pos_rental_payment_attempts` | `branch_id` nullable (`087:14`) |
| `pos_document_issuance_tasks` | ABSENT (`091:19`) |
| **PEOPLE** | |
| `users` | ABSENT — no branch/home-branch column (`001_rbac_schema.sql:18`) |
| `admin_user_branch_access` | EXISTS — `(user_id, branch_id) PK, can_pos` (`059:14-22`), RLS service-role-only (`070:18,49-52`) |
| **OTHER** | `branch_document_settings` (`068:31-32`); `official_documents.branch_id` nullable (`068:218`); KYC verifications `branch_id`/`verified_branch_id` nullable (`105:85,94,146`) |

**Code-level enforcement — inconsistent, mostly soft**

- Enforced: `server/api/admin/pos/history.get.ts:77-114` (staff limited to `admin_user_branch_access` branches, 403); `pos-v2/rental-bookings.post.ts:104` and `pos-v3/rental-bookings/same-day.post.ts:103-111` (`assertPosBranchAccess`) on create; `server/utils/rental-fulfillment.ts:165-189` (`assertBranchAccess`), `server/utils/rental-pickup-readiness.ts:428-436`, `server/utils/admin-documents.ts:94-110`.
- Weaknesses:
  - **POS v1 create endpoints skip the access check**: `server/api/admin/pos/sales.post.ts:55-90` and `pos/bookings.post.ts:117` only call `requirePlatformAdmin` + verify branch is active — any staff can transact at ANY branch via v1.
  - **Silent fail-open**: `rental-fulfillment.ts:180`, `admin-documents.ts:110`, `branch-access.get.ts:44` all continue if `admin_user_branch_access` is missing (42P01) — access check degrades to no-op.
  - Super_admin bypass at `rental-fulfillment.ts:171` (expected; only `can_pos` staff rows gate anything).
  - **hub_id/branch_id vocabulary split**: booking `hubId` (unconstrained TEXT from 004) is passed as `p_branch_id` into document/ledger writes — `server/utils/customer-rental-booking-detail.ts:571,606`, `server/utils/admin-refunds.ts:402,460` — no FK guarantees these are real branches.
  - Money reads/writes have no branch filter anywhere in `server/api/` — 156 `branch_id` grep hits are all inventory/POS/fulfillment, none on payment or refund queries.

**Summary:** stock is genuinely branch-scoped (NOT NULL + FK + triggers). Everything else is single-branch-shaped: money tables have zero branch dimension; bookings/orders carry only nullable, POS-only or fulfillment-only branch columns; `hub_id` is un-FK'd legacy text; staff-branch mapping exists but is enforced inconsistently; `users` has no home branch. One hardcoded branch (`'branch-hq'`) is the de facto default.

---

## 3. R6 — Legacy Sweep (the Augment era)

Findings ordered by relevance to POS / KYC / documents / bookings. Inventory only — nothing deleted or modified.

### A. POS route generations

1. **`/admin/pos-v2` page is orphaned from navigation — a half-built "phased shell."** Admin nav (`app/layouts/admin.vue:94-95`) links only `POS` → `/admin/pos` and `POS V3` → `/admin/pos-v3`. Nothing points to `/admin/pos-v2` except its own sidebar self-link (`app/pages/admin/pos-v2/index.vue:225`). The 1,275-line page self-describes as scaffolding: "queue placeholders" (`:223`), "Pickup completion, return, and settlement remain later phases" (`:232`), "Lookup, walk-in creation, KYC capture, and tax profiles will be layered in later phases" (`:248`), "Operational documents and reprint/download tools remain future placeholders" (`:256`), "Phase 4B2 guardrail… Fiscal documents, return, settlement, refunds, and tax invoice/ABB flows remain out of scope" (`:699-700`).
2. **Six POS components used ONLY by the orphaned pos-v2 page:** `AdminPosHeader.vue`, `AdminPosQueueCards.vue`, `AdminPosQuickLookup.vue`, `AdminPosScanPanel.vue`, `AdminPosShell.vue`, `AdminPosSidebar.vue` in `app/components/admin/pos/` — each has exactly one consumer, `app/pages/admin/pos-v2/index.vue` (verified by grep across app). They die with the page.
3. **pos-v2 API is half-orphaned, but one endpoint is a live POS v3 dependency.** `server/api/admin/pos-v2/rental-bookings.post.ts` and `.../[id]/pickup-complete.post.ts` (plus `server/utils/pos-v2-rental-pickup-completion.ts`) are called only from the orphaned pos-v2 page (`index.vue:577`). However `.../[id]/pickup-readiness.get.ts` is actively used by POS v3 (`app/pages/admin/pos-v3/index.vue:215, 374`) — the "v2" namespace cannot be treated as uniformly dead.
4. **`/admin/walk-in` is an 11-line redirect stub** with zero inbound links: `app/pages/admin/walk-in.vue:7` → `navigateTo("/admin/pos", { replace: true })`.
5. **POS v3 ships half-built modes.** `app/components/admin/pos/AdminPosV3ModeNav.vue:17-36` offers "sale" ("entry point for later phases") and "kyc" ("will plug in later") buttons, but `app/pages/admin/pos-v3/index.vue` renders content only for booking mode (`:807`) with a Phase-1 scope banner (~`:700`): "Completion, sale checkout, KYC, and fiscal workflows are not implemented here."
6. **POS v1 (`app/pages/admin/pos.vue`, 3,734 lines) is still the primary nav "POS"** — not dead, but sole consumer of the entire legacy API set: `api/admin/pos/sales`, `pos/bookings`, `pos/history`, `pos/history/cancel`, `pos/accounting-export` (verified per-endpoint grep). If v3 replaces v1, this whole namespace plus `walk_in_customers`-based booking creation goes with it.

### B. Documents / print

7. **`server/api/admin/documents/preview.post.ts` has zero frontend callers.** Only reference is a source-inspection test string (`tests/server/admin-operational-documents.spec.ts:525`). `issue.post.ts` and `[id].get.ts` are live (`app/pages/admin/rental-bookings/[id].vue:334`); preview is dead surface.
8. **Two parallel print/document systems coexist** (duplicate implementation, both alive): legacy operational print form (`app/pages/admin/rental-bookings/[id]/print.vue` + `server/api/admin/rental-bookings/[id]/print-form.get.ts` + `server/utils/admin-rental-print-form.ts`; used by POS v1 `pos.vue:891` and v3 pickup `AdminPosV3PickupContainer.vue:235`) vs. the official-documents system (`app/pages/admin/documents/[id]/print.vue`, `app/pages/user/documents/[id]/print.vue`, `server/utils/admin-documents.ts`; used by refunds, pos-v3 deposit containers, rental-bookings detail).
9. **No-nav admin pages:** `/admin/manual-payment-requests` reachable only via a server-generated notification link (`server/utils/manual-payment-request.ts:707`); `app/pages/admin/role-assignment.vue` (154 lines) has zero references anywhere — URL-only access.

### C. KYC

10. **KYC verify/revoke decision flow exists only in the database — no application caller.** `supabase/migrations/112_kyc_verification_decisions.sql` creates `kyc_verification_decisions` (`:53`) and RPCs `verify_kyc_profile` (`:192`) / `revoke_kyc_profile` (`:304`). Zero `.rpc(...)` calls in app or server. Corroborated by `DECISIONS.md:103`: "KYC frozen — reject/renewal/purge/delete lifecycle, POS V3, staff_on_site, and user-account linking remain out of scope until resume."
11. **Two parallel walk-in identity-capture systems.** Legacy: `server/api/admin/customers/id-card.post.ts` + `id-card/signed-url.get.ts` (uploads to `kyc-documents` bucket) — consumed only by POS v1 (`pos.vue:1555`). Current: `server/api/admin/kyc/profiles/**` + `app/pages/admin/kyc/index.vue` + `AdminKycDocumentsPanel.vue`. Both live; the legacy path dies if POS v1 is retired.

### D. Orphaned / DB-only tables (migration cross-check)

12. **`rental_assets`, `rental_booking_assets`, `rental_asset_events` — fully orphaned.** Created `004_catalog_booking_asset_ledger.sql:211, 231, 251`; no other migration touches them; zero references in app/ or server/ (excluding generated `database.types.ts`). Superseded by the `assets` lineage (`rental_accesses` renamed to `assets`, `025_rename_rental_access_to_assets.sql:23`). Never dropped. **Note: CLAUDE.md still lists `rental_assets` as a "key table" — it is not; code uses `assets`.**
13. **`payment_allocations` — schema-only, never written.** Created `068:361`; referenced across migrations 073/077/078/079/081 (constraints/policies) but zero code references and no `INSERT INTO public.payment_allocations` anywhere, including inside DB functions. (Distinct from `mixed_payment_allocations`, which IS used.)
14. **Legal-agreement foundation (069) is half-wired.** `agreement_versions` (`069:9`) is read via `f_get_active_agreement_version` (`server/utils/rental-booking-deposit-payment.ts:106`) but nothing ever inserts rows. `agreement_evidence_files` (`069:423`) has zero references. Only `agreement_acceptance_logs` is written by code (`rental-booking-deposit-payment.ts:173-196`).
15. **`asset_documents` and `asset_service_events` — zero code references.** Created `013_asset_schema.sql:173` and `:153`, renamed in 025, never touched by app/server code (sibling `asset_matches` IS used, e.g. `server/api/admin/assets/[id]/matches/index.get.ts:40`).
16. **DB-internal-only (not orphaned, but no app code touches them):** `asset_filter_options` (`043_auto_sync_filter_options_from_tags.sql:28`, trigger-maintained); `document_sequences` (`068:129`, used via `f_next_document_number` RPC). `sku_branch_inventory_new` is a false positive — rename artifact inside `019_clean_catalog_refactor.sql:244`.

### E. Feature-flag-frozen and misc

17. **Mixed checkout is an entire surface frozen behind an env flag defaulting OFF.** `nuxt.config.ts:25-32` (`mixedCheckoutEnabled` only true when env var set); all `server/api/mixed-checkout/**` endpoints throw `MIXED_CHECKOUT_DISABLED` otherwise (`server/utils/mixed-checkout.ts:115-120`). Pages `app/pages/mixed-checkout/[sessionId].vue` + `result.vue` exist, plus `mixed_checkout_sessions`/`mixed_payment_*` tables. Known-incomplete: TODO on concurrency lock at `server/utils/mixed-checkout-finalization.ts:489`.
18. **`app/pages/rental-booking-payment/[bookingId].vue` has no in-app entry link** — only reachable via `result.vue:9` redirect, itself targeted only by the Omise return URL built server-side (`server/utils/rental-booking-deposit-payment.ts:242`). Live but externally-driven.
19. **"Legacy" naming in an active path:** `ADMIN_ASSET_DETAIL_SELECT_LEGACY` (`server/utils/admin-asset.ts:12`) is still the select used by all `server/api/admin/assets/*` endpoints — signal of an unfinished migration, not dead code.

**Component cross-check:** every other component in `app/components/admin/` (checklists, deposit slips, handover items, signature pad, QR scanner, content editors) has at least one live consumer — no additional orphaned components found. Test files for pos-v2 still exist (`tests/server/admin-pos-v2-*.spec.ts`, `pos-v2-pickup-completion.spec.ts`), so the v2 surface is test-maintained despite having no UI entry point.

---

## 4. Appendix — Raw Evidence Notes

### A. R1 — supporting detail

- Enum quotes: `004:20` `CREATE TYPE rental_booking_status AS ENUM ('draft', 'confirmed', 'cancelled');` · `056:3-4` `ALTER TYPE public.rental_booking_status ADD VALUE IF NOT EXISTS 'picked_up' / 'returned';` · `084:5` `... 'no_show';`
- Realtime grep scope: `.channel(` / `subscribe` / `postgres_changes` matched only `app/composables/useChat.ts`, `useAdminPaymentAlerts.ts`, `useAdminRefundWork.ts`, chat/admin pages. Zero matches in `useBooking.ts` or `app/pages/user/rentals/*`.
- Notification grep scope: `nodemailer|resend|sendgrid|postmark|mailgun|smtp|twilio|fcm|web-push` — zero hits in `server/` and `package.json`. No `CREATE TABLE ... notification(s)` in any migration.

### B. R2 — supporting detail

- Only "pdf" matches in the repo are upload MIME allowlists (e.g. `server/api/admin/rental-bookings/[id]/documents/index.post.ts` — `ALLOWED_MIME = ... "application/pdf"` for staff-uploaded repair/fine/damage evidence).
- Hardcoded letterhead fallbacks (`app/components/documents/OfficialDocumentHeader.vue`): `HOPNIC_TAX_ID = "0105564155415"` (`:5`), address "888/8 ม.1 ต.พนมสารคาม…" (~`:45`), phone "095-479-2333", email "info@hopnic.co.th"; `@media print` at `:147`.
- `official_documents` statuses: `'draft','issued','printed','voided','replaced'` (068:213 block).
- POS history "documentNo" is `order_number || id` — `server/api/admin/pos/history.get.ts:193,214` — not an `official_documents` number.
- Document tests: `tests/server/admin-operational-documents.spec.ts`, `admin-rental-booking-deposit-confirmation-document.spec.ts`, `admin-pos-v3-booking-deposit-payments.spec.ts`, `admin-pos-v3-qr-booking-deposit.spec.ts`.

### C. R3 — supporting detail

- POS v1 supporting endpoint calls in `app/pages/admin/pos.vue`: branches `:1030`, catalog `:1054`, history `:1106`, booking-blocks `:1134`, cancel `:859`, accounting-export `:572`; sale POST `:1916` (local pending-sale draft key `hop-admin-pos-pending-sale:v1`, `:1929`); rental POSTs `:1856, 1953`.
- `f_apply_order_inventory` behavior (`062:4-68`): locks order → idempotency via `orders.inventory_applied_at` → per order_item deducts from `sku_branch_inventory` rows (`inventory_kind IN ('sale','shared')`, scoped to `orders.pos_branch_id` when set, FIFO by created_at) → raises on insufficient stock → re-syncs `product_skus.stock` summaries (`062:31-63`).
- Restock: `f_cancel_pos_sale` (`064:11`) adds back on_hand/available, stamps `inventory_reversed_at`; caller `server/api/admin/pos/history/cancel.post.ts:32`.
- `inventory_change_log` writers (manual admin edits only): `server/api/admin/inventories/[inventoryId]/stock/*.ts:78/83/47`, `server/api/admin/products/[productId]/skus/[skuId]/inventory/*.ts:63/99/52`.
- POS v3 order-lookup surface: `app/pages/admin/pos-v3/index.vue:455` (`/api/admin/orders/queue`), `:507-508` (`GET /api/admin/orders/{id}`); `AdminPosV3OrderContext.vue` makes zero `$fetch` calls (display only).

### D. R4 — supporting detail

- Test command scope: 29 spec files matching pos/kyc under `tests/server/`, run with `npx vitest run` on those files only. Passing KYC specs include: `kyc.spec.ts`, `kyc-attach-api.spec.ts`, kyc-profile-create/lookup, kyc-document-upload/download (+ h3 integration variants), `admin-kyc-documents-*`, `user-kyc-api.spec.ts`, `company-kyc-api.spec.ts`.
- Failure messages (verbatim excerpts): `TypeError: adminClient.from(...).update(...).eq(...).not is not a function` (remaining-security-deposit `:226`); expected `posRentalQr: true` got `{ok: true, …}` (qr-webhook; fixture `basePosAttempt` spec `:188-198` lacks `payment_purpose`); `Error: startDate cannot be in the past` (fixture date `2026-05-21`); `Collected amount must equal server-calculated pickup due 5600` vs test's 5800 (fixture sets `booking_deposit_paid_amount: 200` AND `deposit_paid_amount: 200`; server credits both at `pos-v2-rental-pickup-completion.ts:185-191`).
- KYC production gating: `docs/kyc-production-enablement-checklist.md` §0 — "staging-ready… Production enablement is NOT approved."
- KYC plan doc: `docs/kyc-pos-v3-design.md` ("LOCKED", 2026-05-30), TASK/Phase numbering — no "Slice" markers.
- Generated-type presence of unwired RPCs: `app/types/database.types.ts:7798` (`verify_kyc_profile`), `:7860` (`revoke_kyc_profile`).

### E. R5 — supporting detail

- Deposit-override logging: POS v1 logs deposit overrides to `rental_booking_deposit_action_logs` with `staff_user_id` (`pos/bookings.post.ts:376-400`).
- `orders` customer-ref CHECK mirror: `059_admin_pos_full_function.sql:44-47`.
- `server/api/admin/users/` contains only `role.patch.ts` — no user search endpoint there.

### F. R7 — supporting detail

- `store_branches` seed: `'branch-hq'` (`020:46-61`, id at `:51`).
- Branch-access fail-open sites: `server/utils/rental-fulfillment.ts:180`, `server/utils/admin-documents.ts:110`, `server/api/admin/pos/branch-access.get.ts:44` — all continue/no-op on Postgres 42P01 (table missing).
- hub_id-as-branch_id call sites: `server/utils/customer-rental-booking-detail.ts:571,606`; `server/utils/admin-refunds.ts:402,460`.
- Grep scope note: 156 `branch_id` hits in `server/` are all inventory/POS/fulfillment/document paths; zero on `payment_attempts`/`payment_refunds` queries.

### G. Cross-cutting corrections to project docs (observed, not applied)

- `CLAUDE.md` lists `rental_assets` among "key tables" — orphaned since migration 025; live table is `assets`.
- `CLAUDE.md` says "104 SQL migration files" — migrations observed up to at least 115 (`115_...` manual_payment_requests).
- The task brief's "frozen Slice ② endpoints" and "20 failing POS/KYC tests" both resolve differently in code: no Slice markers exist (KYC plan uses TASK/Phase), and the actual failure count is 18 tests / 4 files, all stale-fixture drift (see §2 R4).
