<script setup lang="ts">
import AdminOrderQrScanner from "~/components/admin/AdminOrderQrScanner.vue";
import type {
  AdminSaleOrderQueueRow,
  AdminSaleOrderQueueView,
} from "~/types/admin-order";
import type {
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
} from "~/types/order";

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
type SummaryKey =
  | "actionRequired"
  | "delivery"
  | "pickup"
  | "awaitingPayment"
  | "all";

const router = useRouter();
const toast = useToast();
const isScannerOpen = ref(false);
const {
  filters,
  items,
  summary,
  total,
  page,
  pageSize,
  hasMore,
  loading,
  error,
  refresh,
  goToPage,
  resetFilters,
} = useAdminOrderQueue();

const queueCards: Array<{
  value: AdminSaleOrderQueueView;
  label: string;
  helper: string;
  summaryKey: SummaryKey;
  icon: string;
}> = [
  {
    value: "action_required",
    label: "ต้องจัดการ",
    helper: "ชำระแล้วและยังต้องเตรียมส่งมอบ",
    summaryKey: "actionRequired",
    icon: "bx:task",
  },
  {
    value: "delivery",
    label: "ต้องจัดส่ง",
    helper: "คำสั่งซื้อที่ต้องจัดส่งให้ลูกค้า",
    summaryKey: "delivery",
    icon: "bx:package",
  },
  {
    value: "pickup",
    label: "ลูกค้ารับเอง",
    helper: "คำสั่งซื้อที่เตรียมรับที่สาขา",
    summaryKey: "pickup",
    icon: "bx:store",
  },
  {
    value: "awaiting_payment",
    label: "รอชำระ",
    helper: "รอชำระเงินหรือตรวจสอบยอด",
    summaryKey: "awaitingPayment",
    icon: "bx:credit-card",
  },
  {
    value: "all",
    label: "ทั้งหมด",
    helper: "คำสั่งซื้อขายทั้งหมดตามตัวกรอง",
    summaryKey: "all",
    icon: "bx:list-ul",
  },
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
  { value: "ready_for_carrier_pickup", label: "Ready for carrier pickup" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "returned", label: "Returned" },
  { value: "cancelled", label: "Cancelled" },
];

const activeQueue = computed(() => filters.queue ?? "action_required");
const visibleRangeStart = computed(() =>
  total.value === 0 ? 0 : page.value * pageSize.value + 1,
);
const visibleRangeEnd = computed(() =>
  Math.min(total.value, page.value * pageSize.value + items.value.length),
);

function setQueue(queue: AdminSaleOrderQueueView): void {
  filters.queue = queue;
}

function summaryCount(card: { summaryKey: SummaryKey }): number {
  return summary.value[card.summaryKey];
}

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

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function emptyStateMessage(): string {
  if (activeQueue.value === "delivery") return "ไม่มีคำสั่งซื้อที่ต้องจัดส่ง";
  if (activeQueue.value === "pickup") return "ไม่มีคำสั่งซื้อที่ลูกค้ารับเอง";
  if (activeQueue.value === "awaiting_payment") return "ไม่มีคำสั่งซื้อรอชำระ";
  if (activeQueue.value === "all") return "ไม่พบคำสั่งซื้อที่ตรงกับตัวกรอง";
  return "ไม่มีคำสั่งซื้อที่ต้องจัดการ";
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

function fulfillmentColor(order: AdminSaleOrderQueueRow): BadgeColor {
  if (order.fulfillmentMethod === "delivery") return "primary";
  if (order.fulfillmentMethod === "pickup") return "info";
  return "warning";
}

function fulfillmentLabel(order: AdminSaleOrderQueueRow): string {
  if (order.fulfillmentMethod === "delivery") return "Delivery";
  if (order.fulfillmentMethod === "pickup") return "รับเอง";
  return "วิธีส่งมอบไม่ระบุ";
}

function fulfillmentDetail(order: AdminSaleOrderQueueRow): string {
  if (order.fulfillmentMethod === "delivery") {
    return order.addressTitle || "ไม่มีชื่อที่อยู่";
  }
  if (order.fulfillmentMethod === "pickup") {
    return order.pickupBranch?.name || "ยังไม่ระบุสาขา";
  }
  return "Legacy / ตรวจสอบข้อมูลคำสั่งซื้อ";
}

function handleDecoded(payload: {
  raw: string;
  kind: string;
  value: string;
}): void {
  if (payload.kind === "order") {
    const target = items.value.find(
      (order) => order.orderNumber === payload.value,
    );
    if (target) {
      void router.push(`/admin/orders/${target.id}`);
      return;
    }
    filters.search = payload.value;
    toast.add({
      title: "Order not in current page",
      description: `Searching for ${payload.value}…`,
      color: "info",
    });
    return;
  }
  filters.search = payload.kind === "customer" ? payload.value : payload.raw;
  toast.add({
    title: "QR scanned",
    description: "Searching sale order queue…",
    color: "info",
  });
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">คำสั่งซื้อ</h2>
        <p class="text-sm text-muted">
          ติดตามคำสั่งซื้อที่ต้องชำระ จัดส่ง หรือเตรียมให้ลูกค้ารับสินค้า
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

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <button
        v-for="card in queueCards"
        :key="card.value"
        type="button"
        class="rounded-2xl border p-4 text-left transition hover:border-primary hover:bg-primary/5"
        :class="
          activeQueue === card.value
            ? 'border-primary bg-primary/10 shadow-sm'
            : 'border-default bg-default'
        "
        @click="setQueue(card.value)"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold">{{ card.label }}</p>
            <p class="mt-1 text-xs text-muted">{{ card.helper }}</p>
          </div>
          <UIcon :name="card.icon" class="text-xl text-primary" />
        </div>
        <p class="mt-4 text-3xl font-bold tabular-nums">
          {{ summaryCount(card) }}
        </p>
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="tab in queueCards"
        :key="`tab-${tab.value}`"
        size="sm"
        color="primary"
        :variant="activeQueue === tab.value ? 'solid' : 'soft'"
        @click="setQueue(tab.value)"
      >
        {{ tab.label }}
      </UButton>
    </div>

    <UCard>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <UFormField label="Search">
          <UInput
            v-model="filters.search"
            placeholder="Order #, customer, phone…"
            icon="bx:search"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Date from">
          <UInput v-model="filters.dateFrom" class="w-full" type="date" />
        </UFormField>
        <UFormField label="Date to">
          <UInput v-model="filters.dateTo" class="w-full" type="date" />
        </UFormField>
        <UFormField label="Order status">
          <USelectMenu
            v-model="filters.orderStatus"
            multiple
            :items="orderStatusOptions"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Payment status">
          <USelectMenu
            v-model="filters.paymentStatus"
            multiple
            :items="paymentStatusOptions"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Fulfillment status">
          <USelectMenu
            v-model="filters.fulfillmentStatus"
            multiple
            :items="fulfillmentStatusOptions"
            value-key="value"
            label-key="label"
            class="w-full"
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
    >
      <template #actions>
        <UButton
          label="Retry"
          size="xs"
          color="error"
          variant="soft"
          @click="refresh()"
        />
      </template>
    </UAlert>

    <div v-if="loading && items.length === 0" class="space-y-3">
      <USkeleton v-for="i in 5" :key="i" class="h-20 w-full" />
    </div>

    <div
      v-else-if="items.length === 0"
      class="rounded-2xl border border-dashed border-default p-10 text-center text-sm text-muted"
    >
      {{ emptyStateMessage() }}
    </div>

    <UCard v-else>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="font-semibold">Sale Order Operations Queue</p>
            <p class="text-xs text-muted">
              Showing {{ visibleRangeStart }}–{{ visibleRangeEnd }} of
              {{ total }} orders
            </p>
          </div>
          <UBadge v-if="loading" color="primary" variant="soft">
            Updating…
          </UBadge>
        </div>
      </template>

      <div class="hidden md:block">
        <div
          class="grid grid-cols-[1.1fr_1.1fr_1.3fr_1.1fr_0.9fr] gap-4 border-b border-default pb-2 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          <span>Order</span>
          <span>Customer</span>
          <span>Fulfillment</span>
          <span>Status</span>
          <span class="text-right">Amount</span>
        </div>
        <div
          class="max-h-[calc(100vh-28rem)] min-h-72 overflow-y-auto divide-y divide-default"
        >
          <div
            v-for="order in items"
            :key="order.id"
            class="grid grid-cols-[1.1fr_1.1fr_1.3fr_1.1fr_0.9fr] gap-4 py-3 text-sm"
          >
            <div class="space-y-1">
              <NuxtLink
                :to="`/admin/orders/${order.id}`"
                class="font-semibold text-primary hover:underline"
              >
                {{ order.orderNumber }}
              </NuxtLink>
              <p class="text-xs text-muted">
                {{ formatDate(order.createdAt) }} · {{ order.itemCount }} item{{
                  order.itemCount === 1 ? "" : "s"
                }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="font-medium">
                {{ order.customer.name || "(no name)" }}
              </p>
              <a
                v-if="order.customer.phone"
                :href="`tel:${order.customer.phone}`"
                class="inline-flex items-center gap-1 text-xs text-muted hover:text-primary"
              >
                <UIcon name="bx:phone" />{{ order.customer.phone }}
              </a>
              <p v-else class="text-xs text-muted">No phone</p>
            </div>
            <div class="space-y-1">
              <UBadge :color="fulfillmentColor(order)" variant="soft" size="sm">
                {{ fulfillmentLabel(order) }}
              </UBadge>
              <p class="line-clamp-2 text-xs text-muted">
                {{ fulfillmentDetail(order) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-1 self-start">
              <UBadge
                :color="paymentStatusColor(order.paymentStatus)"
                variant="subtle"
                size="sm"
              >
                {{ statusLabel(order.paymentStatus) }}
              </UBadge>
              <UBadge
                :color="fulfillmentStatusColor(order.fulfillmentStatus)"
                variant="subtle"
                size="sm"
              >
                {{ statusLabel(order.fulfillmentStatus) }}
              </UBadge>
              <UBadge
                :color="orderStatusColor(order.orderStatus)"
                variant="soft"
                size="sm"
              >
                {{ statusLabel(order.orderStatus) }}
              </UBadge>
            </div>
            <div class="space-y-2 text-right">
              <p class="font-semibold text-primary">
                {{ formatCurrency(order.grandTotal, order.currencyCode) }}
              </p>
              <UButton
                size="xs"
                icon="bx:right-arrow-alt"
                trailing
                label="ดูรายละเอียด"
                color="primary"
                variant="soft"
                :to="`/admin/orders/${order.id}`"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-3 md:hidden">
        <div
          v-for="order in items"
          :key="`mobile-${order.id}`"
          class="rounded-2xl border border-default p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <NuxtLink
                :to="`/admin/orders/${order.id}`"
                class="font-semibold text-primary hover:underline"
              >
                {{ order.orderNumber }}
              </NuxtLink>
              <p class="text-xs text-muted">
                {{ formatDate(order.createdAt) }}
              </p>
            </div>
            <p class="text-right text-sm font-semibold text-primary">
              {{ formatCurrency(order.grandTotal, order.currencyCode) }}
            </p>
          </div>
          <div class="mt-2 space-y-1 text-sm">
            <p>{{ order.customer.name || "(no name)" }}</p>
            <a
              v-if="order.customer.phone"
              :href="`tel:${order.customer.phone}`"
              class="inline-flex items-center gap-1 text-xs text-muted hover:text-primary"
            >
              <UIcon name="bx:phone" />{{ order.customer.phone }}
            </a>
          </div>
          <div class="mt-3 flex flex-wrap gap-1">
            <UBadge
              :color="paymentStatusColor(order.paymentStatus)"
              variant="subtle"
              size="sm"
            >
              {{ statusLabel(order.paymentStatus) }}
            </UBadge>
            <UBadge
              :color="fulfillmentStatusColor(order.fulfillmentStatus)"
              variant="subtle"
              size="sm"
            >
              {{ statusLabel(order.fulfillmentStatus) }}
            </UBadge>
            <UBadge :color="fulfillmentColor(order)" variant="soft" size="sm">
              {{ fulfillmentLabel(order) }}
            </UBadge>
          </div>
          <p class="mt-2 text-xs text-muted">{{ fulfillmentDetail(order) }}</p>
          <UButton
            class="mt-3"
            block
            size="xs"
            label="ดูรายละเอียด"
            color="primary"
            variant="soft"
            :to="`/admin/orders/${order.id}`"
          />
        </div>
      </div>

      <div
        class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-default pt-3"
      >
        <p class="text-xs text-muted">
          Page {{ page + 1 }} · {{ pageSize }} orders per page
        </p>
        <div class="flex gap-2">
          <UButton
            size="sm"
            label="Previous"
            color="neutral"
            variant="soft"
            :disabled="page === 0 || loading"
            @click="goToPage(page - 1)"
          />
          <UButton
            size="sm"
            label="Next"
            color="neutral"
            variant="soft"
            :disabled="!hasMore || loading"
            @click="goToPage(page + 1)"
          />
        </div>
      </div>
    </UCard>

    <AdminOrderQrScanner
      v-model:open="isScannerOpen"
      @decoded="handleDecoded"
    />
  </div>
</template>
