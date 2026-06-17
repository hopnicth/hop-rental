/**
 * Tests: central manual payment request — customer routes + UI contract.
 *
 * Covers (source inspection + grep guards):
 *  1. customer routes use serverSupabaseUser + ownership; no `auth` middleware
 *  2. slip upload route is EVIDENCE ONLY — never marks order paid / confirms
 *     booking / deducts inventory / writes held balance / touches Omise/KYC
 *  3. cart routes checkout to /user/payments/[id] (not orders/rentals/checkout-payment)
 *     and shows no online-payment UI (card/PromptPay/Omise)
 *  4. /user/payments pages exist with the required sections
 *  5. order/rental detail pages link to the related payment request and no longer
 *     host the primary upload form
 *  6. no [NEEDS_TRANSLATION] in the active en/th paymentRequests flow
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("customer route auth + ownership", () => {
  const routes = [
    "server/api/user/manual-payment-requests/index.post.ts",
    "server/api/user/manual-payment-requests/index.get.ts",
    "server/api/user/manual-payment-requests/[id].get.ts",
    "server/api/user/manual-payment-requests/[id]/slips.post.ts",
    "server/api/user/manual-payment-requests/[id]/cancel.post.ts",
    "server/api/user/manual-payment-requests/by-target.get.ts",
  ];
  it("every customer route requires the authenticated user", () => {
    for (const r of routes) {
      const src = read(r);
      expect(src).toContain("serverSupabaseUser");
    }
  });
  it("detail/upload/cancel enforce ownership (403 on mismatch)", () => {
    expect(read("server/api/user/manual-payment-requests/[id]/slips.post.ts")).toContain(
      "Access denied",
    );
    expect(read("server/api/user/manual-payment-requests/[id]/cancel.post.ts")).toContain(
      "Access denied",
    );
  });
});

describe("slip upload is evidence only", () => {
  const src = read("server/api/user/manual-payment-requests/[id]/slips.post.ts");
  const util = read("server/utils/manual-payment-request.ts");
  it("upload route advances only to pending_review", () => {
    expect(src).toContain('status: "pending_review"');
  });
  it("upload route never marks order paid or confirms a booking", () => {
    expect(src).not.toContain('payment_status: "paid"');
    expect(src).not.toContain('"confirmed"');
    expect(src).not.toContain("f_apply_order_inventory");
    expect(src).not.toContain("rental_held_balance_events");
    expect(src).not.toContain("confirmRentalBooking");
  });
  it("the core util touches no order/booking/inventory/ledger/Omise/KYC", () => {
    expect(util).not.toContain("f_apply_order_inventory");
    expect(util).not.toContain("rental_held_balance_events");
    expect(util).not.toContain("confirmRentalBooking");
    expect(util).not.toContain("payment_attempts");
    expect(util).not.toContain("kyc");
    expect(util).not.toMatch(/\.update\(\s*\{\s*payment_status:\s*["']paid["']/);
  });
});

describe("cart checkout routes to the central payment page", () => {
  const cart = read("app/pages/user/cart.vue");
  it("posts to manual-payment-requests and navigates to redirectTo", () => {
    expect(cart).toContain("/api/user/manual-payment-requests");
    expect(cart).toContain("res.redirectTo");
  });
  it("no longer routes to checkout-payment query-param flow", () => {
    expect(cart).not.toContain("/user/checkout-payment?");
  });
  it("no online-payment UI in cart (PromptPay/Omise)", () => {
    // word-boundary guards so "Promise" (contains "omise") is not a false hit
    expect(cart).not.toMatch(/\bpromptpay\b/i);
    expect(cart).not.toMatch(/\bomise\b/i);
  });
});

describe("no auth route middleware on payment pages", () => {
  const pages = [
    "app/pages/user/payments/index.vue",
    "app/pages/user/payments/[paymentRequestId].vue",
  ];
  it("pages do not declare middleware: 'auth'", () => {
    for (const p of pages) {
      const src = read(p);
      expect(src).not.toContain('middleware: "auth"');
      expect(src).not.toContain("middleware: 'auth'");
    }
  });
});

describe("/user/payments pages structure", () => {
  it("detail page shows amount, allocation, bank card, upload, history", () => {
    const src = read("app/pages/user/payments/[paymentRequestId].vue");
    expect(src).toContain("paymentRequests.amountDueNow");
    expect(src).toContain("paymentRequests.allocationTitle");
    expect(src).toContain("PaymentBankTransferCard");
    expect(src).toContain("paymentRequests.uploadSlip");
    expect(src).toContain("PaymentSlipHistory");
  });
  it("list page renders status filter tabs", () => {
    const src = read("app/pages/user/payments/index.vue");
    expect(src).toContain("awaiting_payment");
    expect(src).toContain("pending_review");
    expect(src).toContain("PaymentRequestListCard");
  });
});

describe("order/rental detail link to the related request", () => {
  it("order detail uses the related card, not the primary upload form", () => {
    const src = read("app/pages/user/orders/[orderId].vue");
    expect(src).toContain("PaymentRequestRelatedCard");
    expect(src).not.toContain("/payment-slip");
  });
  it("rental detail uses the related card, not the primary upload form", () => {
    const src = read("app/pages/user/rentals/[bookingId].vue");
    expect(src).toContain("PaymentRequestRelatedCard");
    expect(src).not.toContain("uploadDepositSlip");
  });
});

describe("i18n — active en/th payment flow fully translated", () => {
  for (const locale of ["en", "th"] as const) {
    it(`${locale}.json paymentRequests has no NEEDS_TRANSLATION`, () => {
      const json = JSON.parse(read(`i18n/locales/${locale}.json`));
      const block = JSON.stringify(json.paymentRequests ?? {});
      expect(block).not.toContain("NEEDS_TRANSLATION");
      expect(Object.keys(json.paymentRequests ?? {}).length).toBeGreaterThan(10);
    });
  }
});
