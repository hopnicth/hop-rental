/**
 * Tests: move manual payment details out of cart into payment detail pages.
 *
 * Source-inspection contract. Covers:
 *  1. Cart is review/checkout only: single Checkout button + terms + note;
 *     NO bank details, NO upload input, NO payment history, NO online-pay UI.
 *  2. Checkout routes to /user/rentals/[id] and /user/orders/[id] (split for
 *     mixed/multiple via a selection state).
 *  3. Detail pages show bank transfer details + payment history + upload.
 *  4. Central bank config (placeholder) + bank component reads it (no hardcode).
 *  5. New i18n keys exist (en real; th/cn/jp placeholders, except the two
 *     user-provided Thai strings).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const CART = read("app/pages/user/cart.vue");
const RENTAL = read("app/pages/user/rentals/[bookingId].vue");
const ORDER = read("app/pages/user/orders/[orderId].vue");
const BANK_CFG = read("app/utils/payment-account.ts");
const BANK_CMP = read("app/components/payment/PaymentBankTransferCard.vue");

describe("cart is review/checkout only", () => {
  it("has a single Checkout flow (terms + note + button)", () => {
    expect(CART).toContain("handleCheckout");
    expect(CART).toContain("checkoutTermsAccepted");
    expect(CART).toContain("cart.checkoutButton");
    expect(CART).toContain("cart.checkoutNote");
  });
  it("routes to detail pages (single) or the combined page (multiple)", () => {
    expect(CART).toContain("/user/rentals/");
    expect(CART).toContain("/user/orders/");
    expect(CART).toContain("/user/checkout-payment?");
  });
  it("does NOT contain bank details, upload input, history, or QR", () => {
    expect(CART).not.toContain("PaymentBankTransferCard");
    expect(CART).not.toContain("PaymentSlipHistory");
    expect(CART).not.toContain('type="file"');
    expect(CART).not.toContain("paymentBank.");
    expect(CART).not.toContain("QrcodeVue");
  });
  it("has online + combined payment UI fully removed (not flag-gated)", () => {
    expect(CART).not.toContain("ONLINE_CART_PAYMENT_ENABLED");
    expect(CART).not.toContain("showPaymentMethodSelector");
    expect(CART).not.toContain("canUseUnifiedCheckout");
    expect(CART).not.toContain("ชำระรวม");
  });
});

describe("detail pages show bank + history + upload", () => {
  it("rental detail has bank card, history, and slip upload", () => {
    expect(RENTAL).toContain("PaymentBankTransferCard");
    expect(RENTAL).toContain("PaymentSlipHistory");
    expect(RENTAL).toContain("/deposit-slip");
    expect(RENTAL).toContain("loadDepositSlips");
  });
  it("order detail has bank card, history, and slip upload", () => {
    expect(ORDER).toContain("PaymentBankTransferCard");
    expect(ORDER).toContain("PaymentSlipHistory");
    expect(ORDER).toContain("/payment-slip");
  });
});

describe("central bank config", () => {
  it("exists, is a placeholder, and exposes the placeholder flag", () => {
    expect(BANK_CFG).toContain("HOPNIC_PAYMENT_ACCOUNT");
    expect(BANK_CFG).toContain("HOPNIC_PAYMENT_ACCOUNT_IS_PLACEHOLDER");
    expect(BANK_CFG).toContain("[TODO");
  });
  it("bank component reads the config (no hardcoded account number) + copy", () => {
    expect(BANK_CMP).toContain("HOPNIC_PAYMENT_ACCOUNT");
    expect(BANK_CMP).toContain("copyAccountNumber");
    expect(BANK_CMP).not.toContain("getPublicUrl");
    // no file links / download anchors (only account text + copy button)
    expect(BANK_CMP).not.toContain("<a ");
    expect(BANK_CMP).not.toContain("href=");
  });
});

describe("checkout/bank/history i18n keys", () => {
  const j = (f: string) => JSON.parse(read(`i18n/locales/${f}.json`));
  const CART_KEYS = [
    "checkoutNote",
    "checkoutTermsLabel",
    "checkoutButton",
    "selectNextStepTitle",
    "rentalNextStep",
    "saleNextStep",
  ];
  it("en has real values for cart + paymentBank + paymentHistory", () => {
    const en = j("en");
    for (const k of CART_KEYS) {
      expect(en.cart[k]).toBeTruthy();
      expect(en.cart[k]).not.toContain("NEEDS_TRANSLATION");
    }
    expect(en.paymentBank.title).not.toContain("NEEDS_TRANSLATION");
    expect(en.paymentHistory.status.pending_review).not.toContain(
      "NEEDS_TRANSLATION",
    );
  });
  it("th uses the user-provided Thai for checkoutNote + checkoutButton", () => {
    const th = j("th");
    expect(th.cart.checkoutNote).not.toContain("NEEDS_TRANSLATION");
    expect(th.cart.checkoutButton).toBe("ดำเนินการชำระเงิน");
  });
  it("cn/jp paymentBank keys carry NEEDS_TRANSLATION placeholders", () => {
    for (const f of ["cn", "jp"]) {
      expect(j(f).paymentBank.title).toContain("[NEEDS_TRANSLATION]");
    }
  });
});
