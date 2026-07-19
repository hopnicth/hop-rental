# T3 + T4 Design Pass — Unified Cancel/Void/Refund + Document/ERP Foundation

Status: **DESIGNED ONLY — submitted for CHiP review. No code, no migrations, no schema changes in this pass.**
Date: 2026-07-19 · Author: Claude Code (implementer) · Base: `staging` @ `aa1f984` (= origin/staging)
Routing: `docs/MASTER-GAP-MAP.md` T3 + T4 (designed together per §e). Working rules: `docs/OPERATING-MODEL.md`.

## Ratified rulings (recorded verbatim — the design contract)

> 1. One design, two deliveries: Phase 1 = T3 complete + T4-core (numbering engine usage,
>    void-reissue chain, cancel/refund document types). Phase 2 = T4-rest (central tax_treatment
>    config, sale receipt + tax invoice types [A8/A9], 3 reconciliation loops). T5 owns POS
>    wiring/auto-issue only.
> 2. Late-cancel (<7d) forfeiture: new disposition source late_cancellation_forfeiture (CHECK
>    widening), policy version booking_deposit_forfeiture_late_cancel_v1, accounting pipeline
>    IDENTICAL to no-show (disposition → non_vat_contractual_penalty recognition → held-balance
>    forfeiture full release → forfeiture notice + ordinary receipt documents).
> 3. Sale-cancel stock: auto-restore ONLY while unfulfilled (boundary = the actual inventory-apply
>    point in the order lifecycle — derive from schema, cite it); after fulfillment, refund flows
>    but stock is manual adjustment. Refund records carry a method field (manual_transfer now;
>    gateway_refund-ready state machine: pending → settled/failed).
> 4. B-M1 in scope: paid_confirm_failed recovery surface — refund via the T3 machinery OR
>    retry-confirm.
> 5. §b tiers implemented in full: ≥7d self-cancel refund; <7d staff-only forfeit (ruling 2);
>    company-side super-admin full refund (auth: T1a inversion pattern extended — see below).

Discrepancy scan result: **no ruling conflicts with repo reality.** Two facts worth flagging as
*changes* (not discrepancies): (i) the live self-cancel cutoff is **3 calendar days** Bangkok
(`docs/customer-rental-booking-cancellation-refund-design.md` §2.1; enforced via
`evaluateBookingDepositRefundEligibility`, called at `server/utils/rental-booking-cancellation.ts:631-640`)
— ruling 5 moves it to **7 days**; (ii) `docs/booking-deposit-forfeiture-accounting-document-design.md:3-4`
still says the receipt/notice pair is "future work", but the pair is IMPLEMENTED
(`server/utils/rental-booking-no-show-documents.ts:15-18`) — the doc header is stale, to be
refreshed in Phase 1.

---

## A. Unified cancel model

One conceptual pipeline, five entry cases, one composition rule. **Money in ONE RPC transaction per
entity; orchestration + resume in wrappers** — the T2 pattern, per
`server/utils/rental-return-settlement.ts:1-21` (RPC = single money-writer authority;
lifecycle/documents in the wrapper; `resumeSettledReturn()` at `:240-368` for half-state recovery).
T3 follows this shape exactly: each cancel case gets one SECURITY DEFINER, service-role-only,
row-locked RPC (mig-119/125 discipline), and a wrapper that pre-validates, calls the RPC, then does
document issuance + notifications, with a resume path keyed on the immutable event row.

### Ledger composition rule (LOCKED — decisions.md §b addendum item 2)

- `settlement_application` = held funds applied to charges
- `refund` = held funds returned to customer
- `forfeiture` = policy-driven TOTAL seizure — never line-item
- shortfall ⇒ `settlement_additional_collection` (customer pays in)
- Per-booking full-release invariant: held + additional collection = application + refund + forfeiture.
  Enforced today: settlement variant at `supabase/migrations/125_rental_booking_settlements.sql:120-121`
  and re-asserted from the ledger at `125:321-334`; forfeiture variant (full ledger balance seized)
  at `server/utils/rental-booking-no-show.ts:206-238` and `126_auto_no_show_mark.sql:168-177`.
  Current event_type CHECK vocabulary (post-125 widening, `125:171-180`):
  `booking_deposit_collection, pickup_held_balance_collection, same_day_held_balance_collection,
  settlement_application, refund, forfeiture, remaining_security_deposit_collection,
  settlement_additional_collection`. **T3 adds NO new event types** — every cancel outcome
  composes from `refund` and `forfeiture`.

### Case table

| # | Case | Eligibility | Money (ledger events) | Stock | Documents (§C) | Disposition / recognition |
|---|---|---|---|---|---|---|
| 1 | **Rental self-cancel ≥7d** (customer) | Owner; `status='confirmed'`; deposit `paid`; ≥7 calendar days before pickup, Asia/Bangkok (tier widened from current 3d; gate chain per `server/utils/rental-booking-cancellation.ts:126-154, 631-640`) | Refund request row (`payment_refunds`, `pending_admin_review`, mig `081:79-131`) at cancel; ledger `refund` event for the FULL held balance fires at admin `mark-refunded` (slip + bank ref required, `server/utils/admin-refunds.ts:572-576`) → full release, residue 0 | n/a (availability released by status flip, `rental-booking-cancellation.ts:851`) | Cancellation notice at cancel; refund evidence doc at mark-refunded (extends existing BDR `payment_refund` doc, `admin-refunds.ts:358-376`) | none (no forfeiture) |
| 2 | **Rental late-cancel <7d** (staff-only) | Staff; `status='confirmed'`; deposit `paid`; inside 7d window; customer must NOT self-serve (409 `supportRequired`, existing shape) | **Pipeline IDENTICAL to no-show** (ruling 2): disposition event (`source_event_type='late_cancellation_forfeiture'`, policy `booking_deposit_forfeiture_late_cancel_v1`) → recognition (`non_vat_contractual_penalty`, rates pinned 0, mig `085:124-137`) → ledger `forfeiture` of full held balance → residue 0. Reuses `createNoShowForfeitureChain` generalized (`rental-booking-no-show.ts:167-238`) | n/a | Forfeiture notice + ordinary receipt pair REUSED (`rental-booking-no-show-documents.ts:15-18`, receipt prefix BDFR, `is_tax_invoice:false`) + cancellation notice | disposition `forfeited` + recognition `booking_deposit_forfeiture_income` |
| 3 | **Company-side cancel** (super_admin only, reason required) | Any pre-pickup status; auth = T1a inversion pattern extended (§F) | Full refund ALWAYS: refund request auto-created → `refund` event at mark-refunded, full release | n/a | Cancellation notice (company-initiated variant) + refund evidence doc | none |
| 4 | **Sale-order cancel** | Admin (cancel of paid orders stays super_admin per `server/api/admin/orders/[id].patch.ts:78-83`); transitions per `app/utils/admin-order-transitions.ts:8-13` | If paid: sale refund record (§ method field below); no held-balance ledger (sale money is order-side) | **Auto-restore ONLY while inventory unapplied** — boundary below | Cancellation notice; refund evidence (credit-note-lite, §C) | n/a |
| 5 | **Mixed cancel** (Case-3 B4) | Session cancel keeps current guard (`server/utils/mixed-checkout-cancellation.ts:6-21,48-71`); NEW: post-payment mixed cancel = orchestrated pair — sale leg via case 4 + rental leg via case 1/2/3, each in its own entity RPC | Per-leg as above; the wrapper sequences legs and resumes any half-applied leg (T2 resume pattern) | Per-leg | Per-leg | Per-leg |

**Mixed-cancel atomicity + per-leg resume (round-1 amendment):** atomic = each leg's money inside
its own entity RPC (rental: status flip + cancellation event + refund-request/forfeiture chain;
sale: status flip + refund record + conditional `f_restore_order_inventory`) — no observable
half-state within a leg. Orchestrated = the wrapper sequences **rental leg first** (it is the leg
racing the no-show cron, annex #3), then sale leg, then session/allocation bookkeeping, then
documents; cross-leg atomicity is deliberately NOT attempted (no cross-entity transaction exists in
the T2 pattern). Resume: the wrapper is idempotent and re-entrant, keyed on the mixed session id;
on re-invocation it inspects each leg's committed truth (rental cancellation event / booking
status; sale order status + refund record) and re-runs **only the missing legs**, exactly like
`resumeSettledReturn()` (`rental-return-settlement.ts:240-368`) — committed legs are
verified-and-skipped, with a stored-vs-resubmitted mismatch returning 409 (the
`SETTLEMENT_PENDING_MISMATCH` shape, `:257-271`). If the rental leg commits and the sale leg fails,
the endpoint reports the per-leg result; retry completes only the sale leg and never re-touches the
rental leg's money.

**B-M1 (ruling 4):** `paid_confirm_failed` (set at `server/utils/mixed-checkout-finalization.ts:396-406`,
`server/utils/rental-booking-deposit-payment.ts:401`, `server/utils/pos-rental-booking-deposit-finalizer.ts:157-159`)
gets an explicit admin recovery surface with exactly two exits: **retry-confirm** (existing retry
endpoint `server/api/admin/rental-bookings/[id]/documents/booking-deposit-confirmation/retry.post.ts`
plus a confirm-retry action) or **refund via case-3 machinery** (money captured ⇒ refundable; the
state is already treated as deposit-paid-equivalent, `server/utils/admin-bookings-ops.ts:358`).

### Deferred-release window guard (cases 1/3 — round-1 amendment)

Between cancel-commit and admin `mark-refunded`, a case-1/3 booking is `cancelled` with its held
balance still unreleased (the `refund` ledger event fires only at mark-refunded). This window is
governed as follows:

- **(a) First-class queue state:** "cancelled-with-open-ledger" is a named state of the admin
  refunds queue — every booking with `status='cancelled'` and net ledger balance > 0 and an
  unterminated `payment_refunds` row surfaces there by default (extends the existing
  `pending_admin_review` queue, `admin-refunds.ts:503-630`); it is never discoverable-only.
- **(b) Lifecycle invariant (stated):** **every cancelled booking must terminally reach ledger
  residue 0.** Terminal exits are exactly: `refund` event at mark-refunded (normal), or — for
  refund-failure / unreachable-customer cases — the refund row ends `failed` /
  `needs_customer_contact` exhausted (existing statuses, mig `081:79-131`) and a **super_admin
  closes the ledger via the case-2 forfeiture chain** with a dedicated policy version
  `booking_deposit_forfeiture_refund_unreachable_v1` (reason required, §F decision-logged, same
  disposition/recognition/document pipeline). No cancelled booking may sit outside the queue with
  residue > 0 and no live refund row.
- **(c) Reconciliation hook:** loop 3 (deposit liability, Phase 2) counts
  cancelled-with-open-ledger bookings and their aging as an explicit line — the window is
  measurable, not implicit.

**Sale-cancel stock boundary (ruling 3), derived:** inventory is applied by
`f_apply_order_inventory` (mig 050, replaced by `062_update_apply_order_inventory.sql`), which is
idempotent via **`orders.inventory_applied_at`** — and it is called at the payment-paid transition
(`server/utils/payments.ts:138-155`, also `server/api/admin/pos/sales.post.ts:291`,
`server/utils/sale-order-manual-payment.ts:77`). Therefore: **auto-restore iff
`inventory_applied_at IS NULL`**; when set, the goods are in the fulfillment stream — refund flows,
stock is a manual inventory adjustment (logged in `inventory_change_log`, mig 020:76). Phase 1 adds
the missing restore RPC `f_restore_order_inventory(p_order_id)` (mirror of apply: idempotent via a
`inventory_restored_at` stamp, branch-aware, closes Case-1 D5/BUGS 1-3), invoked ONLY inside the
sale-cancel RPC when unapplied→no-op / applied-pre-fulfillment rule above evaluates true.

**Sale refund method field (ruling 3):** new `sale_order_refunds` records carry
`method IN ('manual_transfer','gateway_refund')` and `state IN ('pending','settled','failed')`
(`manual_transfer` settles via slip like rental; `gateway_refund` is the ready state machine for
Omise later). Rental `payment_refunds` (mig `081:79-131`) keeps its existing status machine; the
method field is added there too for symmetry (`manual_transfer` default — bank-transfer-only per §b).

**B7 closure:** the raw admin status flip at `server/api/admin/rental-bookings/[id].patch.ts:82-87`
is REMOVED as a cancel path — `cancelled` is taken out of the generic PATCH transition set
(`app/utils/admin-order-transitions.ts:42-49`) and admin cancels route through cases 2/3 only.

## B. Void-reissue chain over mig-068

Schema already carries everything needed — **no new document columns**:
`status IN ('draft','issued','printed','voided','replaced')` (`068:243`), `voided_at/voided_by/void_reason`
(`068:228-230`), self-FK `original_document_id` (`068:221`), `document_events` types `'voided'|'replaced'`
(`068:341`). What is missing is the writer: no server code today transitions a document to
voided/replaced (verified — zero writes to those columns in `server/`).

Design:
- **Void writes:** one RPC `f_void_official_document(p_document_id, p_reason, p_actor)` sets
  `status='voided'`, `voided_at/voided_by/void_reason`, and appends a `document_events` `'voided'`
  row — nothing else. The finalized-field guard (`068:258-303`) permits status transitions while
  blocking edits to totals/identity/snapshot/number, so **immutability is preserved: edits never** —
  a wrong document is voided and reissued, its bytes untouched.
- **Reissue references the original:** the replacement is issued through the normal issuance path
  with `original_document_id = <voided doc id>`; the voided doc is then flipped `voided → replaced`
  (allowed transition) with a `'replaced'` event carrying the new doc id in its payload. Chain walk =
  follow `original_document_id` backwards.
- **Numbering on reissue:** the replacement takes a **fresh number** from
  `f_next_document_number` (`068:155-206`, format `PREFIX-YYYYMM-0001`, global-per-type sequence,
  gaps-allowed by design). Voided numbers are never reused — reconciliation loop 1 (Phase 2) accounts
  for them as `voided`, not gaps.
- **DELETE guard added:** mig-068's trigger blocks finalized UPDATEs but not DELETE; Phase 1 adds a
  BEFORE DELETE block on `official_documents` (mig-118/086 pattern, e.g. `086:84-91`).
- Void is money-destructive ⇒ super_admin via the T1a inversion pattern + audit log (§F).
- **Preconditions (explicit):** the RPC row-locks the document `FOR UPDATE`; requires
  `status IN ('issued','printed')` (draft docs are simply discarded; already-voided/replaced →
  409); requires non-empty `p_reason`; SECURITY DEFINER, `SET search_path = public`,
  service-role-only EXECUTE (mig-125 discipline, `125:201-202, 349-350`); reachable only through a
  super-admin endpoint using the §F inversion pattern.

## C. Phase-1 document set

| Type key | Prefix | When issued | Notes |
|---|---|---|---|
| `rental_booking_cancellation_confirmation` | (existing) | at cancel (all rental cancel cases) | already issued by the self-cancel path, `rental-booking-cancellation.ts:812` — reused, extended with company-/late-cancel variants in the snapshot |
| `payment_refund` (refund evidence / credit-note-lite) | BDR (existing) | at mark-refunded, requires proof linked (`admin-refunds.ts:364-376`) | extended to cover company-cancel and sale-order refunds (sale variant = new type `sale_order_refund_evidence`, same template family) |
| `rental_booking_no_show_forfeiture_notice` + `booking_deposit_forfeiture_ordinary_receipt` | — / BDFR (existing) | forfeiture pair REUSED for late-cancel (ruling 2); generalized so the notice names the forfeiture source | `rental-booking-no-show-documents.ts:15-18, 372-419`; receipt sources from `financial_recognition_events` per the locked design doc |
| `sale_order_cancellation_notice` | new | at sale-order cancel | |

**Ruling-5 weakness mitigation #3 — decided NOW:** Phase-1 refund documents reference
**order/booking numbers, NOT tax-invoice numbers** — tax invoices (A8/A9) do not exist until
T4-rest, so a Phase-1 "credit note" cannot legally reference one. Trade-off stated for the
accountant: refunds issued during Phase 1 will need their tax-document linkage backfilled/annexed
when T4-rest lands; this goes to `docs/BACKLOG.md` as an accountant-review item in the Phase-1
delivery commit.

## D. Ownership table per document type (weakness mitigation #4)

| Document type | Type creation (registry/template) | Issuance trigger | Type-selection policy |
|---|---|---|---|
| Cancellation notices (rental/sale) | **T4-core** | **T3** cancel wrappers | T3 caller (fixed per case) |
| Refund evidence / credit-note-lite | **T4-core** | **T3** mark-refunded flow | T3 caller |
| Forfeiture notice + ordinary receipt | exists (reused) | **T3** forfeiture chain (late-cancel), existing no-show route | T3 caller |
| Void/reissue mechanics | **T4-core** | any owning flow (T3 now, T5 later) | n/a |
| Sale receipt / tax invoice (A8/A9) | **T4-rest** (Phase 2) | **T5** (POS wiring/auto-issue ONLY — ruling 1) | **T4 tax_treatment config** decides receipt-vs-tax-invoice per (line × customer type); **T5 caller** supplies context |
| Settlement numbered document | **T4-rest** | T4/T5 (per MASTER-GAP-MAP T2 note) | T4 config |

## E. T5 wiring sketch (weakness mitigation #2) — one page

The sale-document engine's real consumer is POS V3. The attachment pattern already exists for
deposits: `finalizePosRentalBookingDeposit()` Step 5 does best-effort issuance via a durable
`pos_document_issuance_tasks` row + `issueBookingDepositConfirmationDocument`
(`server/utils/pos-rental-booking-deposit-finalizer.ts:108,174-194`; task table mig `091:19-79`),
and the QR poll endpoint READS the issued document for the receipt UI
(`.../booking-deposit-qr/poll.post.ts:147-196`) — it never issues.

T5 mirrors this exactly for sales: POS V3 currently has **no sale endpoint** (all
`server/api/admin/pos-v3/` routes are rental-deposit flows); the legacy sale path
`server/api/admin/pos/sales.post.ts` completes payment at the `isPaid` branch (`:228, 288+`) and
issues nothing — the confirmed A8/A9 gap. T5's sale endpoint will: (1) complete money, (2) insert a
`pos_document_issuance_tasks` row keyed on the payment event, (3) call the T4 engine's
`issueSaleDocument(saleContext)` where the **engine** (T4 config) picks receipt vs tax invoice from
`tax_treatment (line type × customer type)` + the customer_tax_profile snapshot (§d), (4) surface
the issued doc read-only in the POS receipt screen. Therefore the engine contract T4 must expose:
idempotent issue-by-source (source_type/source_id/idempotency_key unique, `068:327-329`),
snapshot-at-issuance including tax profile, branch-aware header
(`server/utils/admin-documents.ts:150-179`), and task-row durability so a failed issuance is
retryable without double-numbering. Nothing in T5 computes tax or picks types — it only wires.

## F. Money-ops audit log (birth requirement for T4-core)

Fact: the log-decision-before-throw pattern exists only for KYC
(`server/api/admin/kyc/documents/[id]/download.get.ts:9-12, 88-100`; util
`logKycDocumentAccess`, `server/utils/kyc-documents.ts:328-369`; pinned by source-contract test
`tests/server/kyc-document-download-api.spec.ts:553-555`). No money-destructive endpoint has an
equivalent denial log today.

Design: new append-only table `money_ops_decision_logs` (mig-086-style UPDATE/DELETE guards):
`action` (closed CHECK: `company_cancel`, `late_cancel_forfeit`, `document_void`,
`sale_cancel_paid`, `refund_mark_refunded`, `manual_stock_adjustment`), `decision`
(`allowed|denied`), `denial_reason`, `actor_user_id`, `actor_role`, `entity_type/entity_id`,
`amount`, `reason_text`, `created_at`. Endpoint shape = **T1a inversion pattern extended**:
`requirePlatformAdmin` first (`server/utils/admin.ts:10-47`), then the EXPLICIT `super_admin` check;
on denial write the log row THEN throw 403; `requireSuperAdmin` (`admin.ts:49-60`) is FORBIDDEN on
these endpoints (it throws before the denial can be logged). Allowed decisions log fail-closed
BEFORE the side effect (the `{ failClosed: true }` discipline, download route `:205-219`). Each
endpoint carries a source-contract test in the kyc-download style.

## G. Collision annex

1. **Fulfillment byte-pin / inventory-apply point:** the boundary in ruling 3 is
   `orders.inventory_applied_at` set by `f_apply_order_inventory` at the paid transition
   (`payments.ts:138-155`); the restore RPC must be a strict inverse and idempotent, never running
   when `inventory_applied_at IS NULL` or already restored.
2. **Composition-rule lock:** T3 introduces no new ledger event types; the settlement invariant
   (`125:120-121, 321-334`) is untouched; forfeiture/refund cancel paths assert their own
   full-release (net-held = 0) the same way the no-show chain does (`rental-booking-no-show.ts:206-238`).
3. **Live no-show cron vs cancel ordering:** the cron selects `status='confirmed' AND
   f_rental_no_show_boundary_passed(start_date, now())` (`126:86-90`) and re-locks
   `FOR UPDATE ... WHERE status='confirmed'`, skipping if the status changed (`126:94-99`). So **any
   cancel that leaves `status='confirmed'` past the Bangkok day-after-start boundary WILL be
   auto-forfeited at 00:00.** Rule: every cancel RPC flips status inside the same transaction as its
   money writes (row-locked `FOR UPDATE`, mirroring `125:221-231`), so the cron either sees
   `cancelled` (skips) or wins the lock first (booking becomes `no_show`; the cancel RPC then fails
   its own `status='confirmed'` precondition and reports 409 — never a double disposition; the
   one-disposition-per-booking unique index `085:100-101` is the backstop, surfacing as the handled
   `unique_violation` path, `126:193-197`).
4. **Accounting-export two-era logic:** `server/api/admin/pos/accounting-export.get.ts:149-190`
   reads settlement-first, legacy `deposit_refund_*` otherwise. T3 cancel/forfeiture outcomes are
   ledger+disposition rows, not settlement rows — the export gains a third source branch
   (disposition-era) in Phase 1, keeping era precedence: settlement > disposition > legacy.
5. **Action-log CHECK vocabulary:** `rental_booking_deposit_action_logs.action` is CHECK-locked to
   `('manual_update','pos_create_override','return_refund')` (`061:6`, widened by `067:18-22`); the
   T2 resume path deliberately avoided widening it (`rental-return-settlement.ts:308-321`). **T3's
   first migration touching this table includes the widening** — add `cancel_refund`,
   `late_cancel_forfeit`, `company_cancel_refund` in the same drop-by-exact-name/re-add style as
   `125:165-180` (wrong name fails loudly).
6. **Disposition CHECK widenings (ruling 2):** `085:80` `source_event_type` gains
   `'late_cancellation_forfeiture'`; the XOR guard `085:86-89` gains the third branch (late-cancel
   requires `cancellation_event_id` NOT NULL, `no_show_event_id` NULL); `disposition` stays
   `('forfeited')` (`085:82`); recognition vocabulary (`085:133-137`) is reused unchanged.
7. **Lock-order convention (standing, ratified at gate 130):** every money writer touching both
   `rental_bookings` and a money-row table locks the **booking row FIRST** (`FOR UPDATE`), then the
   money row — the 125/126/129 order. Writers keyed on a money row (e.g. mark-refunded, keyed on
   `payment_refunds`) read the money row unlocked to resolve `booking_id`, lock the booking, then
   lock-and-revalidate the money row. Convention beats pairwise no-contention proofs.
   **Order-domain sub-convention (first defined at gate 128):** sale-side money writers lock the
   **ORDER row FIRST** (`FOR UPDATE`) → inventory rows (`sku_branch_inventory`, FIFO order — same as
   apply) → payment-request rows. Writers keyed on a refund row (`f_settle_sale_order_refund`) use
   the same unlocked-read → lock-order → lock-and-revalidate pattern.

## H. Phase-1 delivery plan

**Draft migrations (names indicative; every one goes through the SQL gate — full draft reviewed by
the auditor BEFORE file creation or apply):**

- `127_cancel_disposition_and_action_log_widening.sql` — disposition `source_event_type` + XOR
  widening (annex #6); deposit-action-log CHECK widening (annex #5); refund `method` field.
- `128_sale_order_refunds_and_inventory_restore.sql` — `sale_order_refunds` (method/state machine),
  `orders.inventory_restored_at`, `f_restore_order_inventory` RPC.
- `129_cancel_rpcs.sql` — `f_cancel_rental_booking_admin` (late-cancel forfeit + company-cancel
  variants), `f_cancel_sale_order`, widening of
  `f_cancel_customer_rental_booking_refund_request` to the 7-day tier.
- `130_official_document_void_reissue.sql` — `f_void_official_document`, DELETE guard on
  `official_documents`.
- `131_money_ops_decision_logs.sql` — the §F audit table + guards.

**Flow-based walk plan (checkpoint protocol — each checkpoint = one flow walks end-to-end, audited
before the next):**
1. Rental self-cancel ≥7d → refund request → admin mark-refunded → ledger release + documents (closes B7 customer side).
2. Late-cancel <7d staff forfeit → full no-show-identical chain + document pair (ruling 2).
3. Company cancel (super_admin, inversion-pattern, decision log) → full refund.
4. Sale cancel pre/post inventory-apply → auto-restore vs manual-adjustment paths (closes D5/BUGS 1-3).
5. Mixed post-payment cancel orchestration (closes B4).
6. paid_confirm_failed recovery surface (B-M1): retry-confirm and refund exits.
7. Document void → reissue chain walk (numbering, events, immutability).
8. Cron-race walk: cancel attempted after boundary (annex #3 ordering proven live).

**Phase-1 / Phase-2 boundary list (the scope contract for CHiP approval):**

IN Phase 1: everything above — T3 complete; T4-core = numbering-engine usage, void-reissue chain,
cancel/refund/forfeiture document types; money-ops decision log; accounting-export third era;
stale forfeiture-doc-header refresh; BACKLOG item for refund-doc tax-invoice linkage (§C).

OUT (Phase 2 = T4-rest): central `tax_treatment` config table + no-hardcoded-rates enforcement;
sale receipt + tax invoice document types (A8/A9); WHT/50-bis tracking; the 3 reconciliation loops
(sequence, money-vs-documents, deposit liability); settlement numbered document; back-office
accounting UI (deferred per §c).
OUT (T5): all POS wiring/auto-issue (§E is the sketch only).
