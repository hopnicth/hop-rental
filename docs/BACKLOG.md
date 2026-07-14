# HOPNIC Backlog — single source of truth

Rule: any task deferred in any session MUST be added here in the same
commit that defers it. Claude Code: read this file at session start.

Status: **ACTIVE** (next up) · **QUEUED** (ordered) · **PARKED** (no date).

## ACTIVE TRACK — Booking Management (online completion)

- KYC pickup gate deadlock: pickup 422 no_profile, KYC uncreatable anywhere, 0 bookings ever picked_up -> B9/settlement/refund/forfeiture unreachable, ledger release side dead (Case-2 B6, L1) — forces the KYC-freeze decision (pending owner prioritization after Case 3)
- B-M0: scope audit — what Booking Manager needs for online to be complete (read-only survey; next task)
- B-M1: cancel booking + refund path == G4 void path (ratification audit F5; also resolves paid_confirm_failed recovery — live example `66666666…` local)
- B-M2: edit/reschedule booking (customer phone-in changes)
- B-M3: phone-number lookup (vision 1.5; currently DEAD in V3)
- Then: B7 pickup walk → B9 return/settlement walk (flow order)

## QUEUED

- Mixed accept = 3 manual actions on 3 pages; no single "accept payment" — forgetting step 3 strands the paid deposit (Case-3 B5)
- Mixed cancel = half-cancel: order dies, booking + held deposit live on, shared request orphaned (Case-3 B4 — feeds the G4 unified void design: sale + rental + mixed)
- No unified transaction view (customer or staff) for mixed — four surfaces, four numbers, join only via the request (Case-3 W3/W1)
- Rental cancel raw flip: cancelled_at NULL, no reason, held deposit stranded, BDC not voided (Case-2 B7 — merge into the G4 void-path design with Case-1 cancel-paid)
- Online bookings get no BDC document; RBK self-issue shows ฿0 (Case-2 B5/W8)
- Booking Manager: all rows show "deposit unpaid", neither deposit visible (Case-2 B2); no work queues (Case-2 W5)
- Cart pickup-day subtotal omits rental (Case-2 B1, cart-only)
- Payment request stays pending_review after deposit confirmed (Case-2 W7, mirrors Case-1 orphan)
- Document Standardization track (owner-declared 2026-07-14): single issuance service over the mig-068 engine — event-driven issuance (same event = same document regardless of channel), required-data schema per doc type (no more ฿0 docs), void = replacement chain (design TOGETHER with G4 void path), one HTML print template. Resolves B5/W8/A8/A9 structurally. Ordering decided after Case 3.
- Order cancel-paid integrity: no inventory reversal (inventory_reversed_at never fired), payment stays 'paid' with no refund record, request orphaned, customer detail hides cancellation (Case-1 BUGS 1-3) — design together with B-M1 void path
- Sale slip two-surface confusion: order page reads legacy sale_order_payment_slips, real slip in central queue (Case-1 #4)
- sale_only payment template leaks booking-deposit wording (Case-1 M2)
- Customer list: no under-review / rejected signal (Case-1 #5)
- POS V3 slip-upload for walk-ins (evidence-only on attempt/booking, private bucket + signed URL — fixes POS v1 public-bucket hygiene; survey done 2026-07-10, not gated by G3/G4/A1)
- End-date inclusive/exclusive across surfaces: customer shows inclusive last day vs admin/DB exclusive end (B6 Appendix D; Case-2 B3/G5 re-confirmed live — same booking "→ 17 ก.ค." customer vs "ถึง 18 ก.ค." admin) — rental-days boundary risk
- Dev default targets REMOTE db (.env) — invert to local-default (nearly caused prod writes twice on 2026-07-09/10)
- Stale-'finalizing' POS attempts sweep/alert (mig-119 commit note)
- RLS hardening bundle: mig-070 draft-insert policy + confirmBooking dead path + legacy upsert migration (B2-fix report)
- Baht-vs-satang decision audit (auditor-owned; DECISIONS conflict)

## PARKED

- A2 PDPA retention/purge (must design formal trigger-drop path vs mig-118 delete blocks)
- A3 status-transition legality trigger (NICE-TO-HAVE)
- Glossary sweep: bare มัดจำ on customer list cards + POS surfaces
- A7 tracking missing on order detail page (Flow A)
- B1 customer branch picker missing
- Empty-string Select values: 4 latent sites (USelectMenu→USelect)
- Flow A document layer: A8 receipt → A9 tax invoice + void chain
- WHT capture (scaffold exists, hardcoded 0)
- Accounting-office export pack (VAT register, WHT register, deposit liability ledger, cash reconciliation) — owner vision, end goal
- KYC un-freeze at V3-3 equivalent; cash drawer model; QR-poll completion vs Omise sandbox
