# OPERATING MODEL — how the HOPNIC pipeline actually runs

Status: **ACTIVE.** This is the current working model as practiced on 2026-07-14. Where it conflicts with
older process notes, **this file wins** (see `decisions.md` 2026-07-14 decision set; routing in
`docs/MASTER-GAP-MAP.md`).

## 1. Three-party pipeline
- **Claude Code (implementer)** — writes code, migrations, docs; produces reports.
- **Auditor Claude (reviewer)** — audits every report/change before it is proposed for approval.
- **CHiP (owner)** — owns **all** approvals. Commits are **per-file staged**, **secret-scanned**, and
  **pushed ONLY on explicit owner instruction**. Nothing is committed or pushed without a "go".

## 2. Work units & acceptance
- **Flow-based work units:** the unit of delivery is "this flow walks end-to-end" — not a file or a
  ticket. See `docs/MASTER-GAP-MAP.md` for the T1–T8 flows.
- **Acceptance = audit-mark resolution:** a flow is done when a **re-walk shows the referenced audit
  mark IDs resolved** (the 🔴B#/🟡W#/🔍O# IDs from the journey audits + B6 walk).
- **Reusable-by-evidence:** anything proven duplicated across **≥2 flows AND money/document-related**
  is built **centrally, immediately** (do not re-solve per flow).

## 3. SQL / migration gate
- **Any migration = full SQL draft reviewed by the auditor BEFORE file creation or apply.** No writing
  a migration file, and no `db push`, ahead of that review.
- **Gate verdicts resolve only on the auditor's confirming reply.** Conditional verdict phrases —
  "approved on receipt", "conditional pass", "passes if X" — keep the gate **CLOSED** until the
  auditor replies confirming the condition is met, regardless of what the submitter has delivered.
  While closed: no file creation, no apply, no dependent work. If it is ambiguous whether a gate is
  open, it is closed — ask. (Added 2026-07-19 after a self-adjudicated gate.)
- **Money tables: immutable-by-default** (the mig-118 append-only / UPDATE-guard pattern) and
  **atomic RPC** for multi-write state changes (the mig-119 pattern).
- **Fail-closed everywhere** (deny on uncertainty; guard before the side effect).

## 4. Test / suite discipline
- **Suite green is the enforced norm.** Any red test is a **stop-and-report** event, never accepted
  debt (baseline established 2026-07-10, V3-0).
- **Flip-in-same-commit rule:** an expected-fail test is flipped to its passing assertion **in the same
  commit** that fixes the behavior — never left red "to fix later".

## 5. Walkthrough / browser rules
- **localhost only**; never navigate off localhost / to `*.supabase.co`.
- **Per-write `127.0.0.1` network evidence** captured for the first write of each leg.
- **Environment gate first** (dev server, local Supabase, app-resolved URL, zero remote calls).
- **Chrome MCP scope lock** — single walk tab, no interaction with the user's other tabs, do not
  restart the dev server.
- **No tooling substitutions without owner approval** — walkthroughs are MCP-driven; do not swap in
  Playwright or self-built automation without a "go".

## 6. Documentation & deferral
- **Deferred work MUST land in `docs/BACKLOG.md` in the same commit that defers it** (standing rule).
- **Model guidance:** use **Opus for money / migration / design audits**; lighter models are acceptable
  for routine control (status checks, mechanical edits, log reads).
- **Backlog documentation debt:** `handoff.md`'s older **V3-slice track description (V3-0→V3-6)** is
  **superseded** by the `MASTER-GAP-MAP.md` **T1–T8 tracks** — the V3 slices now map into the T-tracks.

## 7. Incident log & gate discipline

### 7.1 Incident 2026-07-23 — push ahead of an unresolved review gate (commit 65fa49c)
- **What happened:** commit `65fa49c` (minimal-launch decision record) was committed AND pushed to
  `staging` without the required auditor review of the `decisions.md` wording — the task's item-2
  gate ("wording for my review BEFORE staging"). The implementer conflated the task's item-6 push
  authorization with a waiver of the item-2 review gate.
- **Resolution:** a retroactive A–E audit (decisions entry, commit stat + status, MASTER-GAP-MAP
  diff, BACKLOG + handoff diffs, provenance headers) was run and **passed in full**; **CHiP ratified
  `65fa49c` retroactively — no revert.**
- **Rule reinforced (standing):** a push authorization inside a task does **NOT** waive any review
  gate on other items in the same task. **Every gate resolves independently, and only on the
  auditor's confirming reply** (same principle as §3's gate-verdict rule, now generalized beyond
  migrations to every review gate — wording gates included). If any item says "for review BEFORE
  staging", that item stays CLOSED until the auditor confirms, even when other items in the same
  task are cleared to commit/push.

### 7.2 Transport workaround — audit materials to the auditor
- Code blocks emitted from this terminal are **stripped in transit** to the auditor (fenced blocks
  and markdown tables do not survive). **Standing workaround:** send all audit materials as **plain
  text**, each content line prefixed with "| " (pipe + space), wrapped between explicit
  `===== BEGIN: <artifact> =====` / `===== END: <artifact> =====` marker lines. **No triple-backtick
  fences, no markdown tables.** One artifact per reply when the auditor requests sequenced delivery.

### 7.3 Branch discipline — T-LAUNCH (and future implementation tracks)
- **T-LAUNCH implementation work happens on a dedicated branch** (`feature/t-launch`) branched off
  `staging` — **NOT directly on `staging`.** Migrations, server/app code, and tests land on that
  branch. **Merge to `staging` only after auditor approval + explicit CHiP instruction**, per the
  normal gate.
- **Docs-only commits** (decisions.md / BACKLOG.md / handoff.md / progress.md and other session
  docs) **may continue on `staging` as before** — the dedicated-branch rule applies to
  implementation (schema/code/test), not to the documentation trail.
