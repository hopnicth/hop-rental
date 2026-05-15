<script setup lang="ts">
import {
  cardNumberDisplayMaxLength,
  cvcLengthForCard,
  formatExpiryDisplay,
  formatPaymentCardNumber,
  isValidLuhn,
  parseExpiryDisplay,
  preventNonDigitBeforeInput,
  sanitizeCvcForCard,
} from "~/utils/payment-card";

type MixedCheckoutAllocation = {
  id: string;
  allocation_type: string;
  target_id: string | null;
  amount: number;
  currency_code: string;
  tax_category: string;
  wht_rate: number;
  status: string;
  metadata?: Record<string, unknown> | null;
};

type MixedCheckoutAttempt = {
  id: string;
  method: "credit_card" | "promptpay";
  status: string;
  amount: number;
  currency_code: string;
  gateway_charge_id: string | null;
  qr_image_url: string | null;
  gateway_authorize_uri: string | null;
  expires_at: string | null;
};

type MixedCheckoutStatus = {
  ok: true;
  session: {
    id: string;
    status: string;
    checkout_kind: "mixed" | "rental_deposit_only" | "sale_only" | null;
    amount_total: number;
    currency_code: string;
    expires_at: string | null;
  };
  latestAttempt: MixedCheckoutAttempt | null;
  allocations: MixedCheckoutAllocation[];
  saleOrder: {
    id: string;
    status: string;
    payment_status: string;
    fulfillment_status: string;
  } | null;
  rentalBookings: Array<{
    id: string;
    status: string;
    booking_deposit_payment_status: string;
    booking_deposit_confirm_failure_reason: string | null;
  }>;
};

type MixedCheckoutInitiatedAttempt = {
  paymentAttemptId: string;
  sessionId: string;
  method: "credit_card" | "promptpay";
  status: string;
  amount: number;
  currency: string;
  redirectUrl: string | null;
  qrImageUrl: string | null;
  expiresAt: string | null;
};

const route = useRoute();
const { t } = useI18n();
const toast = useToast();
const { createCardToken } = useOmise();

const sessionId = computed(() => String(route.params.sessionId || ""));
const status = ref<MixedCheckoutStatus | null>(null);
const loading = ref(true);
const submittingCard = ref(false);
const isPaymentPollInFlight = ref(false);
const isReconcilingPayment = ref(false);
const errorMsg = ref<string | null>(null);
const isDev = import.meta.dev;
const now = ref(Date.now());

let tickHandle: ReturnType<typeof setInterval> | null = null;
let pollHandle: ReturnType<typeof setInterval> | null = null;
let pageActive = false;

const card = reactive({ name: "", number: "", expiry: "", cvc: "" });

function formatCurrency(value: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: currency || "THB",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function allocationLabel(allocation: MixedCheckoutAllocation): string {
  if (allocation.allocation_type === "sale_product")
    return t("mixedCheckout.saleProducts");
  if (allocation.allocation_type === "shipping")
    return t("mixedCheckout.shipping");
  const title = String(
    allocation.metadata?.title ??
      allocation.metadata?.bookingId ??
      allocation.target_id ??
      "",
  );
  return t("mixedCheckout.bookingDeposit", { title });
}

function isTerminalSessionStatus(value: string | null | undefined): boolean {
  return [
    "finalized",
    "partial_finalized",
    "finalization_failed",
    "expired",
    "cancelled",
  ].includes(String(value ?? ""));
}

function isHardTerminalAttemptStatus(
  value: string | null | undefined,
): boolean {
  return [
    "failed",
    "expired",
    "cancelled",
    "refunded",
    "finalization_failed",
  ].includes(String(value ?? ""));
}

const latestAttempt = computed(() => status.value?.latestAttempt ?? null);
const paymentMethod = computed(() => latestAttempt.value?.method ?? null);
const isBookingOnlyCheckout = computed(
  () => status.value?.session.checkout_kind === "rental_deposit_only",
);
const pageTitle = computed(() =>
  isBookingOnlyCheckout.value
    ? t("mixedCheckout.bookingOnlyTitle")
    : t("mixedCheckout.mixedTitle"),
);
const pageDescription = computed(() =>
  isBookingOnlyCheckout.value
    ? t("mixedCheckout.bookingOnlyDesc")
    : t("mixedCheckout.mixedDesc"),
);
const isFinalized = computed(
  () =>
    status.value?.session.status === "finalized" ||
    latestAttempt.value?.status === "finalized",
);
const needsStaffReview = computed(
  () =>
    status.value?.session.status === "partial_finalized" ||
    status.value?.allocations.some((allocation) =>
      ["admin_review_required", "paid_confirm_failed"].includes(
        allocation.status,
      ),
    ),
);
const finalizationFailed = computed(
  () => status.value?.session.status === "finalization_failed",
);
const isCancelled = computed(
  () =>
    status.value?.session.status === "cancelled" ||
    latestAttempt.value?.status === "cancelled",
);
const isTerminalSession = computed(() =>
  isTerminalSessionStatus(status.value?.session.status),
);
const expiresAtMs = computed(() => {
  const value =
    latestAttempt.value?.expires_at ?? status.value?.session.expires_at;
  return value ? new Date(value).getTime() : 0;
});
const remainingSeconds = computed(() => {
  if (!expiresAtMs.value) return 0;
  return Math.max(0, Math.floor((expiresAtMs.value - now.value) / 1000));
});
const remainingLabel = computed(() => {
  const total = remainingSeconds.value;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
});
const isExpired = computed(
  () =>
    status.value?.session.status === "expired" ||
    latestAttempt.value?.status === "expired" ||
    (expiresAtMs.value > 0 &&
      remainingSeconds.value === 0 &&
      !isFinalized.value),
);
const showCardForm = computed(
  () =>
    paymentMethod.value === "credit_card" &&
    latestAttempt.value?.status === "created" &&
    !isTerminalSession.value,
);
const shouldShowPromptPay = computed(() => paymentMethod.value === "promptpay");
const cardMaxLength = computed(() => cardNumberDisplayMaxLength(card.number));
const cvcMaxLength = computed(() => cvcLengthForCard(card.number));
const showProcessingOverlay = computed(() => submittingCard.value);

function shouldReconcileCurrentAttempt(): boolean {
  const attempt = latestAttempt.value;
  if (!attempt?.gateway_charge_id) return false;
  if (isTerminalSessionStatus(status.value?.session.status)) return false;
  if (isHardTerminalAttemptStatus(attempt.status)) return false;
  return true;
}

function updateCardNumber(value: string | number) {
  card.number = formatPaymentCardNumber(value);
}
function updateCardExpiry(value: string | number) {
  card.expiry = formatExpiryDisplay(value);
}
function updateCardCvc(value: string | number) {
  card.cvc = sanitizeCvcForCard(value, card.number);
}

watch(
  () => card.number,
  (value) => {
    const formatted = formatPaymentCardNumber(value ?? "");
    if (formatted !== value) card.number = formatted;
    card.cvc = sanitizeCvcForCard(card.cvc, formatted);
  },
);
watch(
  () => card.expiry,
  (value) => {
    const formatted = formatExpiryDisplay(value ?? "");
    if (formatted !== value) card.expiry = formatted;
  },
);

async function loadStatus() {
  if (!sessionId.value) return;
  status.value = await $fetch<MixedCheckoutStatus>(
    `/api/mixed-checkout/${encodeURIComponent(sessionId.value)}/status`,
  );
}

function startTicker() {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    now.value = Date.now();
  }, 1000);
}
function stopTicker() {
  if (!tickHandle) return;
  clearInterval(tickHandle);
  tickHandle = null;
}
function stopPolling() {
  if (!pollHandle) return;
  clearInterval(pollHandle);
  pollHandle = null;
}

async function pollPaymentAttempt() {
  if (!sessionId.value || isPaymentPollInFlight.value) return;
  isPaymentPollInFlight.value = true;
  try {
    await $fetch(
      `/api/mixed-checkout/${encodeURIComponent(sessionId.value)}/poll`,
      {
        method: "POST",
      },
    );
  } finally {
    isPaymentPollInFlight.value = false;
  }
}

async function syncPaymentStatus() {
  if (!pageActive) return;
  const shouldPoll = shouldReconcileCurrentAttempt();
  if (shouldPoll) isReconcilingPayment.value = true;
  try {
    if (shouldPoll) await pollPaymentAttempt();
    await loadStatus();
  } catch (error) {
    errorMsg.value =
      error instanceof Error
        ? error.message
        : t("mixedCheckout.statusLoadFailedDesc");
  } finally {
    if (isTerminalSession.value || isExpired.value) {
      stopPolling();
      stopTicker();
    }
    isReconcilingPayment.value = false;
  }
}

function startPolling() {
  if (pollHandle) return;
  pollHandle = setInterval(() => {
    void syncPaymentStatus();
  }, 3000);
}

async function pollPayment() {
  await syncPaymentStatus();
}

async function handleCardSubmit() {
  const expiry = parseExpiryDisplay(card.expiry);
  if (
    !card.name.trim() ||
    !isValidLuhn(card.number) ||
    !expiry ||
    card.cvc.trim().length !== cvcMaxLength.value
  ) {
    toast.add({
      title: t("cart.mixedCheckoutCardInvalidTitle"),
      description: t("cart.mixedCheckoutCardInvalidDesc"),
      color: "error",
    });
    return;
  }

  submittingCard.value = true;
  errorMsg.value = null;
  try {
    const cardToken = await createCardToken({
      name: card.name.trim(),
      number: card.number,
      expirationMonth: expiry.month,
      expirationYear: expiry.year,
      securityCode: card.cvc.trim(),
    });
    const attempt = await $fetch<MixedCheckoutInitiatedAttempt>(
      `/api/mixed-checkout/${encodeURIComponent(sessionId.value)}/initiate`,
      { method: "POST", body: { cardToken } },
    );
    await loadStatus();
    if (attempt.redirectUrl) {
      window.location.href = attempt.redirectUrl;
      return;
    }
    if (!isTerminalSession.value && attempt.status !== "failed") {
      startTicker();
      startPolling();
      await syncPaymentStatus();
    }
  } catch (error) {
    toast.add({
      title: t("cart.mixedCheckoutCreateFailedTitle"),
      description:
        error instanceof Error
          ? error.message
          : t("cart.mixedCheckoutCreateFailedDesc"),
      color: "error",
    });
  } finally {
    submittingCard.value = false;
  }
}

onMounted(async () => {
  pageActive = true;
  try {
    await loadStatus();
    startTicker();
    if (!isTerminalSession.value && !isExpired.value) {
      startPolling();
      void syncPaymentStatus();
    }
  } catch (error) {
    toast.add({
      title: t("mixedCheckout.statusLoadFailedTitle"),
      description:
        error instanceof Error
          ? error.message
          : t("mixedCheckout.statusLoadFailedDesc"),
      color: "error",
    });
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  pageActive = false;
  stopPolling();
  stopTicker();
});
</script>

<template>
  <UContainer class="py-10">
    <div class="mx-auto max-w-xl">
      <h1 class="mb-2 text-2xl font-bold">{{ pageTitle }}</h1>
      <p class="mb-6 text-sm text-muted">{{ pageDescription }}</p>

      <div v-if="loading" class="space-y-3">
        <div class="h-24 animate-pulse rounded-xl bg-elevated" />
        <div class="h-72 animate-pulse rounded-xl bg-elevated" />
      </div>

      <UCard v-else-if="!status" class="border border-error/30 bg-error/5">
        <p class="text-sm text-error">
          {{ errorMsg ?? t("mixedCheckout.statusLoadFailedDesc") }}
        </p>
        <template #footer>
          <UButton
            :label="t('mixedCheckout.backToCart')"
            to="/user/cart"
            icon="bx:arrow-back"
            color="neutral"
            variant="outline"
          />
        </template>
      </UCard>

      <template v-else>
        <UCard class="mb-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <span class="text-sm text-muted">{{
                t("mixedCheckout.amountDueNow")
              }}</span>
              <p class="mt-1 text-xs text-muted">
                {{ t("mixedCheckout.sessionId", { id: status.session.id }) }}
              </p>
            </div>
            <span class="text-2xl font-bold text-primary">
              {{
                formatCurrency(
                  status.session.amount_total,
                  status.session.currency_code,
                )
              }}
            </span>
          </div>
        </UCard>

        <UAlert
          v-if="errorMsg"
          color="error"
          variant="soft"
          icon="bx:error-circle"
          class="mb-4"
          :title="t('mixedCheckout.statusLoadFailedTitle')"
          :description="errorMsg"
        />
        <UAlert
          v-if="isFinalized"
          color="success"
          variant="soft"
          icon="bx:check-circle"
          class="mb-4"
          :title="t('mixedCheckout.paymentReceivedTitle')"
          :description="t('mixedCheckout.paymentReceivedDesc')"
        />
        <UAlert
          v-else-if="isCancelled"
          color="neutral"
          variant="soft"
          icon="bx:x-circle"
          class="mb-4"
          :title="t('mixedCheckout.cancelledTitle')"
          :description="t('mixedCheckout.cancelledDesc')"
        />
        <UAlert
          v-else-if="isExpired"
          color="warning"
          variant="soft"
          icon="bx:time-five"
          class="mb-4"
          :title="t('mixedCheckout.expiredTitle')"
          :description="t('mixedCheckout.expiredDesc')"
        />
        <UAlert
          v-if="needsStaffReview"
          color="warning"
          icon="bx:error-circle"
          class="mb-4"
          :title="t('mixedCheckout.partialFinalizedTitle')"
          :description="t('mixedCheckout.partialFinalizedDesc')"
        />
        <UAlert
          v-if="finalizationFailed"
          color="error"
          icon="bx:error"
          class="mb-4"
          :title="t('mixedCheckout.finalizationFailedTitle')"
          :description="t('mixedCheckout.finalizationFailedDesc')"
        />
        <UAlert
          v-if="isDev"
          color="warning"
          icon="bx:flask"
          class="mb-4"
          :title="t('mixedCheckout.experimentalTitle')"
          :description="t('mixedCheckout.experimentalDesc')"
        />

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                :name="
                  paymentMethod === 'credit_card' ? 'bx:credit-card' : 'bx:qr'
                "
                class="text-xl text-primary"
              />
              <h2 class="font-semibold">
                {{
                  paymentMethod === "credit_card"
                    ? t("mixedCheckout.cardPayment")
                    : t("mixedCheckout.promptPayQr")
                }}
              </h2>
            </div>
          </template>

          <form
            v-if="showCardForm"
            class="space-y-4"
            @submit.prevent="() => void handleCardSubmit()"
          >
            <UFormField :label="t('cart.cardName')">
              <UInput v-model="card.name" autocomplete="cc-name" required />
            </UFormField>
            <UFormField :label="t('cart.cardNumber')">
              <UInput
                :model-value="card.number"
                inputmode="numeric"
                pattern="[0-9 ]*"
                autocomplete="cc-number"
                placeholder="0000 0000 0000 0000"
                :maxlength="cardMaxLength"
                required
                @beforeinput="preventNonDigitBeforeInput"
                @update:model-value="updateCardNumber"
              />
            </UFormField>
            <div class="grid grid-cols-2 gap-3">
              <UFormField :label="t('cart.cardExpiry')">
                <UInput
                  :model-value="card.expiry"
                  inputmode="numeric"
                  pattern="[0-9/]*"
                  autocomplete="cc-exp"
                  placeholder="MM/YY"
                  :maxlength="5"
                  required
                  @beforeinput="preventNonDigitBeforeInput"
                  @update:model-value="updateCardExpiry"
                />
              </UFormField>
              <UFormField :label="t('cart.cardCvc')">
                <UInput
                  :model-value="card.cvc"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  autocomplete="cc-csc"
                  placeholder="123"
                  :maxlength="cvcMaxLength"
                  required
                  @beforeinput="preventNonDigitBeforeInput"
                  @update:model-value="updateCardCvc"
                />
              </UFormField>
            </div>
            <UButton
              type="submit"
              :label="
                submittingCard
                  ? t('mixedCheckout.processing')
                  : t('cart.mixedCheckoutPayNow')
              "
              icon="bx:lock"
              size="lg"
              block
              :loading="submittingCard"
              :disabled="submittingCard"
            />
          </form>

          <div
            v-else-if="isCancelled"
            class="flex flex-col items-center gap-4 py-8 text-center"
          >
            <UIcon name="bx:x-circle" class="text-6xl text-muted" />
            <p class="font-medium">{{ t("mixedCheckout.cancelledTitle") }}</p>
            <p class="text-sm text-muted">
              {{ t("mixedCheckout.cancelledDesc") }}
            </p>
            <UButton
              :label="t('mixedCheckout.backToCart')"
              to="/user/cart"
              icon="bx:arrow-back"
            />
          </div>

          <div
            v-else-if="isFinalized"
            class="flex flex-col items-center gap-4 py-8 text-center"
          >
            <UIcon name="bx:check-circle" class="text-6xl text-success" />
            <p class="font-medium">
              {{ t("mixedCheckout.paymentReceivedTitle") }}
            </p>
            <UButton
              :label="t('mixedCheckout.backToCart')"
              to="/user/cart"
              icon="bx:arrow-back"
            />
          </div>

          <div
            v-else-if="shouldShowPromptPay"
            class="flex flex-col items-center gap-4"
          >
            <template v-if="!latestAttempt">
              <div class="h-72 w-72 animate-pulse rounded-lg bg-elevated" />
              <p class="text-sm text-muted">
                {{ t("mixedCheckout.preparingQr") }}
              </p>
            </template>
            <template v-else-if="isExpired">
              <UIcon name="bx:time-five" class="text-5xl text-warning" />
              <p class="text-sm text-muted">
                {{ t("mixedCheckout.expiredTitle") }}
              </p>
              <UButton
                :label="t('mixedCheckout.backToCart')"
                to="/user/cart"
                icon="bx:arrow-back"
              />
            </template>
            <template v-else-if="latestAttempt.qr_image_url">
              <img
                :src="latestAttempt.qr_image_url"
                :alt="t('mixedCheckout.promptPayQr')"
                class="h-72 w-72 rounded-lg border bg-white object-contain p-2"
              />
              <p class="text-sm text-muted">
                {{ t("mixedCheckout.timeLeft") }}:
                <span class="font-mono font-semibold text-default">{{
                  remainingLabel
                }}</span>
              </p>
              <p class="text-xs text-muted">{{ t("mixedCheckout.pending") }}</p>
            </template>
            <template v-else>
              <div class="h-72 w-72 animate-pulse rounded-lg bg-elevated" />
              <p class="text-sm text-muted">
                {{ t("mixedCheckout.preparingQr") }}
              </p>
            </template>
          </div>

          <div v-else class="flex flex-col items-center gap-4 py-8 text-center">
            <UButton
              v-if="latestAttempt?.gateway_authorize_uri"
              :to="latestAttempt.gateway_authorize_uri"
              external
              icon="bx:credit-card"
            >
              {{ t("mixedCheckout.continueCardAuth") }}
            </UButton>
            <p v-else class="text-sm text-muted">
              {{ t("mixedCheckout.noQr") }}
            </p>
          </div>

          <div
            v-if="isReconcilingPayment"
            class="mt-4 inline-flex items-center gap-2 rounded-full bg-elevated px-3 py-1 text-xs text-muted"
          >
            <UIcon name="bx:loader-alt" class="animate-spin" />
            <span>{{ t("mixedCheckout.checkingStatus") }}</span>
          </div>

          <template #footer>
            <div
              class="flex items-center justify-between gap-3 text-xs text-muted"
            >
              <span>{{ t("mixedCheckout.notReceipt") }}</span>
              <UButton
                size="xs"
                variant="ghost"
                :loading="isReconcilingPayment"
                @click="pollPayment"
              >
                {{ t("mixedCheckout.refreshStatus") }}
              </UButton>
            </div>
          </template>
        </UCard>

        <UCard class="mt-6">
          <template #header>
            <h2 class="font-semibold">
              {{ t("mixedCheckout.allocationBreakdown") }}
            </h2>
          </template>
          <div class="space-y-2 text-sm">
            <div
              v-for="allocation in status.allocations"
              :key="allocation.id"
              class="flex justify-between gap-3 rounded-md bg-elevated/40 p-3"
            >
              <div>
                <p class="font-medium">{{ allocationLabel(allocation) }}</p>
                <p class="text-xs text-muted">{{ allocation.status }}</p>
              </div>
              <p class="font-medium">
                {{
                  formatCurrency(allocation.amount, allocation.currency_code)
                }}
              </p>
            </div>
          </div>
        </UCard>

        <UCard
          v-if="status.rentalBookings.length || status.saleOrder"
          class="mt-6"
        >
          <template #header>
            <h2 class="font-semibold">
              {{ t("mixedCheckout.paymentDetails") }}
            </h2>
          </template>
          <div class="space-y-2 text-sm">
            <div v-if="status.saleOrder" class="flex justify-between gap-3">
              <span class="text-muted">{{
                t("mixedCheckout.saleOrderStatus")
              }}</span>
              <span
                >{{ status.saleOrder.payment_status }} /
                {{ status.saleOrder.status }}</span
              >
            </div>
            <div
              v-for="booking in status.rentalBookings"
              :key="booking.id"
              class="flex justify-between gap-3"
            >
              <span class="text-muted">{{ booking.id }}</span>
              <span
                >{{ booking.status }} /
                {{ booking.booking_deposit_payment_status }}</span
              >
            </div>
          </div>
        </UCard>
      </template>
    </div>

    <Teleport to="body">
      <Transition name="payment-fade">
        <div v-if="showProcessingOverlay" class="payment-overlay">
          <div class="payment-loader" />
          <p class="payment-overlay__label">
            {{ t("mixedCheckout.processing") }}
          </p>
        </div>
      </Transition>
    </Teleport>
  </UContainer>
</template>
