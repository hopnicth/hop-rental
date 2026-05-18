# Rental Booking Payment, Deposit, WHT, and Document Action Plan

Status: **PARTIAL IMPLEMENTATION / PLANNING NOTE** as of 2026-05-13. This document describes phased decisions and some older phase wording is now historical.

Reality sync:

- **DONE / code-present:** rental payment-line foundation, Booking Deposit line semantics, booking-deposit payment attempt/status APIs, mixed-checkout booking-deposit allocation/finalization, and focused Vitest coverage.
- **PARTIAL:** operational pickup/return document issuance exists from the admin rental booking detail page, using immutable `official_documents` snapshots; it is not a complete POS V2 history/reprint workspace.
- **NEXT:** server-authoritative Rental Money Summary and Rental Settlement Preview foundation.
- **DESIGN LOCKED / NOT IMPLEMENTED:** customer-facing rental detail page, printable customer booking/payment/cancellation/refund confirmations, customer self-service eligible cancellation, manual Booking Deposit refund request, Admin Refund Queue, cancellation/restriction tracking foundation. Canonical design: `docs/customer-rental-booking-cancellation-refund-design.md`.
- **DESIGNED ONLY / FUTURE:** daily accounting report UI, official receipt/tax invoice/WHT automation.
- **OUTDATED wording to avoid:** statements that online Booking Deposit payment or `booking_deposit` line modeling are purely future work; these foundations now exist in code/migrations.
- **POS V3 reconciliation required:** the POS V3 master blueprint draft (`file ที่ คุย ปิงปองมา 18may2026 เรื่อง pos v3 และ policy.md`) proposes rental pickup as deposit/handover operational documentation and return as the possible tax point. Do not deepen POS V3 pickup/return/payment/document UI from this older action plan until the rental money model and WHT gates are approved.

## 1. Executive Decision

Implement the full rental booking/deposit/payment/document flow in phases. Do not combine online payment, official receipts, refund accounting, and tax invoice generation into one pass.

Phase 1 must first introduce explicit rental payment lines and WHT rules while keeping the current booking confirmation and sale payment flows stable. The newer Fixed Booking Deposit model should be treated as a planning update for the next rental-payment-line iteration and future online booking-deposit payment phase.

## 2. Target High-Level Flow

1. User books asset.
2. Draft booking is created.
3. User reviews cart.
4. System displays split payment lines.
5. System calculates a fixed Booking Deposit due now.
6. User accepts rental and booking-deposit agreement.
7. User pays Booking Deposit online in a later phase.
8. Payment success triggers existing server confirm logic/shared confirm logic.
9. Booking becomes confirmed only after Booking Deposit payment success and confirm validation pass.
10. Booking ID and QR are available.
11. On pickup day, customer pays rental fee and remaining security deposit at branch.
12. Booking Deposit is applied toward the required refundable security deposit.
13. Booking Deposit receipt/document is generated later in Phase 4.
14. Admin fulfills pickup/return.
15. Return inspection determines refund, deduction, or no-show/cancellation outcome.
16. Booking closes.

## 3. Current Audit Lock

| Area                   | Current finding                                                                         | Decision                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Asset to draft booking | `asset/[slug].vue` creates draft via `useBooking.addBooking()`                          | Reuse                                                                                           |
| Cart confirmation      | `cart.vue` calls `updateBookingStatus(..., "confirmed")`                                | Keep unchanged in Phase 1                                                                       |
| Confirm API            | `/api/rental-bookings/{id}/confirm` validates and changes status                        | Reuse; do not bypass                                                                            |
| DB overlap guard       | Trigger prevents blocking overlap for confirmed/picked_up bookings                      | Reuse as final guard                                                                            |
| POS rental fields      | Stores `rental_total`, `deposit_amount`, `deposit_paid_amount`, `checkout_total_amount` | Reuse legacy fields; add line snapshot                                                          |
| Sale payment system    | Existing Omise/payment attempts are tied to sale `orders.grand_total`                   | Do not change in Phase 1                                                                        |
| Rental print form      | Operational handover/return form, not official receipt/tax invoice                      | Upgrade only in Phase 2                                                                         |
| Tax profile foundation | `customer_tax_profiles` exists                                                          | Reuse for customer kind later                                                                   |
| Document foundation    | `official_documents`, `document_sequences`, `payment_allocations` exist                 | Reuse in later phases                                                                           |
| QR pattern             | Booking/customer QR uses `qrcode.vue`; PromptPay uses Omise QR                          | Reuse later                                                                                     |
| WHT logic              | No real rental WHT calculation yet                                                      | Add in Phase 1                                                                                  |
| Booking Deposit        | Modeled in payment-line/deposit-payment foundation                                      | Treat as partial refundable security deposit; continue to preserve non-income/non-WHT semantics |

## 4. Frozen Business Tax Policy

| Line type                     | Tax category                          | Individual WHT |      Company WHT | Notes                                                                  |
| ----------------------------- | ------------------------------------- | -------------: | ---------------: | ---------------------------------------------------------------------- |
| `rental_fee`                  | `rental_income`                       |             0% |               5% | Rental income                                                          |
| `booking_deposit`             | `partial_refundable_security_deposit` |             0% |               0% | Fixed partial refundable security deposit collected to confirm booking |
| `refundable_security_deposit` | `refundable_security_deposit`         |             0% |               0% | Always refundable/non-income                                           |
| `delivery_fee`                | `service_income`                      |             0% | 3% if configured | Default 0 until config exists                                          |
| `service_fee`                 | `service_income`                      |             0% | 3% if configured | Installation/labor/service                                             |
| `insurance_fee`               | `insurance_or_coverage`               |             0% |       0% default | Policy-dependent                                                       |
| `damage_fee`                  | `damage_compensation`                 |          Later |            Later | Separate document after return                                         |
| `late_fee`                    | `penalty_income`                      |          Later |            Later | Separate document after return                                         |

Security deposit is always:

- `wht_applicable = false`
- `wht_rate = 0`
- `wht_amount = 0`
- `is_refundable = true`
- `wht_certificate_required = false`
- not rental income

Booking Deposit is always treated as part of refundable security deposit:

- `line_type = booking_deposit`
- `tax_category = partial_refundable_security_deposit`
- `wht_applicable = false`
- `wht_rate = 0`
- `wht_amount = 0`
- `is_refundable = true`
- `wht_certificate_required = false`
- `applies_to_security_deposit = true`
- `reduces_remaining_security_deposit = true`
- not extra revenue
- not booking fee, reservation fee, service fee, rental advance, or non-refundable fee

## 5. Fixed Booking Deposit Model

### 5.1 Business concept

When a customer books a rental item, they must pay a small fixed Booking Deposit to confirm the booking. This prevents fake/no-show bookings without forcing customers to pay the full refundable security deposit upfront.

Preferred labels:

- English: `Booking Deposit`
- Thai: `เงินมัดจำจอง`
- Full meaning: `Partial Refundable Security Deposit / เงินมัดจำประกันบางส่วนที่ใช้ยืนยันการจอง`

Do not label this amount as:

- Booking Fee
- Reservation Fee
- Service Fee
- Rental Advance
- Non-refundable Fee

Reason: those labels may make the amount look like income/service revenue and may create unnecessary tax/WHT complexity.

### 5.2 Fixed amount rule

| Rental duration |       Booking Deposit |
| --------------- | --------------------: |
| `<= 30 days`    |   200 THB per booking |
| `> 30 days`     | 1,000 THB per booking |

### 5.3 High-risk override

Admin/system may require a higher Booking Deposit for:

- high-value assets
- limited quantity assets
- special preparation assets
- new/unverified customers
- high-risk bookings

Any override must be shown to the customer before payment. If an admin manually changes the Booking Deposit, store the override reason and staff/admin identity in the audit trail.

### 5.4 Accounting treatment

Booking Deposit is a partial refundable security deposit collected in advance.

Example:

| Item                                     |    Amount |
| ---------------------------------------- | --------: |
| Full required security deposit           | 5,000 THB |
| Booking Deposit paid now                 |   200 THB |
| Remaining security deposit due at pickup | 4,800 THB |

Therefore:

- `booking_deposit` is not extra revenue
- `booking_deposit` reduces remaining deposit due
- `booking_deposit` WHT = 0
- `booking_deposit` VAT/tax handling follows refundable deposit treatment, not rental income treatment
- `wht_certificate_required = false`

Recommended calculation fields:

- `security_deposit_required`
- `booking_deposit_due_now`
- `booking_deposit_paid`
- `remaining_security_deposit_due`
- `rental_fee_due`
- `net_payable_now`
- `net_payable_at_pickup`

Example customer display:

| Display line                         |    Amount |
| ------------------------------------ | --------: |
| Rental fee                           | 3,500 THB |
| Security Deposit required            | 5,000 THB |
| Booking Deposit due now              |   200 THB |
| Remaining Security Deposit at pickup | 4,800 THB |

### 5.5 Cancellation and no-show policy

1. Customer cancels at least 3 days before rental start date:
   - Booking Deposit is refundable.
2. Customer cancels less than 3 days before rental start date:
   - Company may withhold all or part of the Booking Deposit to compensate preparation cost, opportunity cost, and admin cost.
3. Customer does not pick up the item on the scheduled pickup date and does not notify the company:
   - Booking is treated as no-show.
   - Company may cancel the booking.
   - Company may release the asset to other customers.
   - Booking Deposit may be forfeited.
4. Customer requests reschedule before pickup deadline:
   - Admin may allow one-time reschedule depending on asset availability.
   - If customer misses the rescheduled pickup date again, booking may be cancelled and Booking Deposit may be forfeited.

Pickup/no-show rule:

- Customer must pick up the item on the date/time shown in the Booking ID or within company operating hours.
- If the customer cannot pick up on time, they must notify the company before pickup time or before end of business day on pickup date.
- If no notice is received, mark booking as `no_show` or `cancelled_no_show`, release asset availability, keep/forfeit Booking Deposit according to agreement, and keep audit trail.

Thai term to include in customer agreement:

> เงินมัดจำจองนี้ใช้เพื่อยืนยันการจองและกันการจองโดยไม่รับสินค้า โดยเงินดังกล่าวจะนำไปหักจากเงินมัดจำประกันที่ต้องชำระในวันรับสินค้า หากผู้เช่ายกเลิกก่อนวันเริ่มเช่าไม่น้อยกว่า 3 วัน บริษัทจะคืนเงินมัดจำจองให้แก่ผู้เช่า หากยกเลิกน้อยกว่า 3 วัน หรือไม่มารับสินค้าตามวันที่กำหนดโดยไม่แจ้งล่วงหน้า บริษัทขอสงวนสิทธิ์ในการไม่คืนเงินมัดจำจองทั้งหมดหรือบางส่วน

## 6. Enums

### 6.1 `line_type`

- `rental_fee`
- `booking_deposit`
- `refundable_security_deposit`
- `delivery_fee`
- `service_fee`
- `insurance_fee`
- `damage_fee`
- `late_fee`

### 6.2 `tax_category`

- `rental_income`
- `partial_refundable_security_deposit`
- `refundable_security_deposit`
- `refundable_deposit` (optional generic category if accounting prefers one umbrella category)
- `service_income`
- `insurance_or_coverage`
- `damage_compensation`
- `penalty_income`
- `non_taxable`

### 6.3 customer kind input for calculator

- `individual`
- `company`
- `unknown`

`unknown` should behave conservatively as individual/no WHT until a verified company/tax context is available.

## 7. Document and ID Naming Assumptions

Phase 1 stores payment lines only. It does not issue official receipts.

Later phases should use these assumptions:

| ID                                    | Suggested format                                          | Phase                          |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------ |
| Booking display ID                    | Existing booking UUID or existing asset code fallback     | Current                        |
| Booking QR payload                    | `booking:{booking_id}`                                    | Phase 2/4 reuse                |
| Booking Deposit receipt document type | `booking_deposit_receipt`                                 | Phase 4                        |
| Booking Deposit receipt label         | `Booking Deposit Receipt / ใบรับเงินมัดจำจอง`             | Phase 4                        |
| Deposit receipt document type         | `deposit_receipt`                                         | Later full deposit/refund flow |
| Deposit receipt label                 | `Deposit Receipt / ใบรับเงินมัดจำประกัน`                  | Later full deposit/refund flow |
| Receipt number                        | Use `official_documents` + `document_sequences`           | Phase 4/6                      |
| Receipt QR payload                    | Verify URL if available, otherwise `receipt:{receipt_id}` | Phase 4                        |

## 8. Reuse Map

| Existing foundation                 | Reuse plan                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `useBooking.ts` draft/confirm flow  | Keep Phase 1 storefront confirmation unchanged                                               |
| Confirm API and overlap trigger     | Keep as final booking confirmation guard                                                     |
| POS booking creation                | Extend to compute/store payment lines server-side                                            |
| `rental_bookings` deposit fields    | Keep for compatibility and operational status                                                |
| `customer_tax_profiles`             | Use later for customer kind/tax identity                                                     |
| `payment_allocations`               | Use later for real payment ledger/refund flows                                               |
| `official_documents`                | Use later for immutable receipts/tax invoices                                                |
| `qrcode.vue` booking/customer QR    | Reuse for booking/receipt display later                                                      |
| `admin-rental-print-form`           | Phase 2 operational print upgrade                                                            |
| Sale order Omise payment            | Leave unchanged in Phase 1                                                                   |
| Existing confirm API and DB trigger | Use after Booking Deposit payment succeeds in Phase 3; do not confirm before payment success |

## 9. Phase 1 Exact File List

### New files

- `app/types/rental-payment-line.ts`
- `app/utils/rental-payment-lines.ts`
- `server/utils/rental-payment-lines.ts`
- `supabase/migrations/0XX_rental_booking_payment_lines.sql`
- `tests/server/rental-payment-lines.test.ts`

### Existing files to update

- `app/pages/user/cart.vue`
- `app/pages/admin/pos.vue`
- `app/components/admin/AdminPosTotalSummary.vue`
- `server/api/admin/pos/bookings.post.ts`

### Optional in Phase 1 if needed

- `app/types/rental-booking.ts`
- `server/api/admin/customers/lookup.get.ts`
- `server/utils/admin-orders.ts`

## 10. Phase 1 Migration Plan

Create `rental_booking_payment_lines`.

Required columns:

- `id uuid primary key default gen_random_uuid()`
- `booking_id uuid not null references rental_bookings(id) on delete cascade`
- `line_type text not null`
- `tax_category text not null`
- `description_th text not null`
- `description_en text not null`
- `gross_amount numeric(12,2) not null default 0`
- `wht_applicable boolean not null default false`
- `wht_rate numeric(7,6) not null default 0`
- `wht_amount numeric(12,2) not null default 0`
- `net_payable_amount numeric(12,2) not null default 0`
- `is_refundable boolean not null default false`
- `wht_certificate_required boolean not null default false`
- `applies_to_security_deposit boolean not null default false`
- `reduces_remaining_security_deposit boolean not null default false`
- `applied_to_deposit_at timestamptz null`
- `forfeited_at timestamptz null`
- `refunded_at timestamptz null`
- `status text not null default 'active'`
- `source text not null default 'system'`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `line_type` is one of the Phase 1 enum values.
- `tax_category` is one of the Phase 1 enum values.
- Amounts must be non-negative.
- `net_payable_amount = gross_amount - wht_amount` within 0.01.
- `refundable_security_deposit` must always have WHT 0, non-WHT, refundable, and no WHT certificate.
- `booking_deposit` must always have WHT 0, non-WHT, refundable, no WHT certificate, apply to security deposit, and reduce remaining security deposit due.
- `metadata` must be a JSON object.

Indexes:

- `(booking_id, created_at)`
- `(line_type)`
- optional unique active line by `(booking_id, line_type, source)` if only one line per type is allowed.

RLS:

- Enable RLS.
- Service role full access for server writes.
- Do not expose direct client writes.

## 11. Phase 1 Data Model

`rental_bookings` remains the operational aggregate source for current screens and compatibility.

`rental_booking_payment_lines` becomes the explicit monetary/tax snapshot per booking.

Calculator output shape:

| Field                             | Meaning                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `lineType`                        | Business line type                                         |
| `taxCategory`                     | Accounting/tax category                                    |
| `descriptionTh`                   | Thai label                                                 |
| `descriptionEn`                   | English label                                              |
| `grossAmount`                     | Amount before WHT                                          |
| `whtApplicable`                   | Whether WHT applies                                        |
| `whtRate`                         | Decimal rate, e.g. 0.05                                    |
| `whtAmount`                       | Rounded WHT amount                                         |
| `netPayableAmount`                | Gross minus WHT                                            |
| `isRefundable`                    | True only for refundable deposit in Phase 1                |
| `whtCertificateRequired`          | True only when WHT amount > 0                              |
| `appliesToSecurityDeposit`        | True for booking/security deposit lines                    |
| `reducesRemainingSecurityDeposit` | True when paid amount reduces remaining pickup deposit due |
| `source`                          | `cart_preview`, `pos_booking_create`, `server_recompute`   |
| `metadata`                        | Policy/config/debug snapshot                               |

Phase 1 customer kind resolution:

- Storefront: use active company/tax context if available; otherwise `individual`.
- POS: default `individual` unless customer/company context is explicitly available.
- Server must recompute and not trust client-provided WHT.

### 11.1 Booking table recommendations for Fixed Booking Deposit

Future migrations may add these fields to `rental_bookings` or a related booking-payment-state table:

- `booking_deposit_required_amount`
- `booking_deposit_paid_amount`
- `booking_deposit_payment_status`
- `booking_deposit_applied_amount`
- `booking_deposit_refund_status`
- `booking_deposit_forfeited_amount`
- `booking_deposit_policy_version`
- `pickup_deadline_at`
- `no_show_at`
- `no_show_reason`
- `reschedule_count`

Recommended payment-line support fields:

- `line_type = booking_deposit`
- `applies_to_security_deposit = true`
- `applied_to_deposit_at nullable`
- `forfeited_at nullable`
- `refunded_at nullable`

### 11.2 Booking Deposit calculation model

Input:

- rental duration in days
- security deposit required
- asset risk profile / customer risk profile
- override amount and reason, if any

Output:

- `security_deposit_required`
- `booking_deposit_due_now`
- `remaining_security_deposit_due`
- `rental_fee_due`
- `net_payable_now`
- `net_payable_at_pickup`

Rules:

- If duration `<= 30 days`: `booking_deposit_due_now = 200`.
- If duration `> 30 days`: `booking_deposit_due_now = 1,000`.
- Override may increase amount, but must be shown before payment and audited.
- `remaining_security_deposit_due = max(security_deposit_required - booking_deposit_paid, 0)`.
- Booking Deposit WHT must remain 0 for individual and company customers.

## 12. Phase 1 Test Plan

### Unit tests

- Individual rental fee: WHT 0, net = gross.
- Company rental fee: WHT 5%, net = gross - WHT.
- Individual deposit only: WHT 0, net = full deposit.
- Company deposit only: WHT 0, net = full deposit.
- Company rental + deposit: rental WHT 5%, deposit WHT 0.
- Booking `<= 30 days`: Booking Deposit due now = 200, WHT 0, remaining security deposit = security deposit - 200.
- Booking `> 30 days`: Booking Deposit due now = 1,000, WHT 0, remaining security deposit = security deposit - 1,000.
- Company customer: rental fee WHT may apply, Booking Deposit WHT remains 0.
- Service/delivery WHT disabled: WHT 0.
- Service/delivery WHT enabled: company WHT 3%.
- Deposit invariant cannot be overridden by config/input.

### Server/API tests

- POS booking create stores expected payment lines.
- Online Booking Deposit create API, in Phase 3, recomputes Booking Deposit server-side.
- POS booking create recomputes server-side even if client values differ.
- Deposit line persisted with WHT 0 and refundable flags.
- Booking Deposit line persisted with WHT 0, refundable flags, and applies-to-security-deposit flags.
- Existing sale order payment tests remain passing.

### UI/manual checks

- POS summary shows gross, WHT, and net payable.
- User cart shows split rental/deposit lines.
- User cart shows Booking Deposit due now and remaining security deposit due at pickup.
- Existing rental confirm from cart still works.
- Existing sale checkout/payment still works.

## 13. Future Phase Scope Updates

### 13.1 Phase 1 impact — Rental Payment Lines + WHT Foundation

Add/clarify payment-line concepts:

- New `line_type`: `booking_deposit`
- New/clarified tax category: `partial_refundable_security_deposit` or an accounting-approved generic `refundable_deposit`

Booking Deposit line must have:

- `line_type = booking_deposit`
- `tax_category = partial_refundable_security_deposit`
- `gross_amount = 200` or `1,000` depending on duration, unless approved high-risk override applies
- `wht_applicable = false`
- `wht_rate = 0`
- `wht_amount = 0`
- `is_refundable = true`
- `wht_certificate_required = false`
- `applies_to_security_deposit = true`
- `reduces_remaining_security_deposit = true`

Also keep/display:

- full `refundable_security_deposit` required amount
- `remaining_security_deposit_due_at_pickup`

Phase 1 UI/payment preview should be able to show:

- rental fee due
- full security deposit required
- Booking Deposit due now
- remaining security deposit at pickup
- WHT for rental/service lines
- Booking Deposit WHT = 0
- net payable now
- net payable at pickup

### 13.2 Phase 3 impact — Online Booking Deposit Payment

Rename the phase goal from “Pay Deposit Online” to “Pay Booking Deposit Online”.

Desired booking flow:

1. User clicks Book on asset page.
2. User selects rental dates and receiver info.
3. System creates draft booking.
4. Cart shows rental fee, full security deposit, Booking Deposit due now, remaining security deposit due at pickup, WHT if applicable, and Booking Deposit WHT = 0.
5. User accepts booking-deposit agreement.
6. User pays Booking Deposit online.
7. Payment success triggers existing confirm API/shared confirm logic.
8. If confirm succeeds:
   - booking status = `confirmed`
   - Booking Deposit marked paid
   - Booking ID and QR shown
   - Booking Deposit receipt/document generated in later phase
9. If payment succeeds but confirm fails due to availability conflict:
   - mark payment as `paid_confirm_failed`
   - create admin alert
   - customer sees payment received but booking requires review
   - admin can refund or resolve manually

Important: Do not confirm booking before Booking Deposit payment success. Existing confirm validation and DB overlap trigger remain the final booking guard.

### 13.3 Phase 4 impact — Booking Deposit Receipt / Document

Receipt/document should be for:

- `Booking Deposit Receipt / ใบรับเงินมัดจำจอง`

Receipt wording:

> This Booking Deposit is collected as part of the refundable security deposit for the rental booking. It is not a booking fee, service fee, or rental income at the time of receipt. It will be applied toward the required refundable security deposit when the customer picks up the item.

Thai wording:

> เงินมัดจำจองนี้เป็นส่วนหนึ่งของเงินมัดจำประกันที่คืนได้สำหรับการเช่าสินค้า ไม่ใช่ค่าจอง ค่าบริการ หรือรายได้ค่าเช่า ณ เวลาที่รับชำระ และจะนำไปหักจากเงินมัดจำประกันที่ต้องชำระในวันรับสินค้า

Receipt should show:

- Booking Deposit paid now
- Full Security Deposit required
- Remaining Security Deposit due at pickup
- WHT on Booking Deposit = 0
- WHT certificate required = false

### 13.4 Phase 5 impact — No-show / cancellation / deposit lifecycle

Status: **SUPERSEDED FOR CUSTOMER SELF-SERVICE CANCELLATION** by `docs/customer-rental-booking-cancellation-refund-design.md`. Keep the Booking Deposit semantics below, but use the newer design for Bangkok calendar-day cutoff, manual admin refund queue, cancellation event fields, `payment_refunds`, customer documents, and restriction tracking.

Add statuses or state markers:

- `no_show`
- `cancelled_no_show`
- `booking_deposit_forfeited`
- `booking_deposit_refunded`
- `booking_deposit_applied_to_security_deposit`

Rules:

- If customer picks up item: Booking Deposit is applied to security deposit.
- If customer cancels `>= 3 days` before rental start: Booking Deposit is refundable.
- If customer cancels `< 3 days`: Booking Deposit may be forfeited.
- If customer no-shows: Booking Deposit may be forfeited and asset released.
- If forfeited: create separate forfeiture/adjustment document in a later official-document phase. Do not silently mutate original receipt.

Future admin/customer views should show:

- Booking Deposit paid
- applied amount
- remaining security deposit due
- refund status
- forfeited amount
- no-show/cancellation reason and audit trail

## 14. Risks and Mitigations

| Risk                                                  | Mitigation                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Breaking existing sale payment                        | Do not modify `/api/orders`, sale `payment_attempts`, or Omise flow in Phase 1                           |
| Incorrect WHT if customer kind unknown                | Default unknown to no WHT; require explicit company context for company WHT                              |
| Client tampering with WHT                             | Server recomputes all lines                                                                              |
| Deposit accidentally treated as income                | DB constraint and server guard force WHT 0/refundable flags                                              |
| Booking Deposit accidentally labeled as a fee/revenue | Use only “Booking Deposit / เงินมัดจำจอง” and document that it is partial refundable security deposit    |
| Booking Deposit not deducted from pickup deposit      | Store `applies_to_security_deposit` and compute `remaining_security_deposit_due` server-side             |
| Customer disputes forfeiture                          | Require agreement acceptance, pickup deadline, cancellation window, and audit trail                      |
| No-show booking continues blocking inventory          | Add `no_show`/`cancelled_no_show` flow that releases availability and records forfeiture/refund decision |
| High-risk override seems arbitrary                    | Show override before payment and store override reason/staff/system source                               |
| POS legacy totals drift from lines                    | Store line snapshot and keep aggregate fields for compatibility                                          |
| Migration breaks old environments                     | Add table only; do not alter existing required columns in Phase 1                                        |
| Damage fees mixed with deposit                        | Keep damage/late fee out of Phase 1 payment lines except enum support                                    |
| Premature official receipt scope creep                | Phase 1 does not generate official documents                                                             |

## 15. Phase Gates

### Phase 0 completion criteria

- Audit lock documented.
- Business tax policy frozen.
- Line/tax categories defined.
- Fixed Booking Deposit model and cancellation/no-show policy documented.
- Phase 1 files, migration, model, tests, and risks defined.

### Phase 1 completion criteria

- Calculator and server recompute exist.
- `rental_booking_payment_lines` migration exists.
- POS creates and stores line snapshot.
- POS/cart display split summaries.
- Deposit WHT 0 is enforced.
- Booking Deposit WHT 0 and remaining security deposit calculations are covered when the model is implemented.
- Tests pass.
- Sale order payment behavior is unchanged.

## 16. Do Not Implement Yet

These are explicitly out of the original Phase 1. Items already delivered after Phase 1 are marked accordingly:

- Online rental/deposit payment. **Status: partly delivered for Booking Deposit payment; full rental/deposit payment lifecycle is not complete.**
- Online Booking Deposit payment. **Status: delivered foundation exists; do not reimplement as a separate flow.**
- Deposit receipt generation.
- Booking Deposit receipt generation.
- Official receipt/tax invoice generation.
- VAT calculation.
- WHT certificate tracking.
- Refund payment gateway integration.
- PDF generation.
- Full accounting export redesign.

## 17. Phase C.1 Customer Cancellation / Refund Design Lock

Canonical document:

- `docs/customer-rental-booking-cancellation-refund-design.md`

Locked scope for the future implementation phase:

- `/user/rentals/[bookingId]` becomes the customer booking detail/document/refund page.
- Refund cutoff uses Bangkok calendar-day logic: `cancellation_local_date <= pickup_local_date - 3 calendar days`.
- Refunds are manual admin process first, not automatic gateway refunds.
- Eligible cancellation requires customer refund bank/contact form and immutable cancellation event.
- Refund request lifecycle uses a future `payment_refunds` model.
- Admin Refund Queue route should be `/admin/refunds`.
- Customer confirmations use existing `official_documents` immutable snapshot foundation and must state they are not receipts/tax invoices.
- Daily reporting UI remains future, but Phase C.1 data must support refund obligation, refund paid, pending/failed, and restriction reporting later.
