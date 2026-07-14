# Customer-Journey Audit — Case 2 of 3: RENTAL ONLY

- **Status:** COMPLETE. Full rental lifecycle walked to the furthest reachable point. Customer legs R1–R6, admin legs A1–A6, Booking-Management surface G1–G5, and money/ledger L1–L3 all driven live. **The lifecycle dead-ends at B7 pickup (server 422 KYC gate); B9 return is unreachable** — documented from the model + read-only inspection.
- **Date walked:** 2026-07-14.
- **Method:** LIVE walkthrough — real UI clicked in a browser (**Claude-in-Chrome MCP**, not Playwright) against `http://localhost:3000` on the **local** Supabase stack. Code/schema read only to explain behavior. First write per leg verified to target `127.0.0.1`/`localhost` (Appendix D).
- **Roles:** super_admin (`admin@local.test`) + customer (`customer@local.test`), switched by clearing the local `sb-127-auth-token` cookie + re-login in one tab.
- **Scope lock honored:** localhost:3000 only; no `*.supabase.co`; single tab; dev server NOT restarted; ad-hoc SQL logged (Appendix A); only file created = this doc; no commit/push. **`66666666…` (paid_confirm_failed) NOT repaired** — inspected read-only.
- **Verdicts:** PASS · PASS-DIRTY · BLOCKED · MISSING · WORKAROUND · NOT-TESTABLE-LOCALLY.
- **Inline marks (referenced flow → verdict → analysis):** 🔴 BUG (B#) · 🟡 WEAK (W#) · 🔍 OBS (O#).

> **Locked facts (from code):** 3-tier booking deposit is by **rental days** — `rentalDays >= 30 ? 1000 : >= 15 ? 500 : 200` (`app/utils/rental-payment-lines.ts:147`). Held-event types defined (mig-094): `booking_deposit_collection`, `remaining_security_deposit_collection`, `settlement_application`, `refund`, `forfeiture` (+2 reserved). Only 1 rental asset exists locally (`local-test-excavator`, daily ฿500, security ฿2,000).

---

## 0. Environment gate

| Check | Result |
|---|---|
| Browser tooling | **Claude-in-Chrome MCP**. Playwright deferred; NOT used. |
| Dev server `:3000` | ✅ HTTP 200; NOT restarted. |
| Local Supabase | ✅ Docker `supabase_db_hop-rental` healthy (7 days); 119 migrations. |
| App-resolved Supabase URL | ✅ `http://127.0.0.1:54321` (cart write hit it; cookie `sb-127-auth-token`). |
| Remote calls | ✅ zero `*.supabase.co` in any leg. |
| Seeded accounts | `customer@local.test` (`1111…1111`, customer) · `admin@local.test` (`2222…2222`, super_admin). Local password via SQL (Appendix A #1). |

---

## Section 1 — CURRENT FLOW MAP (inline marks at the exact step)

Asset: รถขุดทดสอบ (AST-LOCAL-001), daily ฿500, security deposit ฿2,000.

```
CUSTOMER                              DB / LEDGER (localhost)                 ADMIN sees/does                    CUSTOMER sees
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
R1 asset page → booking form          (read)                                  —                                 ค่ามัดจำ ฿2,000 🟡W1 (bare มัดจำ,
   pick 15→17 Jul (3 วัน)                                                                                        =security). Booking-deposit tier
   3×฿500=฿1,500 ✅                                                                                              NOT shown here 🔍O1. return=17 🔍O2
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
R1 เพิ่มลงตะกร้าเช่า                   POST /api/rental-bookings/               —                                 → /user/cart
                                       draft-checkout-state (200);
                                       draft d4dbc706 asset_id set ✅,
                                       end_date=18 (excl) 🔴B3 vs UI 17
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
R2 cart (2 rental lines)              (read)                                   —                                 Booking Deposit ฿700 = ฿500(20d)+
                                                                                                                 ฿200(3d) ✅ tiers correct.
                                                                                                                 🔴B1 "รวมยอดชำระวันรับสินค้า ฿3,300"
                                                                                                                 omits ฿11,500 rental (exp ฿14,800).
                                                                                                                 66666666(paid_confirm_failed) shows
                                                                                                                 as normal cart line 🔍O3; sub-line
                                                                                                                 "3 วัน×฿500" wrong for 20d 🔍O4
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
R3 pick branch + consent →            → payment request 81e50733               —                                 → /user/payments/81e50733
   ดำเนินการชำระเงิน                   (source_type=booking_only,                                                 "รอชำระเงิน" · เงินมัดจำจอง ฿200 ✅
                                       awaiting_payment, ฿200);                                                  note "รวม ค่าสินค้า ค่าส่ง…" on a
                                       booking stays draft/unpaid ✅                                             pure rental 🟡W2 (generic template)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
R3 upload slip → อัปโหลด              POST /api/user/manual-payment-           (slip on central                  slip "รอตรวจสอบ"; booking still
                                       requests/81e50733/slips (200);          /admin/manual-payment-            draft ✅ (evidence-only)
                                       request→pending_review, 0 held events    requests only)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
R5 /user/rentals/[id] (draft)         (read)                                   —                                 ฉบับร่าง · มัดจำ: unpaid 🟡W3 (raw
                                                                                                                 enum). QR shown at draft 🔍O5.
                                                                                                                 รวมยอดชำระวันรับสินค้า ฿3,500 ✅
                                                                                                                 (detail CORRECT → B1 is cart-only
                                                                                                                 🔍O6). BDC doc "ยังไม่ได้ออกเอกสาร".
                                                                                                                 Cancel: "ไม่สามารถยกเลิก…" 🟡W4;
                                                                                                                 reschedule = none (MISSING)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
A1 Booking Manager                     (read)                                  search name/phone/booking-id ✅   —
                                                                                (phone "0800000299"→1). POS V3
                                                                                resolver = booking-id/user-id
                                                                                only, NO phone 🔍O7. Status-tab
                                                                                filters, no work queues/counts
                                                                                🟡W5. "deposit unpaid" on ALL
                                                                                incl. deposit-paid confirmed
                                                                                🔴B2. Admin period "ถึง 18 Jul"
                                                                                vs customer "→ 17" 🔴B3(G5)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
A2 confirm deposit                     POST /api/admin/rental-bookings/         "Mark Deposit Received":          —
   (/admin/rental-bookings/[id])       d4dbc706/record-deposit (200);          Booking Deposit ฿200 (tier ✅,
                                       booking→confirmed/paid;                  read-only, server-validated ✅).
                                       L1: booking_deposit_collection ฿200      Banner "รับมัดจำ" 🟡W6. "Deposit
                                       posted; NO BDC issued 🔴B5; request      Slip Evidence (0)" — slip on central
                                       stays pending_review 🟡W7                queue 🔴B4 (two surfaces)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
R5 /user/rentals/[id] (confirmed)     (read)                                   —                                 ยืนยันแล้ว · มัดจำ paid. รวมวันรับ
                                                                                                                 ฿3,300 ✅. "ออกเอกสาร" issues RBK-
                                                                                                                 202607-0001 (self-issue, ฿0, NOT a
                                                                                                                 BDC 🟡W8). Cancel: past cutoff →
                                                                                                                 contact support 🟡W4
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
A3 B7 PICKUP (POS V3)                  POST .../pos-v3/.../remaining-security-  resolve booking → "Active pickup"  —
   resolve booking d4dbc706            deposit-payments (200);                  · classification blocked · rem
   → collect remaining security        L1: remaining_security_deposit_          security ฿1,800 ✅ → collect Cash
   ฿1,800 (Cash) → checklist            collection ฿1,800 posted (full ฿2,000    → ad-hoc checklist → signature →
   (ad-hoc) → signature →               now held). NO KYC step shown client-     ยืนยันรับอุปกรณ์
   ยืนยันรับอุปกรณ์                     side 🔍O8
                                       ↓
   ██ POST /api/admin/rental-bookings/d4dbc706/pickup → 422 "Pickup KYC gate: no_profile" 🔴🔴B6 ██  ← FURTHEST REACHABLE POINT
                                       booking STAYS confirmed (pickup_at NULL); ฿2,000 collected but equipment CANNOT be handed over.
                                       kyc_profiles=0; POS V3 cannot create KYC ("not implemented here"). 0 bookings ever reached picked_up.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
A4 B9 RETURN                          UNREACHABLE — requires picked_up.        Return Form gated "after return    —
                                       settlement_application / refund /        fulfillment"; no return/no-show
                                       forfeiture events NEVER fire (0)         action on admin page (only
                                                                                →confirmed/→cancelled pills)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
A5 CANCEL confirmed (aaaaaaaa)        BOOKING STATUS →cancelled = raw flip:    instant, no reason dialog          (list shows cancelled)
                                       status=cancelled but cancelled_at NULL,
                                       no reason/source; held ฿200 still
                                       "posted" (NO refund/forfeiture); issued
                                       BDC not voided 🔍O9; payment_refunds=0 🔴B7
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
A6 paid_confirm_failed (66666666)     deposit ฿500 paid + held event posted,   admin page shows plain "draft"     (booking stuck as draft;
                                       confirm failed RENTAL_BOOKING_CONFLICT;  — no paid_confirm_failed state,    customer paid ฿500)
                                       ฿500 held liability stranded             no confirm panel, no recovery
                                                                                action. DEAD END (B-M1 example)
```

**Money limbo note 🔍O10:** after A3, d4dbc706 has both booking-deposit ฿200 and remaining-security ฿1,800 collected (full ฿2,000 held), yet the customer rental page still lists "เงินมัดจำประกันคงเหลือวันรับสินค้า ฿1,800" as due — because the booking never advanced to `picked_up`. Money taken, not reflected.

---

## Section 2 — VERDICT TABLE

### Angle 1 — Customer
| Step | Verdict | Evidence / marks |
|---|---|---|
| **R1** booking form: dates, price, deposit tier | **PASS** (2 gaps) | 3-day → 3×฿500=฿1,500 ✅; both tiers confirmed in R2 (฿200 for 3-day, ฿500 for 20-day). 🔍O1 tier-due-now not shown on form (only security ฿2,000); 🟡W1 bare "ค่ามัดจำ"; 🔍O2 return date shown inclusive. |
| **R2** rental cart display | **PASS-DIRTY** | Tiers ฿700=฿500+฿200 ✅. 🔴**B1** "รวมยอดชำระวันรับสินค้า" omits rental (฿3,300 shown vs ฿14,800; single-line ฿1,800 vs ฿3,300) — cart-only. 🔍O3 paid_confirm_failed line present; 🔍O4 wrong "3 วัน×฿500" sub-line. |
| **R3** checkout → request → slip | **PASS-DIRTY** | request `booking_only`/awaiting_payment ฿200 ✅; slip→pending_review, booking stays draft ✅. 🟡**W2** "ค่าสินค้า ค่าส่ง" wording on pure-rental note. |
| **R4** status visibility; BDC + QR | **PASS-DIRTY** | Confirm propagates (draft→ยืนยันแล้ว, มัดจำ paid). QR present from draft 🔍O5. Booking doc **RBK** self-issued via "ออกเอกสาร" ✅ but 🔴**B5**/🟡**W8**: no auto-issue, and it is a rental_booking_confirmation (฿0) — **no BDC deposit document for online**. |
| **R5** history draft→confirmed→picked_up→returned | **PASS (to confirmed) / BLOCKED beyond** | draft + confirmed states render correctly; detail totals ✅ (🔍O6). picked_up/returned **never reachable** (B6). 🟡W3 raw "unpaid/paid" enum. |
| **R6** after-sales: reschedule / cancel | **MISSING / WORKAROUND** | 🟡**W4**: self-cancel gated — draft "ไม่สามารถยกเลิก", confirmed past cutoff "ติดต่อ HOPNIC support". **Reschedule: no path anywhere (MISSING).** |

### Angle 2 — Admin
| Step | Verdict | Evidence / marks |
|---|---|---|
| **A1** findable? phone lookup both surfaces | **PASS (BM) / MISSING (POS V3)** | Booking Manager search name/phone/booking-id ✅ (phone→1 hit). 🔍**O7** POS V3 resolver = `booking:<id>`/`customer:<userId>` UUIDs only — **phone lookup still absent in V3**. |
| **A2** deposit confirm regression (fixed surface) | **PASS** | Prefill "Booking Deposit ฿200" (tier ✅), amount read-only + server-validated (guard live). 🔴B4 empty "Deposit Slip Evidence" (two surfaces); 🟡W6 bare banner; 🟡W7 request stays pending_review. |
| **A3** B7 pickup → furthest point | **BLOCKED (dead-end)** | deposit ฿1,800 ✅ + checklist ✅ + signature ✅ → **pickup POST 422 "Pickup KYC gate: no_profile"** 🔴🔴**B6**. KYC uncreatable in POS V3. Remaining-security amount correct (2,000−200). 🔍O8 no client KYC step. |
| **A4** B9 return: status/damage/settlement/refund/forfeiture | **UNREACHABLE / MISSING** | Requires picked_up (never reachable). Return Form gated; no return/no-show/settlement/refund action on admin booking page. `settlement_application`/`refund`/`forfeiture` events **never fired (0)**. |
| **A5** cancel draft + confirmed | **BLOCKED/BUG** | Confirmed cancel = raw status flip 🔴**B7**: `cancelled_at` NULL, no reason/source, held ฿200 still posted (no refund/forfeiture), `payment_refunds`=0, issued BDC not voided 🔍O9. Draft cancel = same flip, no money (inferred; not separately driven). |
| **A6** paid_confirm_failed recovery (66666666) | **MISSING (dead end)** | ฿500 paid + held-event posted; confirm failed `RENTAL_BOOKING_CONFLICT`. Admin page shows plain "draft", **no failed-state indicator, no confirm panel, no recovery action**. Exactly the B-M1 live example. |

### Angle 3 — Booking-management surface
| Step | Verdict | Evidence / marks |
|---|---|---|
| **G1** search/filter (vs Case-1 E1-E2) | **PASS** | Search (name/phone/booking-id) + status filter tabs; parity with orders search, but no date range shown. |
| **G2** work queue: what needs action? | **MISSING** | 🟡**W5** status-filter tabs only; **no counts/badges, no "deposits to confirm / pickups today / returns due/overdue"** queues (Orders surface has them; Booking Manager does not). |
| **G3** status/amount columns; both deposits distinguishable? | **BUG** | 🔴**B2** every row shows "deposit unpaid" incl. deposit-paid confirmed bookings (refers to security deposit); AMOUNT = rental total (฿1,500/฿10,000), **neither deposit shown**. Two deposits NOT distinguishable at a glance. |
| **G4** what admin CANNOT do here | **read-only reality** | From the list: only "เปิดรายละเอียด". No create, no edit dates, no cancel, no notes, no bulk, no export. Create-future-booking lives in POS V3, not here. Cancel/confirm only inside each detail (raw pills). |
| **G5** cross-surface consistency (end date) | **BUG** | 🔴**B3** same booking d4dbc706: Booking Manager "ถึง 18 ก.ค. · 3 วัน" (exclusive) vs customer "→ 17 ก.ค. · 3 วัน" (inclusive). DB `end_date=18`. Two different end dates across surfaces. |

### Angle 4 — Money & ledger
| Step | Verdict | Evidence / marks |
|---|---|---|
| **L1** held-balance events: type/amount/moment | **PASS (2 of 5) / MISSING (3 of 5)** | Fired correctly: `booking_deposit_collection` ฿200 at confirm; `remaining_security_deposit_collection` ฿1,800 at pickup-deposit (full ฿2,000 held). **Never fired system-wide:** `settlement_application`, `refund`, `forfeiture` (0 each) — the return/cancel/no-show half of the ledger is dead. |
| **L2** glossary at money touchpoints | **PASS-DIRTY** | Structured summaries canonical (เงินมัดจำจอง/เงินมัดจำประกัน); bare "มัดจำ" on asset page, cart badges, admin banner, list badge, raw enum on customer status (W1/W3/W6/O). |
| **L3** accountant reconstruction | **PASS-DIRTY / GAP** | Held-liability accrual IS reconstructable (2 posted events = ฿2,000 held for d4dbc706). GAPS: (a) online customer's deposit payment has **no BDC document** (only ฿0 RBK) — W8; (b) no release/settlement side ever fires → held liabilities can only grow, never resolve (B6/B7/A6); (c) cancelled confirmed booking (aaaaaaaa) leaves ฿200 held with no refund/forfeiture entry — orphaned liability. |

---

## Section 3 — ANALYSIS (by severity)

### BUGS
1. 🔴**B6 (A3) — Pickup dead-ends at the KYC gate; the entire rental lifecycle cannot complete.** After collecting the full ฿2,000 deposit, Confirm Pickup returns 422 `Pickup KYC gate: no_profile`; no KYC profile exists and **POS V3 cannot create one** ("not implemented here"). **0 bookings have ever reached `picked_up`.** *Blocks real staff and a real customer absolutely today* — money is taken, equipment cannot be handed over, and there is no in-product path forward. This is the launch-critical blocker.
2. 🔴**B7 (A5) — Admin booking cancel is a raw status flip; the held deposit is stranded.** `→ cancelled` sets status only: `cancelled_at` NULL, no reason/source, no `refund`/`forfeiture` event, `payment_refunds`=0, issued BDC not voided. The B-M1/G4 void-and-refund path is unbuilt. *Blocks correct accounting* — every confirmed cancel orphans the deposit liability. (Mirrors Case-1 D5.)
3. 🔴**B5 (R4/A2) — Online bookings get no booking-deposit document (no BDC).** Admin "Mark Deposit Received" issues no document; the customer can self-issue only an **RBK** booking-confirmation (`total ฿0`), which does not evidence the ฿200 paid. POS cash collection auto-issues a BDC; online is asymmetric. *No customer-facing proof of deposit payment.*
4. 🔴**B1 (R2) — Cart "รวมยอดชำระวันรับสินค้า" omits the rental.** Shows only the remaining security deposit (฿1,800 / ฿3,300) instead of rental + remaining (฿3,300 / ฿14,800). Cart-only (the rental **detail** page is correct — O6). *Understates the pickup-day amount to the customer.*
5. 🔴**B2 (G3) — Booking Manager can't distinguish the two deposits.** All rows (including deposit-paid confirmed bookings) show "deposit unpaid"; AMOUNT shows rental total, neither deposit. *Staff can't tell which bookings still owe a deposit.*
6. 🔴**B3 (G5/R1) — End-date inconsistency across surfaces.** Admin "ถึง 18 ก.ค." (exclusive, matches DB) vs customer "→ 17 ก.ค." (inclusive). Same 3-day booking, two end dates. *Dispute risk on the return date.*
7. 🔴**B4 (A2) — Two slip surfaces (rental).** Booking page "Deposit Slip Evidence (0)" while the real slip sits on `/admin/manual-payment-requests`. Confusion trap (same class as Case-1 #4 / B6 finding 2).

### WEAKNESSES
8. 🟡**W4 (R6) — After-sales is thin:** self-cancel is cutoff-gated (draft: blocked; confirmed past cutoff: "contact support"); **reschedule does not exist.** Real customers past cutoff have no in-web action.
9. 🟡**W7 (A2/R4) — Payment request not synced.** After deposit confirmed, request `81e50733` stays `pending_review` — orphaned like the Case-1 order/request desync.
10. 🟡**W5 (G2) — No work queues on Booking Manager** (no counts, no deposits-to-confirm / pickups-today / returns-due). Daily ops can't triage.
11. 🟡**W8 (L3) — RBK document shows ฿0** and is the only online doc; no deposit figure recorded on any customer document.
12. 🟡**W1/W3/W6 (L2) — Glossary:** bare "มัดจำ" on asset page / cart badges / admin banner; raw English "unpaid/paid" enum inside a Thai status label. 🟡**W2** product/shipping wording on a pure-rental payment note (generic template).

### MONEY GAPS
13. 🔴**L1 — Half the ledger is dead.** `settlement_application`, `refund`, `forfeiture` have **never fired** because the lifecycle can't pass pickup and cancel doesn't settle. Held liabilities can only accrue (currently ฿2,000 + orphaned ฿200 + stuck ฿500), never release.
14. 🔴**A6 — `paid_confirm_failed` money is invisible and unrecoverable.** ฿500 paid + held, booking stuck as "draft", no admin indicator or recovery. (B-M1.)
15. 🟡**W8/L3 — No deposit receipt for online**, so an accountant can reconstruct the *liability accrual* from `rental_held_balance_events` but not from any issued customer document.

**Blocks-whom summary:** B6 blocks *everyone* (lifecycle cannot complete — the launch blocker). B7/A6/L1 block *accounting* (stranded/stuck/never-released deposit liabilities). B1/B2/B3/B4/W4 confuse *customer and staff* but don't hard-block booking+deposit.

---

## Section 4 — FURTHEST REACHABLE POINT

**The rental lifecycle dead-ends at B7 PICKUP — specifically at pickup *confirmation*.**

Reachable, live-driven: `browse → book → deposit tier ฿200 → pay slip → admin confirm (held event) → POS V3 resolve → collect remaining security ฿1,800 (held event) → ad-hoc checklist → customer signature → Confirm Pickup`.

Dead-ends at: `POST /api/admin/rental-bookings/[id]/pickup → 422 "Pickup KYC gate: no_profile"`. The booking stays `confirmed`; the full ฿2,000 deposit is collected; the asset is never handed over. **B9 return, settlement, deposit release/refund, and forfeiture are all unreachable** (they require `picked_up`, which no booking has ever attained — 0 picked_up / 0 returned / 0 no_show system-wide). Root cause: the pickup KYC gate is enforced server-side while KYC registration is not implemented anywhere (paused), so no `kyc_profile` can exist.

---

## Section 5 — Case-3 retest additions

1. **Mixed cart** with sale + rental lines: re-verify 🔴B1 pickup-day subtotal, and that the `mixed` payment request's money note wording is correct for both parts (W2 inverted from Case-1 M2).
2. **Two-slip surface (B4)** in a mixed request — which surface each of order page / booking page reads.
3. **BDC vs RBK vs sale receipt** documents in one mixed transaction (B5 + Case-1 A8/A9): what, if anything, is issued.
4. Re-confirm 🔴B3 end-date convention holds for mixed rental lines.
5. Whether a mixed checkout can even reach pickup given the B6 KYC dead-end (likely same block).

---

## Appendix A — Ad-hoc SQL (local only, `docker exec … psql`)

1. **Local password on seeded accounts** (login as both roles): `UPDATE auth.users SET encrypted_password = crypt('<local-test password — session notes only>', …) WHERE email IN ('customer@local.test','admin@local.test');` — auth only.
2. **Reversible pure-rental isolation** (customer cart held 2 other drafts incl. the paid_confirm_failed evidence): reassigned `ea89922c…` + `66666666…` user_id customer→admin, ran R3 on the fresh draft `d4dbc706`, then **restored both to the customer**. Confirmed restored (`66666666` still `paid_confirm_failed`, ฿500 — evidence untouched; only `user_id` moved and moved back).

All other SQL was read-only (schema/column introspection; pre/post verification of `rental_bookings`, `rental_held_balance_events`, `manual_payment_requests(_slips)`, `official_documents`).

## Appendix B — Test data created/changed (local; NOT cleaned up)

| Entity | Id | Final state |
|---|---|---|
| Fresh rental booking (R1→A3) | `d4dbc706-…` | **confirmed**, booking-deposit ฿200 + remaining-security ฿1,800 both collected (฿2,000 held), pickup **blocked (422 KYC)**, RBK-202607-0001 issued |
| Rental payment request | `81e50733-…` | `booking_only`, **pending_review**, ฿200, slip `case2-rental-slip.jpg` |
| Booking cancelled (A5 evidence) | `aaaaaaaa-…000119` | **confirmed → cancelled** (raw flip; ฿200 held deposit stranded, `cancelled_at` NULL) |
| paid_confirm_failed (A6 evidence) | `66666666-…000500` | **UNCHANGED** — draft / `paid_confirm_failed` / ฿500 held / `RENTAL_BOOKING_CONFLICT` |
| Documents | RBK-202607-0001 | new `rental_booking_confirmation` (฿0, self-issued by customer) |

## Appendix C — Held-event ledger reality (system-wide)

| event_type | fired | note |
|---|---|---|
| `booking_deposit_collection` | 8 | at confirmation |
| `remaining_security_deposit_collection` | 1 | at pickup-deposit (d4dbc706, this walk) |
| `settlement_application` | **0** | return never reached |
| `refund` | **0** | no cancel/return refund path fires |
| `forfeiture` | **0** | no-show path never fires |

Lifecycle reach system-wide: **draft 3 · confirmed 6 · cancelled 1 · picked_up 0 · returned 0 · no_show 0.**

## Appendix D — Per-leg network evidence (first write)

| Leg | First write | Target | `*.supabase.co` |
|---|---|---|---|
| R1 add draft | draft-checkout-state | `http://localhost:3000/api/rental-bookings/draft-checkout-state` (200) | 0 |
| R3 checkout | (cart proceed) | `http://localhost:3000/...` → `/user/payments/81e50733` | 0 |
| R3 slip | slip POST | `http://localhost:3000/api/user/manual-payment-requests/81e50733/slips` (200) | 0 |
| A2 deposit confirm | record-deposit | `http://localhost:3000/api/admin/rental-bookings/d4dbc706/record-deposit` (200) | 0 |
| A3 remaining security | pos-v3 payment | `http://localhost:3000/api/admin/pos-v3/rental-bookings/d4dbc706/remaining-security-deposit-payments` (200) | 0 |
| A3 pickup (dead-end) | pickup | `http://localhost:3000/api/admin/rental-bookings/d4dbc706/pickup` (**422**) | 0 |
| cart write (scope proof) | carts | `http://127.0.0.1:54321/rest/v1/carts` | 0 |
