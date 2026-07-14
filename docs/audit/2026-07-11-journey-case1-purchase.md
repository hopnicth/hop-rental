# Customer-Journey Audit — Case 1 of 3: PURCHASE ONLY

- **Status:** COMPLETE. All customer legs (C1–C6), admin legs (D1–D6), order-management surface (E1–E5), and money/ledger checks (M1–M3) driven live end-to-end. The reject → re-upload → accept loop was walked in full. The Chrome MCP extension disconnected once mid-walk (during the first add-to-cart) and reconnected; the walk resumed and finished.
- **Date walked:** 2026-07-14 (Case-1 plan dated 2026-07-11).
- **Method:** LIVE walkthrough — real UI clicked in a browser (**Claude-in-Chrome MCP**, not Playwright) against `http://localhost:3000` on the **local** Supabase stack. Code/schema read only to explain observed behavior. Each first write per leg verified to target `127.0.0.1` / `localhost` (evidence below).
- **Roles:** super_admin (`admin@local.test`) and customer (`customer@local.test`), switched by clearing the local `sb-127-auth-token` cookie + re-login in one tab.
- **Scope lock honored:** localhost:3000 only; no navigation to prod / `*.supabase.co`; single walk tab; dev server NOT restarted; per-write 127.0.0.1 evidence captured. Only repo file created = this doc. Ad-hoc SQL logged in Appendix A. No commits, no push.
- **Verdicts:** PASS · PASS-DIRTY (works but violates an accounting/glossary/UX rule) · BLOCKED (UI exists, action fails) · MISSING (no path) · WORKAROUND · NOT-TESTABLE-LOCALLY.

> **Glossary rule under test:** customer/staff money copy should use canonical **เงินมัดจำจอง** (booking deposit) / **เงินมัดจำประกัน** (security deposit); for a **pure sale** there should be **no** booking-deposit wording at all.

---

## 0. Environment gate (run first)

| Check | Result |
|---|---|
| Browser tooling | **Claude-in-Chrome MCP** (`mcp__claude-in-chrome__*`). Playwright MCP present-but-deferred; NOT used. |
| Dev server `:3000` | ✅ up — `curl` → HTTP 200. NOT restarted. |
| Local Supabase | ✅ up — Docker `supabase_db_hop-rental` (+ studio/storage/auth/kong/rest) healthy 6 days; **119 migrations** applied. |
| **App-resolved Supabase URL** | ✅ **`http://127.0.0.1:54321`** — proven from live network capture: cart write hit `http://127.0.0.1:54321/rest/v1/carts`; auth cookie is `sb-127-auth-token`. |
| Remote calls | ✅ **zero** `*.supabase.co` requests observed in any leg (checked repeatedly). |
| External asset note | ⚠️ Product image loads from **`https://placehold.co`** (placeholder art) — an off-localhost GET for a decorative image only; no data leaves, no write. Noted for completeness. |
| Seeded accounts | `customer@local.test` (platform_role `customer`, id `1111…1111`) · `admin@local.test` (`super_admin`, id `2222…2222`). Local password set via SQL (Appendix A #1). |

---

## Section 1 — CURRENT FLOW MAP (as actually walked)

Pure-sale product: **แว่นตานิรภัย เลนส์ใส 3M** (`sku-027-default`), ฿90 (was ฿100, −10%), stock 10.

```
CUSTOMER                          DB WRITE (localhost)                 ADMIN SEES / DOES                 CUSTOMER SEES
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Browse product → เพิ่มลงตะกร้า    POST 127.0.0.1:54321/rest/v1/        —                                 cart badge +1
                                  carts (+ cart_items) [PostgREST]
                                  → cart_item ฿90 x1, disc 10%
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/user/cart:                       (read)                               —                                 ยอดซื้อรวม ฿90
  ยอดซื้อรวม ฿90                                                                                          + ค่าจัดส่ง ฿50
  ค่าจัดส่ง ฿50 (กล่อง S×1)                                                                               = ยอดรวมทั้งหมด ฿140  ✅ correct
  ยอดรวมทั้งหมด ฿140
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
select address + consent          POST localhost:3000/api/... (checkout)  —                              → /user/payments/[id]
→ ดำเนินการชำระเงิน               → orders(status=submitted,                                              "รอชำระเงิน" ฿140
                                    payment=awaiting_payment,
                                    inventory_applied_at=NULL)
                                    + order_items(1)
                                    + manual_payment_requests
                                      (source_type=sale_only, ฿140)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
upload slip → อัปโหลด             POST localhost:3000/api/user/        (slip on /admin/                  slip "รอตรวจสอบ";
                                  manual-payment-requests/[id]/slips   manual-payment-requests           ORDER LIST STILL
                                  → request=pending_review;            queue only)                       "รอชำระเงิน" (no
                                    ORDER STAYS awaiting_payment,                                         "under review" signal)
                                    inventory NOT applied  ✅
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
(wait)                            POST .../[id]/review → reviewed      admin: /admin/manual-payment-      order detail related-card
                                                                       requests/[id] → "Mark evidence    → "อัปโหลดแล้ว รอตรวจสอบ"
                                                                       reviewed"  (order still unpaid)    (list unchanged)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
(wait)                            POST .../orders/[id]/record-payment  admin: /admin/orders/[id] →        LIST: ชำระแล้ว
                                  → order confirmed + paid +           "Mark Payment Received"           DETAIL: "ชำระแล้ว …
                                    inventory_applied_at set;          (slip NOT visible on this page:    ขอบคุณ" (no fulfil/track)
                                    STOCK 10→9                         "Payment Slip Evidence (0)")
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
(wait)                            Save tracking → tracking_carrier/    admin: enter Flash Express /       LIST: จัดส่งแล้ว + carrier
                                  number; fulfillment                  TH-CASE1-A-0007; advance          + tracking + ship date  ✅
                                  unfulfilled→preparing→               fulfillment via 3 confirm-        DETAIL: still only "ชำระแล้ว"
                                  ready_for_carrier_pickup→shipped;    modals (tracking-note dialog)     — NO tracking/fulfil  ❌ (A7)
                                  shipped_at set
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DEAD-ENDS: no receipt, no tax invoice (0 sale docs); no self-service cancel; no delivered state; tracking never on detail.
```

**Reject branch (order B):** customer uploads slip → admin `Reject evidence` **with required reason** (`rejected_reason` saved on request + slip, mig-115) → order stays `awaiting_payment` → customer payment page shows **"หลักฐานไม่ผ่าน" + the reason text** + working re-upload dropzone → customer re-uploads → request back to `pending_review` (old slip stays `rejected`) → admin reviews + Mark Payment Received → confirmed/paid. **Full loop works** — but the rejection is invisible on the customer **order list** (still "รอชำระเงิน").

**Cancel-paid branch (order C):** admin Mark Payment Received (stock 9→8) → admin ORDER STATUS `→ cancelled` (no reason prompt, applied instantly) → order `cancelled` but **payment_status STILL `paid`**, **inventory_reversed_at NULL, stock NOT restored (stays 8)**, related payment request orphaned at `pending_review`. Customer LIST: "ยกเลิกแล้ว / ชำระแล้ว ฿140" (no refund note); customer DETAIL: badge shows **"ชำระแล้ว … ขอบคุณ"** with **no cancellation shown at all**.

---

## Section 2 — VERDICT TABLE

### Angle 1 — Customer

| Step | Verdict | Evidence |
|---|---|---|
| **C1** Browse → add → cart totals (pure sale; retest ฿1,800) | **PASS** | Sale summary ยอดซื้อรวม ฿90 + ค่าจัดส่ง ฿50 = **฿140** (correct). DB `order_items` ฿90, `orders.shipping_cost` 50, `grand_total` 140. The ฿1,800-style "รวมยอดชำระวันรับสินค้า" defect is **rental-only** and does not touch the sale summary (see Case-3 note). |
| **C2** Checkout: address, shipping, consent → place order | **PASS** | Address selectable (Default บ้าน) + branch-pickup option offered; ฿50 box-S shipping shown; consent gates the button; `ดำเนินการชำระเงิน` → order `submitted`/`awaiting_payment`, `manual_payment_requests` `sale_only` ฿140. Write → `localhost:3000/api/...`. |
| **C3** Pay: upload slip → status seen at each stage | **PASS-DIRTY** | Upload → payment-request page shows slip "รอตรวจสอบ"; request→`pending_review`; **order stays `awaiting_payment`, inventory not applied** (evidence-only ✅). DIRTY: the money note says "…รวมค่าสินค้า ค่าส่ง และ**เงินมัดจำจอง**แล้ว" on a pure sale (no booking deposit exists). |
| **C4** Status visibility as admin acts | **PASS-DIRTY** | Paid→shipped propagates to the **order list** (ชำระแล้ว → จัดส่งแล้ว + carrier + tracking). DIRTY/gaps: (a) after slip upload the **list still shows "รอชำระเงิน"** — no "under review" signal; (b) a **rejected** slip leaves the list at "รอชำระเงิน" (no reject signal on list); (c) order **detail** badge tracks only *payment_status* — see C5/A7. |
| **C5** Shipped/delivered — end state | **PASS-DIRTY** | Order LIST shows จัดส่งแล้ว + Flash Express + TH-CASE1-A-0007 + ship date ✅. DIRTY: **order DETAIL page shows no tracking, no carrier, no fulfillment status** (A7 gap, unchanged). No distinct "delivered" state — flow ends at `shipped`; customer never confirms receipt. |
| **C6** After-sales: cancel (contact-admin) + tax invoice | **MISSING** | Order detail has **no cancellation request path** and **no "contact admin about this order"** link — only the global header `ติดต่อฝ่ายขาย`. Self-service cancel is intentionally absent (DECISIONS: support-only), but there is no order-scoped support handoff either. **No tax-invoice and no receipt path** anywhere (A8/A9 unchanged — see D6). |

### Angle 2 — Admin

| Step | Verdict | Evidence |
|---|---|---|
| **D1** Order appears — findable by what? | **PASS** | `/admin/orders` search placeholder "Order #, customer, phone…". Partial order-# `3F3EE3` → exactly order B. Phone `0800000001` → all 5 of that customer's orders. Order appears immediately in the **รอชำระ** queue (count 3). |
| **D2** ACCEPT two-step (review → payment received) | **PASS-DIRTY** | Step 1 `/admin/manual-payment-requests/[id]` → "Mark evidence reviewed" (POST `.../review` 200); order stays unpaid. Step 2 `/admin/orders/[id]` → "Mark Payment Received" (POST `.../record-payment` 200) → confirmed/paid, inventory applied, **stock 10→9**. DIRTY (confusion trap): the order page shows **"Payment Slip Evidence (0) — No payment slip uploaded"** even though the customer uploaded one — the real slip lives only on the payment-request queue, reachable via a small "Related payment request → Open" link. Staff must know to leave the order page to actually see the slip, then return to confirm. |
| **D3** REJECT path (reason saved? customer sees? re-upload? accept?) | **PASS** | `Reject evidence` requires a **reason** ("Reject reason (required to reject)"). DB: request + slip → `rejected`, `rejected_reason` saved, `rejected_by`/`rejected_at` set (mig-115). Order stays `awaiting_payment`. Customer payment page shows **"หลักฐานไม่ผ่าน" + the reason** + re-upload dropzone. Re-upload → request `pending_review` (old slip stays `rejected`). Admin re-review + Mark Payment Received → **confirmed/paid**. Full loop verified. Caveat: reject is invisible on the customer order **list** (still "รอชำระเงิน"). |
| **D4** Fulfillment: preparing → ready → shipped + tracking | **PASS** | Save tracking (Flash Express / TH-CASE1-A-0007); fulfillment advanced via confirm-modals `unfulfilled→preparing→ready_for_carrier_pickup→shipped`, `shipped_at` set. Tracking pre-fills into each fulfillment dialog. |
| **D5** CANCEL a PAID order — real behavior | **BLOCKED / BUG** (mechanics run; side-effects wrong) | ORDER STATUS `→ cancelled` applies instantly, **no reason prompt** (`orders` has no cancel/reason column). Result: order `cancelled` but **payment_status STILL `paid`** (no refund, `payment_refunds` count 0, no reversal), **`inventory_reversed_at` NULL and stock NOT restored** (stayed 8; final-stock arithmetic 10−3=7 for only 2 live sales confirms the lost unit), related payment request orphaned at `pending_review`. Customer detail hides the cancellation entirely (shows "ชำระแล้ว … ขอบคุณ"). |
| **D6** Documents: receipt on the sale | **MISSING** | No receipt/print/document control on admin order page or customer order page. `official_documents` holds only 2 rows, both `rental_booking_deposit_confirmation` (BDC-202607-0001/0002) — **zero sale documents**. Document engine exists (rental BDC) but nothing issues a sale receipt or tax invoice. |

### Angle 3 — Order-management surface

| Step | Verdict | Evidence |
|---|---|---|
| **E1** Search: order # / phone / name / partial | **PASS** | Partial order-# (`3F3EE3`) and phone (`0800000001`) both filter correctly; placeholder also advertises customer name. Search reflected in URL `?search=`. |
| **E2** Filters: status / payment / fulfillment / date | **PASS** | Controls present: Search, Date from, Date to, Order status, Payment status, Fulfillment status. |
| **E3** Work queue: what needs staff now? counts/badges | **PASS** | Named queues with live counts: **ต้องจัดการ** (paid & to prepare) · **ต้องจัดส่ง** (to ship) · **ลูกค้ารับเอง** (branch pickup) · **รอชำระ** (awaiting/verify) · **ทั้งหมด**. Counts re-scope with the active search. |
| **E4** Columns: payment vs fulfillment at a glance; amounts | **PASS** | Columns ORDER · CUSTOMER · FULFILLMENT · STATUS · AMOUNT; each row carries three distinct badges (e.g. `paid` / `unfulfilled` / `confirmed`) + correct ฿ amount. |
| **E5** What admin CANNOT do from this surface | **MISSING (ops gaps)** | No **bulk actions** (multi-select/confirm/ship), no **export** (CSV/print), no **internal notes** on an order (only per-status "note to customer" dialogs), no **reassign/owner**, and the **payment slip is not viewable from the order surface** (must open the separate payment-request queue). The 3 identical ฿140 requests are **indistinguishable in the payment-request list** (no order #/customer column). |

### Angle 4 — Money & ledger

| Step | Verdict | Evidence |
|---|---|---|
| **M1** Correct tables/amounts, no rental events | **PASS** | Pure sale wrote only `orders` + `order_items` + `manual_payment_requests`(sale_only) + slips. `rental_held_balance_events` created in the whole session = **0**. Inventory deducted only on payment confirm (RPC); amounts ฿90+฿50=฿140 consistent across cart, order, request, slip. |
| **M2** Glossary on customer money copy | **PASS-DIRTY** | Sale cart/summary clean (no มัดจำ). BUT the shared payment-request template injects booking-deposit wording into a pure sale: customer page "…รวม… และ**เงินมัดจำจอง**แล้ว"; admin review note "may cover both product/shipping payment and **Booking Deposit**". Wrong for sale_only. |
| **M3** End-to-end financial trail (accountant view) | **PASS-DIRTY / GAP** | Happy path is reconstructable: `order_items` (what), `orders.grand_total` (how much), `payment_status=paid` + reviewed request + retained slip (proof). GAPS: (a) **no VAT breakdown** despite company being VAT-registered (`จดทะเบียนภาษีมูลค่าเพิ่มแล้ว`, tax id 0105564155415) — no `vat_amount` on the sale; (b) **no receipt/tax-invoice number** issued; (c) a **cancelled-but-paid** order leaves ฿140 recorded as collected with **no refund entry** → the ledger would overstate revenue with no offset. |

---

## Section 3 — ANALYSIS (ordered by severity)

### BUGS (broken — real behavior is wrong)

1. **Cancelling a PAID sale order does not restore inventory (data-integrity).** `→ cancelled` sets `orders.status=cancelled` but leaves `inventory_applied_at` set, `inventory_reversed_at` NULL, and the deducted unit is **not returned to stock** (proven: 10 − 3 deductions = 7 with only 2 live sales; the cancelled unit is lost). The `inventory_reversed_at` column exists in schema but the cancel action never fires the reversal RPC. **Blocks real staff:** every cancelled-after-paid order silently under-reports available stock; over time inventory drifts and items falsely read out-of-stock. **Does not block the customer**, but corrupts ops data.
2. **Cancelling a PAID order leaves `payment_status = paid` with no refund record (money-integrity).** No `payment_refunds` row, no reversal, related payment request orphaned at `pending_review`. The customer's own list shows "ยกเลิกแล้ว / **ชำระแล้ว** ฿140" with no refund; the customer **detail** page shows only "ชำระแล้ว … ขอบคุณ" and **hides the cancellation entirely**. **Blocks trustworthy accounting and customer clarity today** — money is recorded as collected against a cancelled order with no offsetting entry and no customer-facing explanation.
3. **Customer order DETAIL page badge reflects only `payment_status`, ignoring order-status and fulfillment (A7, widened).** Shipped order A detail shows "ชำระแล้ว" with **no tracking/carrier/fulfillment**; cancelled order C detail shows "ชำระแล้ว … ขอบคุณ" with **no cancellation**. Tracking exists only on the **list**. **Does not hard-block** (list carries the truth) but the detail page actively misleads for shipped and cancelled orders.

### WEAKNESSES (works but risky/confusing)

4. **Two slip surfaces on the sale side (confusion trap for D2).** The customer's slip lands in `manual_payment_request_slips` (visible only on `/admin/manual-payment-requests`), while both the admin **and** customer **order** pages read the legacy `sale_order_payment_slips` and show **"Payment Slip Evidence (0) — no slip"**. Staff confirming payment see an empty slip panel on the order they are paying; they must know to open "Related payment request". Mirrors the B6 rental two-surface finding. **Does not block** (proven path works) but is a real staff trap. Decide whether to unify.
5. **Rejection & "under review" are invisible on the customer order LIST.** After upload the list stays "รอชำระเงิน" (no "under review"); after a **reject** it also stays "รอชำระเงิน" (no reject signal). The reason + re-upload path exist, but **only** on the specific `/user/payments/[id]` page. A customer watching their order list has no cue that action is needed. **Risks** repeated uploads / abandoned orders.
6. **Cancelling an order captures no reason.** Unlike slip-reject (reason required), ORDER STATUS `→ cancelled` applies instantly with no prompt and `orders` has no cancel-reason column — no audit trail for why a paid order was voided.
7. **No order-scoped support/cancel handoff (C6).** Self-service cancel is intentionally support-only, but the order pages offer no "contact us about this order" affordance — only the global header link.
8. **Order-management ops gaps (E5).** No bulk actions, no export, no internal order notes, no slip preview from the order surface; the payment-request list can't distinguish multiple same-amount requests (no order#/customer column).

### MONEY GAPS

9. **No fiscal documents for sales (A8/A9 unchanged, D6 MISSING).** No sale receipt, no tax invoice, no VAT breakdown — despite VAT registration shown on the payment page. Confirms the 2026-07-08 launch audit R2 and the 2026-07-09 A8/A9. **Launch-blocking for a VAT-registered seller.**
10. **Booking-deposit wording bleeds into pure-sale money copy (M2).** Shared payment-request template shows "เงินมัดจำจอง" to customers and "Booking Deposit" to admins on `sale_only` requests. Cosmetic but erodes trust and glossary discipline.
11. **Cancelled-paid orders overstate collected revenue with no offset (M3).** Direct consequence of BUG #2 — the financial trail an accountant reconstructs would count ฿140 as revenue for a cancelled order.

### What blocks whom, today
- **Blocks a real customer:** nothing hard-blocks completing a purchase (browse→pay→shipped works). Confusing: no rejection signal on the list (#5); shipped/cancelled state hidden on detail (#3); no receipt/tax invoice (#9).
- **Blocks real staff / accounting:** cancel-paid inventory loss (#1) and money-still-paid-no-refund (#2/#11) are the launch-critical ops bugs; empty slip panel on the order page (#4) is a daily confusion trap; missing fiscal docs (#9) block a compliant sale.

---

## Section 4 — Case-3 retest list (when rental lines coexist)

1. **Cart "รวมยอดชำระวันรับสินค้า" subtotal bug** — CONFIRMED still present in a mixed cart this session: ค่าเช่า ฿10,000 + เงินมัดจำประกันคงเหลือ ฿1,500 but pickup-day total shown **฿1,500** (omits the ฿10,000 rental; expected ฿11,500). Same defect class as B6 Appendix D (฿1,800). Re-verify on the mixed checkout.
2. **Mixed payment request** — Case 1 isolated a `sale_only` request (isolation via Appendix A #2). Re-verify `source_type=mixed`: one request covering sale ฿140 + booking deposit, the combined "ยอดที่ต้องโอนตอนนี้", and that the booking-deposit wording in the money note is now **correct** (it was wrong for pure sale, M2).
3. **Rental line math oddity** — the ฿10,000 rental line showed "3 วัน × ฿500 = ฿1,500" beside "ค่าเช่ารวม ฿10,000" (line breakdown ≠ total). Re-verify in Case 3.
4. **Booking-deposit tier** — the ฿10,000 booking (~88 days out) prefilled Booking Deposit **฿500**, not the ≥30-day ฿1,000 tier. Re-check the 3-tier formula input against `f7caf85`.
5. **Inventory-reversal on cancel** — re-verify whether a mixed order's cancel restores sale stock AND unwinds the rental held-balance liability (BUG #1/#2 in a mixed context).
6. **Slip-surface unification** — with a mixed request, confirm which of the two slip surfaces the admin booking page vs order page each read.

---

## Appendix A — Ad-hoc SQL executed (local DB only, `docker exec … psql`)

1. **Set known local password on seeded accounts** (login as both roles; prior password unrecorded):
   `UPDATE auth.users SET encrypted_password = crypt('<local-test password — session notes only>', gen_salt('bf')), updated_at=now(), <token cols coalesced to ''> WHERE email IN ('customer@local.test','admin@local.test');` — auth-only, no app data touched.
2. **Reversible pure-sale isolation** (customer cart held 2 pre-existing rental drafts that block the unified checkout): temporarily reassigned drafts `ea89922c…` and `66666666…000000000500` from customer → admin (`UPDATE public.rental_bookings SET user_id='2222…' WHERE …`), ran the pure-sale checkout, then **restored** both to the customer (`SET user_id='1111…'`). Verified restored: both back to `user_id=1111…1111`, `status=draft`. No status or amount changed.

All other SQL was **read-only** (schema/column introspection; pre/post-write verification of `orders`, `order_items`, `product_skus.stock`, `manual_payment_requests`, `manual_payment_request_slips`, `rental_held_balance_events`, `payment_refunds`, `official_documents`).

## Appendix B — Test data created this session (local; NOT cleaned up, per instruction)

| Entity | Identifier | Final state |
|---|---|---|
| Sale order A (ACCEPT + fulfil) | `ORD-20260713221735-566500` / `8ed11aa9-…` | **confirmed / paid / shipped**, Flash Express `TH-CASE1-A-0007`; request `847f0d0d` reviewed; slip `case1-sale-slip.jpg` |
| Sale order B (REJECT→re-upload→ACCEPT loop) | `ORD-20260713222323-3F3EE3` / `8f655224-…` | **confirmed / paid / unfulfilled**; request `c8f2b615` reviewed; slips: `case1-orderB-slip.jpg` (rejected, reason saved), `case1-orderB-reupload.jpg` (reviewed) |
| Sale order C (CANCEL-paid) | `ORD-20260713222547-8CEA44` / `b328a2f8-…` | **cancelled** but **payment_status=paid**, inventory NOT reversed; request `b2b514cc` orphaned at `pending_review`; slip `case1-orderC-slip.jpg` |
| Inventory | `sku-027-default` (3M safety glasses) | stock **10 → 7** (A −1, B −1, C −1; C's unit **not** restored on cancel = BUG #1) |
| Ledger | `rental_held_balance_events` | **0** new rows (pure-sale invariant held) |
| Customer cart | — | empty (all checkouts consumed) |

## Appendix C — Screenshot / evidence note

Durable evidence in this doc = DB state (psql pre/post), per-write network-target captures (`127.0.0.1:54321/rest/v1/…`, `localhost:3000/api/…`, zero `*.supabase.co`), and page-text snapshots. Screenshots were captured inline in-session (Chrome-MCP `save_to_disk` path not persisted in this integration; no files written under `docs/audit/screenshots/`).

## Appendix D — Per-leg scope (first-write) network evidence

| Leg | First write | Target | `*.supabase.co` |
|---|---|---|---|
| C1 add-to-cart | `carts`/`cart_items` insert | `http://127.0.0.1:54321/rest/v1/carts` | 0 |
| C2 place order | checkout | `http://localhost:3000/api/...` (→ `/user/payments/[id]`) | 0 |
| C3 slip upload | slip POST | `http://localhost:3000/api/user/manual-payment-requests/[id]/slips` | 0 |
| D2 review | evidence review | `http://localhost:3000/api/admin/manual-payment-requests/[id]/review` | 0 |
| D2 pay / D4 / D5 | order mutations | `http://localhost:3000/api/admin/orders/[id]/...` | 0 |
