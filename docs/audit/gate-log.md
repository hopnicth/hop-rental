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

RETRO-RECORD NOTE: the three lines above were confirmed with a prior auditor instance
in CHiP's presence on 2026-07-25, BEFORE this log existed. They are recorded here once,
retrospectively — hence verdict `RATIFIED-RETRO` — to seed the practice. No re-audit was
performed and none is implied. Every gate from this point forward is logged at the time
its verdict is received.

SCOPE OF THIS LOG (CHiP ruling 2026-07-25): the log STARTS at the three lines above.
The 133-145 migration track is deliberately NOT seeded — those gates closed under the
pre-log practice and their record lives in the design doc §8.1 applied markers.
