# HOPNIC POS V2 Master Implementation Plan

> **Document purpose:** This is the authoritative implementation-controlling plan for **Core HOPNIC Admin POS V2**. It exists so future AI coding agents and developers can rebuild the POS frontend/workflow structure safely while preserving existing backend foundations.

> **Reality sync status — 2026-05-15:** This file is the canonical POS V2 control plan and is staged for Git tracking. Code reality: POS V2 Phase 1 shell is code-present; POS-track Rental Money Summary / Settlement Preview remains separate **NEXT** work; Pickup V2, Return & Settlement V2, POS V2 fulfillment, POS fiscal documents, ABB → Full replacement, POS void/return/refund controls, WHT evidence capture, and shared accounting source tagging are approved Core POS V2 scope but are not code-complete. Daily reports, cashier shift closing, full accounting export, bank reconciliation automation, WHT statutory automation, deep B2B billing/credit workflow, and restriction unblocking remain **future/parked unless explicitly approved**. Section 1.4 excessive-cancellation rule is **locked design** and is not yet implemented in schema/code. Customer rental booking detail/documents/cancellation/manual-refund/admin-refund-queue design is locked in `docs/customer-rental-booking-cancellation-refund-design.md` for future Phase C.1.

---

## 0. Core Principle

HOPNIC POS V2 is **not a greenfield rewrite**.

The approved strategy is:

- Rebuild the **POS frontend / workflow structure**.
- Reuse existing **backend, schema, APIs, fulfillment logic, KYC, checklist, signature, deposit, payment-line, document, and B2B foundations**.
- Keep legacy `/admin/pos` alive during transition.
- Build POS V2 in parallel at `/admin/pos-v2`.
- Do not break current working operations.
- Do not duplicate backend systems that already exist.
- Treat this document as approved scope only for **Core POS V2**. Future candidate items require separate owner approval before coding.

### 0.1 Default Build Philosophy

The default strategy is:

> **Frontend/workflow rebuild with backend reuse.**

Backend changes are allowed only when necessary to safely support POS V2. Do not refactor or redesign backend systems merely because a new frontend is being built.

The intentional backend-first exceptions are:

1. **Rental Money Summary** — money-sensitive UI must not invent canonical calculations.
2. **Rental Settlement Preview** — return settlement math must be server-calculated or server-validated before final submission.
3. **POS Fiscal Documents** — issue receipt / abbreviated tax invoice for approved POS taxable income events through existing official document foundations only.
4. **POS Accounting Source Tagging** — POS and Online financial records must share the same financial/accounting event path and differ by source metadata, not by separate ledgers.

These exceptions do **not** authorize a broad ERP/accounting rebuild. They authorize only the minimum fiscal-document, void/refund, WHT evidence, and accounting-source foundations required for real counter operation.

---

## 1. Confirmed Business Flow

### 1.1 Rental Payment Lifecycle

This flow is fixed and must not be changed unless explicitly approved by the project owner.

| Stage             | Payment / Action                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Booking           | Customer pays **Booking Deposit**                                                             |
| Pickup / Handover | Customer pays **Rental Fee + Remaining Refundable Security Deposit**                          |
| Return            | Company refunds security deposit or deducts actual damage / late / penalty / approved charges |

### 1.2 Booking Deposit Rule

- Booking Deposit is **part of the refundable security deposit**.
- Booking Deposit is **not** a booking fee.
- Booking Deposit is **not** service income by business design.
- At pickup, Booking Deposit reduces the remaining refundable security deposit due.

### 1.3 Walk-in Instant Rental Rule

For same-session counter rental:

- Staff creates the rental booking.
- Staff proceeds directly into pickup completion.
- Customer pays:
  - Rental Fee
  - Full Refundable Security Deposit
- The UI should not force a separate Booking Deposit step unless needed internally for accounting consistency.
- Because instant rental requires pickup-day payment, checklist, signature, and status transition to `picked_up`, it belongs with **Pickup V2**, not the future-booking phase.

### 1.4 Excessive Customer Cancellation Restriction

This is a confirmed HOPNIC business rule and must be treated as a hard online-booking guardrail:

> If a customer cancels confirmed rental bookings more than 5 times within a rolling 12-month period, the customer is restricted from creating new rental bookings online and must contact HOPNIC.

Locked interpretation:

- Use a **rolling 12-month window**, not a calendar year.
- The 6th qualifying cancellation inside the rolling window triggers restriction.
- Count only cancellations that were **customer-initiated** and where the rental booking had already reached confirmed/paid commercial state.
- Do **not** count draft booking deletion, cart removal, mixed-checkout cancellation/expiry before confirmation, payment-attempt cancellation, admin/staff operational cancellation, POS cancellation, or system cleanup.
- The restriction applies to **new online rental booking creation / online booking checkout**, not sale-product checkout.
- Restricted customers must see this exact Thai message when attempting an online rental booking:

```text
บัญชีของคุณถูกจำกัดการจองเช่าชั่วคราว เนื่องจากมีประวัติการยกเลิกการจองเกินเกณฑ์ที่กำหนด กรุณาติดต่อ HOPNIC เพื่อให้เจ้าหน้าที่ตรวจสอบและดำเนินการต่อ
```

Schema/design implications from the current codebase:

- `rental_bookings.status = 'cancelled'` alone is insufficient because current cancellations can come from customer UI, admin rental detail, POS history cancellation, payment cancellation, checkout expiry, and system cleanup.
- Future implementation must add cancellation provenance before counting restrictions.
- Recommended booking-level provenance fields: `cancelled_at`, `cancelled_by_user_id`, `cancellation_initiator`, `cancellation_source`, `cancellation_reason`, `cancellation_source_event_id`, and cancellation metadata/snapshot fields.
- Recommended immutable audit table: `rental_booking_cancellation_events`, capturing booking id, customer id, actor id/type, previous status, payment/deposit status at cancel time, initiator, source, reason, event timestamp, and metadata.
- Recommended customer restriction fields should be dedicated rental fields on `public.users`, not overloaded into `account_status`: `rental_booking_restriction_status`, `rental_booking_restriction_applied_at`, `rental_booking_restriction_reason`, `rental_booking_restriction_source_event_id`, `rental_booking_restriction_cancellation_count`, `rental_booking_restriction_window_started_at`, plus future override fields (`overridden_at`, `overridden_by`, `override_reason`).

Server-side enforcement requirements:

- Because online booking currently has client-side/direct Supabase insert paths, protection must exist at the database/RLS or trigger/RPC level, not only in Nuxt server handlers.
- Server handlers must also guard service-role flows, especially rental booking confirmation and mixed checkout prevalidation/creation.
- POS/admin staff views must show restriction status for customer-support visibility, but staff override/unrestriction is a separately approved future admin operation.
- Any future staff booking bypass or unblock must require role authorization, reason capture, timestamp, actor id, and audit event.

Daily operations/reporting impact:

- Daily accounting/operations reports should include customers newly restricted today due to excessive cancellations.
- Include the qualifying cancellation count and rolling-window start/end where operationally useful.
- This report is for operations/support visibility and must not become a duplicate accounting ledger.

### 1.5 Customer Cancellation / Booking Deposit Refund Design Lock

Canonical design document:

- `docs/customer-rental-booking-cancellation-refund-design.md`

Locked direction:

- Build a customer-facing combined thin slice, not a POS V2 workflow.
- Add `/user/rentals/[bookingId]` as the customer rental booking detail/document/refund page.
- Use Bangkok **calendar-day** refund cutoff: `cancellation_local_date <= pickup_local_date - 3 calendar days`.
- Eligible self-service cancellation creates cancellation provenance, refund obligation, Admin Refund Queue entry, and cancellation confirmation snapshot.
- Refunds are manual admin process first; no automatic gateway refund in this phase.
- Customer refund destination form is required and must be snapshotted.
- Customer documents use existing `official_documents` snapshots/events; they are non-tax, non-receipt confirmations.
- Admin refund queue route should be `/admin/refunds`.
- Daily report UI is deferred, but Phase C.1 data must support refund obligation, refund paid, pending/failed, and restriction reporting later.

---

## 2. Scope Framing

This plan intentionally separates approved implementation scope from future candidate roadmap ideas.

### 2.1 Core Approved POS V2 Build Scope

Future AI agents may implement these phases when explicitly asked to code POS V2:

1. POS V2 Shell / Dashboard / Lookup
2. Rental Money Summary
3. Rental Settlement Preview design/foundation
4. Staff-Created Future Booking
5. Pickup V2
6. Walk-in Instant Rental, grouped with Pickup V2
7. Return & Settlement V2
8. History / Search / Reprint of operational POS documents
9. Sales POS V2 basic workflow
10. POS Fiscal Documents for POS Sale and POS Rental Fee collection
11. ABB → Full Fiscal Document Replacement
12. POS Void / Return / Refund baseline controls
13. POS/Online shared accounting source tagging and WHT evidence capture

Core POS V2 is no longer only an operational rental/sales workflow rebuild. It must include the minimum fiscal-document, void/refund, WHT evidence, and accounting-source foundations required for real counter operation while avoiding unnecessary ERP/accounting expansion.

Approved fiscal-document scope:

- Issue receipt / abbreviated tax invoice for **POS Sale** transactions.
- Issue receipt / abbreviated tax invoice for **Rental Fee collected at POS**.
- Do **not** treat Booking Deposit or Refundable Security Deposit as taxable sale-income document items.
- Reuse existing `official_documents`, `document_sequences`, `document_events`, `customer_tax_profiles`, payment allocation/payment-line foundations, and existing document-print foundations.
- Do not create a second invoice/document system or parallel fiscal numbering subsystem.

Fiscal Document Coverage Matrix:

| Event / transaction         | Fiscal document eligibility                    | Required interpretation                                           |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| POS Sale                    | Eligible for receipt / abbreviated tax invoice | Sale income event; source must carry POS/branch/staff context     |
| POS Rental Fee collection   | Eligible for receipt / abbreviated tax invoice | Rental income event; issue against rental fee amount only         |
| Booking Deposit             | No sales tax invoice                           | Non-tax refundable deposit; part of refundable security deposit   |
| Refundable Security Deposit | No sales tax invoice                           | Non-tax refundable deposit; not sale income                       |
| Deposit refund              | No sales invoice event                         | Money movement/refund/settlement event, not income                |
| ABB → Full replacement      | Replacement document only                      | Not a second sale; must not duplicate revenue/accounting postings |

Approved POS correction/control scope:

- Abbreviated receipt/tax invoice may be replaced by a full-form receipt/tax invoice through a controlled workflow.
- ABB → Full replacement must be traceable, evidence-aware, and must not create duplicate revenue/accounting postings.
- Void, Return, Refund, and ABB → Full replacement are legally/accountingly different concepts and must remain separate subflows.
- Minimum POS void/return/refund capability is Core POS V2, but broad credit-note/debit-note coverage for complex tax cases remains future unless later approved.

Approved shared accounting-source scope:

- POS and Online transactions must use the same accounting/financial event foundation wherever a financial/accounting event is needed.
- POS must be differentiated by source metadata, not by creating a separate accounting pipeline.
- POS-originated fiscal/financial records must carry `source_channel = pos`, `branch_id`, `staff_user_id` / creator actor, and `issuing_staff_user_id` where applicable.
- POS register/terminal identity may be reserved as optional/future-compatible metadata, but Core POS V2 must not force a full terminal/shift-closing implementation.
- Schema/API audit is required before coding any broad source-tagging changes because current foundations include `official_documents`, `payment_allocations`, and narrow `financial_recognition_events`, but not every table currently has an explicit `source_channel` column.

### 2.2 Future Candidate Scope — Requires Separate Owner Approval Before Coding

The following topics are documented as roadmap candidates only. They are **not approved implementation scope** under Core POS V2:

- Rental Extension
- Booking Edit / Reschedule / Cancel
- Overdue Follow-up
- Customer account invite / resend invite / password setup / reset-password support flow
- Deep B2B POS workflow
- Full accounting export
- Bank reconciliation automation
- Daily reports / cashier shift closing
- Legacy POS retirement execution
- Complex staff/admin permission redesign
- Quote / reservation draft system
- Partial return
- WHT automation engine or statutory filing automation
- Credit note / debit note coverage for all complex tax edge cases unless later approved
- Deep B2B billing / credit workflows
- Rental extension / reschedule / advanced edit flows

The following are **not future-only anymore** and are now Core POS V2 only to the minimum extent defined above:

- Official Receipt / Abbreviated Tax Invoice / Full Tax Invoice needed for POS Sale and POS Rental Fee collection.
- POS document cancellation/replacement needed for ABB → Full replacement.
- POS Void / Return / Refund baseline.
- WHT evidence capture linked to POS fiscal document issuance.

Future agents must not implement future-candidate items unless a later prompt explicitly approves the specific future phase.

---

## 3. Approved Architecture Direction

### 3.1 Legacy POS

| Route        | Status                               |
| ------------ | ------------------------------------ |
| `/admin/pos` | Keep as legacy POS during transition |

Rules:

- Do not delete legacy POS in early phases.
- Do not redirect `/admin/pos` to V2 until parity checks pass.
- Do not break existing sales/rental functions.

### 3.2 New POS V2

| Route           | Status                    |
| --------------- | ------------------------- |
| `/admin/pos-v2` | New modular POS workspace |

Initial strategy:

- Use `/admin/pos-v2` for new shell and workflows.
- Keep backend reuse as default.
- Add feature flags if production/staff exposure is risky.
- Switch `/admin/pos` only after explicit owner approval and parity validation.

### 3.3 Official Document and Sequence Architecture

Core POS V2 must reuse the existing official document foundation:

- `official_documents` is the issued document registry and immutable snapshot store.
- `document_sequences` / `f_next_document_number` allocate document numbers.
- `document_events` records lifecycle audit events such as issue, print, reprint, void, replacement, and preview.
- `customer_tax_profiles` stores customer/company tax identity for full-form documents.

Implementation guardrails:

- Do not create any `pos_invoices`, `pos_receipts`, or parallel numbering tables.
- Do not issue fiscal documents from frontend-only state.
- Draft document data may be prepared before issue, but issued document number, source, customer/tax identity, totals, template, and snapshot are immutable.
- Reprint must render from the issued snapshot and must not create a new fiscal document or accounting event.

### 3.4 Shared Financial / Accounting Lineage

Core POS V2 must use the same accounting/financial event foundation as Online transactions where money is recognized, refunded, or allocated.

Current foundation reality:

- `payment_allocations` already supports payment/deposit/refund/fee allocation traces and links to `official_documents`.
- `financial_recognition_events` currently exists for a narrow forfeited Booking Deposit recognition chain.
- `rental_booking_payment_lines` contains rental payment-line tax/WHT fields.
- Not every existing table exposes a first-class `source_channel` field.

Implementation direction:

- Use existing foundations first, extending them only after schema/API audit.
- POS-originated records must carry POS source context through first-class columns where available or controlled metadata where schema extension is deferred.
- Required source dimensions are POS vs Online, branch, staff actor, and issuing staff where applicable.
- Document issuance alone is not always an accounting posting.
- Do not build a POS-only ledger, POS-only refund model, or POS-only settlement model.

---

## 4. Existing Foundations to Reuse

Future AI agents must not rebuild these unless explicitly instructed.

| Area                       | Existing Foundation                                                    | Instruction                                                   |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| Rental pickup/return       | `server/utils/rental-fulfillment.ts` and pickup/return endpoints       | Reuse untouched by default                                    |
| Checklists                 | Booking checklist APIs and `AdminBookingChecklists.vue`                | Reuse / compose                                               |
| Signature                  | `DigitalSignaturePad.vue`                                              | Reuse                                                         |
| Booking documents/evidence | Booking document APIs and `AdminBookingDocuments.vue`                  | Reuse                                                         |
| KYC / ID upload            | Admin customer ID upload, user KYC upload, company KYC upload          | Reuse                                                         |
| Staff booking creation     | Existing POS booking creation API                                      | Reuse / extend carefully only if required                     |
| Sales POS                  | Existing POS sales API                                                 | Reuse                                                         |
| POS history                | Existing POS history APIs where useful                                 | Reuse / adapt minimally                                       |
| Deposit/refund             | Existing deposit fields, refund fields, deposit logs                   | Reuse                                                         |
| Rental payment lines       | Existing rental booking payment lines                                  | Reuse as canonical money foundation                           |
| Official docs              | `official_documents`, `document_sequences`, `document_events`          | Reuse now for Core POS fiscal documents; do not duplicate     |
| Tax profiles               | `customer_tax_profiles`                                                | Reuse for full-form fiscal documents                          |
| Payment/accounting traces  | `payment_allocations`, `financial_recognition_events` where applicable | Reuse / audit before extension; do not create POS-only stream |
| WHT/payment-line flags     | `rental_booking_payment_lines` WHT fields                              | Reuse for rental fee WHT status/evidence direction            |
| B2B                        | `companies`, `company_members`, company context                        | Reuse later                                                   |

---

## 5. Core POS V2 Product Modules

### 5.1 Dashboard / Lookup

Purpose: one place for staff to search, scan, and start work.

Target capabilities:

- Scan Booking QR
- Scan Customer QR if available
- Search phone
- Search Booking No.
- Search customer name
- Search company name / tax ID where existing data/API supports it
- Show today’s pickups
- Show today’s returns
- Show active rentals
- Show overdue rentals
- Show KYC-incomplete bookings

Phase 1 does **not** need to complete all queue intelligence. If a queue card/search source lacks a clean dedicated API, use existing read APIs, a safe minimal adapter if necessary, or mark it as placeholder/deferred.

### 5.2 Rental

Core submodules:

1. Staff-Created Future Booking
2. Pickup V2
3. Walk-in Instant Rental, inside Pickup V2
4. Return & Settlement V2
5. Active rental lookup for return/pickup context

Future candidate submodules, not core scope:

- Rental Extension
- Booking Edit / Reschedule / Cancel
- Overdue Follow-up
- Partial return

### 5.3 Sales

Core submodules:

1. Sales POS V2 basic workflow
2. Basic sales history/search
3. Operational receipt/confirmation display if supported by existing foundations
4. Fiscal document issue entry point for POS Sale after Phase 8
5. Return/refund entry point after Phase 10

Future candidate submodules, not core scope:

- Daily sales reports / shift closing
- Complex promotions
- Advanced return/correction workflows beyond the Phase 10 baseline

### 5.4 Customers / Verification

Core capabilities:

1. Registered customer lookup
2. Walk-in customer creation
3. ID card upload
4. KYC status summary
5. Customer verification summary for rental pickup
6. Rental-booking restriction status visibility when the restriction foundation exists

Future Admin Customer Operations — requires separate approval:

- Customer account invite
- Resend invite
- Password setup/reset support flow
- B2B invite flow
- Deep account lifecycle management
- Rental-booking unrestriction / override workflow with reason and audit trail

### 5.5 B2B

B2B foundations are valuable but deep POS B2B is future candidate scope.

Core POS V2 may show company/customer summary if useful and supported by existing lookup data, but should not implement deep B2B billing or credit workflows.

Future candidate B2B capabilities:

- Company search/create
- Tax ID lookup/create
- Company contact/member creation
- Company KYC documents
- Company tax profile
- B2B account invite / resend invite
- Company credit / billing
- Authorized pickup by company contact

### 5.6 Documents / Transactions

Core capabilities:

- Operational handover forms
- Return & Inspection Forms
- Return Deposit Settlement Forms
- Reprint/download of operational POS documents
- Search transaction/document history
- Fiscal document search/reprint/status/trace for POS Sale and POS Rental Fee collection after Phase 8
- ABB → Full replacement trace after Phase 9

Core fiscal-document capabilities:

- Issue receipt / abbreviated tax invoice for POS Sale and POS Rental Fee collected at POS.
- Search and reprint fiscal documents from existing issued snapshots.
- View document status and lifecycle trace.
- Link fiscal document to underlying transaction, accounting/financial event where applicable, `source_channel`, branch, and issuing staff.
- Reuse existing `official_documents`, `document_sequences`, and `document_events` foundations.

Future official-document scope, not Core POS V2:

- Full accounting export
- WHT statutory filing automation
- Complex credit note / debit note coverage for all edge cases
- Full daily cashier document pack / shift closing

Important terminology rule:

> Operational POS forms are not fiscal receipts/tax invoices unless issued through the official document foundation. Core POS V2 now includes limited fiscal-document issuance for POS Sale and POS Rental Fee only; operational handover/return forms remain separate.

### 5.7 POS Fiscal Documents

Purpose: issue and manage the minimum fiscal documents needed for real counter operation without creating a second document system.

Core capabilities:

- Issue receipt / abbreviated tax invoice for POS Sale.
- Issue receipt / abbreviated tax invoice for Rental Fee collected at POS.
- Search and reprint fiscal documents.
- View document status and trace.
- Link document to the underlying transaction, accounting/financial event where applicable, `source_channel`, branch, and issuing staff.
- Reuse `official_documents`, `document_sequences`, `document_events`, `customer_tax_profiles`, and existing document rendering/printing foundations.
- Capture WHT toggle/evidence state for eligible fiscal-document issuance.

Required WHT evidence workflow:

- Staff must be able to indicate `not subject to withholding tax` or `subject to withholding tax` when issuing fiscal documents for POS Sale or POS Rental Fee.
- If subject to WHT, track evidence state such as `expected`, `certificate_pending`, `certificate_received`, and optional later `verified`.
- Support WHT supporting document/certificate upload by staff in admin/POS.
- Support customer upload through a link tied to the relevant booking / transaction detail.
- Link WHT evidence to the booking or sale transaction, official/fiscal document, and customer/company context where available.
- This is WHT capture and evidence workflow only, **not** full WHT automation, calculation engine, or statutory filing automation.

Implementation prerequisite:

- Audit current schema/API for WHT evidence storage before coding. Reuse existing booking/document evidence storage if it can safely link to fiscal documents; otherwise propose a minimal extension rather than a standalone WHT system.

### 5.8 ABB → Full Fiscal Document Replacement

Purpose: allow a controlled replacement from abbreviated receipt/tax invoice to full-form receipt/tax invoice without duplicating income.

Core capabilities:

- Search/select original ABB document.
- Validate that the original document is eligible for replacement.
- Capture/select customer tax profile for the full-form document.
- Create the full-form receipt/tax invoice as replacement.
- Mark the ABB as `replaced` / cancelled-for-replacement; never delete it.
- Store two-way trace: original ABB document id/number and replacement full document id/number.
- Store audit fields: actor, branch, timestamp, and reason.
- Support evidence/proof handling for the original ABB return or supporting customer request, as required by policy.

Locked rules:

- ABB → Full replacement is document replacement only.
- It is not a second sale and must not create duplicate revenue/accounting postings.
- Reuse `original_document_id`, `document_events`, and immutable document snapshots where possible.

Review gate:

- Accounting/tax review is required before production policy is finalized for timing rules such as same-day only vs a later conversion window.

### 5.9 POS Void / Return / Refund

Purpose: provide minimum cancellation/reversal controls for POS operation while keeping legally/accountingly distinct actions separate.

Core subflows:

1. Void
2. Return
3. Refund
4. ABB → Full replacement

Locked rules:

- Void, Return, Refund, and ABB → Full replacement must not be collapsed into one generic action.
- Fiscal document cancellation cannot be done freely by ordinary staff.
- Initial implementation: fiscal document cancellation/void authority is **Super Admin only**.
- Cancellation requires reason and audit trail.
- Return/refund flows must link to the original transaction/document.
- Refund must be represented as money movement/accounting event where applicable.
- Return may impact stock, but stock disposition is manually chosen by Admin rather than automatic.

Sale return stock disposition:

- Do not auto-restock returned sale items.
- Admin must manually choose one of: Return to stock, Do not return to stock, Pending inspection / hold.
- The stock disposition decision must be auditable.

### 5.10 Accounting Source Tagging

Purpose: ensure POS and Online share accounting lineage while preserving POS operational context.

Core capabilities:

- Shared accounting/event path with Online.
- No POS-specific separate accounting ledger.
- Required dimensions on relevant events/documents: POS vs Online, branch, staff actor, and issuing staff where applicable.
- Document issuance alone does not always equal accounting posting.
- Reprint and document replacement must not create duplicate income/expense records.
- Optional/future-compatible register/terminal identity may be reserved, but do not implement full terminal/shift-closing in Core POS V2.

Implementation prerequisite:

- Audit `official_documents`, `payment_allocations`, `financial_recognition_events`, order/sale APIs, rental fulfillment APIs, and existing payment-line flows before coding source tagging.
- If first-class `source_channel` fields are missing, choose the smallest compatible extension or controlled metadata convention; do not create a second stream.

---

## 6. Canonical Core Workflows

### 6.1 Online Booking Pickup

Starting state:

- Booking exists.
- Customer booked online.
- Booking Deposit may already be paid.
- Customer may or may not have completed KYC.

Flow:

```text
Scan/Search Booking
→ Load booking detail
→ Show customer verification summary
→ Show Rental Money Summary
→ If KYC incomplete, complete KYC at POS
→ Confirm item readiness
→ Confirm pickup checklist
→ Collect Rental Fee + Remaining Refundable Security Deposit
→ Customer signs on iPad
→ Submit pickup
→ Backend validates via fulfillment logic
→ Booking becomes picked_up / active rental
→ Produce operational pickup documents
```

Money due:

| Item                       | Due                                           |
| -------------------------- | --------------------------------------------- |
| Rental Fee                 | At pickup                                     |
| Remaining Security Deposit | At pickup                                     |
| Booking Deposit            | Already paid, applied toward security deposit |

Required backend validation:

- Booking status is valid for pickup.
- Booking Deposit/payment state is acceptable.
- KYC/ID evidence exists.
- Checklist completed.
- Signature exists.
- Staff has permission/branch access.

Operational documents:

- Rental Agreement / terms acceptance reference, if existing foundation supports it
- Asset Handover & Acceptance Form
- Deposit Payment Acknowledgement
- Pickup Payment Confirmation

Fiscal documents after Phase 8:

- Receipt / abbreviated tax invoice may be issued for the **Rental Fee** collected at POS.
- Booking Deposit and Refundable Security Deposit portions must remain non-tax deposit acknowledgements, not sale-income fiscal document lines.

### 6.2 Staff-Created Future Booking

Starting state:

- Customer contacts staff by phone/chat/walk-in.
- Customer is not taking item immediately.
- Booking is for future pickup.

Flow:

```text
Open POS V2 → Rental → New Future Booking
→ Search customer by phone
→ If not found, create customer/walk-in profile
→ Show KYC + rental-booking restriction summary if available
→ If customer is rental-restricted, route to support review; do not silently bypass online restriction
→ Capture customer details and ID if needed
→ Select rental items/assets
→ Select future dates
→ Check availability
→ If soft buffer rule is violated, allow staff override with reason if approved
→ Calculate Booking Deposit + future pickup due
→ Collect Booking Deposit if required
→ Save booking
→ Provide booking confirmation / operational acknowledgement
```

Money due:

| Item                       | Due                     |
| -------------------------- | ----------------------- |
| Booking Deposit            | At booking, if required |
| Rental Fee                 | Future pickup           |
| Remaining Security Deposit | Future pickup           |

This phase intentionally does **not** implement same-session pickup completion. Walk-in instant rental is deferred to Phase 4 because it requires pickup-day collection, checklist, signature, and status transition to `picked_up`.

Required backend validation:

- No hard asset conflict.
- Staff allowed to create booking.
- Rental-booking restriction status is checked/surfaced for support visibility.
- Any future staff bypass/unrestriction must require explicit approval, reason capture, actor id, and audit event.
- Buffer override reason required if applicable.
- Deposit/payment record created if collected.

Operational documents:

- Booking confirmation / operational acknowledgement
- Deposit Payment Acknowledgement if booking deposit is collected
- Full handover documents later at pickup

Fiscal document rule:

- Booking Deposit is part of refundable security deposit and must not issue a sales-income receipt/tax invoice.

### 6.3 Walk-in Instant Rental

Starting state:

- Customer arrives without online booking.
- Staff confirms item is physically available.

This workflow belongs to **Pickup V2** because it must complete the full pickup chain.

Flow:

```text
Open POS V2 → Rental → Pickup / Instant Rental
→ Select Instant Rental / Pickup Now
→ Search customer by phone
→ Create walk-in customer if missing
→ Capture ID/KYC evidence
→ Select item/asset
→ Select rental period
→ Check availability
→ Allow soft buffer override if needed, but never allow double booking
→ Calculate pickup-day amount
→ Collect Rental Fee + Full Refundable Security Deposit
→ Complete pickup checklist
→ Customer signs
→ Create booking + complete pickup through server-side workflow
→ Booking becomes picked_up
```

Money due:

| Item                             | Due                           |
| -------------------------------- | ----------------------------- |
| Rental Fee                       | Now                           |
| Full Refundable Security Deposit | Now                           |
| Booking Deposit                  | Not shown as separate UI step |

Required backend validation:

- Asset has no hard conflict.
- Instant rental must create the correct booking and pickup/fulfillment state transition using existing rental foundations; it must not become a loose ad hoc sale-like flow.
- Customer ID/KYC evidence exists.
- Checklist completed.
- Signature exists.
- Payment/deposit state acceptable.

Operational documents:

- Rental Agreement / terms acknowledgement if supported
- Asset Handover & Acceptance Form
- Deposit Payment Acknowledgement
- Pickup Payment Confirmation

Fiscal documents after Phase 8:

- Receipt / abbreviated tax invoice may be issued for the **Rental Fee** collected at POS.
- Full Refundable Security Deposit must remain a non-tax deposit acknowledgement, not sale income.

### 6.4 Return & Settlement

Starting state:

- Rental is active / picked_up.
- Customer brings item back.

Flow:

```text
Scan/Search Active Rental
→ Load return workflow
→ Show Rental Money Summary
→ Complete return checklist
→ Record item status
→ Add draft deductions if any
→ Server-calculate or server-validate Rental Settlement Preview
→ Require amount + reason for all deductions
→ Require photo/evidence for damage/missing item based on policy
→ Calculate refund or extra amount due
→ Staff confirms settlement
→ Customer signs settlement acknowledgement
→ Process refund or collect extra amount
→ Submit final settlement through server-side workflow
→ Close rental
→ Produce operational return/settlement documents
```

Money logic:

| Case                | Result                          |
| ------------------- | ------------------------------- |
| No deduction        | Refund full held deposit        |
| Deduction < deposit | Refund deposit minus deductions |
| Deduction = deposit | No refund                       |
| Deduction > deposit | Customer owes extra             |

Required backend validation:

- Rental status is picked_up.
- Return checklist completed.
- Refund cannot exceed deposit held.
- Refund proof required if policy requires.
- Signature exists.
- Deduction amount + reason required for any deduction.
- Final committed settlement updates existing persisted records through server-side foundations.

Operational documents:

- Return & Inspection Form
- Return Deposit Settlement Form
- Damage/fine/repair evidence references

Fiscal/accounting notes:

- Deposit refund is not a sales invoice event.
- Refund money paid out must be represented as a money movement/accounting event where applicable.
- Chargeable damage/late/penalty items need separate accounting/tax review before broad fiscal-document coverage; do not auto-issue complex tax/credit/debit notes unless a later phase approves it.

### 6.5 Sales Checkout

Flow:

```text
Open Sales POS
→ Add products by search/SKU/QR
→ Select quantity
→ Optional customer/tax profile placeholder
→ Select payment method
→ Confirm payment
→ Create sale through existing POS sales API
→ Show operational sale confirmation / print basic document if supported
→ After Phase 8, issue receipt / abbreviated tax invoice from official document foundation when eligible
```

Payment methods in core scope:

- Cash
- QR code payment

Core fiscal-document scope after Phase 8:

- Receipt / abbreviated tax invoice for POS Sale
- Search/reprint issued fiscal document
- ABB → Full replacement after Phase 9

Future payment/document scope:

- Bank transfer
- Card
- Complex credit note/debit note tax edge cases

---

## 7. Rental Money Summary and Rental Settlement Preview

### 7.1 Rental Money Summary — Authoritative Persisted System State

`Rental Money Summary` is the canonical persisted money state for rental workflows.

It prevents inconsistent calculation of:

- Booking Deposit
- Rental Fee
- Security Deposit
- Remaining pickup due
- Held deposit
- Persisted deduction/refund state
- Refund due after committed data
- Extra amount due after committed data
- Warnings/inconsistency flags

Frontend must not independently invent canonical money calculations. Frontend can preview display values, but authoritative state should come from the server.

Likely utility:

```text
server/utils/rental-money-summary.ts
```

Possible endpoint:

```text
GET /api/admin/rental-bookings/[id]/money-summary
```

Required conceptual fields:

```ts
type RentalMoneySummary = {
  bookingId: string;
  currencyCode: "THB";
  rentalFeeTotal: number;
  securityDepositRequired: number;
  bookingDepositRequired: number;
  bookingDepositPaid: number;
  bookingDepositStatus: string;
  bookingDepositAppliesToSecurityDeposit: true;
  remainingSecurityDepositDueAtPickup: number;
  pickupRentalFeeDue: number;
  pickupTotalDue: number;
  pickupPaidAmount: number;
  depositHeldAfterPickup: number;
  persistedDeductionsTotal: number;
  persistedRefundAmount: number;
  persistedRefundStatus: string;
  persistedExtraAmountDue: number;
  canProceedToPickup: boolean;
  canProceedToReturnSettlement: boolean;
  warnings: Array<{ code: string; message: string }>;
};
```

Primary existing sources:

- `rental_bookings`
- `rental_booking_payment_lines`
- `rental_booking_deposit_action_logs`
- `rental_booking_deposit_proofs`
- `payment_allocations` later
- `official_documents` later

### 7.2 Rental Settlement Preview — Draft Return Settlement Calculation

`Rental Settlement Preview` is the return-flow calculation layer for what staff is preparing before final submission.

It should cover:

- Draft deduction lines entered in the UI
- Damage / late fee / missing item / cleaning / penalty / other proposed deductions
- Preview refund due
- Preview extra amount due
- Evidence-required checks
- Validation before final settlement submission

Conceptual fields:

```ts
type RentalSettlementPreview = {
  bookingId: string;
  currencyCode: "THB";
  depositHeld: number;
  draftDeductionLines: Array<{
    type:
      | "damage"
      | "late_fee"
      | "missing_item"
      | "cleaning_fee"
      | "penalty"
      | "other";
    amount: number;
    note: string;
    evidenceRequired: boolean;
    evidenceUploaded: boolean;
  }>;
  draftDeductionsTotal: number;
  previewRefundDue: number;
  previewExtraAmountDue: number;
  validationErrors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
};
```

Recommended rule:

- UI may hold draft deduction form state locally.
- The preview should be server-calculated, server-validated, or both before final submission.
- The final committed settlement must update persisted records through existing server-side foundations.
- Do not store final settlement only in frontend state.
- Do not invent a separate settlement model outside existing deposit, payment-line, document, and fulfillment foundations.

### 7.3 Required Before

Rental Money Summary and Settlement Preview design/foundation must be completed before:

- Pickup V2 money UI
- Return & Settlement V2
- Official receipt/tax invoice
- Accounting export refactor
- B2B credit billing

### 7.4 POS Fiscal / Accounting Source Rules

Accounting/financial postings should be generated from actual monetary income, expense, refund, or recognition events — not merely from document issuance.

Core source-tagging rules:

- POS and Online must share accounting/financial event foundations.
- POS source context must be carried on relevant financial records and fiscal documents.
- Required POS context: `source_channel = pos`, `branch_id`, staff actor / creator, and issuing staff where applicable.
- If a target table lacks first-class `source_channel`, coding must first perform a schema/API audit and choose a minimal compatible extension or controlled metadata convention.
- Reprint, search/download, evidence upload, and ABB → Full replacement do not create new income.

### 7.5 POS Accounting Event Mapping

Creates accounting/financial posting:

- POS Sale money received.
- POS Rental Fee money received.
- Refund money paid out.
- Other approved income/expense/refund recognition events already aligned with existing accounting direction.

Does **not** create duplicate accounting posting:

- Reprint document.
- ABB → Full document replacement.
- Fiscal document search/download.
- WHT certificate upload.
- Document evidence upload.

Mapping table:

| Action                                | Creates accounting event?                          | Creates/changes fiscal document?                               | Affects cash/payment?           | Affects tax/document trace?     | Must carry POS/Branch source tagging?                |
| ------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- | ------------------------------- | ------------------------------- | ---------------------------------------------------- |
| POS Sale money received               | Yes                                                | May issue receipt/ABB                                          | Yes                             | Yes if document issued          | Yes                                                  |
| POS Rental Fee money received         | Yes                                                | May issue receipt/ABB for rental fee only                      | Yes                             | Yes if document issued          | Yes                                                  |
| Booking Deposit collected             | No sale-income posting; deposit/payment trace only | No sales tax invoice                                           | Yes                             | Deposit acknowledgement only    | Yes if POS-originated                                |
| Refundable Security Deposit collected | No sale-income posting; deposit/payment trace only | No sales tax invoice                                           | Yes                             | Deposit acknowledgement only    | Yes if POS-originated                                |
| Deposit refund paid out               | Yes, refund/money-out event where applicable       | No sales invoice                                               | Yes                             | Settlement/refund trace         | Yes if POS-originated                                |
| Sale return accepted                  | Depends on approved refund/reversal event          | May require document status/control, not automatic new invoice | Usually yes if refund paid      | Yes                             | Yes                                                  |
| Refund money paid out                 | Yes                                                | May link to original document/transaction                      | Yes                             | Yes                             | Yes                                                  |
| Fiscal document reprint               | No                                                 | No new document; print event only                              | No                              | Yes, reprint event/reason       | Yes for event actor/branch if available              |
| ABB → Full replacement                | No duplicate income                                | Yes, ABB replaced and full document issued                     | No additional payment by itself | Yes, two-way replacement trace  | Yes                                                  |
| Fiscal document search/download       | No                                                 | No                                                             | No                              | Read-only trace                 | No new financial source; access audit if implemented |
| WHT certificate upload                | No                                                 | No                                                             | No                              | Yes, evidence status/file trace | Yes if tied to POS-issued document                   |
| Document evidence upload              | No                                                 | No                                                             | No                              | Yes, evidence trace             | Yes if tied to POS-issued document                   |

Implementation prerequisite:

- Before coding Phase 8–11, audit whether the current `payment_allocations`, `official_documents`, `document_events`, `financial_recognition_events`, sale/order APIs, and rental payment-line APIs can carry the required source dimensions without schema change.
- Do not broaden `financial_recognition_events` beyond its current accepted use without explicit design of recognition types and source constraints.

---

## 8. POS V2 Route and Component Blueprint

### 8.1 Early Implementation Route Tree

Use `/admin/pos-v2` during transition so legacy `/admin/pos` remains untouched.

Recommended route tree for approved core phases:

```text
/admin/pos-v2
/admin/pos-v2/rental/bookings/new
/admin/pos-v2/rental/pickup
/admin/pos-v2/rental/pickup/[id]
/admin/pos-v2/rental/return
/admin/pos-v2/rental/return/[id]
/admin/pos-v2/history
/admin/pos-v2/sales
/admin/pos-v2/documents/fiscal
/admin/pos-v2/documents/fiscal/[id]
/admin/pos-v2/documents/fiscal/replace-abb
/admin/pos-v2/void-refund
```

Route naming rationale:

- `rental/bookings/new` makes Phase 3 explicitly future-booking focused.
- `rental/pickup` and `rental/return` separate operational queues from specific workflow pages.
- `history` is shared for operational POS search/reprint.
- `sales` stays separate from rental workflows.
- `documents/fiscal` is the Core POS V2 fiscal document workspace layered after sales/rental transaction foundations.
- `void-refund` is a controlled workspace for distinct void, return, and refund subflows, not a generic correction button.

### 8.2 Future Route Tree — Not Core Scope

Future candidate routes require separate approval before coding:

```text
/admin/pos-v2/rental/extensions
/admin/pos-v2/rental/reschedule
/admin/pos-v2/rental/overdue
/admin/pos-v2/customers/accounts
/admin/pos-v2/b2b
/admin/pos-v2/reports
/admin/pos-v2/shift-closing
/admin/pos-legacy
```

`/admin/pos-legacy` should only be introduced during an approved legacy retirement/switch phase.

### 8.3 Component Blueprint

Recommended shared/workflow components:

| Component                          | Responsibility                                                  |
| ---------------------------------- | --------------------------------------------------------------- |
| `AdminPosShell.vue`                | V2 layout, navigation, branch/staff context                     |
| `AdminPosSidebar.vue`              | Module navigation                                               |
| `AdminPosHeader.vue`               | Staff identity, branch, quick actions                           |
| `AdminPosLookupPanel.vue`          | Phone/booking/customer/company search                           |
| `AdminPosScanPanel.vue`            | Compose existing scanner component                              |
| `AdminPosQueueCards.vue`           | Pickup/return/active/KYC cards; placeholders allowed in Phase 1 |
| `RentalCustomerSelector.vue`       | Registered/walk-in customer selection                           |
| `RentalFutureBookingBuilder.vue`   | Staff-created future booking workflow                           |
| `RentalAvailabilityPanel.vue`      | Date/asset availability and buffer warning                      |
| `RentalBufferOverridePanel.vue`    | Soft buffer override reason capture                             |
| `RentalPickupWorkflow.vue`         | Pickup flow container                                           |
| `RentalMoneySummaryPanel.vue`      | Display server-authoritative money summary                      |
| `RentalPickupPaymentPanel.vue`     | Rental fee + remaining deposit collection UI                    |
| `RentalReturnWorkflow.vue`         | Return flow container                                           |
| `RentalSettlementPreviewPanel.vue` | Draft return settlement preview                                 |
| `RentalDeductionsEditor.vue`       | Draft deduction lines and evidence status                       |
| `OperationalDocumentsPanel.vue`    | Handover/return operational document links                      |
| `CustomerVerificationPanel.vue`    | KYC/ID summary and actions                                      |
| `SalesCheckoutWorkspace.vue`       | Basic Sales POS V2                                              |
| `SalesProductSearch.vue`           | SKU/product/barcode lookup                                      |
| `SalesCartPanel.vue`               | Sale cart state                                                 |
| `SalesPaymentPanel.vue`            | Basic cash/QR payment capture                                   |
| `PosFiscalDocumentsWorkspace.vue`  | Fiscal document search/issue/reprint/status trace               |
| `PosFiscalDocumentIssuePanel.vue`  | Issue receipt/ABB from approved POS sale/rental fee source      |
| `PosAbbReplacementWorkflow.vue`    | Controlled ABB → Full replacement workflow                      |
| `PosVoidReturnRefundWorkspace.vue` | Separate void, return, and refund control flows                 |
| `WhtEvidencePanel.vue`             | WHT subject toggle, status, upload, and linked evidence trace   |

### 8.4 State Ownership Rules

Server-authoritative state:

- Rental money state
- Pickup/return status transitions
- Booking status
- Deposit/refund persisted fields
- KYC/ID evidence persisted status
- Checklist persistence
- Signature upload result
- Official/fiscal document state
- Accounting/financial event source tagging
- WHT evidence persisted status/files

Page-level state:

- Current route workflow step
- Selected booking/customer/asset identifiers
- Loading/error state
- Unsaved wizard progress
- Draft payment form values before submit

Component-local state:

- Input field text
- UI toggles
- Local scanner modal state
- Signature canvas state before submission
- File input selection before upload

Shared composables may hold:

- POS V2 route/session helpers
- Branch/staff context wrappers around existing APIs
- Lookup state if reused across pages
- Lightweight UI state, not authoritative business state

Must not be duplicated in frontend:

- canonical rental money calculations
- final return settlement calculations without server validation
- pickup/return status transition rules
- KYC enforcement rules
- hard availability conflict logic
- fiscal document number/status/source truth
- accounting posting/event truth

---

## 9. Approval Checklist

### 9.1 Approved Core Business Decisions / Required Before Core Coding

- [ ] Approve: Booking Deposit is part of refundable security deposit.
- [ ] Approve: Pickup collects Rental Fee + Remaining Refundable Security Deposit.
- [ ] Approve: Return refunds deposit or deducts actual approved charges.
- [ ] Approve: Walk-in instant rental does not need separate Booking Deposit UI.
- [ ] Approve: POS can complete KYC for incomplete online bookings.
- [ ] Approve: Staff can create future bookings for customers.
- [ ] Approve: Staff can create walk-in customer profiles.
- [ ] Approve: `/admin/pos` remains legacy during transition.
- [ ] Approve: `/admin/pos-v2` is created in parallel.
- [ ] Approve: No redirect until parity checklist passes.
- [ ] Approve: POS Sale and POS Rental Fee collection are covered by fiscal documents in Core POS V2.
- [ ] Approve: Booking Deposit and Refundable Security Deposit are non-sales-income deposit items and do not receive sales tax invoices.
- [ ] Approve: Fiscal document numbering is immutable once issued.
- [ ] Approve: Issued fiscal documents are never deleted, renumbered, reused, or silently replaced.
- [ ] Approve: ABB → Full replacement is document replacement only, not a second sale.
- [ ] Approve: Fiscal document cancellation/void authority is Super Admin only in the initial phase.
- [ ] Approve: Void, Return, Refund, and Document Replacement remain separate concepts.
- [ ] Approve: POS and Online share accounting/financial event lineage with source tagging.
- [ ] Approve: Sale return stock disposition is manual/admin-controlled, not auto-restocked.
- [ ] Approve: WHT support in Core POS V2 is evidence capture/tracking only, not statutory automation.

### 9.2 Decisions Required Before Return & Settlement V2

- [ ] Which deduction types require photo/evidence?
- [ ] Are all deductions required to have amount + reason?
- [ ] Is manager approval required above a deduction threshold?
- [ ] Can staff waive late fee?
- [ ] Is customer signature mandatory if there is any deduction?
- [ ] Are early refunds cash + bank transfer only?
- [ ] Is refund proof required for cash?
- [ ] Is refund proof required for bank transfer?
- [ ] Can return close with refund pending?

### 9.3 Decisions Required Before Buffer Override Coding

- [ ] Staff may override soft buffer-day/cutoff rule.
- [ ] Override must never bypass hard asset conflict.
- [ ] Override requires reason.
- [ ] Override logs staff identity, branch, asset, booking, timestamp, and reason.
- [ ] Phase 1 does not require manager approval.
- [ ] Future manager approval threshold may be added later.

### 9.4 Decisions / Review Gates Required Before POS Fiscal Phases

These block Phase 8–11 production release, not Phase 1 shell/dashboard.

- [ ] Accounting/tax advisor reviews ABB → Full timing policy: same-day only vs allowed later within defined business rule.
- [ ] Schema/API audit confirms how `source_channel = pos`, branch, staff actor, and issuing staff are stored on fiscal/financial records.
- [ ] Schema/API audit confirms WHT evidence status naming and storage/linking to booking/sale, official document, and customer/company context.
- [ ] Decide whether POS terminal/register identity must be added now or reserved for later shift-closing/register phase.
- [ ] Confirm Super Admin-only cancellation/void enforcement path for issued fiscal documents.
- [ ] Confirm evidence/proof requirements for ABB return/supporting customer request.

### 9.5 Decisions Required Before Future Candidate Phases

These do not block Phase 1 shell/dashboard.

Future B2B:

- [ ] Can B2B deposits be waived for approved companies?
- [ ] Which role can authorize pickup for company?
- [ ] Should B2B credit apply to rental, sale, or both?

Future extension/reports/staff operations:

- [ ] Must extension rental fee be paid immediately?
- [ ] Can B2B pay extension later?
- [ ] Does extension require additional deposit?
- [ ] Which staff roles exist beyond core POS?
- [ ] Which roles can refund deposit?
- [ ] Which roles can void/correct records?
- [ ] Shift closing policy and cash-control process.
- [ ] Customer/account invite and reset-password policy.

---

## 10. Core Approved POS V2 Implementation Roadmap

### Phase 0 — Planning / Decision Lock

Objective:

- Finalize plan, approvals, and open decisions before coding.

In scope:

- This `.md` plan
- Approval checklist
- Decide unresolved core policies or explicitly defer them
- Confirm first coding task

Out of scope:

- Application code
- Migration
- UI implementation
- API changes

Dependencies:

- Project owner accepts Core vs Future scope split.

AI process checks:

- [ ] No code changed.
- [ ] No migration created.
- [ ] Future candidate scope clearly marked as not approved for coding.

Human smoke test required:

- Not applicable.

Acceptance criteria:

- [ ] Approval checklist reviewed.
- [ ] Core open decisions answered or explicitly deferred.
- [ ] First coding task approved.

---

### Phase 1 — POS V2 Shell + Dashboard / Lookup

Status: **DONE in code / smoke-test still recommended** as of 2026-05-13. `/admin/pos-v2`, POS V2 shell components, guarded admin navigation, scanner/lookup wiring, and `tests/server/admin-pos-v2-ui.spec.ts` exist. This phase intentionally did not add backend behavior or fulfillment logic.

Objective:

- Create safe `/admin/pos-v2` shell without changing backend behavior.

In scope:

- New POS shell
- Sidebar/navigation
- Staff/branch display
- Scan/search entry
- Queue cards
- Placeholder links to future modules
- Reuse scanner component if possible
- Use existing read APIs wherever possible
- Use a safe minimal adapter only if necessary for a small read-only gap
- Placeholder/defer queue intelligence when no clean API exists

Explicitly out of scope:

- Pickup implementation
- Return implementation
- Money calculation changes
- New migrations
- Broad analytics/reporting infrastructure
- Official documents
- Deep B2B workflow
- Daily reports / shift closing
- Backend behavior changes

Likely files:

```text
app/pages/admin/pos-v2/index.vue
app/components/admin/pos/AdminPosShell.vue
app/components/admin/pos/AdminPosSidebar.vue
app/components/admin/pos/AdminPosHeader.vue
app/components/admin/pos/AdminPosLookupPanel.vue
app/components/admin/pos/AdminPosScanPanel.vue
app/components/admin/pos/AdminPosQueueCards.vue
```

Dependencies:

- Existing admin auth/session patterns.
- Existing scanner component.
- Existing branch/read APIs where available.

AI process checks:

- [ ] Type check.
- [ ] Build check.
- [ ] Lint check if available.
- [ ] Verify `/admin/pos` untouched.
- [ ] Verify `/admin/pos-v2` route exists.
- [ ] Verify no backend behavior changed.
- [ ] Verify no broad reporting infrastructure added.

Human smoke test required:

- [ ] Login as admin/staff.
- [ ] Open `/admin/pos` and confirm legacy POS still works.
- [ ] Open `/admin/pos-v2` and confirm shell loads.
- [ ] Confirm branch/staff context shown if available.
- [ ] Try scanner/lookup UI visually.
- [ ] Click module navigation.

Acceptance criteria:

- [ ] `/admin/pos-v2` loads.
- [ ] `/admin/pos` still works.
- [ ] POS V2 shows clear module structure.
- [ ] Scanner/lookup UI is present.
- [ ] Queue cards are present with existing data or clearly marked placeholders.
- [ ] No backend behavior changed.
- [ ] Build/typecheck pass.
- [ ] Human smoke test passes.

---

### Phase 2 — Rental Money Summary + Rental Settlement Preview Design/Foundation

Status: **NEXT / not code-complete** as of 2026-05-13. Rental payment-line and booking-deposit foundations exist, but there is no dedicated `rental-money-summary` / `rental-settlement-preview` utility or endpoint yet. Do not start Pickup V2 or Return & Settlement V2 money-sensitive UI until this phase is implemented and tested.

Objective:

- Create canonical rental money calculation and return settlement preview foundation before money-sensitive UI.

In scope:

- Server utility for Rental Money Summary
- Optional admin endpoint for summary
- Settlement Preview design and server calculation/validation strategy
- Tests for booking deposit, remaining deposit, pickup due, held deposit, refund due, extra due
- Warnings for inconsistent data

Explicitly out of scope:

- UI pickup/return rewrite
- Official documents
- New accounting model
- Schema changes unless absolutely required and separately approved
- Duplicating payment/deposit ledgers

Likely files:

```text
server/utils/rental-money-summary.ts
server/utils/rental-settlement-preview.ts
server/api/admin/rental-bookings/[id]/money-summary.get.ts
tests/server/rental-money-summary.spec.ts
tests/server/rental-settlement-preview.spec.ts
```

Dependencies:

- Existing `rental_bookings` fields.
- Existing `rental_booking_payment_lines`.
- Existing deposit/refund fields and logs.

AI process checks:

- [ ] Unit tests for summary calculations.
- [ ] Unit tests for settlement preview scenarios.
- [ ] Existing payment-line tests still pass.
- [ ] Type check.
- [ ] No duplicate money model created.
- [ ] No schema migration unless approved.
- [ ] Draft settlement preview is not conflated with persisted summary.

Human smoke test required:

- [ ] Use real booking example.
- [ ] Confirm booking deposit reduces remaining security deposit.
- [ ] Confirm pickup total = rental fee + remaining deposit.
- [ ] Confirm preview refund math for deduction scenario.
- [ ] Confirm preview extra due when deductions exceed deposit.
- [ ] Confirm warning appears for missing/inconsistent data.

Acceptance criteria:

- [ ] Server-authoritative summary exists.
- [ ] Settlement preview design/foundation exists or is explicitly approved.
- [ ] Money-sensitive UI phases can consume these outputs.

---

### Phase 3 — Staff-Created Future Booking

Objective:

- Build staff-created booking flow for future pickup using existing backend.

In scope:

- Customer lookup by phone
- Walk-in customer creation if needed
- ID upload/KYC evidence panel if needed for booking creation
- Rental-booking restriction status display when the restriction foundation exists
- Asset selection
- Date selection
- Availability check
- Buffer override UI with reason if approved
- Future booking mode
- Booking Deposit handling if applicable
- Operational booking confirmation / acknowledgement

Explicitly out of scope:

- Walk-in instant rental pickup completion
- Pickup checklist/signature/status transition
- Return settlement
- Official documents
- Admin/customer unrestriction workflow
- B2B billing
- Complex quote system

Dependency clarification:

- Same-session walk-in instant rental is intentionally deferred to Phase 4 because it requires the full pickup completion workflow.

Backend-first checks only when necessary:

- [ ] Confirm existing booking creation API supports needed fields.
- [ ] Confirm restriction status can be read for the selected customer if the restriction foundation exists.
- [ ] Confirm availability API supports override input or define minimal extension.
- [ ] Confirm audit log target for override.
- [ ] Add server validation only if missing.

AI process checks:

- [ ] Unit/API tests for staff future booking.
- [ ] Buffer override does not bypass hard conflicts.
- [ ] Override requires reason when used.
- [ ] Walk-in customer creation tested.
- [ ] ID upload remains secure.
- [ ] No instant pickup completion implemented in Phase 3.

Human smoke test required:

- [ ] Create future booking for existing customer.
- [ ] Create future booking for new walk-in customer.
- [ ] Confirm restricted-customer status is visible and not silently bypassed.
- [ ] Try same-day/future booking with buffer override if approved.
- [ ] Confirm override reason is stored.
- [ ] Confirm hard double-book conflict is blocked.

Acceptance criteria:

- [ ] Staff can create future booking safely.
- [ ] Booking Deposit handling follows business rule.
- [ ] No incomplete instant rental flow is introduced.

---

### Phase 4 — Pickup V2 + Walk-in Instant Rental

Objective:

- Build clean pickup workflow using existing fulfillment backend and Rental Money Summary.
- Include walk-in instant rental because it must continue directly into pickup completion.

In scope:

- Pickup queue
- Booking detail
- Customer/KYC verification
- Rental Money Summary display
- Payment due at pickup
- Existing online booking pickup
- Walk-in instant rental path
- Checklist
- Signature
- Submit pickup through existing backend
- Produce operational handover/deposit acknowledgement documents

Explicitly out of scope:

- Phase 8 fiscal receipt / tax invoice issuance
- Full B2B billing
- Complex WHT automation
- Return settlement
- Deep deduction workflow

Dependencies:

- Phase 2 Rental Money Summary.
- Existing pickup endpoint and fulfillment utility.
- Existing checklist/signature/KYC foundations.

Backend-first checks only when necessary:

- [ ] Confirm pickup endpoint accepts V2 payload.
- [ ] Confirm money summary is available.
- [ ] Confirm KYC status summary can be loaded.
- [ ] Confirm checklist completion endpoint works.
- [ ] Confirm signature upload works.

AI process checks:

- [ ] Pickup cannot proceed without required KYC/ID.
- [ ] Pickup cannot proceed without checklist.
- [ ] Pickup cannot proceed without signature.
- [ ] Pickup total is from Rental Money Summary.
- [ ] Booking status transitions correctly.
- [ ] Walk-in instant rental does not force separate Booking Deposit UI.

Human smoke test required:

- [ ] Pickup online booking with completed KYC.
- [ ] Pickup online booking with missing KYC, then complete KYC at POS.
- [ ] Complete walk-in instant rental.
- [ ] Confirm amount due is correct.
- [ ] Complete checklist.
- [ ] Sign on iPad/touch device.
- [ ] Print/reprint operational handover document.
- [ ] Confirm booking becomes picked_up.

Acceptance criteria:

- [ ] Existing online pickup works in V2.
- [ ] Walk-in instant rental works end-to-end through pickup.
- [ ] Backend fulfillment remains authoritative.

---

### Phase 5 — Return & Settlement V2

Objective:

- Build return workflow and deposit settlement using Rental Money Summary and Settlement Preview.

In scope:

- Return queue
- Active rental lookup
- Return checklist
- Draft deductions
- Evidence upload
- Server-calculated/server-validated settlement preview
- Refund/extra due calculation
- Customer settlement signature
- Refund proof based on approved policy
- Close rental through server-side workflow
- Produce operational return/settlement documents

Explicitly out of scope:

- Automated tax handling for damage fees
- Fiscal receipt/tax invoice issuance for damage/late/penalty items
- Partial return
- Complex repair workflow
- New accounting system

Dependencies:

- Phase 2 Rental Money Summary and Settlement Preview.
- Return/deduction/refund policy decisions in Section 9.2.
- Existing return endpoint and fulfillment utility.

Backend-first checks only when necessary:

- [ ] Confirm return endpoint can support settlement payload.
- [ ] Confirm deduction lines use existing payment line/document structures.
- [ ] Confirm refund status and proof flow.
- [ ] Confirm audit log for refund/deduction.

AI process checks:

- [ ] Refund cannot exceed held deposit.
- [ ] Deduction requires amount + reason.
- [ ] Damage/missing deductions require evidence if approved.
- [ ] Signature required for settlement.
- [ ] Booking transitions to returned.
- [ ] Persisted summary and draft preview are not conflated.

Human smoke test required:

- [ ] Return with no deduction, full refund.
- [ ] Return with late fee deduction.
- [ ] Return with damage deduction and photo evidence.
- [ ] Return with deduction exceeding deposit.
- [ ] Refund cash if approved.
- [ ] Refund bank transfer with proof if approved.
- [ ] Print return settlement document.
- [ ] Confirm booking becomes returned.

Acceptance criteria:

- [ ] Return settlement uses server-validated calculations.
- [ ] Deductions/refunds persist through existing foundations.
- [ ] Operational return documents are generated/linked without implying official tax documents.

---

### Phase 6 — History / Search / Reprint Operational Documents

Status: **PARTIAL foundation exists / POS V2 history integration parked** as of 2026-05-13. Admin rental booking detail can preview/issue/print pickup and return operational documents using `official_documents` snapshots and document events. A POS V2 document list/history/reprint workspace and POS history related-documents menu are not complete.

Objective:

- Allow staff to find old POS records and reprint/download operational documents.

In scope:

- Rental history
- Sales history basic search
- Customer history lookup where supported
- Operational document list
- Reprint/download operational handover and return documents
- Search filters using existing APIs where possible

Explicitly out of scope:

- Official document void/reissue
- Full accounting export refactor
- Daily reporting/shift closing
- Broad analytics infrastructure

Dependencies:

- Existing POS history APIs and operational print endpoints.

AI process checks:

- [ ] History search works by supported filters.
- [ ] Document links resolve.
- [ ] Reprint does not create duplicate official documents.
- [ ] Access is admin/staff-only.

Human smoke test required:

- [ ] Search previous rental by phone.
- [ ] Search previous sale by date.
- [ ] Reprint handover document.
- [ ] Reprint return settlement document.
- [ ] Confirm old POS history still works.

Acceptance criteria:

- [ ] Operational records can be found and reprinted.
- [ ] No Phase 8 fiscal receipt/tax invoice issuance is introduced in Phase 6.

---

### Phase 7 — Sales POS V2 Basic Workflow

Objective:

- Rebuild basic Sales POS frontend workflow using existing sales API.

In scope:

- Product/SKU/QR add
- Cart
- Cash/QR payment capture
- Sales history basic view
- Basic operational sale confirmation
- Customer/tax profile placeholder only

Explicitly out of scope:

- Phase 8 fiscal receipt / abbreviated tax invoice issuance
- Phase 9 ABB → Full replacement
- Advanced returns/refunds
- Complex promotions
- Daily reports/shift closing

Dependencies:

- Existing POS sales API.
- Existing inventory decrement/apply behavior.

Backend-first checks only when necessary:

- [ ] Confirm sales API behavior.
- [ ] Confirm inventory decrement.
- [ ] Confirm cancellation/restock logic if shown in UI.
- [ ] Confirm payment method support.

AI process checks:

- [ ] Sale creation works.
- [ ] Inventory decrements correctly.
- [ ] Payment method stored.
- [ ] History shows sale.
- [ ] No official document system duplicated.

Human smoke test required:

- [ ] Sell one item cash.
- [ ] Sell multiple items QR.
- [ ] View sales history.
- [ ] Confirm inventory effect.

Acceptance criteria:

- [ ] Basic Sales POS V2 can replace legacy sales workflow after parity approval.
- [ ] No Phase 8 fiscal-document behavior leaks into Phase 7 basic sales workflow.

---

### Phase 8 — POS Fiscal Documents for Sale + Rental Fee

Objective:

- Issue and manage the minimum fiscal documents required for POS Sale and POS Rental Fee collection using existing official document foundations.

In scope:

- Receipt / abbreviated tax invoice issue flow for POS Sale.
- Receipt / abbreviated tax invoice issue flow for Rental Fee collected at POS.
- Fiscal document search, status view, trace view, print, and reprint.
- Link document to underlying sale/rental transaction, financial/accounting event where applicable, `source_channel = pos`, branch, and issuing staff.
- WHT subject toggle and evidence state capture for eligible issuance.
- Reuse `official_documents`, `document_sequences`, `document_events`, `customer_tax_profiles`, and existing print/snapshot foundations.

Explicitly out of scope:

- Booking Deposit or Refundable Security Deposit as taxable sale-income fiscal document lines.
- Deposit refund as sales invoice event.
- ABB → Full replacement workflow, except preparing links needed by Phase 9.
- Fiscal document cancellation/void workflow, except status display.
- Full accounting export.
- WHT statutory filing automation.
- Credit note / debit note edge-case coverage.
- Daily reports / cashier shift closing / cash drawer.

Dependencies:

- Phase 4 Pickup V2 for POS Rental Fee collection sources.
- Phase 7 Sales POS V2 Basic Workflow for POS Sale sources.
- Phase 2 Rental Money Summary for rental fee/deposit separation.
- Existing official document and document sequence foundations.
- Schema/API audit confirming source-channel, branch, staff actor, issuing staff, WHT evidence storage, and idempotency strategy.

AI process checks:

- [ ] Fiscal document issue uses existing `official_documents` and `document_sequences` only.
- [ ] Issued document number is immutable and never regenerated.
- [ ] Reprint does not create a new document or accounting event.
- [ ] POS Sale document amount equals approved sale income source.
- [ ] POS Rental Fee document amount excludes Booking Deposit and Refundable Security Deposit.
- [ ] WHT evidence upload/status does not become statutory WHT automation.
- [ ] No POS-specific invoice table or accounting stream is created.

Human smoke test required:

- [ ] Issue receipt/ABB for one POS Sale.
- [ ] Issue receipt/ABB for one POS Rental Fee collection.
- [ ] Confirm Booking Deposit and Refundable Security Deposit are absent from sales tax invoice lines.
- [ ] Search and reprint issued fiscal document.
- [ ] Confirm reprint shows same document number and stored snapshot.
- [ ] Toggle WHT subject state and upload evidence where applicable.

Acceptance criteria:

- [ ] POS Sale fiscal document issue/reprint works from official document foundation.
- [ ] POS Rental Fee fiscal document issue/reprint works from official document foundation.
- [ ] Fiscal documents carry POS/branch/staff source context.
- [ ] Deposit amounts remain non-tax deposit acknowledgements only.
- [ ] WHT evidence is linked and retrievable without statutory automation.

---

### Phase 9 — ABB → Full Fiscal Document Replacement

Objective:

- Provide a controlled abbreviated-to-full fiscal document replacement workflow without duplicate income/accounting postings.

In scope:

- Search/select original ABB document.
- Validate replacement eligibility.
- Capture/select customer tax profile for full-form document.
- Create full-form receipt/tax invoice as replacement using official document foundation.
- Mark original ABB as `replaced` / cancelled-for-replacement, never deleted.
- Store two-way trace: original ABB document id/number and replacement full document id/number.
- Store audit fields: actor, branch, timestamp, reason.
- Support evidence/proof handling for original ABB return or supporting request, as required by policy.

Explicitly out of scope:

- New sale creation.
- Duplicate accounting/revenue posting.
- Free-form staff document cancellation.
- Full credit-note/debit-note regime.
- WHT automation engine.
- Daily reports / shift closing.

Dependencies:

- Phase 8 POS Fiscal Documents.
- `customer_tax_profiles` selection/create/update path, or a minimal audited extension.
- Accounting/tax review gate for ABB → Full timing policy before production release.
- Schema/API audit confirming replacement trace fields/events are sufficient (`original_document_id`, `document_events`, metadata) or defining a minimal extension.

AI process checks:

- [ ] Replacement workflow cannot run against ineligible documents.
- [ ] Original ABB document is never deleted or renumbered.
- [ ] Replacement full document receives its own immutable number.
- [ ] Original/replacement two-way trace is visible.
- [ ] Document replacement does not create sale, payment, or income event.
- [ ] Reason, actor, branch, and timestamp are recorded.

Human smoke test required:

- [ ] Search issued ABB.
- [ ] Replace with full document using selected tax profile.
- [ ] Confirm original ABB status shows replaced/cancelled-for-replacement.
- [ ] Confirm full document references original ABB number.
- [ ] Confirm no duplicate payment/accounting record is visible.
- [ ] Upload/support evidence if policy requires.

Acceptance criteria:

- [ ] ABB → Full replacement is traceable and evidence-aware.
- [ ] No duplicate sale/revenue/accounting posting occurs.
- [ ] Timing policy has accounting/tax approval before production release.

---

### Phase 10 — POS Void / Return / Refund Control

Objective:

- Add minimum POS cancellation/reversal controls while keeping Void, Return, Refund, and Document Replacement legally/accountingly separate.

In scope:

- Separate Void, Return, and Refund subflows.
- Super Admin-only cancellation/void authority for issued fiscal documents in the initial implementation.
- Reason and audit trail for every cancellation/void/reversal action.
- Link return/refund flows to original transaction/document.
- Represent refund money paid out as money movement/accounting event where applicable.
- Manual/admin-controlled stock disposition for sale returns.
- Show original document/transaction status and trace.

Explicitly out of scope:

- Ordinary staff fiscal document cancellation.
- Generic one-click correction that collapses Void, Return, Refund, and ABB replacement.
- Auto-restock of returned sale items.
- Full credit-note/debit-note coverage for all tax edge cases.
- Automated gateway refunds unless separately approved.
- Daily reports / shift closing / cash drawer.

Dependencies:

- Phase 8 fiscal document foundation for issued document links/status.
- Phase 9 replacement workflow remains separate.
- Existing POS sale cancellation/restock behavior audit.
- Existing refund/deposit/payment allocation foundations.
- Schema/API audit for refund/reversal idempotency, audit event target, and stock disposition storage.

AI process checks:

- [ ] Void, Return, Refund, and Replacement are separate code paths/UI actions.
- [ ] Issued fiscal document cancellation requires Super Admin role.
- [ ] Cancellation/refund requires reason and audit trail.
- [ ] Refund links to original transaction/document and money source.
- [ ] Refund creates appropriate money-out/accounting event where applicable.
- [ ] Sale return does not auto-restock.
- [ ] Admin stock disposition choice is auditable.

Human smoke test required:

- [ ] Attempt fiscal document cancellation as ordinary staff and confirm blocked.
- [ ] Cancel/void as Super Admin with reason and verify audit trace.
- [ ] Process sale return with each stock disposition: Return to stock, Do not return to stock, Pending inspection / hold.
- [ ] Process refund linked to original transaction/document.
- [ ] Confirm refund affects money movement/accounting trace where applicable.

Acceptance criteria:

- [ ] Minimum void/return/refund controls exist and are role-gated.
- [ ] Stock disposition is manual and auditable.
- [ ] Refunds are linked and traceable without creating a second settlement model.
- [ ] No document number is deleted, reused, or silently replaced.

---

### Phase 11 — Accounting Source Tagging + WHT Evidence Integration Polish

Objective:

- Ensure POS fiscal/financial records share Online accounting lineage with complete POS source context and retrievable WHT evidence.

In scope:

- Confirm shared accounting/event path for POS and Online.
- Add or normalize source dimensions on relevant events/documents: POS vs Online, branch, staff actor, issuing staff.
- Ensure document issuance, reprint, replacement, WHT evidence upload, and document evidence upload do not create duplicate accounting postings.
- Polish WHT evidence status and retrieval across POS/admin/customer upload paths.
- Reserve optional terminal/register identity if schema review recommends it, without implementing shift closing.

Explicitly out of scope:

- Full accounting export.
- Bank reconciliation automation.
- WHT automation engine or statutory filing automation.
- Daily reports / cashier shift closing / cash drawer.
- POS-specific accounting ledger.

Dependencies:

- Phase 8 fiscal documents.
- Phase 9 ABB → Full replacement.
- Phase 10 void/return/refund controls.
- Schema/API audit of `official_documents`, `payment_allocations`, `financial_recognition_events`, `document_events`, sale/order APIs, rental fulfillment APIs, rental payment-line APIs, and WHT evidence storage.

AI process checks:

- [ ] Source tagging is consistent across POS Sale, POS Rental Fee, refund, document, and WHT evidence records.
- [ ] POS and Online use shared financial/accounting foundations.
- [ ] No POS-only ledger/accounting stream is introduced.
- [ ] Reprint and ABB → Full replacement do not duplicate income.
- [ ] WHT evidence status names match existing schema convention or documented minimal extension.
- [ ] Optional terminal/register field is not expanded into shift-closing scope.

Human smoke test required:

- [ ] Trace one POS Sale from transaction → fiscal document → payment/accounting trace.
- [ ] Trace one POS Rental Fee from booking/payment lines → fiscal document → payment/accounting trace.
- [ ] Trace one refund to original transaction/document and money-out event.
- [ ] Upload WHT evidence as staff and confirm visible on relevant document/transaction.
- [ ] Upload WHT evidence through customer link and confirm admin retrieval.

Acceptance criteria:

- [ ] Relevant POS records carry source channel, branch, and staff context.
- [ ] WHT evidence capture is linked, searchable, and retrievable.
- [ ] No duplicate accounting postings are produced by document-only actions.
- [ ] Remaining terminal/register decision is documented as current or future.

---

## 11. Future Candidate Expansion Roadmap — Not Approved Coding Scope

Every item in this section requires separate owner approval before implementation.

### 11.1 Rental Extension

Purpose:

- Let staff extend an active rental after checking future asset availability and calculating additional rental fee.

Requires decisions:

- Immediate payment requirement.
- B2B delayed payment.
- Additional deposit requirement.

### 11.2 Booking Edit / Reschedule / Cancel

Status: **PARTIAL DESIGN LOCK** for customer self-service cancellation and Booking Deposit refund flow. See `docs/customer-rental-booking-cancellation-refund-design.md`. Staff edit/reschedule and admin unrestriction remain future decisions.

Purpose:

- Let staff modify booking dates/items/customer info before pickup with availability recalculation and audit reason.
- Implement customer/admin cancellation workflows with explicit cancellation provenance.
- Support the excessive customer cancellation restriction rule from Section 1.4.

Remaining decisions:

- Allowed statuses.
- Audit and approval rules.
- Exact customer cancellation reason taxonomy.
- Which staff roles can review, override, or unblock rental-booking restriction.
- Whether staff-created bookings are allowed for restricted customers after support review.

Locked for customer Phase C.1:

- Refund cutoff uses Bangkok calendar-day logic, not exact 72 hours.
- Eligible self-service customer cancellation requires refund bank/contact form.
- Refund request is manual admin process via `/admin/refunds`.
- Customer cancellation/refund documents use immutable `official_documents` snapshots.

Required future implementation notes:

- Never infer qualifying cancellations from `rental_bookings.status = 'cancelled'` alone.
- Record customer/staff/admin/system cancellation origin at the transition point.
- Recalculate the rolling 12-month qualifying cancellation count after each customer-initiated confirmed/paid booking cancellation.
- Apply `public.users.rental_booking_restriction_status = 'restricted'` on the 6th qualifying cancellation unless a valid override policy is implemented.
- Keep draft deletion, payment cancellation, mixed-checkout expiry, admin/POS cancellation, and system cleanup out of the restriction count.

### 11.3 Overdue Follow-up

Purpose:

- Help staff manage due/overdue rentals, contact customers, estimate late fees, and log follow-up notes.

Requires decisions:

- Late fee policy.
- Reminder channels.
- Contact log retention.

### 11.4 Future Admin Customer Operations

Purpose:

- Support account invite, resend invite, password setup/reset support, and deeper customer lifecycle tasks.

Explicitly not core POS V2.

Requires decisions:

- Who can create accounts.
- Invite security rules.
- Reset-password support boundaries.

### 11.5 Advanced Accounting / Tax / WHT Beyond Core POS V2

Purpose:

- Productize advanced accounting/tax/WHT capabilities beyond the limited Core POS V2 fiscal-document scope.

Already Core POS V2, not future-only:

- Receipt / abbreviated tax invoice for POS Sale and POS Rental Fee.
- ABB → Full replacement baseline.
- Fiscal document search/reprint/status/trace.
- Super Admin-only issued fiscal document cancellation/void baseline.
- WHT evidence capture and tracking linked to POS fiscal document issuance.

Future candidate capabilities requiring separate approval:

- Full accounting export.
- Bank reconciliation automation.
- WHT automation engine and statutory filing automation.
- Credit note / debit note coverage for complex tax edge cases.
- Full daily/cashier document packs tied to shift closing.
- Advanced B2B billing/credit documents.

Must not create duplicate invoice tables, duplicate document numbering, or a separate POS accounting stream.

### 11.6 Deep B2B POS Integration

Purpose:

- Complete company rental/sales operational workflow.

Candidate capabilities:

- Company search by name/tax ID
- Company contact/member selection
- B2B authorized pickup
- Company KYC
- Company tax profile
- Credit/terms if approved
- B2B rental history

### 11.7 Daily Reports / Shift Closing

Purpose:

- Support cash-control operations.

Candidate capabilities:

- Daily sales summary
- Rental cash received
- Deposit received
- Deposit refunded
- QR payments
- Cash payments
- Customers newly restricted today due to excessive rental cancellations
- Qualifying rolling-window cancellation count for newly restricted customers
- Staff totals
- Branch totals
- Opening/closing cash later

### 11.8 Legacy POS Retirement Execution

Purpose:

- Replace old POS only after V2 parity and explicit owner approval.

Required future parity checklist:

- [ ] Sales POS V2 can replace legacy sales.
- [ ] Staff booking V2 can replace legacy booking creation.
- [ ] Pickup V2 can replace legacy pickup.
- [ ] Return V2 can replace legacy return.
- [ ] KYC at POS works.
- [ ] Reprint/history works.
- [ ] Branch access works.
- [ ] Staff roles work.
- [ ] Smoke tests pass.
- [ ] Legacy data remains readable.

Retirement is not part of Core POS V2 coding unless separately approved.

---

## 12. AI vs Human Approval / Test Policy

### 12.1 AI Can Verify by Process

AI can verify:

- TypeScript/build errors
- Unit tests
- API tests
- Lint
- Route existence
- Static file changes
- No forbidden files touched
- No new migrations created unless explicitly approved
- Backend reuse rules followed
- Calculation tests
- Permission checks in tests

### 12.2 Human Smoke Test Required by Core Phase

| Phase    | Human Smoke Test Focus                                                           |
| -------- | -------------------------------------------------------------------------------- |
| Phase 1  | Route access, shell layout, scan UI, legacy POS unaffected                       |
| Phase 2  | Known booking money examples, booking deposit reduction, settlement preview math |
| Phase 3  | Future booking only; no instant pickup completion                                |
| Phase 4  | Existing booking pickup and walk-in instant rental end-to-end                    |
| Phase 5  | Return settlement, deductions, refund/extra due, signature                       |
| Phase 6  | Search/reprint operational documents                                             |
| Phase 7  | Basic Sales POS creation/history/inventory effect                                |
| Phase 8  | POS Sale/Rental Fee fiscal issue, reprint, deposit exclusion, WHT evidence       |
| Phase 9  | ABB → Full replacement trace, no duplicate sale/accounting posting               |
| Phase 10 | Super Admin void/cancel, return/refund link, manual stock disposition            |
| Phase 11 | POS/branch/staff source trace and WHT evidence retrieval                         |

Human smoke test is always required for:

- Login/session behavior
- Admin/staff role access
- QR scanner behavior
- iPad/touch signature
- File upload and signed URL viewing
- Payment display correctness
- Actual pickup flow
- Actual return flow
- Print layout
- Reprint document usability
- Branch/staff operational workflow
- Any flow involving real money/customer documents

### 12.3 Approval Gate Types

| Gate                       | Who                 | Required For                              |
| -------------------------- | ------------------- | ----------------------------------------- |
| AI Process Gate            | AI coding agent     | Every phase                               |
| Human Smoke Test Gate      | Project owner/staff | Operational workflows                     |
| Business Approval Gate     | Project owner       | Policy decisions                          |
| Accounting/Tax Review Gate | Accountant/advisor  | Official docs, WHT, deposit/tax treatment |
| Production Release Gate    | Project owner       | Switching staff to V2                     |

---

## 13. Master Guardrails for AI Coding Agents

AI agents must follow these rules.

### 13.1 Scope Guardrails

- Do not treat Future Candidate Scope as approved implementation scope.
- Do not implement account invite/reset flows during Core POS V2 unless separately approved.
- Implement only the approved Core POS V2 fiscal scope: POS Sale and POS Rental Fee receipt/ABB, ABB → Full replacement baseline, POS void/return/refund baseline, WHT evidence capture, and source tagging.
- Do not expand Core POS V2 into full ERP/accounting, WHT statutory automation, bank reconciliation, daily reports, or shift closing.
- Do not build daily reports/shift closing in Core POS V2.
- Do not implement legacy POS retirement unless separately approved.

### 13.2 Do Not Duplicate

- Do not create a second KYC document model.
- Do not create a second invoice system.
- Do not create a parallel receipt/tax invoice numbering subsystem.
- Do not create a POS-specific separate accounting ledger or accounting stream.
- Do not create a second deposit ledger unless explicitly approved.
- Do not create a second return/deduction model outside existing booking/payment/document foundations.
- Do not invent a new settlement model separate from existing payment-line/document/deposit foundations.
- Reuse existing `official_documents`, `document_sequences`, `document_events`, `customer_tax_profiles`, `payment_allocations`, and payment-line foundations wherever possible.

### 13.3 Do Not Bypass Server Logic

- Do not bypass `rental-fulfillment.ts`.
- Do not perform pickup/return state transitions purely on frontend.
- Do not calculate official money state only on frontend.
- Do not allow buffer override to bypass hard asset conflicts.
- Do not commit final return settlement only in frontend state.
- Do not issue fiscal documents, cancel fiscal documents, replace fiscal documents, or record refunds from frontend-only state.

### 13.4 Do Not Mix Money Concepts

Keep separate:

- Booking Deposit
- Rental Fee
- Refundable Security Deposit
- Remaining Security Deposit
- Damage/Late/Penalty Deductions
- Refund
- Extra Amount Due

Also keep separate:

- Rental Money Summary = persisted/authoritative state
- Rental Settlement Preview = draft return-flow calculation before final submission
- Void = cancellation before/at allowed control point
- Return = product/item return workflow
- Refund = money paid out / reversal money movement
- Document Replacement = fiscal document correction/replacement trace, not a new sale

### 13.5 Fiscal Document Numbering and Sequence Guardrails

- Fiscal document number is immutable once issued.
- Never regenerate, reuse, renumber, or silently replace a fiscal document number.
- Never delete issued fiscal documents.
- If a document is wrong, use the approved cancellation/replacement workflow.
- In the initial implementation, cancellation of issued fiscal documents is Super Admin only.
- Every cancellation/replacement must record actor, timestamp, reason, original document, and resulting replacement/cancellation status.
- Reuse existing `official_documents` and `document_sequences` foundation.
- Do not create any parallel numbering subsystem.

### 13.6 POS Fiscal / Accounting Guardrails

- POS and Online must share the same accounting/financial event path, with source tagging.
- Document replacement is not a new sale.
- ABB → Full replacement must never create duplicate income.
- Reprint must never create new accounting or fiscal records.
- Document issuance alone does not always equal accounting posting.
- Refund money paid out must be represented as a money movement/accounting event where applicable.
- WHT support in this plan is evidence capture and tracking only, not complete statutory automation.
- Sale return stock disposition is manual/admin-controlled, not auto-restocked.
- Walk-in instant rental must use existing rental booking/fulfillment state transitions, not a sale-like shortcut.

### 13.7 Do Not Implement Too Early

Do not implement early:

- WHT automation
- Deep B2B credit billing
- PDF generation beyond existing operational print needs
- Full accounting system
- Complex staff permission redesign
- Partial return
- Quote system
- Account invite/reset flow

Unless a later approved phase explicitly asks for it.

### 13.8 Always Preserve Legacy POS During Transition

- Do not delete `/admin/pos`.
- Do not redirect it without approval.
- Do not break legacy route while V2 is incomplete.

---

## 14. Open Decisions

### 14.1 Core Decisions Still Requiring Owner Confirmation

- [ ] Final Phase 1 route naming.
- [ ] Whether Phase 1 uses feature flag or route-only protection.
- [ ] Which staff roles can access `/admin/pos-v2` during trial.
- [ ] Which dashboard queue cards must show real data in Phase 1 vs placeholder.

### 14.2 Return & Settlement Decisions

- [ ] Are early refunds cash + bank transfer only?
- [ ] Is refund proof required for cash?
- [ ] Is refund proof required for bank transfer?
- [ ] Can return close with refund pending?
- [ ] Which deduction types require photo evidence?
- [ ] Is manager approval required above a certain amount?
- [ ] Can staff waive late fee?
- [ ] Should customer signature be mandatory if there is any deduction?

### 14.3 POS Fiscal / Accounting Review Gates

Only unresolved review gates are listed here. Do not reopen the locked decisions that POS Sale and POS Rental Fee are fiscal-document covered, deposits are not sales-income fiscal document items, fiscal numbering is immutable, issued fiscal document cancellation is Super Admin-only initially, return/refund stock disposition is manual, and shared accounting lineage is mandatory.

- [ ] ABB → Full timing policy: same-day only, or allowed later within a defined business rule? Must be reviewed by accounting/tax advisor before production release.
- [ ] Detailed WHT evidence status naming if schema audit suggests a better existing convention than `expected`, `certificate_pending`, `certificate_received`, optional `verified`.
- [ ] Whether POS terminal/register identity must be added now or only reserved for a later register/shift-closing phase.

### 14.4 Future Candidate Decisions

- [ ] B2B deposit waiver policy.
- [ ] B2B authorized pickup role.
- [ ] B2B credit applicability.
- [ ] Extension payment policy.
- [ ] Advanced credit note/debit note policy for complex tax edge cases.
- [ ] WHT statutory automation / filing policy.
- [ ] Shift closing policy.
- [ ] Customer account invite/reset policy.
- [ ] Rental-booking restriction override roles and approval policy.
- [ ] Customer-facing support process for restricted rental customers.
- [ ] Whether support-reviewed restricted customers may receive staff-created bookings before unrestriction.

---

## 15. Recommended Next Coding Tasks by Track

### Customer Rental Track — Phase C.1

Task:

Implement **Customer Rental Booking Detail + Cancellation / Manual Booking Deposit Refund + Admin Refund Queue foundation** after owner approval.

Reference:

- `docs/customer-rental-booking-cancellation-refund-design.md`

Must include:

- cancellation events and booking cancellation provenance
- `payment_refunds` manual refund lifecycle
- dedicated user rental restriction fields
- `/user/rentals/[bookingId]`
- customer booking/payment/cancellation/refund confirmation snapshots
- `/admin/refunds` minimal queue and mark-refunded flow
- daily-report-readiness timestamps/links, without full report UI

Must not include:

- POS V2 Pickup/Return implementation
- automatic gateway refunds
- official receipt/tax invoice/WHT
- report UI unless separately approved

### POS V2 Track — Separate Next Task

### Task

Implement **Rental Money Summary + Rental Settlement Preview foundation** before any money-sensitive Pickup V2 / Return V2 UI.

### Why First

- It is the required backend guardrail before Pickup V2 / Return V2 money UI.
- It prevents frontend-only money calculations.
- It reuses existing booking, deposit, payment-line, and refund fields instead of creating a second ledger.
- It can be validated with focused unit/API tests before staff-facing workflow changes.
- It keeps legacy POS behavior available while the calculation foundation is built.

### Deliverables

- `server/utils/rental-money-summary.ts`
- `server/utils/rental-settlement-preview.ts`
- Optional read-only admin endpoint for booking money summary
- Focused tests for booking deposit, remaining security deposit, pickup due, held deposit, refund due, extra due, and inconsistent-data warnings
- No duplicate deposit ledger or official accounting model

### Must Not Include

- Pickup implementation
- Return implementation
- Final pickup/return settlement submission
- New migrations unless explicitly approved
- Official documents
- B2B deep workflow
- Daily reports / shift closing
- Broad dashboard/reporting backend
- Deleting or modifying legacy POS behavior

### Acceptance Criteria

- [ ] Server-authoritative rental money summary exists and is tested.
- [ ] Draft settlement preview exists and is tested without committing final state.
- [ ] Existing payment-line and booking-deposit tests still pass.
- [ ] No duplicate money/deposit model is introduced.
- [ ] Build/typecheck pass.

---

## 16. Final Conclusion

This document is now the authoritative implementation-controlling plan for **Core POS V2**.

The correct strategy is:

```text
Keep backend foundations.
Keep legacy POS temporarily.
Build POS V2 shell.
Build Rental Money Summary and Settlement Preview foundation.
Then build Staff Future Booking, Pickup + Walk-in Instant Rental, Return, History, and Sales in order.
Then layer POS Fiscal Documents, ABB → Full Replacement, POS Void / Return / Refund Control, and Accounting Source Tagging + WHT Evidence polish.
Treat Future Candidate Scope as documented roadmap only, not approved coding scope.
Retire legacy POS only after separate approval and parity validation.
```

The first coding step, **POS V2 Shell + Dashboard / Lookup Skeleton**, is code-present as of the 2026-05-13 reality sync.

For the **customer rental track**, the next approved design direction is:

> Phase C.1 — Customer Rental Booking Detail + Cancellation / Manual Booking Deposit Refund + Admin Refund Queue foundation

For the **POS V2 track**, the safe next coding step remains:

> Rental Money Summary + Rental Settlement Preview foundation

Money-sensitive workflow implementation must wait until:

> Rental Money Summary and Rental Settlement Preview architecture are defined, tested, and approved.

Fiscal-document workflow implementation must wait until:

> Sales/Pickup transaction foundations exist, source-tagging schema/API audit is complete, and official document issuance rules are validated against existing `official_documents` / `document_sequences` foundations.
