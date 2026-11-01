/**
 * Tests: migration 148 — the settlement discount gets its own ledger line.
 *
 * The 2026-09-01 UAT found the ledger and the till disagreeing: a granted
 * discount reduced rental_settlement_payment_states.amount_due but never
 * reached payment_allocations, so the ledger claimed ฿1,500 charged while
 * ฿1,300 was collected. The ฿200 existed only in money_ops_decision_logs,
 * which is an audit log, not a ledger.
 *
 * CHiP ruling 2026-11-02, option (B) "ยอดเต็ม + บรรทัดส่วนลด": keep the GROSS
 * charge and record the giveaway as its own line.
 *
 * Covers (migration source inspection — the behavioural proof is the applied
 * verification recorded in the gate report, which this pins structurally):
 *  1. two lines when discounted, one when not — and never a ฿0 line
 *  2. direction 'out' with a positive amount (gross/net/vat are CHECK >= 0)
 *  3. the charge_type CHECK admits settlement_discount and nothing invented
 *  4. the discount line carries its own VAT split
 *  5. the settle signature stays 14-arg and the body change is additive
 *  6. no history is rewritten
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const MIG = read("supabase/migrations/148_settlement_discount_line.sql");
const MIG147 = read("supabase/migrations/147_one_money_item_launch.sql");

/** The settle function body, so comparisons ignore the new preamble. */
function settleBody(src: string): string {
  const start = src.indexOf(
    "CREATE OR REPLACE FUNCTION public.f_settle_rental_booking_return(",
  );
  const end = src.indexOf(
    "GRANT EXECUTE ON FUNCTION public.f_settle_rental_booking_return(",
  );
  return src.slice(start, end);
}

describe("[148] the discount line is written only when a discount exists", () => {
  it("the settle RPC gates the write on v_discount > 0", () => {
    const body = settleBody(MIG);
    expect(body).toMatch(
      /IF\s+v_discount\s*>\s*0\s+THEN[\s\S]{0,200}f_write_settlement_discount_line/,
    );
  });

  it("the writer itself also refuses a zero or absent amount", () => {
    expect(MIG).toMatch(
      /p_gross\s+IS\s+NULL\s+OR\s+p_gross\s*<=\s*0[\s\S]{0,80}RETURN\s+NULL/,
    );
  });

  it("the rental charge line is still written at the GROSS booked total", () => {
    // Option (B): the charge line is NOT netted down.
    expect(settleBody(MIG)).toContain(
      "'rental_charge', v_base_rental",
    );
  });
});

describe("[148] the line's shape is legal by constraint, not by convention", () => {
  it("uses direction 'out' with a positive amount", () => {
    // gross_amount / net_amount / vat_amount are all CHECK >= 0, so a negative
    // line cannot exist — 'out' is the only way to represent a reduction.
    expect(MIG).toMatch(/p_branch_id,\s*'out'/);
    expect(MIG).not.toMatch(/-\s*v_gross|gross_amount\s*\*\s*-1/);
  });

  it("carries its own VAT split", () => {
    // payment_allocations enforces abs(gross - (net + vat)) <= 0.01, so a bare
    // gross figure would be rejected outright.
    expect(MIG).toContain("f_tax_vat_config()");
    expect(MIG).toMatch(/v_net\s*:=\s*round\(p_gross \/ \(1 \+ v_rate \/ 100\.0\), 2\)/);
    expect(MIG).toMatch(/v_vat\s*:=\s*v_gross - v_net/);
  });

  it("is allocation_type manual_adjustment + charge_type settlement_discount", () => {
    expect(MIG).toContain("'manual_adjustment', 'pending'");
    expect(MIG).toContain("'settlement_discount'");
  });

  it("widens the charge_type CHECK additively and invents nothing else", () => {
    const check = MIG.slice(
      MIG.indexOf("ADD CONSTRAINT payment_allocations_charge_type_chk"),
      MIG.indexOf("-- ─── 2."),
    );
    for (const existing of [
      "rental_charge",
      "rental_extension",
      "taxable_service_charge",
      "actual_damage",
      "contractual_penalty",
      "pending_review",
    ]) {
      expect(check).toContain(existing);
    }
    expect(check).toContain("settlement_discount");
    // exactly one new value
    expect(check.match(/'/g)!.length / 2).toBe(7);
  });
});

describe("[148] the settle function is a body-only change", () => {
  it("keeps the 14-arg signature byte-identical to 147", () => {
    // 148 declares the discount writer FIRST, so anchor the end search to the
    // settle declaration rather than the file's first RETURNS.
    const sig = (src: string) => {
      const start = src.indexOf(
        "CREATE OR REPLACE FUNCTION public.f_settle_rental_booking_return(",
      );
      return src.slice(start, src.indexOf(")\nRETURNS", start));
    };
    expect(sig(MIG)).toBe(sig(MIG147));
  });

  it("adds the discount block and removes nothing from 147's body", () => {
    const a = settleBody(MIG147).split("\n");
    const b = settleBody(MIG).split("\n");
    // every line of 147's body survives in 148's body, in order
    let i = 0;
    for (const line of a) {
      const found = b.indexOf(line, i);
      expect(found, `147 body line vanished: ${line.slice(0, 60)}`).toBeGreaterThan(-1);
      i = found;
    }
    expect(b.length).toBeGreaterThan(a.length);
  });

  it("still refuses a late return with no memo, and still logs the discount", () => {
    const body = settleBody(MIG);
    expect(body).toContain("SETTLEMENT_MEMO_REQUIRED_FOR_LATE_RETURN");
    expect(body).toContain("settlement_discount_granted");
  });

  it("leaves amount_due arithmetic untouched", () => {
    expect(settleBody(MIG)).toMatch(/v_amount_due\s*:=\s*round\(v_base_rental \+ v_penalty_net/);
  });
});

describe("[148] no history is rewritten", () => {
  it("contains no UPDATE or DELETE against money or settlement tables", () => {
    const sql = MIG.replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/UPDATE\s+public\.payment_allocations/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.payment_allocations/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.rental_booking_settlements/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.rental_booking_settlements/i);
  });

  it("the new writer is service_role only", () => {
    expect(MIG).toMatch(
      /REVOKE ALL ON FUNCTION public\.f_write_settlement_discount_line[\s\S]{0,120}FROM PUBLIC, anon, authenticated/,
    );
    expect(MIG).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.f_write_settlement_discount_line[\s\S]{0,120}TO service_role/,
    );
    expect(MIG).toContain("SECURITY DEFINER SET search_path = public");
  });
});
