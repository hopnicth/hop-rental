/**
 * Tests: T-UAT 2a — customer checkout under the launch deposit regime.
 *
 * The 2026-09-01 UAT found a customer could not complete a booking: with
 * deposits feature-gated off the booking deposit is ฿0, every rental target was
 * skipped, and the payment-request util refused the whole checkout with 422
 * NO_AMOUNT_DUE_FOR_TARGETS. The raw transport string was then printed to the
 * customer. See docs/BACKLOG.md → "T-UAT — launch blockers (UAT 2026-09-01)".
 *
 * Covers (source inspection — the change is an endpoint orchestration and a Vue
 * template, neither of which is reachable through the util-level mock client):
 *  1. the endpoint reads the regime through f_deposits_enabled
 *  2. FAIL-CLOSED IN THE RIGHT DIRECTION — only an explicit `false` relaxes
 *  3. confirmation relaxes ONLY the deposit requirement
 *  4. mixed carts confirm rental targets too (not gated on an empty request)
 *  5. nothing payable → redirect to /user/rentals, no empty request created
 *  6. NO FICTION — confirmRentalBooking writes exactly one thing, the status flip
 *  7. the util's "never confirms a booking" invariant is left intact
 *  8. the cart never renders a thrown error's raw message
 *  9. the rental fee is not presented as due at pickup
 * 10. both new i18n keys exist in en + th with no placeholder
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

const ENDPOINT = "server/api/user/manual-payment-requests/index.post.ts";
const UTIL = "server/utils/manual-payment-request.ts";
const CONFIRM_UTIL = "server/utils/rental-booking-confirmation.ts";
const CART = "app/pages/user/cart.vue";

describe("[T-UAT 2a] checkout reads the deposit regime", () => {
  const src = read(ENDPOINT);

  it("reads the regime through f_deposits_enabled, not the booking row", () => {
    expect(src).toContain("f_deposits_enabled");
    // booking_deposit_payment_status is NOT NULL DEFAULT 'unpaid', so "no
    // deposit" and "deposit era, unpaid" are the same value — it can never be
    // the regime signal.
    expect(code(src)).not.toContain("booking_deposit_payment_status");
  });

  it("FAILS CLOSED — only an explicit false relaxes the deposit requirement", () => {
    expect(code(src)).toMatch(/data\s*===\s*false/);
    // An unknown regime must keep today's behaviour. If this ever becomes
    // `data !== true`, an RPC error would silently confirm bookings for free.
    expect(code(src)).not.toMatch(/data\s*!==\s*true/);
  });

  it("treats an RPC error as deposits ON", () => {
    // The regime reader returns false (= "not off", keep requiring the deposit)
    // on any error, so a failed lookup can never confirm a booking for free.
    expect(code(src)).toMatch(/if\s*\(error\)\s*return\s+false/);
  });
});

describe("[T-UAT 2a] what the confirm branch is allowed to do", () => {
  const src = read(ENDPOINT);

  it("relaxes ONLY the deposit requirement, never ownership", () => {
    expect(code(src)).toMatch(/requireBookingDepositPaid:\s*false/);
    expect(code(src)).not.toContain("skipUserOwnershipCheck");
    expect(code(src)).not.toContain("bypassBookingDepositRequirement");
  });

  it("confirms rental targets even when a sale order rides along (mixed cart)", () => {
    // The mixed cart has a payable sale amount, so it never hit the 422 — but
    // its bookings would be left draft. The branch must NOT be gated on the
    // request coming out empty.
    const c = code(src);
    const confirmAt = c.indexOf("confirmRentalBooking");
    const guard = c.slice(0, confirmAt);
    expect(confirmAt).toBeGreaterThan(-1);
    expect(guard).not.toMatch(/planned\.length\s*===\s*0/);
    expect(guard).not.toMatch(/if\s*\(\s*!?\s*orderId\s*\)/);
  });

  it("routes to /user/rentals when there is nothing left to pay", () => {
    expect(src).toContain('redirectTo: "/user/rentals"');
  });

  it("never asks the util to build an empty request", () => {
    const c = code(src);
    const emptyGuard = c.indexOf("NO_CHECKOUT_TARGETS");
    const utilCall = c.indexOf("createManualPaymentRequestFromTargets(client");
    expect(emptyGuard).toBeGreaterThan(-1);
    expect(utilCall).toBeGreaterThan(emptyGuard);
  });
});

describe("[T-UAT 2a] the pickup hub the customer chose is persisted, not trusted", () => {
  const src = read(ENDPOINT);
  const cart = read(CART);

  it("the cart sends its chosen branch", () => {
    expect(code(cart)).toContain("pickupHubId: pickupBranchId.value");
  });

  it("the server never writes a client-supplied hub unchecked", () => {
    const c = code(src);
    const assign = c.slice(c.indexOf("async function assignPickupHub"));
    // Branch must exist AND be active before anything is written.
    expect(assign).toContain("store_branches");
    expect(assign).toMatch(/is_active\s*!==\s*true/);
    expect(assign).toContain("PICKUP_HUB_NOT_AVAILABLE");
    // The write must come after the checks.
    expect(assign.indexOf("PICKUP_HUB_NOT_AVAILABLE")).toBeLessThan(
      assign.indexOf(".update({ hub_id"),
    );
  });

  it("refuses a hub that does not carry the asset", () => {
    const assign = code(src).slice(
      code(src).indexOf("async function assignPickupHub"),
    );
    expect(assign).toContain("asset_branch_inventory");
    expect(assign).toContain("ASSET_NOT_AT_PICKUP_HUB");
    expect(assign.indexOf("ASSET_NOT_AT_PICKUP_HUB")).toBeLessThan(
      assign.indexOf(".update({ hub_id"),
    );
  });

  it("writes hub_name too, because /user/rentals renders hubName", () => {
    expect(code(src)).toMatch(/\.update\(\{\s*hub_id:[^}]*hub_name:/);
  });

  it("only ever rewrites a draft booking", () => {
    const assign = code(src).slice(
      code(src).indexOf("async function assignPickupHub"),
    );
    expect(assign).toMatch(/\.eq\("status",\s*"draft"\)/);
  });

  it("assigns the hub BEFORE confirming", () => {
    const c = code(src);
    expect(c.indexOf("assignPickupHub(client")).toBeLessThan(
      c.indexOf("confirmRentalBooking({"),
    );
  });
});

describe("[T-UAT 2a] NO FICTION — a ฿0 deposit writes no money rows", () => {
  const src = read(CONFIRM_UTIL);

  it("confirmRentalBooking performs exactly one write", () => {
    const writes = code(src).match(/\.(insert|update|upsert|rpc)\(/g) ?? [];
    expect(writes).toHaveLength(1);
  });

  it("and that write is the booking status flip", () => {
    expect(code(src)).toMatch(/\.update\(\{\s*status:\s*"confirmed"\s*\}\)/);
  });

  it("writes no held-balance, ledger, allocation or document row", () => {
    const c = code(src);
    for (const table of [
      "rental_held_balance_events",
      "payment_allocations",
      "financial_recognition_events",
      "official_documents",
      "manual_payment_requests",
      "booking_deposit_dispositions",
    ]) {
      expect(c).not.toContain(table);
    }
  });
});

describe("[T-UAT 2a] the evidence-only util keeps its invariant", () => {
  const src = read(UTIL);

  it("still declares that it never confirms a booking", () => {
    expect(src).toContain("NEVER");
    expect(src).toMatch(/NEVER\s+\n?\s*\*?\s*confirms a booking/);
  });

  it("does not confirm bookings — the orchestration lives in the endpoint", () => {
    expect(code(src)).not.toContain("confirmRentalBooking");
    expect(code(src)).not.toMatch(/status:\s*"confirmed"/);
  });
});

describe("[T-UAT 2a] the customer never sees transport detail", () => {
  const src = read(CART);

  it("does not render a thrown error's message", () => {
    // The exact shape that leaked:
    // `e instanceof Error ? e.message : t("cart.paymentRequestFailedDesc")`
    expect(code(src)).not.toMatch(/e\s+instanceof\s+Error\s*\?\s*e\.message/);
    expect(code(src)).not.toMatch(/showInlineOrderError\([^)]*\be\.message\b/s);
  });

  it("maps server codes to customer copy through i18n", () => {
    const c = code(src);
    expect(c).toContain("statusMessage");
    expect(c).toContain('t("cart.paymentRequestFailedDesc")');
  });
});

describe("[T-UAT 2a] the cart money summary no longer contradicts itself", () => {
  const src = read(CART);

  it("does not list the rental fee under the pay-at-pickup section", () => {
    // netPayableAtPickup excludes lineType 'rental_fee' by design
    // (app/utils/rental-payment-lines.ts), so showing the fee above that total
    // read as ฿1,500 owed and ฿0 total on the same screen.
    expect(code(src)).not.toContain("cart.rentalSummaryRentalFeeAtPickup");
  });

  it("states the rental fee as due on the return day", () => {
    expect(src).toContain("cart.rentalSummaryPayAtReturnTitle");
    expect(src).toContain("cart.rentalSummaryRentalFeeAtReturn");
  });
});

describe("[T-UAT 2a] i18n", () => {
  const locales = ["en", "th"] as const;

  it("both new keys exist in every active locale", () => {
    for (const loc of locales) {
      const cart = JSON.parse(read(`i18n/locales/${loc}.json`)).cart;
      expect(cart.rentalSummaryPayAtReturnTitle).toBeTruthy();
      expect(cart.rentalSummaryRentalFeeAtReturn).toBeTruthy();
    }
  });

  it("carries no translation placeholder", () => {
    for (const loc of locales) {
      const cart = JSON.parse(read(`i18n/locales/${loc}.json`)).cart;
      expect(cart.rentalSummaryPayAtReturnTitle).not.toContain(
        "NEEDS_TRANSLATION",
      );
      expect(cart.rentalSummaryRentalFeeAtReturn).not.toContain(
        "NEEDS_TRANSLATION",
      );
    }
  });

  it("the Thai copy carries no English and no deposit vocabulary", () => {
    const cart = JSON.parse(read("i18n/locales/th.json")).cart;
    for (const key of [
      "rentalSummaryPayAtReturnTitle",
      "rentalSummaryRentalFeeAtReturn",
    ]) {
      expect(cart[key]).not.toMatch(/[A-Za-z]/);
      expect(cart[key]).not.toContain("มัดจำ");
    }
  });
});
