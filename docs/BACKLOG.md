# HOPNIC Backlog — single source of truth

Rule: any task deferred in any session MUST be added here in the same
commit that defers it. Claude Code: read this file at session start.

Status: **ACTIVE** (next up) · **QUEUED** (ordered) · **PARKED** (no date).

## ACTIVE TRACK — Booking Management (online completion)

- B-M0: scope audit — what Booking Manager needs for online to be complete (read-only survey; next task)
- B-M1: cancel booking + refund path == G4 void path (ratification audit F5; also resolves paid_confirm_failed recovery — live example `66666666…` local)
- B-M2: edit/reschedule booking (customer phone-in changes)
- B-M3: phone-number lookup (vision 1.5; currently DEAD in V3)
- Then: B7 pickup walk → B9 return/settlement walk (flow order)

## QUEUED

- Order cancel-paid integrity: no inventory reversal (inventory_reversed_at never fired), payment stays 'paid' with no refund record, request orphaned, customer detail hides cancellation (Case-1 BUGS 1-3) — design together with B-M1 void path
- Sale slip two-surface confusion: order page reads legacy sale_order_payment_slips, real slip in central queue (Case-1 #4)
- sale_only payment template leaks booking-deposit wording (Case-1 M2)
- Customer list: no under-review / rejected signal (Case-1 #5)
- POS V3 slip-upload for walk-ins (evidence-only on attempt/booking, private bucket + signed URL — fixes POS v1 public-bucket hygiene; survey done 2026-07-10, not gated by G3/G4/A1)
- End-date display inconsistency: user shows 3 Oct vs admin 4 Oct (B6 audit Appendix D) — rental-days boundary risk
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
