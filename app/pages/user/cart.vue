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
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import { mockStores } from "~/mock/stores";

const { t, locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);
const toast = useToast();
const { getSaleStockBySku } = useProducts();

// ── Auth guard ──
const { isLoggedIn } = useAuthSession();
watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo("/user/login");
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

// Auto-select default address
watchEffect(() => {
  if (!selectedAddressId.value && availableAddresses.value.length > 0) {
    const defaultAddr = availableAddresses.value.find((a) => a.isDefault);
    selectedAddressId.value =
      defaultAddr?.id ?? availableAddresses.value[0]!.id;
  }
});

// ── Hub options (for booking item hub selectors) ──
const activeStores = mockStores.filter((s) => s.isActive);
const hubOptions = computed(() =>
  activeStores.map((s) => ({
    label: s.name[lang.value],
    value: s.id,
  })),
);

function getHubLabel(hubId: string | null): string {
  if (!hubId) return t("cart.noHubSelected");
  const store = activeStores.find((s) => s.id === hubId);
  return store ? store.name[lang.value] : hubId;
}

// ── Payment method ──
type PaymentMethod = "credit_card" | "promptpay" | "company_credit";
const paymentMethod = ref<PaymentMethod>("credit_card");

// ── B2B Quotation ──
const selectedAddress = computed<Address | null>(
  () =>
    availableAddresses.value.find(
      (addr) => addr.id === selectedAddressId.value,
    ) ?? null,
);

const canManageAvailableAddresses = computed(
  () => !isB2B.value || isB2BAdmin.value,
);

const orderGrandTotal = computed(() => cartSubtotal.value);

// ── Grand total ──
const grandTotal = computed(
  () =>
    activeBookingTotalDeposit.value +
    activeBookingTotalRental.value +
    cartSubtotal.value,
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
  return booking.rentalAccessName || booking.productName;
}

function getBookingThumbnail(booking: BookingItem): string {
  return booking.rentalAccessThumbnail || booking.thumbnail;
}

function getBookingAccessPath(booking: BookingItem): string | null {
  return booking.rentalAccessSlug
    ? `/rental-access/${booking.rentalAccessSlug}`
    : null;
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
  const store = activeStores.find((s) => s.id === hubId);
  if (store) {
    const ok = await updateHub(bookingId, hubId, store.name[lang.value]);
    if (!ok) {
      showBookingActionError();
    }
  }
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
    showInlineOrderError(
      "No sale items to submit",
      "Add at least one purchase item to the cart before placing an online order.",
    );
    return;
  }

  if (!selectedAddress.value) {
    showInlineOrderError(
      "Delivery address required",
      "Please select a delivery address before submitting the order.",
    );
    return;
  }

  if (
    checkoutMode === "payment" &&
    paymentMethod.value === "company_credit" &&
    (currentCompany.value?.kycStatus !== "verified" ||
      creditRemaining.value < orderGrandTotal.value)
  ) {
    showInlineOrderError(
      "Company credit is not available",
      "Please verify company KYC and make sure enough credit remains before submitting.",
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

    const order = await submitOrder({
      checkoutMode,
      paymentMethod:
        checkoutMode === "payment" ? paymentMethod.value : undefined,
      address: selectedAddress.value,
      items: cartItems.value,
      cartId: cartId.value || null,
      companyId: resolvedCompanyId,
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
                        v-if="booking.rentalAccessCode"
                        color="secondary"
                        variant="soft"
                        size="sm"
                      >
                        {{ booking.rentalAccessCode }}
                      </UBadge>
                      <UBadge
                        v-if="booking.rentalAccessName"
                        color="info"
                        variant="subtle"
                        size="sm"
                      >
                        {{ t("cart.rentalAccessLabel") }}
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
                  v-if="booking.rentalAccessName && booking.matchedProductName"
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

                <!-- Daily rate + Rental cost -->
                <div class="flex flex-wrap gap-4 text-sm">
                  <span>
                    {{ t("cart.dailyRate") }}: ฿{{
                      booking.dailyRate.toLocaleString()
                    }}
                  </span>
                  <span>
                    {{ t("cart.rentalCost") }}: ฿{{
                      booking.totalCost.toLocaleString()
                    }}
                  </span>
                </div>

                <div v-if="getBookingAccessPath(booking)" class="pt-1">
                  <UButton
                    :to="getBookingAccessPath(booking) || undefined"
                    color="secondary"
                    variant="soft"
                    size="sm"
                    icon="bx:info-circle"
                    :label="t('rentalAccess.viewDetails')"
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

          <!-- No addresses -->
          <div
            v-else-if="availableAddresses.length === 0"
            class="py-8 text-center"
          >
            <UIcon name="bx:map" class="mx-auto mb-2 text-4xl text-muted" />
            <p class="text-muted">{{ t("cart.noAddress") }}</p>
            <p class="text-sm text-muted">{{ t("cart.noAddressDesc") }}</p>
          </div>

          <!-- Address list -->
          <div v-else class="space-y-3">
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
                  v-if="addr.contactName || addr.contactPhone"
                  class="mt-1 text-xs text-muted"
                >
                  {{
                    [addr.contactName, addr.contactPhone]
                      .filter(Boolean)
                      .join(" · ")
                  }}
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

          <!-- Order summary -->
          <div class="space-y-4">
            <h3 class="font-semibold">{{ t("cart.orderSummary") }}</h3>

            <div class="space-y-2 text-sm">
              <!-- Rental total -->
              <div
                v-if="activeBookings.length > 0"
                class="flex justify-between"
              >
                <span class="text-muted">
                  {{ t("cart.rentalTotal") }}
                  ({{ t("cart.bookingCount", { n: activeBookings.length }) }})
                </span>
                <span>฿{{ activeBookingTotalRental.toLocaleString() }}</span>
              </div>

              <!-- Deposit total -->
              <div
                v-if="activeBookings.length > 0"
                class="flex justify-between"
              >
                <span class="text-info">{{ t("cart.depositTotal") }}</span>
                <span class="text-info">
                  ฿{{ activeBookingTotalDeposit.toLocaleString() }}
                </span>
              </div>

              <!-- Cart total -->
              <div v-if="cartItems.length > 0" class="flex justify-between">
                <span class="text-muted">
                  {{ t("cart.cartTotal") }}
                  ({{ t("cart.itemCount", { n: cartItemCount }) }})
                </span>
                <span>฿{{ cartSubtotal.toLocaleString() }}</span>
              </div>

              <UDivider />

              <!-- Grand total -->
              <div class="flex justify-between text-lg font-bold">
                <span>{{ t("cart.grandTotal") }}</span>
                <span class="text-primary">
                  ฿{{ grandTotal.toLocaleString() }}
                </span>
              </div>
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
                  :disabled="isSubmittingOrder || !hasPurchaseItems"
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
