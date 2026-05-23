# Booking Deposit Forfeiture Accounting / Receipt / Terms Design

Last updated: 2026-05-15
Status: Phase 3.1 foundation implemented; receipts, notices, UI document access, POS V2, admin-agreed cancellation forfeiture, and tax invoice conversion blocking remain future work

Sync note: POS V3 Phase 2D Booking Deposit collection is now closed separately. Its acceptance checklist and guardrails live in `docs/phase-2d-booking-deposit-acceptance-checklist.md`; this forfeiture document starts only after Booking Deposit disposition/forfeiture, not at initial collection.

## 1. Purpose and Scope

This document consolidates the accepted Phase 1 audit and Phase 2A/2B/2C design decisions for forfeited Booking Deposit accounting, ordinary receipt, operational notices, and terms governance.

It covers future support for:

- no-show forfeiture
- admin cancellation by agreement with customer + forfeiture
- deposit disposition and financial recognition events
- ordinary receipt and non-tax notice documents
- Booking Deposit Terms governance and acceptance references

It does not implement or specify final SQL/API/UI details. POS V2, advanced accounting export, correction/reversal, and partial forfeiture remain out of scope until separately designed.

## 2. Current Runtime Baseline

- Customer self-service cancellation/refund exists for eligible confirmed/paid rental bookings before the Bangkok calendar-day refund cutoff.
- Late customer cancellation remains support-only after cutoff and must stay separate from no-show.
- No-show lifecycle exists: staff can mark overdue confirmed bookings as `no_show`, creating `rental_booking_no_show_events` and mirroring `no_show_*` fields on `rental_bookings`.
- Current no-show records Booking Deposit as forfeited/refund-not-applicable through `rental_bookings.deposit_refund_status = forfeited`, `deposit_refund_amount = 0`, and no `payment_refunds` row.
- Current no-show now creates a deposit disposition event and financial recognition event; it still does not create an ordinary receipt or operational notice document.

## 3. Locked Business and Tax Treatment

For retained/forfeited Booking Deposit:

- Treat as contractual penalty / damages / deposit forfeiture outcome.
- Do not treat as rental fee, service fee, or product sale consideration.
- Document treatment is ordinary receipt only.
- No tax invoice.
- No VAT.
- No WHT.
- No tax invoice conversion for this receipt type.

## 4. Accepted Target Architecture

Target chain:

```txt
Rental Booking
  ↓
Operational Source Event
  - no_show_event
  - future admin_agreed_cancellation_event
  ↓
Deposit Disposition / Forfeiture Event
  - rental_booking_deposit_disposition_events
  ↓
Financial Recognition Event
  - financial_recognition_events
  ↓
Derived Payment Allocation / Accounting Trace
  ↓
Ordinary Receipt / Notice Documents
```

The receipt must source from `financial_recognition_events`, not directly from `rental_bookings`, operational events, or `payment_allocations`.

## 5. Source-of-Truth Boundaries

- `rental_bookings`: booking identity, customer/asset/rental snapshots, and mirror/status fields.
- `rental_booking_no_show_events`: operational truth for no-show facts only.
- `rental_booking_cancellation_events`: operational truth for cancellation facts, including future admin-agreed cancellation.
- `rental_booking_deposit_disposition_events`: implemented source of truth for terminal Booking Deposit outcome such as no-show `forfeited`.
- `financial_recognition_events`: implemented source of truth for accounting recognition of forfeited Booking Deposit.
- `payment_allocations`: derived accounting/payment trace only; not domain truth and not receipt source.
- `official_documents`: issued document/receipt snapshots, numbering, status, and print lifecycle only; not accounting truth.
- `rental_bookings.deposit_refund_status`: mirror/status only, updated as consequence of disposition.

## 6. Future Data Model Direction

### `rental_booking_deposit_disposition_events`

Role: durable event for final Booking Deposit outcome across no-show and future admin-agreed cancellation.

Essential direction:

- source event type: `no_show` implemented; `admin_agreed_cancellation` reserved for future use
- links to no-show event or cancellation event
- outcome initially `forfeited`
- forfeited amount, currency, occurred timestamp, actor, reason, policy/terms references
- one terminal disposition per booking for the current Booking Deposit model
- updates booking mirror fields but remains authoritative over those mirrors

Future outcomes such as refunded, partially forfeited, or waived are deferred.

### `financial_recognition_events`

Role: durable accounting recognition that a refundable Booking Deposit became contractual penalty/damages/deposit forfeiture income.

Essential direction:

- recognition type: `booking_deposit_forfeiture_income`
- source: deposit disposition event
- recognized amount, currency, recognition timestamp
- tax treatment: non-VAT contractual penalty; VAT amount `0`
- WHT treatment: not subject to WHT; WHT amount `0`
- automatic/idempotent creation when forfeiture disposition is created
- optional derived `payment_allocations` trace for reporting/reconciliation

## 7. Document Architecture

### Ordinary Receipt

- Reuse `official_documents`.
- Future `document_type`: `booking_deposit_forfeiture_ordinary_receipt`.
- Customer-facing title: `ใบเสร็จรับเงิน`.
- `source_type`: `financial_recognition_event`.
- `source_id`: financial recognition event ID.
- Auto-issue after financial recognition succeeds.
- Snapshot includes booking, customer, issuer, recognition, disposition, operational source, terms references, amount, no VAT, no WHT, and no tax invoice conversion capability.
- Backend/service layer must enforce no tax invoice conversion; UI hiding is not enough.

Recommended Thai line items:

- No-show: `ริบเงินมัดจำจองตามเงื่อนไขการจอง เนื่องจากลูกค้าไม่มารับสินค้าตามกำหนด`
- Admin-agreed cancellation: `ริบเงินมัดจำจองตามข้อตกลงการยกเลิกการจองกับลูกค้า`

### Operational Notices

Use `official_documents` as non-tax generated documents with numbering, immutable snapshots, and print/reprint lifecycle.

- `rental_booking_no_show_cancellation_notice`: `หนังสือแจ้งการยกเลิกการจองเนื่องจากไม่มารับสินค้า`, source = no-show event.
- `rental_booking_admin_agreed_cancellation_notice`: `หนังสือยืนยันการยกเลิกการจองตามข้อตกลงกับลูกค้า`, source = cancellation event.

Customer/admin booking detail should eventually show summary + document cards. Broader Customer Document Center can be deferred.

## 8. Terms / Agreement Governance

- Booking Deposit Terms are the canonical legal source for refund timing, no-show forfeiture, admin-agreed cancellation forfeiture, retained amount classification, and ordinary receipt treatment.
- Rental Agreement should cross-reference Booking Deposit Terms only.
- Terms of Service should cross-reference transaction-specific booking/rental/deposit terms only.
- Do not duplicate full forfeiture wording across multiple legal documents, UI locale strings, server constants, receipt templates, or notices.

Recommended future governance:

- `agreement_versions`: canonical published legal content and version; `booking_deposit_terms` is now an allowed agreement type.
- `agreement_acceptance_logs`: canonical acceptance proof; Booking Deposit payment acceptance logs canonical evidence when a published active version and request evidence are available.
- `rental_booking_deposit_agreements`: booking/payment-specific snapshot and operational lookup referencing canonical version/acceptance when available, with legacy fallback snapshot support.
- UI and server acceptance should resolve the same active agreement version/hash to avoid wording drift.
- Disposition, recognition, receipt, and notices should reference the accepted terms version/acceptance, not mutable display strings.

## 9. Phase 3 Implementation Roadmap

1. **Phase 3.1 — Foundation implemented**: Booking Deposit Terms agreement type/reference support, booking-specific acceptance links, no-show disposition event, financial recognition event, and idempotent no-show integration.
2. **Phase 3.2 — Operational hardening / next foundation**: decide whether to add derived `payment_allocations` trace, admin review surfaces, or browser smoke coverage before receipt work.
3. **Phase 3.3 — Ordinary Receipt**: official receipt auto-issued from recognition with no tax invoice conversion.
4. **Phase 3.4 — No-show Notice + Customer/Admin Document Access**: notice document, booking detail cards, safe customer loaders, admin print/reprint.
5. **Phase 3.5 — Admin-agreed Cancellation Forfeiture**: policy/evidence capture and reuse of the same event/recognition/document chain.
6. **Later**: accounting export, correction/reversal, broader Customer Document Center, partial forfeiture, waived outcomes, and advanced document replacement flows.

## 10. Explicit Non-goals / Deferrals

- No POS V2 in this track.
- No tax invoice conversion for forfeiture ordinary receipt.
- No advanced accounting export yet.
- No correction/reversal yet.
- No partial forfeiture or waived outcome until separately designed.
- No separate receipt subsystem if `official_documents` can support the document cleanly.

## 11. Implementation Risks / Guardrails

- Reuse `official_documents`, `document_sequences`, and `document_events`; do not duplicate receipt numbering or print lifecycle.
- Do not let `payment_allocations` become a conflicting source of truth.
- Avoid double-counting original cash receipt and later income recognition.
- Keep operational source events, disposition, recognition, allocation trace, and documents separate.
- If UI is implemented later, explicitly check lifecycle hooks, loading timing, refresh/reload after mutations, cleanup of pending async work, and state synchronization between booking status, document cards, and action results.
