# T4 Phase A close-out — mig-150 central tax treatment map

**Status:** CLOSED pending the commit gate. Committed `e170593`; mig-150 applied on remote.
**Last updated:** 2026-11-17
**Branch:** `feature/t4-documents` (cut from `staging` @ `5c202f6`) — NOT pushed, NOT merged.

Reality sync: everything below is applied and verified. The one thing that is *not* proven is
named explicitly in §4 — do not read §3 as more than it says.

---

## 1. What phase A is

A central, effective-dated, append-only map from `(charge_type × customer_kind)` to VAT/WHT
treatment, read through one fail-closed function. It replaces answering "what is the rate?" from a
single global config with answering "what is the rate **for this kind of charge**?" — the question
every tax document actually has to answer.

Phase A lays the table and the reader and **wires nothing**.

CHiP's rulings: key is `(charge_type × customer_kind)` with **no branch**, because a VAT rate is
national (Q1); effective-dated rules **and** per-document snapshots are complementary, not
alternatives (Q2); seed **only** the charge types the web actually produces (Q3).

## 2. The decision that carries the weight

**The seed is deliberately incomplete.** Only `rental_charge` and `settlement_discount` are seeded.
`f_tax_treatment_for` *raises* `TAX_RULE_NOT_FOUND` for forfeiture, damages and everything else.

Forfeiture VAT has been item (1) of the accountant confirmation package since 2026-07-22, "pending
professional confirmation", required before ruling-2 forfeitures run against real customers.
Seeding a 0% forfeiture rule would have promoted an unconfirmed position to a confirmed one *and*
made it executable the moment deposits revive — bypassing that gate entirely.

So the gate is now held by the database rather than by anyone remembering it. On production:

```
f_tax_treatment_for('contractual_penalty')
  → HTTP 400  P0001  TAX_RULE_NOT_FOUND: contractual_penalty / any at 2026-11-17 15:13:20+00
```

## 3. Design notes worth not re-deriving

- **Append-only, with exactly one exception.** `effective_to` may be stamped once, `NULL →`
  non-NULL, forward only. Everything else frozen; `DELETE` refused; `TRUNCATE` refused by a
  *separate statement-level* trigger, because a row trigger does not fire on TRUNCATE
  (mig-109/125 pattern).
- **Why `effective_to` exists at all.** Storing only `effective_from` and deriving the end from the
  next row is strictly append-only and simpler — but it cannot express a rule **withdrawn with no
  successor**, which is exactly how a rule pending re-confirmation must behave under §2. Proven
  locally: after stamping, a read past the end raises while a read before it still resolves.
- **Overlap prevention is a trigger, not `EXCLUDE`.** `btree_gist` is not installed and no migration
  in this repo uses an exclusion constraint. The trigger takes a per-key `pg_advisory_xact_lock`
  *before* its check — without it, two concurrent transactions inserting overlapping periods each
  see a clean check and both commit.
- **`effective_from` is `'-infinity'`** so settlements issued before this table existed stay
  explainable; the global config was already applying those values. PostgREST serialises that bound
  as the **string** `"-infinity"`, which `new Date()` cannot parse — observed on production, not
  just predicted. Any future TS/UI reader must special-case it.
- **The rate is read, not restated.** The seed calls `f_tax_vat_config()` rather than re-selecting
  `system_configs`, so there is one way to read it. See §5 for where that claim has a limit.

## 4. The limitation — read this before trusting §3 on production

Every remote probe was **read-only** by instruction: no `UPDATE`, `DELETE` or `TRUNCATE` ran against
production, not even inside a transaction that would roll back.

So **immutability on production is proven structurally, not behaviourally.** Nobody has watched
production refuse a TRUNCATE, a DELETE or a rate UPDATE. What exists is:

- the three triggers present with the correct shapes (`BEFORE DELETE OR UPDATE … FOR EACH ROW`,
  `BEFORE INSERT OR UPDATE … FOR EACH ROW`, `BEFORE TRUNCATE … FOR EACH STATEMENT`), and
- `md5` of all three function definitions **and** of the 8-CHECK table DDL identical between remote
  and local — where the local objects *were* behaviourally proven.

That is a strong inference and the right trade against mutating production. It is still an
inference. Behavioural proof on remote would need its own gate.

## 5. Where the VAT rate is still hardcoded

In **SQL** the rate appears once, `mig-134:55`, the `system_configs 'tax.vat'` seed that is the
source of truth. It is **not** written once in the repo:

| File | Line | What |
| --- | --- | --- |
| `server/api/admin/pos/accounting-export.get.ts` | 23 | `"VAT 7%"` — hardcoded column label |
| `server/api/admin/pos/accounting-export.get.ts` | 49 | `Math.round(((total * 7) / 107) * 100) / 100` |

That endpoint is **live** — the CSV export is reached from `app/pages/admin/pos.vue` — so the
accounting office can already receive a file whose VAT column disagrees with the central map the
moment the rate ever changes. Left untouched in phase A by ruling R6: phase A wires nothing, and
rewriting an accounting export's arithmetic is not a drive-by edit.

It is allow-listed in `tests/server/t4-tax-treatment-rules.spec.ts` with both line numbers, and a
second test pins that both lines still exist — so fixing the endpoint forces the allow-list entry
out rather than letting it quietly excuse a clean file.

**How it was missed, because the mechanism matters more than the miss.** The first version of that
sweep matched only `vat… = 7` and `0.07`. An inclusive-VAT extraction never writes the rate *as* a
rate — it writes a divisor — so the pattern could not see it, and an empty result was read as proof
of absence. It only ever proves the *pattern* did not match. The sweep now carries eight patterns,
each trial-run over the tree and kept or discarded on its real hits: `/ 7` matched street addresses
(`56/7`) and an unanchored `vat` matched the word "deri**vat**ion" — the same substring trap as
`tax` matching `taxonomy`. The sweep was then proven by emptying the allow-list and confirming it
fails with both line numbers.

## 6. Verification

**Local** — full `supabase db reset` (001→150 + seed), then V1–V11: seed shape against
`f_tax_vat_config()`; reader resolves both seeded types; raises on unmapped type, NULL
`charge_type`, invalid `customer_kind`, NULL as-of; rate/treatment UPDATE, DELETE and TRUNCATE all
refused; `effective_to` one-shot proven (first stamp succeeds, second refused, clearing refused,
backwards refused); withdrawn-with-no-successor proven; overlap and identical-`effective_from` both
refused; different `customer_kind` not an overlap and exact-kind-beats-`any` both directions;
verbatim re-run at exit 0 with no new rows; grants/RLS/trigger shapes. Guards re-proven under
`SET LOCAL ROLE service_role` after the R9 revoke — trigger functions do not need `EXECUTE` to fire.

**Remote** — PRE: remote at 149 with zero drift and 150 the only pending file; `f_tax_vat_config()`
confirmed returning `{vat_inclusive, 7}` *before* applying, because the seed calls it and the
migration would otherwise have raised mid-apply; `tax_treatment_rules` confirmed absent (PostgREST
404), so prior exposure was zero; `payment_allocations` and `rental_booking_settlements` both 0 rows.
POST (P1–P8, all read-only, all passed): parity 150/150 zero drift; exactly 2 rows with every column
as designed; reader resolves both; both unmapped types raise through PostgREST; 3 triggers with
correct shapes; RLS on with one `service_role` policy and no `anon`/`authenticated` grant anywhere;
all three functions `REVOKE`d from PUBLIC; `md5` of three function definitions and the table DDL
identical to local; money counts unchanged at 0/0.

**Numbers, each re-derived by command at the time of writing:** 40 tests in the phase-A spec; suite
**3017/3017** across 144 files; tsc **223 server / 210 app** — the standing baselines, zero net new;
remote parity **150/150**, drift 0.

> `e170593` committed the figures "37 new tests" and "3014/3014". Both were stale on arrival — they
> predated the R5–R10 amendments that added three tests. Corrected in `progress.md` and
> `handoff.md` in the record change set.

## 7. Generated types

`app/types/database.types.ts` regenerated with `supabase gen types typescript --linked`, **CLI
v2.75.0**, after the remote apply, per the regenerate-never-hand-edit convention.

Additive in schema content: `tax_treatment_rules`, `f_tax_treatment_for`, and
`f_write_settlement_discount_line` — the last **overdue from mig-148**, which was applied to remote
earlier and never regenerated. The only non-additive change is 5 pairs of lines where this CLI adds
explicit parentheses around a conditional type in a generic default; semantically identical.

**The standing `[INFRA]` warning that a v2.75.0 regen silently downgrades the file format did not
reproduce.** `__InternalSupabase { PostgrestVersion: "14.1" }` is emitted by v2.75.0 and present in
both files. Settled by generating to a scratch file and diffing *before* overwriting anything —
which is the part of that warning worth keeping. tsc held at 223/210 across the regen. The BACKLOG
line is corrected accordingly.

## 8. Handover for Phase A2 — wire the tax reader

Naming: the reader-wiring work is **Phase A2**, not "Phase B". "Phase B" in the 2026-10-26 T4 scope
report means the **settlement numbered document**. Older text in `BACKLOG.md`, `handoff.md`,
`progress.md` and `decisions.md` still says "Phase B" for the wiring; a docs-restructure session
owns that rename.

Things A2 must not have to rediscover:

1. **One live call passes `charge_type NULL`.**
   `f_write_settlement_charge_line(p_booking_id, v_settlement_id, 'penalty', v_penalty_net,
   p_branch_id, p_staff_user_id, NULL)` at **mig-148:376**, inside `f_settle_rental_booking_return`.
   This is the deposit-era penalty line. A fail-closed reader wired into the writer **raises on it**
   and breaks that path — which is the whole reason phase A wires nothing.
   Do not count grep hits here: `143:368`, `146:363` and `147:300` are the *same statement* in
   superseded `CREATE OR REPLACE` generations of that function. Only the last one exists. Earlier
   reports (mine and HUB's) both miscounted this; check function boundaries, not grep lines.
2. **That NULL and the accountant memo are coupled.** It most likely becomes `contractual_penalty`
   — exactly the charge type §2 deliberately refuses to seed. So the wiring cannot land before
   item (1) of the accountant package is answered. A2 needs its own scope gate for that reason.
3. **`accounting-export.get.ts:23` and `:49`** (§5). Fixing it needs more than swapping in the
   central reader: the `/ 107` form silently assumes `vat_inclusive`, so `vat_exclusive` has to be
   handled or the export is simply wrong for any non-inclusive rule.
4. **`f_tax_vat_config()` cannot retire yet.** mig-150 reads *through* it, so retiring it while the
   new table is seeded **from** it is a circular dependency, not a migration. Current callers:
   `143:75`, `148:80`, and the 150 seed.
5. **`'-infinity'` through PostgREST is the string `"-infinity"`** (§3). The first TS or UI reader
   of `effective_from`/`effective_to` must special-case the infinite bound.
6. **Tooling:** `npx supabase` resolves to v3.2.0, which refuses this repo's `config.toml`
   ("inbucket … no longer supported"). Use the pinned global `supabase` (v2.75.0, Homebrew) for
   every DB command. PostgREST cannot read `pg_catalog`, so catalog checks need
   `supabase db dump --linked` compared against `--local`; that dump quotes identifiers and emits
   `CREATE OR REPLACE TRIGGER`, so grep patterns written against a migration's own text will miss
   objects that are in fact present.
7. **Routing (CHiP, 2026-11-17):** questions go to HUB as a cross-session message, not to CHiP in
   the worker's own window. A worker does not run production writes — it prepares the PRE evidence
   and the exact command, HUB runs the single write after CHiP's word, and the worker then runs the
   read-only POST probes.

## 9. State at close

- `HEAD` = `e170593` on `feature/t4-documents`; **no upstream**, so nothing pushed.
- `staging` = `origin/staging` = `5c202f6`; **not merged**.
- Remote schema at **150**, parity 150/150.
- Record change set **uncommitted**: `docs/BACKLOG.md`, `docs/audit/gate-log.md`, `handoff.md`,
  `progress.md`, `app/types/database.types.ts`, and this file.
- `docs/audit/2026-10-08-gantt-prereq-audit.md` is untracked and **pre-existing** — not part of this
  work, keep it out of the commit.

Push and merge remain CHiP's gates, asked through HUB.
