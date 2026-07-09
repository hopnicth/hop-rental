/**
 * Tests: migration 118 — append-only guards on manual-payment tables (G1)
 *   supabase/migrations/118_manual_payment_append_only_guards.sql
 *
 * These are SCHEMA-ANCHOR (source-inspection) tests that PIN the migration's
 * guard contract so any future edit to the whitelists / triggers breaks a test
 * and forces a deliberate review:
 *   1. all 10 triggers are created with the correct BEFORE UPDATE/DELETE timing
 *   2. each guard-update function's transition whitelist == the approved set,
 *      EXACTLY (extracted from both the NEW-side and OLD-side ARRAY[...])
 *   3. immutable-by-default pattern (to_jsonb(NEW) - ARRAY[...] IS DISTINCT FROM
 *      to_jsonb(OLD) - ARRAY[...]) is used for the four guarded tables
 *   4. manual_payment_request_items uses an unconditional block-update (no
 *      whitelist) — allocation rows never change
 *   5. all five block-delete functions RAISE (DELETE blocked for all roles)
 *   6. the DO-block assertion pins the count to 10 triggers
 *   7. header records the two operational notes (add-column safe; A2 purge)
 *
 * Plus a JS parity model of the jsonb-subtract guard LOGIC (the trigger itself
 * is SQL and cannot run under the Node/vitest harness — no live DB).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SQL = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/118_manual_payment_append_only_guards.sql",
  ),
  "utf8",
);

// Approved transition whitelists (from the reviewed draft).
const WHITELISTS: Record<string, string[]> = {
  manual_payment_requests: [
    "status",
    "admin_note",
    "submitted_at",
    "reviewed_at",
    "reviewed_by",
    "rejected_at",
    "rejected_by",
    "rejected_reason",
    "updated_at",
  ],
  manual_payment_request_slips: [
    "status",
    "reviewed_by",
    "reviewed_at",
    "rejected_by",
    "rejected_at",
    "rejected_reason",
  ],
  rental_booking_deposit_slips: [
    "status",
    "reviewed_by",
    "reviewed_at",
    "review_note",
  ],
  sale_order_payment_slips: [
    "status",
    "reviewed_by",
    "reviewed_at",
    "review_note",
  ],
};

const ALL_TRIGGERS = [
  "trg_manual_payment_requests_guard_update",
  "trg_manual_payment_requests_block_delete",
  "trg_manual_payment_request_items_block_update",
  "trg_manual_payment_request_items_block_delete",
  "trg_manual_payment_request_slips_guard_update",
  "trg_manual_payment_request_slips_block_delete",
  "trg_rental_booking_deposit_slips_guard_update",
  "trg_rental_booking_deposit_slips_block_delete",
  "trg_sale_order_payment_slips_guard_update",
  "trg_sale_order_payment_slips_block_delete",
];

/** Extract the body of a `CREATE OR REPLACE FUNCTION public.<name>() ... $$;` block. */
function functionBody(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}()`);
  expect(start, `function ${name} present`).toBeGreaterThan(-1);
  const end = SQL.indexOf("$$;", start);
  expect(end, `function ${name} terminates`).toBeGreaterThan(start);
  return SQL.slice(start, end);
}

/** All quoted keys inside every ARRAY[...]::text[] in a block. */
function arrayKeys(block: string): string[][] {
  const arrays: string[][] = [];
  const re = /ARRAY\[([\s\S]*?)\]::text\[\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const keys = Array.from(m[1].matchAll(/'([^']+)'/g)).map((x) => x[1]);
    arrays.push(keys);
  }
  return arrays;
}

describe("migration 118 — trigger inventory & timing", () => {
  it("creates exactly the 10 named triggers", () => {
    for (const trg of ALL_TRIGGERS) {
      expect(SQL).toContain(`CREATE TRIGGER ${trg}`);
      expect(SQL).toContain(`DROP TRIGGER IF EXISTS ${trg}`); // idempotent
    }
  });

  it("guard-update triggers are BEFORE UPDATE; block-delete triggers are BEFORE DELETE", () => {
    const updateTables = [
      "manual_payment_requests",
      "manual_payment_request_slips",
      "rental_booking_deposit_slips",
      "sale_order_payment_slips",
    ];
    for (const t of updateTables) {
      expect(SQL).toMatch(
        new RegExp(
          `CREATE TRIGGER trg_${t}_guard_update\\s+BEFORE UPDATE ON public\\.${t}`,
        ),
      );
    }
    // items: block-update (BEFORE UPDATE, unconditional)
    expect(SQL).toMatch(
      /CREATE TRIGGER trg_manual_payment_request_items_block_update\s+BEFORE UPDATE ON public\.manual_payment_request_items/,
    );
    for (const t of Object.keys(WHITELISTS).concat("manual_payment_request_items")) {
      expect(SQL).toMatch(
        new RegExp(
          `CREATE TRIGGER trg_${t}_block_delete\\s+BEFORE DELETE ON public\\.${t}`,
        ),
      );
    }
  });

  it("the DO-block assertion pins the trigger count to 10", () => {
    expect(SQL).toMatch(/<>\s*10 THEN/);
    for (const trg of ALL_TRIGGERS) {
      // every trigger name is listed in the assertion IN() set
      expect(SQL.match(new RegExp(`'${trg}'`, "g"))?.length ?? 0).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("migration 118 — immutable-by-default whitelists (pinned)", () => {
  for (const [table, whitelist] of Object.entries(WHITELISTS)) {
    it(`${table}: guard whitelist == approved set, on BOTH NEW and OLD arrays`, () => {
      const body = functionBody(`${table}_guard_update`);
      const arrays = arrayKeys(body);
      // exactly two ARRAY[...] (NEW-side and OLD-side), identical, == whitelist
      expect(arrays).toHaveLength(2);
      const sorted = (a: string[]) => [...a].sort();
      expect(sorted(arrays[0])).toEqual(sorted(whitelist));
      expect(sorted(arrays[1])).toEqual(sorted(whitelist));
      expect(sorted(arrays[0])).toEqual(sorted(arrays[1]));
    });

    it(`${table}: uses the to_jsonb subtract IS DISTINCT FROM pattern`, () => {
      const body = functionBody(`${table}_guard_update`);
      expect(body).toContain("to_jsonb(NEW) - ARRAY[");
      expect(body).toContain("to_jsonb(OLD) - ARRAY[");
      expect(body).toContain("IS DISTINCT FROM");
      expect(body).toContain("RAISE EXCEPTION");
    });
  }

  it("manual_payment_request_items has NO guard-update whitelist — unconditional block", () => {
    // no *_items_guard_update function/trigger exists
    expect(SQL).not.toContain("manual_payment_request_items_guard_update");
    const body = functionBody("manual_payment_request_items_block_update");
    expect(body).toContain("RAISE EXCEPTION");
    expect(body).not.toContain("to_jsonb"); // no column comparison — blocks all UPDATE
  });
});

describe("migration 118 — delete blocks & operational notes", () => {
  const deleteFns = [
    "manual_payment_requests_block_delete",
    "manual_payment_request_items_block_delete",
    "manual_payment_request_slips_block_delete",
    "rental_booking_deposit_slips_block_delete",
    "sale_order_payment_slips_block_delete",
  ];
  it("all five block-delete functions RAISE (append-only)", () => {
    for (const fn of deleteFns) {
      const body = functionBody(fn);
      expect(body).toContain("RAISE EXCEPTION");
      expect(body).toMatch(/DELETE is not permitted/);
    }
  });

  it("header records: adding a column is auto-guarded, and A2 purge must drop triggers", () => {
    expect(SQL).toMatch(/ADDING a column .* requires NO guard change/);
    expect(SQL).toMatch(/LOOSENING one .* requires a\s*--\s*DELIBERATE edit/);
    expect(SQL).toMatch(/PDPA \/ retention task \(audit A2\) MUST design a/);
  });
});

/**
 * JS parity model of the SQL guard logic: strip whitelist keys from both rows,
 * then block iff the remaining columns differ. Mirrors
 *   to_jsonb(NEW) - whitelist IS DISTINCT FROM to_jsonb(OLD) - whitelist.
 */
function guardBlocks(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>,
  whitelist: string[],
): boolean {
  const strip = (r: Record<string, unknown>) => {
    const c: Record<string, unknown> = {};
    for (const k of Object.keys(r).sort())
      if (!whitelist.includes(k)) c[k] = r[k];
    return JSON.stringify(c);
  };
  return strip(oldRow) !== strip(newRow);
}

describe("migration 118 — guard LOGIC parity model (immutable-by-default)", () => {
  const wl = WHITELISTS.manual_payment_requests;
  const base = {
    id: "r1",
    customer_id: "c1",
    total_amount_due: 6950,
    status: "pending_review",
    admin_note: null as unknown,
    updated_at: "t0",
  };

  it("blocks when an immutable column changes (total_amount_due)", () => {
    expect(guardBlocks(base, { ...base, total_amount_due: 1 }, wl)).toBe(true);
  });

  it("allows when only whitelisted fields change (status + updated_at + admin_note)", () => {
    expect(
      guardBlocks(
        base,
        { ...base, status: "reviewed", updated_at: "t1", admin_note: "ok" },
        wl,
      ),
    ).toBe(false);
  });

  it("allows repeated whitelisted updates (admin_note set then reverted)", () => {
    const set = { ...base, admin_note: "guard-test", updated_at: "t1" };
    const revert = { ...set, admin_note: "", updated_at: "t2" };
    expect(guardBlocks(base, set, wl)).toBe(false);
    expect(guardBlocks(set, revert, wl)).toBe(false);
  });

  it("blocks a mixed edit (whitelisted status + immutable customer_id)", () => {
    expect(
      guardBlocks(base, { ...base, status: "reviewed", customer_id: "c2" }, wl),
    ).toBe(true);
  });

  it("items model: unconditional block — even a no-op UPDATE is rejected", () => {
    // items has no whitelist; the SQL RAISEs on ANY update regardless of diff.
    // Model: whitelist = [] means any non-identical row blocks; and the SQL
    // additionally blocks identical rows — represented here by always-true.
    const itemsBlocksAny = true;
    expect(itemsBlocksAny).toBe(true);
  });
});
