# Prompt: Final Design Lock — Customer Rental Booking Documents + Cancellation / Refund + Admin Refund Queue

Proceed with the **Final Design Lock** for the next HOPNIC customer-facing rental phase.

This task is **documentation / design finalization only**.

## Hard constraints
- Do **not** implement runtime code.
- Do **not** create migrations yet.
- Do **not** modify app/server behavior.
- Do **not** start POS V2 workflow implementation.
- Do **not** reopen owner-approved decisions below.
- Create/update the canonical design document for this phase and update related planning docs.

---

# 1. Current project context

Use the latest **Current Project Truth / Critical Handoff Summary** and the latest repository-grounded design input pack as factual baseline.

Current reality:
- `/rental-booking-payment/[bookingId]` exists but is payment/status-specific.
- `/user/rentals` exists with rental list + QR modal.
- No full `/user/rentals/[bookingId]` detail page exists yet.
- No customer printable booking/cancellation/refund documents exist yet.
- No customer self-service confirmed-booking cancellation flow exists yet.
- No cancellation provenance schema exists yet.
- No dedicated refund lifecycle table/model exists yet.
- No excessive-cancellation enforcement exists yet.
- Operational Pickup/Return document B.1 is code-complete foundation, but its final E2E smoke remains parked until POS V2 fulfillment exists.
- POS V2 Rental Money Summary / Settlement Preview is a separate POS-track task, not part of this design.

---

# 2. Owner decisions — LOCKED

## 2.1 Refund cutoff: calendar-day logic
Use **calendar-day logic**, not exact 72 hours.

Eligibility rule:

```txt
cancellation_local_date <= pickup_local_date - 3 calendar days
```

Timezone:

```txt
Asia/Bangkok
```

Example:
- Pickup date: June 10
- Last self-service refundable cancellation date: June 7, 23:59:59 Bangkok time

After cutoff:
- Do **not** allow website self-service cancellation.
- Show a HOPNIC contact/support message.

---

## 2.2 Booking Deposit semantics
Booking Deposit is:
- part of refundable security deposit
- not a booking fee
- not service revenue
- not rental revenue at booking time
- customer-facing wording must preserve this meaning

Use:
- **Booking Deposit / เงินมัดจำจอง**

Do not mislabel as:
- reservation fee
- non-refundable fee
- service fee
- rental income

---

## 2.3 Refund handling: Manual Admin Refund Process
Refunds are **not** automatically completed through the gateway in this phase.

Flow:
1. Customer submits eligible cancellation.
2. System cancels booking.
3. System creates immutable cancellation event.
4. System creates refund request / refund obligation.
5. Request appears in Admin Refund Queue.
6. Admin manually processes refund.
7. Admin uploads proof/reference and marks refunded.
8. Customer can view/print Refund Confirmation.

Refund must not appear completed until admin marks it refunded.

---

## 2.4 Customer refund destination form — required
When cancelling an eligible booking, customer must fill:

### Required
- Bank name
- Bank account number
- Bank account name
- Contact phone number for refund follow-up

### Optional
- Customer note to HOPNIC

### Design notes
- Bank name: required; dropdown preferred in implementation.
- Account number: required; numeric-only preferred; avoid over-rigid length rules.
- Account name: required.
- Contact phone: required; numeric validation consistent with existing HOPNIC phone rules.
- Customer must confirm refund destination info is accurate.
- These values must be snapshotted into the refund request, not read live from profile later.

---

## 2.5 Admin UI support is REQUIRED
Because refunds are manual, the design must include an operational **Admin Refund Queue**.

Admin UI must support:
- refund queue/list
- status filters
- refund detail view
- admin processing actions
- proof upload/reference entry
- mark refunded
- needs customer contact
- failed status
- visibility into customer / booking / cancellation / refund details

---

## 2.6 Customer printable documents in first phase
Owner approved customer-printable documents:

### Phase-first printable documents
1. Rental Booking Confirmation
2. Booking Deposit Payment Confirmation

### Also design in same flow
3. Rental Booking Cancellation Confirmation
4. Booking Deposit Refund Confirmation

---

## 2.7 Excessive customer cancellation restriction
Integrate the already locked Master Plan rule:

- Rolling 12-month window
- Restriction applies on the 6th qualifying cancellation
- Count only customer-initiated cancellations of confirmed/paid rental bookings
- Exclude:
  - draft deletion
  - cart removal
  - checkout/session expiry before confirmation
  - payment-attempt cancellation
  - admin/staff/POS/system-side cancellation
- Restricted customers cannot:
  - create new online rental bookings
  - proceed with online rental checkout
  - proceed with mixed checkout containing rental booking
- Sale-only checkout remains allowed
- Use the exact Thai support/contact message already locked in the Master Plan

This design must show how cancellation events and restriction state enable this later.

---

# 3. Overall design direction — LOCKED

Design the next phase as a:

# Combined Thin Slice

Not:
- documents-only
- backend-only
- POS V2

The thin slice must cover:
1. New customer rental booking detail page
2. Customer printable booking and payment confirmation docs
3. Refundable self-service cancellation
4. Refund request creation with bank/contact data
5. Cancellation confirmation document
6. Admin refund queue + manual refund processing
7. Refund confirmation document after admin marks refunded
8. Daily accounting/reporting data foundation
9. Excessive-cancellation tracking foundation

---

# 4. New customer rental booking detail page

Design new route:

```txt
/user/rentals/[bookingId]
```

This becomes the canonical customer rental booking detail/document/refund page.

Existing route:

```txt
/rental-booking-payment/[bookingId]
```

remains payment/status-specific, but the design should recommend how it links or redirects to the new detail page after confirmation.

## Required sections

### A. Booking header
- Booking reference
- Booking status
- Payment/deposit status
- Cancellation/refund state when applicable
- Created/confirmed date where useful

### B. QR Code
- Booking QR shown prominently for confirmed bookings
- Message: show QR to HOPNIC staff on pickup day
- Do not turn this into a fulfillment record

### C. Rental summary
- Rental items/assets
- Quantity if applicable
- Rental start date
- Rental end date
- Rental days
- Pickup branch/location if available
- Booker name/phone snapshot where appropriate

### D. Payment summary
Use the simplified customer wording already adopted in Cart:
- Booking Deposit paid
- Rental fee due at pickup
- Remaining refundable security deposit due at pickup
- Total due at pickup
- Security deposit explanatory note

### E. Documents section
Show view/print actions for available customer documents.

### F. Cancellation / Refund section
Before cancellation:
- if refundable/self-service eligible:
  - show refund eligibility message
  - show CTA: **ยกเลิกการจองและขอคืนเงิน Booking Deposit**
- if outside cutoff:
  - show HOPNIC contact/support message
  - no self-service cancellation CTA

After cancellation:
- show cancellation state
- cancellation date
- refund amount due
- refund request status
- available cancellation/refund documents

---

# 5. Customer document architecture

Use existing `official_documents` document foundation.
Do **not** create a second unrelated document system.

These documents are non-tax, non-receipt confirmation documents, but should still use immutable snapshots and document registry/events patterns.

## Document types

```txt
rental_booking_confirmation
rental_booking_deposit_payment_confirmation
rental_booking_cancellation_confirmation
rental_booking_deposit_refund_confirmation
```

## Source mapping

| Document type | source_type | source_id |
|---|---|---|
| rental_booking_confirmation | rental_booking | booking_id |
| rental_booking_deposit_payment_confirmation | rental_booking | booking_id |
| rental_booking_cancellation_confirmation | rental_booking_cancellation_event | cancellation_event_id |
| rental_booking_deposit_refund_confirmation | payment_refund | refund_id |

## Snapshot rule
All four documents must be immutable issued snapshots.

## Customer print route
Recommend a user-safe route such as:

```txt
/user/documents/[id]/print
```

It must:
- validate ownership/access
- render stored snapshot
- not expose unrelated admin/customer documents

---

# 6. Required customer document contents

## 6.1 Rental Booking Confirmation
Available when:
- booking confirmed
- Booking Deposit paid

Include:
- title
- document reference/number strategy recommendation
- issue timestamp
- booking reference
- customer/booker snapshot
- rental dates
- rental items/assets
- pickup location if available
- QR code
- Booking Deposit amount paid
- rental fee / remaining deposit due at pickup
- security deposit note
- disclaimer: not receipt / not tax invoice

---

## 6.2 Booking Deposit Payment Confirmation
Available when:
- Booking Deposit paid

Include:
- title
- document reference/number strategy recommendation
- issue timestamp
- booking reference
- Booking Deposit paid amount
- paid timestamp
- payment method if safe/available
- payment/reference ID display recommendation
- Booking Deposit semantics note
- disclaimer: payment confirmation only, not receipt / not tax invoice

---

## 6.3 Rental Booking Cancellation Confirmation
Available when:
- customer self-service cancellation succeeds
- cancellation event created

Include:
- title
- cancellation confirmation reference
- cancellation timestamp
- booking reference
- original pickup date snapshot
- refund cutoff date snapshot
- eligibility result
- refund amount due
- refund request created message
- initial refund status
- disclaimer: refund not yet completed

---

## 6.4 Booking Deposit Refund Confirmation
Available when:
- admin marks refund request as refunded

Include:
- title
- refund confirmation reference
- booking reference
- refund request/reference
- refunded amount
- refunded date/time
- refund method = manual transfer / approved manual process
- privacy-safe bank recipient snapshot where appropriate
- admin proof/reference display recommendation
- disclaimer: not receipt / not tax invoice

---

# 7. Cancellation flow design

Design future server-authoritative endpoint, likely:

```txt
POST /api/user/rental-bookings/[id]/cancel
```

or repository-consistent equivalent.

## Must perform
1. Authenticate user
2. Validate booking ownership
3. Validate booking is confirmed and Booking Deposit paid
4. Validate not picked_up / returned / already cancelled
5. Evaluate calendar-day cutoff using Asia/Bangkok
6. Reject self-service cancellation outside cutoff with support message
7. Validate refund bank/contact form
8. Create immutable cancellation event
9. Update rental booking cancellation provenance fields
10. Release reserved availability/inventory if applicable
11. Create refund request / refund obligation
12. Issue Cancellation Confirmation snapshot
13. Count qualifying cancellation and prepare/apply restriction logic per locked policy
14. Return updated customer-visible cancellation/refund state

## Customer cancel form UX
Must include:
- refund eligibility statement
- refund amount
- bank name
- bank account number
- bank account name
- refund contact phone
- optional customer note
- confirmation checkbox that bank data is correct
- final submit action

---

# 8. Cancellation data model design

Propose concrete schema design, but do not implement.

## 8.1 `rental_booking_cancellation_events`
Design immutable audit/event table with field categories:
- id
- booking_id
- user_id
- cancelled_at
- cancellation_initiator
- cancellation_source
- cancellation_reason_code
- cancellation_reason_note if allowed
- pickup_date_snapshot
- cancellation_local_date_snapshot
- refund_cutoff_date_snapshot
- refund_policy_version
- refund_eligible
- refund_amount_due
- qualifies_for_restriction
- qualifying_cancellation_count_after if calculated at write time
- metadata
- created_at

## 8.2 `rental_bookings` summary/provenance fields
Design booking-level read-optimized fields:
- cancelled_at
- cancelled_by_user_id
- cancellation_initiator
- cancellation_source
- cancellation_reason
- cancellation_source_event_id
- cancellation metadata/snapshot fields if needed

Clarify:
- summary fields do not replace immutable cancellation events
- restriction logic must not infer only from `status='cancelled'`

---

# 9. Refund request / payment refund model

Design a generic refund lifecycle table, likely:

```txt
payment_refunds
```

## Required field categories
- id
- refund_type = rental_booking_deposit
- booking_id
- cancellation_event_id
- original payment source type
- original payment source id
- original payment attempt / mixed allocation reference if applicable
- original gateway charge/payment reference if available
- refund_amount
- currency_code

## Refund destination snapshot
- refund_bank_name
- refund_bank_account_number
- refund_bank_account_name
- refund_contact_phone
- refund_customer_note optional

## Status lifecycle
Recommend clear manual admin statuses such as:
- pending_admin_review
- processing
- needs_customer_contact
- refunded
- failed

Explain intended meaning of each.

## Timestamps / admin fields
- requested_at
- processing_at
- needs_contact_at
- refunded_at
- failed_at
- processed_by_admin_id
- admin_note
- manual_refund_reference
- manual_refund_proof_url or proof relation recommendation

---

# 10. Admin Refund UI design

Choose one canonical future admin route and justify:

```txt
/admin/refunds
```

or

```txt
/admin/refunds/rental-booking-deposits
```

## Required queue capabilities
Filters/tabs:
- Pending review
- Processing
- Needs customer contact
- Refunded
- Failed

Columns:
- refund request ref
- booking ref
- customer
- refund contact phone
- cancellation date
- refund amount
- status
- requested time / age
- open detail action

## Required detail view
Show:
- booking summary
- cancellation summary
- cancellation policy result
- refund amount
- bank destination details
- contact phone
- customer note
- original payment source/reference
- relevant document links

## Admin actions
- Start processing
- Mark needs customer contact
- Mark refunded
- Mark failed
- Add internal note
- Add manual transfer reference
- Upload refund proof

## On mark refunded
Design must specify:
- refund record update
- Refund Confirmation document issued
- customer detail page exposes refund confirmation
- this counts toward Refund Paid Today reporting

---

# 11. Excessive cancellation restriction integration

Use locked Master Plan rule.

## Counting point
Count when:
- cancellation event is successfully created

Do not wait for refund completion.

## Restriction fields recommendation
Use dedicated user fields, not `account_status`, such as:
- rental_booking_restriction_status
- rental_booking_restriction_applied_at
- rental_booking_restriction_reason
- rental_booking_restriction_source_event_id
- rental_booking_restriction_cancellation_count
- rental_booking_restriction_window_started_at
- future override fields

## Enforcement surfaces later
Must eventually block:
- new online rental booking creation
- rental checkout
- mixed checkout containing rental booking

Sale-only checkout remains allowed.

---

# 12. Daily accounting / operations foundation

Do not implement report UI in this phase unless separately approved.
But the data model must support future reporting.

Design data sources for:

1. Booking Deposit Received Today
2. Refund Obligation Created Today
3. Refund Paid Today
4. Refund Pending / Processing / Needs Contact / Failed
5. Customers Newly Restricted Today
6. Qualifying cancellation count at restriction

Clarify:
- what must exist in first implementation
- what can remain report UI future
- which timestamps/fields must be captured now

---

# 13. First coding phase recommendation

At the end, recommend the first implementation scope after design approval.

Expected direction:

# Phase C.1 — Combined Thin Slice Foundation

Likely scope:
1. Schema/migration foundation:
   - cancellation events
   - booking cancellation provenance
   - payment refunds
   - user rental restriction fields
2. Server cancellation API with calendar-day refund eligibility
3. New `/user/rentals/[bookingId]` detail page foundation
4. Booking Confirmation + Booking Deposit Payment Confirmation issue/view/print
5. Eligible cancellation modal/form with required refund bank/contact fields
6. Refund request creation + Cancellation Confirmation document
7. Admin refund queue minimal operational UI
8. Admin mark refunded + Refund Confirmation document
9. Tests/build gates
10. Daily-report-readiness fields present; full report UI deferred

Document this as design recommendation, not code.

---

# 14. Docs to update

Create/update a canonical design document for this phase, suggested:

```txt
docs/customer-rental-booking-cancellation-refund-design.md
```

Also update references in:
- `HOPNIC_POS_V2_Master_Implementation_Plan.md`
- `docs/rental-booking-payment-document-action-plan.md`
- documentation map/index if repo uses one

The Master Plan should reflect:
- this design area is now locked
- next coding phase is ready after owner review
- POS V2 Rental Money Summary remains separate future POS-track next
- operational B.1 remains parked for E2E pending POS V2 fulfillment

---

# 15. Required final report back

Report:
1. Executive summary
2. Owner decisions incorporated
3. Final designed flow summary
4. Proposed schema/data model
5. Proposed routes/APIs/UI surfaces
6. Documents edited/created
7. Remaining owner decisions, if any
8. Recommended next implementation task
