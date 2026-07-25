# HOPNIC Backlog — single source of truth

Rule: any task deferred in any session MUST be added here in the same
commit that defers it. Claude Code: read this file at session start.

Routing: tracks are defined in `docs/MASTER-GAP-MAP.md`; working rules in
`docs/OPERATING-MODEL.md`; policy in `decisions.md` (2026-07-14 decision set).
On any conflict with older notes, the 2026-07-14 decision set wins.

Item tags: **[QUEUED]** (ordered) · **[PARKED]** (no date) · **[INFRA]** (cross-cutting, fold into the touching track).

## ACTIVE — T-track order (per MASTER-GAP-MAP)

Current work = **T1a**. Order: T1a → T1b → T2 → (T3 + T4 together) → T5 → T6/T7 (parallel) → T8.

- **T1 — KYC (unfrozen 2026-07-14):** T1a staff-KYC + SUPER ADMIN approve queue (User-ID QR link) → T1b customer online KYC. Unblocks the pickup 422 `no_profile` deadlock.
- **T2 — pickup → return → settlement:** the rental ledger release side. After T1.
- **T3 — unified void / cancel / deposit-refund** (sale + rental + mixed). After T2; designed with T4.
- **T4 — document / ERP foundation** (mig-068 engine, tax_treatment, void=reissue). Designed with T3.
- **T5 — POS V3 sale + fiscal docs; retire v1.** After T4.
- **T6 — cross-surface consistency + status visibility.** Parallel.
- **T7 — glossary / i18n / money-copy.** Parallel.
- **T8 — accounting-office export pack** (VAT/WHT/deposit-liability/cash reconciliation). End goal, after T4.

## Backlog by track

### T1 — KYC
- [QUEUED] B-M3: phone-number lookup for staff locate (customer with no login) — feeds staff-KYC + tax-profile creation channels (§a/§d; currently DEAD in V3)
- [PARKED] ~~KYC un-freeze at V3-3 equivalent~~ **SUPERSEDED 2026-07-14** — KYC is unfrozen NOW and is T1 (decisions.md §a); cash drawer model + QR-poll completion vs Omise sandbox remain [PARKED]

### T2 — pickup → return → settlement (ledger release side)
- [QUEUED] KYC pickup gate deadlock: pickup 422 no_profile, KYC uncreatable anywhere, 0 bookings ever picked_up → B9/settlement/refund/forfeiture unreachable, ledger release side dead (Case-2 B6, L1) — unblocked by T1, closed by T2
- [QUEUED] B-M0: scope audit — what Booking Manager needs for online to be complete (read-only survey)
- [QUEUED] B-M2: edit/reschedule booking (customer phone-in changes)
- [QUEUED] Then: B7 pickup walk → B9 return/settlement walk (flow order)

### T3 — unified void / cancel / deposit-refund
- [QUEUED] B-M1: cancel booking + refund path == G4 void path (ratification audit F5; also resolves paid_confirm_failed recovery — live example `66666666…` local)
- [QUEUED] Rental cancel raw flip: cancelled_at NULL, no reason, held deposit stranded, BDC not voided (Case-2 B7 — merge into the G4 void-path design with Case-1 cancel-paid)
- [QUEUED] Order cancel-paid integrity: no inventory reversal (inventory_reversed_at never fired), payment stays 'paid' with no refund record, request orphaned, customer detail hides cancellation (Case-1 BUGS 1-3)
- [QUEUED] Mixed accept = 3 manual actions on 3 pages; no single "accept payment" — forgetting step 3 strands the paid deposit (Case-3 B5)
- [QUEUED] Mixed cancel = half-cancel: order dies, booking + held deposit live on, shared request orphaned (Case-3 B4 — G4 unified void: sale + rental + mixed)

### T4 — document / ERP foundation
- [QUEUED] Document Standardization track (owner-declared 2026-07-14): single issuance service over the mig-068 engine — event-driven issuance (same event = same document regardless of channel), required-data schema per doc type (no more ฿0 docs), void = replacement chain (design TOGETHER with G4/T3), one HTML print template. Resolves B5/W8/A8/A9 structurally
- [QUEUED] Online bookings get no BDC document; RBK self-issue shows ฿0 (Case-2 B5/W8)
- [PARKED] Flow A document layer: A8 receipt → A9 tax invoice + void chain
- [PARKED] WHT capture (scaffold exists, hardcoded 0)

### T5 — POS V3 sale + fiscal docs; retire v1
- [QUEUED] POS V3 slip-upload for walk-ins (evidence-only on attempt/booking, private bucket + signed URL — fixes POS v1 public-bucket hygiene; survey done 2026-07-10, not gated by G3/G4/A1)
- [T5][T-LAUNCH] POS v1 return/settle path is GATED OFF for launch (pos.vue `POS_LAUNCH_SETTLE_DISABLED`, R-A / CHiP ruling 2026-07-25 option ก) — the deposit-refund return flow is hidden and staff are directed to the main rental-booking settle page (the mig-143 13-arg launch settlement). Re-wiring the POS return flow to the launch settlement — or retiring it with POS v1 — is T5 scope; do NOT teach pos.vue the 13-arg call before then. Ref: decisions.md 2026-07-24; docs/design/2026-07-23-t-launch-phase0.md §8.6.

### T6 — cross-surface consistency + status visibility
- [QUEUED] No unified transaction view (customer or staff) for mixed — four surfaces, four numbers, join only via the request (Case-3 W3/W1)
- [QUEUED] Booking Manager: all rows show "deposit unpaid", neither deposit visible (Case-2 B2); no work queues (Case-2 W5)
- [QUEUED] Cart pickup-day subtotal omits rental (Case-2 B1, cart-only)
- [QUEUED] Payment request stays pending_review after deposit confirmed (Case-2 W7, mirrors Case-1 orphan)
- [QUEUED] Sale slip two-surface confusion: order page reads legacy sale_order_payment_slips, real slip in central queue (Case-1 #4)
- [QUEUED] Customer list: no under-review / rejected signal (Case-1 #5)
- [QUEUED] End-date inclusive/exclusive across surfaces: customer inclusive last day vs admin/DB exclusive end (B6 Appendix D; Case-2 B3/G5 re-confirmed live — "→ 17 ก.ค." customer vs "ถึง 18 ก.ค." admin) — rental-days boundary risk
- [PARKED] A7 tracking missing on order detail page (Flow A)
- [PARKED] B1 customer branch picker missing
- [PARKED] A3 status-transition legality trigger (NICE-TO-HAVE)

### T7 — glossary / i18n / money-copy
- [QUEUED] sale_only payment template leaks booking-deposit wording (Case-1 M2); note: the mixed money-note is CONFIRMED-CORRECT (Case-3) — fix is the pure-case reuse
- [PARKED] Glossary sweep: bare มัดจำ on customer list cards + POS surfaces (Case-1/2/3 W1)

### T8 — accounting-office export pack (end goal)
- [PARKED] Accounting-office export pack (VAT register, WHT register, deposit liability ledger, cash reconciliation) — owner vision, end goal (decisions.md §c reconciliation loops)

### Cross-cutting / infra (fold into the touching track)
- [INFRA] Dev default targets REMOTE db (.env) — invert to local-default (nearly caused prod writes twice on 2026-07-09/10)
- [INFRA] Stale-'finalizing' POS attempts sweep/alert (mig-119 commit note)
- [INFRA] RLS hardening bundle: mig-070 draft-insert policy + confirmBooking dead path + legacy upsert migration (B2-fix report)
- [INFRA] Baht-vs-satang decision audit (auditor-owned; DECISIONS conflict)
- [INFRA] Empty-string Select values: 4 latent sites (USelectMenu→USelect)
- [PARKED][INFRA] A2 PDPA retention/purge (must design formal trigger-drop path vs mig-118 delete blocks)
- [DEBT][post-merge] `app/types/database.types.ts` regen: stale since mig 132, missing every 133-145 object. Forces boundary casts at return-settlement.get.ts, settlement-waive.post.ts and the launch-cancel endpoints. FIX = one batched `supabase gen types --linked`, then remove the casts. Do NOT hand-edit the generated file. OWNER: next post-merge batch.
- [DEBT][post-merge][2026-07-25] Manual no-show writes 0-amount forfeiture-shaped rows: `markRentalBookingNoShow` is NOT gated by 135 and still inserts a disposition row with `forfeitedAmount = 0` when no deposit exists — the same FICTION FAMILY as §8.8 (a record asserting money machinery that did not happen). Launch also produces no `no_show` rows at all now, since overdue bookings auto-cancel instead. FIX OR GATE within the first post-merge batch. OWNER: post-merge batch 1.
- [NICE] F-1 cancel-wrapper §F denial log: `cancelRentalBookingLaunch` currently logs no denial rows (its refusals are status/business, not privilege). Cheap to add — `launch_booking_cancel` + `decision='denied'` needs no new vocabulary.
- [DEBT] HTTP-level walk for the T-LAUNCH endpoints — **NARROWED 2026-07-25** by the post-merge smoke (docs/audit/2026-07-25-t-launch-post-merge-smoke.md). Settle (13-arg, typed lines + discount), waive (incl. the §F denial row), and cancel via customer / staff / auto-sweep are now walked at HTTP **and** in the browser. STILL OPEN, two surfaces: (1) **POS-origin cancel** — `/api/admin/pos/history/cancel` refuses web-origin bookings ("Only POS rentals can be cancelled here"; it requires `booking.pos_branch_id`) and requires super_admin, not staff; needs a POS-origin booking added to `supabase/seed.sql`. (2) **staff 20% discount tier** — the seeded staff user has no `admin_user_branch_access` row so branch-scoped settle 403s ("POS branch access required"), and super_admin bypasses that check, so only the 50% ceiling was exercised; needs an `admin_user_branch_access` row added to the seed.
- [MED][UI] Chat FAB overlaps the primary cancel CTA on the customer rental detail page at ~529px viewport width — the FAB was the topmost element over the cancel button until the page was scrolled, so the primary action of the flow is not reliably clickable at that width. Global layout concern, not launch-cancel scope. (Surfaced by the 2026-07-25 post-merge smoke, finding F-3.)
- [MED][INFRA] Dead/contradictory theme config: `app/app.config.ts:3` declares `ui.primary: "green"` while `app/assets/css/main.css:6` sets `--ui-primary: #f1b323` (gold). The CSS var wins at runtime, so behavior is correct TODAY, but the config is contradictory and could flip the brand if nuxt-ui changes precedence. Resolve to one source of truth — recommend removing the color declaration from `app.config.ts` and keeping `main.css` authoritative. (Surfaced by the DESIGN-KIT-SCOPE token extraction.)
- [MED][INFRA] Public Sans declared but never loaded: `app/assets/css/main.css:5` sets `--font-sans: "Public Sans", sans-serif`, but no font loader is installed (`@nuxt/fonts` absent, no google-fonts module), so the app silently falls back to system fonts. Either install the loader (e.g. `@nuxt/fonts`) or drop the declaration. (Surfaced by DESIGN-KIT-SCOPE §1.4.)
- [INFRA] `npx tsc --noEmit` (the command documented in CLAUDE.md + tests/CLAUDE.md) type-checks NOTHING: the root tsconfig is `files: []` + project references, so without `--build` it silently passes even on a deliberate type error. The real checks are `tsc -p .nuxt/tsconfig.server.json` / `.nuxt/tsconfig.app.json`, which currently report ~223 pre-existing errors. Either fix the documented command or record the real baseline; today the docs imply a gate that does not exist.

### T1a Phase 1 close-out (2026-07-15)
- [T1b] Company/juristic customer self-serve KYC — owner ruling: company/kyc/document.post.ts is B2B onboarding, NOT rental KYC; juristic self-serve intake builds on kyc_profiles rails in T1b (decisions.md §a addendum item 3 amendment).
- [T1b] Retire `users.kyc_status` mirror — account badge should read kyc_profiles once T1b unifies display; id-card endpoint still writes the mirror for compatibility.
- [BUG][LOW] `SectionKyc.isUuid` requires RFC-4122 version/variant nibbles — rejects non-RFC uuids (bit us with seeded `3333…` id); consider relaxing to the generic uuid regex used server-side (`asUuidOrNull`).
- [I18N] cn.json / jp.json untouched by T1a (locales disabled — per locked rule, no new keys added).
- [DONE 2026-07-25] Untracked Phase-0/session dirs dispositioned (docs cleanup): `.playwright-mcp/`, `DESIGN.md`, `PRODUCT.md`, `docs/superpowers/` deleted; `.claude/skills/` + `.impeccable/` kept on disk (installed impeccable skill + its live workspace) — all six now `.gitignore`d. Same pass removed 16 agent-feed/scaffold docs and added staleness warnings to 4 pre-118 operative docs.
- [DONE 2026-07-15] Remote apply: migrations 118–124 pushed to remote after owner-ruled test-data cleanup — see docs/audit/2026-07-15-remote-cleanup-and-migration-sync.md. Local = remote at 124, zero drift. DB password rotated by owner (post-exposure).
- [T5][DISCREPANCY 2026-07-15] Legacy refund/deposit proof uploads go to the PUBLIC catalog-media bucket (server/api/admin/rental-bookings/[id]/deposit-proof.post.ts:71-89, rental_booking_deposit_proofs.storage_bucket) — same public-bucket slip hygiene problem as POS v1 (gap-map T5). T2's settlement slip path uses the mig-113 private rental-deposit-slips chain instead; legacy path parked for T5.
- [T5] POS v1 refund-form prefill (app/pages/admin/pos.vue:1163-1174) reads legacy deposit_refund_* columns — correct within v1's own flow (v1 bookings never carry settlements) and must DIE WITH v1 at retirement; never teach it about rental_booking_settlements.
- [SCHEMA] rental_booking_deposit_action_logs action CHECK vocabulary is locked to manual_update|pos_create_override|return_refund — the T2 settlement-resume audit rides return_refund with a "resumed" change_summary marker. Formalize a dedicated action value at the NEXT migration touching that table (with the standard multi-CHECK sweep).
- [T2->T4] Settlement numbered DOCUMENT deferred to T4 by design (§b addendum item 1) — rental_booking_settlements carries what T4 needs.
- [DONE 2026-07-19] T2 remote apply: migrations 125-126 live on remote; system actor cb62c324-4aac-4392-a253-02294fb459f6 created (banned+unconfirmed, login-fail proven) + system_configs row; pg_cron enabled via the migration itself; all four post-apply probes passed; migration list local = remote through 126, zero drift.

### T3+T4 Phase 1 kickoff (2026-07-19)
- [LAUNCH BLOCKER][ACCOUNTING] (EXPANDED 2026-07-22) Accountant confirmation package: (1) forfeiture VAT treatment (non_vat_contractual_penalty, 0% per §c VAT map) + booking-terms wording covering late-cancel (<7d) forfeiture; (2) confirm BOOKING GUARANTEE Model B + the pickup-time deposit-conversion flow (decisions.md 2026-07-22 a/b); (3) review "มัดจำ" wording in ALL customer-facing terms/glossary for ป.73/2541 exposure (the word itself pulls the amount toward the VAT base); (4) obtain written tax/legal/accounting memos. Reference: docs/research/2026-07-22-no-show-forfeiture-vat-th.md (decision-support only, pending professional confirmation). Required before ruling-2 forfeitures run against real customers.
- [RULED 2026-07-23][POLICY] Unreachable-customer waiting period = 90 DAYS (decisions.md 2026-07-23 d). Applies after the refund row has failed / needs_customer_contact is exhausted, before the unreachable-close path may be used. SCOPE: the parked deposit machinery ONLY (booking_deposit_forfeiture_refund_unreachable_v1) — deposits are feature-gated off at 2026-07-22 f, so the value is DORMANT until deposit revival. Launch-era unreachable cases are NOT governed by this policy.
- [DOCS][T3] docs/customer-rental-booking-cancellation-refund-design.md §2.1 still documents the 3-day cutoff / policy _v1 — superseded by the §b 7-day tier (policy booking_deposit_refund_calendar_day_v2, walk 1). Doc refresh is outside the Phase-1 scope lock (docs = session docs + BACKLOG only); update at the next docs pass.
- [DEBT][T3 Phase-1 close gate] HTTP-level full walk owed: before Phase-1 close (post walk 8), at least one cancel flow must walk end-to-end at HTTP level (dev server, real endpoints, live document issuance). Walk-1 was psql-level on money truth + suite-level on documents (accepted 2026-07-19).
- [T3][LIMITATION] company-cancel payment_source_unresolved: bookings whose deposit was confirmed via the manual bank-slip path (no attempt/allocation id) cannot get a payment_refunds row — payment_refunds source vocabulary (081 check4) lacks a manual value. REOPENING TRIGGER: first manual-slip-era booking needing company cancel → gate a vocabulary widening (e.g. 'manual_bank_transfer' + check4 branch). Denials are §F-logged (denied/payment_source_unresolved) so occurrences are countable.

### T3+T4-core Phase 1 close-out (2026-07-19)
- [DONE 2026-07-19] HTTP-debt walk: all three debt items closed at transport level (company-cancel flow w/ live BDR document + void/reissue chain over HTTP; PATCH paid→refunded 409; staff denial row over HTTP).
- [HYGIENE][LOW] Malformed session cookie yields HTTP 500 (cookie-parse) instead of 401 on admin endpoints — pre-existing @nuxtjs/supabase behavior, observed at the HTTP walk.
- [T4-REST] Phase 2 remains per the design-doc boundary: tax_treatment config, A8/A9 sale receipt/tax invoice, WHT/50-bis, 3 reconciliation loops, settlement numbered document, refund-doc tax-invoice linkage backfill (accountant item).
- [T3][RESIDUE][LOCAL-ONLY] Immutable local residue from the walks: money_ops_decision_logs walk2_probe denied row + 2 pre-fix denied rows (order 0001 order_not_cancellable; booking B booking_not_cancellable); 1 undeletable draft probe doc (test_draft_doc — 131 guard). All self-labeling; wiped by any db reset.
- [DONE 2026-07-19] T3+T4-core remote apply: migrations 127-132 pushed to remote via --include-all (dry-run exact-six verified); pre-flight 0/0/0/0 data sanity + system_actor verified; all structural probes passed from schema dump (constraints/RPCs/guards/policies/grants service_role-only); 132 behavioral probe run OWNER-SIDE (in-txn INSERT accepted, UPDATE blocked by append-only guard, ROLLBACK, post-probe count 0 — zero residue). migration list local=remote through 132, zero drift. Types regenerated --linked (tsc clean, suite 2744 green). Code pushed at 1ddd19c.

### Deposit-conversion decision record (2026-07-22)
- [PHASE-2][DOCS] Refund-document linkage revisit: order/booking number alone is INSUFFICIENT as the credit-note/refund-document reference per the research §86/10 analysis (credit notes must cite the original tax-invoice number; e-transaction evidence needs origin/destination/time integrity). Phase-2 document design must carry full linkage (original document number + booking + refund ids). Ref: docs/research/2026-07-22-no-show-forfeiture-vat-th.md.
- [PHASE-2/T5][DESIGN INPUT] Deposit conversion chain (decisions.md 2026-07-22 b) supersedes part of the current settlement held-total model: at pickup the booking deposit closes (refund doc) and nets into the security-deposit collection instead of riding as held balance to settlement. Design impact on ledger composition (rental_held_balance_events event mix) + settlement view must be assessed at Phase-2 kickoff BEFORE building conversion document types.

### T-LAUNCH accountant agenda — CONFIRMATION MODE (2026-07-22 minimal launch)
Config values, not track start, gate on these (decisions.md 2026-07-22 minimal-launch entry; research trilogy docs/research/2026-07-22-*):
- [CLOSED 2026-07-25][ACCOUNTING][B1] §86/6 eligibility — CLOSED BY CHiP RULING: abbreviated invoices ARE permitted; the dual-type flow runs in both modes (TIA-/TIR-). The invoice-type config switch is no longer a pending global value — type is selected per transaction by customer request (decisions.md 2026-07-25 a/c). Address intake follows the type (full requires name+address per ม.86/4; abbreviated does not force it) and is now operative.
- [CLOSED 2026-07-23][ACCOUNTING][N2] Return-payment tax point + invoice dating — CLOSED BY CHiP RULING, no longer an accountant question. Tax documents are dated the STAFF ISSUE date (decisions.md 2026-07-23 a, superseding the dating clause of 2026-07-22 d); the awaiting_payment guard REMAINS in force. Disclose to the accountant for awareness: the auditor flagged that issue-date dating diverges from the ม.78/1 payment-receipt tax point.
- [LAUNCH][ACCOUNTING] Fixed-penalty (e.g. late-return flat fee, lost-item charge) classification: VAT-bearing service charge vs non-VAT damages — resolve case-by-case AS CASES ARISE (genuine damages stay off-web per decisions.md c). Not a launch blocker; log each ruling here.
- [SUPERSEDED 2026-07-22] The 2026-07-19 forfeiture/Model-B accountant blocker (above, T3+T4 kickoff section) is PARKED with the deposit machinery — deposits are feature-gated off for launch (decisions.md 2026-07-22 f). Revives only behind the two gates (card-hold + ป.73/2541 memo, report 2).
- [CLOSED 2026-07-25][ACCOUNTING][B2] Document number format — CLOSED BY CHiP RULING: the printed number does NOT embed a branch code. mig-136 per-branch sequences stay as applied, `f_next_document_number` is unchanged, format stays PREFIX-YYYYMM-NNNN. Branch identity lives in the seller address block on the template (head office, branch code 00000); VAT registration is the head office (decisions.md 2026-07-25 b). Closed before any tax document issued, so zero migration cost.
- [LAUNCH][ACCOUNTING][DISCLOSE] VAT treatment = inclusive (CHiP 2026-07-23) — quoted prices contain VAT; register net figures are extracted. Ref design doc §8.10/§8.11.
- [LAUNCH][ACCOUNTING][DISCLOSE] Invoice dating = staff issue date, diverging from ม.78/1 payment-receipt tax point (decisions.md 2026-07-23 a) — disclose the VAT-period-boundary consequence. Ref design doc §8.11.

### T-LAUNCH accountant agenda — FINAL STATE (migration track closed 2026-07-24)
**B1 and B2 are CLOSED (CHiP, 2026-07-25 — decisions.md). THREE accountant items remain before real tax documents issue:**
- [LAUNCH][ACCOUNTING][1 of 3] rental_extension confirmation: confirm the per-day late-return charge is RENTAL INCOME (VAT 7% + future WHT 5%), not a penalty (decisions.md 2026-07-24 a).
- [LAUNCH][ACCOUNTING][2 of 3] actual_damage / contractual_penalty non-VAT MEMO: required before either charge_type is enabled (they are representable-but-disabled at launch).
- [LAUNCH][ACCOUNTING][3 of 3][DISCLOSE] Disclosure items — VAT treatment = inclusive, and invoice dating = staff issue date (diverges from the ม.78/1 payment-receipt tax point). Decided, not open; the accountant must be TOLD, and the VAT-period-boundary consequence surfaced. Ref design doc §8.10/§8.11.
- [CLOSED 2026-07-25] B1 (§86/6 eligibility) and B2 (branch code in the document number) — see the CONFIRMATION MODE section above and decisions.md 2026-07-25.
