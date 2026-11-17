/**
 * Tests: migration 150 — the central tax treatment map (T4 phase A).
 *
 * Phase A lays the table and a fail-closed reader and WIRES NOTHING. The
 * point of the design is that an unmapped charge type RAISEs instead of
 * defaulting, which turns the accountant confirmation package
 * (docs/BACKLOG.md, forfeiture VAT "pending professional confirmation")
 * into something the database enforces rather than something a reader has
 * to remember.
 *
 * Covers (migration source inspection — the behavioural proof is the applied
 * local verification recorded in the gate report, which this pins
 * structurally, following the mig-148 spec's precedent):
 *  1. the reader is fail-closed on every input it can be handed
 *  2. the seed covers ONLY the two reachable charge types
 *  3. the rate is never restated in SQL — it is read through f_tax_vat_config()
 *  4. append-only: UPDATE/DELETE/TRUNCATE all closed, one narrow exception
 *  5. no two rules overlap for one key, race included
 *  6. the migration is idempotent (supabase/claude.md §1)
 *  7. phase A wires no writer
 *  8. cross-cutting: no NEW hardcoded VAT rate in server/ or app/. ONE known
 *     offender is allow-listed — see that block. The sweep covers arithmetic
 *     and label forms, not just `vat = 7`: the first version of this test
 *     matched only `vat… = 7` and `0.07` and therefore reported a clean
 *     codebase while `(total * 7) / 107` sat in a live endpoint.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, extname } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const MIG = read("supabase/migrations/150_tax_treatment_rules.sql");

/**
 * The migration with `--` comment text removed. Negative assertions ("this
 * migration must NOT do X") have to run against SQL only: the header
 * deliberately DISCUSSES what it does not do, so a bare substring search
 * would match the explanation and fail on a correct file.
 */
const SQL_ONLY = MIG.split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

/** The reader's body, so assertions do not match the header comments. */
function readerBody(src: string): string {
  const start = src.indexOf(
    "CREATE OR REPLACE FUNCTION public.f_tax_treatment_for(",
  );
  const end = src.indexOf(
    "REVOKE ALL ON FUNCTION public.f_tax_treatment_for(",
  );
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** The append-only trigger function body. */
function appendOnlyBody(src: string): string {
  const start = src.indexOf(
    "CREATE OR REPLACE FUNCTION public.f_ttr_append_only()",
  );
  const end = src.indexOf("DROP TRIGGER IF EXISTS trg_ttr_append_only");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** The seed DO block. */
function seedBlock(src: string): string {
  const start = src.indexOf("-- ─── 6. seed");
  expect(start).toBeGreaterThan(-1);
  return src.slice(start);
}

describe("[150] the reader is fail-closed on every input", () => {
  const body = readerBody(MIG);

  it("an unmapped charge type RAISEs instead of defaulting", () => {
    expect(body).toMatch(/IF\s+NOT\s+FOUND\s+THEN[\s\S]{0,120}TAX_RULE_NOT_FOUND/);
  });

  it("a NULL charge_type RAISEs", () => {
    expect(body).toMatch(
      /p_charge_type\s+IS\s+NULL\s+THEN[\s\S]{0,120}TAX_RULE_CHARGE_TYPE_REQUIRED/,
    );
  });

  it("a non-NULL customer_kind outside the vocabulary RAISEs — no silent 'any' fallback", () => {
    // A typo must never resolve to the generic rule and return a rate the
    // caller did not ask for.
    expect(body).toMatch(
      /NOT\s+IN\s*\(\s*'person'\s*,\s*'company'\s*,\s*'any'\s*\)[\s\S]{0,140}TAX_RULE_CUSTOMER_KIND_INVALID/,
    );
  });

  it("an explicit NULL p_at RAISEs rather than surfacing as NOT_FOUND", () => {
    expect(body).toMatch(
      /p_at\s+IS\s+NULL\s+THEN[\s\S]{0,120}TAX_RULE_AS_OF_REQUIRED/,
    );
  });

  it("a NULL customer_kind IS deliberately read as 'any'", () => {
    expect(body).toMatch(/COALESCE\s*\(\s*p_customer_kind\s*,\s*'any'\s*\)/);
  });

  it("an exact customer_kind match outranks the 'any' fallback", () => {
    expect(body).toMatch(
      /ORDER\s+BY\s*\(\s*r\.customer_kind\s*<>\s*'any'\s*\)\s*DESC/,
    );
  });

  it("the period filter is half-open — a closed rule stops resolving at its end", () => {
    expect(body).toMatch(/r\.effective_from\s*<=\s*p_at/);
    expect(body).toMatch(
      /r\.effective_to\s+IS\s+NULL\s+OR\s+r\.effective_to\s*>\s*p_at/,
    );
  });

  it("the reader is service_role only", () => {
    expect(MIG).toMatch(
      /REVOKE ALL ON FUNCTION public\.f_tax_treatment_for\(text, text, timestamptz\)\s*\n?\s*FROM PUBLIC, anon, authenticated/,
    );
    expect(MIG).toContain(
      "GRANT EXECUTE ON FUNCTION public.f_tax_treatment_for(text, text, timestamptz)",
    );
  });
});

describe("[150] the seed covers only the reachable charge types", () => {
  const seed = seedBlock(MIG);

  it("seeds exactly rental_charge and settlement_discount", () => {
    expect(seed).toMatch(
      /unnest\s*\(\s*ARRAY\s*\[\s*'rental_charge'\s*,\s*'settlement_discount'\s*\]\s*\)/,
    );
  });

  it("does NOT seed the charge types awaiting accountant confirmation", () => {
    // Seeding these would promote an unconfirmed position to a confirmed one
    // and make it executable the moment deposits revive, bypassing the gate.
    for (const absent of [
      "contractual_penalty",
      "actual_damage",
      "rental_extension",
      "taxable_service_charge",
      "pending_review",
    ]) {
      expect(seed).not.toContain(`'${absent}'`);
    }
  });

  it("seeds at '-infinity' so pre-existing documents stay explainable", () => {
    expect(seed).toContain("'-infinity'::timestamptz");
  });

  it("is re-runnable — the insert is guarded by NOT EXISTS", () => {
    expect(seed).toMatch(/WHERE\s+NOT\s+EXISTS/);
  });
});

describe("[150] the rate is read, never restated", () => {
  it("the seed reads through f_tax_vat_config()", () => {
    expect(seedBlock(MIG)).toContain("public.f_tax_vat_config()");
  });

  it("the migration never writes a VAT rate literal of its own", () => {
    // 134:55 seeds system_configs 'tax.vat' and IS the source of truth.
    // 150 must not restate it; it may only read it.
    const seed = seedBlock(MIG);
    expect(seed).not.toMatch(/'rate_percent'\s*,\s*7\b/);
    expect(seed).toMatch(/\(\s*v_cfg->>'rate_percent'\s*\)::numeric/);
    expect(seed).toMatch(/v_cfg->>'treatment'/);
  });

  it("does not touch f_tax_vat_config itself", () => {
    expect(SQL_ONLY).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.f_tax_vat_config/,
    );
    expect(SQL_ONLY).not.toMatch(/DROP\s+FUNCTION[\s\S]{0,40}f_tax_vat_config/);
  });
});

describe("[150] append-only, with one narrow exception", () => {
  const body = appendOnlyBody(MIG);

  it("TG_OP is tested before anything reads OLD", () => {
    // The TRUNCATE trigger is statement-level and has no OLD, so touching
    // OLD before the TG_OP branch would error inside the guard itself.
    const truncIdx = body.indexOf("TG_OP = 'TRUNCATE'");
    const deleteIdx = body.indexOf("TG_OP = 'DELETE'");
    const firstOld = body.indexOf("OLD.");
    expect(truncIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(truncIdx);
    expect(firstOld).toBeGreaterThan(deleteIdx);
  });

  it("DELETE and TRUNCATE are both refused", () => {
    expect(body).toMatch(/TG_OP = 'TRUNCATE'[\s\S]{0,160}TAX_RULE_IMMUTABLE/);
    expect(body).toMatch(/TG_OP = 'DELETE'[\s\S]{0,160}TAX_RULE_IMMUTABLE/);
  });

  it("WHAT CHANGED is judged BEFORE the effective_to branches", () => {
    // Ordering is the whole fix here, not a style choice. With the
    // all-columns comparison last, an UPDATE that altered the rate and left
    // effective_to alone fell through to "may only be set, never cleared" —
    // a refusal that named a column the caller never touched.
    const cmpIdx = body.indexOf("IS DISTINCT FROM");
    const oldToIdx = body.indexOf("OLD.effective_to IS NOT NULL");
    const newToIdx = body.indexOf("NEW.effective_to IS NULL");
    expect(cmpIdx).toBeGreaterThan(-1);
    expect(oldToIdx).toBeGreaterThan(cmpIdx);
    expect(newToIdx).toBeGreaterThan(cmpIdx);
  });

  it("every column except effective_to is frozen", () => {
    // Asserted as the guard's presence rather than one error string: any
    // UPDATE that leaves effective_to untouched is refused by an earlier
    // branch, so the message a caller sees depends on which branch fires.
    expect(body).toMatch(/IS\s+DISTINCT\s+FROM/);
    expect(body).toContain("only effective_to may change");
    for (const col of [
      "charge_type",
      "customer_kind",
      "vat_treatment",
      "vat_rate_percent",
      "wht_rate_percent",
      "wht_type",
      "effective_from",
      "created_at",
    ]) {
      expect(body).toContain(`NEW.${col}`);
      expect(body).toContain(`OLD.${col}`);
    }
  });

  it("effective_to may be stamped once, forward only, and never cleared", () => {
    expect(body).toMatch(
      /OLD\.effective_to\s+IS\s+NOT\s+NULL[\s\S]{0,120}already set/,
    );
    expect(body).toMatch(
      /NEW\.effective_to\s+IS\s+NULL[\s\S]{0,140}never cleared/,
    );
    expect(body).toMatch(
      /NEW\.effective_to\s*<=\s*OLD\.effective_from[\s\S]{0,140}TAX_RULE_PERIOD_INVALID/,
    );
  });

  it("both the row trigger and the statement-level TRUNCATE trigger exist", () => {
    expect(MIG).toMatch(
      /CREATE TRIGGER trg_ttr_append_only\s*\n\s*BEFORE UPDATE OR DELETE ON public\.tax_treatment_rules\s*\n\s*FOR EACH ROW/,
    );
    expect(MIG).toMatch(
      /CREATE TRIGGER trg_ttr_no_truncate\s*\n\s*BEFORE TRUNCATE ON public\.tax_treatment_rules\s*\n\s*FOR EACH STATEMENT/,
    );
  });

  it("both trigger functions are revoked from PUBLIC", () => {
    // Postgres refuses a direct call to a trigger function on its own, so
    // this is consistency with mig-134 rather than a closed hole.
    for (const fn of ["f_ttr_append_only", "f_ttr_no_overlap"]) {
      expect(MIG).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${fn}\\(\\)\\s*\\n?\\s*FROM PUBLIC, anon, authenticated`,
        ),
      );
    }
  });

  it("the table CHECK also forbids a backwards period", () => {
    expect(MIG).toMatch(
      /ttr_period_chk[\s\S]{0,120}effective_to IS NULL OR effective_to > effective_from/,
    );
  });
});

describe("[150] no two rules overlap for one key", () => {
  it("the overlap guard uses range intersection, not equality", () => {
    expect(MIG).toMatch(
      /tstzrange\(r\.effective_from, r\.effective_to, '\[\)'\)\s*\n?\s*&&\s*tstzrange\(NEW\.effective_from, NEW\.effective_to, '\[\)'\)/,
    );
    expect(MIG).toContain("TAX_RULE_PERIOD_OVERLAP");
  });

  it("the race is closed by a per-key advisory lock taken BEFORE the check", () => {
    const start = MIG.indexOf("CREATE OR REPLACE FUNCTION public.f_ttr_no_overlap()");
    const body = MIG.slice(start, MIG.indexOf("DROP TRIGGER IF EXISTS trg_ttr_no_overlap"));
    const lockIdx = body.indexOf("pg_advisory_xact_lock");
    const existsIdx = body.indexOf("IF EXISTS (");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(existsIdx).toBeGreaterThan(lockIdx);
  });

  it("the guard excludes the row being written without a hardcoded UUID", () => {
    expect(MIG).toMatch(/r\.id\s+IS\s+DISTINCT\s+FROM\s+NEW\.id/);
    // supabase/claude.md §8: never hardcode a UUID in a migration.
    expect(SQL_ONLY).not.toMatch(/00000000-0000-0000-0000-000000000000/);
  });

  it("a unique index still backstops an identical effective_from", () => {
    expect(MIG).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS ttr_key_from_uidx[\s\S]{0,140}\(charge_type, customer_kind, effective_from\)/,
    );
  });

  it("no exclusion constraint is used and no extension is added", () => {
    // btree_gist is not installed and nothing in this repo uses EXCLUDE, so
    // overlap prevention must not quietly introduce an extension dependency.
    expect(SQL_ONLY).not.toContain("EXCLUDE USING");
    expect(SQL_ONLY).not.toMatch(/CREATE\s+EXTENSION/i);
    expect(SQL_ONLY).not.toContain("btree_gist");
  });
});

describe("[150] the migration is idempotent (supabase/claude.md §1)", () => {
  it("the table and index are guarded", () => {
    expect(MIG).toContain("CREATE TABLE IF NOT EXISTS public.tax_treatment_rules");
    expect(MIG).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ttr_key_from_uidx");
  });

  it("every trigger is dropped before it is created", () => {
    const triggers = [
      "trg_ttr_no_overlap",
      "trg_ttr_append_only",
      "trg_ttr_no_truncate",
    ];
    for (const t of triggers) {
      const dropIdx = MIG.indexOf(`DROP TRIGGER IF EXISTS ${t}`);
      const createIdx = MIG.indexOf(`CREATE TRIGGER ${t}`);
      expect(dropIdx).toBeGreaterThan(-1);
      expect(createIdx).toBeGreaterThan(dropIdx);
    }
  });

  it("the policy is dropped before it is created", () => {
    const dropIdx = MIG.indexOf(
      'DROP POLICY IF EXISTS "tax_treatment_rules_service_role_all"',
    );
    const createIdx = MIG.indexOf(
      'CREATE POLICY "tax_treatment_rules_service_role_all"',
    );
    expect(dropIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(dropIdx);
  });

  it("every function is CREATE OR REPLACE", () => {
    expect(SQL_ONLY).not.toMatch(/\nCREATE FUNCTION /);
  });
});

describe("[150] RLS and grants", () => {
  it("RLS is on with a service_role-only policy", () => {
    expect(MIG).toContain(
      "ALTER TABLE public.tax_treatment_rules ENABLE ROW LEVEL SECURITY",
    );
    expect(MIG).toMatch(
      /CREATE POLICY "tax_treatment_rules_service_role_all"[\s\S]{0,160}FOR ALL TO service_role/,
    );
  });

  it("anon and authenticated are revoked", () => {
    expect(MIG).toContain(
      "REVOKE ALL ON public.tax_treatment_rules FROM anon, authenticated",
    );
    expect(MIG).toContain("GRANT ALL ON public.tax_treatment_rules TO service_role");
  });
});

describe("[150] phase A wires no writer", () => {
  it("does not redefine any settlement writer or RPC", () => {
    for (const fn of [
      "f_write_settlement_charge_line",
      "f_write_settlement_discount_line",
      "f_settle_rental_booking_return",
      "f_confirm_settlement_payment",
      "f_waive_settlement_payment",
      "f_assert_tax_document_issuable",
      "f_deposits_enabled",
    ]) {
      expect(SQL_ONLY).not.toMatch(
        new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}`),
      );
    }
  });

  it("nothing in the migration calls the new reader", () => {
    // One live call passes charge_type NULL today (148:376), so a
    // fail-closed reader wired into the writer would RAISE on it. The
    // reader must therefore be DEFINED and GRANTED here but never invoked.
    expect(SQL_ONLY).toMatch(
      /CREATE OR REPLACE FUNCTION public\.f_tax_treatment_for\(/,
    );
    expect(SQL_ONLY).not.toMatch(/PERFORM\s+public\.f_tax_treatment_for/);
    expect(SQL_ONLY).not.toMatch(/:=\s*public\.f_tax_treatment_for/);
    expect(SQL_ONLY).not.toMatch(/SELECT[\s\S]{0,80}f_tax_treatment_for\s*\(/);
  });

  it("touches none of the standing do-not-sweep paths", () => {
    expect(SQL_ONLY).not.toContain("rental_held_balance_events");
    expect(SQL_ONLY).not.toContain("financial_recognition_events");
    expect(SQL_ONLY).not.toContain("money_ops_decision_logs");
    expect(SQL_ONLY).not.toContain("payment_allocations");
  });
});

describe("no NEW hardcoded VAT rate in server/ or app/", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(resolve(process.cwd(), dir))) {
      const full = join(dir, entry);
      const st = statSync(resolve(process.cwd(), full));
      if (st.isDirectory()) walk(full, out);
      else if ([".ts", ".vue", ".js"].includes(extname(entry))) out.push(full);
    }
    return out;
  }

  /**
   * Every shape a 7% VAT rate can take in code, not just the obvious one.
   *
   * The first version of this test carried only `vat… = 7` and `0.07`, which
   * is why it passed while `Math.round(((total * 7) / 107) * 100) / 100` sat
   * in a live endpoint: an inclusive-VAT extraction never writes the rate as
   * a rate. These patterns were derived by sweeping the codebase with each
   * candidate and discarding the ones that only produced false positives —
   * `/ 7` matched street addresses ("56/7") and an unanchored `vat` matched
   * the word "derivation".
   */
  const RATE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
    ["inclusive-divisor-107", /\b107\b/],
    ["gross-multiplier-1.07", /\b1\.07\b/],
    ["decimal-rate-0.07", /\b0?\.07\b/],
    ["named-field-assigned-7", /(vat|tax)[A-Za-z_]*\s*[:=]\s*(7(\.0+)?|0?\.07)\b/i],
    ["percent-over-100", /\b7\s*\/\s*100\b/],
    ["multiply-by-7", /\*\s*7\b(?!\d)/],
    ["label-7-percent", /\b7\s*%/],
    ["vat-near-7", /(\bvat\b|ภาษีมูลค่าเพิ่ม)[^\n]{0,24}\b7\b/i],
  ];

  /**
   * KNOWN OFFENDER, allow-listed by HUB ruling R6 — do NOT "fix" it here.
   *
   * server/api/admin/pos/accounting-export.get.ts
   *   :23  "VAT 7%"                                      — hardcoded label
   *   :49  Math.round(((total * 7) / 107) * 100) / 100   — hardcoded rate
   *
   * This is the accounting-export CSV endpoint, reached from
   * app/pages/admin/pos.vue, so it is live code and a real inconsistency with
   * the central map. It stays untouched in phase A for two reasons: phase A
   * wires nothing by design, and rewriting an accounting export's arithmetic
   * is not a drive-by edit. It is queued in docs/BACKLOG.md as [T4][QUEUED]
   * for the phase B scope gate — read the rate from the central rule and stop
   * hardcoding the label.
   *
   * Anything NOT on this list is a new offender and fails.
   */
  const ALLOWED = new Set<string>([
    "server/api/admin/pos/accounting-export.get.ts",
  ]);

  it("no unlisted file writes a VAT rate in any form", () => {
    const files = [...walk("server"), ...walk("app")].filter(
      (f) => !f.endsWith("database.types.ts"),
    );
    expect(files.length).toBeGreaterThan(500);

    const offenders: string[] = [];
    for (const f of files) {
      if (ALLOWED.has(f)) continue;
      const src = read(f);
      src.split("\n").forEach((line, i) => {
        for (const [name, re] of RATE_PATTERNS) {
          if (re.test(line)) {
            offenders.push(`${f}:${i + 1} [${name}] ${line.trim().slice(0, 100)}`);
            break;
          }
        }
      });
    }
    // If this fails on a legitimate `* 7` (a weekly computation, say), add the
    // file to ALLOWED with a comment naming the line and the reason — do not
    // widen or weaken a pattern.
    expect(offenders).toEqual([]);
  });

  it("the allow-listed offender still contains exactly the two known lines", () => {
    // Pins the allow-list to reality: if the endpoint is fixed, this fails and
    // the entry above must come out rather than quietly excusing a clean file.
    const src = read("server/api/admin/pos/accounting-export.get.ts");
    expect(src).toContain('"VAT 7%"');
    expect(src).toContain("Math.round(((total * 7) / 107) * 100) / 100");
  });

  it("migration 134 is the only migration that states the rate", () => {
    const migDir = "supabase/migrations";
    const offenders: string[] = [];
    for (const f of readdirSync(resolve(process.cwd(), migDir))) {
      if (!f.endsWith(".sql")) continue;
      if (f.startsWith("134_")) continue; // the source of truth
      const src = read(join(migDir, f));
      src.split("\n").forEach((line, i) => {
        if (/'rate_percent'\s*,\s*7\b/.test(line) || /\b107\b/.test(line)) {
          offenders.push(`${f}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
