/**
 * Tests: customer deposit-slip upload UI (app/pages/user/rentals/[bookingId].vue)
 *
 * Source-inspection contract. Covers:
 *  1. Uploads via multipart FormData to the customer deposit-slip endpoint
 *  2. Upload UI is gated to draft bookings; makes clear it does not confirm
 *  3. Uses i18n keys (no hardcoded strings) and adds no Omise/QR/payment-attempt
 *     coupling
 *  4. i18n keys exist in en.json with th/cn/jp [NEEDS_TRANSLATION] placeholders
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const PAGE = read("app/pages/user/rentals/[bookingId].vue");

describe("customer deposit-slip upload UI", () => {
  it("posts a multipart slip to the customer deposit-slip endpoint", () => {
    expect(PAGE).toContain("/deposit-slip");
    expect(PAGE).toContain("FormData");
    expect(PAGE).toContain('method: "POST"');
    expect(PAGE).toContain("uploadDepositSlip");
  });

  it("gates the upload card to draft bookings", () => {
    expect(PAGE).toContain("canUploadDepositSlip");
    expect(PAGE).toContain('detail.value?.booking.status === "draft"');
    expect(PAGE).toContain('v-if="canUploadDepositSlip"');
  });

  it("uses i18n keys for all new strings (no hardcoded copy)", () => {
    expect(PAGE).toContain("rentalsPage.depositSlip.title");
    expect(PAGE).toContain("rentalsPage.depositSlip.note");
    expect(PAGE).toContain("rentalsPage.depositSlip.uploadAction");
    expect(PAGE).toContain("rentalsPage.depositSlip.pendingTitle");
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

  it("en.json has real English values for every key", () => {
    const en = load("en");
    for (const k of KEYS) {
      expect(en[k]).toBeTruthy();
      expect(en[k]).not.toContain("NEEDS_TRANSLATION");
    }
  });

  it("th/cn/jp carry NEEDS_TRANSLATION placeholders for every key", () => {
    for (const f of ["th", "cn", "jp"]) {
      const loc = load(f);
      for (const k of KEYS) {
        expect(loc[k]).toContain("[NEEDS_TRANSLATION]");
      }
    }
  });
});
