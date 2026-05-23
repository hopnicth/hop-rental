# Current Schema Focused Summary — Deposit Forfeiture Accounting

Date: 2026-05-14

Source snapshot: `docs/schema-snapshots/current-schema-2026-05-14.sql`

Historical note: this is a focused schema summary from 2026-05-14. POS V3 Phase 2D Booking Deposit acceptance/guardrails were closed later and are documented in `docs/phase-2d-booking-deposit-acceptance-checklist.md`; verify current migrations before using this file as implementation truth.

Export command used:

```bash
supabase db dump --local --schema public,storage --file docs/schema-snapshots/current-schema-2026-05-14.sql
```

Important export finding: after local migration sync, the current local DB dump **does** include migration `084_rental_booking_no_show_lifecycle.sql` effects. `supabase migration list --local` shows `084` present on both local-file and applied-DB sides.

## 1. Verification of Relevant Migration Effects

| Area                                    | Current exported schema state                                                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer cancellation/refund foundation | Present: `rental_booking_cancellation_events`, cancellation mirror fields on `rental_bookings`, `payment_refunds`, customer cancellation/refund RPC/index hardening.                                                   |
| No-show lifecycle                       | Present: `no_show` is in `rental_booking_status`; `rental_booking_no_show_events` exists; no-show mirror columns are present on `rental_bookings`.                                                                     |
| Document/tax/accounting foundation      | Present: `system_configs`, `branch_document_settings`, `customer_tax_profiles`, `document_sequences`, `official_documents`, `document_events`, `payment_allocations`, plus payment-line tax/accounting categorization. |
| Agreement/versioning foundation         | Present: `agreement_versions`, `agreement_acceptance_logs`, `agreement_evidence_files`, active-version RPC, immutable acceptance/versioning guards.                                                                    |

## 2. Rental Booking Lifecycle / No-show

- `rental_booking_status` enum in the exported schema contains: `draft`, `confirmed`, `cancelled`, `picked_up`, `returned`, `no_show`.
- `rental_bookings` lifecycle fields include `status`, `pickup_at`, `returned_at`, `pickup_branch_id`, `return_branch_id`, cancellation mirror fields, and deposit/payment fields.
- Cancellation foundation exists through:
  - `rental_booking_cancellation_events`
  - `rental_bookings.cancelled_at`
  - `rental_bookings.cancelled_by_user_id`
  - `rental_bookings.cancellation_initiator`
  - `rental_bookings.cancellation_source`
  - `rental_bookings.cancellation_reason`
  - `rental_bookings.cancellation_source_event_id`
  - `rental_bookings.cancellation_refund_eligible`
  - `rental_bookings.cancellation_refund_amount_due`
  - `rental_bookings.cancellation_refund_cutoff_date`
- No-show foundation exists through:
  - `rental_booking_no_show_events`
  - `rental_bookings.no_show_at`
  - `rental_bookings.no_show_marked_by_user_id`
  - `rental_bookings.no_show_reason`
  - `rental_bookings.no_show_source_event_id`
- `rental_booking_no_show_events.deposit_outcome` defaults to and is constrained to `booking_deposit_forfeited_no_refund`.

## 3. Booking Deposit / Refund / Forfeiture

- POS/security-deposit style fields on `rental_bookings`:
  - `deposit_amount`
  - `deposit_paid_amount`
  - `deposit_payment_method`
  - `deposit_payment_status`: `unpaid`, `pending_review`, `paid`, `refunded`, `partial_refund`
  - `deposit_refund_status`: `not_refunded`, `pending`, `refunded`, `forfeited`, `not_applicable`
  - `deposit_refund_amount`
  - `deposit_refund_notes`
  - `deposit_paid_at`, `deposit_refunded_at`, `deposit_notes`
- Online Booking Deposit fields on `rental_bookings`:
  - `booking_deposit_payment_status`: `unpaid`, `pending`, `paid`, `failed`, `expired`, `cancelled`, `paid_confirm_failed`
  - `booking_deposit_paid_amount`
  - `booking_deposit_paid_at`
  - `booking_deposit_payment_attempt_id`
  - `booking_deposit_policy_version`
  - `booking_deposit_terms_accepted_at`
  - `booking_deposit_terms_version`
  - `booking_deposit_confirm_failed_at`
  - `booking_deposit_confirm_failure_reason`
  - `booking_deposit_mixed_allocation_id`
- Refund/payment support tables include:
  - `payment_refunds` for manual Booking Deposit refund lifecycle.
  - `rental_booking_deposit_proofs` for payment/refund proof files.
  - `rental_booking_deposit_action_logs` for staff deposit adjustments/refunds.
  - `rental_booking_payment_attempts` for gateway payment attempts.
  - `rental_booking_payment_lines` for rental/booking-deposit monetary line snapshots.
  - `mixed_checkout_sessions`, `mixed_payment_attempts`, `mixed_payment_allocations` for mixed sale/rental-deposit checkout allocation.
- Forfeiture-related current-schema fields/statuses:
  - `rental_bookings.deposit_refund_status = 'forfeited'` is allowed.
  - `payment_allocations.deposit_lifecycle_status = 'forfeited'` is allowed for `security_deposit` allocations.
  - `rental_booking_payment_lines.forfeited_at` exists as a future lifecycle timestamp.
- Current schema records no-show forfeiture/no-refund outcome in `rental_booking_no_show_events.deposit_outcome = 'booking_deposit_forfeited_no_refund'`.

## 4. Financial / Accounting Foundation

- `payment_allocations` exists as a ledger-like allocation table with `source_type`, `source_id`, `direction`, `allocation_type`, `status`, `vat_treatment`, `net_amount`, `vat_amount`, `gross_amount`, payment references, `related_document_id`, original/reversal allocation links, and `deposit_lifecycle_status`.
- `payment_allocations.allocation_type` allows: `security_deposit`, `rental_advance`, `sale_payment`, `remaining_payment`, `refund`, `penalty`, `damage_fee`, `late_fee`, `manual_adjustment`.
- `rental_booking_payment_lines` includes `tax_category`, WHT fields, refundable/deposit lifecycle markers, and deposit-specific constraints.
- `mixed_payment_allocations` captures mixed-checkout booking-deposit allocations with `tax_category = 'partial_refundable_security_deposit'` for booking deposits.
- No dedicated financial recognition event table, revenue-recognition table, accounting-export batch table, or general-ledger journal table is present in the exported schema.

## 5. Document / Official Document Foundation

- Operational document tables:
  - `asset_documents` with visibility `public`, `customer_after_booking`, `internal`.
  - `rental_booking_documents` with booking-specific document metadata and the same visibility enum.
- Official document foundation:
  - `official_documents` with `document_type`, `document_no`, `status`, source link, customer/tax identity links, totals, `template_key`, `template_version`, immutable `snapshot`, print counters, and `original_document_id` for document chains.
  - `document_sequences` with `document_type`, `sequence_key`, `branch_id`, `period`, `prefix`, `last_number`.
  - `document_events` with lifecycle events: `draft_created`, `issued`, `printed`, `reprinted`, `voided`, `replaced`, `previewed`.
  - `customer_tax_profiles` for reusable full-tax identity data.
  - `branch_document_settings` and `system_configs` for print/header/company configuration.
- `official_documents.status` allows: `draft`, `issued`, `printed`, `voided`, `replaced`.
- Customer access exists for operational documents through RLS policies on `asset_documents` and `rental_booking_documents`; `official_documents` currently has service-role-only RLS in the dump.

## 6. Legal Agreement / Terms Acceptance

- `agreement_versions` stores versioned agreements with types: `terms_of_service`, `privacy_policy`, `rental_agreement`, `damage_loss_policy`, `damage_protection_terms`, `kyc_consent`.
- `agreement_acceptance_logs` stores immutable acceptance evidence and can link to `booking_id`, `order_id`, and `official_document_id`.
- `agreement_evidence_files` stores append-only private evidence file metadata.
- `rental_booking_deposit_agreements` also exists for Booking Deposit terms acceptance snapshots tied to a booking/user/payment attempt.
- `rental_bookings` has Booking Deposit terms fields: `booking_deposit_terms_accepted_at` and `booking_deposit_terms_version`.

## 7. Schema-Level Gaps to Carry Forward

- No dedicated deposit-forfeiture ordinary receipt table exists.
- No dedicated financial recognition event table currently exists.
- No dedicated revenue-recognition or accounting-export batch table currently exists.
- `official_documents` provides a generic official document registry, but there is no schema-level ordinary-receipt object specifically linked to deposit forfeiture.
- Agreement versioning and acceptance logging exist; booking-level binding should be checked in the next design round against actual flows and source linkage.
