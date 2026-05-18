<script setup lang="ts">
import type { AdminSaleOrderQueueRow } from "~/types/admin-order";
import type { AdminSaleOrderDetail } from "~/types/admin-order-detail";

const props = defineProps<{
  queueRow: AdminSaleOrderQueueRow | null;
  detail: AdminSaleOrderDetail | null;
  loading?: boolean;
  error?: string | null;
}>();

const orderNumber = computed(
  () => props.detail?.orderNumber || props.queueRow?.orderNumber || "—",
);
const orderId = computed(() => props.detail?.id || props.queueRow?.id || "");
const customerName = computed(
  () => props.detail?.customer?.fullName || props.queueRow?.customer.name || "—",
);
const customerPhone = computed(
  () => props.detail?.customer?.phone || props.queueRow?.customer.phone || "—",
);
const paymentStatus = computed(
  () => props.detail?.paymentStatus || props.queueRow?.paymentStatus || "—",
);
const fulfillmentStatus = computed(
  () => props.detail?.fulfillmentStatus || props.queueRow?.fulfillmentStatus || "—",
);
const itemCount = computed(
  () => props.detail?.items.length ?? props.queueRow?.itemCount ?? 0,
);
const amount = computed(
  () => props.detail?.grandTotal ?? props.queueRow?.grandTotal ?? 0,
);

function money(value: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Order Context</h2>
          <p class="text-sm text-muted">Resolved pickup order handoff for later fulfillment workflow.</p>
        </div>
        <UBadge color="info" variant="soft">Pickup order</UBadge>
      </div>
    </template>

    <UProgress v-if="loading" animation="carousel" />
    <UAlert v-if="error" color="warning" variant="soft" :title="error" />

    <div v-if="queueRow || detail" class="space-y-4">
      <div class="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div><p class="text-muted">Order</p><p class="font-semibold">{{ orderNumber }}</p></div>
        <div><p class="text-muted">Customer</p><p class="font-semibold">{{ customerName }} · {{ customerPhone }}</p></div>
        <div><p class="text-muted">Payment</p><p class="font-semibold">{{ paymentStatus }}</p></div>
        <div><p class="text-muted">Fulfillment</p><p class="font-semibold">{{ fulfillmentStatus }}</p></div>
      </div>

      <p class="text-sm text-muted">
        ID: {{ orderId || '—' }} · Method: {{ queueRow?.fulfillmentMethod || 'pickup context' }} ·
        Branch: {{ queueRow?.pickupBranch?.name || '—' }} · Items: {{ itemCount }} ·
        Amount: {{ money(amount, detail?.currencyCode || queueRow?.currencyCode || 'THB') }}
      </p>
      <UAlert
        color="neutral"
        variant="soft"
        title="Phase 1 handoff only"
        description="Order fulfillment, payment mutation, and document workflows are intentionally not implemented here."
      />
      <UButton v-if="orderId" :to="`/admin/orders/${orderId}`" icon="bx:detail" variant="soft">
        Open existing order detail
      </UButton>
    </div>
  </UCard>
</template>