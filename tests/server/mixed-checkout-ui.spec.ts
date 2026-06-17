/**
 * Mixed-checkout (Omise) BACKEND safeguards only.
 *
 * The cart-coupling tests for the old mixed/unified online checkout UI were
 * removed: that UX is no longer wired into the cart — the cart now creates a
 * central manual payment request (covered by cart-manual-checkout-ui /
 * checkout-payment-detail-ui / manual-payment-request-* specs). The Omise
 * mixed-checkout pages/APIs/migration still exist (out of scope to remove), so
 * these backend safeguards are retained.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const statusVue = readFileSync(
  "app/pages/mixed-checkout/[sessionId].vue",
  "utf8",
);
const statusApi = readFileSync(
  "server/api/mixed-checkout/[sessionId]/status.get.ts",
  "utf8",
);
const initiateApi = readFileSync(
  "server/api/mixed-checkout/[sessionId]/initiate.post.ts",
  "utf8",
);
const cancelApi = readFileSync(
  "server/api/mixed-checkout/[sessionId]/cancel.post.ts",
  "utf8",
);
const migration079 = readFileSync(
  "supabase/migrations/079_mixed_checkout_booking_deposit_column_guard.sql",
  "utf8",
);
const en = JSON.parse(readFileSync("i18n/locales/en.json", "utf8"));
const th = JSON.parse(readFileSync("i18n/locales/th.json", "utf8"));

describe("Phase 3.2C mixed checkout UI source safeguards", () => {
  it("auto-reconciles mixed payment status like the approved sale payment page", () => {
    expect(statusVue).toContain("async function pollPaymentAttempt");
    expect(statusVue).toContain(
      "/api/mixed-checkout/${encodeURIComponent(sessionId.value)}/poll",
    );
    expect(statusVue).toContain("async function syncPaymentStatus");
    expect(statusVue).toContain("startPolling()");
    expect(statusVue).toContain("stopPolling()");
    expect(statusVue).toContain("stopTicker()");
    expect(statusVue).toContain("isReconcilingPayment");
    expect(statusVue).toContain("mixedCheckout.checkingStatus");
  });

  it("uses clean primary pay-now copy for booking-only and mixed payment pages", () => {
    expect(th.mixedCheckout.bookingOnlyTitle).toBe("ชำระเงินมัดจำจอง");
    expect(th.mixedCheckout.bookingOnlyDesc).toContain("ค่าเช่า");
    expect(th.mixedCheckout.mixedTitle).toBe("ชำระยอดรวม");
    expect(th.mixedCheckout.mixedDesc).toContain("ค่าสินค้า");
    expect(statusVue).toContain("const pageTitle = computed");
    expect(statusVue).toContain("mixedCheckout.amountDueNow");
    expect(statusVue).toContain("mx-auto max-w-xl");
    expect(statusVue).toContain("h-72 w-72");
  });

  it("mixed card initiate reconciles paid card charges through mixed finalization", () => {
    expect(initiateApi).toContain("applyMixedCheckoutGatewayResult");
    expect(initiateApi).toContain("retrieveOmiseCharge");
    expect(initiateApi).toContain('if (charge.status === "paid")');
    expect(initiateApi).toContain("refreshMixedCardAttempt");
    expect(initiateApi).toContain(
      "mapMixedPaymentAttemptResponse(refreshedAttempt",
    );
  });

  it("mixed checkout status page shows payment and allocation breakdown without receipts", () => {
    expect(statusVue).toContain(
      "/api/mixed-checkout/${encodeURIComponent(sessionId.value)}/status",
    );
    expect(statusVue).toContain("mixedCheckout.allocationBreakdown");
    expect(statusVue).toContain("status.allocations");
    expect(statusVue).toContain("mixedCheckout.notReceipt");
    expect(en.mixedCheckout.experimentalDesc).toContain("staging");
  });

  it("status endpoint/page supports rental-only sessions without sale orders", () => {
    expect(statusApi).toContain(
      "const saleOrderId = normalizedSession.sale_order_id",
    );
    expect(statusApi).toContain(": { data: null }");
    expect(statusApi).toContain("saleOrder: saleOrder ?? null");
    expect(statusApi).toContain("rentalBookings");
    expect(statusVue).toContain('v-if="status.saleOrder"');
    expect(statusVue).toContain("status.rentalBookings.length");
  });

  it("has a dedicated session cancellation endpoint with ownership checks", () => {
    expect(cancelApi).toContain("cancelMixedCheckoutSession");
    expect(cancelApi).toContain("serverSupabaseUser");
    expect(cancelApi).toContain('String(session.user_id ?? "") !== userId');
    expect(cancelApi).toContain("Forbidden");
  });

  it("cancelled mixed checkout pages render terminal state and do not continue payment", () => {
    expect(statusVue).toContain("const isCancelled = computed");
    expect(statusVue).toContain("mixedCheckout.cancelledTitle");
    expect(statusVue).toContain('v-else-if="isCancelled"');
    expect(initiateApi).toContain("MIXED_CHECKOUT_SESSION_NOT_PAYABLE");
    expect(initiateApi).toContain("PAYABLE_MIXED_SESSION_STATUSES");
  });

  it("guards status page against missing Booking Deposit payment columns", () => {
    expect(statusApi).toContain("booking_deposit_payment_status");
    expect(statusApi).toContain("Compatibility guard");
    expect(migration079).toContain(
      "ADD COLUMN IF NOT EXISTS booking_deposit_payment_status",
    );
  });
});
