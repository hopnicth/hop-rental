# STATE — hop-rental, current state (read this first)

Updated: 2026-11-17 · Owner and decider: CHiP · Control centre: HUB session

This file is CURRENT STATE ONLY. Overwrite lines in place; no history, no "previously".
History lives in `docs/history/` and `decisions.md`. Every sha and count below was derived
by a command on the date above — re-derive before you rely on one (CLAUDE.md, Evidence rule).
`(src: …)` says where each fact came from and is also the pointer for reading deeper.

## 1. Where the code is

- `staging` == `origin/staging` @ `5c202f6`. (src: `git rev-parse --short staging origin/staging`)
- `feature/t4-documents` @ `e170593` — T4 Phase A, 1 commit ahead of staging, no upstream
  (NOT pushed), NOT merged. (src: `git rev-list --count staging..feature/t4-documents`)
- `main` == `origin/main` @ `a020b48`, last commit 2026-03-30. Not the working branch — all
  work targets `staging`. (src: `git log -1 main`)
- Migrations: local files 001–150, 150 files, no duplicate numbers.
  (src: `ls supabase/migrations | wc -l`, `sort | uniq -d`)
- Remote database is at 149; mig-150 is pending there. (src: HUB, 2026-11-17,
  `supabase migration list --linked`)
- Remote Supabase project ref `yzjczvzwmbbeyoodrjwm`. (src: handoff-log "2026-07-15" entry)
- Test suite at `e170593`: 144 files, 3017 tests, all passing.
  (src: `npx vitest run`, 2026-11-17, after `npx nuxt prepare`. The 3014 written in the
  handoff-log and progress-log entries of 2026-11-17 is a stale record.)
- tsc baseline: 223 server / 210 app errors; the gate is "zero net new".
  (src: handoff-log "2026-11-17" entry — not re-run by the session that wrote this file)

## 2. Active track and phase

- Track order: T4 → T5 → T6/T7 (parallel) → T8. T-UAT is closed and merged (`664039d`).
  (src: `docs/BACKLOG.md` "ACTIVE — T-track order")
- **T4 — document / ERP foundation.** Phases (src: HUB, from the T4 scope report of 2026-10-26):
  - **A** — central tax treatment config. Built, tested, committed on `feature/t4-documents`
    (mig-150); waiting on the gates in §3.
  - **A2** — wire the tax reader into the writers. NEXT. Needs its own scope gate: one live
    call passes `charge_type NULL` (mig-148:376) and a fail-closed reader would RAISE on it.
    (`docs/BACKLOG.md` still calls this item "Phase B" — the name A2 controls.)
  - **B** — settlement numbered document (not a tax document).
  - **C** — sale receipt + tax invoice (A8/A9). POS wiring stays out (T5).
  - **D** — rental fiscal issuance at payment confirmation. Was blocked on the money path;
    settlement-collect shipped in T-UAT 2c, so re-evaluate at its scope gate.
  - **E** — reconciliation loops 1 and 2.
  - **F** — the two document gaps: ฿0 BDC/RBK issuance; the launch-booking documents card.
  - OUT of T4: POS auto-issue (T5), back-office accounting UI, export registers (T8),
    WHT / 50-bis, reconciliation loop 3.

## 3. Open gates

| # | Gate | Ruled by | State |
|---|------|----------|-------|
| 1 | Remote apply of mig-150 | CHiP | approved 2026-11-17 ("Apply remote"); not executed — the T4 session awaits CHiP's direct confirmation in its own window |
| 2 | Push `feature/t4-documents` | CHiP | closed |
| 3 | Merge T4 Phase A into `staging` | CHiP | closed (code must not land ahead of its schema) |
| 4 | T4 Phase A2 scope (the `charge_type NULL` call) | HUB; CHiP for the tax position | not opened |
| 5 | Docs restructure (this file, `docs/history/`, CLAUDE.md) — commit | HUB | closed |
| 6 | Docs restructure — push / merge | CHiP | closed |

(src: HUB, 2026-11-17)

## 4. Who rules what (standing)

- **CHiP alone**, relayed by HUB: every push · every merge into `staging` · every SQL
  migration (full draft before the file exists) · every remote apply · all new Thai UI copy ·
  every accounting / tax decision. A remote write is confirmed by CHiP directly in the
  session that runs it.
- **HUB**, under CHiP's standing delegation: scope, wording, fix-shape, the commit gate.
  HUB re-derives a worker's evidence before ruling, and translates reports for CHiP, who
  does not read code or SQL.
- **Worker session**: does exactly its brief, reports, holds at every gate. Rules nothing.
- A gate is closed until the explicit confirming reply. One gate's go never opens another.
  (src: `docs/OPERATING-MODEL.md` §1, §3, §7.1)

## 5. Rulings in force

Each line names the entry to open in `decisions.md` (search the heading text). Where two
entries conflict, the later one controls — old entries are never edited.

Money and launch regime
- **Deposits are OFF for launch.** No booking deposit, no security deposit; the machinery is
  parked, not deleted; `f_deposits_enabled()` (mig-135) is the switch.
  → "2026-07-22 — MINIMAL LAUNCH ratified"
- **The web collects exactly ONE money item**: `rental_charge`, at return.
  `amount_due = rental base − discount`. Overdue days and every adjustment leave the web as a
  printable report for the external accounting program.
  → "2026-07-27 — MODEL SIMPLIFICATION" (controls over "2026-07-26 — FINAL LAUNCH MONEY MODEL")
- **Deposit data stays in the DB but must not appear** on any statement, tax document or
  customer money surface until deposits revive.
  → "2026-07-26 (addendum to the 2026-07-25 B1/B2 entry) — DEPOSIT DATA vs DEPOSIT DISPLAY"
- **Cancellation at launch** = slot release only: lean RPC, customer and staff, no cut-off,
  zero money branches. → "2026-07-25 — Launch-era cancellation ruled (K-1"
- **No-show at launch is automatic only**; the manual mark is gated while deposits are off.
  (src: `docs/BACKLOG.md` "Cross-cutting / infra", item "Manual no-show 0-amount forfeiture rows")
- **Deposit revival is a future track** behind two gates: card-hold capability and the
  ป.73/2541 professional memo. (src: `docs/MASTER-GAP-MAP.md` "Dependency notes")

Tax and documents
- Series prefixes: `STM` statement · `TIA` abbreviated invoice · `TIR` full invoice · `CDN`
  credit note. → "2026-07-23 (addendum) — Tax-invoice series prefixes split"
- Tax documents are dated the STAFF ISSUE DATE; none may be issued while a settlement is
  `awaiting_payment`. → "2026-07-23 — Invoice dating, dual-invoice-type flow"
- Abbreviated invoices are permitted; no branch code in the printed number.
  → "2026-07-25 — Accountant gates B1 + B2 CLOSED"
- VAT is inclusive. (src: `docs/BACKLOG.md` "T-LAUNCH accountant agenda — FINAL STATE")
- **T4 scope**: WHT / 50-bis is OUT (parked with juristic revival); reconciliation loop 3
  (deposit liability) is deferred with deposit revival, no stub.
  (src: handoff-log "2026-10-26" entry; gate-log `2026-10-26 | ruling:t4-scope`)
- **T4 Phase A** → "2026-11-17 — T4 PHASE A":
  Q1 the key is `(charge_type × customer_kind)`, no branch ·
  Q2 effective-dated rules AND per-document snapshots, both ·
  Q3 only `rental_charge` and `settlement_discount` are seeded; the reader RAISEs
  `TAX_RULE_NOT_FOUND` for everything else, on purpose (forfeiture VAT is unconfirmed) ·
  R1 the reader is wired to nothing in Phase A.

Engineering
- Money tables are append-only by default; multi-write state changes go through one atomic
  RPC; money writers lock the BOOKING first; fail closed. (src: `docs/OPERATING-MODEL.md` §3;
  `decisions.md` "2026-07-19 — T3+T4-core Phase 1")
- Suite green is enforced; a red test is stop-and-report.
  → "2026-07-10 — V3-0 integrity foundations complete"
- Canonical payment flow = in-system slip upload (mig-115). → "2026-07-09 — Payment-flow ratification"
- Glossary: never bare "มัดจำ" in money copy — เงินมัดจำจอง or เงินมัดจำประกัน.
  Locales: `th` + `en` only; `cn.json` / `jp.json` stay on disk, no new keys.
  → "2026-07-07 — i18n: cn/jp locale disable, deposit glossary rule"
- KYC: unfrozen, rental-only, staff and customer channels → "2026-07-14 — Post-journey-audit
  decision set" §a. `KYC_HASH_SECRET` can never be rotated → "2026-06-06 (Decision K".
- Dev default is the LOCAL database (`npm run dev`); remote only via `npm run dev:remote`.
  (src: `.gitignore` layout note; `package.json` scripts)

## 6. Known open issues that are NOT in BACKLOG

1. **Accountant items still open**: (a) forfeiture VAT treatment — unconfirmed, which is why
   the tax reader refuses it; (b) one written line confirming tax point = payment day.
   Both ARE in BACKLOG ("T3+T4 Phase 1 kickoff", "T-LAUNCH accountant agenda — FINAL STATE");
   listed here because they block the Phase A2 decision on the `charge_type NULL` call.
2. **How HUB verdicts are logged** is settled: `docs/OPERATING-MODEL.md` §1 and the
   CONFIRMED-BY vocabulary in `docs/audit/gate-log.md`.
3. **A fresh worktree cannot run the suite until `npx nuxt prepare` has run** — vitest fails
   on a missing `.nuxt/tsconfig.server.json` before any test starts.

## 7. Local environment facts that bite

- Use the global `supabase` CLI (v2.75.0). `npx supabase` resolves to v3.2.0, which refuses
  this repo's `config.toml`. (src: handoff-log "2026-11-17" entry, "CLI NOTE")
- Local pg_cron runs the no-show job nightly (17:00 UTC = 00:00 Bangkok): any `confirmed`
  local booking whose start date passes flips to `no_show` by itself.
  (src: handoff-log "2026-07-19" entry)
- `supabase/seed.sql` derives dates from `now()` and cannot produce an overdue booking; move
  one into the past by hand with `rental_days == end − start`. (src: `docs/BACKLOG.md` "FIXTURE NOTE")
- `npx tsc --noEmit` at the root checks nothing (`files: []` + references). The real checks
  are `tsc -p .nuxt/tsconfig.server.json` and `.nuxt/tsconfig.app.json`.
  (src: `tsconfig.json`; `docs/BACKLOG.md` "Cross-cutting / infra")
- `docs/audit/2026-10-08-gantt-prereq-audit.md` is an untracked side-project file in the main
  checkout. Never touch, stage or delete it. (src: HUB brief 2026-11-17)
- Never edit `app/types/database.types.ts` by hand.

## 8. Where to look

| Need | Open |
|------|------|
| Open work for a track | `docs/BACKLOG.md` → that track's section |
| Why a rule exists / exact ruling text | `decisions.md` → heading named in §5 |
| What a closed phase delivered, with evidence | `docs/history/handoff-log.md` → entry by date |
| Day-by-day build log up to 2026-11-17 | `docs/history/progress-log.md` |
| Every gate verdict | `docs/audit/gate-log.md` |
| Track routing T1–T8 and audit mark IDs | `docs/MASTER-GAP-MAP.md` |
| Gate rules, walkthrough rules, incident log, brief template | `docs/OPERATING-MODEL.md` |
| Risk and tests for a `server/utils/` file | `docs/index/server-utils-index.md` |
| Design docs and their status | `docs/claude.md` (index), `docs/design/`, `docs/research/` |

The two logs in `docs/history/` are the former root files `handoff.md` and `progress.md`,
moved whole on 2026-11-17. A citation of `handoff.md` or `progress.md` in an older doc or a
code comment means these files. `handoff-log.md` is newest-first from the top and then
chronological from the entry of 2026-05-29; find an entry with
`grep -n '^## ' docs/history/handoff-log.md`.

## 9. Keeping this file true

- Update at the end of every worker phase, in the same commit as the work.
- Change the lines that changed. Do not append dated notes — a closing narrative goes to
  `docs/history/handoff-log.md` instead.
- Keep it under about 200 lines. If a section grows, move the detail to its home file and
  leave a pointer.
