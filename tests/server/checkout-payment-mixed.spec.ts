/**
 * Tests: combined mixed-checkout payment flow (one combined amount + one upload).
 *
 * Source-inspection contract (handlers need an H3 event; the per-target upload
 * behavior is covered by the sale/rental slip-evidence unit specs). Covers:
 *  1. Mixed cart shows a combined "amount due now" (sale total + shipping +
 *     Booking Deposit) and routes to the combined payment page.
 *  2. No online/combined-payment backend assumptions (no payment_group, no
 *     online-payment UI, no "ชำระรวม").
 *  3. Combined upload endpoint: auth + ownership; one upload fans out to both
 *     per-target slip utils; evidence-only (no paid/confirm/inventory/held-balance).
 *  4. Allocation clarity: separate per-target rows (sale + rental slip tables).
 *  5. en/th i18n present for the active mixed payment keys (no NEEDS_TRANSLATION).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const CART = read("app/pages/user/cart.vue");
const PAGE = read("app/pages/user/checkout-payment.vue");
const EP = read("server/api/user/checkout-payment/slip.post.ts");

describe("mixed cart — combined amount + routing", () => {
  it("shows a combined amount due now for mixed carts", () => {
    expect(CART).toContain("combinedDueNow");
    expect(CART).toContain("cart.combinedDueNowLabel");
    expect(CART).toMatch(/orderGrandTotal[\s\S]{0,80}bookingDepositDueNow/);
    expect(CART).toContain('hasPurchaseItems && hasRentalBookings');
  });
  it("routes mixed/multiple targets to the central payment request page", () => {
    // Mixed/booking targets now flow through ONE central payment request which
    // redirects to /user/payments/[id] (the durable replacement for the
    // query-param /user/checkout-payment page).
    expect(CART).toContain("/api/user/manual-payment-requests");
    expect(CART).toContain("res.redirectTo");
    expect(CART).not.toContain("/user/checkout-payment?");
    expect(CART).toContain("handleCheckout");
  });
  it("keeps a sale-order failure from blocking rental targets", () => {
    // bookingIds are gathered up front; a null orderId still allows targets.
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

describe("combined payment page", () => {
  it("computes deposit with the shared rental-payment-lines helper (authoritative)", () => {
    expect(PAGE).toContain("calculateRentalPaymentLines");
    expect(PAGE).toContain("booking_deposit");
  });
  it("shows combined total, allocation, bank card, one upload, history", () => {
    expect(PAGE).toContain("checkoutPayment.combinedTotal");
    expect(PAGE).toContain("checkoutPayment.saleAllocation");
    expect(PAGE).toContain("checkoutPayment.depositAllocation");
    expect(PAGE).toContain("PaymentBankTransferCard");
    expect(PAGE).toContain("PaymentSlipHistory");
    expect(PAGE).toContain('type="file"');
    expect(PAGE).toContain("/api/user/checkout-payment/slip");
  });
  it("has no online/combined-payment backend assumptions", () => {
    expect(PAGE).not.toContain('"payment_group"');
    expect(PAGE).not.toContain("useOmise");
    expect(PAGE).not.toContain("QrcodeVue");
  });
});

describe("combined upload endpoint", () => {
  it("authenticates and enforces ownership on order + bookings", () => {
    expect(EP).toContain("serverSupabaseUser");
    expect(EP).toContain("order.user_id");
    expect(EP).toContain("booking.user_id");
    expect(EP).toContain("Access denied");
  });
  it("fans out one upload to both per-target slip utils (separate rows)", () => {
    expect(EP).toContain("uploadSaleOrderPaymentSlipEvidence");
    expect(EP).toContain("uploadRentalDepositSlipEvidence");
    expect(EP).toContain("fileBytes");
  });
  it("moves order to pending_review only — never paid/confirm/inventory/held-balance", () => {
    expect(EP).toContain('payment_status: "pending_review"');
    expect(EP).not.toContain('payment_status: "paid"');
    expect(EP).not.toContain("f_apply_order_inventory");
    expect(EP).not.toContain("confirmRentalBooking");
    expect(EP).not.toContain("rental_held_balance_events");
    expect(EP).not.toContain('"payment_group"');
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
