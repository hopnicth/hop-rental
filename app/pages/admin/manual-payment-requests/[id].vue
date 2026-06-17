<script setup lang="ts">
/**
 * Admin manual payment request detail.
 *
 * Shows the customer, status, total, source type, allocation table, related
 * order/booking links, and slip evidence (view via short-lived signed URL).
 * Admin can mark the EVIDENCE reviewed or rejected — this does NOT mark the sale
 * order paid or confirm the booking. Admin still confirms each target through the
 * existing admin actions (Mark Payment Received / Mark Deposit Received).
 *
 * Admin pages follow the existing non-i18n convention (hardcoded English).
 */
definePageMeta({ middleware: "role", layout: "admin" });

const route = useRoute();
const toast = useToast();
const id = computed(() => String(route.params.id || ""));

interface Slip {
  id: string;
  originalFilename: string | null;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  uploadedAt: string;
}
interface Detail {
  paymentRequest: {
    id: string;
    sourceType: string;
    status: string;
    currency: string;
    totalAmountDue: number;
    createdAt: string;
    adminNote: string | null;
    rejectedReason: string | null;
  };
  items: {
    id: string;
    targetType: string;
    targetId: string;
    amountDue: number;
    label: string;
  }[];
  slips: Slip[];
  saleOrders: { id: string; orderNumber: string; grandTotal: number }[];
  bookings: { id: string; itemName: string; startDate: string }[];
  customer: { id: string; fullName: string | null; phone: string | null } | null;
}

const detail = ref<Detail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const adminNote = ref("");
const reviewing = ref(false);
const rejecting = ref(false);
const rejectReason = ref("");

function money(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: detail.value?.paymentRequest.currency || "THB",
  }).format(amount);
}
function targetLabel(type: string): string {
  return type === "sale_order" ? "Sale order" : "Rental booking deposit";
}

async function load(): Promise<void> {
  if (!id.value) return;
  loading.value = true;
  error.value = null;
  try {
    detail.value = await $fetch<Detail>(
      `/api/admin/manual-payment-requests/${encodeURIComponent(id.value)}`,
    );
    adminNote.value = detail.value.paymentRequest.adminNote ?? "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load";
  } finally {
    loading.value = false;
  }
}

async function viewSlip(slipId: string): Promise<void> {
  try {
    const res = await $fetch<{ signedUrl: string }>(
      `/api/admin/manual-payment-requests/${encodeURIComponent(id.value)}/slips/${encodeURIComponent(slipId)}/download`,
    );
    if (import.meta.client) window.open(res.signedUrl, "_blank", "noopener");
  } catch (e) {
    toast.add({
      title: e instanceof Error ? e.message : "Could not open slip",
      color: "error",
    });
  }
}

async function markReviewed(): Promise<void> {
  if (reviewing.value) return;
  reviewing.value = true;
  try {
    await $fetch(
      `/api/admin/manual-payment-requests/${encodeURIComponent(id.value)}/review`,
      { method: "POST", body: { adminNote: adminNote.value } },
    );
    toast.add({ title: "Evidence marked reviewed", color: "success" });
    await load();
  } catch (e) {
    toast.add({
      title: e instanceof Error ? e.message : "Review failed",
      color: "error",
    });
  } finally {
    reviewing.value = false;
  }
}

async function rejectEvidence(): Promise<void> {
  if (rejecting.value) return;
  if (!rejectReason.value.trim()) {
    toast.add({ title: "Please enter a reason", color: "warning" });
    return;
  }
  rejecting.value = true;
  try {
    await $fetch(
      `/api/admin/manual-payment-requests/${encodeURIComponent(id.value)}/reject`,
      { method: "POST", body: { reason: rejectReason.value } },
    );
    toast.add({ title: "Evidence rejected", color: "success" });
    rejectReason.value = "";
    await load();
  } catch (e) {
    toast.add({
      title: e instanceof Error ? e.message : "Reject failed",
      color: "error",
    });
  } finally {
    rejecting.value = false;
  }
}

watch(id, () => void load(), { immediate: true });
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-4">
    <UButton
      to="/admin/manual-payment-requests"
      variant="link"
      icon="bx:chevron-left"
      size="xs"
      >Back to payment requests</UButton
    >

    <UCard v-if="loading"><p class="text-sm text-muted">Loading…</p></UCard>
    <UAlert v-else-if="error" color="error" title="Error" :description="error" />
    <template v-else-if="detail">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h1 class="text-lg font-bold">Payment request</h1>
            <UBadge color="info">{{ detail.paymentRequest.status }}</UBadge>
          </div>
        </template>
        <div class="space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">Customer</span>
            <span
              >{{ detail.customer?.fullName || "—" }}
              <span class="text-muted">{{ detail.customer?.phone }}</span></span
            >
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Source</span>
            <span>{{ detail.paymentRequest.sourceType }}</span>
          </div>
          <div class="flex justify-between font-semibold">
            <span>Total amount</span>
            <span>{{ money(detail.paymentRequest.totalAmountDue) }}</span>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header><h2 class="font-semibold">Allocation</h2></template>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-1">Type</th>
              <th class="py-1">Item</th>
              <th class="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in detail.items" :key="item.id" class="border-t">
              <td class="py-1">{{ targetLabel(item.targetType) }}</td>
              <td class="py-1">
                <NuxtLink
                  v-if="item.targetType === 'sale_order'"
                  :to="`/admin/orders/${item.targetId}`"
                  class="text-primary hover:underline"
                  >{{ item.label }}</NuxtLink
                >
                <NuxtLink
                  v-else
                  :to="`/admin/rental-bookings/${item.targetId}`"
                  class="text-primary hover:underline"
                  >{{ item.label }}</NuxtLink
                >
              </td>
              <td class="py-1 text-right">{{ money(item.amountDue) }}</td>
            </tr>
          </tbody>
        </table>
      </UCard>

      <UCard>
        <template #header
          ><h2 class="font-semibold">
            Slip evidence ({{ detail.slips.length }})
          </h2></template
        >
        <p v-if="!detail.slips.length" class="text-sm text-muted">
          No slip uploaded yet.
        </p>
        <ul v-else class="divide-y divide-gray-100">
          <li
            v-for="slip in detail.slips"
            :key="slip.id"
            class="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <div class="min-w-0">
              <div class="truncate font-medium">
                {{ slip.originalFilename || "slip" }}
              </div>
              <div class="text-xs text-muted">
                {{ slip.status }} · {{ new Date(slip.uploadedAt).toLocaleString() }}
              </div>
            </div>
            <UButton size="xs" variant="soft" icon="bx:show" @click="viewSlip(slip.id)"
              >View</UButton
            >
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header><h2 class="font-semibold">Review evidence</h2></template>
        <div class="space-y-3 text-sm">
          <UAlert
            color="warning"
            variant="soft"
            icon="bx:info-circle"
            description="This payment evidence may cover both product/shipping payment and Booking Deposit. Reviewing/rejecting here only records the evidence decision. Verify the total amount and confirm the related sale order and booking through the existing admin actions (Mark Payment Received / Mark Deposit Received)."
          />
          <UTextarea
            v-model="adminNote"
            :rows="2"
            placeholder="Admin note (optional)"
            class="w-full"
          />
          <div class="flex flex-wrap gap-2">
            <UButton
              color="success"
              icon="bx:check"
              :loading="reviewing"
              @click="markReviewed"
              >Mark evidence reviewed</UButton
            >
          </div>
          <div class="border-t pt-3">
            <UInput
              v-model="rejectReason"
              placeholder="Reject reason (required to reject)"
              class="mb-2 w-full"
            />
            <UButton
              color="error"
              variant="soft"
              icon="bx:x"
              :loading="rejecting"
              @click="rejectEvidence"
              >Reject evidence</UButton
            >
          </div>
          <p
            v-if="detail.paymentRequest.rejectedReason"
            class="text-xs text-error"
          >
            Rejected: {{ detail.paymentRequest.rejectedReason }}
          </p>
        </div>
      </UCard>
    </template>
  </div>
</template>
