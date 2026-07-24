# T-LAUNCH — Phase 0 survey + design pass

Status: **APPROVED DESIGN** (Phase 0 closed 2026-07-23). Survey is read-only evidence with file:line citations; the design pass is the agreed shape for Phase 1. Supersedes nothing; implements decisions.md 2026-07-22 (minimal launch) + 2026-07-23 (dating, dual invoice types, penalties, unreachable period).
Branch: feature/t-launch (branched off staging at bbc26a7). Phase 1 implementation had NOT begun when this document was written.

## 0. HARD CONSTRAINT — CENTRAL DOCUMENT ENGINE ONLY (CHiP re-affirmed 2026-07-23)

**EVERY document type in T-LAUNCH — STM-, both TIR- variants, and the credit note — issues through the central mig-068 engine ONLY.**

- Numbering: `f_next_document_number` (068:155) — the sole number source. No client-side numbering, no per-surface counters.
- Store: `public.official_documents` (068:213) — the single document store. No side tables, no per-type document tables.
- Correction: the mig-131 void = reissue chain (131:28, 131:99). Issued documents are NEVER edited.
- Audit: mig-132 `money_ops_decision_logs` for issuance/void decisions.

**NO parallel issuance path. No direct INSERT that bypasses the engine. In ANY surface, including POS.**

This binds equally to admin endpoints, POS v1/v2/v3, customer-facing self-issue, and any future channel. It is a ratified ERP standard, not a preference.

**If any design detail appears to require a bypass, STOP and raise it — do not build around the engine.** A bypass discovered later is a correctness incident, not a refactor.

## A. DOCUMENT ENGINE — how STM-/TIR-/credit-note plug in

A1. **document_type is FREE TEXT, not an enum.** official_documents.document_type is TEXT NOT NULL (068:215) and its only CHECK is non-emptiness (068:244). document_sequences.document_type is likewise TEXT (068:131,139).
=> **CONSEQUENCE: adding STM-/TIR-/credit-note types needs NO migration on the type columns.** New types are a code-level constant, exactly as the existing types already are (e.g. "rental_booking_deposit_refund_confirmation" in server/utils/admin-refunds.ts:30). This is the single biggest scope reducer in the survey.

A2. **Numbering is per (document_type, period), GLOBAL across branches.** f_next_document_number hardcodes v_sequence_key := 'global' (068:167) and the sequence UNIQUE is (document_type, sequence_key, period) (068:143). p_branch_id is STORED on the sequence row but is NOT part of the key.
=> STM-/TIR- series will be one global run per month per type: TIR-202607-0001 upward. If the accountant ever requires per-branch series, that is a real migration (new sequence_key semantics), not a config change. **AMENDED by OD-4 (§7) — per-branch series is now ruled; see §8.4.**

A3. **Number format is fixed:** prefix || '-' || period || '-' || lpad(n,4,'0') (068:206). 4 digits => 9,999 documents per type per month before collision. Adequate for launch; noted as a known ceiling.

A4. **Prefix drifts silently.** The sequence upsert does DO UPDATE SET prefix = EXCLUDED.prefix (068:199-201). Two callers passing different prefixes for the same (type, period) will overwrite each other's prefix without error. Existing risk, inherited; T-LAUNCH must centralize prefix constants so STM-/TIR- can never be passed inconsistently.

A5. **Issue-date dating (decisions 2026-07-23 a) is ALREADY the engine's behavior.** Both issuance paths stamp issued_at = new Date() at the moment of issuance: server/utils/admin-refunds.ts:397,464 (issuedAt) and server/utils/admin-document-void.ts:227. Nothing collects or propagates a payment date into issued_at today.
=> **The 2026-07-23 a ruling requires NO change to the engine — it ratifies existing behavior.** The work is to NOT introduce payment-date dating when building TIR-, plus the period for numbering must be derived from the same issue timestamp (admin-document-void.ts:195 already does exactly this).

A6. **Void = reissue chain is complete and reusable.** f_void_official_document (131:28) is the only void writer, super_admin-enforced at 131:44, idempotent on replay (131:60), and refuses anything not issued/printed (131:65). f_mark_official_document_replaced (131:99) does the voided->replaced flip. The wrapper reissueOfficialDocument (server/utils/admin-document-void.ts:156-262) already does: load -> require status voided (:175) -> idempotency guard on original_document_id (:182-189) -> fresh number (:198) -> insert replacement with original_document_id linkage (:222) -> 'issued' event (:243) -> replaced flip (:250).

A7. **BUT the reissue path is SAME-TYPE ONLY — this is the gap for decisions 2026-07-23 b.** The replacement copies document_type (admin-document-void.ts:216), template_key/version (:233-234), snapshot (:235) and all totals (:229-231) verbatim from the original, and derives prefix from the original's document_no (:194).
=> The abbreviated->full upgrade needs a DIFFERENT document_type, a DIFFERENT template, a DIFFERENT prefix and a RE-RENDERED snapshot (full form must carry buyer name/address that the abbreviated omitted). reissueOfficialDocument CANNOT serve this as written. T-LAUNCH needs a distinct path (proposed: issueUpgradedTaxInvoice) that voids via the same 131 RPC but composes a fresh full-form document rather than cloning. The 131 RPC itself needs no change.

A8. **Immutability is trigger-enforced and compatible.** guard_official_document_finalized_updates (068:258-297) blocks post-issue mutation of totals, customer identity, source, template, snapshot and document_no. Void touches only status/voided_at/voided_by/void_reason — zero intersection (131:16-18 states this explicitly). The upgrade path therefore cannot cheat by editing; void+reissue is structurally the only route, exactly as decisions 2026-07-23 b requires.

A9. **Decision log (132) is the §F audit rail.** money_ops_decision_logs has actor_user_id/actor_role (132:25-26), append-only. Existing operations include document_void. TIR- issuance and the abbreviated->full upgrade should log through the same util (server/utils/money-ops-log.ts) with new operation values.
**CORRECTION (post-survey):** the earlier remark that `operation` is free-text with no CHECK expected was WRONG. `modl_operation_chk` IS a closed vocabulary (132:36-43) and requires a widening migration — see OD-6 and §8.1 migration 138.

## B. SETTLEMENT / RETURN FLOW — attachment points

B1. **Return-time charging already exists in skeleton form.** f_settle_rental_booking_return (125:187) is the writer authority, taking penalty lines, discount, signatures, slip evidence (125:188-197). The endpoint is server/api/admin/rental-bookings/[id]/return-settlement.post.ts, orchestrating via server/utils/rental-return-settlement.ts.

B2. **CRITICAL GAP — there is NO awaiting_payment state on rental settlements.** rental_booking_settlements (125:76) has NO status column at all; it is a terminal, write-once record (UNIQUE(booking_id) at 125:100, mutation blocked by rental_booking_settlements_block_mutation at 125:144). Every awaiting_payment in the repo belongs to ORDERS or manual payment requests, never to rental settlements: orders enum (009:21,53), manual_payment_requests (115:57-58), payment-core.ts:46, admin-order-queue.ts:36.
=> **The guard in decisions 2026-07-22 d / 2026-07-23 a has nothing to attach to on the rental side today.** T-LAUNCH must CREATE the state it guards on. This is the single largest genuine gap found and it is a migration, not a wiring task. **Resolved in shape by OD-3 (companion row) — see §8.1 migration 133.**

B3. **The current settlement model assumes a held balance to release.** f_settle_rental_booking_return derives from posted rental_held_balance_events (125:256,331) and the ledger vocabulary is collection/application/refund/forfeiture (094:43-50). Under minimal launch there is NO collection event, so held_total = 0 and the whole apply/refund/forfeit branch is inert.
=> Return-time CHARGING (customer owes money at return) is a genuinely NEW money direction, not a re-use of the settlement math. Confirms the BACKLOG "[PHASE-2/T5][DESIGN INPUT]" warning that the held-total model is partially superseded.

## C. DEPOSIT SURFACES THE FEATURE-GATE MUST COVER (parked, not deleted)

C1. API endpoints (server/api/admin/rental-bookings/[id]/): record-deposit.post.ts, deposit.patch.ts, deposit-proof.post.ts, deposit-slips.get.ts + deposit-slips/, late-cancel-forfeit.post.ts, mark-no-show.post.ts, no-show-documents/, pickup.post.ts (collects remaining security deposit).

C2. RPCs: f_confirm_rental_booking_deposit, f_cancel_rental_booking_admin (129), f_cancel_customer_rental_booking_refund_request (082), f_auto_mark_rental_no_shows (126), f_rental_no_show_boundary_passed, f_settle_rental_booking_return (125, deposit-dependent branches).

C3. **CRON — live scheduled job.** 126:217 cron.schedule fires f_auto_mark_rental_no_shows() daily at 17:00 UTC (00:00 Bangkok). Under minimal launch there are no deposits to forfeit, so it would run and find nothing — harmless but noisy. **RULED by OD-5: unschedule by migration; the RPC is retained (parked, not dropped).**

C4. Ledger event types (094:43-50): booking_deposit_collection and remaining_security_deposit_collection become unreachable; settlement_application/refund/forfeiture become unreachable for deposits. **Do NOT remove from the CHECK** — the historical rows on remote (see docs/history/2026-07-22-remote-flow-test.md §4) reference them and are append-only. Vocabulary stays; only the writers get gated.

C5. UI: **31 files** under app/ reference booking/security deposit. Principal surfaces: app/pages/asset/[slug].vue, app/pages/user/cart.vue, app/pages/user/rentals/[bookingId].vue, app/pages/rental-booking-payment/[bookingId].vue, app/pages/mixed-checkout/[sessionId].vue, app/pages/admin/rental-bookings/[id].vue, POS v1/v2/v3 index pages, app/components/admin/AdminBookingDepositConfirm.vue, AdminPosV3FutureBookingDepositQrContainer.vue, AdminPosTotalSummary.vue, AdminPosV3BookingContext.vue.

C6. Domain constants: server/utils/rental-booking-deposit-payment.ts:50-52 (agreement type, terms version), admin-rental-booking-deposit-confirmation-document.ts:10-16 (BDC doc type/template), pos-rental-booking-deposit-finalizer.ts:10, admin-rental-print-form.ts:33 (BOOKING_DEPOSIT_NOTICE), assets.deposit_amount column (admin-asset.ts:345).

## D. CONDITIONAL ADDRESS INTAKE

D1. **The address field already exists and is already mandatory-by-schema.** customer_tax_profiles.billing_address TEXT NOT NULL (068:72) with a non-empty CHECK (068:91); legal_name and tax_id likewise NOT NULL + non-empty (068:67-69, 088-090).
=> "Conditional" cannot mean a nullable column without altering these CHECKs. It means: **do not CREATE a tax profile at all unless a full invoice is requested.** Abbreviated => no tax profile row; official_documents.tax_profile_id is already nullable (068:220). Clean fit, no schema change needed for the conditional behavior itself.

D2. **KYC stays separate — confirmed.** kyc_profiles/kyc_documents/kyc_pickup_overrides (105:73,118,142), kyc_document_access_log (109:57), kyc_verification_decisions (112:53) share no FK or column with customer_tax_profiles. Tax identity and KYC identity are independent, as required.

D3. customer_tax_profiles carries a review_status workflow (068:75, CHECK 068:86) defaulting to 'draft'. **RULED by OD-6: review_status does NOT block issuance; instead the issuing staff user id is mandatory on every tax document.**

## E. SALES-VAT REPORT EXPORT — data sources

E1. Primary source should be **official_documents** itself: it carries subtotal/vat_amount/total_amount/currency_code (068:231-234), document_type, document_no, issued_at, status, branch_id, and is indexed on (document_type, issued_at DESC) (068:317). A VAT sales register is a filtered read over issued+replaced+voided TIR- rows in a period. **No new table required for the register.**

E2. payment_allocations (068:361) already carries vat_treatment/net_amount/vat_amount/gross_amount (:368-371) — usable as the cash-side cross-check in a reconciliation loop.

E3. financial_recognition_events is **NOT** a general VAT source. Its CHECKs pin it to deposit forfeiture only: recognition_type must be 'booking_deposit_forfeiture_income', tax_treatment must be 'non_vat_contractual_penalty', vat_rate and vat_amount must be 0, source_type must be a disposition event. It is deposit machinery and gets parked with it; do not attempt to route rental VAT through it without widening those CHECKs.

E4. Voided/replaced documents must appear in the register with their status (reconciliation loop 1 accounts for voided numbers — stated at 131:20-22). The report must not silently drop them.

## F. ORIGINAL DESIGN PASS (retained for audit trail; see §8 for the post-ruling design)

F1. PROPOSED MIGRATION LIST — **SUPERSEDED by §8.1.**

F2. FEATURE-GATE STRATEGY (parked, not deleted — decisions 2026-07-22 f)
- **Layer 1, DB (authoritative):** deposit-writing RPCs fail closed when the gate is off. Fail-closed at the writer is the only gate that cannot be bypassed by a forgotten UI branch — consistent with OPERATING-MODEL §3.
- **Layer 2, server:** deposit endpoints (C1) return 404/409 when gated; no silent success.
- **Layer 3, UI:** the 31 files (C5) hide deposit affordances. Cosmetic only — never the security boundary.
- **Untouched:** ledger CHECK vocabulary (C4), historical rows, BDC document type, migrations 076-132. Nothing is dropped or renamed, so revival is re-enabling a flag plus un-gating writers, not re-migrating.

F3. STM-/TIR- SCHEMA SKETCH — **SUPERSEDED by §8.2** (prefix collision resolved by OD-2).

F4. GUARD PLACEMENT
- **In the DB, inside the issuance path, not in the endpoint.** Endpoint-only guards are bypassable by any future caller; OPERATING-MODEL §3 requires guard-before-side-effect and fail-closed.
- Applies to TIR- and credit-note types ONLY. STM- is explicitly exempt (it exists precisely to be issuable pre-payment).
- Dating stays issue-date (A5) — the guard controls WHETHER, never WHAT DATE.

F5. OPEN DECISIONS — **ALL CLOSED by §7.** Retained for audit trail: OD-1 remote apply timing; OD-2 TIR full/abbreviated numbering collision; OD-3 settlement status shape; OD-4 per-branch vs global series; OD-5 no-show cron; OD-6 tax-profile review_status; OD-7 STM void/coexist.

F6. WHAT PHASE 0 DID NOT DO
- No code written, no files created or modified, no migration files, no tests, no remote calls, no staging of anything. Branch feature/t-launch was at bbc26a7, identical to staging.

## 7. CHiP RULINGS — 2026-07-23 (all seven open decisions closed)

### OD-1 — Remote migration application: ON-BRANCH
Migrations 133+ MAY be applied to remote Supabase directly from `feature/t-launch`, **after each migration's individual SQL gate clears** (full SQL in one submission, auditor verdict via CHiP). Rationale: there are no real customers on live yet, so the cost of schema landing ahead of merge is acceptable and the feedback loop is faster.
**The standing SQL gate is NOT waived by this ruling** (OPERATING-MODEL §3 + §7.1). On-branch application changes WHEN remote may be touched, never WHETHER a gate is required.
If the design shifts mid-track, corrections are **forward migrations only** — no editing or reverting an applied migration.

### OD-2 — Distinct prefixes for the two TIR variants
The two tax-invoice variants are separate `document_type`s and therefore draw from separate sequences (068:143). Sharing a prefix would produce two colliding number runs in the same period. Ruled: **distinct prefixes**.
- Full tax invoice — document_type `rental_tax_invoice_receipt_full`, prefix **`TIR`** (retains the ratified series name; it is the fail-safe default and the expected majority).
- Abbreviated tax invoice — document_type `rental_tax_invoice_receipt_abbreviated`, prefix **`TIA`**.
Recorded as a supersession note against decisions.md 2026-07-22 b ("series TIR-"), which pre-dated the two-variant split.

### OD-3 — Companion payment-state row
The `awaiting_payment` tax-point guard attaches to a **COMPANION payment-state row**, not to `rental_booking_settlements`. That table's write-once contract (UNIQUE(booking_id) 125:100; mutation blocked by `rental_booking_settlements_block_mutation` 125:144) is **UNTOUCHED**. See §8 for the shape.

### OD-4 — Per-branch document series
`sequence_key` moves from the hardcoded `'global'` (068:167) to **branch-scoped**, migrated **BEFORE the first tax document ever issues**.
Whether the document NUMBER FORMAT itself embeds a branch code (e.g. `TIR-BKK01-202607-0001` vs `TIR-202607-0001`) is an **accountant question** — added to the §86/6 agenda in docs/BACKLOG.md.
**BLAST-RADIUS CONSTRAINT (raised in survey, must be honoured by migration 136):** eight call sites across seven utils use the engine for existing types, and remote already holds `sequence_key='global'` rows with issued documents drawn from them. The migration MUST NOT re-key existing sequences in a way that could re-issue a consumed number. Shape CONFIRMED — see §8.4.

### OD-4 REVISION (2026-07-23) — original shape WITHDRAWN against live data
The confirmed `coalesce(p_branch_id,'global')` for ALL types was withdrawn: 7 of 9 live `document_sequences` rows carry a real branch_id while keyed 'global', and **all 7 call sites** (corrected from the survey's "8" — the 8th grep hit was a comment at admin-document-void.ts:11) can pass one, so universal keying would have restarted consumed counters and re-drawn issued numbers (e.g. BDR-202607-0001). The auditor's §8.4 confirmation of the original shape is formally RETRACTED. Ruled replacement: **R1** type-aware keying (branch-scoped for the 4 tax types only; legacy keeps 'global' unconditionally); **R2** hard refusal `TAX_DOCUMENT_BRANCH_REQUIRED` for a tax draw with no branch (no global fallback); **R3** prefix-constant centralization is Phase-1 CODE, not a migration; **R4** call-site count = 7.

### OD-5 — Unschedule the no-show cron
The pg_cron job scheduled at 126:217 (`f_auto_mark_rental_no_shows()`, daily 17:00 UTC / 00:00 Bangkok) is **UNSCHEDULED by migration**. Under minimal launch there are no deposits to forfeit, so the job has no work. Revival re-adds the schedule. The RPC itself is retained (parked, not dropped) — only the schedule is removed.

### OD-6 — Issuing staff identity is MANDATORY on tax documents
`customer_tax_profiles.review_status` (068:75) does **NOT** block issuance — a `draft` profile may back an issued full invoice.
**BUT every TIR-/credit-note issuance MUST carry the issuing staff user id**, enforced NOT NULL on the issuance path (`official_documents.issued_by`, 068:228, is nullable at schema level — the guard enforces it for tax types), **and MUST be logged through `money_ops_decision_logs`** using the mig-132 actor fields (`actor_user_id`, `actor_role`, 132:25-26).
**Consequence:** `modl_operation_chk` (132:36-43) is a closed vocabulary and does not contain an issuance value — it requires a widening migration. `modl_entity_type_chk` already permits `'official_document'` (132:50-52) and needs no change.

### OD-7 — STM- coexists with TIR-
The statement of charges is **NEVER voided or superseded** when the tax invoice issues. Both documents coexist permanently.
**TIR- cites the STM number in its snapshot** for chain traceability (STM number -> TIR number). STM- therefore needs **no void wiring at all**, which removes it from the void/reissue surface entirely.

## 8. DESIGN UPDATES FOLLOWING THE RULINGS

### 8.1 Migration list (each gated; on-branch remote apply per OD-1) — TRACK CLOSED
- **133** companion payment-state row + tax-point guard (OD-3). ✅ APPLIED `246927e`.
- **134** return-charge money direction (J-1..J-5). ✅ APPLIED `12108cb`. Releases I-3.
- **135** deposit feature-gate (K-1..K-5). ✅ APPLIED `6939f7b`. Method: **Option B rename-and-wrap** (CHiP 2026-07-23) — the four money RPCs (737 lines) were RENAMED to `*_ungated` and wrapped, not re-typed, so the guard delta is auditable and the bodies are md5-proven byte-identical.
- **136** per-branch tax document series (OD-4 revised; R1-R4). ✅ APPLIED `a101597`.
- **137** unschedule no-show cron (OD-5). ✅ APPLIED `f7c817f`.
- **138** tax-issuance decision-log vocabulary (OD-6). ✅ APPLIED `5ed8be0`. Two ratified OMISSIONS: NO `tax_document_upgrade` (decomposes into `document_void` + `tax_document_issue`; linkage lives in official_documents.original_document_id + document_events) and NO STM-to-modl (STM is an operations document, audited in document_events). Do not "fix" these.
- **139** tax-point INSERT trigger (L-1..L-4). ✅ APPLIED `932747c`. **LIST INVARIANT: 139's tax-type list == 133's EXACTLY (3 types — guard scope). 136's list is a deliberate SUPERSET (4 types — adds STM, numbering scope). STM must NEVER be added to 133 or 139.**
- **140** suppress held-balance fiction (2-line mechanical delta). ✅ APPLIED `9c77922`. Releases §8.8.
- **141** remove unreachable waive denial log (§8.9 half 1). ✅ APPLIED `741581f`.
- **142** charge_type taxonomy schema (M-2 split, schema half). ✅ APPLIED `1b83ae1`. **RENUMBERED from "142a": the Supabase CLI requires numeric migration versions (`<timestamp>_name.sql`), so a letter-suffixed split is impossible — the CLI silently SKIPS such files with a warning, not an error. The M-2 "142a/142b" labels became sequential 142/143.**
- **143** staff-charge channel + discount tiers + pending_review gates (Option A; R-A/R-B/R-C; M-1..M-5). ✅ APPLIED `cb0f4de`. Releases §8.12.
**Total: 11 migrations, all applied local + remote, parity, zero drift.**

**STANDING PRINCIPLES recorded across the track:**
- **J-2 vocabulary carrying:** a migration carries the CHECK value it needs — no window where running code hits a rejection.
- **modl permanence:** money_ops_decision_logs is append-only; a value is removable only until its first committed use, then permanent. Every modl widening was argued down to the minimum for this reason.
- **R-A signature change:** launch does not overload the settle RPC's parameters onto penalty_lines; the 10-arg form was DROPPED and a 13-arg form created (one signature proven post-apply).
- **R-B privilege lookup:** a privilege decision (discount tier) reads platform_role from the DB in-transaction, never from a caller claim — distinct from confirm/waive, which take p_actor_role for audit attribution only.
- **R-C document projection:** the launch discount is not stored on the settlement row; documents derive it as SUM(gross charge lines) − amount_due, keeping documents projections of the money rows (no negative allocation rows).
- **BUILD METHOD:** scripted extraction of a prior applied body (used for 135/140/141/143) eliminates hand-transcription risk on money functions, but shifts the risk to BOUNDARY HANDLING — 143 hit three build defects (missing arg-list comma; a `%%%%` RAISE format passing 3 args to 2 placeholders; an awk range dropping a two-line GRANT's second line). All three failed LOUDLY at apply, none reached remote, and the RAISE hit triggered a full audit of all 20 RAISE statements. The lesson: the method is correct for content fidelity; verify the assembled file compiles (a reset) before trusting it, never the exit status.

### 8.2 Document type + prefix contract (OD-2, OD-7)
- STM — type `rental_statement_of_charges`, prefix `STM`, template `rental_statement_of_charges_v1`, source_type `rental_booking`. Carries the mandatory ไม่ใช่ใบกำกับภาษี disclaimer; MAY show estimated VAT; MUST NOT carry any of the 8 forbidden tax-invoice elements (research report 3). **NOT a tax document => NOT subject to the awaiting_payment guard** (that split is the whole point of two stages). Never voided (OD-7).
- TIR full — type `rental_tax_invoice_receipt_full`, prefix `TIR`, template `_full_v1`, `tax_profile_id` REQUIRED, snapshot cites the STM number.
- TIA abbreviated — type `rental_tax_invoice_receipt_abbreviated`, prefix `TIA`, template `_abbreviated_v1`, `tax_profile_id` NULL, snapshot cites the STM number.
- Credit note — type `rental_credit_note`, prefix `CDN`, cites the original tax-invoice number in snapshot (§86/10) and links via `original_document_id`.

**SOURCE-CONVENTION CONTRACT (L-1/L-2, ruled 2026-07-23):** tax documents (TIR full / TIA abbreviated / CDN) carry `source_type='rental_booking_settlement'` + `source_id`=the settlement id. The 139 trigger and the Phase-1 issuance wrapper BOTH read from this — they must agree or every tax insert fails closed (`TAX_DOCUMENT_SOURCE_UNMAPPED`). `'rental_booking'` is the retained SECOND mapping arm (used by RBK/pickup/return forms). CDN maps through its settlement likewise; original_document_id carries the §86/10 chain linkage.

### 8.3 Abbreviated -> full upgrade path (decisions 2026-07-23 b)
Survey §A7 established that `reissueOfficialDocument` (admin-document-void.ts:156-262) is **same-type only** — it clones document_type (:216), template (:233-234), snapshot (:235) and totals (:229-231), and derives prefix from the original number (:194). It CANNOT perform the upgrade.

**Design:** a distinct path (working name `issueUpgradedTaxInvoice`) that:
1. voids the abbreviated via the SAME `f_void_official_document` RPC (131:28) — no new void writer;
2. composes a FRESH full-form document (new type, new template, re-rendered snapshot carrying buyer name/address, new prefix `TIR`) through `f_next_document_number`;
3. links `original_document_id` to the voided abbreviated and flips it via `f_mark_official_document_replaced` (131:99);
4. dates the replacement at the issue moment (decisions 2026-07-23 a);
5. logs through mig-132 per OD-6.

**The 131 RPCs need NO modification** — only a new composing wrapper. This stays inside the §0 hard constraint: same engine, same store, same void chain.

### 8.4 Per-branch series — CONFIRMED shape (OD-4, CHiP ruling 2026-07-23)
`f_next_document_number` currently hardcodes `v_sequence_key := 'global'` (068:167). **Confirmed shape:** derive `v_sequence_key` as `coalesce(p_branch_id, 'global')`, so:
- **NEW types (STM/TIR/TIA/CDN) get per-branch sequences immediately** — they have no history to preserve.
- **EXISTING types keep their `'global'` rows intact** whenever `p_branch_id` is NULL, which is how several existing callers already invoke it (e.g. admin-refunds.ts:402 passes `detail.booking?.hubId ?? null`). Existing consumed numbers are never re-issued.
- Residual risk: an existing caller that DOES pass a branch id would start a new per-branch run for its type. **All 8 call sites must be enumerated call-site by call-site at the 136 gate** — mandatory gate content, not an assumption.

### 8.5 Guard placement (unchanged from the approved pass)
In the DB, inside the issuance path — never endpoint-only (OPERATING-MODEL §3: guard before the side effect, fail closed). Applies to TIR/TIA/CDN only; STM exempt. Dating stays issue-date — the guard controls WHETHER, never WHAT DATE.

### 8.6 Feature-gate strategy (unchanged from the approved pass)
Three layers — DB fail-closed writers (authoritative), server endpoints, UI (31 files, cosmetic only, never the security boundary). Ledger CHECK vocabulary (094:43-50), historical rows, BDC type and migrations 076-132 are untouched, so revival is re-enabling a flag plus un-gating writers.

### 8.7 MERGE-BLOCKER register (feature/t-launch → staging)
**✅ RELEASED:**
- **I-3** writer-derived amount_due — released by 134 (J-4 definition ก).
- **§8.8** held-balance fiction — released by 140 (v_held>0 gate).
- **§8.12** settlement-row fiction — released by 143 (Option A: launch keeps penalty_lines empty → row 0/0/0; charges travel the typed staff-charge channel).
**🚫 OPEN — feature/t-launch may NOT merge until all clear:**
- **K-1** launch-era cancellation (slot-release) path. Both cancel RPCs are gated OFF (135); launch has no cancel path yet. Release: a launch slot-release path exists. CHiP note: the legacy cancel shape may never be reused; the future form is undecided — do NOT design it yet.
- **R-A** TS settle wrapper. 143 DROPPED the 10-arg settle signature; `server/utils/rental-return-settlement.ts` → `return-settlement.post.ts` must ship the 13-arg call (typed staff-charge lines + discount) before merge. Release: the wrapper calls the new signature.
- **§8.9 half 2** waive denial logging. 141 removed the unreachable in-RPC denial write; the waive ENDPOINT must write the denial row in TypeScript before the 403 (129/131 wrapper pattern). Release: the waive wrapper §F-logs denials.
All three are PHASE-1 work (wrapper/endpoint/UI). The migration track is done; Phase 1 owns the release conditions.

### 8.8 KNOWN FICTION — held-balance collection that has not happened (migration 140, MERGE-BLOCKER)
**What it is.** When `held = 0` and `penalties > 0`, the inherited 125 ledger branch (125:295-310, carried byte-unchanged through 133 and 134) writes BOTH a `settlement_additional_collection` event and a `settlement_application` event of the same amount. They net to zero, so the residue-0 invariant passes.

**Why it is a fiction under minimal launch.** `settlement_additional_collection` ASSERTS that money was collected at settlement time. Under T-LAUNCH the customer has NOT paid at that moment — payment is confirmed later via `f_confirm_settlement_payment`. The ledger therefore claims a collection that does not exist.

**Why it was accepted for 134** (CHiP ruling, FINDING A option (i)): the pair self-cancels, residue stays 0, the held-balance ledger is parked deposit machinery, and suppressing it would have made 134's delta unprovable against the approved "amount_due extension only" scope.

**Release condition — migration 140** suppresses the pair when `held = 0` and no deposit exists. **This is a MERGE-BLOCKER: the fiction must not cross to staging.**

**Do not "fix" this by widening the 094 event_type vocabulary** — that CHECK is deposit machinery and is protected by survey §C4. The fix is suppression, not new event types.

### 8.9 Waive denial logging — migration 141 + wrapper (ONE condition, Phase-1 bound)
**Defect found at the 134 read-back gate.** `f_waive_settlement_payment` writes a §F denial row to `money_ops_decision_logs` and then `RAISE EXCEPTION`s. The RAISE aborts the transaction and rolls back the INSERT — **the denial row can never persist.** Proven deterministically: modl count before = 0, call as `staff` -> ERROR SETTLEMENT_WAIVE_SUPER_ADMIN_ONLY, count after = 0. Confirmed identically on remote (zero new rows).

**Root cause.** The §F inversion was reproduced in SQL without carrying over the reason it lives in TypeScript. Every existing §F path logs the denial in the WRAPPER, not the RPC — stated explicitly at 131:24 ("§F operation='document_void' is logged by the WRAPPER"), and implemented the same way for 129's company-cancel.

**Impact.** NOT a data-integrity or security defect: the refusal works, and no bad state can be written. It is dead code creating a false impression of audit coverage — waive denials are currently unaudited, silently. That silence is the actual risk.

**THE TWO HALVES ARE ONE CONDITION** (CHiP ruling): the waive endpoint is not §F-complete until BOTH land.
- **Half 1 — migration 141:** CREATE OR REPLACE `f_waive_settlement_payment` removing the unreachable INSERT, with a header comment stating that denial logging is the WRAPPER's duty per the 129/131 pattern.
- **Half 2 — Phase 1 wrapper:** the waive endpoint writes the denial row in TypeScript BEFORE returning 403, mirroring `companyCancelRentalBooking`.

**Generalization worth carrying:** no plpgsql function may log a denial and then RAISE in the same transaction. If an RPC must refuse, the refusal is the RPC's job and the audit trail is the caller's.

### 8.10 Money-path rulings ratified 2026-07-23 (migration 134 gate)
- **VAT treatment = INCLUSIVE** (CHiP). The customer pays exactly the quoted price; VAT is extracted from the gross rather than added on top. Seeded in `system_configs` key `tax.vat` as `{"rate_percent": 7, "treatment": "vat_inclusive"}`, read fail-closed by `f_tax_vat_config()` — an absent or malformed config RAISEs, never a silent default rate (J-5). The rate/treatment can change without a migration; that is deliberate.
- **Early return = NO CREDIT** (CHiP, re-ratified for the money path). A customer returning before `end_date` is charged the full booked total; `late_days` floors at 0 via GREATEST and never produces a negative charge. Consistent with the standing T2/T3 decision.
- **End-date semantic = EXCLUSIVE**, asserted defensively. 134 RAISEs `SETTLEMENT_BOOKING_DATE_FIELDS_INCONSISTENT` when `rental_days <> (end_date - start_date)`. Rather than bill against the inclusive/exclusive ambiguity flagged in BACKLOG T6, a self-inconsistent booking refuses to settle.
- **No new money table.** `payment_allocations` (068:361) already carries direction/status/vat_treatment/net/vat/gross with a gross = net + vat consistency CHECK, and is written by 9 existing utils. Charge lines are written `pending` at settlement and flipped `confirmed` at payment — money before state, always.

### 8.11 ACCOUNTANT DISCLOSURE LIST (carry to the meeting alongside §86/6)
These are decided, not open — but the accountant must be TOLD, because each departs from a default they may assume:
1. **VAT treatment is inclusive** (§8.10) — quoted prices contain VAT; the register's net figures are derived by extraction.
2. **Document number format under per-branch series** (OD-4) — whether the printed number must embed a branch code. Tracked as BACKLOG item B2; **cannot be changed after the first tax document issues.**
3. **Invoice dating diverges from ม.78/1** (decisions.md 2026-07-23 a) — documents are dated the STAFF ISSUE date, not the payment-receipt tax point. The `awaiting_payment` guard still prevents issuance before payment, so the divergence appears only when issuance lags payment; if that lag crosses a VAT-period boundary, the document date and the tax point fall in different periods.

## CARRY-OVER

Sections §A–§F above are the approved Phase 0 pass reproduced verbatim, with these deltas: §F1 migration list superseded by §8.1; §F3 schema sketch superseded by §8.2 (prefix collision resolved by OD-2); §F5 open decisions ALL CLOSED by §7, retained for audit trail with their rulings appended; §A2 amended by OD-4; the §A9 remark that no CHECK widening was expected is CORRECTED — see OD-6.
Post-Phase-0 additions: §8.7 merge-blocker register, §8.8 known fiction (migration 140), §8.9 waive denial logging (migration 141 + wrapper), §8.10 money-path rulings, §8.11 accountant disclosure list. Migration list §8.1 now spans 133-141 with 133 and 134 applied.
