# HOPNIC POS V3 Master Blueprint v0.1

**Document Type:** Unified POS / Rental / Retail / Customer Operations Blueprint
**Status:** Draft with Decisions 1–6B locked for POS V3 semantic planning
**Purpose:** Consolidate the latest POS V3 operating model, rental/retail financial treatment, document flows, customer identity rules, and implementation sequencing into one master source of truth.

> This file is now the POS V3 master blueprint draft. Decisions 1–6B and the POS V3 Rental Status + Money Semantic Contract are locked for future implementation planning. The detailed 18 May policy notes below remain source detail, but this locked blueprint section overrides any conflicting older source note.

---

## 0. Current implementation sync

- POS V3 Phase 1 exists at `/admin/pos-v3` as an operational entry shell.
- Supported resolver payloads are `booking:<bookingId>` and `customer:<userId>`.
- Booking resolution opens Booking Context.
- User resolution opens User Pending Work: pickup orders + operational rental bookings.
- User Pending Work shows about 4 visible rows, scrolls internally, and sorts earliest pickup-relevant work first.
- Booking pending work uses `startDate`; pickup order queue rows currently expose no true pickup date, so `createdAt` is the deterministic fallback.
- POS V3 Phase 1 intentionally does **not** implement checkout, pickup/return completion, KYC registration, fiscal documents, register/shift, WHT automation, or backend aggregator scope.
- Decision 1 is locked: `confirmed` bookings must be payment-backed; `confirmed + unpaid` is not an approved future state.
- Decision 2 is locked: rental operations use Deposit-Based Settlement / Model B; Pickup money is deposit/advance holding, while Return Settlement is the rental revenue/tax/document point.
- Decision 3 is locked: POS V3/admin-assisted flows require strict Retail/Rental payment separation; Website Mixed Checkout may remain only as a UX/payment orchestration layer with strict internal transaction, allocation, document, and accounting separation.
- Decision 4 is locked: WHT is handled only at rental Return Settlement, with WHT base = final rental fee only and Pending WHT hold amount = calculated WHT amount.
- Decision 5 is locked: POS V3 is the canonical POS direction going forward; POS V2 is legacy/reference only and must not receive broad new core POS expansion.
- Decision 6A is locked: POS V3 rental money truth requires a dedicated rental held-balance event model; generic `payment_allocations` is not the canonical held-balance lifecycle source.
- Decision 6B is locked: Booking Deposit must never exceed the required refundable security deposit amount: `booking_deposit_due_now = min(policy_calculated_booking_deposit, required_security_deposit_amount)`.
- Phase 2D is closed for POS V3 Future Booking Deposit: draft creation, Cash/PromptPay QR Booking Deposit collection, payment-backed confirmation, BDC issuance/printing, active QR recovery, QR replacement safety, late-payment recovery, Booking Detail resume CTA, POS `bookingId` re-entry, and `paid_confirm_failed` double-collection guard are accepted. The closure checklist is `docs/phase-2d-booking-deposit-acceptance-checklist.md`.

## 0.1 Reconciliation gates before deeper POS V3 implementation

Decision 1, Booking Status vs Payment Timing; Decision 2, Rental Money Model / Pickup vs Return / Tax Point; Decision 3, Mixed Checkout / Retail-Rental Separation; Decision 4, WHT Operational Model at Return Settlement; Decision 5, POS V3 Canonical Direction / POS V2 Reuse Policy; Decision 6A, Dedicated Rental Held Balance Event Model; Decision 6B, Booking Deposit Cap; and the POS V3 Rental Status + Money Semantic Contract are now approved and moved to the locked baseline below.

No Decision 1–6B policy gate remains unresolved in this blueprint. The Reuse / Refactor Impact Audit and the semantic contract design audit have completed. The next required project step is a smallest-safe POS V3 semantic foundation implementation phase, not POS V2 expansion and not UI-first rental money work.

## 0.2 Locked decisions

### Decision 1 — Booking Status vs Payment Timing

Approved baseline:

- `confirmed` must be payment-backed. A booking must not become `confirmed` if no required booking-time payment has occurred.
- Online Future Booking: customer pays Booking Deposit during booking flow; after successful Booking Deposit payment, booking status becomes `confirmed`; pickup happens later and follows the remaining pickup payment flow.
- POS Future Booking: staff creates the booking for the customer in POS, customer pays Booking Deposit at POS during booking creation, and only after Booking Deposit payment succeeds does booking status become `confirmed`; the booking then returns to Booking Management and waits for its pickup date.
- POS Same-Day Instant Rental: if the customer receives the item immediately on the same day, do not create an unpaid confirmed booking. Treat it as an Instant Rental flow: staff selects asset + rental period, system validates availability using POS walk-in rules, customer pays the full required same-day pickup amount in one operational flow, the flow proceeds directly into pickup completion, and final state after successful handover is `picked_up`.
- Do not use `confirmed + unpaid` as an approved future state. Previously implemented POS V2 future-booking behavior that created confirmed unpaid bookings is non-final and subject to later refactor after blueprint reconciliation work.

### Decision 2 — Rental Money Model / Pickup vs Return / Tax Point

Approved baseline: use Deposit-Based Settlement / Model B.

- Booking Deposit collected during Online Future Booking or POS Future Booking is treated as deposit / advance holding balance. It is not rental revenue at booking time and remains part of the amount held by HOPNIC pending final return settlement.
- At Pickup, any additional amount collected from the customer is also treated as deposit / advance holding balance. Even if the operational amount is calculated using expected rental pricing and refundable security requirements, Pickup money is held in advance, is not final rental revenue, is not the tax point, does not issue a rental tax invoice, and does not trigger WHT handling.
- Pickup may issue deposit receipt / ordinary receipt for money held if the document architecture allows it, plus pickup / handover operational documents and checklist/signature documents.
- Pickup must not issue a rental tax invoice, abbreviated tax invoice for rental revenue, or WHT treatment documents.
- Return is the canonical financial settlement point for rental operations. Return Settlement calculates actual rental charge, duration changes/extensions, late fees, damage/penalty charges, refundable amount or extra amount due, recognizes rental revenue according to the final settlement, issues rental tax documents according to approved document policy, and applies WHT workflow if the customer is eligible and selects WHT treatment.
- Existing POS V2 / Phase 2A / Phase 4B1 pickup money semantics must be re-audited later against approved Model B. Pickup readiness, fulfillment, and signature architecture may remain reusable, but pickup payment labels, money classification, and downstream accounting/document semantics may require refactor.

### Decision 3 — Mixed Checkout / Retail-Rental Separation

Approved final baseline:

- POS V3 and staff/admin-assisted flows require strict payment separation between Retail and Rental. Retail sale transactions and rental-related transactions must not be combined into one checkout session, one payment overlay, one QR payment, one card/gateway charge, one payment record, one document issuance chain, or one accounting/export transaction.
- At the counter, a customer who rents an item and buys retail goods must complete a Rental payment flow and a Retail sale payment flow separately.
- POS V3 UI must preserve this separation: Retail checkout overlays must not collect rental-related money; Booking / Pickup / Return payment overlays must not collect retail-sale money; Retail documents and Rental documents must remain separate.
- Website Mixed Checkout may remain as a customer-facing UX/payment orchestration layer only. It must not collapse Retail and Rental into one business transaction.
- Website Mixed Checkout must maintain separate logical transactions, explicit payment allocations, separate document chains, and separate accounting/export classification for Retail Order and Rental Booking Deposit obligations.
- Website Mixed Checkout may use a single payment attempt only if allocation remains explicit, such as Payment Attempt X containing a Retail allocation and a Rental Booking Deposit allocation. The total must never be treated as one undifferentiated amount.
- Website Mixed Checkout must prevalidate retail items, rental Booking Deposit obligations, booking ownership/access, availability, address state, booking state, and cart state before payment. If validation fails, block payment, surface specific causes, and do not create an unsafe partial transaction.
- If payment succeeds but downstream confirmation fails, Website Mixed Checkout requires explicit reconciliation / admin recovery policy. This remains implementation-sensitive and must preserve the earlier safety work.
- Existing Website Mixed Checkout work is not deprecated outright. It remains conditionally aligned if it follows the separation guarantees above and remains subject to future audit before additional implementation or rollout.

Channel policy summary:

| Channel             | Retail + Rental payment combined? | Approved policy                                                                     |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| POS V3              | No                                | Must remain separate.                                                               |
| Admin-assisted flow | No                                | Must remain separate.                                                               |
| Website             | Yes, UX layer only                | Backend transactions, allocations, documents, and accounting must remain separated. |

### Decision 4 — WHT Operational Model at Return Settlement

Approved baseline:

- WHT is handled only in the rental Return Settlement flow.
- WHT must not be applied at Booking Deposit payment, POS Future Booking payment, Pickup holding/deposit payment, Retail sale payment, or Pickup operational documents.
- WHT base = final rental fee only.
- WHT base includes final rental fee only.
- WHT base excludes late penalty, damage charge, contractual penalty/damages, refundable deposit, deposit refund amount, and any non-rental settlement balance.
- Return Settlement UI must contain a WHT toggle. If enabled, the system must verify a valid customer Tax Profile before settlement can proceed with WHT.
- If the Tax Profile is missing, staff must create or complete it before settlement can proceed with WHT. If it exists, display tax profile details clearly and allow staff to edit/update according to future detailed implementation policy.
- Tax Profile should cover at least taxpayer/company name, tax ID, tax address, and headquarters/branch context if supported by the approved document system.
- When WHT is enabled, calculate WHT from the final rental fee only, reduce the net amount HOPNIC is entitled to retain from the held balance, increase the refundable amount due back to the customer by the WHT amount, and update refund/extra due calculations immediately in the settlement preview.
- Conceptual settlement breakdown: Rental Fee Gross, Less WHT, Rental Fee Net Retained, Late Penalty / Damage Charges, Held Deposit Balance, Refund Due or Extra Due.
- If WHT is selected but supporting WHT documentation has not yet been submitted/verified, create a Pending WHT state.
- Pending WHT hold amount must equal the actual calculated WHT amount: `holdAmount = calculatedWhtAmount`.
- Do not use a fixed THB 250 minimum hold and do not use `max(calculatedWhtAmount, 250)`.
- Once the required WHT document is submitted and accepted according to future operational workflow, the Pending WHT hold may be released. The released amount equals the previously calculated WHT amount. WHT document submission/release workflow is later implementation scope, not this blueprint update.

### Decision 5 — POS V3 Canonical Direction / POS V2 Reuse Policy

Approved baseline:

- POS V3 is the canonical POS direction going forward. HOPNIC will continue POS development through POS V3 UI architecture, POS V3 operational flow model, and POS V3 Booking / Retail / KYC mode structure.
- POS V3 is now the target product path for future front-of-house staff workflows.
- POS V2 is no longer the target product direction. Treat POS V2 as legacy / experimental implementation and a reference source where useful, but not the baseline UI or workflow architecture for future POS development.
- Do not continue broad feature expansion on POS V2. Do not design new core POS workflows around the POS V2 page structure.
- POS V2 should remain available temporarily for reference and until POS V3 has sufficiently replaced the relevant operational flows. Deletion/removal of POS V2 must be planned later as a separate cleanup phase and is not part of this blueprint update.
- Existing POS V2 and adjacent backend foundations must not be discarded automatically. Reuse is allowed only when the foundation remains valid under Decisions 1–4.
- Reuse checks must confirm: `confirmed` remains payment-backed; rental money follows Model B; POS/admin Retail and Rental payments stay separated; Website Mixed Checkout remains only a separated UX orchestration layer; WHT appears only at Return Settlement; WHT base is final rental fee only; Pending WHT hold equals the actual calculated WHT amount.

### Decision 6A — Dedicated Rental Held Balance Event Model

Approved baseline:

- Use a dedicated rental-specific held-balance event model as canonical rental money truth under Model B.
- Do not use generic `payment_allocations` as the canonical source for the rental held-balance lifecycle.
- The dedicated model must support event types such as `booking_deposit_collection`, `pickup_held_balance_collection`, `same_day_held_balance_collection`, `settlement_application`, `refund`, and `forfeiture`.
- The model should capture, where applicable: `rental_booking_id`, `event_type`, amount, currency, payment method, branch, staff user, payment/proof/source reference, status, occurred timestamp, idempotency / retry-safe source key, and metadata / audit context.
- Rationale: rental held balance is core financial truth under Model B. Generic `payment_allocations` has broader accounting/payment semantics and can become ambiguous if used as lifecycle truth.
- `payment_allocations` may still be used later as an accounting/export bridge if needed, but not as canonical rental held-balance lifecycle truth.

### Decision 6B — Booking Deposit Cap

Approved baseline:

- Booking Deposit is a component of the refundable security deposit / held-balance lifecycle.
- Booking Deposit must never exceed the required refundable security deposit amount.
- Formula: `booking_deposit_due_now = min(policy_calculated_booking_deposit, required_security_deposit_amount)`.
- If current Booking Deposit policy produces an amount higher than the required security deposit, collect only the required security deposit amount.
- Do not create a Booking Deposit amount that exceeds the total required refundable security deposit for that booking.
- Example: required security deposit = 500, policy-calculated Booking Deposit = 1,000, actual Booking Deposit due = 500.

## 0.3 Approved POS V3 Rental Status + Money Semantic Contract

### 0.3.1 Booking lifecycle / status contract

Use the existing rental booking statuses with these locked meanings:

| Status      | Locked POS V3 meaning                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft`     | Booking intent exists, is not payment-backed, and is used before Booking Deposit payment for future bookings.                                |
| `confirmed` | Payment-backed reservation only. Future bookings become `confirmed` only after Booking Deposit is paid. Must never mean unpaid reservation.  |
| `picked_up` | Physical handover completed and asset is out with the customer. Does not mean revenue recognized, rental tax invoice issued, or WHT applied. |
| `returned`  | Physical return recorded only. Does not itself mean financial settlement is complete.                                                        |
| `cancelled` | Booking cancelled before pickup.                                                                                                             |
| `no_show`   | Payment-backed confirmed booking missed pickup and entered no-show handling.                                                                 |

### 0.3.2 Return Settlement is separate from booking status

- `returned` is physical lifecycle only.
- Financial settlement must be tracked separately through a first-class Return Settlement model/status.
- Return Settlement may later have statuses such as `calculated` / `draft`, `pending_payment`, `pending_refund`, `pending_wht_hold`, `settled`, and `voided` / `reversed`.
- Do not overload `rental_bookings.status` with arrears, pending WHT, or settled meanings.

### 0.3.3 Rental money semantic contract

- **Booking stage:** Booking Deposit is paid for future bookings; it is held balance / deposit-like, not rental revenue, not WHT base, not rental tax point, and part of the refundable security deposit / held balance lifecycle.
- **Same-Day Instant Rental:** same-day flow collects the full required same-day held amount in one operational flow. This money is held balance / deposit-like, not a separate Booking Deposit concept, not revenue, not WHT base, and not a tax point.
- **Pickup stage:** any remaining required pickup collection is held balance / deposit-like. Pickup must not recognize final rental revenue, issue rental tax invoice, apply WHT, or use old `checkout_paid_amount` rental semantics as canonical truth.
- **Expected vs final rental amount:** POS V3 must distinguish expected rental amount used for quote / held balance sizing from final rental fee recognized at Return Settlement.
- **Return Settlement:** Return Settlement is the canonical financial truth and rental tax/document point. It owns held balance available, final rental fee, late penalty, damage charge, WHT on final rental fee only, pending WHT hold, refund due, extra due, settlement status, rental documents, and accounting/export source.

## 0.4 Current field semantic guidance

### 0.4.1 Keep with locked or restricted meaning

- `status`: booking/physical lifecycle only using the locked meanings above.
- `rental_total`: quote / expected rental amount snapshot only; not recognized revenue.
- `deposit_amount`: required refundable security deposit / held-balance requirement snapshot.
- `booking_deposit_payment_status`: future Booking Deposit payment state only.
- `booking_deposit_paid_amount`: amount of future Booking Deposit paid only.
- `booking_deposit_paid_at`: timestamp for future Booking Deposit paid state.
- Booking Deposit attempt/allocation reference fields: source references for future Booking Deposit payment evidence.
- POS branch/staff context fields: operational context only.
- `pickup_at`, `returned_at`, pickup branch fields, and return branch fields: operational physical lifecycle evidence.

### 0.4.2 Deprecated for POS V3 canonical rental money truth

The following fields may remain as legacy / compatibility mirrors where needed, but POS V3 rental financial truth must not rely on them canonically:

- `deposit_paid_amount`
- `deposit_payment_status`
- `deposit_payment_method`
- `deposit_paid_at`
- `deposit_refund_status`
- `deposit_refund_amount`
- `checkout_total_amount`
- `checkout_paid_amount`
- `checkout_payment_method`

### 0.4.3 Payment lines

- `rental_booking_payment_lines` may remain as quote/reference snapshots where useful.
- Pre-return WHT behavior must be removed or restricted in a future refactor.
- Final settlement lines belong under Return Settlement, not under pre-return payment-line semantics.

## 0.5 Required entity / architecture directions

- A first-class Return Settlement entity is required before implementing rental Return Settlement.
- A dedicated rental held-balance event model is required and is canonical under Decision 6A.
- POS Future Booking needs a Booking Deposit collection event source.
- POS Same-Day Instant Rental needs a same-day held-balance collection event source.
- Final accounting/export truth for rentals must originate from Return Settlement, not Pickup.

---

## 1. Why this blueprint exists

HOPNIC has accumulated several working foundations and design decisions across rental booking, Booking Deposit, no-show forfeiture, POS V2, POS V3 Phase 1, and newer full-store POS/rental/retail/document/WHT policy discussions.

This document consolidates the latest target direction into one blueprint and explicitly marks where older implementation decisions must be reconciled before deeper POS V3 implementation continues.

## 2. Design principles

- **Operational-first UI:** design screens from real staff workflows, not isolated feature panels.
- **Dependency-first implementation:** business rule truth → backend/data contract → operational shell → action workflow → documents/tax/ERP extensions.
- **Smoke-testable delivery:** every phase must end in a concrete manual smoke-test flow.
- **Reuse before rewrite:** reuse valid foundations; refactor only where the target business model materially changed.
- **Money-sensitive governance:** payment, deposit, tax, document issuance, WHT, return settlement, and arrears require phase gates and validation.

## 3. Current reusable foundations already built

The items below are candidate reusable foundations only. Under Decision 5, no POS V2 or adjacent foundation should be assumed product-correct unless it remains valid under Decisions 1–6B and the locked POS V3 Rental Status + Money Semantic Contract.

### 3.1 Backend foundations

- Booking Deposit governance and no-show forfeiture event chain.
- Financial recognition events for forfeited Booking Deposit.
- Ordinary receipt + notice architecture for no-show forfeiture.
- Rental Money Summary and Rental Settlement Preview utilities.
- Pickup Readiness and Pickup Completion foundations.
- Rental fulfillment/checklist/signature validation utility.
- Existing branch/staff POS context fields in rental flows.
- Future POS V3 rental money truth requires a new dedicated rental held-balance event model and a first-class Return Settlement entity before money-sensitive implementation proceeds.

### 3.2 APIs/modules

- Booking detail API.
- Pickup readiness API.
- Pickup completion backend service.
- Customer lookup API.
- Pickup order queue API.
- Order detail API.
- Existing scanner parser component.

### 3.3 UI concepts

- Scanner component.
- Status badges / alert patterns.
- Signature pad component.
- Existing admin layout/nav shell.

### 3.4 POS V2 / existing foundation reuse classification

#### A. Likely safe to reuse

- Auth / staff authorization patterns.
- Branch access patterns.
- QR scanner/parser foundations.
- Customer lookup.
- Order detail loader.
- Booking detail loader.
- Generic UI status/error/loading patterns.
- Checklist/signature validation concepts where not tied to outdated money semantics.

#### B. Reuse only after semantic refactor

These may be structurally useful but cannot be assumed semantically correct until reconciled with Decisions 1–6B and the locked semantic contract:

- Rental Money Summary, because POS V3 must distinguish expected rental amount / held balance sizing from final rental fee recognized at Return Settlement.
- Rental Settlement Preview, because final settlement lines and settlement statuses belong under a first-class Return Settlement model.
- Pickup Readiness, because pickup money must be held balance only and must not rely on old `checkout_paid_amount` rental semantics.
- Pickup Completion backend orchestration, because structural fulfillment ideas may be useful but POS V2 pickup money writes are not canonical.
- Payment blocker/warning logic.
- Payment partial-failure handling.

#### C. Do not use as the new baseline

These must not define future POS V3 direction:

- POS V2 page composition.
- POS V2 panel-heavy UI structure.
- POS V2 future booking behavior that creates confirmed unpaid bookings.
- POS V2 pickup UI/workflow as a direct product baseline.
- Any flow that conflicts with Decisions 1–6B or the POS V3 operating model.

### 3.5 Phase 4B1 / 4B2 handling

Previously implemented POS V2 Phase 4B1 / 4B2 work is not automatically deleted, but it is no longer the canonical product path.

- Phase 4B1 backend orchestration may contain reusable structural ideas, but its money semantics must be refactored against approved Model B, payment-backed `confirmed` status rules, Decision 6A held-balance events, and Decision 6B Booking Deposit cap rules.
- Phase 4B2 UI must not be ported blindly into POS V3 because POS V3 uses a different operational information architecture.

## 4. POS V3 target information architecture

POS V3 is now the canonical POS product direction for future front-of-house staff workflows. POS V2 remains legacy/reference only until POS V3 sufficiently replaces relevant operational flows.

### 4.1 Top-level modes

1. **ขายขาด** — walk-in retail sales, payment, and document issuance.
2. **Booking** — rental booking management, pickup, return, order pickup, payment, and rental documents.
3. **KYC** — user/customer registration, verification, and walk-in/customer identity capture.

### 4.2 Global action binding

All staff actions must bind at minimum `branch_id` and `staff_user_id`. Register, terminal, and shift session may be added later.

### 4.3 POS V3 entry shell

The shell supports a mode selector, QR/manual resolver, and context-driven sections rather than always-visible feature walls.

### 4.4 QR resolver behavior

Supported operational QR formats are `booking:<bookingId>` and `customer:<userId>`. Booking results load Booking Context; user results load incomplete work for that user; unsupported payloads show a clear unsupported message.

### 4.5 User pending work list

When user context is resolved, show combined unfinished pickup orders and operational rental bookings. Visible quota is 4 rows with internal scroll. Sort by pickup-relevant date where possible. Booking rows open Booking Context; order rows open Order Context.

## 5. Retail Sale target flow

- Product selection: scanner button plus autocomplete search by SKU/code/product name.
- Results: product thumbnail, stable layout, up to 3 visible rows with internal scroll.
- Cart: item, quantity, unit price, subtotal, minimum 5 visible rows, can grow downward.
- Checkout overlay: cash and QR payment; QR uses Omise/Opn QR, success listener, error state, slip photo fallback, and cancel payment session.
- POS V3 Retail checkout overlay collects retail-sale money only. It must not collect rental Booking Deposit, pickup, return, settlement, damage, late-fee, or other rental-related money.
- Cart state persists until completed or explicitly cancelled.

## 6. Document target flow

- After retail payment, payment payload + sale items flow to document screen.
- Abbreviated tax invoice / receipt is generated immediately.
- UI offers View/Print and Convert to Full Tax Invoice.
- Full tax invoice conversion may use phone/tax ID lookup, user/customer QR scan, or KYC/customer setup before returning to document flow.
- Direct document management defaults to today, supports filters for all/receipts/tax invoices/WHT, document ID search, date filters, Super Admin void where allowed, and pending WHT upload actions.
- Retail document chains and Rental document chains must remain separate. No POS/admin document flow may merge retail sale items with rental deposit, pickup, return, settlement, damage, or late-fee obligations into one mixed tax/document artifact.
- Website Mixed Checkout, if retained, must still generate separate document logic: Retail sale documents follow Retail tax/document rules; Rental Booking Deposit proofs/documents follow Rental deposit rules.
- WHT documents and WHT evidence handling belong to rental Return Settlement only. They must not be generated from Booking Deposit, Pickup holding/deposit payment, Retail sale payment, or Pickup operational documents.

## 7. Booking Management target flow

- Sub-navigation: Walk-in, Online Book, Order Pickup, plus **+ Create Booking**.
- Search/scanner: QR scanner plus search by reserver name/phone.
- Pickup-date navigator: previous day, today, next day, prominent selected date, strong Today visual emphasis.
- Default booking list shows bookings for the selected pickup date when no scan/search payload exists.
- Rows show thumbnail, customer/recipient/phone/item, and action buttons for Pickup, Return, Cancel, or No-show depending on origin/status.
- POS Future Booking rows may enter this list only after Booking Deposit payment succeeded and the booking is `confirmed`.
- Same-day receive-now work is not an unpaid future booking; it is an Instant Rental flow that proceeds through same-day payment and directly into pickup completion.
- Booking Management must use `draft`, `confirmed`, `picked_up`, `returned`, `cancelled`, and `no_show` only with the locked meanings in section 0.3. It must not treat `returned` as settled or add arrears / pending WHT / settled meanings to `rental_bookings.status`.

## 8. Walk-in Booking target flow

- Dedicated creation page with back-to-booking-management.
- Asset search autocomplete.
- Calendar/availability follows customer booking UX where appropriate.
- POS walk-in policy: Buffer Day = 0, obey branch/store holidays if applicable, block overlaps, obey min/max duration.
- POS Future Booking requires Booking Deposit payment during creation; only successful Booking Deposit payment can create/transition the booking to `confirmed`, then return it to Booking Management.
- POS Future Booking Booking Deposit must use the Decision 6B cap: `booking_deposit_due_now = min(policy_calculated_booking_deposit, required_security_deposit_amount)`.
- POS Future Booking payment must create a canonical Booking Deposit collection event source in the dedicated rental held-balance event model.
- POS Same-Day Instant Rental must not create `confirmed + unpaid`; it validates availability, collects the full required same-day pickup amount, proceeds directly into pickup completion, and ends as `picked_up` after successful handover.
- POS Same-Day Instant Rental collection is same-day held balance / deposit-like money, not a separate Booking Deposit concept, not revenue, not WHT base, and not a tax point. It must create a canonical same-day held-balance collection event source.
- Booking payment overlays in POS/admin flows collect rental-related money only and must not collect retail-sale money.

## 9. Pickup target flow

- Receives booking payload from Booking Management.
- Standard pickup bookings are already payment-backed according to booking type: Online Future Booking has paid Booking Deposit; POS Future Booking has paid Booking Deposit.
- Same-Day Instant Rental enters pickup directly only after the full required same-day payment flow succeeds.
- Shows back action, thumbnail, booking details, checklist overlay, item handover photos, and customer pickup signature.
- Checklist pulls from template when available; otherwise blank. Abnormal/damaged rows require notes. Save only changed payloads.
- Staff may add/reduce rental days within overlap/min/max constraints.
- Pickup may collect additional required funds, but under approved Model B all Pickup money is deposit / advance holding balance, not final rental revenue and not the tax point.
- Pickup money truth must be recorded through the dedicated rental held-balance event model, such as `pickup_held_balance_collection`, not through old `checkout_paid_amount` rental semantics.
- Pickup screens/calculations must distinguish expected rental amount used for quote / held balance sizing from final rental fee recognized only at Return Settlement.
- Rental pickup does not issue a rental tax invoice or abbreviated tax invoice for rental revenue, and WHT handling does not occur at Pickup.
- Pickup-stage documents may include deposit/ordinary receipt for money held if supported, handover operational documents, checklist documents, and signature documents.

## 10. Return target flow

- Receives booking payload from Booking Management.
- Shows pickup checklist with return-side comparison column.
- Return photos are mandatory; damage requires additional close-up photo.
- Penalty/fee inputs require notes where appropriate.
- Physical return records `returned` as physical lifecycle only; it does not itself mean financial settlement is complete.
- WHT toggle lives only in Return Settlement and requires a valid Tax Profile before settlement can proceed with WHT.
- Return Settlement is the canonical rental financial settlement and tax/document point under approved Model B.
- Settlement calculates actual rental charge, duration changes/extensions, late fee, damage/penalty charges, refundable amount or extra amount due, rental revenue recognition, rental tax document issuance, and WHT effect where eligible/selected.
- Return Settlement must be implemented as a first-class entity/status before rental Return Settlement is built. It owns held balance available, final rental fee, late penalty, damage charge, WHT on final rental fee only, pending WHT hold, refund due, extra due, settlement status, rental documents, and accounting/export source.
- Return Settlement statuses may include `calculated` / `draft`, `pending_payment`, `pending_refund`, `pending_wht_hold`, `settled`, and `voided` / `reversed`.
- Settlement application, refund, and forfeiture must be represented in the dedicated rental held-balance event model.
- WHT base = final rental fee only. Late penalty, damage charge, contractual penalty/damages, refundable deposit, deposit refund amount, and non-rental settlement balances are excluded from the WHT base.
- When WHT is enabled, settlement preview must show Rental Fee Gross, Less WHT, Rental Fee Net Retained, Late Penalty / Damage Charges, Held Deposit Balance, and Refund Due or Extra Due.
- Pending WHT hold amount equals the calculated WHT amount only: `holdAmount = calculatedWhtAmount`.

### 10.1 Financial / revenue / tax policy — approved Model B

- Booking Deposit and Pickup collections are deposit / advance holding balances until final Return Settlement.
- Same-Day Instant Rental collection is also held balance / deposit-like money until final Return Settlement and is not a separate Booking Deposit concept.
- Booking Deposit is capped at the required refundable security deposit amount and remains part of the refundable security deposit / held-balance lifecycle.
- Canonical held-balance lifecycle truth comes from the dedicated rental held-balance event model, not from `deposit_paid_amount`, `deposit_payment_status`, `checkout_total_amount`, `checkout_paid_amount`, or `checkout_payment_method`.
- Rental revenue is recognized at Return Settlement according to the final actual rental/penalty outcome.
- Rental tax documents are issued from the Return Settlement flow according to approved document policy, not from Pickup.
- WHT workflow is centered on Return Settlement where customer eligibility and selection are known; WHT is not handled at Pickup.
- WHT must not be applied at Booking Deposit payment, POS Future Booking payment, Pickup holding/deposit payment, Retail sale payment, or Pickup operational documents.
- WHT calculation uses final rental fee only and excludes late penalty, damage charge, contractual penalty/damages, refundable deposit, deposit refund amount, and non-rental settlement balances.
- If WHT supporting documents are pending, the held amount is exactly the calculated WHT amount; fixed minimum WHT holds are not approved.
- Existing POS V2, Phase 2A, and Phase 4B1 pickup money semantics are not canonical and require semantic refactor before any deeper POS V3 pickup/return implementation uses their structures.

### 10.2 Financial / accounting / ERP separation — approved Decision 3

- POS V3 and admin-assisted flows must maintain hard Retail/Rental payment separation at checkout, payment, document, and accounting/export layers.
- Website Mixed Checkout may remain as customer-facing orchestration only when backend records keep Retail Order and Rental Booking Deposit obligations separate.
- Accounting and ERP/export logic must distinguish Retail revenue / retail sale treatment from Rental Booking Deposit / deposit liability treatment. No export may collapse them into one ambiguous transaction.
- Website Mixed Checkout must preserve explicit payment allocations and recovery policy for edge cases where payment succeeds but downstream confirmation fails.
- Final accounting/export truth for rentals must originate from Return Settlement, not Pickup and not old POS checkout fields.

## 11. Core operating policies from latest target model

- Rental assets are serial-level with future RFID compatibility; retail goods are quantity/SKU stock.
- Asset statuses: Available, Rented, Maintenance, Disposed.
- Online booking buffer day +1; POS walk-in buffer day 0 when available/no overlap.
- Pricing uses best-rate day/week/month calculation; staff cannot override price by default.
- Normal late return = daily additional rent; uncontactable overdue = extra weekly penalty + required note.
- Online users are account/email based; walk-in customers are phone based; no automatic merge.
- Negative balance after return creates arrears under Return Settlement / risk-control workflow and freezes/blacklists the related identity until resolved. Do not represent arrears by overloading `rental_bookings.status`.
- Branch isolation; receive/return at same branch by default.

## 12. High-priority reconciliation points before implementation continues

### 12.1 Approved / locked

- **Decision 1 — Booking status vs payment timing:** `confirmed` must be payment-backed. Online Future Booking and POS Future Booking require successful Booking Deposit payment before `confirmed`. POS Same-Day Instant Rental is not an unpaid future booking; it proceeds through full same-day payment and directly into pickup completion, ending as `picked_up` after successful handover. `confirmed + unpaid` is not an approved future state.
- **Decision 2 — Rental money model / Pickup vs Return / Tax Point:** approved baseline is Deposit-Based Settlement / Model B. Booking Deposit and Pickup collections are deposit / advance holding balances, not rental revenue and not the tax point. Return Settlement is the canonical rental financial settlement, revenue recognition, rental tax document, refund/extra-due, and WHT workflow point.
- **Decision 3 — Mixed Checkout / Retail-Rental Separation:** POS V3 and admin-assisted flows require hard Retail/Rental payment separation. Website Mixed Checkout may remain as a customer-facing UX/payment orchestration layer only if logical transactions, payment allocations, document chains, accounting/export classification, prevalidation, and recovery policy remain safely separated.
- **Decision 4 — WHT Operational Model at Return Settlement:** WHT appears only at rental Return Settlement. WHT base = final rental fee only. WHT excludes penalties, damage charges, contractual damages, refundable deposit, deposit refund amount, and non-rental settlement balances. If WHT documentation is pending, `holdAmount = calculatedWhtAmount`; no fixed THB 250 or max-with-minimum hold is approved.
- **Decision 5 — POS V3 Canonical Direction / POS V2 Reuse Policy:** POS V3 is the canonical POS product direction for future staff workflows. POS V2 is legacy/reference only, must not receive broad new core POS expansion, and may be reused only selectively after validation against Decisions 1–4.
- **Decision 6A — Dedicated Rental Held Balance Event Model:** canonical rental held-balance lifecycle truth must use a dedicated rental-specific event model. Generic `payment_allocations` may later bridge accounting/export but is not canonical held-balance lifecycle truth.
- **Decision 6B — Booking Deposit Cap:** Booking Deposit is part of refundable security deposit / held balance and must never exceed required refundable security deposit: `booking_deposit_due_now = min(policy_calculated_booking_deposit, required_security_deposit_amount)`.
- **POS V3 Rental Status + Money Semantic Contract:** `draft`, `confirmed`, `picked_up`, `returned`, `cancelled`, and `no_show` use the locked meanings in section 0.3. Return Settlement is separate from booking status and must be first-class before rental Return Settlement implementation.

### 12.2 Remaining implementation planning gate

1. **POS V3 semantic foundation phase:** implement only the smallest backend/schema/helper foundation needed to enforce payment-backed `confirmed`, create canonical rental held-balance event truth, apply the Decision 6B Booking Deposit cap, and prepare first-class Return Settlement architecture. Do not build rental UI flows on unstable field semantics.

## 13. Recommended next work after blueprint approval

1. Start the POS V3 semantic foundation implementation phase.
2. Define / implement the dedicated rental held-balance event model as canonical money truth.
3. Add helpers/guards for payment-backed `confirmed`, locked booking status meanings, and Decision 6B Booking Deposit cap.
4. Prepare first-class Return Settlement entity design before implementing rental Return Settlement.
5. Refactor rental money summary / pickup readiness only after the canonical held-balance and status helpers exist.
6. Continue POS V3 implementation using the locked roadmap; do not expand POS V2.

## 14. Blueprint approval checklist

- [ ] POS V3 information architecture approved.
- [ ] Retail sale flow direction approved.
- [ ] Booking management direction approved.
- [ ] Walk-in booking direction approved.
- [ ] Pickup flow direction approved.
- [ ] Return flow direction approved.
- [ ] Document/WHT direction approved in principle.
- [x] Decision 1 booking status/payment timing approved.
- [x] Decision 2 rental money model / pickup vs return / tax point approved.
- [x] Decision 3 mixed checkout / Retail-Rental separation approved.
- [x] Decision 4 WHT operational model at Return Settlement approved.
- [x] Decision 5 POS V3 canonical direction / POS V2 reuse policy approved.
- [x] Decision 6A dedicated rental held-balance event model approved.
- [x] Decision 6B Booking Deposit cap approved.
- [x] POS V3 Rental Status + Money Semantic Contract approved.
- [x] Reuse / Refactor Impact Audit completed.
- [x] Semantic contract design audit completed.
- [ ] Accounting-sensitive policies reviewed where needed.

---

## Appendix A. Detailed policy source notes from 18 May 2026

🏛️ Pillar 1: Asset & Inventory Lifecycle Policy (นโยบายสินทรัพย์และสต็อก)

1. ระบบจัดการคลังสินค้าแบบแยกประเภท (Inventory Segmentation)

ทรัพย์สินให้เช่า (Rental Asset): บังคับรันบาร์โค้ดแบบ Serial-Level (1 ชิ้น = 1 ID) เพื่อให้ระบบบัญชีคิดค่าเสื่อมราคารายตัว โครงสร้าง Database ต้องออกแบบเผื่อรองรับระบบ RFID Tag ในอนาคต

สินค้าขาย/วัสดุสิ้นเปลือง (Retail/Consumables): รันคลังแบบนับจำนวน (Quantity) ภายใต้รหัส SKU เดียวกัน

2. วงจรสถานะของสินทรัพย์เช่า (Asset Status Lifecycle)

Available: พร้อมปล่อยเช่า (โชว์บนหน้าเว็บ และ POS)

Rented: กำลังถูกเช่า (ตัดออกจากคลังชั่วคราว)

Maintenance: ส่งซ่อม/รอตรวจสอบ (ซ่อนจากระบบจอง)

Disposed: ตัดจำหน่ายซากทิ้งถาวร (ERP ตัดมูลค่าออกจากงบดุล)

3. นโยบาย Buffer Day (วันพักเครื่องมือ)

Online Booking: ระบบบังคับบวก Buffer Day +1 วันอัตโนมัติ หลังจากวันที่ลูกค้าระบุคืนของ เพื่อกันคิวซ้อน

POS Walk-in: พนักงานสามารถดึงของที่มีสถานะ Available มาปล่อยเช่าได้ทันที (Buffer Day = 0) โดยระบบต้องยอมให้ข้ามเงื่อนไข Buffer Day ของออนไลน์ได้

4. ระบบเติมสต็อกและการผูกต้นทุน (Stock Replenishment & Costing)

ทุกครั้งที่เพิ่มสต็อก ระบบจะบังคับให้ใส่ ราคาต้นทุน และ ชื่อ Supplier / เลขที่ใบเสร็จ เพื่อส่งต่อให้ ERP

Bypass Rule: หากหน้างานต้องการความรวดเร็ว สามารถกด Bypass ได้ ระบบจะยัดค่าเป็น Unknown ไว้ก่อน

ต้นทุนสินค้าเช่า (Asset) จะถูกนำไปคำนวณค่าเสื่อมราคา ส่วนต้นทุนสินค้าขาย (Retail) จะถูกตัดด้วยระบบ FIFO (First-In, First-Out) แยกรายสาขา เพื่อหาต้นทุนขาย (COGS) ที่แท้จริง

🏛️ Pillar 2: Booking & Cancel Flow (นโยบายการจอง ยกเลิก และค่าปรับ)

1. วงจรสถานะการจอง (Booking Status Lifecycle)

ไม่มีสถานะ Draft เพื่อป้องกันการกั๊กสต็อกผี สถานะจะเริ่มที่ Confirmed (จ่ายเงินแล้ว) -> Picked Up -> Returned หรือ Overdue

Decision 1 update: Confirmed ต้องเป็นสถานะที่ payment-backed เท่านั้น ทั้ง Online Future Booking และ POS Future Booking ต้องจ่าย Booking Deposit สำเร็จก่อนเป็น Confirmed; Same-Day receive-now ให้เข้ากระบวนการ Instant Rental และจบเป็น Picked Up หลังจ่ายเงิน/ส่งมอบสำเร็จ ไม่ใช้ Confirmed + unpaid

Semantic Contract update: ข้อความ source note เดิมเรื่อง “ไม่มีสถานะ Draft” ถูก override แล้วสำหรับ POS V3. POS V3 ใช้ `draft` เป็น booking intent ก่อนจ่าย Booking Deposit สำหรับ future booking; `returned` หมายถึงคืนของทางกายภาพเท่านั้น; arrears / pending WHT / settled ต้องอยู่ใน Return Settlement status ไม่ใช่ `rental_bookings.status`.

2. นโยบายการยกเลิกและการริบเงิน (Cancellation Policy)

ยกเลิกล่วงหน้า > 72 ชั่วโมง: คืนเงินมัดจำ/เงินค่าเช่า 100%

ยกเลิกกะทันหัน < 72 ชั่วโมง หรือ No Show: ริบเงิน 100% โดย ERP จะบันทึกรายได้ก้อนนี้เป็น "รายได้เบ็ดเตล็ด (Miscellaneous Income)" ที่ไม่มีภาระ VAT 7%

3. โครงสร้างราคาแบบขั้นบันได (Tiered Pricing & Best-Rate)

ระบบต้องคำนวณเปรียบเทียบเรท วัน/สัปดาห์/เดือน และเลือกเรทที่ ถูกที่สุด ให้ลูกค้าอัตโนมัติ

การต่อสัญญา (Extension): หากลูกค้าขอเช่าต่อ ระบบจะไม่เปิดบิลใหม่ แต่นำจำนวนวันไปบวกเพิ่มในบิลเดิมเพื่อคำนวณสไลด์ขั้นบันไดราคาให้ถูกลง (เงื่อนไข: วันที่เช่าต่อต้องไม่ชนกับ Buffer Day ของคิวถัดไป)

Price Lock: สิทธิ์ Staff ทั่วไปห้ามแก้ไขราคาเช่าที่ระบบคำนวณมาโดยเด็ดขาด

4. กฎค่าปรับคืนเลท 2 ระดับ (Two-Tier Overdue Penalty)

เลทปกติ (แจ้งล่วงหน้า): คิดค่าเช่ารายวันเพิ่มตามเรทฐาน (Base Rate)

เลทแบบเงียบหาย (ติดต่อไม่ได้): ระบบบังคับบวกค่าปรับพิเศษ 500 บาท / สัปดาห์ (เศษของสัปดาห์ปัดเป็น 1) ทบเข้าไปกับค่าเช่ารายวัน โดย Staff ต้องพิมพ์ Note ว่า "ติดต่อไม่ได้" ลงใน Payload ด้วย

🏛️ Pillar 3: Financial, Revenue & Tax (นโยบายการเงินและภาษี)

1. แนวทางการรับรู้รายได้งานเช่า (Deposit-Based Settlement / Model B)

วันรับของ (Pickup): ยอดเงินทั้งหมดที่ลูกค้าจ่าย (ค่าเช่า+มัดจำ) ถือเป็น "เงินประกันรับล่วงหน้า" ระบบ POS ออกแค่ ใบรับเงินชั่วคราว (ไม่ออกใบกำกับภาษี ไม่มีการหัก WHT)

วันคืนของ (Return/Tax Point): ระบบจะคำนวณค่าใช้จ่ายจริงทั้งหมด หักออกจากเงินประกัน และ ออกใบกำกับภาษีเต็มยอดค่าเช่า/ค่าปรับ ในวันนี้เพียงวันเดียว

Decision 6A / Semantic Contract update: เงินที่รับใน Booking Deposit, Same-Day Instant Rental, Pickup, การนำเงินไปหัก settlement, refund, และ forfeiture ต้องมี canonical truth ใน dedicated rental held-balance event model ไม่ใช่ generic `payment_allocations` และไม่ใช่ legacy `deposit_*` / `checkout_*` fields.

Decision 6B update: Booking Deposit เป็นส่วนหนึ่งของ refundable security deposit / held balance และต้องไม่เกินยอด required refundable security deposit ของ booking นั้น.

2. การจัดการภาษีหัก ณ ที่จ่าย 5% (WHT Workflow)

ปุ่ม WHT Toggle จะอยู่หน้า Return Settlement

หากลูกค้าเปิด WHT ระบบจะคำนวณยอดเงินประกันที่ต้องคืนใหม่ (คืนเยอะขึ้นเพราะบริษัทถูกหักภาษี)

WHT Hold Rule: หากลูกค้ายังไม่ส่งเอกสาร 50 ใบหัก ณ ที่จ่าย ระบบจะสร้าง Pending WHT และล็อกเงินประกันไว้เท่ากับยอด WHT ที่คำนวณจริงเท่านั้น (`holdAmount = calculatedWhtAmount`) ลูกค้าจะได้รับเงินก้อนนี้คืนก็ต่อเมื่อส่ง/อัปโหลดเอกสาร WHT และเอกสารถูกยอมรับตาม workflow ในอนาคต ห้ามใช้ขั้นต่ำคงที่ 250 บาท หรือ max(calculatedWhtAmount, 250)

3. นโยบายฝั่งของขาย (Retail Sales & Hybrid Bills)

Tax Point เกิดทันที: ซื้อของขายหน้าร้าน ระบบตัดสต็อกและออกใบกำกับภาษี/ใบเสร็จรับเงิน ทันที

POS/Admin Strict Hybrid Bill Separation: หากลูกค้า "เช่าสว่าน + ซื้อน็อต" ที่หน้า POS/admin-assisted flow ระบบ POS ห้ามรวมบิลเด็ดขาด บังคับแยก 2 ธุรกรรม (ออกใบรับเงินมัดจำ 1 ใบ + ใบกำกับภาษีซื้อของ 1 ใบ) และลูกค้าต้องชำระเงินแยก 2 flow เพื่อให้ Statement และ ERP ตรวจสอบง่าย

Website Mixed Checkout Caveat: เว็บไซต์อาจคง UX ชำระเงินรวมได้เฉพาะในฐานะ orchestration layer แต่ backend ต้องแยก retail order, rental Booking Deposit allocation, document chain, และ accounting/export classification ชัดเจน ห้ามรวมเป็นธุรกรรมธุรกิจเดียว

🏛️ Pillar 4: Customer Identity & Risk (นโยบายข้อมูลลูกค้าและหนี้ค้าง)

1. โครงสร้างบัญชีแบบแยกส่วน (No Auto-Merge Policy)

ลูกค้าออนไลน์ใช้ Email/Gmail, ลูกค้าหน้าร้าน (Walk-in) ใช้เบอร์โทรศัพท์เป็น Primary Key

หากลูกค้า Walk-in ไปเปิดบัญชีออนไลน์ภายหลัง ระบบห้ามนำบัญชีมารวมกัน (No Merge) เพื่อป้องกัน Audit Trail ทางบัญชีพัง

2. ระบบบัญชีดำและลูกหนี้การค้า (Arrears & Auto-Blacklist)

หากลูกค้าทำของพังหรือคืนเลทจนยอดเงินประกันติดลบ และไม่จ่ายเงินเพิ่มหน้าร้าน -> Staff สามารถกดคืนของได้ (เพื่อเอาของกลับคลัง) แต่ระบบจะตั้งสถานะ Booking นั้นเป็น Arrears (ลูกหนี้ค้างชำระ)

Semantic Contract update: POS V3 ห้ามตั้ง `rental_bookings.status` เป็น Arrears. ให้บันทึก physical return เป็น `returned` และติดตามลูกหนี้ / pending payment ผ่าน Return Settlement / risk-control status แยกต่างหาก.

Auto-Blacklist: ทันทีที่เบอร์โทรหรือ User ID นั้นมีบิล Arrears แม้แต่บิลเดียว ระบบทุกสาขาและหน้าเว็บจะ Freeze บัญชีนั้น ห้ามทำธุรกรรมใดๆ จนกว่าจะมาชำระหนี้ที่ POS

🔒 Security, Operations & Multi-Branch (ความปลอดภัยและสาขา)

1. การคุมสิทธิ์และการตรวจสอบ (Audit & Role Matrix)

Strict Audit Trail: ทุกการขยับสถานะจอง/สต็อก ระบบบันทึก Log (Insert-Only) เก็บ Timestamp, Staff ID, และรูปถ่าย ห้ามแก้หรือลบประวัติเด็ดขาด

Role Matrix:

Staff: ทำรายการปกติ, คีย์ผลนับสต็อก

Super Admin / Manager: Void บิล, อนุมัติส่วนลด, อนุมัติตัดจำหน่ายซาก, ปลดล็อกเงินออฟไลน์

2. กฎการบริหารหลายสาขา (Multi-Branch Rules)

Branch Isolation: พนักงานเห็นและจัดการได้เฉพาะสต็อกของสาขาตัวเอง (POS ล็อกตาม Branch ID)

รับไหน คืนนั่น 100%: เพื่อไม่ให้ภาษีและคลังของ ERP ข้ามสาขากัน ลูกค้าต้องคืนของ/เคลมของพัง ที่สาขาเดิมเท่านั้น (ห้าม Cross-branch)

3. กฎการทำงานช่วงเน็ตล่ม (Offline Resilience)

POS ต้องทำงานต่อได้ (เก็บข้อมูลลูกค้า/ทำ Return) บันทึกย้อนหลังลง Local Storage

Offline Cash Limit: รับชำระเงินสดออฟไลน์ได้ไม่เกิน 5,000 บาท/เครื่อง หากเกินจะล็อกหน้าจอ (เว้นแต่ Super Admin มากด Bypass ให้)

เมื่อเน็ตกลับมา ระบบต้องซิงค์คิวเรียงตาม Timestamp ขึ้น ERP อัตโนมัติ

4. การปิดยอดและการนับสต็อก (Reconciliation & Stocktake)

Shift Closing: ก่อนเลิกงาน ต้องคีย์ยอดเงินสดจริงในลิ้นชัก (Cash on Hand) เทียบกับระบบ หากต่างต้องมี Note แจ้ง Manager

Freeze Stock: ขณะที่นับสต็อกของขาย (Cycle Count) หมวดหมู่ใด ระบบ POS สาขานั้นจะล็อกห้ามขายของหมวดนั้นชั่วคราว

📱 POS UI/UX & Payload Flow (iPad 6-Column Layout)
โครงสร้างหน้าจอถูกแบ่งการทำงานผ่าน Grid 6 คอลัมน์ (บังคับผูก Branch ID และ Staff ID ทุก Action):

Section #1: การขายของ (Retail)

Col 1: ปุ่มสแกน Barcode/QR (รองรับ API เครื่องสแกน)

Col 2-6: ช่อง Search (Auto-complete) โชว์รายการสินค้า 3 แถว (มี Thumbnail, สัดส่วนเว้น Margin ให้กดง่าย)

Cart & Checkout: ตะกร้าขั้นต่ำ 5 แถว กด Checkout เด้ง Overlay เลือกการชำระเงิน

เงินสด: โชว์ยอดรับ ทอน ยืนยัน

QR Code: เรียก API Omise Gen QR พร้อมปุ่ม "ถ่ายรูปสลิป" สำรองกรณี API ดีเลย์ และมีปุ่ม "ยกเลิก" เพื่อเคลียร์ Session

Section #2: การออกเอกสารและ WHT (Document Management)

เมื่อจบ Flow จ่ายเงิน -> ส่ง Payload ไปหน้าเอกสาร -> Generate ใบกำกับภาษีอย่างย่อ ทันที

มีปุ่มกดขยับเป็น ใบกำกับภาษีเต็มรูป (ดึงจากเบอร์เดิม / สแกนบัตร / หรือเด้งไปทำ KYC ใหม่แล้วกลับมา)

หน้า Document ปกติ (เข้าผ่าน Nav): มี Filter วันที่ (Default = Today), List เอกสาร, สิทธิ์ Super Admin มีปุ่ม Void

WHT Upload Button: มีปุ่มให้อัปโหลดเอกสารหัก ณ ที่จ่าย สำหรับบิลที่ติดสถานะ Pending WHT

Semantic Contract update: Pending WHT เป็นสถานะของ Return Settlement / WHT workflow เท่านั้น ไม่ใช่สถานะ booking หลัก.

Section #3 & #4: Booking Management & Walk-in

หน้า จัดการ: โชว์ List บิลของวันนี้ (มีกรอบสีแดงเน้นคำว่า Today) มีปุ่ม Pickup/Return แยกชัดเจน บิลออนไลน์มีปุ่ม No Show, บิล Walk-in มีปุ่ม Cancel

หน้า Walk-in Booking (+): ช่อง Search Asset, ปฏิทินจอง (ตั้งเงื่อนไข Buffer Day = 0 และวันหยุดร้าน) เช็คแค่ว่าไม่ Overlap กับคิวอื่น ถ้าเป็น Future Booking ต้องรับ Booking Deposit สำเร็จก่อนจึง Confirm และส่ง Payload กลับหน้าจัดการ; ถ้าเป็นรับของทันทีวันเดียวกันให้เป็น Instant Rental จ่ายยอดรับของวันนั้นและเข้าสู่ Pickup Completion โดยตรง

Decision 6B update: Future Booking ต้อง cap Booking Deposit ด้วยสูตร `min(policy_calculated_booking_deposit, required_security_deposit_amount)`. Same-Day Instant Rental เป็น same-day held balance collection ไม่ใช่ Booking Deposit แยก.

Section #5: Pickup Flow (รับของ)

Col 1-2: แผงกล้อง iPad บังคับถ่ายรูปสภาพของส่งมอบอย่างน้อย 1 รูป

Col 3-6: แสดงรายละเอียด, มีปุ่ม Checklist ดึง Template หมวดอุปกรณ์ขึ้นมาให้ติ๊ก (ถ้ากด 'ชำรุด' บังคับพิมพ์ Note)

Section Modify: กดเพิ่ม/ลดวันเช่าได้ (เช็ค Overlap คิวอื่น)

Checkout: คำนวณยอดมัดจำทั้งหมด -> จ่ายเงิน -> ออกใบรับเงินมัดจำ (ไม่ลง VAT) พร้อมพิมพ์ Checklist แนบท้าย

Semantic Contract update: Pickup collection เป็น held balance เท่านั้น ห้ามใช้ `checkout_paid_amount` เป็น canonical rental truth และห้ามรับรู้ final rental revenue / WHT / rental tax invoice ที่ Pickup.

Section #6: Return Settlement (คืนของ)

Semantic Contract update: ต้องมี first-class Return Settlement entity/status ก่อน implement Return Settlement จริง. `returned` คือคืนของทางกายภาพเท่านั้น ส่วน settlement status เช่น pending_payment, pending_refund, pending_wht_hold, settled, voided/reversed ต้องแยกออกจาก booking status.

แสดง Checklist เทียบตอนรับ -> บังคับถ่ายรูปรวม 1 รูป

(Audit Lock): หาก Staff ติ๊ก Checklist ว่า "ชำรุด" ระบบจะบังคับให้ถ่ายรูปเจาะจงรอยชำรุดนั้นเพิ่มอีก 1 รูป พร้อมคีย์ค่าปรับและหมายเหตุ

หน้าต่างคำนวณ (Settlement): \* มีปุ่ม Toggle หัก ณ ที่จ่าย 5% (กดแล้วระบบคำนวณยอดเงินประกันเน็ตที่ต้องคืนใหม่ทันที)

หักลบค่าเช่า, ค่าปรับเลท (+100/ปกติ หรือ +500/ติดต่อไม่ได้), และค่าชำรุด

การจ่ายเงินคืน: กดโอนคืนผ่าน Omise หรือเลือก "โอนแมนนวล" (บังคับคีย์เลขบัญชี + ถ่ายสลิปแนบ)

ออกเอกสาร: Generate ใบกำกับภาษีเต็มรูป (ระบบหลังบ้านต้องแยก Payload ฐานภาษี: ค่าเช่า/เลท คิด VAT 7% vs ค่าปรับของพัง ไม่คิด VAT)

🔔 Automated Notifications & Documents
Email Only for Docs: เอกสารสำคัญ (ใบเสร็จ, e-Tax Invoice) และลิงก์สำหรับให้ลูกค้าอัปโหลด WHT จะถูกส่งผ่าน Email อัตโนมัติเมื่อปิดจ๊อบ

Auto-Reminders (SMS/LINE): \* เตือนล่วงหน้า 24 ชม. ก่อนถึงกำหนดคืน

เตือน Overdue ทันทีเมื่อเลยเวลา พร้อมระบุกฎค่าปรับ 500 บาท/สัปดาห์หากไม่ติดต่อกลับ
