<script setup lang="ts">
import type {
  AdminPaymentAlertSeverity,
  AdminSaleOrderDetail,
  AdminSaleOrderPatchPayload,
} from "~/types/admin-order-detail";
import type {
  OrderFulfillmentStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
} from "~/types/order";
import {
  ORDER_FULFILLMENT_STATUS_TRANSITIONS,
  ORDER_PAYMENT_STATUS_TRANSITIONS,
  ORDER_STATUS_TRANSITIONS,
} from "~/utils/admin-order-transitions";

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

const route = useRoute();
const toast = useToast();
const orderId = computed(() => String(route.params.id ?? ""));
const { profile } = useUserProfile();
const isSuperAdmin = computed(
  () => profile.value?.platformRole === "super_admin",
);

const order = ref<AdminSaleOrderDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const updating = ref(false);

async function load(): Promise<void> {
  if (!orderId.value) return;
  loading.value = true;
  error.value = null;
  try {
    order.value = await $fetch<AdminSaleOrderDetail>(
      `/api/admin/orders/${orderId.value}`,
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load order";
  } finally {
    loading.value = false;
  }
}

async function applyPatch(patch: AdminSaleOrderPatchPayload): Promise<void> {
  if (!orderId.value) return;
  updating.value = true;
  try {
    order.value = await $fetch<AdminSaleOrderDetail>(
      `/api/admin/orders/${orderId.value}`,
      { method: "PATCH", body: patch },
    );
    toast.add({ title: "Order updated", color: "success" });
  } catch (e) {
    toast.add({
      title: "Update failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    updating.value = false;
  }
}

if (import.meta.client) {
  onMounted(() => void load());
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

function paymentMethodLabel(method: OrderPaymentMethod | null): string {
  if (!method) return "—";
  if (method === "credit_card") return "Credit card";
  if (method === "promptpay") return "PromptPay";
  return "Company credit";
}

// ── Badge colors (mirror /admin/orders list page) ──
function orderStatusColor(s: OrderStatus): BadgeColor {
  if (s === "submitted") return "info";
  if (s === "confirmed") return "primary";
  if (s === "completed") return "success";
  return "error";
}
function paymentStatusColor(s: OrderPaymentStatus): BadgeColor {
  if (s === "paid") return "success";
  if (s === "awaiting_payment") return "warning";
  if (s === "pending_review") return "info";
  if (s === "refunded" || s === "not_applicable") return "neutral";
  if (s === "deferred") return "primary";
  return "error";
}
function fulfillmentStatusColor(s: OrderFulfillmentStatus): BadgeColor {
  if (s === "delivered") return "success";
  if (s === "shipped" || s === "ready_for_carrier_pickup") return "primary";
  if (s === "preparing") return "info";
  if (s === "unfulfilled" || s === "returned") return "warning";
  if (s === "cancelled") return "error";
  return "neutral";
}

// ── Allowed transitions for the current row ──
const allowedOrderStatuses = computed<OrderStatus[]>(() =>
  order.value
    ? (ORDER_STATUS_TRANSITIONS[order.value.status] ?? []).filter(
        (status) => isSuperAdmin.value || status !== "cancelled",
      )
    : [],
);
const allowedPaymentStatuses = computed<OrderPaymentStatus[]>(() =>
  order.value && isSuperAdmin.value
    ? (ORDER_PAYMENT_STATUS_TRANSITIONS[order.value.paymentStatus] ?? [])
    : [],
);
const allowedFulfillmentStatuses = computed<OrderFulfillmentStatus[]>(() =>
  order.value
    ? (ORDER_FULFILLMENT_STATUS_TRANSITIONS[order.value.fulfillmentStatus] ??
      [])
    : [],
);

// ── Fulfillment transition modal (with optional tracking input) ──
const fulfillmentModalOpen = ref(false);
const fulfillmentModalTarget = ref<OrderFulfillmentStatus | null>(null);
const trackingForm = reactive({
  carrier: "",
  number: "",
  note: "",
});

function openFulfillmentModal(next: OrderFulfillmentStatus): void {
  fulfillmentModalTarget.value = next;
  trackingForm.carrier = order.value?.trackingCarrier ?? "";
  trackingForm.number = order.value?.trackingNumber ?? "";
  trackingForm.note = order.value?.trackingNote ?? "";
  fulfillmentModalOpen.value = true;
}

async function confirmFulfillmentChange(): Promise<void> {
  if (!fulfillmentModalTarget.value) return;
  const patch: AdminSaleOrderPatchPayload = {
    fulfillmentStatus: fulfillmentModalTarget.value,
  };
  if (
    fulfillmentModalTarget.value === "shipped" ||
    trackingForm.carrier.trim() ||
    trackingForm.number.trim() ||
    trackingForm.note.trim()
  ) {
    patch.trackingCarrier = trackingForm.carrier.trim() || null;
    patch.trackingNumber = trackingForm.number.trim() || null;
    patch.trackingNote = trackingForm.note.trim() || null;
  }
  await applyPatch(patch);
  fulfillmentModalOpen.value = false;
  fulfillmentModalTarget.value = null;
}

// ── Standalone tracking save (always-visible editor) ──
const trackingEdit = reactive({
  carrier: "",
  number: "",
  note: "",
});
const trackingDirty = ref(false);

watch(
  () => order.value,
  (o) => {
    if (!o) return;
    trackingEdit.carrier = o.trackingCarrier ?? "";
    trackingEdit.number = o.trackingNumber ?? "";
    trackingEdit.note = o.trackingNote ?? "";
    trackingDirty.value = false;
  },
  { immediate: true },
);

function markTrackingDirty(): void {
  trackingDirty.value = true;
}

async function saveTracking(): Promise<void> {
  await applyPatch({
    trackingCarrier: trackingEdit.carrier.trim() || null,
    trackingNumber: trackingEdit.number.trim() || null,
    trackingNote: trackingEdit.note.trim() || null,
  });
  trackingDirty.value = false;
}

function formatShippedAt(): string {
  if (!order.value?.shippedAt) return "—";
  return formatDate(order.value.shippedAt);
}

// ── Alerts ──
const applyingInventory = ref(false);
const resolvingAlertId = ref<string | null>(null);

const alertSeverityColor: Record<AdminPaymentAlertSeverity, BadgeColor> = {
  info: "neutral",
  warning: "warning",
  error: "error",
  critical: "error",
};

const openAlerts = computed(() =>
  (order.value?.alerts ?? []).filter((a) => !a.resolvedAt),
);
const resolvedAlerts = computed(() =>
  (order.value?.alerts ?? []).filter((a) => a.resolvedAt),
);
const hasInventoryFailure = computed(() =>
  openAlerts.value.some((a) => a.kind === "inventory_apply_failed"),
);

async function handleApplyInventory(): Promise<void> {
  if (!orderId.value) return;
  applyingInventory.value = true;
  try {
    order.value = await $fetch<AdminSaleOrderDetail>(
      `/api/admin/orders/${orderId.value}/apply-inventory`,
      { method: "POST" },
    );
    toast.add({ title: "Inventory applied", color: "success" });
  } catch (e) {
    toast.add({
      title: "Apply inventory failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    applyingInventory.value = false;
  }
}

async function handleResolveAlert(id: string): Promise<void> {
  resolvingAlertId.value = id;
  try {
    await $fetch(`/api/admin/payment-alerts/${id}/resolve`, {
      method: "POST",
    });
    await load();
    toast.add({ title: "Alert resolved", color: "success" });
  } catch (e) {
    toast.add({
      title: "Failed to resolve alert",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    resolvingAlertId.value = null;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="space-y-1">
        <h2 class="text-xl font-semibold">
          {{ order?.orderNumber || "Sale order detail" }}
        </h2>
        <p class="text-sm text-muted">Order ID: {{ orderId }}</p>
      </div>
      <UButton
        icon="bx:arrow-back"
        label="Back to orders"
        color="neutral"
        variant="ghost"
        to="/admin/orders"
      />
    </div>

    <div v-if="loading" class="space-y-3">
      <div class="h-24 animate-pulse rounded-xl bg-elevated" />
      <div class="h-40 animate-pulse rounded-xl bg-elevated" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="bx:error-circle"
      title="Failed to load"
      :description="error"
    >
      <template #actions>
        <UButton size="sm" label="Retry" @click="void load()" />
      </template>
    </UAlert>

    <template v-else-if="order">
      <!-- Status + transitions -->
      <UCard>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="orderStatusColor(order.status)" variant="subtle">
              Order: {{ order.status }}
            </UBadge>
            <UBadge
              :color="paymentStatusColor(order.paymentStatus)"
              variant="subtle"
            >
              Payment: {{ order.paymentStatus }}
            </UBadge>
            <UBadge
              :color="fulfillmentStatusColor(order.fulfillmentStatus)"
              variant="subtle"
            >
              Fulfillment: {{ order.fulfillmentStatus }}
            </UBadge>
            <UBadge color="neutral" variant="soft">
              {{ order.checkoutMode }}
            </UBadge>
            <UBadge v-if="order.paymentMethod" color="neutral" variant="soft">
              {{ paymentMethodLabel(order.paymentMethod) }}
            </UBadge>
          </div>

          <div class="space-y-3">
            <div v-if="allowedOrderStatuses.length > 0">
              <p class="mb-1 text-xs font-semibold uppercase text-muted">
                Order status
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="next in allowedOrderStatuses"
                  :key="`os-${next}`"
                  size="sm"
                  variant="soft"
                  :color="orderStatusColor(next)"
                  :loading="updating"
                  @click="void applyPatch({ status: next })"
                >
                  → {{ next }}
                </UButton>
              </div>
            </div>

            <div v-if="allowedPaymentStatuses.length > 0">
              <p class="mb-1 text-xs font-semibold uppercase text-muted">
                Payment status
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="next in allowedPaymentStatuses"
                  :key="`ps-${next}`"
                  size="sm"
                  variant="soft"
                  :color="paymentStatusColor(next)"
                  :loading="updating"
                  @click="void applyPatch({ paymentStatus: next })"
                >
                  → {{ next }}
                </UButton>
              </div>
            </div>
            <p v-else-if="!isSuperAdmin" class="text-xs text-muted">
              Payment status changes are restricted to Super Admin.
            </p>

            <div v-if="allowedFulfillmentStatuses.length > 0">
              <p class="mb-1 text-xs font-semibold uppercase text-muted">
                Fulfillment status
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="next in allowedFulfillmentStatuses"
                  :key="`fs-${next}`"
                  size="sm"
                  variant="soft"
                  :color="fulfillmentStatusColor(next)"
                  :loading="updating"
                  @click="openFulfillmentModal(next)"
                >
                  → {{ next }}
                </UButton>
              </div>
              <p class="mt-1 text-xs text-muted">
                Click a status to open the tracking-note dialog.
              </p>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Admin alerts -->
      <UCard
        v-if="openAlerts.length > 0 || hasInventoryFailure"
        :ui="{ base: 'border-error-300' }"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-error">
              Action required ({{ openAlerts.length }})
            </h3>
            <UButton
              v-if="hasInventoryFailure && isSuperAdmin"
              color="primary"
              size="sm"
              :loading="applyingInventory"
              icon="bx:refresh"
              @click="handleApplyInventory"
            >
              Apply inventory now
            </UButton>
          </div>
        </template>
        <ul class="space-y-2">
          <li
            v-for="alert in openAlerts"
            :key="alert.id"
            class="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-default bg-elevated/40 p-3"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :color="alertSeverityColor[alert.severity]"
                  variant="soft"
                  size="sm"
                >
                  {{ alert.severity }}
                </UBadge>
                <UBadge color="neutral" variant="outline" size="sm">
                  {{ alert.kind }}
                </UBadge>
              </div>
              <p class="mt-1 text-sm">{{ alert.message }}</p>
              <p class="text-xs text-muted">
                {{ formatDate(alert.createdAt) }}
              </p>
            </div>
            <UButton
              color="success"
              variant="soft"
              size="xs"
              :loading="resolvingAlertId === alert.id"
              @click="handleResolveAlert(alert.id)"
            >
              Mark resolved
            </UButton>
          </li>
        </ul>
        <p v-if="resolvedAlerts.length > 0" class="mt-3 text-xs text-muted">
          {{ resolvedAlerts.length }} resolved alert(s) on this order.
        </p>
      </UCard>

      <!-- Manual apply-inventory shortcut for paid orders without alerts -->
      <UCard
        v-else-if="
          isSuperAdmin &&
          order.paymentStatus === 'paid' &&
          order.fulfillmentStatus !== 'shipped'
        "
        class="border-primary-200"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">Inventory</h3>
            <p class="text-xs text-muted">
              Re-run the deduction RPC if you suspect stock was missed.
            </p>
          </div>
          <UButton
            color="primary"
            variant="soft"
            size="sm"
            :loading="applyingInventory"
            icon="bx:refresh"
            @click="handleApplyInventory"
          >
            Apply inventory
          </UButton>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Customer -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Customer</h3>
          </template>
          <div class="space-y-2 text-sm">
            <p class="font-medium">
              {{ order.customer.fullName || "Unnamed customer" }}
            </p>
            <a
              v-if="order.customer.phone"
              :href="`tel:${order.customer.phone}`"
              class="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <UIcon name="bx:phone" />
              {{ order.customer.phone }}
            </a>
            <p v-else class="text-muted">No phone on file</p>
            <p class="text-xs text-muted">
              User ID:
              <span class="font-mono">{{ order.customer.userId }}</span>
            </p>
          </div>
        </UCard>

        <!-- Address snapshot -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Delivery address</h3>
          </template>
          <div class="space-y-1 text-sm">
            <p v-if="order.addressSnapshot.title" class="font-medium">
              {{ order.addressSnapshot.title }}
            </p>
            <p v-if="order.addressSnapshot.contactName">
              {{ order.addressSnapshot.contactName }}
              <span
                v-if="order.addressSnapshot.contactPhone"
                class="text-muted"
              >
                · {{ order.addressSnapshot.contactPhone }}
              </span>
            </p>
            <p v-if="order.addressSnapshot.fullAddress" class="text-muted">
              {{ order.addressSnapshot.fullAddress }}
            </p>
            <p v-if="order.addressSnapshot.subDistrict" class="text-muted">
              {{ order.addressSnapshot.subDistrict }}
              <span v-if="order.addressSnapshot.district">
                , {{ order.addressSnapshot.district }}
              </span>
              <span v-if="order.addressSnapshot.province">
                , {{ order.addressSnapshot.province }}
              </span>
              <span v-if="order.addressSnapshot.postalCode">
                {{ order.addressSnapshot.postalCode }}
              </span>
            </p>
            <p v-if="order.addressSnapshot.note" class="text-xs text-muted">
              Note: {{ order.addressSnapshot.note }}
            </p>
            <p
              v-if="!order.addressSnapshot.fullAddress"
              class="text-xs italic text-muted"
            >
              No address snapshot.
            </p>
          </div>
        </UCard>
      </div>

      <!-- Tracking -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Shipment tracking</h3>
            <p class="text-xs text-muted">
              Shipped at: {{ formatShippedAt() }}
            </p>
          </div>
        </template>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Carrier" hint="e.g. Kerry, Flash, Thailand Post">
            <UInput
              v-model="trackingEdit.carrier"
              class="w-full"
              placeholder="Carrier name"
              @update:model-value="markTrackingDirty"
            />
          </UFormField>
          <UFormField label="Tracking number">
            <UInput
              v-model="trackingEdit.number"
              class="w-full"
              placeholder="Tracking / consignment no."
              @update:model-value="markTrackingDirty"
            />
          </UFormField>
        </div>
        <UFormField
          label="Note to customer"
          class="mt-3"
          hint="Visible on the customer's order page."
        >
          <UTextarea
            v-model="trackingEdit.note"
            class="w-full"
            :rows="2"
            placeholder="Optional notes about the shipment"
            @update:model-value="markTrackingDirty"
          />
        </UFormField>
        <div class="mt-3 flex justify-end">
          <UButton
            label="Save tracking"
            icon="bx:save"
            :loading="updating"
            :disabled="!trackingDirty"
            @click="void saveTracking()"
          />
        </div>
      </UCard>

      <!-- Line items -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Line items ({{ order.items.length }})</h3>
            <p class="text-xs text-muted">
              Created {{ formatDate(order.createdAt) }} · Updated
              {{ formatDate(order.updatedAt) }}
            </p>
          </div>
        </template>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-default text-xs uppercase text-muted">
              <tr>
                <th class="py-2">Item</th>
                <th class="py-2 text-right">Unit</th>
                <th class="py-2 text-right">Qty</th>
                <th class="py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in order.items"
                :key="item.id"
                class="border-b border-default/40 last:border-b-0"
              >
                <td class="py-3 pr-3">
                  <p class="font-medium">{{ item.name }}</p>
                  <p class="text-xs text-muted">
                    SKU: <span class="font-mono">{{ item.skuId }}</span>
                  </p>
                </td>
                <td class="py-3 text-right">
                  <p>
                    {{ formatCurrency(item.unitPrice, order.currencyCode) }}
                  </p>
                  <p
                    v-if="
                      item.originalUnitPrice !== null &&
                      item.originalUnitPrice > item.unitPrice
                    "
                    class="text-xs text-muted line-through"
                  >
                    {{
                      formatCurrency(item.originalUnitPrice, order.currencyCode)
                    }}
                  </p>
                </td>
                <td class="py-3 text-right">×{{ item.quantity }}</td>
                <td class="py-3 text-right font-medium">
                  {{ formatCurrency(item.lineTotal, order.currencyCode) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Totals breakdown -->
        <div class="mt-4 space-y-1 border-t border-default pt-4 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">Subtotal</span>
            <span>{{
              formatCurrency(order.subtotal, order.currencyCode)
            }}</span>
          </div>
          <div v-if="order.discountTotal > 0" class="flex justify-between">
            <span class="text-muted">Discount</span>
            <span class="text-success">
              −{{ formatCurrency(order.discountTotal, order.currencyCode) }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Shipping</span>
            <span>
              {{ formatCurrency(order.shippingCost, order.currencyCode) }}
            </span>
          </div>
          <div
            class="flex justify-between border-t border-default pt-2 text-base font-semibold"
          >
            <span>Grand total</span>
            <span class="text-primary">
              {{ formatCurrency(order.grandTotal, order.currencyCode) }}
            </span>
          </div>
        </div>

        <div v-if="order.notes" class="mt-4 rounded-lg bg-elevated p-3 text-sm">
          <p class="mb-1 text-xs font-semibold uppercase text-muted">Notes</p>
          <p>{{ order.notes }}</p>
        </div>
      </UCard>
    </template>

    <UModal v-model:open="fulfillmentModalOpen" title="Change fulfillment">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm">
            Move fulfillment to
            <span class="font-semibold">{{ fulfillmentModalTarget }}</span
            >. Fill in tracking details that the customer should see on their
            order page.
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Carrier">
              <UInput
                v-model="trackingForm.carrier"
                class="w-full"
                placeholder="e.g. Kerry"
              />
            </UFormField>
            <UFormField label="Tracking number">
              <UInput
                v-model="trackingForm.number"
                class="w-full"
                placeholder="Carrier consignment no."
              />
            </UFormField>
          </div>
          <UFormField label="Note to customer">
            <UTextarea
              v-model="trackingForm.note"
              class="w-full"
              :rows="2"
              placeholder="Optional message"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="updating"
            @click="fulfillmentModalOpen = false"
          />
          <UButton
            :label="`Confirm → ${fulfillmentModalTarget}`"
            color="primary"
            :loading="updating"
            @click="void confirmFulfillmentChange()"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
