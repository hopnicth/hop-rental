<script setup lang="ts">
/**
 * Payment-evidence (slip) history list for a rental booking or sale order.
 * Shows uploaded slips with their review status. No file URLs are exposed
 * here — viewing a private slip is an admin-only signed-URL action.
 */
type BadgeColor = "neutral" | "warning" | "success" | "error";

interface SlipRow {
  id: string;
  originalFilename: string;
  status: string;
  uploadedAt: string;
}

defineProps<{ slips: SlipRow[] }>();
const { t } = useI18n();

const STATUS_COLOR: Record<string, BadgeColor> = {
  pending_review: "warning",
  reviewed: "success",
  rejected: "error",
};
function statusColor(s: string): BadgeColor {
  return STATUS_COLOR[s] ?? "neutral";
}
function statusLabel(s: string): string {
  return t(`paymentHistory.status.${s}`);
}
function formatDate(v: string): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        {{ t("paymentHistory.title") }} ({{ slips.length }})
      </h2>
    </template>
    <p v-if="slips.length === 0" class="text-sm text-muted">
      {{ t("paymentHistory.empty") }}
    </p>
    <ul v-else class="divide-y divide-gray-100">
      <li
        v-for="slip in slips"
        :key="slip.id"
        class="flex items-center justify-between gap-3 py-2 text-sm"
      >
        <div class="min-w-0">
          <div class="truncate font-medium">{{ slip.originalFilename }}</div>
          <div class="text-xs text-muted">{{ formatDate(slip.uploadedAt) }}</div>
        </div>
        <UBadge size="xs" :color="statusColor(slip.status)">{{
          statusLabel(slip.status)
        }}</UBadge>
      </li>
    </ul>
  </UCard>
</template>
