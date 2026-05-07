<script setup lang="ts">
import type { BookingItem } from "~/types/booking";
import type {
  OrderCheckoutMode,
  OrderFulfillmentStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
} from "~/types/order";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";

type BadgeColor =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "error"
  | "primary";

const route = useRoute();
const { t } = useI18n();
const { isLoggedIn } = useAuthSession();
const { orders, loading, error, fetchOrders } = useOrders();
const { bookingItems } = useBooking();

const cancelledBookings = computed<BookingItem[]>(() =>
  bookingItems.value
    .filter((b) => b.status === "cancelled")
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
);

function bookingTitle(booking: BookingItem): string {
  return booking.assetName || booking.productName;
}

function rentalPeriodLabel(booking: BookingItem): string {
  return `${booking.startDate} → ${booking.returnDate} • ${t("cart.days", { n: booking.numDays })}`;
}

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`);
  }
});

if (import.meta.client) {
  onMounted(() => {
    void fetchOrders();
  });
}

function getQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const createdOrderId = computed(() => getQueryValue(route.query.created));
const createdMode = computed(
  () => getQueryValue(route.query.mode) as OrderCheckoutMode | null,
);

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function paymentMethodLabel(method: OrderPaymentMethod): string {
  if (method === "credit_card") return t("cart.creditCard");
  if (method === "promptpay") return t("cart.promptPay");
  return t("cart.companyCredit");
}

function modeLabel(mode: OrderCheckoutMode): string {
  return t(
    mode === "quotation"
      ? "ordersPage.mode.quotation"
      : "ordersPage.mode.payment",
  );
}

function orderStatusLabel(status: OrderStatus): string {
  if (status === "submitted") return t("ordersPage.status.order.submitted");
  if (status === "confirmed") return t("ordersPage.status.order.confirmed");
  if (status === "completed") return t("ordersPage.status.order.completed");
  return t("ordersPage.status.order.cancelled");
}

function orderStatusColor(status: OrderStatus): BadgeColor {
  if (status === "submitted") return "info";
  if (status === "confirmed") return "primary";
  if (status === "completed") return "success";
  return "error";
}

function paymentStatusLabel(status: OrderPaymentStatus): string {
  if (status === "not_applicable") {
    return t("ordersPage.status.payment.not_applicable");
  }
  if (status === "pending_review") {
    return t("ordersPage.status.payment.pending_review");
  }
  if (status === "awaiting_payment") {
    return t("ordersPage.status.payment.awaiting_payment");
  }
  if (status === "paid") return t("ordersPage.status.payment.paid");
  if (status === "deferred") return t("ordersPage.status.payment.deferred");
  if (status === "refunded") return t("ordersPage.status.payment.refunded");
  return t("ordersPage.status.payment.cancelled");
}

function paymentStatusColor(status: OrderPaymentStatus): BadgeColor {
  if (status === "not_applicable") return "neutral";
  if (status === "pending_review") return "info";
  if (status === "awaiting_payment") return "warning";
  if (status === "paid") return "success";
  if (status === "deferred") return "primary";
  if (status === "refunded") return "neutral";
  return "error";
}

function fulfillmentStatusLabel(status: OrderFulfillmentStatus): string {
  if (status === "not_applicable") {
    return t("ordersPage.status.fulfillment.not_applicable");
  }
  if (status === "unfulfilled") {
    return t("ordersPage.status.fulfillment.unfulfilled");
  }
  if (status === "preparing")
    return t("ordersPage.status.fulfillment.preparing");
  if (status === "ready_for_carrier_pickup") {
    return t("ordersPage.status.fulfillment.ready_for_carrier_pickup");
  }
  if (status === "shipped") return t("ordersPage.status.fulfillment.shipped");
  if (status === "delivered") {
    return t("ordersPage.status.fulfillment.delivered");
  }
  if (status === "returned") return t("ordersPage.status.fulfillment.returned");
  return t("ordersPage.status.fulfillment.cancelled");
}

function fulfillmentStatusColor(status: OrderFulfillmentStatus): BadgeColor {
  if (status === "not_applicable") return "neutral";
  if (status === "unfulfilled") return "warning";
  if (status === "preparing") return "info";
  if (status === "ready_for_carrier_pickup") return "primary";
  if (status === "shipped") return "primary";
  if (status === "delivered") return "success";
  if (status === "returned") return "warning";
  return "error";
}
</script>

<template>
  <UContainer class="py-6">
    <HopFeatureBar class="mb-8" />

    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">{{ t("user.orders") }}</h1>
        <p class="text-sm text-muted">{{ t("ordersPage.description") }}</p>
      </div>
      <UButton
        :label="t('cart.browseProducts')"
        to="/product-all"
        icon="bx:search"
        variant="outline"
      />
    </div>

    <UCard
      v-if="createdOrderId"
      class="mb-6 border border-success/30 bg-success/5"
    >
      <div class="flex items-start gap-3">
        <UIcon name="bx:check-circle" class="mt-0.5 text-2xl text-success" />
        <div>
          <p class="font-semibold">
            {{
              createdMode === "quotation"
                ? t("ordersPage.createdQuotation")
                : t("ordersPage.createdOrder")
            }}
          </p>
          <p class="text-sm text-muted">
            {{ t("ordersPage.reference", { id: createdOrderId }) }}
          </p>
        </div>
      </div>
    </UCard>

    <UCard v-if="error" class="mb-6 border border-error/30 bg-error/5">
      <p class="text-sm text-error">{{ error }}</p>
    </UCard>

    <div v-if="loading" class="space-y-4">
      <div
        v-for="i in 3"
        :key="i"
        class="h-28 animate-pulse rounded-xl bg-elevated"
      />
    </div>

    <UCard v-else-if="orders.length === 0">
      <div class="py-12 text-center">
        <UIcon name="bx:receipt" class="mx-auto mb-3 text-5xl text-muted" />
        <p class="text-lg font-medium">{{ t("ordersPage.emptyTitle") }}</p>
        <p class="mb-5 text-sm text-muted">
          {{ t("ordersPage.emptyDescription") }}
        </p>
        <UButton
          :label="t('ordersPage.goToCatalog')"
          to="/product-all"
          icon="bx:search"
        />
      </div>
    </UCard>

    <div v-else class="space-y-4">
      <UCard v-for="order in orders" :key="order.id">
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="space-y-1">
            <p class="font-semibold">{{ order.orderNumber }}</p>
            <p class="text-sm text-muted">{{ formatDate(order.createdAt) }}</p>
            <div class="flex flex-wrap gap-2 pt-1">
              <UBadge :color="orderStatusColor(order.status)" variant="subtle">
                {{
                  t("ordersPage.badges.order", {
                    status: orderStatusLabel(order.status),
                  })
                }}
              </UBadge>
              <UBadge
                :color="paymentStatusColor(order.paymentStatus)"
                variant="subtle"
              >
                {{
                  t("ordersPage.badges.payment", {
                    status: paymentStatusLabel(order.paymentStatus),
                  })
                }}
              </UBadge>
              <UBadge
                :color="fulfillmentStatusColor(order.fulfillmentStatus)"
                variant="subtle"
              >
                {{
                  t("ordersPage.badges.fulfillment", {
                    status: fulfillmentStatusLabel(order.fulfillmentStatus),
                  })
                }}
              </UBadge>
              <UBadge color="neutral" variant="soft">{{
                modeLabel(order.checkoutMode)
              }}</UBadge>
              <UBadge v-if="order.paymentMethod" color="neutral" variant="soft">
                {{ paymentMethodLabel(order.paymentMethod) }}
              </UBadge>
            </div>
          </div>

          <div class="text-left sm:text-right">
            <p class="text-sm text-muted">{{ t("ordersPage.total") }}</p>
            <p class="text-lg font-bold text-primary">
              {{ formatCurrency(order.grandTotal) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ order.addressSnapshot.title }}
            </p>
          </div>
        </div>

        <div
          v-if="
            order.trackingNumber || order.trackingCarrier || order.trackingNote
          "
          class="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
        >
          <p class="mb-1 flex items-center gap-1 font-semibold text-primary">
            <UIcon name="bx:package" />
            {{ t("ordersPage.tracking.title") }}
          </p>
          <div class="space-y-0.5">
            <p v-if="order.trackingCarrier">
              <span class="font-medium"
                >{{ t("ordersPage.tracking.carrier") }}:</span
              >
              {{ order.trackingCarrier }}
            </p>
            <p v-if="order.trackingNumber">
              <span class="font-medium"
                >{{ t("ordersPage.tracking.number") }}:</span
              >
              <span class="font-mono">{{ order.trackingNumber }}</span>
            </p>
            <p v-if="order.shippedAt" class="text-xs text-muted">
              {{ t("ordersPage.tracking.shippedAt") }}:
              {{ formatDate(order.shippedAt) }}
            </p>
            <p v-if="order.trackingNote" class="mt-1 text-xs">
              {{ order.trackingNote }}
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <div v-if="cancelledBookings.length > 0" class="mt-10">
      <div class="mb-4">
        <h2 class="text-xl font-bold">
          {{ t("ordersPage.cancelledBookingsTitle") }}
        </h2>
        <p class="text-sm text-muted">
          {{ t("ordersPage.cancelledBookingsDesc") }}
        </p>
      </div>
      <div class="space-y-4">
        <UCard
          v-for="booking in cancelledBookings"
          :key="booking.bookingId"
          class="opacity-80"
        >
          <div
            class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div class="space-y-2">
              <div>
                <p class="font-semibold">{{ bookingTitle(booking) }}</p>
                <p class="text-xs text-muted">
                  {{ t("rentalsPage.reference", { id: booking.bookingId }) }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UBadge color="error" variant="subtle">
                  {{
                    t("rentalsPage.badges.status", {
                      status: t("rentalsPage.status.cancelled"),
                    })
                  }}
                </UBadge>
              </div>
              <div class="space-y-1 text-sm text-muted">
                <p>
                  <span class="font-medium text-default"
                    >{{ t("rentalsPage.createdAt") }}:</span
                  >
                  {{ formatDate(booking.createdAt) }}
                </p>
                <p>
                  <span class="font-medium text-default"
                    >{{ t("rentalsPage.rentalPeriod") }}:</span
                  >
                  {{ rentalPeriodLabel(booking) }}
                </p>
                <p>
                  <span class="font-medium text-default"
                    >{{ t("rentalsPage.pickupHub") }}:</span
                  >
                  {{ booking.hubName || t("rentalsPage.noHub") }}
                </p>
              </div>
            </div>

            <div class="text-left sm:text-right">
              <p class="text-sm text-muted">
                {{ t("rentalsPage.rentalTotal") }}
              </p>
              <p class="text-lg font-bold text-primary">
                {{ formatCurrency(booking.totalCost) }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ t("cart.depositLabel") }}:
                {{ formatCurrency(booking.deposit) }}
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </UContainer>
</template>
