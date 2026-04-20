<script setup lang="ts">
import type { BookingItem, BookingStatus } from "~/types/booking";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";

type BadgeColor = "neutral" | "info" | "warning" | "success" | "error";

const { t, locale } = useI18n();
const { isLoggedIn } = useAuthSession();
const { bookingItems, bookingCount, bookingTotalDeposit, bookingTotalRental, loading } =
  useBooking();

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo("/user/login");
  }
});

const sortedBookings = computed(() =>
  [...bookingItems.value].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ),
);

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(String(locale.value), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusLabel(status: BookingStatus): string {
  return t(`rentalsPage.status.${status}`);
}

function statusColor(status: BookingStatus): BadgeColor {
  if (status === "confirmed") return "success";
  if (status === "draft") return "warning";
  return "error";
}

function rentalPeriodLabel(booking: BookingItem): string {
  return `${booking.startDate} → ${booking.returnDate} • ${t("cart.days", { n: booking.numDays })}`;
}
</script>

<template>
  <UContainer class="py-6">
    <HopFeatureBar class="mb-8" />

    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">{{ t("user.activeRentals") }}</h1>
        <p class="text-sm text-muted">{{ t("rentalsPage.description") }}</p>
      </div>
      <UButton :label="t('cart.browseProducts')" to="/product-all" icon="bx:search" variant="outline" />
    </div>

    <div class="mb-6 grid gap-4 md:grid-cols-3">
      <UCard><p class="text-sm text-muted">{{ t("rentalsPage.confirmedCount") }}</p><p class="mt-1 text-2xl font-bold">{{ bookingCount }}</p></UCard>
      <UCard><p class="text-sm text-muted">{{ t("rentalsPage.rentalTotal") }}</p><p class="mt-1 text-2xl font-bold text-primary">{{ formatCurrency(bookingTotalRental) }}</p></UCard>
      <UCard><p class="text-sm text-muted">{{ t("rentalsPage.depositTotal") }}</p><p class="mt-1 text-2xl font-bold">{{ formatCurrency(bookingTotalDeposit) }}</p></UCard>
    </div>

    <div v-if="loading && sortedBookings.length === 0" class="space-y-4">
      <div v-for="i in 3" :key="i" class="h-28 animate-pulse rounded-xl bg-elevated" />
    </div>

    <UCard v-else-if="sortedBookings.length === 0">
      <div class="py-12 text-center">
        <UIcon name="bx:box" class="mx-auto mb-3 text-4xl text-muted" />
        <p class="text-lg font-semibold">{{ t("rentalsPage.emptyTitle") }}</p>
        <p class="mt-2 text-sm text-muted">{{ t("rentalsPage.emptyDescription") }}</p>
      </div>
    </UCard>

    <div v-else class="space-y-4">
      <UCard v-for="booking in sortedBookings" :key="booking.bookingId">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-2">
            <div>
              <p class="font-semibold">{{ booking.productName }}</p>
              <p class="text-xs text-muted">{{ t("rentalsPage.reference", { id: booking.bookingId }) }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge :color="statusColor(booking.status)" variant="subtle">{{ t("rentalsPage.badges.status", { status: statusLabel(booking.status) }) }}</UBadge>
            </div>
            <div class="space-y-1 text-sm text-muted">
              <p><span class="font-medium text-default">{{ t("rentalsPage.createdAt") }}:</span> {{ formatDate(booking.createdAt) }}</p>
              <p><span class="font-medium text-default">{{ t("rentalsPage.rentalPeriod") }}:</span> {{ rentalPeriodLabel(booking) }}</p>
              <p><span class="font-medium text-default">{{ t("rentalsPage.pickupHub") }}:</span> {{ booking.hubName || t("rentalsPage.noHub") }}</p>
            </div>
          </div>

          <div class="text-left sm:text-right">
            <p class="text-sm text-muted">{{ t("rentalsPage.rentalTotal") }}</p>
            <p class="text-lg font-bold text-primary">{{ formatCurrency(booking.totalCost) }}</p>
            <p class="mt-1 text-xs text-muted">{{ t("cart.depositLabel") }}: {{ formatCurrency(booking.deposit) }}</p>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>