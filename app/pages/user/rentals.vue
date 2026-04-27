<script setup lang="ts">
import type { BookingItem, BookingStatus } from "~/types/booking";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import QrcodeVue from "qrcode.vue";

type BadgeColor = "neutral" | "info" | "warning" | "success" | "error";

const { t, locale } = useI18n();
const route = useRoute();
const toast = useToast();
const { isLoggedIn } = useAuthSession();
const {
  bookingItems,
  bookingCount,
  bookingTotalDeposit,
  bookingTotalRental,
  loading,
  updateBookingStatus,
} = useBooking();

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo("/user/login");
  }
});

const sortedBookings = computed(() =>
  bookingItems.value
    .filter((b) => b.status !== "cancelled")
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
);

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

function bookingTitle(booking: BookingItem): string {
  return booking.assetName || booking.productName;
}

// ── QR Code modal ──
const qrTarget = ref<BookingItem | null>(null);
const isQrModalOpen = computed({
  get: () => qrTarget.value !== null,
  set: (open: boolean) => {
    if (!open) qrTarget.value = null;
  },
});

function openQr(booking: BookingItem) {
  qrTarget.value = booking;
}

// ── Cancel booking flow ──
function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function canCancelBooking(booking: BookingItem): boolean {
  if (booking.status === "cancelled") return false;
  return todayDateString() < booking.startDate;
}

const cancelTarget = ref<BookingItem | null>(null);
const cancelling = ref(false);
const isCancelModalOpen = computed({
  get: () => cancelTarget.value !== null,
  set: (open: boolean) => {
    if (!open && !cancelling.value) cancelTarget.value = null;
  },
});

function openCancel(booking: BookingItem) {
  cancelTarget.value = booking;
}

async function confirmCancel() {
  const target = cancelTarget.value;
  if (!target || cancelling.value) return;

  cancelling.value = true;
  try {
    const ok = await updateBookingStatus(target.bookingId, "cancelled");
    if (ok) {
      toast.add({
        title: t("rentalsPage.cancelSuccess"),
        icon: "bx:check-circle",
        color: "success",
      });
      cancelTarget.value = null;
    } else {
      toast.add({
        title: t("rentalsPage.cancelFailed"),
        icon: "bx:error-circle",
        color: "error",
      });
    }
  } finally {
    cancelling.value = false;
  }
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

    <div v-if="loading && sortedBookings.length === 0" class="space-y-4">
      <div
        v-for="i in 3"
        :key="i"
        class="h-28 animate-pulse rounded-xl bg-elevated"
      />
    </div>

    <UCard v-else-if="sortedBookings.length === 0">
      <div class="py-12 text-center">
        <UIcon name="bx:box" class="mx-auto mb-3 text-4xl text-muted" />
        <p class="text-lg font-semibold">{{ t("rentalsPage.emptyTitle") }}</p>
        <p class="mt-2 text-sm text-muted">
          {{ t("rentalsPage.emptyDescription") }}
        </p>
      </div>
    </UCard>

    <div v-else class="space-y-4">
      <UCard v-for="booking in sortedBookings" :key="booking.bookingId">
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="space-y-2">
            <div>
              <p class="font-semibold">{{ bookingTitle(booking) }}</p>
              <p class="text-xs text-muted">
                {{ t("rentalsPage.reference", { id: booking.bookingId }) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge :color="statusColor(booking.status)" variant="subtle">{{
                t("rentalsPage.badges.status", {
                  status: statusLabel(booking.status),
                })
              }}</UBadge>
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

          <div class="flex flex-col gap-3 text-left sm:items-end sm:text-right">
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
                :label="t('rentalsPage.cancelBooking')"
                icon="bx:x-circle"
                size="sm"
                color="error"
                variant="ghost"
                :disabled="!canCancelBooking(booking)"
                :title="
                  canCancelBooking(booking)
                    ? undefined
                    : t('rentalsPage.cancelDisabledHint')
                "
                @click="openCancel(booking)"
              />
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <UModal
      v-model:open="isCancelModalOpen"
      :title="t('rentalsPage.cancelConfirmTitle')"
      :description="t('rentalsPage.cancelConfirmDesc')"
      :dismissible="!cancelling"
    >
      <template #body>
        <div v-if="cancelTarget" class="space-y-2 text-sm">
          <div class="text-center">
            <UIcon
              name="bx:error-circle"
              class="mx-auto mb-2 text-4xl text-error"
            />
          </div>
          <p class="font-semibold">{{ bookingTitle(cancelTarget) }}</p>
          <p class="text-xs text-muted">
            {{ t("rentalsPage.reference", { id: cancelTarget.bookingId }) }}
          </p>
          <p>
            <span class="font-medium">{{
              t("rentalsPage.pickupDateLabel")
            }}</span
            >: {{ cancelTarget.startDate }}
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-center gap-2">
          <UButton
            :label="t('rentalsPage.cancelKeep')"
            color="neutral"
            variant="ghost"
            :disabled="cancelling"
            @click="cancelTarget = null"
          />
          <UButton
            :label="t('rentalsPage.cancelConfirm')"
            color="error"
            icon="bx:trash"
            :loading="cancelling"
            :disabled="cancelling"
            @click="confirmCancel"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="isQrModalOpen" :title="t('rentalsPage.qrModalTitle')">
      <template #body>
        <div v-if="qrTarget" class="flex flex-col items-center gap-4 py-2">
          <p class="text-sm text-muted">{{ t("rentalsPage.qrInstruction") }}</p>
          <div class="rounded-xl border bg-white p-4">
            <QrcodeVue :value="qrTarget.bookingId" :size="220" level="H" />
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
