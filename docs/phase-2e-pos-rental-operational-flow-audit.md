# Phase 2E — POS Rental Operational Flow Audit

**Status:** AUDIT COMPLETE (design-only, no runtime changes)
**Date:** 2026-05-20
**Phase baseline:** Phase 2D CLOSED — Booking Deposit flow complete (864/864 tests, 0 TypeScript errors)

---

## 1. Current Baseline

Phase 2D delivered a complete POS V3 Booking Deposit flow:
- Draft rental booking creation (future-booking mode)
- Cash deposit collection + finalization
- PromptPay QR deposit + webhook confirmation
- BDC document issuance + print
- Active QR recovery, QR replacement safety
- Late-payment recovery, paid_confirm_failed double-collection guard
- Booking Detail resume CTA (`?bookingId=` query re-entry)

The POS V3 shell (`app/pages/admin/pos-v3/index.vue`) is the single operational
entry point. It currently handles: booking mode (draft + deposit), order/sale mode
(shell only), and KYC mode (placeholder). No pickup, return, or settlement logic
lives in POS V3 yet.

The legacy POS V2 (`server/api/admin/pos-v2/`) has a working `pickup-readiness`
check and `pickup-complete` endpoint, but these are not wired into POS V3.

---

## 2. Existing Reusable Foundations

### 2A. Schema

| Table / Column(s) | Purpose |
|---|---|
| `rental_bookings.status` ENUM (`draft`, `confirmed`, `picked_up`, `returned`, `cancelled`, `no_show`) | Full lifecycle status |
| `rental_bookings.pickup_at`, `pickup_branch_id` | Operational pickup timestamp + branch (migration 073) |
| `rental_bookings.returned_at`, `return_branch_id` | Operational return timestamp + branch (migration 073) |
| `rental_bookings.checkout_total_amount`, `checkout_paid_amount`, `checkout_payment_method` | Legacy pickup money fields (migration 059) |
| `rental_bookings.deposit_paid_amount`, `deposit_payment_status`, `deposit_refund_status`, `deposit_refund_amount`, `deposit_refund_notes`, `deposit_refunded_at` | Legacy deposit lifecycle (migration 057, 067) |
| `rental_bookings.booking_deposit_payment_status`, `booking_deposit_paid_amount` | POS V3 booking deposit tracking (migration 076) |
| `rental_booking_fulfillments` | One row per pickup/return event; stores signature_url, signature_storage_path, notes, booking_checklist_id, branch_id, event_at, idempotency_key, performed_by_user_id (migrations 031, 073) |
| `rental_booking_handover_items` | Booking-level item manifest; pickup_checked, quantity_handed_over, return_status ENUM (`pending`, `returned_complete`, `returned_partial`, `missing`, `damaged`), quantity_returned (migration 080) |
| `rental_booking_payment_lines` | Line-level monetary snapshot; supports `rental_fee`, `booking_deposit`, `refundable_security_deposit`, `damage_fee`, `late_fee`, `delivery_fee`, `service_fee`, `insurance_fee`; WHT-aware; is_refundable, applies_to_security_deposit, reduces_remaining_security_deposit (migrations 074, 075) |
| `rental_booking_deposit_proofs` | Proof file upload; proof_kind = `payment` or `refund` (migration 057) |
| `rental_held_balance_events` | Canonical held-balance ledger; event_types: `booking_deposit_collection`, `pickup_held_balance_collection`, `same_day_held_balance_collection`, `settlement_application`, `refund`, `forfeiture`; immutable/non-deletable (migration 086) |
| `pos_rental_payment_attempts` | POS-specific durable payment source; currently only `booking_deposit` purpose + `cash` method (migration 087) |
| `pos_rental_payment_attempts_qr` | QR-specific attempt tracking (migration 092) |
| `rental_booking_checklists` + `rental_booking_checklist_items` | Generic checklist system (kind: `pickup`, `return`, `inspection`, `service`) |
| `pos_document_issuance_tasks` | Durable document issuance tracking (currently only BDC type, migration 091) |
| `admin_user_branch_access` | Staff POS branch permission (migration 059) |

### 2B. Server APIs

| Endpoint | Method | Purpose | Status |
|---|---|---|---|
| `/api/admin/rental-bookings/[id]` | GET | Full booking detail | ✅ exists |
| `/api/admin/rental-bookings/[id]/ops` | GET | Checklists + documents for a booking | ✅ exists |
| `/api/admin/rental-bookings/[id]/money-summary` | GET | `RentalMoneySummary` + `RentalSettlementPreview` | ✅ exists |
| `/api/admin/rental-bookings/[id]/print-form?type=pickup\|return` | GET | Full A5 print form payload | ✅ exists |
| `/api/admin/rental-bookings/[id]/pickup` | POST | Complete pickup fulfillment (signature, checklist, branch) | ✅ exists |
| `/api/admin/rental-bookings/[id]/return` | POST | Complete return fulfillment (signature, refund fields) | ✅ exists |
| `/api/admin/rental-bookings/[id]/handover-items` | GET/POST | List / create handover items | ✅ exists |
| `/api/admin/rental-bookings/[id]/handover-items/generate` | POST | Auto-generate initial item from asset | ✅ exists |
| `/api/admin/rental-bookings/[id]/handover-items/[itemId]` | PATCH/DELETE | Update / soft-delete handover item | ✅ exists |
| `/api/admin/rental-bookings/[id]/deposit-proof` | POST | Upload deposit/refund proof file | ✅ exists |
| `/api/admin/rental-bookings/[id]/deposit` | PATCH | Update legacy deposit fields | ✅ exists |
| `/api/admin/pos-v2/rental-bookings/[id]/pickup-readiness` | GET | Pickup readiness classification + blockers | ✅ POS V2 |
| `/api/admin/pos-v2/rental-bookings/[id]/pickup-complete` | POST | POS V2 pickup completion with payment | ✅ POS V2 only |
| `/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-payments` | POST | POS V3 cash deposit collection | ✅ POS V3 |
| `/api/admin/pos-v3/rental-bookings/[bookingId]/booking-deposit-qr` | POST | POS V3 QR deposit creation | ✅ POS V3 |

**Key reusable server utilities:**
- `server/utils/rental-fulfillment.ts` — `completeRentalBookingFulfillment`, signature upload, checklist validation, idempotency guard
- `server/utils/rental-money-summary.ts` — `buildRentalMoneySummary`, `buildRentalSettlementPreview`, `loadRentalMoneySummaryInput`
- `server/utils/rental-pickup-readiness.ts` — `buildRentalPickupReadiness`, `assertPickupReadinessBranchAccess`
- `server/utils/admin-booking-handover-items.ts` — CRUD helpers, `isHandoverEditableStatus`, `assertHandoverEditable`
- `server/utils/admin-rental-print-form.ts` — `buildAdminRentalPrintFormPayload`
- `server/utils/admin-rental-print-form-loader.ts` — `loadAdminRentalPrintFormData`
- `server/utils/rental-held-balance-events.ts` — `recordBookingDepositHeldBalanceCollection`, `findExistingRentalHeldBalanceEvent`
- `server/utils/rental-held-balance-summary.ts` — `RentalHeldBalanceSummary` builder

### 2C. UI Components

| Component / Page | Purpose | Status |
|---|---|---|
| `app/pages/admin/pos-v3/index.vue` | POS V3 operational shell | ✅ booking deposit complete |
| `app/pages/admin/rental-bookings/[id].vue` | Full admin booking detail | ✅ exists |
| `app/pages/admin/rental-bookings/[id]/print.vue` | A5 print page for pickup/return forms | ✅ exists |
| `app/components/admin/AdminBookingHandoverItems.vue` | Handover item CRUD UI | ✅ exists (admin detail only) |
| `app/components/admin/pos/AdminPosV3ResolverPanel.vue` | QR scanner + search panel | ✅ exists |
| `app/components/admin/pos/AdminPosV3BookingContext.vue` | Booking context display | ✅ exists |
| `app/components/admin/pos/AdminPosV3PendingWorkList.vue` | Customer pending work list | ✅ exists |
| `app/components/documents/OfficialDocumentHeader.vue` | Reusable A5 document header | ✅ exists |
| Signature canvas component | Customer/staff signature capture | ❌ **NOT in POS V3** |

**Note:** POS V3 booking context (`AdminPosV3BookingContext`) already shows the booking status and reads pickup readiness via the POS V2 endpoint, but takes no pickup/return action yet.

### 2D. Print / Document Utilities

| Utility | Details |
|---|---|
| A5 print CSS | `@page { size: A5 portrait; margin: 8mm; }` at 8.5pt font, `width: 148mm`, `min-height: 210mm` |
| Print form aggregator | `loadAdminRentalPrintFormData` loads booking + ops + fulfillment + staffName + branchName + walkInEvidence |
| Print form payload type | `AdminRentalPrintFormPayload` (type, booking, customer, branch, event, items, checklist, money, deductions, signatures, disclaimer) |
| Operational disclaimer | `RENTAL_OPERATIONAL_DISCLAIMER` — already defined in `admin-rental-print-form.ts` |
| Document naming standard | `DNA-YYYYMM-0001` (delivery/acceptance), `RTN-YYYYMM-0001` (return receiving note) defined in `docs/printing-document-standard.md` |
| BDC issuance | Fully implemented for Booking Deposit (prefix `BDC-`) |
| Official document registry | `official_documents` table + `pos_document_issuance_tasks` pattern |

### 2E. Tests

| Test file | Covers |
|---|---|
| `tests/server/utils/rental-fulfillment.spec.ts` | `completeRentalBookingFulfillment` — pickup/return state machine, signature, checklist, idempotency |
| `tests/server/pos-v2-pickup-completion.spec.ts` | POS V2 pickup completion with payment lines |
| `tests/server/rental-pickup-readiness.spec.ts` | `buildRentalPickupReadiness` — status blockers, KYC, money summary, branch context |
| `tests/server/rental-money-summary.spec.ts` | `buildRentalMoneySummary` + `buildRentalSettlementPreview` — all monetary scenarios |
| `tests/server/rental-held-balance-events.spec.ts` | Held balance event recording, duplicate guard |
| `tests/server/rental-held-balance-summary.spec.ts` | Held balance summary calculations |
| `tests/server/rental-payment-lines.spec.ts` | Payment line utilities |
| `tests/server/admin-booking-handover-items.spec.ts` | Handover item CRUD API |
| `tests/server/admin-booking-handover-ui.spec.ts` | Handover item UI wiring |
| `tests/server/admin-rental-print-form.spec.ts` | Print form payload builder |
| `tests/server/admin-operational-documents.spec.ts` | Operational document UI state |
| `tests/server/admin-pos-v3-*.spec.ts` | POS V3 draft creation, deposit payments, QR flows, BDC |
| `tests/server/admin-pos-v2-*.spec.ts` | POS V2 rental bookings + UI |

---

## 3. Gaps / Missing Pieces

### 3A. Pickup Gaps

| Gap | Detail |
|---|---|
| **No POS V3 pickup UI** | POS V3 shell shows booking context + pickup readiness, but has no pickup action containers, no signature canvas, no handover checklist step |
| **No pickup money collection in POS V3** | `pos_rental_payment_attempts.payment_purpose` constraint only allows `booking_deposit`. Pickup collection needs a new `payment_purpose` value (`pickup_collection`) and a new POS V3 endpoint |
| **No `pickup_held_balance_collection` event writer** | `rental_held_balance_events` schema has this event_type but no API/utility writes it yet |
| **Handover item check-off UI not in POS V3** | `AdminBookingHandoverItems` component exists on admin detail page but is not surfaced in POS V3 pickup flow |
| **Pickup payment duplicate prevention** | `checkout_paid_amount`/`checkout_total_amount` fields exist but are legacy (POS V2). POS V3 needs a clean pickup collection guard (similar to booking deposit `idx_pos_rental_payment_attempts_one_paid_deposit`) |
| **Booking Deposit applied to pickup security deposit** | `rental_booking_payment_lines.applied_to_deposit_at` column exists but nothing writes it during pickup |

### 3B. Return Gaps

| Gap | Detail |
|---|---|
| **No POS V3 return UI** | Return endpoint exists (`/api/admin/rental-bookings/[id]/return`) but POS V3 has no return intake container |
| **Return handover item check-off** | `rental_booking_handover_items.return_status` enum exists but no POS V3 flow to mark items as `returned_complete`/`missing`/`damaged` |
| **Damage / late fee input** | `rental_booking_payment_lines` supports `damage_fee`/`late_fee` types but there is no POS V3 endpoint to insert these lines (would need a new PATCH or line-create endpoint) |
| **Return signature in POS V3** | Return endpoint accepts `signatureDataUrl` but no POS V3 signature canvas |

### 3C. Settlement Gaps

| Gap | Detail |
|---|---|
| **No settlement finalization endpoint in POS V3** | `buildRentalSettlementPreview` computes refund/extra amounts but no API applies the settlement decision (refund decision, `settlement_application` held-balance event) |
| **`settlement_application` event writer** | `rental_held_balance_events.event_type = settlement_application` is defined but no writer exists |
| **`deposit_refund_status` transition logic** | Return endpoint writes `deposit_refund_status` but POS V3 has no UI to walk staff through the refund decision flow |
| **`rental_booking_payment_lines.forfeited_at` / `refunded_at`** | Columns exist (migration 075) but nothing writes them during settlement |

### 3D. Refund Gaps

| Gap | Detail |
|---|---|
| **Refund proof upload in POS V3** | `rental_booking_deposit_proofs` exists with `proof_kind = refund`, and the upload endpoint exists (`deposit-proof.post.ts`), but POS V3 has no refund proof upload UI |
| **Refund method capture** | No dedicated refund_method field on `rental_bookings`; currently derived from `deposit_payment_method` |
| **`refund` held-balance event writer** | `rental_held_balance_events.event_type = refund` defined but no writer |

### 3E. Operational Documents Gaps

| Gap | Detail |
|---|---|
| **No DNA (Delivery & Acceptance Note) document number** | Print page (`/admin/rental-bookings/[id]/print?type=pickup`) exists and works, but does not issue an official document number (DNA- prefix). Currently just a best-effort HTML form |
| **No RTN (Return Receiving Note) document number** | Same — return print form exists but no official number issuance |
| **`pos_document_issuance_tasks` only covers BDC** | The issuance task pattern is not yet extended to pickup/return operational forms |
| **No POS V3 print trigger** | POS V3 has no post-pickup "Print pickup form" CTA |

### 3F. Reprint / History Gaps

| Gap | Detail |
|---|---|
| **Reprint from POS V3** | Admin booking detail page has print links; reprint from POS V3 context is not yet wired |
| **No print audit event for operational forms** | `app/pages/admin/documents/[id]/print.vue` has `recordAndPrint` for official documents; the operational pickup/return form at `app/pages/admin/rental-bookings/[id]/print.vue` has no similar audit event |

### 3G. Staff / Admin Audit Trail Gaps

| Gap | Detail |
|---|---|
| **`pickup_held_balance_collection` not linked to BDC-style document task** | Booking deposit has `pos_document_issuance_tasks`; pickup money collection has no equivalent durable task |
| **Settlement decision not audit-logged** | No `rental_booking_deposit_action_logs` entry for settlement application (only `return_refund` action exists) |

---

## 4. Recommended Implementation Phases

### Phase 2E-B1: Pickup Foundation in POS V3

**Scope (foundation-first, no new money collection):**
- Wire existing `buildRentalPickupReadiness` into POS V3 booking context with clear CTA
- Surface `AdminBookingHandoverItems` inside POS V3 pickup view (reuse existing component)
- Add signature canvas component to POS V3 pickup flow
- Wire existing `/api/admin/rental-bookings/[id]/pickup` endpoint from POS V3 (no new API)
- Show post-pickup state + "Print Pickup Form" link to existing print page
- No new money collection — only bookings where `pickupDue.totalPickupDueAmount === 0` proceed; blocked otherwise

**Reuses:** `completeRentalBookingFulfillment`, `buildRentalPickupReadiness`, `AdminBookingHandoverItems`, A5 print page
**New:** POS V3 pickup container component, signature canvas component, pickup CTA wiring

---

### Phase 2E-B2: Pickup Money Collection in POS V3

**Scope:**
- Extend `pos_rental_payment_attempts.payment_purpose` to allow `pickup_collection`
  (migration: add `pickup_collection` to the CHECK constraint)
- New POS V3 endpoint: `POST /api/admin/pos-v3/rental-bookings/[bookingId]/pickup-payments`
- Write `pickup_held_balance_collection` event to `rental_held_balance_events`
- Write `booking_deposit_applied_to_deposit_at` on the booking_deposit payment line
- Prevent duplicate: unique index similar to `idx_pos_rental_payment_attempts_one_paid_deposit`
- Support cash only first; PromptPay QR in follow-up
- Guard: if `booking_deposit_payment_status = paid`, reduce `remainingSecurityDepositDueAtPickup` before charging

**Must NOT:**
- Re-collect Booking Deposit money already captured
- Mix rental fee with refundable deposit in a single collection call
- Allow pickup-complete before full pickup collection

---

### Phase 2E-B3: Pickup Operational Document (DNA)

**Scope:**
- Upgrade print page to also write a `pos_document_issuance_tasks` row of type `rental_pickup_form` (or `delivery_acceptance_note`)
- Assign document number with prefix `DNA-YYYYMM-NNNN` via existing `f_next_document_number()`
- Print page already works (A5, signature, checklist, money lines) — only document number issuance is new
- No tax invoice, no ABB

**Reuses:** existing `app/pages/admin/rental-bookings/[id]/print.vue`, `OfficialDocumentHeader`, `pos_document_issuance_tasks` pattern

---

### Phase 2E-B4: Return Intake in POS V3

**Scope:**
- New POS V3 return container component in POS V3 shell (shown when booking is `picked_up`)
- Surface return handover item check-off (reuse `AdminBookingHandoverItems`, mark `return_status`)
- Damage/late fee input: new endpoint `POST /api/admin/pos-v3/rental-bookings/[bookingId]/return-deductions` that inserts `rental_booking_payment_lines` rows with `line_type = damage_fee` or `late_fee`
- Signature capture
- Wire existing `/api/admin/rental-bookings/[id]/return` endpoint

**Reuses:** return endpoint, handover items, money summary, signature upload
**New:** return container, deduction input, damage fee payment line writer

---

### Phase 2E-B5: Settlement / Refund Decision in POS V3

**Scope:**
- Settlement preview panel using existing `buildRentalSettlementPreview`
- Staff selects refund decision: full refund / partial (after deductions) / no refund (forfeit)
- New endpoint: `POST /api/admin/pos-v3/rental-bookings/[bookingId]/settle` writes:
  - `settlement_application` held-balance event to `rental_held_balance_events`
  - Updates `rental_booking_payment_lines.forfeited_at` / `refunded_at`
  - Updates `deposit_refund_status`, `deposit_refund_amount`, `deposit_refunded_at`
- Refund proof upload: reuse existing `deposit-proof.post.ts` endpoint
- Guard: settlement cannot run before return is complete (`status = returned`)

**Must NOT:**
- Allow settlement before return fulfillment is recorded
- Allow settlement to be re-run after a `settlement_application` event already exists (idempotency guard)

---

### Phase 2E-B6: Return Operational Document (RTN)

**Scope:**
- Issue return receiving note with document number prefix `RTN-YYYYMM-NNNN`
- `pos_document_issuance_tasks` row of type `rental_return_form` (or `return_receiving_note`)
- Print page already works (return form with deductions, refund, signature)
- No credit note, no tax document

**Reuses:** existing return print page, `OfficialDocumentHeader`, issuance task pattern

---

## 5. Money / Accounting Guardrails

These rules are LOCKED and must be preserved in all Phase 2E implementations:

1. **Booking Deposit already captured MUST reduce remaining refundable security deposit at pickup.**
   - `RentalMoneySummary.refundableSecurityDeposit.remainingDueAtPickupAmount` already computes this correctly.
   - Pickup collection must read `remainingDueAtPickupAmount`, not `deposit_amount`.

2. **Do NOT collect Booking Deposit again at pickup.**
   - If `booking_deposit_payment_status = paid`, Booking Deposit amount is already held.
   - Pickup collection must only collect `remaining_security_deposit_due + rental_fee_outstanding`.

3. **Rental fee is revenue-side money. It must be kept separate from refundable deposit.**
   - `rental_booking_payment_lines` already separates these via `line_type` and `tax_category`.
   - Do not merge into a single "pickup payment" amount without explicit line attribution.

4. **Refundable security deposit is NOT revenue.**
   - `is_refundable = TRUE`, `tax_category = refundable_security_deposit`, `wht_applicable = FALSE`.
   - No VAT, no WHT on security deposit movements.

5. **Damage/late fee deduction is a separate settlement outcome.**
   - Must use `line_type = damage_fee` / `late_fee` with explicit `tax_category`.
   - Tax treatment of damage/late fee income requires accountant review before production use.

6. **Tax invoice / ABB / official receipt remain out of scope for Phase 2E.**
   - Pickup and return documents are operational forms only (DNA / RTN series).
   - Fiscal VAT document issuance requires a separate fiscal phase.

7. **Document failure must NOT roll back completed payment or operational status.**
   - Follow the same `pos_document_issuance_tasks` best-effort pattern as BDC.
   - Payment confirmation and pickup/return status are authoritative; document is advisory.

8. **`paid_confirm_failed` Booking Deposit must not be re-collected.**
   - This invariant from Phase 2D is preserved in all pickup flows.
   - `booking_deposit_payment_status = paid_confirm_failed` means money may already be captured;
     must escalate to ops, not re-charge.

---

## 6. UX / Admin Workflow Recommendation

Recommended POS V3 operational workflow for staff:

```
1. SCAN / SEARCH
   └─ Staff scans booking QR, asset QR, or types booking ID / customer ID
   └─ Resolver resolves booking or customer pending work list

2. REVIEW BOOKING STATUS
   └─ BookingContext shows: asset, customer, dates, status badge
   └─ For status = confirmed: show pickup readiness panel (green/amber/red)
   └─ Blockers: KYC not verified, missing branch, missing walk-in ID evidence

3. VERIFY CUSTOMER / KYC
   └─ If KYC blocker: show KYC status, deep-link to admin customer page
   └─ Walk-in: confirm ID evidence uploaded

4. PREPARE HANDOVER CHECKLIST
   └─ Show handover items (existing AdminBookingHandoverItems component)
   └─ Staff checks off items for pickup; generate from asset if empty

5. COLLECT REMAINING PAYMENT (Phase 2E-B2)
   └─ Show money summary: Booking Deposit applied, remaining security deposit, rental fee
   └─ Collect only remainingDueAtPickupAmount
   └─ Cash collection first; PromptPay QR later
   └─ Guard: do not allow over-collection or re-collection

6. CAPTURE SIGNATURE
   └─ Customer signs on tablet (signature canvas)
   └─ Staff confirms

7. COMPLETE PICKUP
   └─ POST /api/admin/rental-bookings/[id]/pickup
   └─ Booking transitions: confirmed → picked_up
   └─ Write pickup_held_balance_collection event (Phase 2E-B2)

8. PRINT PICKUP FORM
   └─ Open existing print page (type=pickup)
   └─ Issue DNA document number (Phase 2E-B3)
   └─ Print A5 original + copy

--- LATER: RETURN DAY ---

9. RETURN INTAKE (Phase 2E-B4)
   └─ Scan / search booking; status = picked_up → show return section
   └─ Staff checks return items (return_status per item)
   └─ Enter damage/late fees if applicable

10. CAPTURE RETURN SIGNATURE
    └─ Customer signs on tablet
    └─ Staff confirms

11. COMPLETE RETURN
    └─ POST /api/admin/rental-bookings/[id]/return
    └─ Booking transitions: picked_up → returned

12. SETTLEMENT DECISION (Phase 2E-B5)
    └─ Show settlement preview (held deposit, deductions, refund due)
    └─ Staff selects: full refund / partial / forfeit
    └─ If refund: upload proof, enter refund reference
    └─ POST /settle endpoint

13. PRINT RETURN FORM
    └─ Open print page (type=return) with settlement summary
    └─ Issue RTN document number (Phase 2E-B6)
    └─ Print A5

--- LATER: REPRINT / HISTORY ---

14. REPRINT
    └─ Admin booking detail page → print links → existing print page
    └─ POS V3 pending-work history: deep-link to booking detail
```

---

## 7. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| **Duplicate pickup collection** | 🔴 Critical | Unique index on `pos_rental_payment_attempts(rental_booking_id, payment_purpose)` WHERE status = 'paid'. Check `pickup_held_balance_collection` event before allowing POS to collect again. |
| **Re-collecting Booking Deposit at pickup** | 🔴 Critical | `buildRentalMoneySummary.pickupDue.totalPickupDueAmount` already deducts BD. POS V3 pickup collection must always read from `remainingDueAtPickupAmount`, never from `deposit_amount`. |
| **Mixing rental fee with refundable deposit in one line** | 🔴 Critical | Separate `rental_fee` and `refundable_security_deposit` payment lines are required. No single-line "pickup total" allowed. |
| **Allowing pickup before payment** | 🟠 High | `pickup-complete.post.ts` (POS V2) has `requirePaidPickupDeposit` flag. POS V3 pickup completion must check `pickupDue.totalPickupDueAmount === 0` before calling the pickup endpoint. |
| **Allowing return settlement before pickup complete** | 🟠 High | Return endpoint already guards `expectedStatus = picked_up`. Settlement endpoint must also verify `status = returned`. |
| **Document issued for wrong state** | 🟠 High | Print form endpoint returns payload regardless of status. Document issuance task should only create if `status IN (picked_up, returned)` for respective form type. |
| **Staff edits handover items after pickup** | 🟡 Medium | `isHandoverEditableStatus` returns false for `picked_up`, `returned`, `cancelled`. This is enforced server-side. |
| **`paid_confirm_failed` Booking Deposit re-collection at pickup** | 🔴 Critical | Pickup collection guard must check `booking_deposit_payment_status`. If `paid_confirm_failed`, block and escalate — do not charge the security deposit shortfall as if no BD was ever collected. |
| **Settlement run before return fulfillment** | 🔴 Critical | Settlement endpoint must verify `returned_at IS NOT NULL` and `status = returned`. |
| **Schema mismatch: `checkout_total_amount`/`checkout_paid_amount` vs POS V3 model** | 🟡 Medium | These are legacy POS V2 fields. POS V3 pickup collection should use `pos_rental_payment_attempts` with `pickup_collection` purpose, not write `checkout_paid_amount`. Read `buildRentalMoneySummary` for the authoritative remaining amount. |
| **No deduplication on damage fee payment lines** | 🟡 Medium | `rental_booking_payment_lines` has a unique index on `(booking_id, line_type, source)` WHERE `status = active`. Damage fee writes must use a deterministic source key to prevent duplicates. |
| **Refund proof required before completing refund settlement** | 🟡 Medium | `assertRefundProof` already exists in `rental-fulfillment.ts` for the return endpoint. Settlement endpoint must apply similar logic for the settle step. |

---

## 8. Recommended Next Implementation Prompt

**Phase 2E-B1: POS V3 Pickup Foundation (no new money collection)**

This is the smallest safe first step because:
- All required server APIs already exist (`pickup`, `pickup-readiness`, `handover-items`)
- No new schema migration needed
- No new money collection logic (avoid financial risk on first step)
- Existing utilities (`completeRentalBookingFulfillment`, `buildRentalPickupReadiness`) are well-tested
- Only new work is: POS V3 pickup container component, signature canvas component, and wiring

**Exact scope for 2E-B1:**
1. New Vue component: `AdminPosV3PickupContainer` — shown in POS V3 when `bookingContext.status === 'confirmed'` and no draft payment is pending
2. Inside the container: handover item checklist (reuse `AdminBookingHandoverItems`), signature canvas, confirm button
3. On confirm: POST to existing `/api/admin/rental-bookings/[bookingId]/pickup`
4. Guard: if `moneySummary.pickupDue.totalPickupDueAmount > 0`, show "Payment required before pickup" blocker; no CTA
5. Post-pickup: show "Pickup complete" state + link to existing print page (`/admin/rental-bookings/[id]/print?type=pickup`)
6. Smoke-testable: add a test that the pickup container is rendered for `status = confirmed` and blocked for `status = draft`

**Why this ordering:**
- Validates the end-to-end POS V3 pickup UX before adding financial complexity
- Defers money collection to 2E-B2, keeping the first step structurally safe
- Reuses the most mature utilities in the repo
- Any test failures will reveal wiring gaps before fiscal logic is introduced

---

## Appendix: File Map

| Area | Key Files |
|---|---|
| POS V3 shell | `app/pages/admin/pos-v3/index.vue` |
| POS V2 pickup | `server/api/admin/pos-v2/rental-bookings/[id]/pickup-complete.post.ts`, `pickup-readiness.get.ts` |
| Pickup/return endpoints | `server/api/admin/rental-bookings/[id]/pickup.post.ts`, `return.post.ts` |
| Money summary | `server/utils/rental-money-summary.ts` |
| Pickup readiness | `server/utils/rental-pickup-readiness.ts` |
| Fulfillment utility | `server/utils/rental-fulfillment.ts` |
| Handover items API | `server/api/admin/rental-bookings/[id]/handover-items/` |
| Handover items utility | `server/utils/admin-booking-handover-items.ts` |
| Handover items UI | `app/components/admin/AdminBookingHandoverItems.vue` |
| Print form API | `server/api/admin/rental-bookings/[id]/print-form.get.ts` |
| Print form utility | `server/utils/admin-rental-print-form.ts`, `admin-rental-print-form-loader.ts` |
| Print page | `app/pages/admin/rental-bookings/[id]/print.vue` |
| A5 CSS standard | Inline in print.vue and `docs/printing-document-standard.md` |
| Held balance events | `server/utils/rental-held-balance-events.ts` (migration 086) |
| POS payment attempts | `supabase/migrations/087_pos_rental_payment_attempts.sql` |
| Payment lines | `supabase/migrations/074_rental_booking_payment_lines.sql`, `075_rental_booking_booking_deposit_lines.sql` |
| Handover items schema | `supabase/migrations/080_rental_booking_handover_items.sql` |
| Fulfillment schema | `supabase/migrations/073_rental_fulfillment_audit_hardening.sql` |
| Booking deposit schema | `supabase/migrations/057_admin_pos_booking_deposits.sql` |
| Booking types | `app/types/rental-booking.ts`, `app/types/admin-order-detail.ts` |
| Document standard | `docs/printing-document-standard.md` |
| Phase 2D acceptance | `docs/phase-2d-booking-deposit-acceptance-checklist.md` |
