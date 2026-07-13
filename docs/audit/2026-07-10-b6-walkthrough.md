# B6 Staff / POS Deposit-Confirm Walkthrough (live, browser-driven)

- **Status:** COMPLETE. All B6 legs driven live: B6.2 fixture, B2→B6.2 fresh customer→staff, B6.1 POS V3 (cash confirmed; QR-poll mechanism verified, confirm gated on external Omise test payment), B6.3 cross-checks (Booking Manager + customer history), B6.4 roll-up below. The Chrome MCP extension briefly disconnected mid-walk and reconnected; the walk resumed and finished.
- **Date:** 2026-07-13 (walk of the B6 plan dated 2026-07-10).
- **Method:** LIVE walkthrough — real UI clicked in a browser (**Claude-in-Chrome MCP**, not Playwright) against `http://localhost:3000` on the **local** Supabase stack. Code/schema read only to explain observed behavior.
- **Roles:** super_admin (`admin@local.test`) and customer (`customer@local.test`), switched by logout/login in one context.
- **Scope lock honored:** localhost:3000 only; no navigation to prod / `*.supabase.co`; worked only in the single walk tab; dev server NOT restarted; per-write 127.0.0.1 evidence captured (below). No repo files modified except this doc. Local DB writes via UI are expected; ad-hoc SQL logged in Appendix A. No commits, no push.
- **Verdicts:** PASS · PASS-DIRTY (works but violates an accounting/glossary/UX rule) · BLOCKED (UI exists, action fails) · MISSING (no path) · WORKAROUND · NOT-TESTABLE-LOCALLY (environment limitation, not a finding).

> **Glossary rule under test:** staff/customer money copy must use **เงินมัดจำจอง** (booking deposit) / **เงินมัดจำประกัน** (security deposit), never bare **มัดจำ**.

---

## 0. Environment gate (re-run this session)

| Check | Result |
|---|---|
| Browser tooling | **Claude-in-Chrome MCP** (`mcp__claude-in-chrome__*`). Playwright MCP present-but-deferred; NOT used. |
| Dev server `:3000` | ✅ up (node pid 42378). |
| Local Supabase `:54321` | ✅ up (Docker `supabase_db_hop-rental`); **119 migrations** applied (110–119 present, incl. mig-118 append-only guards + mig-119 atomic booking-deposit confirm RPC). |
| **App-resolved `SUPABASE_URL`** | ✅ **`http://127.0.0.1:54321`** — read from the running app's **SSR HTML + client bundle**, not just a flag. ⚠️ `.env` (default Nuxt dotenv) still points at **remote/prod** `yzjczvzwmbbeyoodrjwm.supabase.co`; only `.env.local` is local. Running process resolved local; **do not restart the server** mid-walk. |
| Remote calls | ✅ **zero** `*.supabase.co` requests observed in any leg. |
| Omise | ✅ **test mode** (public + secret `*_test_*`). `OMISE_WEBHOOK_SECRET` empty (fine for manual-slip legs; blocks the QR **webhook** arm — see B6.1). |

Auth note: the two seeded accounts' passwords were set to a known local value via SQL (Appendix A #1) because the prior session's password was not recorded.

---

## B6.2 — Staff deposit confirm on `/admin/rental-bookings/[id]` (fixture leg) — **PASS**

**Target fixture:** booking `dddddddd-0000-4000-8000-000000000119` (draft, registered customer, asset AST-LOCAL-001, 1–4 Oct 2026, deposit_amount ฿2,000) **with** a `pending_review` deposit slip `eeeeeeee-…119` in `rental_booking_deposit_slips`. This is the exact shape that used to trigger the `33a2fed` 500.

### Steps + verdicts

| Step | Verdict | Evidence |
|---|---|---|
| **B6.2a** `33a2fed` render regression — booking-detail page loads for a draft **with** a slip | **PASS** | Page rendered fully (header, banner, booking status, operational docs, customer/asset, pricing, **Mark Deposit Received form**, **Deposit Slip Evidence (1)**). **Zero console errors.** Before the fix this 500'd on the `AdminBookingDepositConfirm` "Linked slip" `SelectItem value=""`. |
| **B6.2b** "Linked slip" select renders **and is functional** (the sentinel fix) | **PASS** | Select shows `— None —` (checked sentinel) by default; opening it lists `— None —` + `slip.jpg (pending_review)`; selecting the slip sets it to `slip.jpg (pending_review)` — sentinel→real-value mapping works both ways. |
| **B6.2c** Mark Deposit Received → confirms booking + writes BDC ledger + reviews slip | **PASS** (with money-hygiene flag below) | POST `http://localhost:3000/api/admin/rental-bookings/dddddddd-…119/record-deposit` → **200**; toast "Deposit recorded — booking confirmed". |

**Scope-lock network evidence (B6.2 first write):**
```
POST http://localhost:3000/api/admin/rental-bookings/dddddddd-0000-4000-8000-000000000119/record-deposit → 200
*.supabase.co requests during the write: 0
```

**DB verification (pre → post):**
- `rental_bookings dddd…119`: `draft → confirmed`; `booking_deposit_payment_status unpaid → paid`; `booking_deposit_paid_amount 0.00 → 2000.00`; `booking_deposit_paid_at` set.
- `rental_held_balance_events` (BDC ledger) — **new row**: `event_type=booking_deposit_collection`, `amount=2000.00 THB`, `status=posted`, `source_type=manual_admin_confirmation`. Correctly a **held liability**, not revenue. (Consistent with the append-only guards from mig-118.)
- `rental_booking_deposit_slips eeee…119`: `pending_review → reviewed`, `reviewed_by=admin`, review note recorded.

### ⚠️ Money-hygiene finding (PASS-DIRTY) — admin deposit-confirm amount prefill

The "Amount received" field **prefilled ฿2,000** (the asset's full **security** deposit, `deposit_amount`) and that ฿2,000 was booked as `booking_deposit_collection`. But the **booking deposit (เงินมัดจำจอง) due now is ฿200** — confirmed independently three ways this session:
- the `aaaaaaaa/bbbbbbbb-…119` confirmed fixtures both have `booking_deposit_paid_amount = 200.00`;
- the **customer cart** computes "Booking Deposit / เงินมัดจำจอง = ฿200" and states it is credited against the ฿2,000 security deposit at pickup (→ ฿1,800 remaining);
- the **customer payment request** (below) has `total_amount_due = ฿200` with a `rental_booking_deposit` allocation item of ฿200.

So the staff-side prefill defaults to **10× the policy booking deposit**. The field is editable and staff verify the slip, but a staff member accepting the prefill records an oversized held liability and confirms the booking on a ฿2,000 "booking deposit" that does not match the ฿200 policy. **Recommend:** prefill the booking-deposit-due-now amount (฿200), not the full security `deposit_amount`.

### Glossary findings on this staff screen

| Location | Text | Verdict |
|---|---|---|
| Orange draft banner headline | "…ไปที่ POS V3 เพื่อรับ**มัดจำ**" | ❌ bare **มัดจำ** |
| Banner button | "ดำเนินการรับ**เงินมัดจำการจอง**" | ⚠️ qualified but non-canonical (canonical = **เงินมัดจำจอง**; "การจอง" variant) |
| Mixed-payment note | "…ครอบคลุมทั้ง**เงินมัดจำจอง** และค่าสินค้า/ค่าส่ง…" | ✅ canonical |
| Pricing breakdown | "**Deposit** ฿2,000.00" | ⚠️ bare English "Deposit" (admin is EN-only per Decision J; not Thai-glossary-scoped, noted for completeness) |

---

## B2 → B6.2 — Fresh customer-side draft + deposit payment → staff confirm (live) — **PASS**

Full chain driven end-to-end: customer creates a new booking → central payment request → slip upload → staff review evidence → staff confirm deposit.

| Step | Verdict | Evidence |
|---|---|---|
| **B2a** Customer creates a rental draft (the flow that silently failed in the 2026-07-09 audit) | **PASS — regression fixed** | Asset page → จองเช่า → picked 20–22 Jul (฿1,500 rental, ฿2,000 deposit) → เพิ่มลงตะกร้าเช่า → toast "บันทึกรายการเช่าลงตะกร้าแล้ว" → `/user/cart` shows the line. **Root-cause fix confirmed:** draft creation now routes through the **server endpoint** `POST /api/user/rental-bookings/drafts` (server sets `asset_id`), replacing the old client-direct PostgREST insert that sent `asset_id:null`. |
| **B2b** New draft row has `asset_id` set | **PASS** | New booking `e44b1fc4-6105-4677-ab58-156ab4bcdec9`: `status=draft`, **`asset_id=33333333-…` (populated)**, 20 Jul→23 Jul, rental_total 1500, deposit 2000, `user_id=customer`. Row landed in the **local** DB (count 4→5). |
| **B2c** Cart payment summary (deposit model) | **PASS + glossary PASS** | "ชำระตอนนี้: Booking Deposit / **เงินมัดจำจอง** ฿200"; "**เงินมัดจำประกัน**เต็มจำนวน ฿2,000 − Booking Deposit ฿200 = **เงินมัดจำประกัน**คงเหลือ ฿1,800"; explicit note that the booking deposit is part of the refundable security deposit, credited at pickup. Canonical glossary throughout the summary. |
| **B2d** Pickup branch required before checkout | **PASS** | Checkout blocked with "ยังมีรายการเช่า 1 รายการที่ต้องเลือกจุดรับสินค้า" until a pickup branch was chosen. Only one branch offered: "สาขาหน้านิคมลาดกระบัง". |
| **B2e** Proceed → payment request created | **PASS** | Consent + ดำเนินการชำระเงิน → `/user/payments/bb6ded58-…`, status "รอชำระเงิน". `manual_payment_requests`: `source_type=booking_only`, `awaiting_payment`, **`total_amount_due=200.00 THB`**; allocation item `rental_booking_deposit → e44b1fc4-…, ฿200`. |
| **B2f** Slip upload → pending_review (evidence-only) | **PASS** | Uploaded synthetic JPEG → toast "อัปโหลดสลิปแล้ว รอเจ้าหน้าที่ตรวจสอบ"; slip in bucket `manual-payment-slips`, uploaded_by=customer. Request → `pending_review`, `submitted_at` set. **Booking e44b1fc4 stayed `draft`/`unpaid`** — upload never confirms (mig-115 invariant). POST `http://localhost:3000/api/user/manual-payment-requests/bb6ded58-…/slips` → 200. |
| **B6.2-fresh-i** Staff review evidence on `/admin/manual-payment-requests` | **PASS** | Detail shows Total ฿200, allocation "Rental booking deposit → รถขุดทดสอบ ฿200", slip. "Mark evidence reviewed" → toast "Evidence marked reviewed"; slip + request → `reviewed`. **Booking still `draft`** (review records evidence decision only — matches the on-screen note). |
| **B6.2-fresh-ii** Staff confirm deposit on `/admin/rental-bookings/e44b1fc4-…` | **PASS** (prefill corrected — see finding) | POST `.../record-deposit` → 200; toast "Deposit recorded — booking confirmed". Booking `draft → confirmed`, deposit `paid`, `booking_deposit_paid_amount=200.00`; BDC ledger row `booking_deposit_collection ฿200.00 THB posted manual_admin_confirmation`. |

**Scope-lock network evidence (customer leg):** draft → `http://localhost:3000/api/rental-bookings/draft-checkout-state` (200) + local DB row with `asset_id`; slip → `.../manual-payment-requests/bb6ded58-…/slips` (200); confirm → `.../rental-bookings/e44b1fc4-…/record-deposit` (200). **0** `*.supabase.co` requests in any step.

### ⚠️ Money-hygiene finding CONFIRMED on the fresh booking (same prefill bug)

On `/admin/rental-bookings/e44b1fc4-…`, the "Amount received" field **prefilled `2000`** (read directly from the input) — while the **"Related payment request" card on the same page shows Total amount ฿200.00** and the customer actually paid ฿200. So the prefill contradicts the linked request on its own screen. This walk **manually corrected 2000 → 200** before confirming, so the ledger is accurate; a staff member accepting the default would post a ฿2,000 booking-deposit liability (10× actual). This reproduces the B6.2 fixture-leg finding on a live booking. **Fix:** default the amount to the booking-deposit-due-now (the related request's total / ฿200), not the asset's full security `deposit_amount`.

### Two slip-surface reality — CONFIRMED

The live customer slip landed in `manual_payment_request_slips` and is visible on `/admin/manual-payment-requests`. The booking page's **"Deposit Slip Evidence (0)"** showed "No deposit slip uploaded by the customer yet" (DB: 0 `rental_booking_deposit_slips` rows for this booking), and — because that table was empty — the "Linked slip" dropdown was **absent** from this booking's confirm form (it appeared only on the `dddd` fixture, which had a `rental_booking_deposit_slips` row). The booking page **does** surface the central request via a "Related payment request" card (reviewed, ฿200, Open link) — so the two surfaces are linked, but the slip file itself only lives on the central queue. Decision needed on whether to unify.

### Cross-cutting findings surfaced in this leg

1. **Two separate slip surfaces (important).** The **live customer** booking-deposit flow uploads to the **central** `manual_payment_request_slips` (mig-115) → visible on **`/admin/manual-payment-requests`**. The admin **booking page's "Deposit Slip Evidence"** reads the **older** `rental_booking_deposit_slips` table (which is what the `dddd`/`eeee` fixture used). ⇒ For a booking created through the live customer path, the customer's actual slip will **not** appear in the booking page's "Deposit Slip Evidence", and the "Linked slip" dropdown there will be empty. Staff would review the slip on the manual-payment-requests queue, then still confirm via "Mark Deposit Received" on the booking page (amount ฿200, no linked booking-slip). Worth deciding whether these two surfaces should be unified.
2. **Real bank account is configured** (earlier `[TODO]` placeholder resolved): ธนาคารกสิกรไทย / บจก. ฮอปนิค / **127-8-56077-1** / สาขาพนมสารคาม / tax id 0105564155415.
3. **Possible cart display bug:** the "ชำระวันรับสินค้า" block lists ค่าเช่าอุปกรณ์ ฿1,500 and เงินมัดจำประกันคงเหลือ ฿1,800 but shows **"รวมยอดชำระวันรับสินค้า ฿1,800"** — the ฿1,500 rental appears omitted from that subtotal (expected ฿3,300). Needs code confirmation (not yet root-caused).
4. **Glossary (customer screens):** bare **มัดจำ** on the asset page ("ค่ามัดจำ ฿2,000"), the cart item badge ("มัดจำ: ฿2,000") and the cart line "ยอดมัดจำรวม"; canonical **เงินมัดจำจอง / เงินมัดจำประกัน** in the cart summary, the payment-request page ("เงินมัดจำจอง ฿200"), and the mixed-payment note.

---

## B6.1 — POS V3 fresh drafts (cash + QR poll) — **PASS (cash)** · **PASS-mechanism (QR poll)**

POS V3 Booking mode → "Create Future Rental Booking" (walk-in, branch HQ, asset AST-LOCAL-001). Two fresh drafts created, Aug/Sep dates.

### Cash leg — **PASS**

| Step | Verdict | Evidence |
|---|---|---|
| Create POS draft (walk-in "B6 POS Cash Walkin" 0800000199, Sep 4→6) | **PASS** | Booking `681f7610-1028-4cf9-a297-aa8f36d4cf61`, "draft · unpaid". |
| Cash "Collect Booking Deposit" panel amounts | **PASS — correct model** | **BOOKING DEPOSIT DUE NOW ฿200** (locked 🔒, non-editable), Security deposit ฿2,000, Remaining due at pickup ฿1,800. This is the accounting the admin booking-page "Mark Deposit Received" prefill gets wrong (it prefills ฿2,000, editable). POS V3 gets it right. |
| Confirm cash → booking confirmed + BDC | **PASS** | POST `.../pos-v3/rental-bookings/681f7610-…/booking-deposit-payments` → 200; "Booking confirmed · Future rental ready for pickup"; Paid ฿200 Cash; **BDC document BDC-202607-0002** generated. DB: booking `confirmed`, `booking_deposit_paid_amount=200.00`, walk-in, pos_branch=HQ; BDC ledger `booking_deposit_collection ฿200.00 THB posted source_type=pos_rental_payment_attempt`; POS attempt `d3a56469-…` (in `pos_rental_payment_attempts`). |

### QR (PromptPay) leg via the poll arm — **PASS (mechanism); confirm gated on external Omise**

| Step | Verdict | Evidence |
|---|---|---|
| Create POS draft (walk-in "B6 POS QR Walkin" 0800000299, Aug 10→12) → PromptPay QR | **PASS** | Booking `0dc2a69a-da63-4f2b-8704-538f39259b65`, ฿200. POST `.../booking-deposit-qr` → 200 returns a **real Omise TEST-mode PromptPay QR** (Thai QR / PromptPay, "TEST MODE" watermark, 5-min countdown). |
| Poll arm active | **PASS (mechanism verified)** | Client repeatedly POSTs `.../booking-deposit-qr/poll` (7+ calls, all 200), status stays `pending`. DB `pos_rental_payment_attempts` `c73fdad5-…`: `pending`, ฿200, `promptpay_qr`, gateway `omise`, `gateway_charge_id=chrg_test_68bmkchh6hszgn4yj9m`, `gateway_source_id=src_test_…`, `expires_at` +5 min. The poll would flip the booking to confirmed when Omise reports the charge paid. |
| Drive poll → confirmed | **NOT PERFORMED (scope-respecting)** | Completing the charge requires an actual Omise test-mode PromptPay payment (`api.omise.co`) — an **external** interaction beyond the localhost-only stack. Per the hard scope lock (localhost only; record off-localhost needs as a finding) I did not initiate an external Omise API call. The charge also expires in ~5 min. **Distinct from the webhook arm** below: the poll *mechanism* is locally observable and verified; only the final Omise payment is external. |

**QR webhook arm = NOT-TESTABLE-LOCALLY** — needs Omise to call back a public URL; `OMISE_WEBHOOK_SECRET` is also empty locally. Environment limitation, not a finding.

**POS V3 glossary:** the POS draft summary shows bare "**ยอดมัดจำ ฿200**" / "**ค่ามัดจำ ฿2,000**" (calendar) and the section heading "**เลือกวิธีรับเงินมัดจำการจอง**" (qualified, "การจอง" variant). The cash-panel amounts are English ("Booking Deposit", "Security deposit"). Bare "มัดจำ" present in the Thai summary/calendar labels.

## B6.3 — Cross-checks — **PASS**

| Surface | Verdict | Evidence |
|---|---|---|
| **Booking Manager** (`/admin/rental-bookings`) | **PASS** | "Showing 1–7 of 7". All walk bookings present with correct status: QR `0dc2a69a` = **draft · deposit unpaid** (QR unpaid); cash `681f7610`, fresh `e44b1fc4`, fixtures `dddd`/`bbbb`/`aaaa` = **confirmed**; `ea89922c` = pre-existing draft. Filter tabs (Confirmed/Picked up/No-show/Returned/Cancelled) present. Dates render in Buddhist era (2569). **Label caveat:** confirmed rows show a "deposit unpaid" badge that refers to the **security** deposit (collected at pickup), not the booking deposit (which is paid) — potentially confusing. |
| **Customer history** (`/user/rentals`, customer session) | **PASS** | Summary "รายการเช่าที่ยืนยันแล้ว **4**", ยอดค่าเช่า ฿6,000, ยอดมัดจำ ฿8,000. Fresh booking `e44b1fc4` shows **สถานะ: ยืนยันแล้ว (confirmed)**, correct dates 2026-07-20→22. Glossary: bare "มัดจำ" in the summary card + per-item badge (security deposit ฿2,000). |
| POS V3 pending work | **PARTIAL (observed indirectly)** | The QR-pending booking surfaces as `draft` in Booking Manager; the POS V3 "pending work list" is resolver-driven (only populates after a scan/resolve) and was not separately exercised. |

## B6.4 — Verdict roll-up + glossary matrix

### Verdicts

| Leg | Verdict |
|---|---|
| B6.2a — `33a2fed` render regression (draft + slip page loads, no 500) | **PASS** |
| B6.2b — "Linked slip" SelectItem renders + functional | **PASS** |
| B6.2c — fixture staff deposit confirm → confirmed + BDC + slip reviewed | **PASS-DIRTY** (mechanics correct; amount wrong — ฿2,000 vs the ฿200 due at the time of the walk; see Finding 1) |
| B2 — customer draft creation (asset_id set via server endpoint) | **PASS** (was BLOCKED 2026-07-09) |
| B2 — customer payment request + slip upload (evidence-only) | **PASS** |
| B6.2-fresh — staff review evidence + deposit confirm ฿200 | **PASS** (prefill corrected) |
| B6.1 — POS V3 cash → confirmed + BDC + BDC doc | **PASS** |
| B6.1 — POS V3 QR poll arm | **PASS (mechanism)**; confirm gated on external Omise |
| B6.1 — QR webhook arm | **NOT-TESTABLE-LOCALLY** |
| B6.3 — Booking Manager + customer history | **PASS** |

### Findings (ranked)

1. **Money prefill bug (medium) — REFRAMED per owner rule 2026-07-10, then FIXED.**
   - **Owner rule:** same-day walk-ins collect the FULL security deposit immediately (no booking deposit); advance bookings collect the booking deposit (3-tier formula per commit `f7caf85`: <15 d → ฿200, 15–29 d → ฿500, ≥30 d → ฿1,000).
   - **Original state:** the admin surface could not distinguish same-day from advance; it prefilled `rental_bookings.deposit_amount` (the **security**-deposit snapshot — provenance proven empirically with a ฿3,500 test asset), accepted any staff-entered amount with **no server guard**, and the mig-119 RPC hardcodes `event_type='booking_deposit_collection'`. So an advance booking could book a wrong-amount deposit (this walk's `dddd…119`, ฿2,000 vs ฿200) and a same-day full-security collection would be a **wrong-category permanent ledger write** (mig-118 append-only; G4 void path unbuilt). POS V3 was already correct on both counts (server-guarded formula amount; same-day uses `not_applicable_same_day` + `remaining_security_deposit_collection`).
   - **Fix (this change set):** the admin surface is now **advance-only**: prefill computed from the shared `calculateBookingDepositDueNow`, amount read-only (no free-form entry), canonical two-deposit label, POS V3 notice when the booking starts today, and a server guard in `recordManualBookingDeposit` (422 `BOOKING_DEPOSIT_AMOUNT_MISMATCH`, same derivation/tolerance as POS V3). Live-verified: 20-day draft prefilled ฿500; forged ฿2,000 POST → 422; legit ฿500 → confirmed + `booking_deposit_collection ฿500 posted`.
   - **Residual:** `dddd…119`'s local ledger row (`booking_deposit_collection ฿2,000`) **remains in the local DB as a live example of why the G4 void path is needed** — append-only mig-118 means it cannot be corrected, only compensated.
2. **Two slip surfaces (medium, design).** Live customer slips go to `manual_payment_request_slips` (`/admin/manual-payment-requests`); the booking page's "Deposit Slip Evidence" reads `rental_booking_deposit_slips` and shows 0 for live customer bookings. The pages are linked via a "Related payment request" card, but the slip file lives only on the central queue. Decide whether to unify.
3. **"deposit unpaid" label ambiguity (low).** On the Booking Manager list, confirmed bookings show "deposit unpaid" meaning the *security* deposit (pickup), even though the booking deposit is paid.
4. **Possible cart subtotal display bug (low, unverified).** Cart "รวมยอดชำระวันรับสินค้า ฿1,800" appears to omit the ฿1,500 rental (expected ฿3,300). Needs code confirmation.
5. **Glossary — bare "มัดจำ" (low, recurring).** See matrix.

### Glossary matrix (bare "มัดจำ" = violation; canonical = เงินมัดจำจอง / เงินมัดจำประกัน)

| Screen | Location | Wording | Verdict |
|---|---|---|---|
| Admin booking detail (staff) | draft banner headline | "…เพื่อรับ**มัดจำ**" | ❌ bare |
| Admin booking detail (staff) | banner button | "รับ**เงินมัดจำการจอง**" | ⚠️ qualified, non-canonical ("การจอง") |
| Admin booking detail (staff) | mixed-payment note | "**เงินมัดจำจอง**…" | ✅ canonical |
| POS V3 (staff) | draft summary / calendar | "ยอด**มัดจำ**", "ค่า**มัดจำ**" | ❌ bare |
| POS V3 (staff) | collect-method heading | "รับ**เงินมัดจำการจอง**" | ⚠️ qualified, non-canonical |
| Customer asset page | deposit line | "ค่า**มัดจำ** ฿2,000" | ❌ bare |
| Customer cart | item badge / total | "**มัดจำ**", "ยอด**มัดจำ**รวม" | ❌ bare |
| Customer cart | payment summary | "**เงินมัดจำจอง**", "**เงินมัดจำประกัน**" | ✅ canonical |
| Customer payment request | pay-now line | "**เงินมัดจำจอง** ฿200" | ✅ canonical |
| Customer /user/rentals | summary + item badge | "ยอด**มัดจำ**", "**มัดจำ**" | ❌ bare |

Pattern: **structured summary/breakdown surfaces are canonical; headline/badge/label surfaces still use bare "มัดจำ"** — both customer- and staff-facing.

---

## Appendix A — Ad-hoc SQL executed (local DB only, `docker exec … psql`)

1. **Set known local password on seeded accounts.** `UPDATE auth.users SET encrypted_password = crypt('<local-test password — session notes only>', gen_salt('bf')), updated_at=now() WHERE email IN ('customer@local.test','admin@local.test');` plus a `coalesce(...,'')` normalize of the GoTrue token columns on both rows (prevents the known local password-grant 500). Reason: prior session's password was not recorded; needed to log in as both roles. **No app data touched.**

All other SQL this session was **read-only** (schema/column introspection, fixture inspection, pre/post-write verification of `rental_bookings`, `rental_held_balance_events`, `rental_booking_deposit_slips`, `manual_payment_requests`, `manual_payment_request_items`, `manual_payment_request_slips`).

## Appendix B — Test data created this session (local; NOT cleaned up)

| Entity | Identifier | State at hold |
|---|---|---|
| Booking (fixture, confirmed by this walk) | `dddddddd-0000-4000-8000-000000000119` | **draft → confirmed**, booking deposit ฿2,000 paid (prefill accepted — see finding 1), BDC ledger posted, slip `eeee…119` reviewed |
| Booking (fresh, customer) | `e44b1fc4-6105-4677-ab58-156ab4bcdec9` | **draft → confirmed**, booking deposit ฿200 paid (prefill corrected), BDC ฿200 posted |
| Manual payment request (fresh customer) | `bb6ded58-d839-4c67-b2a8-4a656e1800a9` | `booking_only`, **reviewed**, ฿200, 1 slip `b6-test-slip.jpg` (reviewed) in `manual-payment-slips` |
| Booking (POS V3 cash walk-in) | `681f7610-1028-4cf9-a297-aa8f36d4cf61` | **confirmed**, ฿200 cash BDC posted, doc BDC-202607-0002, walk-in 0800000199, Sep 4→6 |
| Booking (POS V3 QR walk-in) | `0dc2a69a-da63-4f2b-8704-538f39259b65` | **draft/unpaid** (QR pending → will expire), POS attempt `c73fdad5-…` pending (Omise `chrg_test_68bmkchh6hszgn4yj9m`), walk-in 0800000299, Aug 10→12 |

## Appendix C — Screenshot persistence limitation

Chrome-MCP `save_to_disk: true` did **not** return a filesystem path in this integration and no image files were written under `docs/audit/screenshots/b6/` (empty dir created). Screenshots were captured **inline** (visible in-session) as the visual record; durable evidence in this doc is the DB state, per-write network-target proofs, and page text. Using Playwright to persist screenshots was declined to honor scope-lock #2 (no interaction with other browser tabs / the user's real browser).

---

## Appendix D — User-side status audit (2026-07-14, read-only)

Walked `/user/rentals` + booking detail as `customer@local.test` against the walk's bookings. Walk-in POS bookings (`681f7610`, `0dc2a69a`) have no `user_id` → correctly absent from any account history (MISSING-by-design; no customer surface for walk-ins).

**Exact Thai labels per state:**

| State | List | Detail |
|---|---|---|
| draft/unpaid (`ea89922c`) | สถานะ: **ฉบับร่าง** | ฉบับร่าง · **สถานะมัดจำ: unpaid** · เงินมัดจำจองที่ชำระแล้ว ฿0.00 |
| confirmed, BD ฿200 (`e44b1fc4`) | สถานะ: **ยืนยันแล้ว** | ยืนยันแล้ว · **สถานะมัดจำ: paid** · เงินมัดจำจองที่ชำระแล้ว ฿200 · เงินมัดจำประกันคงเหลือวันรับสินค้า ฿1,800 · รวมยอดชำระวันรับสินค้า ฿3,300 |
| confirmed, wrong ฿2,000 (`dddd…119`) | ยืนยันแล้ว | เงินมัดจำจองที่ชำระแล้ว ฿2,000 · เงินมัดจำประกันคงเหลือ ฿0.00 · refund-eligible ฿2,000 — the UI coherently absorbs the wrong-category amount; refund exposure is now ฿2,000 |

**Verdicts:**

| Check | Verdict | Notes |
|---|---|---|
| All account bookings appear, correct data | **PASS** | 5/5 |
| BD-paid vs security-pending distinguished | **PASS (detail) / MISSING (list)** | Detail separates the two deposits canonically; list shows only bare "มัดจำ: ฿2,000" with no paid indicator — ฿200-paid and ฿2,000-paid cards look identical |
| Status label quality | **PASS-DIRTY** | "สถานะมัดจำ: paid/unpaid" = raw English enum in a Thai label + bare/ambiguous มัดจำ |
| Glossary | **PASS-DIRTY** | Detail summary canonical; list cards + summary header ("ยอดมัดจำ ฿8,000") bare |
| Cart ฿1,800 subtotal suspicion | **Resolved: cart-only** | Detail correctly shows รวมยอดชำระวันรับสินค้า ฿3,300 (1,500+1,800) |

**Follow-up flagged — end-date display inconsistency:** the customer surfaces show the rental period **inclusive** (dddd: 1 → **3** ต.ค., "3 วัน") while the admin booking page shows the stored exclusive end date (START 1 Oct **END 4 Oct**). Same row, two different "end dates" across surfaces. Needs a single display convention (out of scope here).

---

## Follow-ups for the owner

1. **Complete the QR-poll confirm** (optional): if you want the poll arm driven all the way to `confirmed`, it needs an Omise **test-mode** PromptPay payment on charge `chrg_test_68bmkchh6hszgn4yj9m` (booking `0dc2a69a-…`) — an external `api.omise.co` step I left untouched to honor the localhost-only scope lock. The current charge expires ~5 min after creation; a fresh QR + immediate test-payment would be needed.
2. ~~Fix the deposit prefill~~ **DONE** — advance-only surface with formula prefill + server guard (see Finding 1; fix rides with commit f7caf85's 3-tier formula).
3. **Decide on slip-surface unification** (finding 2).
4. Test data above was left in the **local** DB (not cleaned up) for inspection.
