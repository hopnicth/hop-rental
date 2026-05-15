import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const cartVue = readFileSync("app/pages/user/cart.vue", "utf8");
const useCartTs = readFileSync("app/composables/useCart.ts", "utf8");
const useBookingTs = readFileSync("app/composables/useBooking.ts", "utf8");
const useOrdersTs = readFileSync("app/composables/useOrders.ts", "utf8");
const useAddressesTs = readFileSync("app/composables/useAddresses.ts", "utf8");
const bookingTypesTs = readFileSync("app/types/booking.ts", "utf8");
const cartTypesTs = readFileSync("app/types/cart.ts", "utf8");
const paymentVue = readFileSync(
  "app/pages/rental-booking-payment/[bookingId].vue",
  "utf8",
);
const en = JSON.parse(readFileSync("i18n/locales/en.json", "utf8"));
const th = JSON.parse(readFileSync("i18n/locales/th.json", "utf8"));

describe("Phase 3.1B cart UX source safeguards", () => {
  it("does not use old rental-not-charged-online wording", () => {
    expect(en.cart.payAtBranchDesc).not.toMatch(/not charge online/i);
    expect(en.cart.payAtBranchDesc).not.toMatch(/paid at the branch/i);
    expect(th.cart.payAtBranchDesc).not.toContain("ระบบจะไม่หักเงินออนไลน์");

    expect(en.cart.payAtBranchDesc).toContain(
      "Booking Deposit is paid online now.",
    );
    expect(en.cart.payAtBranchDesc).toContain(
      "Rental fee and remaining refundable security deposit are paid at pickup.",
    );
    expect(th.cart.payAtBranchDesc).toContain("ชำระเงินมัดจำจองออนไลน์ตอนนี้");
    expect(th.cart.payAtBranchDesc).toContain(
      "ค่าเช่าและเงินมัดจำประกันคงเหลือชำระในวันรับสินค้า",
    );
  });

  it("shows mixed-cart separate payment explanation", () => {
    expect(en.cart.mixedPaymentDesc).toContain(
      "Product order payment and rental Booking Deposit payment are processed separately",
    );
    expect(th.cart.mixedPaymentDesc).toContain(
      "รายการสินค้าและรายการเช่าจะชำระแยกกัน",
    );
    expect(cartVue).toContain('v-if="hasMixedCart"');
    expect(cartVue).toContain("cart.mixedPaymentDesc");
  });

  it("shows per-booking payment actions for multiple rental bookings", () => {
    expect(cartVue).toContain("hasMultipleRentalBookings &&");
    expect(cartVue).toContain("!canUseUnifiedCheckout &&");
    expect(cartVue).toContain("canEditBookingDraft(booking)");
    expect(cartVue).toContain("cart.payBookingDepositForBooking");
  });

  it("shows simplified customer rental payment summary whenever rental bookings exist", () => {
    expect(cartVue).toContain('v-if="hasRentalBookings"');
    expect(cartVue).toContain("cart.rentalPaymentSummaryPreviewTitle");
    expect(cartVue).toContain("cart.rentalSummaryPayNowTitle");
    expect(cartVue).toContain("cart.rentalSummaryPayAtPickupTitle");
    expect(cartVue).toContain("cart.rentalSummarySecurityDepositTitle");
    expect(cartVue).toContain("cart.rentalSummaryBookingDeposit");
    expect(cartVue).toContain("cart.rentalSummaryRentalFeeAtPickup");
    expect(cartVue).toContain(
      "cart.rentalSummaryRemainingSecurityDepositAtPickup",
    );
    expect(cartVue).toContain("cart.rentalSummaryTotalDueAtPickup");
    expect(cartVue).toContain("cart.rentalSummaryFullSecurityDeposit");
    expect(cartVue).toContain("cart.rentalSummaryLessBookingDeposit");
    expect(cartVue).toContain("cart.bookingDepositSecurityDepositNote");
    expect(cartVue).toContain("rentalPaymentSummary.bookingDepositDueNow");
    expect(cartVue).toContain("rentalPaymentSummary.securityDepositRequired");
    expect(cartVue).toContain(
      "rentalPaymentSummary.remainingSecurityDepositDueAtPickup",
    );
    expect(cartVue).toContain("rentalPaymentSummary.rentalFeeDue");
    expect(cartVue).toContain("rentalPaymentSummary.netPayableAtPickup");
    expect(en.cart.rentalPaymentSummaryPreviewTitle).toBe(
      "Rental payment summary",
    );
    expect(th.cart.rentalPaymentSummaryPreviewTitle).toBe(
      "สรุปการชำระเงินรายการเช่า",
    );
    expect(en.cart.bookingDepositSecurityDepositNote).toContain(
      "part of the refundable security deposit",
    );
    expect(th.cart.bookingDepositSecurityDepositNote).toContain(
      "ส่วนหนึ่งของเงินมัดจำประกันที่คืนได้",
    );
  });

  it("removes WHT and tax-category rows from the customer cart rental summary", () => {
    expect(cartVue).not.toContain("cart.paymentLineTax");
    expect(cartVue).not.toContain("cart.paymentLineWht");
    expect(cartVue).not.toContain("cart.paymentLineNet");
    expect(cartVue).not.toContain("cart.grossTotal");
    expect(cartVue).not.toContain("cart.totalWht");
    expect(cartVue).not.toContain("cart.netPayableAtBranch");
    expect(cartVue).not.toContain("whtRateLabel");
    expect(cartVue).not.toContain("paymentTaxCategoryLabel");
    expect(cartVue).not.toContain("paymentLineLabel");
    expect(en.cart.bookingDepositSecurityDepositNote).not.toContain("WHT");
    expect(th.cart.bookingDepositSecurityDepositNote).not.toContain("WHT");
  });

  it("shows booking deposit agreement in checkout whenever rental bookings exist", () => {
    expect(cartVue).toContain("cart.bookingDepositAgreementTitle");
    expect(cartVue).toContain("cart.bookingDepositAgreementCheckbox");
    expect(cartVue).toContain("bookingDepositAgreementAccepted");
  });

  it("keeps sale-only checkout summary gated by purchase items", () => {
    expect(cartVue).toContain(
      "<!-- Order summary — sale items only (rental Booking Deposit is separate) -->",
    );
    expect(cartVue).toContain(
      '<div v-if="hasPurchaseItems" class="space-y-4">',
    );
    expect(cartVue).toContain("cart.orderSummary");
  });

  it("guards sale checkout until the cart is hydrated for the current user", () => {
    expect(cartVue).toContain("isReadyForCheckout: isCartReadyForCheckout");
    expect(cartVue).toContain(
      "isDbSyncPendingForCurrentUser: isCartDbSyncPendingForCurrentUser",
    );
    expect(cartVue).toContain("const isSaleCheckoutStateReady = computed");
    expect(cartVue).toContain("isCartReadyForCheckout.value");
    expect(cartVue).toContain("!isSaleCheckoutStateReady");
    expect(cartVue).toContain("cart.checkoutStateLoadingTitle");
    expect(cartVue).toContain("cart.checkoutStateLoadingDesc");
  });

  it("waits for pending cart DB sync before checkout validation", () => {
    expect(useCartTs).toContain("const cartDbSyncQueues = new Map");
    expect(useCartTs).toContain("cartDbSyncPendingUserIds");
    expect(useCartTs).toContain("setCartDbSyncPending(userId, true)");
    expect(useCartTs).toContain("async function waitForCartDbSync");
    expect(useCartTs).toContain("await waitForCartDbSync(userId)");
    expect(useCartTs).toContain("isReadyForCheckout: computed");
  });

  it("uses the resolved authenticated cart identity for checkout readiness", () => {
    expect(useCartTs).toContain("const resolvedAuthUserId");
    expect(useCartTs).toContain("function getAuthenticatedCartUserId");
    expect(useCartTs).toContain(
      "return user.value?.id ?? resolvedAuthUserId.value",
    );
    expect(useCartTs).toContain(
      "async function resolveAuthenticatedCartUserId",
    );
    expect(useCartTs).toContain("await supabase.auth.getSession()");
    expect(useCartTs).toContain("await supabase.auth.getUser()");
    expect(useCartTs).toContain("const userId = getAuthenticatedCartUserId()");
  });

  it("keeps genuinely logged-out or mismatched cart identities blocked", () => {
    expect(useCartTs).toContain("Boolean(userId)");
    expect(useCartTs).toContain("currentUserId.value === userId");
    expect(useCartTs).toContain("lastHydratedUserId.value === userId");
    expect(useCartTs).toContain(
      "if (!userId || currentUserId.value !== userId) return false",
    );
  });

  it("does not keep temporary checkout readiness debug logging", () => {
    expect(cartVue).not.toContain("[Cart Checkout Readiness Debug]");
  });

  it("does not show the no-payable-items message for a visible stale sale cart", () => {
    expect(cartVue).toContain(
      "const hadVisiblePurchaseItems = hasPurchaseItems.value",
    );
    expect(cartVue).toContain("cart.cartChangedTitle");
    expect(cartVue).toContain("cart.cartChangedDesc");
    expect(en.cart.cartChangedDesc).toContain(
      "no longer matches what was shown",
    );
    expect(th.cart.cartChangedDesc).toContain("ข้อมูลไม่ตรงกับที่แสดงก่อนหน้า");
  });

  it("keeps sale-only checkout on the existing order payment flow", () => {
    expect(useOrdersTs).toContain('"/api/orders"');
    expect(cartVue).toContain(
      "await navigateTo(`/payment/${encodeURIComponent(newOrderId)}`)",
    );
    expect(cartVue).toContain("async function handlePay()");
    expect(cartVue).toContain('await submitCurrentOrder("payment")');
  });

  it("enables booking-only unified checkout without routing sale-only through mixed checkout", () => {
    expect(cartVue).toContain("const hasBookingOnlyCart = computed");
    expect(cartVue).toContain("const canUseBookingOnlyUnifiedCheckout");
    expect(cartVue).toContain("const canUseUnifiedCheckout");
    expect(cartVue).toContain("const showPaymentMethodSelector = computed");
    expect(cartVue).toContain(
      "canUseMixedCheckout.value || canUseBookingOnlyUnifiedCheckout.value",
    );
    expect(cartVue).toContain(
      "mixedCheckoutEnabled.value && hasBookingOnlyCart.value && !isB2BUser.value",
    );
    expect(cartVue).toContain(
      "(hasPurchaseItems.value || canUseBookingOnlyUnifiedCheckout.value) &&",
    );
    expect(cartVue).toContain('v-if="showPaymentMethodSelector"');
  });

  it("uses one booking-only CTA and hides standalone rental CTAs when unified checkout is active", () => {
    expect(en.cart.payAllBookingDeposits).toBe("Pay All Booking Deposits");
    expect(th.cart.payAllBookingDeposits).toBe("ชำระเงินมัดจำจองทั้งหมด");
    expect(cartVue).toContain("const unifiedCheckoutPayButtonLabel");
    expect(cartVue).toContain('t("cart.payAllBookingDeposits")');
    expect(cartVue).toContain('v-if="canUseUnifiedCheckout"');
    expect(cartVue).toContain(':label="unifiedCheckoutPayButtonLabel"');
    expect(cartVue).toContain("hasSingleRentalBooking &&");
    expect(cartVue).toContain("!hasActiveBookingCheckout");
  });

  it("booking-only unified checkout calls mixed checkout flow, not standalone PromptPay-only flow", () => {
    expect(cartVue).toContain("async function handleUnifiedCheckoutPay()");
    expect(cartVue).toContain("if (!canUseUnifiedCheckout.value) return");
    expect(cartVue).toContain("/api/mixed-checkout/prevalidate");
    expect(cartVue).toContain("/api/mixed-checkout/create");
    expect(cartVue).toContain(
      "/mixed-checkout/${encodeURIComponent(createResponse.session.id)}",
    );
    expect(cartVue).toContain("saleItems: cartItems.value.map");
    expect(cartVue).toContain("rentalBookings: activeBookings.value.map");
    expect(cartVue).toContain(
      "if (hasPurchaseItems.value && !selectedAddress.value)",
    );
    expect(cartVue).toContain("method: selectedMixedCheckoutMethod()");
  });

  it("keeps mixed checkout summary gated by mixed checkout availability", () => {
    expect(cartVue).toContain('v-if="canUseUnifiedCheckout"');
    expect(cartVue).toContain("cart.mixedCheckoutAllocationBreakdown");
    expect(cartVue).toContain("cart.mixedCheckoutTotalPayableNow");
  });

  it("targets each per-booking payment action to the correct booking id", () => {
    expect(cartVue).toContain(
      '@click="() => void handleSubmitRental(booking.bookingId)"',
    );
    expect(cartVue).toContain("booking-deposit-payment/create");
  });

  it("removes draft rental bookings through the server-coordinated delete endpoint", () => {
    expect(useBookingTs).toContain(
      "/api/rental-bookings/${encodeURIComponent(bookingId)}/draft",
    );
    expect(useBookingTs).toContain('{ method: "DELETE" }');
    expect(useBookingTs).not.toContain(
      '.from("rental_bookings")\n          .delete()',
    );
  });

  it("enriches draft rental bookings with checkout state for cart awareness", () => {
    expect(bookingTypesTs).toContain("export interface BookingCheckoutState");
    expect(bookingTypesTs).toContain('"active_unpaid"');
    expect(bookingTypesTs).toContain('"paid_or_finalized"');
    expect(useBookingTs).toContain("DraftCheckoutStateResponse");
    expect(useBookingTs).toContain(
      '"/api/rental-bookings/draft-checkout-state"',
    );
    expect(useBookingTs).toContain("body: { bookingIds: draftIds }");
    expect(useBookingTs).toContain("item.checkout =");
  });

  it("refreshes booking checkout state when returning to cart from payment pages", () => {
    expect(cartVue).toContain("function refreshCartBookingCheckoutState");
    expect(cartVue).toContain("await refreshCartFromDb()");
    expect(cartVue).toContain("await refreshBookings()");
    expect(cartVue).toContain('route.path !== "/user/cart"');
    expect(cartVue).toContain('window.addEventListener("pageshow"');
    expect(cartVue).toContain('window.addEventListener("focus"');
    expect(cartVue).toContain('document.addEventListener("visibilitychange"');
    expect(cartVue).toContain('document.visibilityState === "visible"');
    expect(cartVue).toContain("onActivated(() =>");
    expect(cartVue).toContain("lastBookingCheckoutStateRefreshAt");
    expect(cartVue).toContain("bookingCheckoutStateRefreshInFlight");
    expect(cartVue).toContain('"rental_payment_success"');
  });

  it("refreshes sale cart DB state on cart re-entry after completed checkout", () => {
    expect(useCartTs).toContain("async function refreshCartFromDb");
    expect(useCartTs).toContain("await waitForCartDbSync(userId)");
    expect(useCartTs).toContain("dbData = await fetchCartFromDb(userId)");
    expect(useCartTs).toContain("cart.value.items = dbData.items");
    expect(useCartTs).toContain("saveCartLocal(userId, cart.value)");
    expect(useCartTs).toContain("refreshCartFromDb,");
    expect(cartVue).toContain("refreshCartFromDb,");
    expect(cartVue).toContain("await refreshCartFromDb()");
  });

  it("fetches cart-level checkout state for mixed cart pending awareness", () => {
    expect(cartTypesTs).toContain("export interface CartCheckoutState");
    expect(useCartTs).toContain('"/api/cart/checkout-state"');
    expect(useCartTs).toContain("saleCartLineIds");
    expect(useCartTs).toContain("bookingIds");
    expect(useCartTs).toContain("refreshCheckoutState");
    expect(cartVue).toContain("refreshCartCheckoutState({");
    expect(cartVue).toContain("activeBookings.value.map");
  });

  it("shows mixed cart active/expired global checkout banners", () => {
    expect(th.cart.mixedCheckoutPendingGlobalTitle).toBe(
      "มีรายการชำระเงินที่กำลังดำเนินอยู่",
    );
    expect(th.cart.mixedCheckoutExpiredGlobalTitle).toBe(
      "รายการชำระเงินก่อนหน้าหมดอายุแล้ว",
    );
    expect(cartVue).toContain("hasActiveCartCheckout");
    expect(cartVue).toContain("hasExpiredCartCheckout");
    expect(cartVue).toContain("mixedCheckoutPendingGlobalTitle");
    expect(cartVue).toContain("mixedCheckoutExpiredGlobalTitle");
    expect(cartVue).toContain("function handleResumeCartCheckout");
    expect(cartVue).toContain(
      "/mixed-checkout/${encodeURIComponent(sessionId)}",
    );
  });

  it("locks sale lines that are included in an active mixed checkout", () => {
    expect(th.cart.saleItemPendingCheckoutLabel).toBe(
      "รวมอยู่ในรายการชำระเงินที่รอดำเนินการ",
    );
    expect(cartVue).toContain("function isSaleItemLockedByCheckout");
    expect(cartVue).toContain("cartCheckoutState.value.saleItemCartLineIds");
    expect(cartVue).toContain("saleItemPendingCheckoutLabel");
    expect(cartVue).toContain(
      "item.quantity <= 1 || isSaleItemLockedByCheckout(item)",
    );
    expect(cartVue).toContain(
      "isAtStockLimit(item) || isSaleItemLockedByCheckout(item)",
    );
    expect(cartVue).toContain(':disabled="isSaleItemLockedByCheckout(item)"');
  });

  it("locks mixed checkout configuration and duplicate checkout while active", () => {
    expect(cartVue).toContain("const isCartConfigurationLockedByCheckout");
    expect(cartVue).toContain(
      ':disabled="isCartConfigurationLockedByCheckout"',
    );
    expect(cartVue).toContain("hasActiveCartCheckout ||");
    expect(cartVue).toContain(
      "hasActiveBookingCheckout || hasActiveCartCheckout",
    );
  });

  it("shows active and expired checkout states in the rental cart card", () => {
    expect(th.cart.bookingCheckoutPendingBadge).toBe("รอชำระเงิน");
    expect(th.cart.resumeBookingCheckout).toBe("กลับไปหน้าชำระเงิน");
    expect(th.cart.bookingCheckoutExpiredBadge).toBe("การชำระเงินหมดอายุ");
    expect(cartVue).toContain("const activeCheckoutBookings = computed");
    expect(cartVue).toContain('booking.checkout?.state === "active_unpaid"');
    expect(cartVue).toContain("function handleResumeBookingCheckout");
    expect(cartVue).toContain("bookingCheckoutPendingBadge");
    expect(cartVue).toContain("resumeBookingCheckout");
    expect(cartVue).toContain("bookingCheckoutExpiredBadge");
    expect(cartVue).toContain('v-if="canEditBookingDraft(booking)"');
    expect(cartVue).toContain(':disabled="!canEditBookingDraft(booking)"');
    expect(cartVue).toContain("hasActiveBookingCheckout ||");
    expect(cartVue).toContain("bookingCheckoutAggregateBlockedDesc");
  });

  it("refreshes booking store after successful rental payment", () => {
    expect(paymentVue).toContain("const { refreshBookings } = useBooking()");
    expect(paymentVue).toContain("await refreshBookings()");
    expect(cartVue).toContain("route.query.rentalPayment");
    expect(cartVue).toContain(
      'void refreshCartBookingCheckoutState("rental_payment_success"',
    );
  });

  it("keeps personal addresses visible when company-scoped addresses are unavailable", () => {
    expect(cartVue).toContain("const availableAddresses = computed(() => {");
    expect(cartVue).toContain(
      "if (!currentCompanyId) return personalAddresses.value",
    );
    expect(cartVue).toContain(
      "const companyScopedAddresses = companyAddresses.value.filter",
    );
    expect(cartVue).toContain(": personalAddresses.value");
  });

  it("does not leave the address book stuck in a loading state", () => {
    expect(cartVue).toContain("const isAddressBookLoading = computed");
    expect(cartVue).toContain('v-if="isAddressBookLoading"');
    expect(useAddressesTs).toContain("lastHydratedAddressUserId");
    expect(useAddressesTs).toContain("loading.value = false");
    expect(useAddressesTs).toContain(
      "lastHydratedAddressUserId.value = userId",
    );
  });

  it("refreshes addresses and resets stale selected address ids", () => {
    expect(cartVue).toContain("await fetchAddresses()");
    expect(cartVue).toContain("ensureValidSelectedAddress()");
    expect(cartVue).toContain("!availableAddresses.value.some");
    expect(cartVue).toContain("selectedAddressId.value = null");
    expect(cartVue).toContain("void refreshCheckoutAddresses()");
  });
});
