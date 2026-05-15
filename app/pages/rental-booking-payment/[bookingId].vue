<script setup lang="ts">
import QrcodeVue from "qrcode.vue";

type PaymentAttempt = {
  paymentAttemptId: string;
  status: string;
  amount: number;
  currency: string;
  redirectUrl: string | null;
  qrImageUrl: string | null;
  expiresAt: string | null;
};

type PaymentStatusResponse = {
  bookingId: string;
  bookingStatus: string;
  bookingDepositPaymentStatus: string;
  confirmFailureReason: string | null;
  canRetryBookingDepositPayment: boolean;
  amount: number;
  currency: string;
  latestAttempt: PaymentAttempt | null;
  bookingQrValue: string;
};

const route = useRoute();
const toast = useToast();
const { t } = useI18n();
const { refreshBookings } = useBooking();
const bookingId = computed(() => String(route.params.bookingId || ""));
const status = ref<PaymentStatusResponse | null>(null);
const loading = ref(true);
const polling = ref(false);
const retrying = ref(false);
const bookingStoreRefreshed = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const isConfirmed = computed(() => status.value?.bookingStatus === "confirmed");
const needsReview = computed(
  () => status.value?.bookingDepositPaymentStatus === "paid_confirm_failed",
);
const canRetryPayment = computed(
  () => status.value?.canRetryBookingDepositPayment === true,
);
const backToCartPath = computed(() => ({
  path: "/user/cart",
  query: isConfirmed.value ? { rentalPayment: "success" } : undefined,
}));
const confirmedDetailPath = computed(() =>
  isConfirmed.value
    ? `/user/rentals/${encodeURIComponent(bookingId.value)}`
    : "/user/rentals",
);

function formatCurrency(value: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

async function loadStatus() {
  if (!bookingId.value) return;
  status.value = await $fetch<PaymentStatusResponse>(
    `/api/rental-bookings/${encodeURIComponent(bookingId.value)}/booking-deposit-payment/status`,
  );
  if (
    (isConfirmed.value || needsReview.value) &&
    !bookingStoreRefreshed.value
  ) {
    bookingStoreRefreshed.value = true;
    await refreshBookings();
  }
}

async function pollAttempt() {
  const attempt = status.value?.latestAttempt;
  if (
    !attempt ||
    !bookingId.value ||
    ["paid", "failed", "expired", "cancelled"].includes(attempt.status)
  ) {
    await loadStatus();
    return;
  }
  polling.value = true;
  try {
    await $fetch(
      `/api/rental-bookings/${encodeURIComponent(bookingId.value)}/booking-deposit-payment/poll`,
      { method: "POST", body: { paymentAttemptId: attempt.paymentAttemptId } },
    );
    await loadStatus();
  } catch (err) {
    toast.add({
      title: t("rentalBookingPayment.statusCheckFailedTitle"),
      description:
        err instanceof Error
          ? err.message
          : t("rentalBookingPayment.statusCheckFailedDesc"),
      color: "error",
    });
  } finally {
    polling.value = false;
  }
}

async function retryPayment() {
  if (!bookingId.value || !canRetryPayment.value) return;
  retrying.value = true;
  try {
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `booking_deposit_retry_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    await $fetch(
      `/api/rental-bookings/${encodeURIComponent(bookingId.value)}/booking-deposit-payment/create`,
      {
        method: "POST",
        body: { idempotencyKey, method: "promptpay", agreementAccepted: true },
      },
    );
    await loadStatus();
  } catch (err) {
    toast.add({
      title: t("rentalBookingPayment.retryFailedTitle"),
      description:
        err instanceof Error
          ? err.message
          : t("rentalBookingPayment.retryFailedDesc"),
      color: "error",
    });
  } finally {
    retrying.value = false;
  }
}

onMounted(async () => {
  try {
    await loadStatus();
    pollTimer = setInterval(() => void pollAttempt(), 5000);
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <UContainer class="py-8">
    <UCard v-if="loading">
      <div class="py-10 text-center text-muted">
        {{ t("rentalBookingPayment.loading") }}
      </div>
    </UCard>

    <UCard v-else-if="status">
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <div>
            <h1 class="text-xl font-bold">
              {{ t("rentalBookingPayment.title") }}
            </h1>
            <p class="text-sm text-muted">
              {{
                t("rentalBookingPayment.bookingId", { id: status.bookingId })
              }}
            </p>
          </div>
          <UBadge
            :color="isConfirmed ? 'success' : needsReview ? 'warning' : 'info'"
          >
            {{ status.bookingDepositPaymentStatus }} /
            {{ status.bookingStatus }}
          </UBadge>
        </div>
      </template>

      <div class="space-y-6">
        <UAlert
          v-if="isConfirmed"
          color="success"
          icon="bx:check-circle"
          :title="t('rentalBookingPayment.confirmedTitle')"
          :description="t('rentalBookingPayment.confirmedDesc')"
        />
        <UAlert
          v-else-if="needsReview"
          color="warning"
          icon="bx:error-circle"
          :title="t('rentalBookingPayment.reviewTitle')"
          :description="t('rentalBookingPayment.reviewDesc')"
        />
        <UAlert
          v-else-if="canRetryPayment"
          color="warning"
          icon="bx:time-five"
          :title="t('rentalBookingPayment.expiredTitle')"
          :description="t('rentalBookingPayment.expiredDesc')"
        />
        <UAlert
          v-else
          color="info"
          icon="bx:qr"
          :title="t('rentalBookingPayment.payTitle')"
          :description="t('rentalBookingPayment.payDesc')"
        />

        <div class="grid gap-6 md:grid-cols-2">
          <div class="rounded-lg border p-4">
            <h2 class="font-semibold">
              {{ t("rentalBookingPayment.referenceTitle") }}
            </h2>
            <dl class="mt-3 space-y-2 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ t("rentalBookingPayment.amount") }}
                </dt>
                <dd class="font-semibold">
                  {{ formatCurrency(status.amount, status.currency) }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ t("rentalBookingPayment.attempt") }}
                </dt>
                <dd class="break-all text-right">
                  {{ status.latestAttempt?.paymentAttemptId || "—" }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ t("rentalBookingPayment.paymentStatus") }}
                </dt>
                <dd>
                  {{
                    status.latestAttempt?.status ||
                    status.bookingDepositPaymentStatus
                  }}
                </dd>
              </div>
            </dl>
            <p class="mt-4 text-xs text-muted">
              {{ t("rentalBookingPayment.notReceipt") }}
            </p>
          </div>

          <div class="rounded-lg border p-4 text-center">
            <h2 class="mb-3 font-semibold">
              {{
                isConfirmed
                  ? t("rentalBookingPayment.bookingQr")
                  : t("rentalBookingPayment.promptPayQr")
              }}
            </h2>
            <img
              v-if="!isConfirmed && status.latestAttempt?.qrImageUrl"
              :src="status.latestAttempt.qrImageUrl"
              :alt="t('rentalBookingPayment.promptPayQr')"
              class="mx-auto h-56 w-56 object-contain"
            />
            <QrcodeVue
              v-else
              :value="status.bookingQrValue"
              :size="180"
              level="H"
            />
            <UButton class="mt-4" :loading="polling" @click="pollAttempt">
              {{ t("rentalBookingPayment.refreshStatus") }}
            </UButton>
            <UButton
              v-if="canRetryPayment"
              class="mt-3"
              color="primary"
              icon="bx:qr"
              :loading="retrying"
              @click="retryPayment"
            >
              {{ t("rentalBookingPayment.retryPayment") }}
            </UButton>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <UButton :to="confirmedDetailPath" color="primary">
            {{ t("rentalBookingPayment.viewRentals") }}
          </UButton>
          <UButton :to="backToCartPath" variant="outline">
            {{ t("rentalBookingPayment.backToCart") }}
          </UButton>
        </div>
      </div>
    </UCard>
  </UContainer>
</template>
