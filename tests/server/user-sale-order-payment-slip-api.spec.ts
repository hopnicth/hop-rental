/**
 * Tests: customer sale-order detail + payment-slip upload
 *
 * Source-inspection contract (route handlers need an H3 event; file-validation
 * behavior is covered in sale-order-payment-slip-evidence.spec.ts). Covers:
 *  1. GET /api/user/orders/[id]: auth + ownership + safe slip select
 *  2. POST .../payment-slip: auth + ownership + eligibility; moves to
 *     pending_review; NEVER marks paid / deducts inventory / touches rental
 *  3. customer order detail page uses the slip endpoint + i18n, no online pay
 *  4. ordersPage.paymentSlip i18n keys exist (en real; th/cn/jp placeholders)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const GET = read("server/api/user/orders/[id].get.ts");
const POST = read("server/api/user/orders/[id]/payment-slip.post.ts");
const PAGE = read("app/pages/user/orders/[orderId].vue");

describe("customer order detail GET route", () => {
  it("authenticates + enforces ownership", () => {
    expect(GET).toContain("serverSupabaseUser");
    expect(GET).toContain("order.user_id");
    expect(GET).toContain("Access denied");
    expect(GET).toContain("403");
  });
  it("returns slips via the safe select (no storage path/url)", () => {
    expect(GET).toContain("SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT");
    expect(GET).toContain("toSafeSaleOrderPaymentSlip");
    expect(GET).not.toContain("storage_path");
    expect(GET).not.toContain("getPublicUrl");
  });
});

describe("customer payment-slip upload route", () => {
  it("authenticates + enforces ownership + eligibility", () => {
    expect(POST).toContain("serverSupabaseUser");
    expect(POST).toContain("order.user_id");
    expect(POST).toContain("SLIP_UPLOAD_ELIGIBLE_PAYMENT_STATUSES");
    expect(POST).toContain('"awaiting_payment"');
    expect(POST).toContain("ORDER_NOT_ELIGIBLE_FOR_SLIP_UPLOAD");
  });
  it("delegates to the private sale slip util and moves to pending_review", () => {
    expect(POST).toContain("uploadSaleOrderPaymentSlipEvidence");
    expect(POST).toContain('payment_status: "pending_review"');
  });
  it("never marks paid, never deducts inventory, never touches rental ledgers", () => {
    expect(POST).not.toContain('payment_status: "paid"');
    expect(POST).not.toContain("f_apply_order_inventory");
    expect(POST).not.toContain("rental_held_balance_events");
    expect(POST).not.toContain("rental_booking_deposit_slips");
    expect(POST).not.toContain("getPublicUrl");
    expect(POST).not.toContain('"catalog-media"');
  });
});

describe("customer order detail page (links to central payment request)", () => {
  it("links to the related payment request instead of hosting the upload form", () => {
    expect(PAGE).toContain("PaymentRequestRelatedCard");
    expect(PAGE).toContain('target-type="sale_order"');
    // primary upload moved to /user/payments/[id]
    expect(PAGE).not.toContain("/payment-slip");
  });
  it("keeps the order summary + slip history and shows no online payment wording", () => {
    expect(PAGE).toContain("ordersPage.paymentSlip.grandTotal");
    expect(PAGE).toContain("PaymentSlipHistory");
    expect(PAGE).not.toContain("useOmise");
    expect(PAGE).not.toContain("promptpay");
    expect(PAGE).not.toContain("QrcodeVue");
  });
});

describe("ordersPage.paymentSlip i18n keys", () => {
  const KEYS = [
    "title",
    "instructions",
    "note",
    "amountToTransfer",
    "pendingTitle",
    "pendingDesc",
    "paidTitle",
    "uploadAction",
    "uploadSuccess",
    "uploadError",
    "noFile",
  ];
  const load = (f: string) =>
    JSON.parse(read(`i18n/locales/${f}.json`)).ordersPage.paymentSlip as Record<
      string,
      string
    >;
  it("en has real values", () => {
    const en = load("en");
    for (const k of KEYS) {
      expect(en[k]).toBeTruthy();
      expect(en[k]).not.toContain("NEEDS_TRANSLATION");
    }
  });
  it("th/cn/jp have NEEDS_TRANSLATION placeholders", () => {
    for (const f of ["th", "cn", "jp"]) {
      const loc = load(f);
      for (const k of KEYS) expect(loc[k]).toContain("[NEEDS_TRANSLATION]");
    }
  });
});
