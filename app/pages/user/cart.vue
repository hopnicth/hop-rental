<script setup lang="ts">
/**
 * Cart Page — 4 vertical sections.
 *
 * Section 1: Booking Items (rental equipment) — hub selector + deposit display
 * Section 2: Cart Items (consumables) — quantity +/- controls
 * Section 3: Address Picker — select / add delivery address
 * Section 4: Checkout & Payment — totals + payment methods
 */
import type { CartItem } from "~/types/cart";
import type { BookingItem } from "~/types/booking";
import type { LocaleCode } from "~/types/locale";
import type { Address } from "~/types/user";
import type { PublicBranch } from "~/composables/useBranches";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import type { RentalPricingLine } from "~/utils/rental-pricing";
import { calculateShipping } from "~/utils/shipping";

const { t, locale } = useI18n();
const route = useRoute();
const lang = computed(() => locale.value as LocaleCode);
const toast = useToast();
const { getSaleStockBySku, getProductById } = useProducts();

// ── Auth guard ──
const { isLoggedIn } = useAuthSession();
watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`);
  }
});

// ── Cart & Booking state ──
const {
  cartItems,
  cartSubtotal,
  cartItemCount,
  cartId,
  updateQuantity,
  removeFromCart,
  clearCartPersisted,
  validateCart,
} = useCart();

const {
  activeBookings,
  confirmedBookings,
  activeBookingTotalDeposit,
  activeBookingTotalRental,
  updateBookingStatus,
  updateHub,
  removeBooking,
} = useBooking();

// ── Address state ──
const {
  personalAddresses,
  companyAddresses,
  loading: addressLoading,
  fetchAddresses,
  updateAddress,
} = useAddresses();

const {
  activeContext,
  memberships,
  isB2B,
  isB2BUser,
  isB2BAdmin,
  currentCompany,
  creditRemaining,
  fetchMemberships,
  syncContextWithMemberships,
} = useCompanyContext();
const { submitOrder } = useOrders();

// ── Selected address ──
const selectedAddressId = ref<string | null>(null);

async function refreshCheckoutAddresses() {
  if (!isLoggedIn.value) {
    selectedAddressId.value = null;
    return;
  }

  await fetchMemberships();
  syncContextWithMemberships();

  await fetchAddresses();
}

// Fetch memberships + addresses on mount/login
if (import.meta.client) {
  onMounted(() => {
    void refreshCheckoutAddresses();
  });

  watch(
    () => isLoggedIn.value,
    (loggedIn) => {
      if (!loggedIn) {
        selectedAddressId.value = null;
        return;
      }

      void refreshCheckoutAddresses();
    },
    { immediate: true },
  );

  watch(
    () => currentCompany.value?.id ?? null,
    () => {
      if (!isLoggedIn.value) return;
      selectedAddressId.value = null;
      void fetchAddresses();
    },
  );
}

const availableAddresses = computed(() => {
  if (!isB2B.value) return personalAddresses.value;

  const currentCompanyId = currentCompany.value?.id;
  if (!currentCompanyId) return [];

  return companyAddresses.value.filter(
    (address) => address.companyId === currentCompanyId,
  );
});

// ── Hub options (for booking item hub selectors) ──
const { branches: publicBranches, ensureBranchesLoaded } = useBranches();
if (import.meta.client) {
  void ensureBranchesLoaded();
}
const activeBranches = computed(() =>
  publicBranches.value.filter((b) => b.isActive),
);
function branchLabel(
  branch: { nameTh: string; nameEn: string },
  localeCode: LocaleCode,
): string {
  if (localeCode === "th") return branch.nameTh || branch.nameEn;
  return branch.nameEn || branch.nameTh;
}
const hubOptions = computed(() =>
  activeBranches.value.map((b) => ({
    label: branchLabel(b, lang.value),
    value: b.id,
  })),
);

// ── Pickup-at-branch option ──
// Eligible bookings include cart drafts AND already-confirmed bookings the
// customer has not yet collected, so the cart can be picked up at the same
// branch on the same trip.
const PICKUP_ADDRESS_SENTINEL = "__pickup__";
const pickupBranchId = ref<string | null>(null);

const pickupCandidateBookings = computed<BookingItem[]>(() => [
  ...activeBookings.value,
  ...confirmedBookings.value,
]);

const hasPickupCandidateBookings = computed(
  () => pickupCandidateBookings.value.length > 0,
);

// Branches the user is allowed to pick up at — locked to the hubs of their
// existing bookings (each booking is already tied to a specific branch, so a
// free choice would be misleading).
const pickupCandidateHubIds = computed(() => {
  const ids = new Set<string>();
  for (const b of pickupCandidateBookings.value) {
    if (b.hubId) ids.add(b.hubId);
  }
  return ids;
});

const pickupBranchOptions = computed(() =>
  activeBranches.value
    .filter((b) => pickupCandidateHubIds.value.has(b.id))
    .map((b) => ({
      label: branchLabel(b, lang.value),
      value: b.id,
    })),
);

// Sync default + clear stale selection when bookings change.
watchEffect(() => {
  if (
    pickupBranchId.value &&
    !pickupCandidateHubIds.value.has(pickupBranchId.value)
  ) {
    pickupBranchId.value = null;
  }
  if (pickupBranchId.value) return;
  const firstHubId =
    pickupCandidateBookings.value.find((b) => b.hubId)?.hubId ?? null;
  if (firstHubId) pickupBranchId.value = firstHubId;
});

const selectedPickupBranch = computed(
  () => activeBranches.value.find((b) => b.id === pickupBranchId.value) ?? null,
);

const isPickupSelected = computed(
  () => selectedAddressId.value === PICKUP_ADDRESS_SENTINEL,
);

// Bookings that will share the pickup trip at the currently chosen branch.
const pickupBookingsAtSelectedBranch = computed<BookingItem[]>(() => {
  if (!pickupBranchId.value) return [];
  return pickupCandidateBookings.value.filter(
    (b) => b.hubId === pickupBranchId.value,
  );
});

// Auto-select default address (or pickup if previously chosen).
watchEffect(() => {
  if (selectedAddressId.value) return;
  if (availableAddresses.value.length > 0) {
    const defaultAddr = availableAddresses.value.find((a) => a.isDefault);
    selectedAddressId.value =
      defaultAddr?.id ?? availableAddresses.value[0]!.id;
  }
});

// ── Payment method ──
type PaymentMethod = "credit_card" | "promptpay" | "company_credit";
const paymentMethod = ref<PaymentMethod>("credit_card");

// ── B2B Quotation ──
// Build a synthetic Address when the user opts to pick up at a branch,
// so the existing order-submit flow can persist the branch as the address
// snapshot without writing a real addresses row.
function buildPickupAddress(branch: PublicBranch): Address {
  const fullAddress =
    lang.value === "th"
      ? branch.addressTh || branch.addressEn
      : branch.addressEn || branch.addressTh;
  return {
    id: "",
    userId: null,
    companyId: null,
    title: `${t("cart.pickupAtBranchTitle")} — ${branchLabel(branch, lang.value)}`,
    contactName: null,
    contactPhone: branch.phone || null,
    isDefault: false,
    fullAddress: fullAddress || branchLabel(branch, lang.value),
    subDistrict: null,
    district: null,
    province: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    note: null,
    createdAt: "",
    updatedAt: "",
  };
}

const selectedAddress = computed<Address | null>(() => {
  if (isPickupSelected.value) {
    return selectedPickupBranch.value
      ? buildPickupAddress(selectedPickupBranch.value)
      : null;
  }
  return (
    availableAddresses.value.find(
      (addr) => addr.id === selectedAddressId.value,
    ) ?? null
  );
});

const canManageAvailableAddresses = computed(
  () => !isB2B.value || isB2BAdmin.value,
);

// Shipping is computed via greedy bin-pack of the cart's free-units; pickup
// at branch waives the fee entirely.
const shippingResult = computed(() => {
  if (isPickupSelected.value) {
    return calculateShipping([]);
  }
  return calculateShipping(
    cartItems.value.map((item) => ({
      shippingSize: getProductById(item.productId).value?.shippingSize,
      quantity: item.quantity,
    })),
  );
});

const shippingCost = computed(() => shippingResult.value.cost);
const shippingBreakdown = computed(() => shippingResult.value.breakdown);
const hasShippingBoxes = computed(
  () =>
    shippingBreakdown.value.xl > 0 ||
    shippingBreakdown.value.l > 0 ||
    shippingBreakdown.value.m > 0 ||
    shippingBreakdown.value.s > 0,
);

// Online checkout total — sale items + shipping. Rental fees & deposits are
// paid at the branch and never charged online.
const orderGrandTotal = computed(() => cartSubtotal.value + shippingCost.value);

// Omise enforces a 20.00 THB minimum per charge. Block the online payment flow
// (credit card / PromptPay) when the order total falls below this threshold.
const MIN_ONLINE_PAYMENT_THB = 20;
const isBelowOnlineMin = computed(
  () =>
    hasPurchaseItems.value && orderGrandTotal.value < MIN_ONLINE_PAYMENT_THB,
);

const hasRentalBookings = computed(() => activeBookings.value.length > 0);
const hasPurchaseItems = computed(() => cartItems.value.length > 0);
const bookingsMissingHub = computed(() =>
  activeBookings.value.filter((booking) => !booking.hubId),
);

const hasItems = computed(
  () => hasRentalBookings.value || hasPurchaseItems.value,
);

function getBookingTitle(booking: BookingItem): string {
  return booking.assetName || booking.productName;
}

function getBookingThumbnail(booking: BookingItem): string {
  return booking.assetThumbnail || booking.thumbnail;
}

function getBookingAccessPath(booking: BookingItem): string | null {
  return booking.assetSlug ? `/asset/${booking.assetSlug}` : null;
}

function showBookingActionError() {
  toast.add({
    title: t("cart.validationFailed"),
    description: t("cart.validationFailedDesc"),
    icon: "bx:error",
    color: "error",
  });
}

function getItemStockLimit(item: CartItem): number | null {
  return getSaleStockBySku(item.productId, item.skuId);
}

function isAtStockLimit(item: CartItem): boolean {
  const stockLimit = getItemStockLimit(item);
  return stockLimit !== null && item.quantity >= stockLimit;
}

function showCartStockLimitError() {
  toast.add({
    title: t("cart.stockLimitTitle"),
    description: t("cart.stockLimitDesc"),
    icon: "bx:error-circle",
    color: "warning",
  });
}

function handleIncreaseQuantity(item: CartItem) {
  const ok = updateQuantity(item.productId, item.skuId, item.quantity + 1);
  if (!ok) {
    showCartStockLimitError();
  }
}

// ── Hub change handler ──
async function handleHubChange(bookingId: string, hubId: string) {
  const branch = activeBranches.value.find((b) => b.id === hubId);
  if (branch) {
    const ok = await updateHub(
      bookingId,
      hubId,
      branchLabel(branch, lang.value),
    );
    if (!ok) {
      showBookingActionError();
    }
  }
}

function unitLabel(line: RentalPricingLine): string {
  if (line.unit === "month") {
    return t("booking.unitMonths", { n: line.count });
  }
  if (line.unit === "week") {
    return t("booking.unitWeeks", { n: line.count });
  }
  return t("booking.unitDays", { n: line.count });
}

async function handleRemoveBooking(bookingId: string) {
  const ok = await removeBooking(bookingId);
  if (!ok) {
    showBookingActionError();
  }
}

// ── Set default address ──
async function handleSetDefault(id: string) {
  if (!canManageAvailableAddresses.value) {
    toast.add({
      title: "Company address access is read-only",
      description:
        "Only Organization Admin can change the default company address.",
      icon: "bx:error-circle",
      color: "error",
    });
    return;
  }

  await updateAddress(id, { isDefault: true });
}

// ── Proceed to payment (placeholder) ──
const isSubmittingOrder = ref(false);
const isSubmittingRental = ref(false);

function showInlineOrderError(title: string, description: string) {
  toast.add({
    title,
    description,
    icon: "bx:error-circle",
    color: "error",
  });
}

async function submitCurrentOrder(checkoutMode: "payment" | "quotation") {
  if (!hasPurchaseItems.value) {
    showInlineOrderError(t("cart.noSaleItemsTitle"), t("cart.noSaleItemsDesc"));
    return;
  }

  if (!selectedAddress.value) {
    if (isPickupSelected.value) {
      showInlineOrderError(
        t("cart.pickupBranchRequiredTitle"),
        t("cart.pickupBranchRequiredDesc"),
      );
    } else {
      showInlineOrderError(
        t("cart.deliveryAddressRequiredTitle"),
        t("cart.deliveryAddressRequiredDesc"),
      );
    }
    return;
  }

  if (
    checkoutMode === "payment" &&
    paymentMethod.value === "company_credit" &&
    (currentCompany.value?.kycStatus !== "verified" ||
      creditRemaining.value < orderGrandTotal.value)
  ) {
    showInlineOrderError(
      t("cart.companyCreditUnavailableTitle"),
      t("cart.companyCreditUnavailableDesc"),
    );
    return;
  }

  // Block online payment flow when total is below the gateway minimum (20 THB).
  if (
    checkoutMode === "payment" &&
    (paymentMethod.value === "credit_card" ||
      paymentMethod.value === "promptpay") &&
    isBelowOnlineMin.value
  ) {
    showInlineOrderError(
      t("cart.minimumChargeTitle"),
      t("cart.minimumChargeDesc", { min: MIN_ONLINE_PAYMENT_THB }),
    );
    return;
  }

  isSubmittingOrder.value = true;
  try {
    const isCartValid = await validateCart();
    if (!isCartValid) {
      showInlineOrderError(
        t("cart.validationFailed"),
        t("cart.validationFailedDesc"),
      );
      return;
    }

    const resolvedCompanyId = isB2B.value
      ? (currentCompany.value?.id ?? selectedAddress.value.companyId ?? null)
      : null;

    const useOnlinePaymentFlow =
      checkoutMode === "payment" &&
      (paymentMethod.value === "credit_card" ||
        paymentMethod.value === "promptpay");

    if (useOnlinePaymentFlow) {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `order_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const response = await $fetch<{
        order?: { id: string };
        orderId?: string;
        idempotent?: boolean;
      }>("/api/orders", {
        method: "POST",
        body: {
          idempotencyKey,
          checkoutMode: "payment",
          paymentMethod: paymentMethod.value,
          companyId: resolvedCompanyId,
          cartId: cartId.value || null,
          shippingMode: isPickupSelected.value ? "pickup" : "delivery",
          address: {
            id: selectedAddress.value.id || null,
            title: selectedAddress.value.title,
            contactName: selectedAddress.value.contactName,
            contactPhone: selectedAddress.value.contactPhone,
            fullAddress: selectedAddress.value.fullAddress,
            subDistrict: selectedAddress.value.subDistrict,
            district: selectedAddress.value.district,
            province: selectedAddress.value.province,
            postalCode: selectedAddress.value.postalCode,
            note: selectedAddress.value.note,
          },
          items: cartItems.value.map((item) => ({
            skuId: item.skuId,
            quantity: item.quantity,
          })),
        },
      });

      const newOrderId = response.order?.id ?? response.orderId;
      if (!newOrderId) {
        throw new Error("Order created but no order ID was returned.");
      }

      // Cart is intentionally NOT cleared here — it is cleared only after the
      // payment is confirmed paid (in /payment/[orderId] or /payment/result).
      // This preserves the cart if the user fails or abandons the payment.
      await navigateTo(`/payment/${encodeURIComponent(newOrderId)}`);
      return;
    }

    const order = await submitOrder({
      checkoutMode,
      paymentMethod:
        checkoutMode === "payment" ? paymentMethod.value : undefined,
      address: selectedAddress.value,
      items: cartItems.value,
      cartId: cartId.value || null,
      companyId: resolvedCompanyId,
      shippingCost: shippingCost.value,
      shippingBreakdown: shippingBreakdown.value,
    });

    await clearCartPersisted();
    await navigateTo({
      path: "/user/orders",
      query: {
        created: order.id,
        mode: order.checkoutMode,
      },
    });
  } catch (submitError) {
    showInlineOrderError(
      checkoutMode === "quotation"
        ? "Quotation request failed"
        : "Order submit failed",
      submitError instanceof Error
        ? submitError.message
        : "Please try again in a moment.",
    );
  } finally {
    isSubmittingOrder.value = false;
  }
}

async function requestQuotation() {
  await submitCurrentOrder("quotation");
}

async function handleSubmitRentals() {
  const bookingsToSubmit = [...activeBookings.value];

  if (bookingsToSubmit.length === 0) {
    return;
  }

  if (bookingsToSubmit.some((booking) => !booking.hubId)) {
    showInlineOrderError(
      t("cart.bookingHubRequiredTitle"),
      t("cart.bookingHubRequiredDesc"),
    );
    return;
  }

  isSubmittingRental.value = true;

  try {
    const results = await Promise.all(
      bookingsToSubmit.map((booking) =>
        updateBookingStatus(booking.bookingId, "confirmed"),
      ),
    );

    if (results.some((ok) => !ok)) {
      showInlineOrderError(
        t("cart.rentalSubmitError"),
        t("cart.rentalSubmitErrorDesc"),
      );
      return;
    }

    await navigateTo({
      path: "/user/rentals",
      query: {
        submitted: "1",
        count: String(bookingsToSubmit.length),
      },
    });
  } finally {
    isSubmittingRental.value = false;
  }
}

async function handlePay() {
  await submitCurrentOrder("payment");
}
</script>

<template>
  <UContainer class="py-6">
    <HopFeatureBar class="mb-8" />

    <!-- Page Title -->
    <h1 class="mb-6 text-2xl font-bold">
      {{ t("cart.pageTitle") }}
    </h1>

    <!-- Empty state -->
    <div v-if="!hasItems" class="py-20 text-center">
      <UIcon name="bx:cart" class="mx-auto mb-4 text-6xl text-muted" />
      <p class="text-lg text-muted">{{ t("cart.emptyCart") }}</p>
      <p class="mb-6 text-sm text-muted">{{ t("cart.emptyCartDesc") }}</p>
      <UButton
        :label="t('cart.browseProducts')"
        to="/product-all"
        icon="bx:search"
        size="lg"
      />
    </div>

    <!-- ════════ Main Content (has items) ════════ -->
    <div v-else class="space-y-8">
      <!-- ─── Section 1: Booking Items (Rental) ─── -->
      <section v-if="activeBookings.length > 0">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="bx:calendar-check" class="text-xl text-primary" />
              <div>
                <h2 class="text-lg font-semibold">
                  {{ t("cart.bookingSection") }}
                </h2>
                <p class="text-sm text-muted">
                  {{ t("cart.bookingSectionDesc") }}
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-4">
            <div
              v-for="booking in activeBookings"
              :key="booking.bookingId"
              class="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row"
            >
              <!-- Thumbnail -->
              <NuxtImg
                :src="getBookingThumbnail(booking)"
                :alt="getBookingTitle(booking)"
                class="h-24 w-24 shrink-0 rounded-lg object-cover"
                loading="lazy"
              />

              <!-- Info -->
              <div class="min-w-0 flex-1 space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 space-y-1">
                    <h3 class="font-semibold">
                      {{ getBookingTitle(booking) }}
                    </h3>
                    <div class="flex flex-wrap gap-2">
                      <UBadge
                        v-if="booking.assetCode"
                        color="secondary"
                        variant="soft"
                        size="sm"
                      >
                        {{ booking.assetCode }}
                      </UBadge>
                      <UBadge
                        v-if="booking.assetName"
                        color="info"
                        variant="subtle"
                        size="sm"
                      >
                        {{ t("cart.assetLabel") }}
                      </UBadge>
                    </div>
                  </div>
                  <UButton
                    icon="bx:trash"
                    size="xs"
                    color="error"
                    variant="ghost"
                    :title="t('cart.remove')"
                    @click="() => void handleRemoveBooking(booking.bookingId)"
                  />
                </div>

                <p
                  v-if="booking.assetName && booking.matchedProductName"
                  class="text-sm text-muted"
                >
                  {{ t("cart.matchedProductLabel") }}:
                  {{ booking.matchedProductName }}
                </p>

                <!-- Rental period -->
                <p class="text-sm text-muted">
                  {{ t("cart.rentalPeriod") }}: {{ booking.startDate }} →
                  {{ booking.returnDate }} ({{
                    t("cart.days", { n: booking.numDays })
                  }})
                </p>

                <!-- Price breakdown (tiered: months / weeks / days) -->
                <div
                  v-if="booking.pricingBreakdown?.lines?.length"
                  class="space-y-1 rounded-md bg-elevated/40 p-2 text-xs"
                >
                  <p class="text-muted">
                    {{ t("cart.priceBreakdownTitle") }}
                  </p>
                  <div
                    v-for="line in booking.pricingBreakdown.lines"
                    :key="line.unit"
                    class="flex justify-between"
                  >
                    <span>
                      {{ unitLabel(line) }} × ฿{{ line.rate.toLocaleString() }}
                    </span>
                    <span class="font-medium">
                      ฿{{ line.subtotal.toLocaleString() }}
                    </span>
                  </div>
                </div>

                <!-- Rental cost (prominent total) -->
                <div class="flex items-center justify-between text-sm">
                  <span class="text-muted">{{ t("cart.rentalCost") }}</span>
                  <span class="text-base font-semibold text-primary">
                    ฿{{ booking.totalCost.toLocaleString() }}
                  </span>
                </div>

                <div v-if="getBookingAccessPath(booking)" class="pt-1">
                  <UButton
                    :to="getBookingAccessPath(booking) || undefined"
                    color="secondary"
                    variant="soft"
                    size="sm"
                    icon="bx:info-circle"
                    :label="t('asset.viewDetails')"
                  />
                </div>

                <!-- Deposit badge (blue) -->
                <UBadge color="info" variant="subtle" size="sm">
                  {{ t("cart.depositLabel") }}: ฿{{
                    booking.deposit.toLocaleString()
                  }}
                </UBadge>

                <!-- Hub selector -->
                <div class="flex items-center gap-2">
                  <UIcon name="bx:store" class="text-muted" />
                  <USelectMenu
                    :model-value="booking.hubId"
                    :items="hubOptions"
                    value-key="value"
                    :placeholder="t('cart.selectHub')"
                    class="w-60"
                    size="sm"
                    @update:model-value="
                      (val: string | null) =>
                        val
                          ? void handleHubChange(booking.bookingId, val)
                          : null
                    "
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Booking subtotals -->
          <template #footer>
            <div
              class="flex flex-col gap-2 text-sm sm:flex-row sm:justify-end sm:gap-6"
            >
              <span>
                {{ t("cart.rentalTotal") }}:
                <strong
                  >฿{{ activeBookingTotalRental.toLocaleString() }}</strong
                >
              </span>
              <span class="text-info">
                {{ t("cart.depositTotal") }}:
                <strong
                  >฿{{ activeBookingTotalDeposit.toLocaleString() }}</strong
                >
              </span>
            </div>
          </template>
        </UCard>

        <!-- Prominent "Pay at branch" notice (rental flow) -->
        <UAlert
          icon="bx:store"
          color="warning"
          variant="solid"
          class="mt-4"
          :title="t('cart.payAtBranchTitle')"
          :description="t('cart.payAtBranchDesc')"
        />
      </section>

      <!-- ─── Section 2: Cart Items (Consumables) ─── -->
      <section v-if="cartItems.length > 0">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="bx:cart" class="text-xl text-primary" />
              <div>
                <h2 class="text-lg font-semibold">
                  {{ t("cart.cartSection") }}
                </h2>
                <p class="text-sm text-muted">
                  {{ t("cart.cartSectionDesc") }}
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-3">
            <div
              v-for="item in cartItems"
              :key="`${item.productId}-${item.skuId}`"
              class="flex items-center gap-4 rounded-lg border p-3"
            >
              <!-- Thumbnail -->
              <NuxtImg
                :src="item.thumbnail"
                :alt="item.name"
                class="h-16 w-16 shrink-0 rounded-lg object-cover"
                loading="lazy"
              />

              <!-- Info -->
              <div class="min-w-0 flex-1">
                <h3 class="truncate font-medium">{{ item.name }}</h3>
                <p class="text-sm text-muted">
                  {{ t("cart.unitPrice") }}: ฿{{
                    item.unitPrice.toLocaleString()
                  }}
                </p>
              </div>

              <!-- Quantity controls -->
              <div class="flex items-center gap-1">
                <UButton
                  icon="bx:minus"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :disabled="item.quantity <= 1"
                  @click="
                    updateQuantity(
                      item.productId,
                      item.skuId,
                      item.quantity - 1,
                    )
                  "
                />
                <span class="w-8 text-center text-sm font-medium">
                  {{ item.quantity }}
                </span>
                <UButton
                  icon="bx:plus"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :disabled="isAtStockLimit(item)"
                  @click="handleIncreaseQuantity(item)"
                />
              </div>

              <!-- Subtotal -->
              <div class="w-24 text-right">
                <p class="font-semibold">
                  ฿{{ (item.unitPrice * item.quantity).toLocaleString() }}
                </p>
              </div>

              <!-- Remove -->
              <UButton
                icon="bx:trash"
                size="xs"
                color="error"
                variant="ghost"
                :title="t('cart.remove')"
                @click="removeFromCart(item.productId, item.skuId)"
              />
            </div>
          </div>

          <!-- Cart subtotal -->
          <template #footer>
            <div class="flex justify-end text-sm">
              <span>
                {{ t("cart.cartTotal") }}:
                <strong>฿{{ cartSubtotal.toLocaleString() }}</strong>
              </span>
            </div>
          </template>
        </UCard>
      </section>

      <!-- ─── Section 3: Address Picker ─── -->
      <section v-if="hasPurchaseItems">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="bx:map" class="text-xl text-primary" />
                <div>
                  <h2 class="text-lg font-semibold">
                    {{ t("cart.addressSection") }}
                  </h2>
                  <p class="text-sm text-muted">
                    {{ t("cart.addressSectionDesc") }}
                  </p>
                </div>
              </div>
              <UButton
                :label="t('cart.addAddress')"
                icon="bx:plus"
                size="sm"
                variant="outline"
                to="/user/account"
              />
            </div>
          </template>

          <!-- Loading -->
          <div v-if="addressLoading" class="space-y-3">
            <div
              v-for="i in 2"
              :key="i"
              class="h-16 animate-pulse rounded bg-elevated"
            />
          </div>

          <div v-else class="space-y-3">
            <!-- Pickup-at-branch option (when draft or confirmed bookings exist) -->
            <div
              v-if="hasPickupCandidateBookings"
              class="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors"
              :class="
                isPickupSelected
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-muted'
              "
              @click="selectedAddressId = PICKUP_ADDRESS_SENTINEL"
            >
              <!-- Radio indicator -->
              <div class="mt-0.5 shrink-0">
                <div
                  class="flex h-5 w-5 items-center justify-center rounded-full border-2"
                  :class="isPickupSelected ? 'border-primary' : 'border-muted'"
                >
                  <div
                    v-if="isPickupSelected"
                    class="h-2.5 w-2.5 rounded-full bg-primary"
                  />
                </div>
              </div>

              <!-- Pickup info -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <UIcon name="bx:store" class="text-base text-warning" />
                  <p class="font-medium">{{ t("cart.pickupAtBranchTitle") }}</p>
                </div>
                <p class="mt-1 text-sm text-muted">
                  {{ t("cart.pickupAtBranchDesc") }}
                </p>

                <!-- Branch picker (visible when pickup is selected) -->
                <!-- Branch is locked to the hubs of existing bookings: single
                     hub renders as a static card, multiple hubs render as a
                     dropdown limited to those hubs. -->
                <div v-if="isPickupSelected" class="mt-3 space-y-2">
                  <div
                    v-if="
                      pickupBranchOptions.length === 1 && selectedPickupBranch
                    "
                    class="inline-flex items-center gap-2 rounded-md border bg-elevated/50 px-3 py-1.5 text-sm font-medium"
                  >
                    <UIcon name="bx:store" class="text-warning" />
                    {{ branchLabel(selectedPickupBranch, lang) }}
                  </div>
                  <USelectMenu
                    v-else
                    v-model="pickupBranchId"
                    :items="pickupBranchOptions"
                    value-key="value"
                    :placeholder="t('cart.pickupBranchPlaceholder')"
                    size="md"
                    class="w-full sm:w-80"
                    @click.stop
                  />
                  <p
                    v-if="
                      selectedPickupBranch && selectedPickupBranch.addressTh
                    "
                    class="text-xs text-muted"
                  >
                    {{
                      lang === "th"
                        ? selectedPickupBranch.addressTh
                        : selectedPickupBranch.addressEn ||
                          selectedPickupBranch.addressTh
                    }}
                    <template v-if="selectedPickupBranch.phone">
                      · {{ selectedPickupBranch.phone }}
                    </template>
                  </p>

                  <!-- Bookings that will share this pickup trip -->
                  <ul
                    v-if="pickupBookingsAtSelectedBranch.length > 0"
                    class="mt-2 space-y-1 rounded-md bg-elevated/50 p-2 text-xs"
                  >
                    <li
                      v-for="b in pickupBookingsAtSelectedBranch"
                      :key="b.bookingId"
                      class="flex items-center gap-2"
                    >
                      <UIcon
                        :name="
                          b.status === 'confirmed'
                            ? 'bx:check-circle'
                            : 'bx:cart'
                        "
                        :class="
                          b.status === 'confirmed'
                            ? 'text-success'
                            : 'text-muted'
                        "
                      />
                      <span class="truncate font-medium">
                        {{ getBookingTitle(b) }}
                      </span>
                      <span class="text-muted">
                        · {{ b.startDate }} → {{ b.returnDate }}
                      </span>
                      <UBadge
                        :color="
                          b.status === 'confirmed' ? 'success' : 'neutral'
                        "
                        variant="subtle"
                        size="xs"
                        :label="
                          b.status === 'confirmed'
                            ? t('cart.pickupBookingConfirmed')
                            : t('cart.pickupBookingDraft')
                        "
                      />
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- No addresses (and pickup not applicable) -->
            <div
              v-if="
                availableAddresses.length === 0 && !hasPickupCandidateBookings
              "
              class="py-8 text-center"
            >
              <UIcon name="bx:map" class="mx-auto mb-2 text-4xl text-muted" />
              <p class="text-muted">{{ t("cart.noAddress") }}</p>
              <p class="text-sm text-muted">{{ t("cart.noAddressDesc") }}</p>
            </div>

            <!-- Address cards -->
            <div
              v-for="addr in availableAddresses"
              :key="addr.id"
              class="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors"
              :class="
                selectedAddressId === addr.id
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-muted'
              "
              @click="selectedAddressId = addr.id"
            >
              <!-- Radio indicator -->
              <div class="mt-0.5 shrink-0">
                <div
                  class="flex h-5 w-5 items-center justify-center rounded-full border-2"
                  :class="
                    selectedAddressId === addr.id
                      ? 'border-primary'
                      : 'border-muted'
                  "
                >
                  <div
                    v-if="selectedAddressId === addr.id"
                    class="h-2.5 w-2.5 rounded-full bg-primary"
                  />
                </div>
              </div>

              <!-- Address info -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="font-medium">{{ addr.title }}</p>
                  <UBadge
                    v-if="addr.isDefault"
                    label="Default"
                    color="primary"
                    variant="subtle"
                    size="xs"
                  />
                </div>
                <p class="mt-1 text-sm text-muted">{{ addr.fullAddress }}</p>
                <p
                  v-if="
                    addr.subDistrict ||
                    addr.district ||
                    addr.province ||
                    addr.postalCode
                  "
                  class="mt-1 text-sm text-muted"
                >
                  {{
                    [
                      addr.subDistrict,
                      addr.district,
                      addr.province,
                      addr.postalCode,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }}
                </p>
                <p
                  v-if="addr.contactName || addr.contactPhone"
                  class="mt-1 text-xs text-muted"
                >
                  {{
                    [addr.contactName, addr.contactPhone]
                      .filter(Boolean)
                      .join(" · ")
                  }}
                </p>
                <p v-if="addr.note" class="mt-1 text-xs text-muted">
                  {{ addr.note }}
                </p>
              </div>

              <!-- Set default button -->
              <UButton
                v-if="canManageAvailableAddresses && !addr.isDefault"
                icon="bx:star"
                size="xs"
                color="neutral"
                variant="ghost"
                :title="t('cart.setDefault')"
                @click.stop="handleSetDefault(addr.id)"
              />
            </div>
          </div>
        </UCard>
      </section>

      <!-- ─── Section 4: Checkout & Payment ─── -->
      <section>
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="bx:receipt" class="text-xl text-primary" />
              <div>
                <h2 class="text-lg font-semibold">
                  {{ t("cart.checkoutSection") }}
                </h2>
              </div>
            </div>
          </template>

          <!-- Order summary — sale items only (rental & deposit are paid at branch) -->
          <div v-if="hasPurchaseItems" class="space-y-4">
            <h3 class="font-semibold">{{ t("cart.orderSummary") }}</h3>

            <div class="space-y-2 text-sm">
              <!-- Cart total -->
              <div class="flex justify-between">
                <span class="text-muted">
                  {{ t("cart.cartTotal") }}
                  ({{ t("cart.itemCount", { n: cartItemCount }) }})
                </span>
                <span>฿{{ cartSubtotal.toLocaleString() }}</span>
              </div>

              <!-- Shipping fee — waived when picking up at branch -->
              <div class="flex justify-between">
                <span class="text-muted">{{ t("cart.shippingFee") }}</span>
                <span v-if="isPickupSelected" class="text-success">
                  {{ t("cart.shippingFreeAtPickup") }}
                </span>
                <span v-else>฿{{ shippingCost.toLocaleString() }}</span>
              </div>

              <!-- Shipping breakdown — only when there are real boxes -->
              <div
                v-if="!isPickupSelected && hasShippingBoxes"
                class="rounded-md bg-elevated/40 px-3 py-2 text-xs text-muted"
              >
                <div class="mb-1 font-medium">
                  {{ t("cart.shippingBreakdownTitle") }}
                </div>
                <ul class="space-y-0.5">
                  <li
                    v-if="shippingBreakdown.xl > 0"
                    class="flex justify-between"
                  >
                    <span>
                      {{
                        t("cart.shippingBreakdownLine.xl", {
                          n: shippingBreakdown.xl,
                        })
                      }}
                    </span>
                    <span
                      >฿{{
                        (shippingBreakdown.xl * 200).toLocaleString()
                      }}</span
                    >
                  </li>
                  <li
                    v-if="shippingBreakdown.l > 0"
                    class="flex justify-between"
                  >
                    <span>
                      {{
                        t("cart.shippingBreakdownLine.l", {
                          n: shippingBreakdown.l,
                        })
                      }}
                    </span>
                    <span
                      >฿{{ (shippingBreakdown.l * 150).toLocaleString() }}</span
                    >
                  </li>
                  <li
                    v-if="shippingBreakdown.m > 0"
                    class="flex justify-between"
                  >
                    <span>
                      {{
                        t("cart.shippingBreakdownLine.m", {
                          n: shippingBreakdown.m,
                        })
                      }}
                    </span>
                    <span
                      >฿{{ (shippingBreakdown.m * 100).toLocaleString() }}</span
                    >
                  </li>
                  <li
                    v-if="shippingBreakdown.s > 0"
                    class="flex justify-between"
                  >
                    <span>
                      {{
                        t("cart.shippingBreakdownLine.s", {
                          n: shippingBreakdown.s,
                        })
                      }}
                    </span>
                    <span
                      >฿{{ (shippingBreakdown.s * 50).toLocaleString() }}</span
                    >
                  </li>
                  <li
                    v-if="shippingBreakdown.free > 0"
                    class="flex justify-between"
                  >
                    <span>
                      {{
                        t("cart.shippingBreakdownLine.free", {
                          n: shippingBreakdown.free,
                        })
                      }}
                    </span>
                    <span>฿0</span>
                  </li>
                </ul>
              </div>

              <UDivider />

              <!-- Grand total — cart subtotal + shipping -->
              <div class="flex justify-between text-lg font-bold">
                <span>{{ t("cart.grandTotal") }}</span>
                <span class="text-primary">
                  ฿{{ orderGrandTotal.toLocaleString() }}
                </span>
              </div>

              <!-- Minimum-charge notice for online payment (Omise: 20 THB) -->
              <p
                v-if="isBelowOnlineMin && !isB2BUser"
                class="rounded-md bg-warning/10 p-2 text-xs text-warning"
              >
                <UIcon name="bx:info-circle" class="mr-1 align-text-bottom" />
                {{
                  t("cart.minimumChargeNotice", { min: MIN_ONLINE_PAYMENT_THB })
                }}
              </p>
            </div>

            <UDivider />

            <!-- Payment method (hidden for organization members — quotation only) -->
            <div v-if="hasPurchaseItems && !isB2BUser" class="space-y-3">
              <h3 class="font-semibold">{{ t("cart.paymentMethod") }}</h3>

              <!-- Credit Card -->
              <label
                class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors"
                :class="
                  paymentMethod === 'credit_card'
                    ? 'border-primary bg-primary/5'
                    : ''
                "
              >
                <input
                  v-model="paymentMethod"
                  type="radio"
                  value="credit_card"
                  class="accent-primary"
                />
                <UIcon name="bx:credit-card" class="text-lg" />
                <span class="text-sm">{{ t("cart.creditCard") }}</span>
              </label>

              <!-- PromptPay -->
              <label
                class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors"
                :class="
                  paymentMethod === 'promptpay'
                    ? 'border-primary bg-primary/5'
                    : ''
                "
              >
                <input
                  v-model="paymentMethod"
                  type="radio"
                  value="promptpay"
                  class="accent-primary"
                />
                <UIcon name="bx:qr" class="text-lg" />
                <span class="text-sm">{{ t("cart.promptPay") }}</span>
              </label>

              <!-- Company Credit (organization admin only with KYC verified) -->
              <label
                v-if="isB2BAdmin && currentCompany?.kycStatus === 'verified'"
                class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors"
                :class="
                  paymentMethod === 'company_credit'
                    ? 'border-primary bg-primary/5'
                    : ''
                "
              >
                <input
                  v-model="paymentMethod"
                  type="radio"
                  value="company_credit"
                  class="accent-primary"
                  :disabled="creditRemaining < orderGrandTotal"
                />
                <UIcon name="bx:building" class="text-lg" />
                <div>
                  <span class="text-sm">{{ t("cart.companyCredit") }}</span>
                  <p class="text-xs text-muted">
                    {{
                      t("cart.companyCreditRemaining", {
                        amount: creditRemaining.toLocaleString(),
                      })
                    }}
                  </p>
                  <p
                    v-if="creditRemaining < orderGrandTotal"
                    class="text-xs text-error"
                  >
                    {{ t("cart.insufficientCredit") }}
                  </p>
                </div>
              </label>

              <!-- KYC required notice for organization admin without KYC -->
              <div
                v-if="isB2BAdmin && currentCompany?.kycStatus !== 'verified'"
                class="rounded-lg border border-dashed p-3 text-sm text-muted"
              >
                <UIcon name="bx:lock" class="mr-1 inline" />
                {{ t("cart.kycRequired") }}
              </div>
            </div>

            <!-- Organization member notice — quotation only -->
            <div
              v-if="hasPurchaseItems && isB2BUser"
              class="rounded-lg border border-dashed border-info p-4 text-sm text-muted"
            >
              <UIcon name="bx:info-circle" class="mr-1 inline text-info" />
              {{ t("cart.b2bUserQuotationOnly") }}
            </div>

            <div
              v-if="hasRentalBookings"
              class="rounded-lg border border-dashed border-warning p-4 text-sm text-muted"
            >
              <UIcon name="bx:store" class="mr-1 inline text-warning" />
              {{
                bookingsMissingHub.length > 0
                  ? t("cart.bookingHubRequiredNotice", {
                      n: bookingsMissingHub.length,
                    })
                  : t("cart.bookingSubmitReady")
              }}
            </div>
          </div>

          <!-- Action buttons -->
          <template #footer>
            <div class="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <div class="flex gap-2">
                <UButton
                  :label="t('cart.continueShopping')"
                  to="/product-all"
                  icon="bx:arrow-back"
                  color="neutral"
                  variant="outline"
                />
                <!-- Organization quotation button (member = primary, admin = secondary) -->
                <UButton
                  v-if="isB2B && hasPurchaseItems"
                  :label="t('cart.requestQuotation')"
                  icon="bx:file"
                  :color="isB2BUser ? 'primary' : 'info'"
                  :variant="isB2BUser ? 'solid' : 'soft'"
                  :size="isB2BUser ? 'lg' : 'md'"
                  :loading="isSubmittingOrder"
                  :disabled="isSubmittingOrder || !hasPurchaseItems"
                  @click="requestQuotation"
                />
              </div>
              <div class="flex flex-col gap-3 sm:flex-row">
                <UButton
                  v-if="hasRentalBookings"
                  :label="
                    isSubmittingRental
                      ? t('cart.submittingRental')
                      : t('cart.submitRental')
                  "
                  icon="bx:calendar-check"
                  size="lg"
                  color="primary"
                  :loading="isSubmittingRental"
                  :disabled="
                    isSubmittingRental || bookingsMissingHub.length > 0
                  "
                  @click="handleSubmitRentals"
                />
                <!-- Proceed to Payment — not for organization members -->
                <UButton
                  v-if="hasPurchaseItems && !isB2BUser"
                  :label="t('cart.proceedToPayment')"
                  icon="bx:check-circle"
                  size="lg"
                  :loading="isSubmittingOrder"
                  :disabled="
                    isSubmittingOrder ||
                    !hasPurchaseItems ||
                    (isBelowOnlineMin &&
                      (paymentMethod === 'credit_card' ||
                        paymentMethod === 'promptpay'))
                  "
                  @click="handlePay"
                />
              </div>
            </div>
          </template>
        </UCard>
      </section>
    </div>
  </UContainer>
</template>
