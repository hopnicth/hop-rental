# Phase 2D Booking Deposit Acceptance Checklist

## Status

**Phase 2D CLOSED**

Repo green baseline at closure:

- Full test suite: **864 / 864 tests passed**
- TypeScript diagnostics: **0 errors**
- Known pre-existing failures: **none**

## Scope completed

Phase 2D delivered the POS V3 Future Booking Deposit flow:

- Future Booking Draft creation
- Cash Booking Deposit collection
- PromptPay QR Booking Deposit collection
- QR paid → booking confirmed
- Booking Deposit Confirmation (BDC) issuance
- Print BDC from POS QR paid success state
- Print BDC from Booking Detail
- Active QR refresh recovery
- QR replacement safety
- Late-payment recovery
- Booking Detail resume CTA
- POS query re-entry via `bookingId`
- `paid_confirm_failed` double-collection guard

## Locked money/accounting decisions

These decisions are locked for future POS V3 booking-deposit work:

- Booking Deposit is held-balance / deposit-like money.
- Booking Deposit is part of the refundable security deposit.
- Booking Deposit is **not revenue** at collection time.
- Booking Deposit is **not a VAT point** at collection time.
- Booking Deposit is **not subject to WHT** at collection time.
- Booking confirmation must be payment-backed.
- Captured money must not be collected again.
- `paid_confirm_failed` means money may already be captured and requires ops escalation, not retry collection.
- Document issuance failure must not roll back payment capture.
- Document issuance failure must not roll back booking confirmation.
- Payment finalization and document issuance must keep separate semantics.

## Locked PromptPay / Omise decisions

These decisions are locked for PromptPay QR handling:

- Do **not** add a QR cancel button.
- Do **not** perform local-only QR cancel.
- Do **not** fake expiry for active PromptPay QR attempts.
- Omise PromptPay QR cannot be cancelled, expired, or voided immediately via API once created.
- Active PromptPay QR must wait for either paid status or natural `expires_at`.
- If a QR is active, staff must wait for paid or natural expiry.
- If a QR is expired and the booking is still draft/unpaid, admin may cancel the draft manually from Booking Detail if appropriate.

## Acceptance smoke checklist

Manual acceptance smoke checklist for Phase 2D closure:

- [ ] Create a future booking draft from POS V3.
- [ ] Cash Booking Deposit confirms the booking and issues BDC.
- [ ] PromptPay QR creation shows an active QR.
- [ ] Refreshing an active QR resumes the same payment session.
- [ ] QR paid confirms the booking and issues BDC.
- [ ] POS QR paid success shows Print BDC CTA only after the document is available.
- [ ] Booking Detail can print BDC for a paid booking.
- [ ] Booking Detail shows resume CTA only for draft + unpaid booking.
- [ ] Booking Detail resume CTA routes to POS V3 with `bookingId`.
- [ ] POS query re-entry handles draft/unpaid with no active QR.
- [ ] POS query re-entry handles draft/unpaid with an active QR.
- [ ] POS query re-entry handles no-longer-eligible bookings safely.
- [ ] Paid booking cannot be collected again.
- [ ] `paid_confirm_failed` booking cannot be collected again.
- [ ] Pending/finalizing/no-document states must not show Print BDC CTA too early.

## Guardrails for future work

Do not reintroduce or weaken these safeguards:

- Do not reintroduce QR cancel.
- Do not treat Booking Deposit as revenue at collection time.
- Do not issue a tax invoice for Booking Deposit collection.
- Do not allow duplicate collection after `paid`.
- Do not allow duplicate collection after `paid_confirm_failed`.
- Do not make document failure roll back payment capture.
- Do not make document failure roll back booking confirmation.
- Do not merge payment finalization and document issuance semantics.

## Important commits

- `1dc54d6` — `fix(pos-v3): harden promptpay qr replacement safety`
- `bd7810a` — `feat(pos-v3): restore active qr booking deposit session recovery`
- `7d51e84` — Phase 2D-B5 Locked Draft Summary UI
- `c263c17` — Phase 2D-B6 Booking Detail Resume CTA + POS query re-entry + `paid_confirm_failed` guard
- Phase 2D-B7 — POS QR paid Print BDC CTA accepted by manual smoke as UX convenience.

## Recommended next phases

- **Option A: Phase 2D acceptance docs/checklist** — now completed by this document.
- **Option B: POS rental operational flow** — pickup, return, settlement, refund, handover, and operational documents.
- **Option C: fiscal / ABB / tax invoice planning** — requires audit/design approval before implementation.

## Out of scope for this document

This document does not implement or change:

- POS pickup
- POS return
- Settlement
- Refund behavior
- ABB
- Tax invoice behavior
- Receipt numbering
- Runtime code
- Tests
- Migrations
