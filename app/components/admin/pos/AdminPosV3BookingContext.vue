<script setup lang="ts">
import type { AdminRentalBookingDetail } from "~/types/admin-order-detail";

type BadgeColor =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "error"
  | "primary";

interface PickupReadinessPreview {
  readiness?: {
    classification?: string;
    canProceedToPickup?: boolean;
    blockers?: Array<{ message?: string }>;
    warnings?: Array<{ message?: string }>;
  };
  moneySummary?: {
    pickupDue?: { totalPickupDueAmount?: number };
  };
}

const props = defineProps<{
  booking: AdminRentalBookingDetail | null;
  readiness: PickupReadinessPreview | null;
  loading?: boolean;
  error?: string | null;
  readinessError?: string | null;
}>();

const operationHint = computed(() => {
  if (props.booking?.status === "confirmed") return "Active pickup flow ↓";
  if (props.booking?.status === "picked_up")
    return "Return path will plug in later.";
  return "Resolved, but inactive or not actionable in POS V3 Phase 1.";
});

function statusColor(status?: string): BadgeColor {
  if (status === "confirmed") return "warning";
  if (status === "picked_up") return "primary";
  if (status === "returned") return "success";
  if (status === "cancelled" || status === "no_show") return "error";
  return "neutral";
}

function money(value: number | undefined) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Booking Context</h2>
          <p class="text-sm text-muted">
            Resolved booking handoff for later pickup/return workflows.
          </p>
        </div>
        <UBadge
          v-if="booking"
          :color="statusColor(booking.status)"
          variant="soft"
        >
          {{ booking.status }}
        </UBadge>
      </div>
    </template>

    <UProgress v-if="loading" animation="carousel" />
    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <div v-if="booking" class="space-y-4">
      <div class="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div>
          <p class="text-muted">Reference</p>
          <p class="font-semibold">{{ booking.id }}</p>
        </div>
        <div>
          <p class="text-muted">Customer</p>
          <p class="font-semibold">
            {{ booking.customer?.fullName || booking.bookerName || "—" }}
          </p>
        </div>
        <div>
          <p class="text-muted">Item</p>
          <p class="font-semibold">
            {{ booking.assetName || booking.productName || "—" }}
          </p>
        </div>
        <div>
          <p class="text-muted">Branch / hub</p>
          <p class="font-semibold">
            {{ booking.hubName || booking.storageBranchName || "—" }}
          </p>
        </div>
      </div>
      <p class="text-sm text-muted">
        {{ booking.startDate || "—" }} → {{ booking.endDate || "—" }} ·
        {{ operationHint }}
      </p>

      <UAlert
        v-if="readiness"
        color="info"
        variant="soft"
        title="Pickup readiness preview"
        :description="`Classification: ${readiness.readiness?.classification || 'unknown'} · ยอดมัดจำประกันรวม: ${money(booking?.depositAmount)} · ยอดค้างชำระตอนรับของ: ${money(readiness.moneySummary?.pickupDue?.totalPickupDueAmount)}`"
      />
      <UAlert
        v-else-if="readinessError"
        color="warning"
        variant="soft"
        :title="readinessError"
      />

      <UButton
        :to="`/admin/rental-bookings/${booking.id}`"
        icon="bx:detail"
        variant="soft"
      >
        Open existing booking detail
      </UButton>
    </div>
  </UCard>
</template>
