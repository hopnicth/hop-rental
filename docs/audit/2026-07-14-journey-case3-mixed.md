# Customer-Journey Audit — Case 3 of 3: MIXED (SALE + RENTAL)

- **Status:** COMPLETE. Two mixed transactions driven live end-to-end: **A** (happy path: build → checkout → accept → fulfil → pickup-block) and **B** (disposable, driven to accepted then cancelled). Customer legs X1–X5, admin legs Y1–Y5, surfaces Z1–Z2, money/ledger V1–V3 all covered. Closes the 3-case set.
- **Core question answered:** the system treats a mixed order as **one coherent transaction for the money** (one payment request, one slip, one ฿340, correct allocation) but as **two systems stapled together for the work** (accept = 3 manual actions across 3 pages; cancel half-cancels; surfaces fragmented; order↔booking linked only via the shared request).
- **Date walked:** 2026-07-14.
- **Method:** LIVE — Claude-in-Chrome MCP against `http://localhost:3000` on the **local** Supabase stack. First write per leg verified localhost (Appendix D). Roles switched by clearing `sb-127-auth-token` + re-login.
- **Scope lock honored:** localhost:3000 only; zero `*.supabase.co`; dev server NOT restarted; ad-hoc SQL logged (Appendix A); only file created = this doc; no commit/push. **`66666666…` untouched** (reversibly isolated by user_id, restored).
- **Inline marks:** 🔴 BUG (B#) · 🟡 WEAK (W#) · 🔍 OBS (O#). IDs traceable flow → verdict → analysis.

---

## 0. Environment gate

| Check | Result |
|---|---|
| Browser tooling | Claude-in-Chrome MCP (disconnected once mid-walk, reconnected). |
| Dev server `:3000` | ✅ HTTP 200; NOT restarted. |
| Local Supabase | ✅ `supabase_db_hop-rental` healthy; 119 migrations. |
| App-resolved URL | ✅ `127.0.0.1:54321` (cart write hit it; cookie `sb-127-auth-token`). |
| Remote calls | ✅ zero `*.supabase.co`. |
| Fixtures | sale `3M-SAFETY-GLASSES-CLR` ฿90 (stock 7 at start); asset `local-test-excavator` (daily ฿500, security ฿2,000). Calendar disables dates overlapping existing bookings 🔍O0 (availability blocking works). |

---

## Section 1 — FLOW MAP (inline marks)

Two mixed transactions, each = 1 sale item (฿90) + 1 rental (3-day, ฿200 tier).

```
CUSTOMER                              DB / LEDGER (localhost)                   ADMIN sees / does                     CUSTOMER sees
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X1 build mixed cart                   (drafts + cart_item)                      —                                     Sale ฿90+฿50=฿140 ✅; Rental
   (sale ฿90 + rental Jul24-26)                                                                                       Booking Deposit ฿200 ✅;
                                                                                                                      pay-now ฿340 ✅. 🔴B1 "รวมยอด
                                                                                                                      ชำระวันรับสินค้า ฿1,800" omits
                                                                                                                      ฿1,500 rental (cart-only). 🔍O1
                                                                                                                      "…หน้าชำระเงิน…แยกกัน" note
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X2 choose branch-pickup for sale      (read)                                    —                                     ค่าจัดส่ง → ฟรี; sale ฿90;
                                                                                                                      pay-now ฿290 ✅ (pickup removes
                                                                                                                      the ฿50 shipping — A2 answered)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X3 checkout (delivery mode)           → ONE request fc5587f9 (source=mixed,     —                                     "รอชำระเงิน": ค่าสินค้าและค่าจัดส่ง
   branch + consent + proceed          ฿340); items: sale_order ฿140 +                                                ฿140 + เงินมัดจำจอง ฿200 = ฿340 ✅.
                                       rental_booking_deposit ฿200; order                                             Note "…ค่าสินค้า ค่าส่ง และเงินมัดจำ
                                       submitted/awaiting_payment (inv null);                                         จอง" 🔍O2 CORRECT for mixed (the
                                       booking draft/unpaid; end_date 27 🔴B3    generic template is the mixed one)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X4 upload slip → อัปโหลด              POST .../manual-payment-requests/          (slip on central queue)               Order detail + rental detail BOTH
                                       fc5587f9/slips (200); request→             show shared request "อัปโหลดแล้ว
                                       pending_review; order + booking BOTH        รอตรวจสอบ · ฿340" ✅ consistent (X4)
                                       stay pre-payment ✅ (one slip covers both)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X5 history                            (read)                                     —                                     Order list: standalone ฿140 sale.
                                                                                                                      Rental list: standalone booking.
                                                                                                                      🟡W3 NO unified view — linked only
                                                                                                                      via the ฿340 request
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Y1 request queue / order / booking    (read)                                    Request detail: allocation table      —
                                                                                 shows BOTH (order ฿140 + deposit
                                                                                 ฿200) ✅ Z2. Order page: "Related
                                                                                 payment request: mixed ฿340" but
                                                                                 no direct booking link 🟡W1
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Y2 ACCEPT (transaction A)             step1 review → reviewed                    Staff must act 3× across 3 pages:     —
   █ 3 SEPARATE ACTIONS █             step2 order record-payment → order          (1) Mark evidence reviewed [request]
                                       confirmed/paid, STOCK 7→6, inv set;         (2) Mark Payment Received [order]
                                       BOOKING UNTOUCHED (draft, 0 held) 🔴B5      (3) Mark Deposit Received [booking]
                                       step3 booking record-deposit → confirmed,   Forget step 3 → ฿200 collected in
                                       booking_deposit_collection ฿200 posted      the ฿340 but booking stuck draft 🔴B5
                                       request→reviewed (no settled state) 🟡W2
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Y3 fulfil sale (→preparing)           order fulfillment=preparing;               advance sale independently            (list would show progress)
                                       BOOKING unaffected (confirmed/฿200) ✅      (full ship proven Case-1)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Y4 CANCEL mixed ORDER (transaction B, accepted then cancelled) — BLAST RADIUS:
   (a) 🔴 sale stock NOT restored (5→5; inventory_reversed_at false)        [Case-1 inherited]
   (b) 🔴 order cancelled but payment_status STILL paid; no refund          [Case-1 inherited]
   (c) 🔴 BOOKING STILL confirmed, ฿200 deposit still posted — untouched    [MIXED-SPECIFIC: half-cancel]
   (d) 🔴 shared request STILL mixed/pending_review — orphaned
   ⇒ one ฿340 payment → cancelled-but-paid ฿140 order + LIVE ฿200 confirmed booking; no unified cancel 🔴B4
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Y5 pickup on mixed booking (A)        POS V3 resolve b4aefb41 → Classification:  quick check — same block              —
                                       blocked, remaining security ฿1,800; same
                                       customer, kyc_profiles=0 → same 422 KYC
                                       dead-end as Case-2 B6 (not re-driven) 🔴(inh)
```

---

## Section 2 — VERDICT TABLE

### Angle 1 — Customer
| Step | Verdict | Evidence / marks |
|---|---|---|
| **X1** mixed cart every number | **PASS-DIRTY** | Sale ฿90+฿50=฿140 ✅; rental Booking Deposit ฿200 ✅; combined pay-now ฿340 ✅. 🔴**B1** pickup-day subtotal ฿1,800 omits ฿1,500 rental (cart-only, INHERITED). 🔍O1 "separate pages" note. |
| **X2** branch-pickup removes shipping? | **PASS** | Selecting "รับสินค้าที่สาขาพร้อมการจอง" → ค่าจัดส่ง **ฟรี**, sale ฿90, pay-now ฿290. The long-open A2 mixed question: **YES, pickup removes the ฿50 shipping.** |
| **X3** ONE mixed request; pay-now correct; note wording | **PASS** | ONE request `fc5587f9` source=mixed ฿340; items sale_order ฿140 + rental_booking_deposit ฿200; pay-now = sale + booking deposit only (**no security**). 🔍**O2** money note correct for mixed (the generic note was the mixed one). |
| **X4** slip status on BOTH surfaces | **PASS** | Both order-detail and rental-detail show the same shared request "อัปโหลดแล้ว รอตรวจสอบ · ฿340"; order + booking both stay pre-payment (evidence-only). Consistent. |
| **X5** history: one thing or two? | **WEAK** | 🟡**W3** order list shows a standalone ฿140 sale; rental list shows a standalone booking; **no unified transaction view** — the only linkage is the ฿340 shared payment request. |

### Angle 2 — Admin
| Step | Verdict | Evidence / marks |
|---|---|---|
| **Y1** what lands where; cross-reference | **PASS-DIRTY** | Order page shows "Related payment request: mixed ฿340" (the ฿340, not ฿140, flags it as mixed) but 🟡**W1** no direct order→booking link; cross-ref only via the request. |
| **Y2** accept: one action or two? | **BUG (process)** | 🔴**B5** THREE separate actions across three pages for one payment: Mark evidence reviewed → **Mark Payment Received** (order paid, stock −1, **booking untouched: draft, 0 held**) → **Mark Deposit Received** (booking confirmed, held ฿200). Forgetting step 3 leaves the customer's ฿200 (inside the paid ฿340) collected with the booking stuck draft. No "accept mixed" action. |
| **Y3** fulfillment split independence | **PASS** | Order → preparing while booking stays confirmed/paid ฿200 — halves advance independently, no corruption. |
| **Y4** cancel mixed order — blast radius | **BUG (combined)** | 🔴**B4** (a) stock NOT restored (b) order payment stays `paid`, no refund (c) **booking stays confirmed + ฿200 held — untouched** (d) request stays pending_review. One ฿340 → cancelled-but-paid ฿140 order + LIVE ฿200 booking. Half-cancel; no unified cancel. |
| **Y5** pickup KYC block on mixed booking | **BLOCKED (inherited)** | POS V3 classification=blocked; same customer, `kyc_profiles`=0 → identical Case-2 B6 422 KYC dead-end. The rental half of every mixed transaction is unpickable. |

### Angle 3 — Surfaces
| Step | Verdict | Evidence / marks |
|---|---|---|
| **Z1** orders list + Booking Manager consistent? | **BUG (inherited)** | For transaction A: request ฿340 · order list ฿140 · Booking Manager ฿1,500 (rental total) + **"deposit unpaid"** badge despite the ฿200 deposit being paid (🔴**B2** INHERITED). No surface shows the ฿340 total or reconciles the halves; each shows its own slice. |
| **Z2** can staff see a mixed request covers both? | **PASS** | Request detail has an **allocation table** naming both (Sale order ORD-…E2588F ฿140 + Rental booking deposit รถขุดทดสอบ ฿200) + a note directing "Mark Payment Received / Mark Deposit Received". Better than the Case-1 E5 same-amount ambiguity. |

### Angle 4 — Money & ledger
| Step | Verdict | Evidence / marks |
|---|---|---|
| **V1** full happy-path ledger | **PASS (reconciles)** | One ฿340 → order ฿140 paid (goods ฿90 + shipping ฿50), stock −1; `booking_deposit_collection` ฿200 posted, booking confirmed; ฿140 + ฿200 = ฿340 ✅. Split lands in `orders` vs `rental_held_balance_events`, joined only by the request. |
| **V2** retest disposition | see **Section 4** | — |
| **V3** accountant single-event reconstruction | **PASS-DIRTY** | The ฿340 IS reconstructable into ฿140 sale + ฿200 deposit-liability, but the trail **splits into two subsystems** with the shared request as the only join; on cancel the halves diverge (cancelled-paid order + live booking) and the request never reaches a settled state — the reconciliation breaks at the cancel/settle boundary. |

---

## Section 3 — ANALYSIS

### MIXED-SPECIFIC failures (broken only when sale + rental are combined)
1. 🔴**B4 (Y4) — Cancelling a mixed order half-cancels the transaction.** ORDER STATUS → cancelled cancels only the sale; the rental booking stays **confirmed with the ฿200 deposit held**, the shared request stays `pending_review`. One ฿340 payment ends as a cancelled-but-paid ฿140 order **plus** a live ฿200 booking. There is **no unified cancel** — to void the whole transaction staff must separately cancel the booking (itself a raw flip that strands the deposit, Case-2 B7). *Blocks correct handling of any mixed cancellation/refund.*
2. 🔴**B5 (Y2) — Accepting a mixed payment takes three manual actions across three pages.** One customer payment (one slip, ฿340) requires: Mark evidence reviewed (request) → Mark Payment Received (order) → Mark Deposit Received (booking). Mark Payment Received settles **only** the sale (proven: booking stayed draft with 0 held events). If staff stop there, the customer's ฿200 deposit (inside the collected ฿340) is received but the booking is stuck `draft`/`unpaid`. *High operational-error risk; no single "accept this payment" action.*
3. 🟡**W3 (X5/Z1) — The mixed transaction is fragmented across surfaces.** Customer order list (฿140), customer rental list, admin orders (฿140), admin Booking Manager (฿1,500) — four views, four numbers, none showing the ฿340 transaction total. The only connective tissue is the shared payment request. No "this order + this booking = one purchase" view for customer or staff.
4. 🟡**W1 (Y1) — order↔booking cross-reference is indirect only.** Each half's page shows "Related payment request: mixed ฿340" (openable) but neither links directly to the other half; staff must go through the request to see the sibling.

### INHERITED (already known from Cases 1–2, confirmed to also apply in mixed)
5. 🔴**B1** — cart pickup-day subtotal omits the rental (cart-only; detail pages correct). *Case 1/2.*
6. 🔴**B2 (Z1)** — Booking Manager shows "deposit unpaid" on a deposit-paid booking; amount = rental total, neither deposit shown. *Case 2.*
7. 🔴**B3 (X3)** — end-date exclusive in DB/admin (27) vs inclusive to customer (26). *Case 2.*
8. 🔴**Y4a/b** — cancel does not restore sale stock and leaves order `paid` with no refund. *Case 1.*
9. 🔴**Y5** — pickup dead-ends at the KYC 422 gate (same customer, 0 KYC profiles); the rental half is unpickable. *Case 2 (the launch blocker).*
10. 🟡**W2** — shared request never reaches a settled/paid terminal state (stays `reviewed`/`pending_review` after both halves settle). *Cases 1/2 orphan.*

### MONEY GAPS
11. 🔴 **Release side of the rental ledger still never fires** — system-wide `settlement_application`/`refund`/`forfeiture` = 0; the mixed cancel (Y4) confirms it: the ฿200 held deposit on the cancelled transaction's booking is neither refunded nor forfeited. *Case 2, reconfirmed.*
12. 🔴 **No fiscal/deposit documents for the mixed transaction** — the sale half issues no receipt/tax invoice (Case-1 A8/A9); the rental half issues an RBK only on customer self-issue and never a BDC (Case-2 B5). One mixed purchase produces **zero automatic documents**.

**Blocks-whom:** the mixed-specific process bugs (B4 half-cancel, B5 three-step accept) *block correct staff handling* of any mixed order today; the inherited KYC dead-end (Y5) *blocks the rental half of every mixed transaction from ever completing*. The money-in path (X1–X4, V1) is correct and does **not** block the customer.

---

## Section 4 — Retest-list disposition

### From Case-1 §4
| Item | Status |
|---|---|
| Cart pickup-day subtotal omits rental (B1) | **STILL-PRESENT** (mixed cart: ฿1,800, omits ฿1,500) |
| Mixed payment request (source_type=mixed) | **CONFIRMED** — ฿340, links order+booking, allocation table, note correct |
| Two-slip surface in mixed | **STILL-PRESENT** — order page "Payment Slip Evidence (0)" + booking page "Deposit Slip Evidence (0)"; real slip on central queue |
| BDC/RBK/sale-receipt in one mixed transaction | **STILL-PRESENT** — 0 sale docs (A8/A9), no auto BDC; RBK only via self-issue (Case-2 B5) |
| End-date convention for mixed rental (B3) | **STILL-PRESENT** — stored 27 for a 24–26 booking |

### From Case-2 §5
| Item | Status |
|---|---|
| Mixed cart B1 + mixed money-note wording | **B1 STILL-PRESENT; note CONFIRMED-CORRECT for mixed** (W2/M2 from pure cases were the mixed note reused verbatim) |
| Two-slip surface in mixed | **STILL-PRESENT** (see above) |
| BDC vs RBK vs sale receipt in mixed | **STILL-PRESENT** — zero automatic documents for the mixed purchase |
| End-date convention (B3) mixed | **STILL-PRESENT** |
| Can mixed reach pickup given KYC dead-end? | **CONFIRMED NO** — Y5 same 422 block |
| Line sub-breakdown "3 วัน × ฿500" oddity | **N-A here** (my mixed rental was daily 3-day → sub-line correct; the oddity is monthly-priced 20-day, unchanged from Case 2) |

---

## Appendix A — Ad-hoc SQL (local only)
1. Local password on seeded accounts (login both roles) — auth only.
2. **Reversible isolation:** reassigned pre-existing drafts `ea89922c…` + `66666666…` (paid_confirm_failed evidence) user_id customer→admin so the mixed cart contained only walk-created lines; **restored both to the customer** at the end (confirmed `66666666` still `paid_confirm_failed`, ฿500 — untouched).

All other SQL read-only (pre/post verification of `orders`, `rental_bookings`, `rental_held_balance_events`, `manual_payment_requests(_items/_slips)`, `product_skus.stock`).

## Appendix B — Test data created/changed (local; NOT cleaned up)

| Entity | Id | Final state |
|---|---|---|
| Mixed request A (happy) | `fc5587f9-…` | mixed, **reviewed**, ฿340, 1 slip |
| Sale order A | `8bc9c10e-…` (ORD-…E2588F) | **confirmed / paid / preparing**, stock −1 |
| Rental booking A | `b4aefb41-…` | **confirmed / deposit paid ฿200** (held event posted); pickup blocked (KYC) |
| Mixed request B (cancel test) | `84963247-…` | mixed, **pending_review**, ฿340, 1 slip (orphaned) |
| Sale order B | `997eec9e-…` (ORD-…1F7007) | **cancelled but payment_status paid**, stock NOT restored |
| Rental booking B | `1abb5868-…` | **still confirmed / deposit paid ฿200** (orphaned from cancelled order) |
| Inventory | `sku-027-default` | 7 → **5** (A −1, B −1; B cancel did NOT restore) |

## Appendix C — Ledger reality (system-wide, end of Case 3)
`booking_deposit_collection` = 10 · `remaining_security_deposit_collection` = 1 · `settlement_application`/`refund`/`forfeiture` = **0** (release side still dead).

## Appendix D — Per-leg network evidence (first write)
| Leg | First write | Target | `*.supabase.co` |
|---|---|---|---|
| X1 add rental draft | draft-checkout-state | `http://localhost:3000/api/rental-bookings/draft-checkout-state` (200) | 0 |
| X1 add sale | carts | `http://127.0.0.1:54321/rest/v1/carts` | 0 |
| X3 checkout | (proceed) | `http://localhost:3000/...` → `/user/payments/fc5587f9` | 0 |
| X4 slip | slip POST | `http://localhost:3000/api/user/manual-payment-requests/fc5587f9/slips` (200) | 0 |
| Y2 review | review | `http://localhost:3000/api/admin/manual-payment-requests/fc5587f9/review` | 0 |
| Y2 order paid | record-payment | `http://localhost:3000/api/admin/orders/8bc9c10e/record-payment` (200) | 0 |
| Y2 deposit | record-deposit | `http://localhost:3000/api/admin/rental-bookings/b4aefb41/record-deposit` (200) | 0 |
| Y4 cancel | order status | `http://localhost:3000/api/admin/orders/997eec9e/...` | 0 |
| Y5 pickup readiness | pos-v2 readiness | `http://localhost:3000/api/admin/pos-v2/rental-bookings/b4aefb41/pickup-readiness` (200) | 0 |
