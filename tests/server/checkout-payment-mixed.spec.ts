/**
 * Tests: mixed checkout now flows through the CENTRAL payment request.
 *
 * The old query-param combined page (`/user/checkout-payment`) + its combined
 * slip endpoint were retired: the cart creates ONE `manual_payment_requests` row
 * and routes to `/user/payments/[id]` (covered by manual-payment-request-* specs);
 * the deprecated page now redirects to `/user/payments`. Covers:
 *  1. Mixed cart shows a combined "amount due now" and routes to the central flow.
 *  2. No online/combined-payment surface in the cart (no payment_group / "ชำระรวม").
 *  3. Deprecated /user/checkout-payment redirects to /user/payments (no combined UI).
 *  4. en/th i18n present for the mixed amount keys (no NEEDS_TRANSLATION).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const CART = read("app/pages/user/cart.vue");
const PAGE = read("app/pages/user/checkout-payment.vue");

describe("mixed cart — combined amount + routing", () => {
  it("shows a combined amount due now for mixed carts", () => {
    expect(CART).toContain("combinedDueNow");
    expect(CART).toContain("cart.combinedDueNowLabel");
    expect(CART).toMatch(/orderGrandTotal[\s\S]{0,80}bookingDepositDueNow/);
    expect(CART).toContain("hasPurchaseItems && hasRentalBookings");
  });
  it("routes mixed/multiple targets to the central payment request page", () => {
    // Mixed/booking targets now flow through ONE central payment request which
    // redirects to /user/payments/[id].
    expect(CART).toContain("/api/user/manual-payment-requests");
    expect(CART).toContain("res.redirectTo");
    expect(CART).not.toContain("/user/checkout-payment?");
    expect(CART).toContain("handleCheckout");
  });
  it("keeps a sale-order failure from blocking rental targets", () => {
    expect(CART).toContain("const bookingIds = activeBookings.value.map");
    expect(CART).toMatch(/targetCount = \(orderId \? 1 : 0\) \+ bookingIds\.length/);
  });
  it("has no online/combined-payment surface", () => {
    expect(CART).not.toContain("ชำระรวม");
    expect(CART).not.toContain("payment_group");
    expect(CART).not.toContain("checkoutTargets");
    expect(CART).not.toContain("canUseUnifiedCheckout");
  });
});

describe("deprecated /user/checkout-payment page", () => {
  it("redirects to /user/payments and hosts no combined payment UI", () => {
    expect(PAGE).toContain('navigateTo("/user/payments"');
    expect(PAGE).toContain("redirectCode");
    // the old combined UI / direct upload is gone
    expect(PAGE).not.toContain("PaymentBankTransferCard");
    expect(PAGE).not.toContain("/api/user/checkout-payment/slip");
    expect(PAGE).not.toContain('type="file"');
  });
});

describe("mixed payment i18n (en + th have real values)", () => {
  const KEYS = [
    "title",
    "amountTitle",
    "saleAllocation",
    "depositAllocation",
    "combinedTotal",
    "customerNote",
    "uploadTitle",
    "uploadAction",
  ];
  const load = (f: string) => JSON.parse(read(`i18n/locales/${f}.json`));
  it("en checkoutPayment + cart.combinedDueNowLabel are real", () => {
    const en = load("en");
    for (const k of KEYS) {
      expect(en.checkoutPayment[k]).toBeTruthy();
      expect(en.checkoutPayment[k]).not.toContain("NEEDS_TRANSLATION");
    }
    expect(en.cart.combinedDueNowLabel).not.toContain("NEEDS_TRANSLATION");
  });
  it("th checkoutPayment + cart.combinedDueNowLabel are real (no NEEDS_TRANSLATION)", () => {
    const th = load("th");
    for (const k of KEYS) {
      expect(th.checkoutPayment[k]).toBeTruthy();
      expect(th.checkoutPayment[k]).not.toContain("NEEDS_TRANSLATION");
    }
    expect(th.cart.combinedDueNowLabel).not.toContain("NEEDS_TRANSLATION");
  });
});
