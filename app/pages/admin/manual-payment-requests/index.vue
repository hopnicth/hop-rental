<script setup lang="ts">
/**
 * Admin manual payment request list. Filter by status; each row links to the
 * detail page. Admin pages follow the existing non-i18n convention.
 */
definePageMeta({ middleware: "role", layout: "admin" });

interface RequestRow {
  id: string;
  status: string;
  sourceType: string;
  currency: string;
  totalAmountDue: number;
  createdAt: string;
  slipExists: boolean;
  items: { label: string; amountDue: number; targetType: string }[];
}

const STATUSES = [
  "",
  "awaiting_payment",
  "pending_review",
  "reviewed",
  "rejected",
  "cancelled",
];
const activeStatus = ref("");
const rows = ref<RequestRow[]>([]);
const loading = ref(false);

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: currency || "THB",
  }).format(amount);
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await $fetch<{ items: RequestRow[] }>(
      "/api/admin/manual-payment-requests",
      { query: activeStatus.value ? { status: activeStatus.value } : {} },
    );
    rows.value = res.items ?? [];
  } finally {
    loading.value = false;
  }
}

watch(activeStatus, load);
onMounted(load);
</script>

<template>
  <div class="space-y-4 p-4">
    <h1 class="text-xl font-bold">Manual payment requests</h1>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="s in STATUSES"
        :key="s"
        size="xs"
        :variant="activeStatus === s ? 'solid' : 'outline'"
        @click="activeStatus = s"
        >{{ s || "all" }}</UButton
      >
    </div>

    <UCard v-if="loading"><p class="text-sm text-muted">Loading…</p></UCard>
    <UCard v-else-if="!rows.length"
      ><p class="text-sm text-muted">No payment requests.</p></UCard
    >
    <UCard v-else>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted">
            <th class="py-1">Created</th>
            <th class="py-1">Source</th>
            <th class="py-1">Status</th>
            <th class="py-1">Slip</th>
            <th class="py-1 text-right">Total</th>
            <th class="py-1" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="border-t">
            <td class="py-2">{{ new Date(r.createdAt).toLocaleDateString() }}</td>
            <td class="py-2">{{ r.sourceType }}</td>
            <td class="py-2"><UBadge color="info" size="xs">{{ r.status }}</UBadge></td>
            <td class="py-2">
              <UIcon :name="r.slipExists ? 'bx:check-circle' : 'bx:time'" />
            </td>
            <td class="py-2 text-right">{{ money(r.totalAmountDue, r.currency) }}</td>
            <td class="py-2 text-right">
              <UButton
                size="xs"
                variant="soft"
                :to="`/admin/manual-payment-requests/${r.id}`"
                >Open</UButton
              >
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>
  </div>
</template>
