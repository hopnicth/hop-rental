# GATE LOG — HOPNIC three-party pipeline

Standing practice from **2026-07-25 (CHiP)**: every gate verdict gets ONE line here,
written as part of the task that carries the gate — not retrospectively, not in batch.

Rule this file enforces (OPERATING-MODEL §7.1): a gate is CLOSED until the auditor's
confirming reply. A push authorization elsewhere in the same task never waives it.
Each gate resolves independently.

Columns (pipe-delimited, one line per gate — no markdown table, per §7.2 transport):
`DATE | GATE | SCOPE | VERDICT | CONFIRMED-BY | REF`

- **DATE** — ISO date the verdict was received (not the date work started).
- **GATE** — the gate's register id (e.g. `§8.7 R-A`, `mig-145`, `wording:decisions-2026-07-25`).
- **SCOPE** — what was gated, in a few words.
- **VERDICT** — `OPEN` · `CLOSED-PASS` · `CLOSED-FAIL` · `RATIFIED-RETRO`.
- **CONFIRMED-BY** — `auditor` · `CHiP` · `auditor+CHiP`. Never `implementer`.
- **REF** — commit sha(s), migration number, or doc §.

---

2026-07-25 | §8.7 R-A | TS settle wrapper on the 13-arg signature (typed staff-charge lines + rental-base discount) | RATIFIED-RETRO | auditor+CHiP | d7f640d
2026-07-25 | §8.7 §8.9-half-2 | waive endpoint §F-logs denials in the wrapper before the 403 | RATIFIED-RETRO | auditor+CHiP | 87259ef (vocab 13d7981 / mig-144)
2026-07-25 | §8.7 K-1 | launch-era cancellation = slot release; lean RPC + customer/staff/POS surfaces | RATIFIED-RETRO | auditor+CHiP | 84ca4a4 (mig-145) + 3f51bb5 + 34fc044
2026-07-25 | sql:seed | local fixture seed for post-merge smoke (supabase/seed.sql) | CLOSED-PASS (first cut FAILED apply: 428C9 generated column + inventory-trigger collision; second cut FAILED login: GoTrue NULL token columns, progress.md:40 recurrence; both fix diffs re-confirmed by auditor) | auditor | supabase/seed.sql (this commit)
2026-07-25 | wording:smoke-audit | post-merge smoke record + BACKLOG narrowing | CLOSED-PASS | auditor | docs/audit/2026-07-25-t-launch-post-merge-smoke.md (this commit)
2026-07-25 | wording:handoff-entry | Phase-1/merge/smoke handoff record | CLOSED-PASS | auditor | handoff.md (this commit)
2026-07-25 | fix:launch-cancel-copy | F-1 toast branch + F-2 launch copy (branch-not-replace; deposit-era keys untouched) | CLOSED-PASS | auditor | (this commit)
2026-07-25 | wording:b1-b2-closure | accountant gates B1/B2 closed — dual-type headers + no branch code in document number | CLOSED-PASS | auditor | decisions.md (this commit)
2026-07-26 | wording:deposit-data-vs-display | deposit stays in the DB, off every customer money surface until revival | CLOSED-PASS | auditor | decisions.md (this commit)
2026-07-26 | wording:final-launch-money-model | two charge types only; staff-charge channel REMOVED not gated; pending_review kept as a guard; accountant agenda cut to three | CLOSED-PASS | auditor | decisions.md (this commit)
2026-07-26 | sql:mig-146 | staff-charge channel removal RAISE + settlement memo/late_days columns; 14-arg signature (DEVIATION-1), M2 columns+CHECKs, GQ2 pending_review backstop | CLOSED-PASS | auditor | supabase/migrations/146_launch_money_model_channel_removal_and_memo.sql
2026-07-26 | fix:2a-memo-fast-path | mig-146 file + memo passthrough + admin memo field; closes the overdue-return window; both walk branches proven | CLOSED-PASS | auditor | (this commit)
2026-07-26 | fix:2b-launch-surface | channel removal (-8/+2 map) + discount UI + launch preview + depositsEnabled hiding + customer memo + checklist refresh + types regen + env local-default inversion; term amended to ค่าเช่าเกินเวลา | CLOSED-PASS | auditor | (this commit)
2026-07-26 | verify:mig-146-remote | owner-side remote spot-check: both CHECK constraints present (rbs_late_days_nonneg_chk, rbs_staff_memo_required_when_late_chk) and f_settle_rental_booking_return proacl service_role-only — the two items the implementer could not verify without the DB password | CLOSED-PASS | CHiP | mig-146 remote apply (b6f905b)
2026-07-27 | fix:deposit-badge | customer deposit chip + the three payment-summary deposit cells gated on server-authoritative depositsEnabled (empty slot at launch per ruling a-ก; hide-not-delete proven by flag flip); enum labels and the documents-card gap deferred | CLOSED-PASS | auditor | (this commit)
2026-07-27 | wording:remote-inventory-note | read-only remote booking inventory + CHiP's three dispositions (smoke row stays, BDR numbers disclosed, public-bucket file stays) | CLOSED-PASS | auditor | docs/audit/2026-07-27-remote-legacy-booking-inventory.md (this commit)
2026-07-27 | wording:task2-handoff | task-2 complete + merged handoff entry (merge sha 84c8ee0, verification, read-only smoke) | CLOSED-PASS | auditor | handoff.md (this commit)
2026-07-27 | merge:task2 | deposit display gate merged to staging; suite 2859, tsc 223/210 zero net new, 146/146 parity | CLOSED-PASS | auditor | 84c8ee0
2026-07-27 | fix:batch-1 | stale-types casts removed (baselines stand 223/210 — casts suppressed checking); manual no-show gated on f_deposits_enabled per CHiP (auto-cancel only at launch; ฿0 fiction rows + both customer-visible documents unreachable); stats capability verified by live query (join via entity_id, walk-in caveat recorded) | CLOSED-PASS | auditor | (this commit)
2026-07-27 | merge:batch-1 | post-merge batch 1 merged to staging; suite 2864, tsc 223/210, 146/146 parity, HTTP probe 409 NO_SHOW_DISABLED_DEPOSITS_OFF with zero writes | CLOSED-PASS | auditor | 0bc2b05
2026-08-27 | wording:model-simplification | the web collects EXACTLY ONE money item — the rental as booked; overdue rental and every adjustment leave the web as a printable report for the external accounting program | CLOSED-PASS | auditor | decisions.md (38e2727)
2026-08-27 | sql:mig-147 | v_late_charge REMOVED entirely (shape i), rental base = the booked total, no rental_extension write, no late_day_charge in the return jsonb; 14-arg signature byte-unchanged; applied local + remote, 147/147 parity | CLOSED-PASS | auditor | supabase/migrations/147_one_money_item_launch.sql
2026-08-27 | wording:report-layout | overdue & adjustments report — six fields, plain header (NOT OfficialDocumentHeader), the internal-document disclaimer line, no document number, no sequence consumed; NO COMPUTED TOTAL recorded as a ratification condition | CLOSED-PASS | CHiP | app/pages/admin/rental-bookings/overdue-report/[id].vue
2026-09-01 | fix:one-money-item | launch preview without the late charge, overdue shown as a fact not a price, and the printable report reusing the return-confirmation digital signatures; amended layout (title, full-width memo, format pass, signature block ruling ก) ratified by CHiP from the printed artifact | CLOSED-PASS | CHiP | (this commit)
2026-09-01 | merge:one-money-item | one money item merged to staging; suite 2893, tsc 223/210 zero net new, 147/147 parity local + remote; report layout ratified by CHiP from the printed artifact | CLOSED-PASS | CHiP | 50868e1
2026-10-26 | wording:t-uat-record | 2026-09-01 UAT launch blockers recorded (8 BLOCKER + ROUGH + POLISH, customer and staff) with root cause and fix shape; T-UAT inserted ahead of T4 | CLOSED-PASS | CHiP | docs/BACKLOG.md + handoff.md (this commit) (HUB reviewed on CHiP's docs-only delegation 2026-10-26)
2026-10-26 | ruling:t4-scope | WHT/50-bis REMOVED from T4-rest (parked with juristic revival, decisions.md 2026-07-22; schema stays dormant); reconciliation loop 3 deposit liability DEFERRED with deposit revival, no stub | CLOSED-PASS | CHiP | docs/BACKLOG.md (this commit)
2026-11-02 | fix:2a | launch checkout confirms the booking instead of raising a ฿0 deposit payment request; cart's chosen pickup hub validated server-side (active branch + asset carried there) and written as hub_id + hub_name before confirm; customer-safe error copy replaces the raw HTTP string; rental fee presented as due on the return day | CLOSED-PASS | CHiP | (this commit) (Thai ratified by CHiP; HUB-reviewed on CHiP's delegation 2026-11-02)
2026-11-02 | fix:2b | pickup deposit gate driven by the deposit regime at the endpoint (fail-closed; checklist, signature, KYC, branch, duplicate and status guards untouched); readiness failures render an error state instead of an endless spinner, 403 distinguished, hardcoded English removed; isMissingBranchAccessTable narrowed to SQLSTATE 42P01 only — the regex arm had granted branch access on any error naming the table; seed grants the staff user can_pos on seed-branch-01 so the operational walk runs as STAFF | CLOSED-PASS | CHiP | (this commit) (Thai ratified by CHiP; HUB-reviewed on CHiP's delegation 2026-11-02)
2026-11-02 | sql:mig-148 | settlement discount written as its own ledger line (CHiP option B: gross charge + contra line, not a netted charge); NEW service_role-only f_write_settlement_discount_line (direction 'out', positive amount, own VAT split, no ฿0 line); charge_type CHECK widened additively for 'settlement_discount'; settle RPC body-only change on the byte-unchanged 14-arg signature; forward-only, no history rewritten | CLOSED-PASS | CHiP | supabase/migrations/148_settlement_discount_line.sql (HUB relayed 2026-11-02)
2026-11-02 | sql:mig-149 | modl_operation_chk widened by ONE value, 'settlement_payment_confirm_denied', 16 existing values verbatim, plain DROP; without it the collect wrapper's §F denial inserts were rejected and SWALLOWED by best-effort logging — refusals reached the user while the audit row did not exist (observed live before this migration) | CLOSED-PASS | CHiP | supabase/migrations/149_collect_denial_log_vocabulary.sql (HUB relayed 2026-11-02)
2026-11-02 | fix:2c | settlement collect wired — wrapper + endpoint + 'รับชำระ' primary action, waive demoted and hidden from staff; branch-scoped on the booking's hub via the non-fail-open guard; staff + super_admin; cash reference server-generated in Asia/Bangkok with client input ignored; transfer requires reference + mig-113 private-chain slip; §F denials in the wrapper only, success row left to the RPC; replay → customer-safe 409 | CLOSED-PASS | CHiP | (this commit) (Thai ratified by CHiP; HUB-reviewed on CHiP's delegation 2026-11-02)
2026-11-16 | verify:t-uat-step3 | full launch flow re-walked end to end AS STAFF on a clean 001→149 + seed — all nine T-UAT blockers closed with evidence, two-line ledger reconciling to amount_due, cash collected, report printed; no raw status button and no super_admin fallback | CLOSED-PASS | CHiP | docs/BACKLOG.md + handoff.md (this commit) (HUB reviewed on CHiP's delegation 2026-11-16)
2026-11-17 | verify:mig-148-149-remote | mig-148 + mig-149 applied to remote after a re-run dry-run showed exactly those two and remote still at 147; all five post-apply probes passed — parity 149/149 zero mismatches, ONE f_settle_rental_booking_return overload at arity 14 with no stray 13-arg form, payment_allocations_charge_type_chk at 7 values incl. settlement_discount, modl_operation_chk at 17 values incl. settlement_payment_confirm_denied, both charge-line writers REVOKEd from PUBLIC and GRANTed to service_role only with no anon/authenticated grant; no behavioural probe run against the live ledger | CLOSED-PASS | CHiP | supabase/migrations/148 + 149 (HUB relayed 2026-11-17)
2026-11-17 | merge:launch-blockers | T-UAT launch blockers merged to staging — nine 2026-09-01 blockers closed and re-verified end to end as STAFF; mig-148 + mig-149 already applied on remote, which is what cleared the merge precondition; suite 2977, tsc 223/210 zero net new, migration parity 149/149 | CLOSED-PASS | CHiP | 664039d (HUB relayed 2026-11-17)

RETRO-RECORD NOTE: the three lines above were confirmed with a prior auditor instance
in CHiP's presence on 2026-07-25, BEFORE this log existed. They are recorded here once,
retrospectively — hence verdict `RATIFIED-RETRO` — to seed the practice. No re-audit was
performed and none is implied. Every gate from this point forward is logged at the time
its verdict is received.

SCOPE OF THIS LOG (CHiP ruling 2026-07-25): the log STARTS at the three lines above.
The 133-145 migration track is deliberately NOT seeded — those gates closed under the
pre-log practice and their record lives in the design doc §8.1 applied markers.
