<script setup lang="ts">
import AdminOrderQrScanner from "~/components/admin/AdminOrderQrScanner.vue";
import type {
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
} from "~/types/order";
import type { RentalBookingStatus } from "~/types/rental-booking";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type BadgeColor =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "error"
  | "primary";

const router = useRouter();
const toast = useToast();

const {
  filters,
  items,
  total,
  hasMore,
  loading,
  loadingMore,
  error,
  refresh,
  loadMore,
  resetFilters,
} = useAdminOrders();

// ── Branch filter options (rental only) ──
const { data: branchData } = await useFetch<{
  items: Array<{
    id: string;
    code: string;
    nameTh: string;
    nameEn: string;
    isActive: boolean;
  }>;
}>("/api/admin/branches", { key: "admin-orders-branches" });

const branchOptions = computed(() => [
  { value: "", label: "All branches" },
  ...(branchData.value?.items ?? [])
    .filter((b) => b.isActive)
    .map((b) => ({ value: b.id, label: `${b.nameTh} · ${b.code}` })),
]);

// ── Filter dropdown options ──
const typeOptions = [
  { value: "all", label: "All" },
  { value: "sale", label: "Sale orders" },
  { value: "rental", label: "Rental bookings" },
];

const orderStatusOptions: Array<{ value: OrderStatus; label: string }> = [
  { value: "submitted", label: "Submitted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const paymentStatusOptions: Array<{
  value: OrderPaymentStatus;
  label: string;
}> = [
  { value: "not_applicable", label: "N/A" },
  { value: "pending_review", label: "Pending review" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "paid", label: "Paid" },
  { value: "deferred", label: "Deferred" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];

const fulfillmentStatusOptions: Array<{
  value: OrderFulfillmentStatus;
  label: string;
}> = [
  { value: "not_applicable", label: "N/A" },
  { value: "unfulfilled", label: "Unfulfilled" },
  { value: "preparing", label: "Preparing" },
  { value: "ready_for_carrier_pickup", label: "Ready for pickup" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "returned", label: "Returned" },
  { value: "cancelled", label: "Cancelled" },
];

const rentalStatusOptions: Array<{
  value: RentalBookingStatus;
  label: string;
}> = [
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Auto-refetch on filter change (debounced for search) ──
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => filters.search,
  () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void refresh(), 300);
  },
);

watch(
  [
    () => filters.type,
    () => filters.orderStatus,
    () => filters.paymentStatus,
    () => filters.fulfillmentStatus,
    () => filters.rentalStatus,
    () => filters.dateFrom,
    () => filters.dateTo,
    () => filters.branchId,
  ],
  () => void refresh(),
  { deep: true },
);

if (import.meta.client) {
  onMounted(() => {
    void refresh();
  });
}

// ── QR scanner ──
const isScannerOpen = ref(false);

function handleDecoded(payload: {
  raw: string;
  kind: "order" | "booking" | "customer" | "unknown";
  value: string;
}): void {
  if (payload.kind === "order") {
    const target = items.value
      .flatMap((c) => c.saleOrders)
      .find((o) => o.orderNumber === payload.value);
    if (target) {
      void router.push(`/admin/orders/${target.id}`);
      return;
    }
    filters.search = payload.value;
    toast.add({
      title: "Order not in current page",
      description: `Searching for order ${payload.value}…`,
      color: "info",
    });
    return;
  }
  if (payload.kind === "booking") {
    void router.push(`/admin/rental-bookings/${payload.value}`);
    return;
  }
  if (payload.kind === "customer") {
    filters.search = payload.value;
    toast.add({
      title: "Customer scanned",
      description: `Filtering by customer ${payload.value}…`,
      color: "info",
    });
    return;
  }
  filters.search = payload.raw;
  toast.add({
    title: "QR scanned",
    description: `Searching for "${payload.raw}"…`,
    color: "info",
  });
}

// ── Formatting helpers ──
function formatCurrency(value: number, currency = "THB"): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function orderStatusColor(status: OrderStatus): BadgeColor {
  if (status === "submitted") return "info";
  if (status === "confirmed") return "primary";
  if (status === "completed") return "success";
  return "error";
}

function paymentStatusColor(status: OrderPaymentStatus): BadgeColor {
  if (status === "paid") return "success";
  if (status === "awaiting_payment") return "warning";
  if (status === "pending_review") return "info";
  if (status === "refunded" || status === "not_applicable") return "neutral";
  if (status === "deferred") return "primary";
  return "error";
}

function fulfillmentStatusColor(status: OrderFulfillmentStatus): BadgeColor {
  if (status === "delivered") return "success";
  if (status === "shipped" || status === "ready_for_carrier_pickup")
    return "primary";
  if (status === "preparing") return "info";
  if (status === "unfulfilled" || status === "returned") return "warning";
  if (status === "cancelled") return "error";
  return "neutral";
}

function rentalStatusColor(status: RentalBookingStatus): BadgeColor {
  if (status === "confirmed") return "success";
  if (status === "draft") return "warning";
  return "error";
}

function isSaleOrderIncomplete(order: { status: OrderStatus }): boolean {
  return order.status !== "completed" && order.status !== "cancelled";
}

function isRentalBookingIncomplete(booking: {
  status: RentalBookingStatus;
}): boolean {
  return booking.status === "draft";
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">Orders & Bookings</h2>
        <p class="text-sm text-muted">
          Customer-grouped view of sale orders and rental bookings.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="bx:qr-scan"
          label="Scan QR"
          color="primary"
          variant="soft"
          @click="isScannerOpen = true"
        />
        <UButton
          icon="bx:reset"
          label="Reset filters"
          color="neutral"
          variant="ghost"
          @click="resetFilters()"
        />
      </div>
    </div>

    <UCard>
      <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <UFormField label="Search">
          <UInput
            v-model="filters.search"
            placeholder="Order #, name, phone, ID…"
            icon="bx:search"
          />
        </UFormField>

        <UFormField label="Type">
          <USelectMenu
            v-model="filters.type"
            :items="typeOptions"
            value-key="value"
            label-key="label"
          />
        </UFormField>

        <UFormField label="Date from">
          <UInput v-model="filters.dateFrom" type="date" />
        </UFormField>

        <UFormField label="Date to">
          <UInput v-model="filters.dateTo" type="date" />
        </UFormField>

        <UFormField label="Order status">
          <USelectMenu
            v-model="filters.orderStatus"
            multiple
            :items="orderStatusOptions"
            value-key="value"
            label-key="label"
          />
        </UFormField>

        <UFormField label="Payment status">
          <USelectMenu
            v-model="filters.paymentStatus"
            multiple
            :items="paymentStatusOptions"
            value-key="value"
            label-key="label"
          />
        </UFormField>

        <UFormField label="Fulfillment">
          <USelectMenu
            v-model="filters.fulfillmentStatus"
            multiple
            :items="fulfillmentStatusOptions"
            value-key="value"
            label-key="label"
          />
        </UFormField>

        <UFormField label="Rental status">
          <USelectMenu
            v-model="filters.rentalStatus"
            multiple
            :items="rentalStatusOptions"
            value-key="value"
            label-key="label"
          />
        </UFormField>

        <UFormField label="Storage branch (rental only)">
          <USelectMenu
            v-model="filters.branchId"
            :items="branchOptions"
            value-key="value"
            label-key="label"
          />
        </UFormField>
      </div>
    </UCard>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="bx:error-circle"
      :title="error"
    />

    <div v-if="loading && items.length === 0" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-32 w-full" />
    </div>

    <div
      v-else-if="items.length === 0"
      class="rounded-2xl border border-dashed border-default p-10 text-center text-sm text-muted"
    >
      No customers match the current filters.
    </div>

    <div v-else class="space-y-3">
      <UCard v-for="card in items" :key="card.customer.userId">
        <div
          class="flex flex-col gap-2 border-b border-default pb-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="space-y-1">
            <p class="font-semibold">
              {{ card.customer.fullName || "(no name)" }}
            </p>
            <p class="text-xs text-muted">
              {{ card.customer.email || "—" }}
              <span v-if="card.customer.phone">
                · {{ card.customer.phone }}</span
              >
            </p>
            <p class="text-xs text-muted">
              User ID: {{ card.customer.userId }}
            </p>
          </div>
          <div class="text-left sm:text-right">
            <p class="text-xs text-muted">Latest activity</p>
            <p class="text-sm font-medium">
              {{ formatDate(card.customer.latestActivityAt) }}
            </p>
            <div class="mt-1 flex flex-wrap gap-1 sm:justify-end">
              <UBadge color="primary" variant="soft" size="sm">
                Sale × {{ card.customer.saleCount }}
              </UBadge>
              <UBadge color="info" variant="soft" size="sm">
                Rental × {{ card.customer.rentalCount }}
              </UBadge>
            </div>
          </div>
        </div>

        <div
          v-if="card.saleOrders.length > 0"
          class="space-y-2 border-b border-default py-3"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">
            Sale orders ({{ card.saleOrders.length }})
          </p>
          <div
            v-for="order in card.saleOrders"
            :key="order.id"
            class="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start sm:justify-between"
            :class="
              isSaleOrderIncomplete(order)
                ? 'border-error/60 bg-error/5'
                : 'border-default'
            "
          >
            <div class="space-y-1">
              <NuxtLink
                :to="`/admin/orders/${order.id}`"
                class="font-medium text-primary hover:underline"
              >
                {{ order.orderNumber }}
              </NuxtLink>
              <p class="text-xs text-muted">
                {{ formatDate(order.createdAt) }} · {{ order.itemCount }} item{{
                  order.itemCount === 1 ? "" : "s"
                }}
              </p>
              <a
                v-if="card.customer.phone"
                :href="`tel:${card.customer.phone}`"
                class="inline-flex items-center gap-1 text-sm font-medium text-default hover:text-primary"
                @click.stop
              >
                <UIcon name="bx:phone" class="text-base" />
                {{ card.customer.phone }}
              </a>
              <div class="flex flex-wrap gap-1 pt-1">
                <UBadge
                  :color="orderStatusColor(order.status)"
                  variant="subtle"
                  size="sm"
                >
                  {{ order.status }}
                </UBadge>
                <UBadge
                  :color="paymentStatusColor(order.paymentStatus)"
                  variant="subtle"
                  size="sm"
                >
                  {{ order.paymentStatus }}
                </UBadge>
                <UBadge
                  :color="fulfillmentStatusColor(order.fulfillmentStatus)"
                  variant="subtle"
                  size="sm"
                >
                  {{ order.fulfillmentStatus }}
                </UBadge>
                <UBadge color="neutral" variant="soft" size="sm">
                  {{ order.checkoutMode }}
                </UBadge>
              </div>
            </div>
            <div
              class="flex flex-col gap-2 sm:items-end sm:justify-between sm:text-right"
            >
              <div>
                <p class="text-sm font-semibold text-primary">
                  {{ formatCurrency(order.grandTotal, order.currencyCode) }}
                </p>
                <p v-if="order.addressTitle" class="text-xs text-muted">
                  {{ order.addressTitle }}
                </p>
              </div>
              <UButton
                size="xs"
                icon="bx:right-arrow-alt"
                trailing
                label="View detail"
                color="primary"
                variant="soft"
                :to="`/admin/orders/${order.id}`"
              />
            </div>
          </div>
        </div>

        <div v-if="card.rentalBookings.length > 0" class="space-y-2 pt-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">
            Rental bookings ({{ card.rentalBookings.length }})
          </p>
          <div
            v-for="booking in card.rentalBookings"
            :key="booking.id"
            class="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start sm:justify-between"
            :class="
              isRentalBookingIncomplete(booking)
                ? 'border-error/60 bg-error/5'
                : 'border-default'
            "
          >
            <div class="space-y-1">
              <NuxtLink
                :to="`/admin/rental-bookings/${booking.id}`"
                class="font-medium text-primary hover:underline"
              >
                {{ booking.assetName || booking.productName }}
              </NuxtLink>
              <p class="text-xs text-muted">
                {{ booking.startDate }} → {{ booking.endDate }} ·
                {{ booking.rentalDays }} day{{
                  booking.rentalDays === 1 ? "" : "s"
                }}
              </p>
              <p class="text-xs text-muted">Booking {{ booking.id }}</p>
              <div class="space-y-0.5">
                <a
                  :href="`tel:${booking.bookerPhone || card.customer.phone}`"
                  class="inline-flex items-center gap-1 text-sm font-medium text-default hover:text-primary"
                  @click.stop
                >
                  <UIcon name="bx:phone" class="text-base" />
                  {{
                    booking.bookerPhone ||
                    card.customer.phone ||
                    "No phone on file"
                  }}
                </a>
                <p
                  v-if="booking.bookerName || booking.bookerPhone"
                  class="text-xs text-muted"
                >
                  Booker:
                  {{ booking.bookerName || "—" }}
                  <template v-if="booking.bookerPhone && card.customer.phone">
                    · Acct: {{ card.customer.phone }}
                  </template>
                </p>
              </div>
              <div class="flex flex-wrap gap-1 pt-1">
                <UBadge
                  :color="rentalStatusColor(booking.status)"
                  variant="subtle"
                  size="sm"
                >
                  {{ booking.status }}
                </UBadge>
                <UBadge
                  v-if="booking.storageBranchName"
                  color="neutral"
                  variant="soft"
                  size="sm"
                >
                  {{ booking.storageBranchName }}
                </UBadge>
                <UBadge
                  v-if="booking.hubName"
                  color="info"
                  variant="soft"
                  size="sm"
                >
                  Pickup: {{ booking.hubName }}
                </UBadge>
              </div>
            </div>
            <div
              class="flex flex-col gap-2 sm:items-end sm:justify-between sm:text-right"
            >
              <div>
                <p class="text-sm font-semibold text-primary">
                  {{
                    formatCurrency(booking.rentalTotal, booking.currencyCode)
                  }}
                </p>
                <p class="text-xs text-muted">
                  Deposit:
                  {{
                    formatCurrency(booking.depositAmount, booking.currencyCode)
                  }}
                </p>
              </div>
              <UButton
                size="xs"
                icon="bx:right-arrow-alt"
                trailing
                label="View detail"
                color="primary"
                variant="soft"
                :to="`/admin/rental-bookings/${booking.id}`"
              />
            </div>
          </div>
        </div>
      </UCard>

      <div class="flex items-center justify-between pt-2">
        <p class="text-xs text-muted">
          Showing {{ items.length }} of {{ total }} customers
        </p>
        <UButton
          v-if="hasMore"
          label="Load more"
          color="neutral"
          variant="soft"
          :loading="loadingMore"
          @click="loadMore()"
        />
      </div>
    </div>

    <AdminOrderQrScanner
      v-model:open="isScannerOpen"
      @decoded="handleDecoded"
    />
  </div>
</template>
