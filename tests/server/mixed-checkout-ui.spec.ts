import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const cartVue = readFileSync("app/pages/user/cart.vue", "utf8");
const statusVue = readFileSync(
  "app/pages/mixed-checkout/[sessionId].vue",
  "utf8",
);
const statusApi = readFileSync(
  "server/api/mixed-checkout/[sessionId]/status.get.ts",
  "utf8",
);
const createApi = readFileSync(
  "server/api/mixed-checkout/create.post.ts",
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
const nuxtConfig = readFileSync("nuxt.config.ts", "utf8");
const en = JSON.parse(readFileSync("i18n/locales/en.json", "utf8"));
const th = JSON.parse(readFileSync("i18n/locales/th.json", "utf8"));

describe("Phase 3.2C mixed checkout UI source safeguards", () => {
  it("keeps mixed checkout UI hidden behind a default-off public feature flag", () => {
    expect(nuxtConfig).toContain("public");
    expect(nuxtConfig).toContain("mixedCheckoutEnabled");
    expect(nuxtConfig).toContain("NUXT_PUBLIC_MIXED_CHECKOUT_ENABLED");
    expect(cartVue).toContain(
      "runtimeConfig.public.mixedCheckoutEnabled === true",
    );
    expect(cartVue).toContain('v-if="canUseUnifiedCheckout"');
  });

  it("keeps existing separate sale and rental payment actions available when flag is off", () => {
    expect(cartVue).toContain("hasSingleRentalBooking &&");
    expect(cartVue).toContain("!canUseUnifiedCheckout &&");
    expect(cartVue).toContain("!hasActiveBookingCheckout");
    expect(cartVue).toContain(
      "hasPurchaseItems && !isB2BUser && !canUseMixedCheckout",
    );
    expect(cartVue).toContain("hasMultipleRentalBookings &&");
    expect(cartVue).toContain("canEditBookingDraft(booking)");
    expect(cartVue).toContain("handleSubmitSingleRental");
    expect(cartVue).toContain("handlePay");
  });

  it("shows mixed checkout payment method copy when feature flag is true", () => {
    expect(en.cart.mixedCheckoutPayNow).toBe("Pay");
    expect(th.cart.mixedCheckoutPayNow).toBe("ชำระเงิน");
    expect(en.cart.mixedCheckoutDesc).toContain("Credit / Debit Card");
    expect(th.cart.mixedCheckoutDesc).toContain("พร้อมเพย์");
    expect(cartVue).toContain('value="credit_card"');
    expect(cartVue).toContain('value="promptpay"');
    expect(cartVue).toContain("selectedMixedCheckoutMethod");
    expect(cartVue).not.toContain("mixedCheckoutCardDetailsTitle");
    expect(cartVue).not.toContain("createCardToken");
    expect(statusVue).toContain("mixedCheckout.cardPayment");
    expect(statusVue).toContain("createCardToken");
  });

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

  it("enables booking-only carts as unified checkout without changing sale-only routing", () => {
    expect(cartVue).toContain("const hasBookingOnlyCart = computed");
    expect(cartVue).toContain("const canUseBookingOnlyUnifiedCheckout");
    expect(cartVue).toContain("const canUseUnifiedCheckout");
    expect(cartVue).toContain("const showPaymentMethodSelector = computed");
    expect(cartVue).toContain(
      "canUseMixedCheckout.value || canUseBookingOnlyUnifiedCheckout.value",
    );
    expect(cartVue).toContain(
      "(hasPurchaseItems.value || canUseBookingOnlyUnifiedCheckout.value) &&",
    );
    expect(cartVue).toContain('v-if="showPaymentMethodSelector"');
    expect(cartVue).toContain("bookingOnlyUnifiedCheckoutTitle");
    expect(cartVue).toContain("bookingOnlyUnifiedCheckoutDesc");
    expect(en.cart.bookingOnlyUnifiedCheckoutDesc).toContain(
      "all Booking Deposits",
    );
    expect(th.cart.bookingOnlyUnifiedCheckoutDesc).toContain("พร้อมเพย์");
    expect(cartVue).toContain("async function handleUnifiedCheckoutPay()");
    expect(cartVue).toContain(
      "if (hasPurchaseItems.value && !selectedAddress.value)",
    );
  });

  it("shows allocation breakdown for sale, shipping, and Booking Deposit", () => {
    expect(cartVue).toContain("cart.mixedCheckoutAllocationBreakdown");
    expect(cartVue).toContain("cart.mixedCheckoutSaleProducts");
    expect(cartVue).toContain("cart.mixedCheckoutShipping");
    expect(cartVue).toContain("cart.mixedCheckoutBookingDepositLine");
    expect(cartVue).toContain("mixedCheckoutTotalPreview");
  });

  it("maps and highlights sale item prevalidation errors", () => {
    expect(cartVue).toContain("function getSaleItemMixedCheckoutError");
    expect(cartVue).toContain('error.itemType === "sale_item"');
    expect(cartVue).toContain("getSaleItemMixedCheckoutError(item)");
    expect(cartVue).toContain("'border-error bg-error/5'");
  });

  it("maps and highlights rental booking prevalidation errors", () => {
    expect(cartVue).toContain("function getRentalBookingMixedCheckoutError");
    expect(cartVue).toContain('error.itemType === "rental_booking"');
    expect(cartVue).toContain("getRentalBookingMixedCheckoutError(booking)");
    expect(cartVue).toContain("cart.mixedCheckoutSuggestedActions");
  });

  it("creates mixed checkout sessions from cart without card tokenization", () => {
    expect(cartVue).toContain("/api/mixed-checkout/prevalidate");
    expect(cartVue).toContain("/api/mixed-checkout/create");
    expect(cartVue).toContain("ignoreResponseError: true");
    expect(cartVue).toContain("buildMixedCheckoutPayload(idempotencyKey)");
    expect(cartVue).not.toContain("createMixedCheckoutCardToken");
    expect(cartVue).not.toContain("cardToken");
    expect(cartVue).not.toContain("window.location.href");
    expect(cartVue).toContain(
      "setMixedCheckoutValidationErrors(createResponse)",
    );
    expect(cartVue).toContain("if (!createResponse.ok)");
    expect(statusVue).toContain(
      "/api/mixed-checkout/${encodeURIComponent(sessionId.value)}/initiate",
    );
    expect(statusVue).toContain("body: { cardToken }");
    expect(createApi).not.toContain("createOmiseCardCharge");
    expect(createApi).not.toContain("cardToken is required");
    expect(initiateApi).toContain("createOmiseCardCharge");
    expect(initiateApi).toContain("cardToken is required");
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

  it("successful create navigates to mixed checkout status page", () => {
    expect(cartVue).toContain(
      "/mixed-checkout/${encodeURIComponent(createResponse.session.id)}",
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

  it("shows cancel checkout CTA and confirmation modal for active unified sessions", () => {
    expect(cartVue).toContain("cart.cancelActiveCheckout");
    expect(cartVue).toContain("openCancelCartCheckout");
    expect(cartVue).toContain("openCancelBookingCheckout(booking)");
    expect(cartVue).toContain("cancelCheckoutModalOpen");
    expect(cartVue).toContain("cart.cancelCheckoutPromptPayCaution");
    expect(cartVue).toContain("confirmCancelCheckout");
    expect(cartVue).toContain("/cancel");
    expect(th.cart.cancelCheckoutModalTitle).toBe("ยกเลิกการชำระเงินนี้?");
    expect(th.cart.cancelCheckoutModalBody).toContain(
      "ขั้นตอนการชำระเงินที่ยังดำเนินอยู่",
    );
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
