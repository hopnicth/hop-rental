/**
 * Tests: cart manual bank-transfer checkout (app/pages/user/cart.vue)
 *
 * Source-inspection contract. Covers:
 *  1. Online cart payment is hidden behind a launch flag (= false)
 *  2. Payment-method selector + online CTAs are gated by that flag
 *  3. Checkout creates ONE central payment request and routes to /user/payments/[id]
 *  4. Sale target still creates a bank_transfer order (reused by the request)
 *  5. Manual guidance/CTAs use i18n keys; no hardcoded online-payment literals
 *  6. cart.* manual i18n keys exist (en real; th/cn/jp placeholders)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const CART = read("app/pages/user/cart.vue");

describe("online + combined payment UI fully removed (not flag-gated)", () => {
  it("has no online-payment launch flag and no payment-method selector", () => {
    expect(CART).not.toContain("ONLINE_CART_PAYMENT_ENABLED");
    expect(CART).not.toContain("showPaymentMethodSelector");
    expect(CART).not.toContain("paymentMethod = ref");
  });
  it("has no mixed/combined ('ชำระรวม') checkout surface", () => {
    expect(CART).not.toContain("ชำระรวม");
    expect(CART).not.toContain("canUseUnifiedCheckout");
    expect(CART).not.toContain("handleUnifiedCheckoutPay");
    expect(CART).not.toContain("MixedCheckout");
    expect(CART).not.toContain("payment_group");
  });
});

describe("unified manual checkout", () => {
  it("Checkout creates ONE payment request and routes to /user/payments/[id]", () => {
    expect(CART).toContain("handleCheckout");
    expect(CART).toContain("/api/user/manual-payment-requests");
    expect(CART).toContain("res.redirectTo");
  });
  it("still creates a bank_transfer sale order for the sale target", () => {
    expect(CART).toContain("createManualSaleOrder");
    expect(CART).toContain('paymentMethod: "bank_transfer"');
  });
  it("no longer routes checkout to the query-param page or order/rental detail", () => {
    expect(CART).not.toContain("/user/checkout-payment?");
    expect(CART).not.toMatch(/navigateTo\(\s*[`'"]\/user\/(orders|rentals)\//);
  });
});

describe("no hardcoded online-payment literals in cart source", () => {
  it("has no hardcoded customer-facing Thai payment literals (uses i18n keys)", () => {
    for (const literal of ["บัตรเครดิต", "พร้อมเพย์", "ชำระเงินมัดจำจองออนไลน์"]) {
      expect(CART).not.toContain(literal);
    }
  });
  it("does not render a PromptPay QR component", () => {
    // 'Omise' only appears in code comments, not customer-facing text; the
    // online UI is hidden via ONLINE_CART_PAYMENT_ENABLED (see gating tests).
    expect(CART).not.toContain("QrcodeVue");
    expect(CART).not.toContain("qrcode.vue");
  });
});

describe("cart manual i18n keys", () => {
  const KEYS = [
    "manualRentalCta",
    "manualRentalGuidanceTitle",
    "manualRentalGuidanceDesc",
    "manualSaleCta",
    "manualSaleGuidanceTitle",
    "manualSaleGuidanceDesc",
  ];
  const load = (f: string) =>
    JSON.parse(read(`i18n/locales/${f}.json`)).cart as Record<string, string>;
  it("th + en have real values", () => {
    for (const f of ["th", "en"]) {
      const loc = load(f);
      for (const k of KEYS) {
        expect(loc[k]).toBeTruthy();
        expect(loc[k]).not.toContain("NEEDS_TRANSLATION");
      }
    }
  });
  it("cn/jp have NEEDS_TRANSLATION placeholders (disabled locales)", () => {
    for (const f of ["cn", "jp"]) {
      const loc = load(f);
      for (const k of KEYS) expect(loc[k]).toContain("[NEEDS_TRANSLATION]");
    }
  });
});
