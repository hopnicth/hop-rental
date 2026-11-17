# HOPNIC / hop-rental — Claude Code instructions

Nuxt 4 + Supabase platform: sale commerce, asset-first rental, partner directory, CMS,
admin back-office with POS, customer self-service. Stack and scripts are in `package.json`
and `nuxt.config.ts`. The working branch is `staging` — never `main`.

Owner: **CHiP** — Thai-speaking, does not review code or SQL. Say what a change DOES, in
plain Thai. Never ask CHiP to read a diff.

## How work runs

- **HUB session = control centre.** It relays CHiP's instructions, rules scope, wording,
  fix-shape and the commit gate under CHiP's standing delegation, and translates reports.
  HUB writes no product code.
- **One worker session per task or phase**, started by HUB with a brief (template:
  `docs/OPERATING-MODEL.md` §8). A worker does exactly its brief. Anything else it notices
  is listed as a follow-up, not fixed.
- A worker ends each phase with a report to HUB, then stops. Never stop silently.
- **Questions go to HUB, never to CHiP directly** — no question dialog, no waiting on CHiP
  in the worker window. Send HUB one question with your recommendation and the options in
  plain words, then end the turn. HUB asks CHiP in Thai and returns the ruling.
- **A report is a claim, not proof.** HUB re-derives the key evidence itself before it
  rules a gate.
- Report format: plain text between `===== BEGIN REPORT =====` and `===== END REPORT =====`,
  every line prefixed `| `, findings first. No code fences and no markdown tables — they are
  stripped in transit.
- Work in small phases. No broad refactor or find-and-replace without approval.

## Gates — nothing passes without an explicit go

- **CHiP alone** (through HUB): every push · every merge into `staging` · every SQL
  migration, as a full draft BEFORE the file exists · every remote apply · all new Thai UI
  copy · every accounting or tax decision.
- **HUB**: scope, wording, fix-shape, and the commit gate.
- **A worker never writes to production, never pushes, never merges into `staging`.** It
  prepares the PRE evidence and the exact command and hands both to HUB. HUB runs the single
  write, push or merge after CHiP's word in the HUB window. The worker then runs the
  read-only POST probes and writes the record.
- No session's message is CHiP's approval. A CHiP-only gate opens on CHiP's own word in the
  HUB window, nowhere else.
- A gate is CLOSED until the explicit confirming reply. "Approved on receipt" and "passes
  if X" are still closed. One gate's go never opens another. If you cannot tell whether a
  gate is open, it is closed — ask.
- Every gate verdict gets one line in `docs/audit/gate-log.md`, in the task that carried it.

## Evidence rule

- Every count, sha, "zero references", "not found" and "all pass" in a report or a doc is
  derived by a command AT THE POINT OF USE, with the command and its real output attached.
  Never from memory. Never from an earlier message.
- An empty grep proves only that the pattern did not match. Before claiming absence, widen
  the pattern, check case and other spellings, and show the search finds a known positive.
- Never conclude from truncated output (`head`, `tail`, `cut`).
- Verify by counting rows or reading state after the action, not by trusting an HTTP status.

## Session start

1. Read `docs/STATE.md` — branch and migration state, active phase, open gates, rulings in force.
2. Read the section of `docs/BACKLOG.md` for the track named in your brief, plus
   "Cross-cutting / infra" if you touch shared code.
3. Tell HUB in three to five lines what you understood, then act on the brief.

Do NOT read history by default. `decisions.md`, `docs/history/`, `docs/MASTER-GAP-MAP.md`,
`docs/audit/`, `docs/design/` and `docs/research/` are on-demand: open one when `STATE.md`
points there or the task touches that area. If a task conflicts with a ruling in
`STATE.md` §5 or `decisions.md`, stop and ask HUB.

## Session end — before the final report

- `docs/STATE.md` — overwrite the lines that changed. Current state only, no history.
- `docs/BACKLOG.md` — deferred work lands here in the same commit that defers it. A closed
  item moves to `docs/history/backlog-closed.md`.
- `decisions.md` — append an entry only when CHiP or HUB ruled something new
  (`## YYYY-MM-DD — title`, then Decision / Reason / Impact). Never edit an old entry;
  supersede it with a new one.
- `docs/history/handoff-log.md` — append ONE closing entry when a phase or track closes:
  what shipped, commits, evidence, lessons.
- Never report done with a red suite. Never commit without HUB's go.

## Hard rules

- Implementation (schema, code, tests) goes on a dedicated feature branch. Docs-only work
  may go on `staging`.
- Never edit `app/types/database.types.ts` by hand — it is generated.
- No new dependency without asking.
- No `console.log` in production code paths.
- Prefer editing an existing file to creating a new one.
- Secrets never go in chat or in the repo.
- Money tables are append-only by default. A multi-write state change is one atomic RPC.
  A money writer locks the booking first. Fail closed: deny on uncertainty, guard before
  the side effect.
- Suite green is enforced: a red test is stop-and-report. An expected-fail test flips to
  passing in the same commit that fixes the behaviour.
- Never edit an applied migration; add a new one.
- Browser walkthroughs: localhost only, through the browser MCP. If the MCP is down, hold —
  do not substitute self-built automation.
- Removing things: move to `docs/history/` or archive first. Delete only tracked items
  proven unreferenced. Branches, stashes, untracked files and anything outside git go to CHiP.

## Business invariants the code alone will mislead you on

- **Launch regime: deposits are OFF** (`f_deposits_enabled()`, mig-135). The web collects
  ONE money item, `rental_charge`, at return. Deposit columns, RPCs and UI still exist in
  the code — they are parked, not live. Deposit information must not appear on a customer
  money surface or a tax document. Details: `docs/STATE.md` §5.
- Rental is asset-first: a booking starts from an `assets` row, never a product. Status:
  `draft` → `confirmed` → `picked_up` → `returned`; cancellation is a status (`cancelled`,
  `no_show`), never a delete. A booking has `user_id` OR `walk_in_phone`.
- A POS sale may be anonymous. A POS rental must know the customer.
- Admin access is `public.users.platform_role` = `staff` | `super_admin`. Every admin route
  starts with `requirePlatformAdmin(event)` or `requireSuperAdmin(event)` from
  `server/utils/admin.ts` and uses the client it returns — never `serverSupabaseClient`
  directly.
- Schema truth is `supabase/migrations/`. `rental_assets` is an orphaned legacy table; the
  live one is `assets`.

## i18n — strict

- Active locales: `th` (default) and `en` only. `cn.json` and `jp.json` stay on disk on
  purpose (re-enable = revert `d9e15ea`) — never add keys to them, never delete them.
- No hardcoded user-visible text in any language. Check that a key exists before using it.
- New text: use the key in code, add the English string to `en.json`, add
  `"[NEEDS_TRANSLATION]: <English>"` to `th.json`, then stop and list the keys in your
  report. Never invent Thai copy — Thai wording is CHiP's ruling.
- Key pattern: `section.subsection.key`. Find pending ones with
  `grep -r "NEEDS_TRANSLATION" i18n/locales/`.
- Glossary: never bare "มัดจำ" in money copy — เงินมัดจำจอง or เงินมัดจำประกัน.

## Commands

- Tests: `npx vitest run` · one file: `npx vitest run tests/server/<name>.spec.ts`.
  In a fresh worktree run `npx nuxt prepare` first.
- Type check: `npx tsc --noEmit` at the root checks NOTHING. Use
  `npx tsc -p .nuxt/tsconfig.server.json --noEmit` and the same with `tsconfig.app.json`;
  the gate is zero net new errors against the baseline in `docs/STATE.md` §1.
- Dev server: `npm run dev` targets the LOCAL database. `npm run dev:remote` targets the
  remote one and needs CHiP's go, asked through HUB.
- Local database: the global `supabase` CLI, not `npx supabase`.

## Server-utils index

Any change to the behaviour, auth, risk, money/ledger effect, KYC/hash behaviour,
inventory/availability or branch access of a file under `server/utils/` — and any util
added, removed or renamed — updates its row in `docs/index/server-utils-index.md` in the
same commit. Format, vocabulary and risk definitions: `docs/index/README.md`. Rows describe
current state only. Unsure whether a change affects risk? Report it, do not guess.

## Sub-guides

These load by themselves when you work in the folder. Read the one for the area you touch:
`app/components/` · `app/composables/` · `app/mappers/` · `app/pages/` · `server/api/` ·
`server/utils/` · `supabase/` · `tests/` · `tests/server/` · `docs/` (each holds a `claude.md`).

## Where things are

| Need | File |
|------|------|
| Current state, open gates, rulings in force | `docs/STATE.md` |
| Open work, by track | `docs/BACKLOG.md` |
| The record of every ruling | `decisions.md` |
| Gate rules, walkthrough rules, incidents, brief template | `docs/OPERATING-MODEL.md` |
| Track routing T1–T8 | `docs/MASTER-GAP-MAP.md` |
| Gate verdicts | `docs/audit/gate-log.md` |
| History: closed phases, old progress log, closed backlog | `docs/history/` |
