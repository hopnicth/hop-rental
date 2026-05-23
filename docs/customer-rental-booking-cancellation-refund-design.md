# Customer Rental Booking Documents + Cancellation / Refund Design

Last updated: 2026-05-14

Status: **PHASE C.1E IMPLEMENTED / REFUND PROOF + QUEUE SMOKE PASSED**

This document remains the canonical design lock for customer rental booking cancellation/refund behavior. Runtime implementation now exists for the self-service eligible cancellation path, customer document/proof access, admin manual refund queue, and admin-managed no-show lifecycle; do not infer late-cancellation semantics from this document without a separate decision.

Implementation sync — 2026-05-14:

- Customer eligible cancellation/refund request flow is implemented and smoke-passed.
- Admin refund proof upload is smoke-passed end-to-end: upload in `/admin/refunds`, admin detail visibility, and customer proof viewing.
- Admin refund queue polish is complete: segmented status filters, per-status counts, and unresolved refund work nav badge.
- Customer refund bank account field now keeps typed/pasted display and submitted model digits-only while backend validation remains final source of truth.
- Latest polish batches did not change refund workflow semantics, refund status names, DB schema, or refund confirmation proof gating.
- No-show Lifecycle Foundation is implemented separately from customer cancellation/refund: staff can mark overdue confirmed bookings `no_show`, Booking Deposit is recorded as forfeited/refund-not-applicable, and no refund request is created.
- Next follow-up is late-cancellation policy review after cutoff; current support-only behavior remains unchanged.
- POS V3 Phase 2D Booking Deposit collection and staff-side BDC printing are closed separately in `docs/phase-2d-booking-deposit-acceptance-checklist.md`; do not infer customer self-service document behavior from the POS staff BDC flow.

## 1. Scope and Current Reality

This phase is a **combined thin slice**, not POS V2 and not a documents-only pass.

Original pre-implementation reality, retained for historical design context:

- `/rental-booking-payment/[bookingId]` exists, but is payment/status-specific.
- `/user/rentals` exists with list + QR modal; no full `/user/rentals/[bookingId]` detail page exists.
- Customer printable booking/cancellation/refund documents do not exist yet.
- Customer self-service confirmed-booking cancellation does not exist yet.
- Cancellation provenance, dedicated refund lifecycle, and restriction enforcement do not exist yet.
- B.1 admin operational pickup/return documents are code-complete foundation, but are not customer documents.
- POS V2 Rental Money Summary / Settlement Preview remains a separate POS-track task.

## 2. Locked Owner Decisions

### 2.1 Refund cutoff

Use **calendar-day logic**, not exact 72 hours.

- Timezone: `Asia/Bangkok`.
- Eligibility: `cancellation_local_date <= pickup_local_date - 3 calendar days`.
- Example: pickup date June 10 means last self-service refundable cancellation date is June 7, 23:59:59 Bangkok time.
- After cutoff, website self-service cancellation is not allowed; show HOPNIC contact/support message.

### 2.2 Booking Deposit semantics

Booking Deposit / เงินมัดจำจอง is part of refundable security deposit. It is not a booking fee, service fee, rental revenue, or rental income at booking time. Customer-facing wording must preserve this meaning.

### 2.3 Manual admin refund process

Refunds are not automatically completed through the gateway in this phase.

Flow: customer cancels eligible booking → system cancels booking → immutable cancellation event → refund obligation/request → Admin Refund Queue → admin manually processes and uploads proof/reference → admin marks refunded → customer can view/print refund confirmation.

### 2.4 Customer refund destination form

Eligible cancellation requires customer-entered refund destination snapshot:

- Required: bank name, bank account number, bank account name, refund contact phone.
- Optional: customer note to HOPNIC.
- Customer must confirm the destination information is accurate.
- Values must be snapshotted into the refund request; do not read live profile data later.

### 2.5 Excessive cancellation restriction

Use the Master Plan Section 1.4 rule unchanged:

- Rolling 12-month window; restriction on the 6th qualifying cancellation.
- Count only customer-initiated cancellations of confirmed/paid rental bookings.
- Exclude draft deletion, cart removal, checkout/session expiry before confirmation, payment-attempt cancellation, admin/staff/POS/system cancellation.
- Restricted users cannot create online rental bookings, proceed through rental checkout, or mixed checkout containing rental bookings.
- Sale-only checkout remains allowed.
- Use the exact Thai support message locked in the Master Plan.

## 3. Customer Rental Detail Page

New canonical route:

- `/user/rentals/[bookingId]`

Purpose: customer rental booking detail, QR, documents, cancellation/refund state, and future support entry point.

`/rental-booking-payment/[bookingId]` remains payment/status-specific and should link to the new detail page after confirmation.

Required sections:

- Booking header: booking reference, booking status, payment/deposit status, cancellation/refund state, created/confirmed date where useful.
- QR code: show booking QR for confirmed bookings with message to show HOPNIC staff on pickup day; do not turn QR into fulfillment evidence.
- Rental summary: items/assets, quantity if applicable, rental dates, rental days, pickup branch, booker snapshot.
- Payment summary: Booking Deposit paid, rental fee due at pickup, remaining refundable security deposit due at pickup, total due at pickup, security-deposit explanatory note.
- Documents section: available customer view/print actions.
- Cancellation/refund section: eligibility before cancellation; cancellation/refund timeline after cancellation.

## 4. Customer Document Architecture

Use the existing `official_documents` foundation. Do not create a second unrelated document system.

These documents are non-tax, non-receipt confirmation documents, but must use immutable snapshots and document events/registry patterns.

Document types:

| Type                                          | Source type                         | Source id               |
| --------------------------------------------- | ----------------------------------- | ----------------------- |
| `rental_booking_confirmation`                 | `rental_booking`                    | `booking_id`            |
| `rental_booking_deposit_payment_confirmation` | `rental_booking`                    | `booking_id`            |
| `rental_booking_cancellation_confirmation`    | `rental_booking_cancellation_event` | `cancellation_event_id` |
| `rental_booking_deposit_refund_confirmation`  | `payment_refund`                    | `refund_id`             |

Customer print route recommendation:

- `/user/documents/[id]/print`

Requirements:

- Validate authenticated customer ownership/access.
- Render only stored immutable snapshot.
- Do not expose admin-only or unrelated customer documents.
- Clearly state “not receipt / not tax invoice” for non-official confirmation documents.

## 5. Required Customer Documents

### 5.1 Rental Booking Confirmation

Available when booking is confirmed and Booking Deposit is paid.

Include: title, document reference/number strategy, issue timestamp, booking reference, customer/booker snapshot, rental dates, item/assets, pickup location if available, QR code, Booking Deposit paid, rental fee and remaining deposit due at pickup, security deposit note, and not receipt/tax invoice disclaimer.

### 5.2 Booking Deposit Payment Confirmation

Available when Booking Deposit is paid.

Include: title, document reference/number strategy, issue timestamp, booking reference, Booking Deposit paid amount, paid timestamp, safe payment method/reference display, Booking Deposit semantics note, and not receipt/tax invoice disclaimer.

### 5.3 Rental Booking Cancellation Confirmation

Available when customer self-service cancellation succeeds and cancellation event is created.

Include: title, cancellation reference, cancellation timestamp, booking reference, original pickup date snapshot, refund cutoff date snapshot, eligibility result, refund amount due, refund request created message, initial refund status, and disclaimer that refund is not yet completed.

### 5.4 Booking Deposit Refund Confirmation

Available only after admin marks refund as refunded.

Include: title, refund reference, booking reference, refund request reference, refunded amount, refunded date/time, manual refund method, privacy-safe recipient snapshot, admin proof/reference display recommendation, and not receipt/tax invoice disclaimer.

## 6. Customer Cancellation Flow

Future endpoint recommendation:

- `POST /api/user/rental-bookings/[id]/cancel`

Server-authoritative requirements:

1. Authenticate user and validate booking ownership.
2. Validate booking is confirmed and Booking Deposit paid.
3. Reject picked-up, returned, already-cancelled, unpaid, or non-owned bookings.
4. Evaluate calendar-day cutoff in Asia/Bangkok.
5. Reject self-service cancellation outside cutoff with support/contact message.
6. Validate refund bank/contact form and customer accuracy confirmation.
7. Create immutable cancellation event.
8. Update rental booking summary/provenance fields.
9. Release reserved availability/inventory if applicable.
10. Create refund request / refund obligation.
11. Issue Cancellation Confirmation snapshot.
12. Count qualifying cancellation and prepare/apply restriction logic per Master Plan.
13. Return updated customer-visible cancellation/refund state.

Customer form must show refund eligibility, refund amount, refund destination fields, optional note, accuracy confirmation checkbox, and final submit action.

## 7. Data Model Design

### 7.1 `rental_booking_cancellation_events`

Immutable audit/event table. Required categories:

- Identity: `id`, `booking_id`, `user_id`, actor/admin fields if needed later.
- Timing: `cancelled_at`, `created_at`.
- Provenance: `cancellation_initiator`, `cancellation_source`, `cancellation_reason_code`, optional `cancellation_reason_note`.
- Policy snapshot: `pickup_date_snapshot`, `cancellation_local_date_snapshot`, `refund_cutoff_date_snapshot`, `refund_policy_version`, `refund_eligible`, `refund_amount_due`.
- Restriction support: `qualifies_for_restriction`, `qualifying_cancellation_count_after` if calculated at write time.
- Metadata: JSON object for policy/input/debug snapshot.

### 7.2 `rental_bookings` summary fields

Read-optimized fields should mirror the latest cancellation state:

- `cancelled_at`
- `cancelled_by_user_id`
- `cancellation_initiator`
- `cancellation_source`
- `cancellation_reason`
- `cancellation_source_event_id`
- scalar refund summary fields such as `cancellation_refund_eligible`, `cancellation_refund_amount_due`, and `cancellation_refund_cutoff_date`

These do not replace immutable cancellation events. Restriction logic must never infer qualifying cancellations from `status = 'cancelled'` alone.

### 7.3 `payment_refunds`

Generic refund lifecycle table. Required categories:

- Identity/source: `id`, `refund_type = rental_booking_deposit`, `booking_id`, `cancellation_event_id`.
- Original payment linkage: source type/id, original direct payment attempt or mixed allocation, gateway charge/payment reference when available.
- Amount: `refund_amount`, `currency_code`.
- Destination snapshot: bank name, account number, account name, contact phone, optional customer note.
- Status: `pending_admin_review`, `processing`, `needs_customer_contact`, `refunded`, `failed`.
- Admin/timestamps: requested/processing/needs-contact/refunded/failed timestamps, processed admin id, admin note, manual transfer reference, and proof-file relation via `rental_booking_deposit_proofs`.

Status meanings:

- `pending_admin_review`: refund obligation created and waiting for staff.
- `processing`: admin has started manual refund handling.
- `needs_customer_contact`: bank/contact issue requires customer follow-up.
- `refunded`: admin completed refund and attached reference/proof as required.
- `failed`: manual refund attempt failed or cannot be completed without further decision.

### 7.4 User restriction fields

Use dedicated rental restriction fields on `users`, not `account_status`:

- `rental_booking_restriction_status`
- `rental_booking_restriction_applied_at`
- `rental_booking_restriction_reason`
- `rental_booking_restriction_source_event_id`
- `rental_booking_restriction_cancellation_count`
- `rental_booking_restriction_window_started_at`
- future override/unrestriction fields

## 8. Admin Refund Queue

Canonical future route: `/admin/refunds`.

Reason: refund operations may later include rental deposits, sale refunds, adjustments, and manual payments. Filter by refund type rather than baking rental deposit into the route.

Required filters/tabs:

- Pending review
- Processing
- Needs customer contact
- Refunded
- Failed

Queue columns:

- Refund request reference, booking reference, customer, refund contact phone, cancellation date, refund amount, status, requested time/age, open detail action.

Detail view:

- Booking summary, cancellation summary, policy result, refund amount, bank destination details, contact phone, customer note, original payment source/reference, related document links.

Admin actions:

- Start processing, mark needs customer contact, mark refunded, mark failed, add internal note, add manual transfer reference, upload refund proof.

On mark refunded:

- Update refund record to `refunded`.
- Issue Refund Confirmation document snapshot.
- Customer detail page exposes refund confirmation.
- Event becomes source for Refund Paid Today reporting.

## 9. Daily Accounting / Operations Foundation

Do not implement report UI in Phase C.1 unless separately approved. The data model must support these future outputs:

| Output                                               | Required source                                             |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Booking Deposit Received Today                       | Paid booking deposit attempt/allocation timestamps          |
| Refund Obligation Created Today                      | `payment_refunds.requested_at` with cancellation event link |
| Refund Paid Today                                    | `payment_refunds.refunded_at`                               |
| Refund Pending / Processing / Needs Contact / Failed | `payment_refunds.status`                                    |
| Customers Newly Restricted Today                     | user restriction applied timestamp/source event             |
| Qualifying cancellation count at restriction         | restriction count/window fields and cancellation events     |

Phase C.1 should capture timestamps and links now; full daily report UI can remain future work.

## 10. Phase C.1 Recommended Implementation Scope

After owner approval, implement **Phase C.1 — Combined Thin Slice Foundation**:

1. Migrations for cancellation events, booking cancellation provenance, payment refunds, and user rental restriction fields.
2. Server cancellation API with Bangkok calendar-day eligibility.
3. New `/user/rentals/[bookingId]` detail page foundation.
4. Booking Confirmation + Booking Deposit Payment Confirmation issue/view/print.
5. Eligible cancellation modal/form with refund bank/contact fields.
6. Refund request creation + Cancellation Confirmation document.
7. Minimal Admin Refund Queue at `/admin/refunds`.
8. Admin mark refunded + Refund Confirmation document.
9. Tests for policy cutoff, ownership, cancellation provenance, refund states, document snapshots, and restriction counting foundation.
10. Daily-report-readiness fields present; report UI deferred.

## 11. Explicit Non-Scope

- No POS V2 Pickup/Return workflow implementation.
- No automatic gateway refunds.
- No official receipt, tax invoice, abbreviated/full tax invoice, WHT, credit note, or accounting-ledger finalization.
- No replacement of B.1 operational pickup/return documents.
- No inference of qualifying cancellation from plain `rental_bookings.status = 'cancelled'`.
- No unrestricted customer self-service cancellation after the calendar-day cutoff.
