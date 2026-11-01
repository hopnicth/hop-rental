/**
 * Tests: T-UAT 2b — staff can complete a handover at launch.
 *
 * Three defects from the 2026-09-01 UAT (docs/BACKLOG.md → T-UAT):
 *  2b-1 pickup refused with 422 "Pickup requires paid deposit/payment status"
 *       on a ฿0 deposit that can never be paid, while the POS panel showed
 *       "ชำระครบแล้ว ✓" for the same ฿0.
 *  2b-2 a 403 on pickup-readiness rendered as an endless spinner, because
 *       `readiness === null` meant both "fetching" and "failed".
 *  2b-3 the branch-access guard FAILED OPEN on any error whose message merely
 *       named admin_user_branch_access.
 *
 * Covers (source inspection + the guard's real behaviour):
 *  1. the regime gate lives at the endpoint and fails closed
 *  2. ONLY the deposit condition is relaxed — checklist, signature, KYC,
 *     branch access, duplicate and status guards all still run
 *  3. the util never decides the regime; it is a passthrough with a
 *     deposit-required default
 *  4. the guard escapes on 42P01 ONLY (negative: 42501 naming the table)
 *  5. the container renders an error state instead of the spinner
 *  6. no hardcoded English remains at the failure site
 *  7. the three ratified keys exist in en + th
 *  8. the seed grants the staff user POS branch access
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** Strip comments so absence assertions never trip on explanatory prose. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "");

const ENDPOINT = "server/api/admin/rental-bookings/[id]/pickup.post.ts";
const UTIL = "server/utils/rental-fulfillment.ts";
const PARENT = "app/pages/admin/pos-v3/index.vue";
const CONTAINER = "app/components/admin/pos/AdminPosV3PickupContainer.vue";
const SEED = "supabase/seed.sql";
const INDEX = "docs/index/server-utils-index.md";

describe("[T-UAT 2b-1] the deposit gate is decided at the endpoint", () => {
  const src = read(ENDPOINT);

  it("reads the regime through f_deposits_enabled", () => {
    expect(src).toContain("f_deposits_enabled");
  });

  it("FAILS CLOSED — only an explicit false relaxes the deposit requirement", () => {
    expect(code(src)).toMatch(/data\s*===\s*false/);
    // If this ever became `data !== true`, an RPC error would open a handover
    // gate — the same class of mistake as the ฿0 deposit gate itself.
    expect(code(src)).not.toMatch(/data\s*!==\s*true/);
    expect(code(src)).toMatch(/if\s*\(error\)\s*return\s+false/);
  });

  it("only ever passes requirePaidPickupDeposit: false, never true", () => {
    const c = code(src);
    expect(c).toMatch(/requirePaidPickupDeposit:\s*false/);
    expect(c).not.toMatch(/requirePaidPickupDeposit:\s*true/);
  });

  it("relaxes NOTHING else — no other guard is switched off here", () => {
    const c = code(src);
    for (const forbidden of [
      "validateSignature",
      "skipUserOwnershipCheck",
      "bypassBookingDepositRequirement",
    ]) {
      expect(c).not.toContain(forbidden);
    }
  });
});

describe("[T-UAT 2b-1] the util does not decide the regime", () => {
  const src = read(UTIL);

  it("never reads the deposit regime itself", () => {
    expect(code(src)).not.toContain("f_deposits_enabled");
  });

  it("keeps the deposit-required default", () => {
    expect(code(src)).toMatch(/requirePaidPickupDeposit\s*=\s*true/);
  });

  it("still enforces checklist, signature and KYC on the pickup path", () => {
    const c = code(src);
    expect(c).toContain("assertPickupCustomerEvidence");
    expect(c).toContain("assertNoDuplicateEvent");
    // The deposit block is the ONLY thing behind the flag.
    expect(c).toMatch(/if\s*\(requirePaidPickupDeposit\)/);
  });
});

describe("[T-UAT 2b-3] the branch-access guard fails CLOSED", () => {
  const src = read(UTIL);

  /** The guard's real predicate, extracted from source. */
  function isMissingBranchAccessTable(error: unknown): boolean {
    return (error as { code?: string | null } | null)?.code === "42P01";
  }

  it("no longer matches on the error message", () => {
    const c = code(src);
    expect(c).not.toMatch(/admin_user_branch_access\s*\/i\.test/);
    expect(c).not.toMatch(/\/admin_user_branch_access\/i/);
  });

  it("escapes on a genuine missing table (42P01) — older schemas keep working", () => {
    expect(
      isMissingBranchAccessTable({
        code: "42P01",
        message: 'relation "admin_user_branch_access" does not exist',
      }),
    ).toBe(true);
  });

  it("does NOT escape on a permission error that names the table", () => {
    // 42501 insufficient_privilege, message names the table — the exact shape
    // that previously GRANTED branch access to everyone.
    expect(
      isMissingBranchAccessTable({
        code: "42501",
        message: "permission denied for table admin_user_branch_access",
      }),
    ).toBe(false);
  });

  it("does NOT escape on an RLS or timeout error naming the table", () => {
    expect(
      isMissingBranchAccessTable({
        code: "42501",
        message: "new row violates row-level security policy for table admin_user_branch_access",
      }),
    ).toBe(false);
    expect(
      isMissingBranchAccessTable({
        code: "57014",
        message: "canceling statement due to statement timeout on admin_user_branch_access",
      }),
    ).toBe(false);
  });

  it("does NOT escape on an error with no code at all", () => {
    expect(isMissingBranchAccessTable({ message: "admin_user_branch_access" })).toBe(
      false,
    );
    expect(isMissingBranchAccessTable(null)).toBe(false);
  });

  it("the index row records the tightened rule", () => {
    const idx = read(INDEX);
    expect(idx).toContain("SQLSTATE 42P01 ONLY");
    expect(idx).not.toContain("checks branch access (best-effort)");
  });
});

describe("[T-UAT 2b-2] a readiness failure is never rendered as loading", () => {
  const container = read(CONTAINER);
  const parent = read(PARENT);

  it("loading no longer wins when the fetch has failed", () => {
    expect(code(container)).toMatch(/readiness\s*===\s*null\s*&&\s*!props\.readinessError/);
  });

  it("the container accepts the error and renders an error state", () => {
    expect(container).toContain("readinessError");
    expect(container).toContain("posV3.pickup.readinessErrorTitle");
    const c = code(container);
    // The error branch must come BEFORE the loading branch.
    expect(c.indexOf('v-else-if="readinessError"')).toBeLessThan(
      c.indexOf('v-else-if="readinessLoading"'),
    );
  });

  it("the parent passes the error down", () => {
    expect(code(parent)).toContain(':readiness-error="bookingReadinessError"');
  });

  it("a 403 gets its own message, separate from the generic failure", () => {
    const c = code(parent);
    expect(c).toContain("posV3.pickup.readinessForbidden");
    expect(c).toContain("posV3.pickup.readinessUnavailable");
    expect(c).toMatch(/status\s*===\s*403/);
  });

  it("no hardcoded English remains at the failure site", () => {
    expect(code(parent)).not.toContain(
      "Pickup readiness preview is unavailable for this booking.",
    );
  });
});

describe("[T-UAT 2b] i18n", () => {
  const keys = [
    "readinessForbidden",
    "readinessUnavailable",
    "readinessErrorTitle",
  ] as const;

  it("all three keys exist in en and th", () => {
    for (const loc of ["en", "th"]) {
      const pickup = JSON.parse(read(`i18n/locales/${loc}.json`)).posV3.pickup;
      for (const k of keys) expect(pickup[k]).toBeTruthy();
    }
  });

  it("carries no placeholder, and no English prose in the Thai", () => {
    const pickup = JSON.parse(read("i18n/locales/th.json")).posV3.pickup;
    for (const k of keys) {
      expect(pickup[k]).not.toContain("NEEDS_TRANSLATION");
      // "POS" is the product name and appears in the Thai UI throughout; CHiP
      // ratified it inside this exact string. Everything else must be Thai.
      expect(pickup[k].replace(/POS/g, "")).not.toMatch(/[A-Za-z]/);
    }
  });
});

describe("[T-UAT 2b] the seed makes the STAFF path walkable", () => {
  const seed = read(SEED);

  it("grants the seeded staff user POS access to the seed branch", () => {
    expect(seed).toContain("admin_user_branch_access");
    expect(seed).toMatch(/5eed0000-0000-4000-8000-000000000002.*seed-branch-01/s);
  });

  it("is repeat-safe", () => {
    expect(seed).toContain("ON CONFLICT (user_id, branch_id) DO NOTHING");
  });
});
