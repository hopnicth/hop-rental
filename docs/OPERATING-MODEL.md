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
