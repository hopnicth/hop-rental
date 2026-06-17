<script setup lang="ts">
import type { BookingItem, BookingStatus } from "~/types/booking";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import QrcodeVue from "qrcode.vue";

type BadgeColor = "neutral" | "info" | "warning" | "success" | "error";
type PickupSortDirection = "asc" | "desc";

const ACTIVE_STATUSES: BookingStatus[] = ["draft", "confirmed", "picked_up"];
const TERMINAL_STATUSES: BookingStatus[] = ["cancelled", "returned", "no_show"];

const { t, locale } = useI18n();
const route = useRoute();
const { isLoggedIn } = useAuthSession();
const {
  bookingItems,
  bookingCount,
  bookingTotalDeposit,
  bookingTotalRental,
  loading,
} = useBooking();
const pickupSortDirection = ref<PickupSortDirection>("asc");

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`);
  }
});

const pickupSortButtonLabel = computed(() =>
  t(
    pickupSortDirection.value === "asc"
      ? "rentalsPage.sortPickupEarliest"
      : "rentalsPage.sortPickupLatest",
  ),
);

// ── Section grouping (status-only) ──
const currentRentals = computed(() =>
  bookingItems.value
    .filter((b) => ACTIVE_STATUSES.includes(b.status))
    .slice()
    .sort(compareBookingsByPickupDate),
);

const historicalRentals = computed(() =>
  bookingItems.value
    .filter((b) => TERMINAL_STATUSES.includes(b.status))
    .slice()
    .sort(compareBookingsByPickupDateDesc),
);

// Combined for watcher and empty-state checks
const allDisplayedBookings = computed(() => [
  ...currentRentals.value,
  ...historicalRentals.value,
]);

const submittedBookingCount = computed(() => {
  const raw = route.query.count;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
});

const showSubmittedBanner = computed(() => route.query.submitted === "1");

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

function togglePickupSort() {
  pickupSortDirection.value =
    pickupSortDirection.value === "asc" ? "desc" : "asc";
}

function bookingDateOnly(value?: string): string {
  const date = String(value ?? "").slice(0, 10);
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) ? date : "";
}

function pickupDisplayDate(value?: string): Date | null {
  const date = bookingDateOnly(value);
  return date ? new Date(`${date}T00:00:00+07:00`) : null;
}

function pickupSortTime(booking: BookingItem): number | null {
  const date = pickupDisplayDate(booking.startDate);
  const time = date?.getTime() ?? Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function createdAtSortTime(booking: BookingItem): number {
  const time = new Date(booking.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareBookingsByPickupDate(a: BookingItem, b: BookingItem): number {
  const aTime = pickupSortTime(a);
  const bTime = pickupSortTime(b);
  if (aTime === null && bTime !== null) return 1;
  if (aTime !== null && bTime === null) return -1;
  if (aTime !== null && bTime !== null && aTime !== bTime) {
    const direction = pickupSortDirection.value === "asc" ? 1 : -1;
    return (aTime - bTime) * direction;
  }
  return createdAtSortTime(b) - createdAtSortTime(a);
}

function compareBookingsByPickupDateDesc(
  a: BookingItem,
  b: BookingItem,
): number {
  const aTime = pickupSortTime(a);
  const bTime = pickupSortTime(b);
  if (aTime === null && bTime !== null) return 1;
  if (aTime !== null && bTime === null) return -1;
  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return bTime - aTime; // most recent first
  }
  return createdAtSortTime(b) - createdAtSortTime(a);
}

function formatPickupDatePart(
  booking: BookingItem,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = pickupDisplayDate(booking.startDate);
  if (!date) return "—";
  return new Intl.DateTimeFormat(String(locale.value), {
    ...options,
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function pickupDayNumber(booking: BookingItem): string {
  return formatPickupDatePart(booking, { day: "2-digit" });
}

function pickupMonthLabel(booking: BookingItem): string {
  return formatPickupDatePart(booking, { month: "short" });
}

function pickupWeekdayLabel(booking: BookingItem): string {
  return formatPickupDatePart(booking, { weekday: "short" });
}

function isPickupTomorrow(booking: BookingItem): boolean {
  return bookingDateOnly(booking.startDate) === addDays(bangkokLocalDate(), 1);
}

function pickupCardClass(booking: BookingItem): string {
  return isPickupTomorrow(booking)
    ? "border-2 border-error/80 ring-2 ring-error/25"
    : "";
}

function pickupDayClass(booking: BookingItem): string {
  return isPickupTomorrow(booking)
    ? "border-error/70 bg-error/10 text-error"
    : "border-primary/20 bg-primary/5 text-primary";
}

function statusLabel(status: BookingStatus): string {
  return t(`rentalsPage.status.${status}`);
}

function statusColor(status: BookingStatus): BadgeColor {
  if (status === "confirmed") return "success";
  if (status === "picked_up") return "info";
  if (status === "returned") return "neutral";
  if (status === "draft") return "warning";
  if (status === "no_show") return "warning";
  return "error";
}

function rentalPeriodLabel(booking: BookingItem): string {
  return `${booking.startDate} → ${booking.returnDate} • ${t("cart.days", { n: booking.numDays })}`;
}

function bookingTitle(booking: BookingItem): string {
  return booking.assetName || booking.productName;
}

// ── QR Code modal ──
const qrTarget = ref<BookingItem | null>(null);
const refundProofByBookingId = ref<Record<string, boolean>>({});
const isQrModalOpen = computed({
  get: () => qrTarget.value !== null,
  set: (open: boolean) => {
    if (!open) qrTarget.value = null;
  },
});

function openQr(booking: BookingItem) {
  qrTarget.value = booking;
}

function detailPath(booking: BookingItem): string {
  return `/user/rentals/${encodeURIComponent(booking.bookingId)}`;
}
function cancelRefundPath(booking: BookingItem): string {
  return `${detailPath(booking)}#cancel-refund`;
}
function refundProofPath(booking: BookingItem): string {
  return `${detailPath(booking)}#refund-proof`;
}
function bangkokLocalDate(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(value);
}
function addDays(date: string, days: number): string {
  const dt = new Date(`${date}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function canRequestCancellationRefund(booking: BookingItem): boolean {
  if (
    booking.status !== "confirmed" ||
    booking.deposit <= 0 ||
    !booking.startDate
  )
    return false;
  return bangkokLocalDate() <= addDays(booking.startDate, -3);
}
function hasRefundProof(booking: BookingItem): boolean {
  return refundProofByBookingId.value[booking.bookingId] === true;
}
async function goToDetail(booking: BookingItem) {
  await navigateTo(detailPath(booking));
}
async function goToCancelRefund(booking: BookingItem) {
  await navigateTo(cancelRefundPath(booking));
}
async function goToRefundProof(booking: BookingItem) {
  await navigateTo(refundProofPath(booking));
}

watch(
  () => allDisplayedBookings.value.map((booking) => booking.bookingId).join(","),
  async () => {
    const bookingIds = allDisplayedBookings.value.map(
      (booking) => booking.bookingId,
    );
    if (bookingIds.length === 0) {
      refundProofByBookingId.value = {};
      return;
    }
    try {
      const res = await $fetch<{
        items: Array<{ bookingId: string; exists: boolean }>;
      }>("/api/user/rental-bookings/refund-proof-status", {
        method: "POST",
        body: { bookingIds },
      });
      refundProofByBookingId.value = Object.fromEntries(
        res.items.map((item) => [item.bookingId, item.exists]),
      );
    } catch {
      refundProofByBookingId.value = {};
    }
  },
  { immediate: true },
);
</script>

<template>
  <UContainer class="py-6">
    <HopFeatureBar class="mb-8" />

    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">{{ t("user.activeRentals") }}</h1>
        <p class="text-sm text-muted">{{ t("rentalsPage.description") }}</p>
      </div>
      <UButton
        :label="t('cart.browseProducts')"
        to="/product-all"
        icon="bx:search"
        variant="outline"
      />
    </div>

    <div
      v-if="showSubmittedBanner"
      class="mb-6 rounded-xl border border-success/40 bg-success/5 p-4 text-sm"
    >
      <div class="flex items-start gap-3">
        <UIcon name="bx:check-circle" class="mt-0.5 text-lg text-success" />
        <div>
          <p class="font-semibold text-success">
            {{ t("rentalsPage.submittedTitle") }}
          </p>
          <p class="mt-1 text-muted">
            {{
              t("rentalsPage.submittedDesc", { count: submittedBookingCount })
            }}
          </p>
        </div>
      </div>
    </div>

    <div class="mb-6 grid gap-4 md:grid-cols-3">
      <UCard
        ><p class="text-sm text-muted">{{ t("rentalsPage.confirmedCount") }}</p>
        <p class="mt-1 text-2xl font-bold">{{ bookingCount }}</p></UCard
      >
      <UCard
        ><p class="text-sm text-muted">{{ t("rentalsPage.rentalTotal") }}</p>
        <p class="mt-1 text-2xl font-bold text-primary">
          {{ formatCurrency(bookingTotalRental) }}
        </p></UCard
      >
      <UCard
        ><p class="text-sm text-muted">{{ t("rentalsPage.depositTotal") }}</p>
        <p class="mt-1 text-2xl font-bold">
          {{ formatCurrency(bookingTotalDeposit) }}
        </p></UCard
      >
    </div>

    <div
      v-if="currentRentals.length > 0"
      class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-sm text-muted">{{ t("rentalsPage.sortByPickup") }}</p>
      <UButton
        :label="pickupSortButtonLabel"
        icon="bx:sort"
        variant="soft"
        color="primary"
        size="sm"
        @click="togglePickupSort"
      />
    </div>

    <div v-if="loading && allDisplayedBookings.length === 0" class="space-y-4">
      <div
        v-for="i in 3"
        :key="i"
        class="h-28 animate-pulse rounded-xl bg-elevated"
      />
    </div>

    <UCard v-else-if="allDisplayedBookings.length === 0">
      <div class="py-12 text-center">
        <UIcon name="bx:box" class="mx-auto mb-3 text-4xl text-muted" />
        <p class="text-lg font-semibold">{{ t("rentalsPage.emptyTitle") }}</p>
        <p class="mt-2 text-sm text-muted">
          {{ t("rentalsPage.emptyDescription") }}
        </p>
      </div>
    </UCard>

    <template v-else>
      <!-- ── Section 1: Current / Upcoming Rentals ── -->
      <div v-if="currentRentals.length > 0" class="mb-8">
        <div class="mb-4">
          <h2 class="text-lg font-bold">
            {{ t("rentalsPage.currentSection") }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ t("rentalsPage.currentSectionDesc") }}
          </p>
        </div>
        <div class="space-y-4">
          <UCard
            v-for="booking in currentRentals"
            :key="booking.bookingId"
            :class="pickupCardClass(booking)"
          >
            <div
              class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
            >
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  :class="[
                    'w-full shrink-0 rounded-2xl border p-3 text-center sm:w-24',
                    pickupDayClass(booking),
                  ]"
                >
                  <p
                    class="text-[11px] font-semibold uppercase tracking-wide"
                  >
                    {{ t("rentalsPage.pickupDayEyebrow") }}
                  </p>
                  <p class="mt-1 text-4xl font-black leading-none">
                    {{ pickupDayNumber(booking) }}
                  </p>
                  <p class="mt-1 text-sm font-semibold">
                    {{ pickupMonthLabel(booking) }}
                  </p>
                  <p class="text-xs opacity-75">
                    {{ pickupWeekdayLabel(booking) }}
                  </p>
                </div>

                <div class="space-y-2">
                  <div>
                    <p class="font-semibold">{{ bookingTitle(booking) }}</p>
                    <p class="text-xs text-muted">
                      {{
                        t("rentalsPage.reference", { id: booking.bookingId })
                      }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      :color="statusColor(booking.status)"
                      variant="subtle"
                      >{{
                        t("rentalsPage.badges.status", {
                          status: statusLabel(booking.status),
                        })
                      }}</UBadge
                    >
                    <UBadge
                      v-if="isPickupTomorrow(booking)"
                      color="error"
                      variant="solid"
                    >
                      {{ t("rentalsPage.pickupTomorrowBadge") }}
                    </UBadge>
                  </div>
                  <div class="space-y-1 text-sm text-muted">
                    <p>
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.createdAt") }}:</span
                      >
                      {{ formatDate(booking.createdAt) }}
                    </p>
                    <p>
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.rentalPeriod") }}:</span
                      >
                      {{ rentalPeriodLabel(booking) }}
                    </p>
                    <p>
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.pickupHub") }}:</span
                      >
                      {{ booking.hubName || t("rentalsPage.noHub") }}
                    </p>
                    <p v-if="booking.bookerName">
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.bookerName") }}:</span
                      >
                      {{ booking.bookerName }}
                    </p>
                    <p v-if="booking.bookerPhone">
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.bookerPhone") }}:</span
                      >
                      <a
                        :href="`tel:${booking.bookerPhone}`"
                        class="text-primary hover:underline"
                      >
                        {{ booking.bookerPhone }}
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              <div
                class="flex flex-col gap-3 text-left md:items-end md:text-right"
              >
                <div>
                  <p class="text-sm text-muted">
                    {{ t("rentalsPage.rentalTotal") }}
                  </p>
                  <p class="text-lg font-bold text-primary">
                    {{ formatCurrency(booking.totalCost) }}
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    {{ t("cart.depositLabel") }}:
                    {{ formatCurrency(booking.deposit) }}
                  </p>
                </div>
                <div class="flex flex-col gap-2 sm:items-end">
                  <UButton
                    :label="t('rentalsPage.showQr')"
                    icon="bx:qr"
                    size="sm"
                    variant="outline"
                    @click="openQr(booking)"
                  />
                  <UButton
                    type="button"
                    :label="t('rentalsPage.detailAction')"
                    icon="bx:detail"
                    size="sm"
                    color="primary"
                    variant="solid"
                    @click="goToDetail(booking)"
                  />
                  <UButton
                    v-if="canRequestCancellationRefund(booking)"
                    type="button"
                    :label="t('rentalsPage.cancelRefundAction')"
                    icon="bx:x-circle"
                    size="sm"
                    color="error"
                    variant="outline"
                    @click="goToCancelRefund(booking)"
                  />
                  <UButton
                    v-if="hasRefundProof(booking)"
                    type="button"
                    :label="t('rentalsPage.detail.viewRefundProof')"
                    icon="bx:file"
                    size="sm"
                    color="success"
                    variant="outline"
                    @click="goToRefundProof(booking)"
                  />
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- ── Section 2: Past / Completed / Missed Rentals ── -->
      <div v-if="historicalRentals.length > 0">
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-muted">
            {{ t("rentalsPage.historicalSection") }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ t("rentalsPage.historicalSectionDesc") }}
          </p>
        </div>
        <div class="space-y-4">
          <UCard
            v-for="booking in historicalRentals"
            :key="booking.bookingId"
            class="opacity-80"
            :class="pickupCardClass(booking)"
          >
            <div
              class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
            >
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  :class="[
                    'w-full shrink-0 rounded-2xl border p-3 text-center sm:w-24',
                    pickupDayClass(booking),
                  ]"
                >
                  <p
                    class="text-[11px] font-semibold uppercase tracking-wide"
                  >
                    {{ t("rentalsPage.pickupDayEyebrow") }}
                  </p>
                  <p class="mt-1 text-4xl font-black leading-none">
                    {{ pickupDayNumber(booking) }}
                  </p>
                  <p class="mt-1 text-sm font-semibold">
                    {{ pickupMonthLabel(booking) }}
                  </p>
                  <p class="text-xs opacity-75">
                    {{ pickupWeekdayLabel(booking) }}
                  </p>
                </div>

                <div class="space-y-2">
                  <div>
                    <p class="font-semibold">{{ bookingTitle(booking) }}</p>
                    <p class="text-xs text-muted">
                      {{
                        t("rentalsPage.reference", { id: booking.bookingId })
                      }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      :color="statusColor(booking.status)"
                      variant="subtle"
                      >{{
                        t("rentalsPage.badges.status", {
                          status: statusLabel(booking.status),
                        })
                      }}</UBadge
                    >
                    <UBadge
                      v-if="isPickupTomorrow(booking)"
                      color="error"
                      variant="solid"
                    >
                      {{ t("rentalsPage.pickupTomorrowBadge") }}
                    </UBadge>
                  </div>
                  <div class="space-y-1 text-sm text-muted">
                    <p>
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.createdAt") }}:</span
                      >
                      {{ formatDate(booking.createdAt) }}
                    </p>
                    <p>
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.rentalPeriod") }}:</span
                      >
                      {{ rentalPeriodLabel(booking) }}
                    </p>
                    <p>
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.pickupHub") }}:</span
                      >
                      {{ booking.hubName || t("rentalsPage.noHub") }}
                    </p>
                    <p v-if="booking.bookerName">
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.bookerName") }}:</span
                      >
                      {{ booking.bookerName }}
                    </p>
                    <p v-if="booking.bookerPhone">
                      <span class="font-medium text-default"
                        >{{ t("rentalsPage.bookerPhone") }}:</span
                      >
                      <a
                        :href="`tel:${booking.bookerPhone}`"
                        class="text-primary hover:underline"
                      >
                        {{ booking.bookerPhone }}
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              <div
                class="flex flex-col gap-3 text-left md:items-end md:text-right"
              >
                <div>
                  <p class="text-sm text-muted">
                    {{ t("rentalsPage.rentalTotal") }}
                  </p>
                  <p class="text-lg font-bold text-primary">
                    {{ formatCurrency(booking.totalCost) }}
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    {{ t("cart.depositLabel") }}:
                    {{ formatCurrency(booking.deposit) }}
                  </p>
                </div>
                <div class="flex flex-col gap-2 sm:items-end">
                  <UButton
                    :label="t('rentalsPage.showQr')"
                    icon="bx:qr"
                    size="sm"
                    variant="outline"
                    @click="openQr(booking)"
                  />
                  <UButton
                    type="button"
                    :label="t('rentalsPage.detailAction')"
                    icon="bx:detail"
                    size="sm"
                    color="primary"
                    variant="solid"
                    @click="goToDetail(booking)"
                  />
                  <UButton
                    v-if="canRequestCancellationRefund(booking)"
                    type="button"
                    :label="t('rentalsPage.cancelRefundAction')"
                    icon="bx:x-circle"
                    size="sm"
                    color="error"
                    variant="outline"
                    @click="goToCancelRefund(booking)"
                  />
                  <UButton
                    v-if="hasRefundProof(booking)"
                    type="button"
                    :label="t('rentalsPage.detail.viewRefundProof')"
                    icon="bx:file"
                    size="sm"
                    color="success"
                    variant="outline"
                    @click="goToRefundProof(booking)"
                  />
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>

    <UModal v-model:open="isQrModalOpen" :title="t('rentalsPage.qrModalTitle')">
      <template #body>
        <div v-if="qrTarget" class="flex flex-col items-center gap-4 py-2">
          <p class="text-sm text-muted">{{ t("rentalsPage.qrInstruction") }}</p>
          <div class="rounded-xl border bg-white p-4">
            <QrcodeVue
              :value="`booking:${qrTarget.bookingId}`"
              :size="220"
              level="H"
            />
          </div>
          <div class="w-full space-y-1 text-sm">
            <p class="font-semibold">{{ bookingTitle(qrTarget) }}</p>
            <p class="text-xs text-muted">
              {{ t("rentalsPage.reference", { id: qrTarget.bookingId }) }}
            </p>
            <p>
              <span class="font-medium">{{
                t("rentalsPage.pickupDateLabel")
              }}</span
              >: {{ qrTarget.startDate }}
            </p>
            <p>
              <span class="font-medium">{{ t("rentalsPage.pickupHub") }}</span
              >: {{ qrTarget.hubName || t("rentalsPage.noHub") }}
            </p>
          </div>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
