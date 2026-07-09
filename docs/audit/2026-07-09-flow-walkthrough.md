# End-to-End Flow Walkthrough Audit (live, browser-driven)

- **Date:** 2026-07-09 (session ran into 2026-07-10 local time)
- **Method:** LIVE walkthrough — real UI clicked in a browser (Playwright MCP) against `localhost:3000` on the **local** Supabase stack, as a real customer and real staff. Code/schema were read only to explain *why* a step failed, after observing the failure.
- **Roles:** two sessions in one browser context — customer (`customer@local.test`) and super_admin (`admin@local.test`), switched by logout/login.
- **Scope lock honored:** no repo files modified. Only new files created: this audit + screenshots under `docs/audit/screenshots/flow-walkthrough/`. Local DB writes (orders, slips, seed rows) were made through the UI / logged ad-hoc SQL — that is expected. No commits, no push. Off-limits files untouched.
- **Verdicts:** PASS (works end-to-end) · PASS-DIRTY (works but violates an accounting/glossary/UX rule) · BLOCKED (UI exists, action fails) · MISSING (no path) · WORKAROUND (continued via admin/logged SQL).

---

## 1. Environment Report (safety gate)

| Check | Result |
|---|---|
| Dev server target | **Forced LOCAL** via `nuxt dev --dotenv .env.local` → `SUPABASE_URL=http://127.0.0.1:54321`. ⚠️ Default `npm run dev` (plain `nuxt dev`) loads `.env` = **remote production-like** `yzjczvzwmbbeyoodrjwm.supabase.co`; **not used**. `.env.local` verified a complete superset of `.env` (all keys present + `SUPABASE_SERVICE_KEY`). |
| Omise keys | **TEST MODE** — `pkey_test_…` / `skey_test_…` in both env files (mode prefix only read; values redacted). No live keys anywhere. |
| Local Supabase | Healthy — API 54321, DB 54322, Studio 54323, Mailpit 54324; **117 migrations applied**. |
| Seed: sale product w/ stock | ✅ existed — 22 SKUs with stock; 22 branch-inventory rows available. |
| Seed: active branch | ✅ existed — 4 active `store_branches` (branch-hq/HQ, store-001/BKK, branch-e12b7a81/LKB, store-002/RYG). |
| Seed: rental asset | ❌ 0 → **seeded** `AST-LOCAL-001` (`local-test-excavator`) at branch-hq, ฿500/day, deposit ฿2,000, available 2 (Appendix 1). |
| Seed: staff + customer accounts | ❌ 0 auth users → **seeded** `customer@local.test` + `admin@local.test` (super_admin), password `<local-test password — session notes only>` (Appendix 1). |
| Browser tooling | Playwright MCP, viewport 1440×900. Two sessions (customer + staff) via logout/login (single context). |

**Seeding notes (all in Appendix 1):** GoTrue login initially 500'd (`Database error querying schema`) because manually-inserted `auth.users` rows left token columns NULL — fixed by setting them to `''` (a Supabase-local seeding artifact, **not** an app bug). A default shipping address was seeded via SQL after the account address form's Save button would not enable under automation (see Low-confidence list).

---

## 2. Flow A — Online purchase (customer + staff)

| Step | Verdict | What happened | Evidence |
|---|---|---|---|
| A1 Browse → add sale to cart | **PASS** | Catalog renders with facets (3M, Bosch…). Opened "สว่านโรตารี่ Bosch ชุดคิท", clicked "เพิ่มลงตะกร้า"; cart shows 1 item ฿6,900. | `A1-catalog.png`, `A1-A3-cart-shipping.png` |
| A2 Mixed cart (pickup-at-branch + shipping removed) | **BLOCKED** | Could not test the mixed case: a rental item cannot be added to the cart at all (see B2 — customer rental draft insert 400s). With no rental line, pickup-at-branch/shipping-removal behavior is unreachable via the customer path. | depends on B2 bug; network 1124 |
| A3 Shipping fee (shipped order) | **PASS** | Cart computed ค่าจัดส่ง **฿50** ("กล่อง S × 1"), grand total ฿6,950. Persisted on the order (`shipping_cost=50`, `shipping_mode=delivery`). | `A1-A3-cart-shipping.png` |
| A4 Place order → visible in history w/ status | **PASS** | Consent checkbox + address required; on proceed, order `ORD-20260709172502-C9D903` created → `/user/payments/[id]` (status รอชำระเงิน). History shows it: order "ส่งคำสั่งซื้อแล้ว", payment "รอชำระเงิน". | `A4-order-created-payment-request.png` |
| A5 Customer uploads slip | **PASS** | Uploaded a JPG on the payment-request page → status "อัปโหลดแล้ว รอตรวจสอบ" (pending_review); order NOT auto-paid (evidence-only, mig 115). | `A5-slip-uploaded-pending-review.png` |
| A6 Staff review → confirm → customer sees | **PASS** (two-step) | Admin `/admin/manual-payment-requests` shows the pending_review item → "Mark evidence reviewed" (request→reviewed). **That alone did NOT pay the order** (order stayed `awaiting_payment`) — confirmation is a separate action: on `/admin/orders/[id]` "Mark Payment Received" → order `confirmed`/`paid`, `inventory_applied_at` set (stock deducted). Customer order detail then shows "ชำระแล้ว". | `A6-admin-review-queue.png`, `A6-order-paid-confirmed.png`, `A6-A7-customer-order-paid-tracking.png` |
| A7 Mark shipped + tracking → customer sees | **PASS** (detail-page gap) | Entered carrier "Kerry Express" + tracking "TH-TEST-123456789" (Save tracking). Advanced fulfillment via confirm-modals: unfulfilled→preparing→ready_for_carrier_pickup→shipped (`shipped_at` set). Customer **orders list** shows การจัดส่ง: จัดส่งแล้ว + carrier + tracking + shipped date. **But the order *detail* page shows neither tracking nor fulfillment** — inconsistency. | `A7-order-shipped-tracking.png`, `A6-A7-customer-order-paid-tracking.png` |
| A8 Receipt document for the sale | **MISSING** | No receipt/print/document control anywhere on the admin order page or customer order page; `official_documents` has **0 rows** for the order (and system-wide). No sale receipt is ever issued. | admin order page (no doc buttons); DB `official_documents` count=0 |
| A9 Tax invoice (expected: void receipt + issue tax invoice) | **MISSING** | No tax-invoice path exists on the sale order (there is no receipt to void either). Confirms the 2026-07-08 launch audit (R2). | same as A8 |
| A10 Cancellation (customer request + admin cancel) | **PARTIAL** | Customer side: **no self-service cancel** on a paid/shipped sale order — only generic "ติดต่อฝ่ายขาย / บริการลูกค้า" contact links (matches "contact admin" expectation). Admin side: the order page exposes a "→ cancelled" status transition (button present) but its stock/payment/document effects were **not driven this session**. | customer order page (contact-only); admin order status buttons |
| A11 Money hygiene | **PASS-DIRTY** | (a) Amounts stored as **NUMERIC baht** (`grand_total=6950.00`), **not satang** — Omise charges in satang but the DB/order model is baht-decimal. (b) Deposit-not-revenue holds for the sale: order paid via the standard order path, **no** `rental_held_balance_events`, **no** `payment_attempts` row (manual flow). (c) Document-number sequence integrity: N/A — no documents are issued for sales. | DB reads (grand_total, payment_attempts=0) |

**Flow A narrative — where it dead-ends:** A real customer completes the *commercial* path end-to-end: browse → cart (with correct ฿50 shipping) → order → slip upload → (staff) confirm → paid → shipped + tracking, and the customer sees paid + tracking on the orders list. The flow **dead-ends at documents**: no receipt (A8) and no tax invoice (A9) are ever produced — the fiscal-document layer does not exist for sales. The only other rough edges are the two-step confirmation (evidence-reviewed on the payment request vs. Mark-Payment-Received on the order), tracking showing on the list but not the detail page, and no customer self-cancel.

---

## 3. Flow B — Rental booking (customer + staff)

| Step | Verdict | What happened | Evidence |
|---|---|---|---|
| B1 Customer books: phone+name, branch, booking-deposit | **PASS-DIRTY** (form) | "จองเช่า" opens an inline form: booker name + phone (`type=tel`) + a working date-range calendar. Selected 15→17 Jul (real pointer clicks): วันเริ่มเช่า 2026-07-15, วันคืน 2026-07-17, 3 วัน, **ค่าเช่ารวม ฿1,500**, deposit shown. Gaps: **no branch picker** on the customer form; deposit labeled bare **"ค่ามัดจำ ฿2,000"** — the booking-deposit-จอง concept isn't surfaced here. | `B1-customer-booking-form.png`, `B1-booking-form-state.png`, `B1-booking-dates-selected.png` |
| B2 Pay booking deposit (slip path) | **BLOCKED** (real bug) | "เพิ่มลงตะกร้าเช่า" shows a **success toast but adds nothing** — cart stays empty (verified via localStorage `items:[]`, 0 `rental_bookings`, and after both hard- and SPA-navigation). Root cause: the client does a **direct PostgREST insert** `POST /rest/v1/rental_bookings` with **`asset_id: null`** (the asset id is only inside `asset_snapshot.id`), violating CHECK `rental_bookings_root_chk` (`asset_id IS NOT NULL OR (product_id & sku_id)`) → **HTTP 400 (23514)**. The failure is swallowed (toast says success). No draft → no deposit page. **ERRATUM — Post-fix root-cause revision (2026-07-10):** the `asset_id:null` was triggered by the client `isUuid` regex rejecting the seeded non-v4 UUID; real v4 asset ids would pass. Real-user impact of the original 400 is therefore UNVERIFIED. The silent success-toast-on-failure and the client-direct PostgREST write remain confirmed real issues; the server-endpoint fix stands on those grounds. | network req **1124** response `23514 … rental_bookings_root_chk`; request-body shows `asset_id:null`; `constraint = CHECK((asset_id IS NOT NULL) OR ((product_id IS NOT NULL) AND (sku_id IS NOT NULL)))` |
| B3 Booking document with QR | **BLOCKED** (downstream of B2) | No booking can be created via the customer path, so no booking document / pickup QR is produced. `official_documents` = 0 rows. Not driven via staff path this session. | depends on B2 |
| B4 KYC state today | **PARTIAL** | Standalone `/admin/kyc` intake **is wired** (Identity number, "Thai national ID", "Individual", "Look up", "Create profile"). **POS V3 "KYC" mode is DEAD** (button present, no panel; "Phase 1 scope … KYC … not implemented here"). verify/revoke have no UI. Decision-level KYC freeze remains in effect (not a UI lockout on `/admin/kyc`). | `/admin/kyc` (wired form); `B6-B8-pos-v3-shell.png` |
| B5 Withholding tax (company case) | **PARTIAL** (scaffold, not captured) | Not fully absent: a WHT data model exists (`whtApplicable/whtRate/whtAmount/whtCertificateRequired` in `rental-payment-line.ts`; `rentalCompanyWhtRate: 0.05` config in `app/utils/rental-payment-lines.ts:35`; a "การหัก ณ ที่จ่าย" field in the document print page). **But every wired path hardcodes 0 / not-applicable** (no-show docs `wht_rate:0`, print-form `whtApplicable:false`) and there is **no capture UI** — so company WHT is not actually captured. | grep of `server/utils/*`, `app/utils/rental-payment-lines.ts`, `app/pages/admin/documents/[id]/print.vue` |
| B6 Staff: booking appears; confirm deposit (POS V3 + booking manager) | **PARTIAL** | POS V3 (`/admin/pos-v3`) loads: 3 modes (ขายขาด/Booking/KYC), sale = "later phases", QR resolver present. Booking Manager (`/admin/rental-bookings`) is a **read-only management surface** (filter tabs Confirmed/Picked up/No-show/Returned/Cancelled; 0 bookings) with **no "create booking"** — creation is POS-only. No deposit could be confirmed because no booking exists (customer path blocked; POS same-day booking creation not driven to completion this session). | `B6-B8-pos-v3-shell.png`; Booking Manager page |
| B7 Pickup: checklist, signature, remaining security deposit, doc | **BLOCKED** (not reached) | No booking exists to pick up. Note (from schema/prior audits): pickup is KYC-gated; walk-in pickup needs a `kyc_profile_id`, and POS V3 has no KYC-capture UI — so even with a booking, walk-in pickup would be gated. Not driven live this session. | depends on B2/B6 |
| B8 QR resolve in POS V3 | **PARTIAL** | The POS V3 resolver/scan surface exists (Scan QR / manual `booking:<id>` lookup). Could not resolve a real booking QR (no booking/document created). | `B6-B8-pos-v3-shell.png` |
| B9 Return / settlement / deposit release | **BLOCKED** (not reached) | No confirmed/picked-up booking to return. Not driven live. Schema supports it (`rental_held_balance_events` types include `settlement_application`, `forfeiture`, `refund`, `remaining_security_deposit_collection`). | depends on B2/B6/B7 |
| B10 Customer history reflects bookings | **BLOCKED** | No booking created → nothing to reflect. `/user/rentals` would be empty for this customer. | depends on B2 |
| B11 Money hygiene (VAT=0 forfeiture, held-balance timing, no bare "มัดจำ") | **PASS-DIRTY** | Schema supports the ledger: `rental_held_balance_events` event-type CHECK includes `booking_deposit_collection`, `pickup_held_balance_collection`, `settlement_application`, `forfeiture`, `refund`, `remaining_security_deposit_collection` (+ `amount>=0`, 3-char currency). **GLOSSARY VIOLATION:** the asset & booking pages show **bare "ค่ามัดจำ" / "มัดจำ"** (rule requires เงินมัดจำจอง / เงินมัดจำประกัน). Held-balance timing could not be observed live (no booking). | DB constraint on `rental_held_balance_events`; asset page "ค่ามัดจำ" |

**Flow B narrative — where it dead-ends:** A real customer can open the rental form and pick dates (the calendar and pricing work — ฿1,500 for 3 days + ฿2,000 deposit). The flow **dead-ends immediately at "add to rental cart" (B2 entry)**: the client-side draft insert sends `asset_id: null` and the DB rejects it with a 400 CHECK violation, while the UI falsely reports success. Because no booking is ever created, everything downstream on the customer side — deposit payment (B2), booking document/QR (B3), and rental history (B10) — is unreachable. On the staff side, POS V3 and the Booking Manager exist but booking *creation* is POS-only and was not driven to completion; pickup (B7) and return (B9) had no booking to operate on, and pickup is additionally KYC-gated while POS V3's KYC-capture mode is dead.

---

## 4. Furthest reachable point (per flow)

- **Flow A:** A real customer **completes the full commercial path** through **paid → shipped → tracking visible (A7)**. It stops only at fiscal documents — no receipt (A8) / tax invoice (A9) is ever issued. *Furthest reachable = shipped order with customer-visible tracking; no document layer beyond it.*
- **Flow B:** A real customer gets **as far as filling the booking form and seeing the price (B1)**, then **cannot proceed** — "add to rental cart" 400s silently (`rental_bookings_root_chk`, `asset_id` null). *Furthest reachable (customer) = the booking form with dates + ฿1,500 fee shown; booking creation itself fails, so B2–B10 are unreachable via the customer path.*

---

## 5. Cross-flow findings (shared breakage / behavior)

1. **Manual-payment-request flow (mig 115) is the shared paid path** and works for sale (A4–A6). It is the ratified flow (see `docs/payment-flow-ratification-audit.md`).
2. **Money is modeled in baht (NUMERIC), not satang**, across orders/bookings — a cross-cutting convention worth confirming against Omise's satang charges.
3. **Glossary rule violated** on customer money-path copy: bare "ค่ามัดจำ"/"มัดจำ" (asset + booking form) instead of เงินมัดจำจอง / เงินมัดจำประกัน.
4. **Admin UI is English-only; customer UI is Thai** (consistent with Decision J). POS V3 mixes English/Thai and shows dev-facing "Phase 1 scope … not implemented here" banners (matches the 2026-07-09 POS V3 deep audit).
5. **Two rental-vs-sale creation models diverge:** sale cart items persist server-side via cart APIs; rental drafts are created by a **client-side direct PostgREST insert** into `rental_bookings` — which is exactly where B2 breaks.
6. **Address entry friction:** the account address-book Save button would not enable under automation (province/district likely structured comboboxes); seeded via SQL to proceed (low-confidence it blocks a real user).

---

## 6. Candidate fix order (ordered blocker list — no solutions)

**Flow A** has *no hard blocker* to completing the existing commercial flow (A1–A7 all pass). Ordered gaps:
1. A8 — no sale receipt document (missing feature).
2. A9 — no tax-invoice path (missing feature).
3. A7 — tracking not shown on the customer order *detail* page (only the list).
4. A10 — no customer self-cancel; admin cancel effects unverified.

**Flow B** (each blocks the next):
1. **B2/B1 — the rental draft insert (`asset_id: null` → `rental_bookings_root_chk` 400).** This is the single blocker gating the entire customer rental flow; also the silent success-toast-on-failure. Nothing B2→B10 is reachable until this is fixed.
2. B6 — booking creation path for staff (POS-only; verify POS creates with `asset_id` set) and deposit confirmation.
3. B3 — booking document + pickup QR issuance (needs a booking).
4. B4/B7 — KYC capture at POS (POS V3 KYC mode is dead) — gates pickup.
5. B7 — pickup (checklist/signature/remaining security deposit/doc).
6. B9 — return / settlement / deposit release.
7. B11/glossary + B1 branch picker + booking-deposit wording.

---

## 7. Low-confidence items (require auditor re-verification)

1. **B2 root cause reproduction scope:** confirmed via one live 400 (network 1124) + constraint read. Whether the **staff/POS** booking-creation path sets `asset_id` correctly (and thus works) was **not driven** — POS likely inserts server-side with asset_id, but this is unverified this session. **ERRATUM — Post-fix root-cause revision (2026-07-10):** the `asset_id:null` was triggered by the client `isUuid` regex rejecting the seeded non-v4 UUID; real v4 asset ids would pass. Real-user impact of the original 400 is therefore UNVERIFIED. The silent success-toast-on-failure and the client-direct PostgREST write remain confirmed real issues; the server-endpoint fix stands on those grounds.
2. **Address-book Save disabled under automation:** likely a structured province/district combobox not satisfied by synthetic input; a real human may complete it. Worked around via SQL. Not confirmed as a real-user blocker.
3. **Customer booking calendar:** initially resisted *synthetic* clicks (fee stayed ฿0); **real pointer clicks worked** (fee ฿1,500). So the calendar is fine — earlier "stuck" states were an automation artifact, not an app bug.
4. **A10 admin cancel** stock/payment/document effects were not executed (only the button's presence observed).
5. **B7/B9 staff rental lifecycle** (pickup checklist/signature/deposit, return/settlement) was **not driven live** — no booking existed to operate on. Findings there are structural (schema/prior audits), not observed.
6. **Held-balance event timing** (B11) not observed live (no booking).
7. **A6 "customer sees" nuance:** the customer order *detail* shows "หลักฐานการชำระเงิน (0)" (uploaded slip not surfaced on the order — it lives on the payment request); functionally correct, minor UX.
8. Console noise: the persistent console "error" is a `@nuxt/a11y` "buttons must have discernible text" warning, not an app failure.

---

## Appendix 1 — Ad-hoc SQL executed (local DB only, via `docker exec … psql`)

All run against local Postgres (`127.0.0.1:54322`). Timestamps UTC.

1. **2026-07-09T17:13:57Z — seed accounts.** Insert `auth.users` + `auth.identities` for `customer@local.test` (id `1111…1111`) and `admin@local.test` (id `2222…2222`), password `crypt('<local-test password — session notes only>', gen_salt('bf'))`, `email_confirmed_at=now()`. Then `UPDATE public.users SET platform_role='super_admin'` for admin, and set `full_name`/`phone` on both. *(public.users rows auto-created by the `on_auth_user_created` trigger.)* Reason: no auth users existed; both flows need a customer and a staff login.
2. **~2026-07-09T17:14Z — seed rental asset.** Insert `public.assets` `AST-LOCAL-001` (`local-test-excavator`, status `active`, `main_category_key='others'`, daily 500 / weekly 3000 / monthly 10000, deposit 2000, min 1 / max 30, `storage_branch_id='branch-hq'`, `storage_inventory_id='9b9c5284-…'`), and `public.asset_branch_inventory` (on_hand 2 / available 2 at branch-hq Rental inventory). First attempt failed on `assets_main_category_key_fkey` (`machinery` absent) → re-run with `others`. Reason: 0 rental assets existed; Flow B needs one.
3. **2026-07-09T17:20:32Z — fix GoTrue login (seeding artifact).** `UPDATE auth.users SET confirmation_token/recovery_token/email_change/email_change_token_new/email_change_token_current/phone_change/phone_change_token/reauthentication_token = coalesce(…, '')` for both seeded users. Reason: password grant 500'd (`Database error querying schema`) because those NOT-scanned-as-NULL columns were NULL from the manual insert.
4. **2026-07-09T17:23:52Z — seed shipping address (WORKAROUND).** Insert `public.addresses` (default, for customer) with full Thai address. Reason: the account address-book Save button would not enable under automation; needed a default address to place the sale order (A4).

Read-only SQL (schema/enum/constraint/RLS inspection and result verification) was also run throughout; those are reads, not mutations.

## Appendix 2 — Environment report

- Working dir: `/Users/chakkapanprommas/chip-project/hop-rental`, branch `staging`, 117 migrations applied locally.
- Env vars checked (hosts/prefixes only; secrets redacted): `SUPABASE_URL` (`.env`=`https://yzjczvzwmbbeyoodrjwm.supabase.co` remote / `.env.local`=`http://127.0.0.1:54321` local), `NUXT_PUBLIC_OMISE_PUBLIC_KEY`=`pkey_test_…`, `OMISE_SECRET_KEY`=`skey_test_…`, `OMISE_WEBHOOK_SECRET` (present), `KYC_HASH_SECRET`/`SUPABASE_KEY`/`SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_KEY` present in `.env.local`.
- Dev server: `npx nuxt dev --dotenv .env.local` (backgrounded), served `http://localhost:3000` (HTTP 200). **Left running** at end of session.
- Local Supabase containers healthy (Docker `supabase_db` = `6114212ec05e`).
- Browser: Playwright MCP, 1440×900, one context, customer/staff via logout-login.

## Appendix 3 — Test data created (for inspection / later cleanup — NOT cleaned up)

| Entity | Identifier | State |
|---|---|---|
| Customer login | `customer@local.test` / `<local-test password — session notes only>` | id `11111111-1111-1111-1111-111111111111` |
| Staff login | `admin@local.test` / `<local-test password — session notes only>` | id `22222222-2222-2222-2222-222222222222` (super_admin) |
| Rental asset | `AST-LOCAL-001` id `33333333-3333-3333-3333-333333333333` | active, available 2 @ branch-hq |
| Shipping address | id `0ea3ae29-cd9b-4747-b495-6580c0739d69` | default, for customer |
| **Sale order** | `ORD-20260709172502-C9D903` id `ef14ac2e-1ff5-4460-825b-882725bdee48` | **status=confirmed, pay=paid, fulfillment=shipped**, tracking TH-TEST-123456789 |
| Payment request | id `b86ccfdd-02d3-4387-b1c2-efaab0b82c2b` | status=reviewed (+ 1 uploaded slip) |
| Rental bookings | — | **0 created** (customer path 400-blocked, B2) |

Uploaded slip fixture: `.playwright-mcp/test-slip.jpg` (1×1 JPEG; tooling scratch, untracked).
