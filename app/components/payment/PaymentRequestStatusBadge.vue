<script setup lang="ts">
/**
 * Status badge for a manual payment request.
 * Maps the request status to a consistent UBadge color + i18n label.
 */
type BadgeColor = "neutral" | "warning" | "info" | "success" | "error";

const props = defineProps<{ status: string }>();
const { t } = useI18n();

const STATUS_COLOR: Record<string, BadgeColor> = {
  awaiting_payment: "warning",
  pending_review: "info",
  reviewed: "success",
  rejected: "error",
  cancelled: "neutral",
};
const STATUS_KEY: Record<string, string> = {
  awaiting_payment: "awaitingPayment",
  pending_review: "pendingReview",
  reviewed: "reviewed",
  rejected: "rejected",
  cancelled: "cancelled",
};

const color = computed<BadgeColor>(() => STATUS_COLOR[props.status] ?? "neutral");
const label = computed(() =>
  t(`paymentRequests.${STATUS_KEY[props.status] ?? "awaitingPayment"}`),
);
</script>

<template>
  <UBadge :color="color" variant="soft">{{ label }}</UBadge>
</template>
