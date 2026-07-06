/**
 * Tests: customer deposit-slip upload UI (app/pages/user/rentals/[bookingId].vue)
 *
 * Source-inspection contract. Covers:
 *  1. Links to the central payment request (/user/payments/[id]); the primary
 *     upload form moved off this page (history role retained)
 *  2. Related card is gated to draft bookings; it does not confirm
 *  3. Uses i18n keys (no hardcoded strings) and adds no Omise/QR/payment-attempt
 *     coupling
 *  4. i18n keys real in th/en; cn/jp carry [NEEDS_TRANSLATION] placeholders
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const PAGE = read("app/pages/user/rentals/[bookingId].vue");

describe("customer deposit-slip UI (now links to central payment request)", () => {
  it("links to the related payment request instead of hosting the upload form", () => {
    expect(PAGE).toContain("PaymentRequestRelatedCard");
    expect(PAGE).toContain('target-type="rental_booking_deposit"');
    // primary upload moved to /user/payments/[id]
    expect(PAGE).not.toContain("uploadDepositSlip");
  });

  it("gates the related card to draft bookings", () => {
    expect(PAGE).toContain("canUploadDepositSlip");
    expect(PAGE).toContain('detail.value?.booking.status === "draft"');
    expect(PAGE).toContain('v-if="canUploadDepositSlip"');
  });

  it("keeps the deposit-slip history (history role retained)", () => {
    expect(PAGE).toContain("PaymentSlipHistory");
    expect(PAGE).toContain("loadDepositSlips");
  });

  it("adds no Omise / payment-attempt / polling coupling", () => {
    expect(PAGE).not.toContain("useOmise");
    expect(PAGE).not.toContain("payment_attempts");
    expect(PAGE).not.toContain("setInterval");
    expect(PAGE).not.toContain("booking-deposit-payment");
  });
});

describe("deposit-slip i18n keys", () => {
  const KEYS = [
    "title",
    "instructions",
    "note",
    "uploadAction",
    "pendingTitle",
    "pendingDesc",
    "noFile",
    "uploadSuccess",
    "uploadError",
  ];
  const load = (f: string) =>
    JSON.parse(read(`i18n/locales/${f}.json`)).rentalsPage
      .depositSlip as Record<string, string>;

  it("th.json + en.json have real values for every key", () => {
    for (const f of ["th", "en"]) {
      const loc = load(f);
      for (const k of KEYS) {
        expect(loc[k]).toBeTruthy();
        expect(loc[k]).not.toContain("NEEDS_TRANSLATION");
      }
    }
  });

  it("cn/jp carry NEEDS_TRANSLATION placeholders (disabled locales)", () => {
    for (const f of ["cn", "jp"]) {
      const loc = load(f);
      for (const k of KEYS) {
        expect(loc[k]).toContain("[NEEDS_TRANSLATION]");
      }
    }
  });
});
