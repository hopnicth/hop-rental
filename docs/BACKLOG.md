# HOPNIC Backlog — single source of truth

Rule: any task deferred in any session MUST be added here in the same
commit that defers it. Claude Code: read this file at session start.

Routing: tracks are defined in `docs/MASTER-GAP-MAP.md`; working rules in
`docs/OPERATING-MODEL.md`; policy in `decisions.md` (2026-07-14 decision set).
On any conflict with older notes, the 2026-07-14 decision set wins.

Item tags: **[QUEUED]** (ordered) · **[PARKED]** (no date) · **[INFRA]** (cross-cutting, fold into the touching track).

## ACTIVE — T-track order (per MASTER-GAP-MAP)

Current work = **T1a**. Order: T1a → T1b → T2 → (T3 + T4 together) → T5 → T6/T7 (parallel) → T8.

- **T1 — KYC (unfrozen 2026-07-14):** T1a staff-KYC + SUPER ADMIN approve queue (User-ID QR link) → T1b customer online KYC. Unblocks the pickup 422 `no_profile` deadlock.
- **T2 — pickup → return → settlement:** the rental ledger release side. After T1.
- **T3 — unified void / cancel / deposit-refund** (sale + rental + mixed). After T2; designed with T4.
- **T4 — document / ERP foundation** (mig-068 engine, tax_treatment, void=reissue). Designed with T3.
- **T5 — POS V3 sale + fiscal docs; retire v1.** After T4.
- **T6 — cross-surface consistency + status visibility.** Parallel.
- **T7 — glossary / i18n / money-copy.** Parallel.
- **T8 — accounting-office export pack** (VAT/WHT/deposit-liability/cash reconciliation). End goal, after T4.

## Backlog by track

### T1 — KYC
- [QUEUED] B-M3: phone-number lookup for staff locate (customer with no login) — feeds staff-KYC + tax-profile creation channels (§a/§d; currently DEAD in V3)
- [PARKED] ~~KYC un-freeze at V3-3 equivalent~~ **SUPERSEDED 2026-07-14** — KYC is unfrozen NOW and is T1 (decisions.md §a); cash drawer model + QR-poll completion vs Omise sandbox remain [PARKED]

### T2 — pickup → return → settlement (ledger release side)
- [QUEUED] KYC pickup gate deadlock: pickup 422 no_profile, KYC uncreatable anywhere, 0 bookings ever picked_up → B9/settlement/refund/forfeiture unreachable, ledger release side dead (Case-2 B6, L1) — unblocked by T1, closed by T2
- [QUEUED] B-M0: scope audit — what Booking Manager needs for online to be complete (read-only survey)
- [QUEUED] B-M2: edit/reschedule booking (customer phone-in changes)
- [QUEUED] Then: B7 pickup walk → B9 return/settlement walk (flow order)

### T3 — unified void / cancel / deposit-refund
- [QUEUED] B-M1: cancel booking + refund path == G4 void path (ratification audit F5; also resolves paid_confirm_failed recovery — live example `66666666…` local)
- [QUEUED] Rental cancel raw flip: cancelled_at NULL, no reason, held deposit stranded, BDC not voided (Case-2 B7 — merge into the G4 void-path design with Case-1 cancel-paid)
- [QUEUED] Order cancel-paid integrity: no inventory reversal (inventory_reversed_at never fired), payment stays 'paid' with no refund record, request orphaned, customer detail hides cancellation (Case-1 BUGS 1-3)
- [QUEUED] Mixed accept = 3 manual actions on 3 pages; no single "accept payment" — forgetting step 3 strands the paid deposit (Case-3 B5)
- [QUEUED] Mixed cancel = half-cancel: order dies, booking + held deposit live on, shared request orphaned (Case-3 B4 — G4 unified void: sale + rental + mixed)

### T4 — document / ERP foundation
- [QUEUED] Document Standardization track (owner-declared 2026-07-14): single issuance service over the mig-068 engine — event-driven issuance (same event = same document regardless of channel), required-data schema per doc type (no more ฿0 docs), void = replacement chain (design TOGETHER with G4/T3), one HTML print template. Resolves B5/W8/A8/A9 structurally
- [QUEUED] Online bookings get no BDC document; RBK self-issue shows ฿0 (Case-2 B5/W8)
- [PARKED] Flow A document layer: A8 receipt → A9 tax invoice + void chain
- [PARKED] WHT capture (scaffold exists, hardcoded 0)

### T5 — POS V3 sale + fiscal docs; retire v1
- [QUEUED] POS V3 slip-upload for walk-ins (evidence-only on attempt/booking, private bucket + signed URL — fixes POS v1 public-bucket hygiene; survey done 2026-07-10, not gated by G3/G4/A1)

### T6 — cross-surface consistency + status visibility
- [QUEUED] No unified transaction view (customer or staff) for mixed — four surfaces, four numbers, join only via the request (Case-3 W3/W1)
- [QUEUED] Booking Manager: all rows show "deposit unpaid", neither deposit visible (Case-2 B2); no work queues (Case-2 W5)
- [QUEUED] Cart pickup-day subtotal omits rental (Case-2 B1, cart-only)
- [QUEUED] Payment request stays pending_review after deposit confirmed (Case-2 W7, mirrors Case-1 orphan)
- [QUEUED] Sale slip two-surface confusion: order page reads legacy sale_order_payment_slips, real slip in central queue (Case-1 #4)
- [QUEUED] Customer list: no under-review / rejected signal (Case-1 #5)
- [QUEUED] End-date inclusive/exclusive across surfaces: customer inclusive last day vs admin/DB exclusive end (B6 Appendix D; Case-2 B3/G5 re-confirmed live — "→ 17 ก.ค." customer vs "ถึง 18 ก.ค." admin) — rental-days boundary risk
- [PARKED] A7 tracking missing on order detail page (Flow A)
- [PARKED] B1 customer branch picker missing
- [PARKED] A3 status-transition legality trigger (NICE-TO-HAVE)

### T7 — glossary / i18n / money-copy
- [QUEUED] sale_only payment template leaks booking-deposit wording (Case-1 M2); note: the mixed money-note is CONFIRMED-CORRECT (Case-3) — fix is the pure-case reuse
- [PARKED] Glossary sweep: bare มัดจำ on customer list cards + POS surfaces (Case-1/2/3 W1)

### T8 — accounting-office export pack (end goal)
- [PARKED] Accounting-office export pack (VAT register, WHT register, deposit liability ledger, cash reconciliation) — owner vision, end goal (decisions.md §c reconciliation loops)

### Cross-cutting / infra (fold into the touching track)
- [INFRA] Dev default targets REMOTE db (.env) — invert to local-default (nearly caused prod writes twice on 2026-07-09/10)
- [INFRA] Stale-'finalizing' POS attempts sweep/alert (mig-119 commit note)
- [INFRA] RLS hardening bundle: mig-070 draft-insert policy + confirmBooking dead path + legacy upsert migration (B2-fix report)
- [INFRA] Baht-vs-satang decision audit (auditor-owned; DECISIONS conflict)
- [INFRA] Empty-string Select values: 4 latent sites (USelectMenu→USelect)
- [PARKED][INFRA] A2 PDPA retention/purge (must design formal trigger-drop path vs mig-118 delete blocks)
