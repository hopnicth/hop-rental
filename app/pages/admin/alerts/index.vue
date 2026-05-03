<script setup lang="ts">
import type { AdminPaymentAlertSeverity } from "~/types/admin-order-detail";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

const toast = useToast();
const {
  items,
  total,
  unresolvedTotal,
  loading,
  error,
  filters,
  load,
  resolve,
  subscribe,
  unsubscribe,
} = useAdminPaymentAlerts();

const resolvedOptions = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
] as const;

const severityOptions: Array<{
  value: AdminPaymentAlertSeverity | "";
  label: string;
}> = [
  { value: "", label: "Any severity" },
  { value: "critical", label: "Critical" },
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

const severityFilter = computed({
  get: () => filters.severity ?? "",
  set: (val: AdminPaymentAlertSeverity | "") => {
    filters.severity = val || null;
  },
});

watch(
  () => [filters.resolved, filters.severity, filters.kind],
  () => {
    void load();
  },
);

onMounted(() => {
  subscribe();
  void load();
});
onBeforeUnmount(() => unsubscribe());

const severityColor: Record<AdminPaymentAlertSeverity, string> = {
  info: "neutral",
  warning: "warning",
  error: "error",
  critical: "error",
};

async function handleResolve(id: string) {
  try {
    await resolve(id);
    toast.add({ title: "Alert resolved", color: "success" });
  } catch (e) {
    toast.add({
      title: "Failed to resolve",
      description: e instanceof Error ? e.message : String(e),
      color: "error",
    });
  }
}

const applyingId = ref<string | null>(null);

async function handleApplyInventory(orderId: string | null) {
  if (!orderId) return;
  applyingId.value = orderId;
  try {
    await $fetch(`/api/admin/orders/${orderId}/apply-inventory`, {
      method: "POST",
    });
    toast.add({ title: "Inventory applied", color: "success" });
    await load();
  } catch (e) {
    toast.add({
      title: "Apply inventory failed",
      description: e instanceof Error ? e.message : String(e),
      color: "error",
    });
  } finally {
    applyingId.value = null;
  }
}

function fmtTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">Payment alerts</h2>
        <p class="text-sm text-muted">
          Open: <strong>{{ unresolvedTotal }}</strong> · Total in view:
          {{ total }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <USelectMenu
          v-model="filters.resolved"
          :items="resolvedOptions"
          value-key="value"
          class="w-32"
        />
        <USelectMenu
          v-model="severityFilter"
          :items="severityOptions"
          value-key="value"
          class="w-40"
        />
        <UInput
          v-model="filters.kind"
          placeholder="Filter by kind…"
          class="w-48"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          variant="soft"
          :loading="loading"
          @click="load()"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <UAlert v-if="error" color="error" :title="error" />

    <div
      v-if="!loading && items.length === 0"
      class="rounded-2xl border border-default bg-white p-8 text-center text-muted"
    >
      No alerts match the current filters.
    </div>

    <div
      v-for="alert in items"
      :key="alert.id"
      class="rounded-2xl border border-default bg-white p-4 shadow-sm"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :color="severityColor[alert.severity] as never"
              variant="soft"
              size="sm"
            >
              {{ alert.severity }}
            </UBadge>
            <UBadge color="neutral" variant="outline" size="sm">
              {{ alert.kind }}
            </UBadge>
            <NuxtLink
              v-if="alert.orderId"
              :to="`/admin/orders/${alert.orderId}`"
              class="text-sm font-semibold text-primary hover:underline"
            >
              {{ alert.orderNumber ?? alert.orderId.slice(0, 8) }}
            </NuxtLink>
            <span v-if="alert.resolvedAt" class="text-xs text-success">
              ✓ resolved {{ fmtTime(alert.resolvedAt) }}
            </span>
          </div>
          <p class="mt-2 text-sm">{{ alert.message }}</p>
          <p class="mt-1 text-xs text-muted">
            Created {{ fmtTime(alert.createdAt) }}
          </p>
        </div>
        <div class="flex shrink-0 flex-col gap-2 sm:flex-row">
          <UButton
            v-if="
              !alert.resolvedAt &&
              alert.kind === 'inventory_apply_failed' &&
              alert.orderId
            "
            color="primary"
            variant="solid"
            size="sm"
            :loading="applyingId === alert.orderId"
            @click="handleApplyInventory(alert.orderId)"
          >
            Apply inventory
          </UButton>
          <UButton
            v-if="!alert.resolvedAt"
            color="success"
            variant="soft"
            size="sm"
            @click="handleResolve(alert.id)"
          >
            Mark resolved
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
