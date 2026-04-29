<script setup lang="ts">
/**
 * Payment result landing page. Used as Omise return_uri after 3DS redirect
 * and as a terminal-status destination from /payment/[orderId].
 */
import type { LocaleCode } from "~/types/locale";

interface PaymentStatusResp {
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: "credit_card" | "promptpay" | "company_credit" | null;
  amount: number;
  currency: string;
  latestAttempt: {
    paymentAttemptId: string;
    status: string;
    method: string;
  } | null;
}

const STRINGS = {
  th: {
    title: "ผลการชำระเงิน",
    confirming: "กำลังดำเนินการ",
    paid: "ชำระเงินสำเร็จ",
    paidDesc: "ระบบยืนยันการชำระเงินเรียบร้อยแล้ว ขอบคุณที่ใช้บริการ",
    failed: "การชำระเงินล้มเหลว",
    failedDesc: "ไม่สามารถดำเนินการชำระเงินได้ กรุณาลองใหม่",
    pending: "กำลังรอผลการยืนยัน",
    pendingDesc: "ระบบกำลังรอผลจากธนาคาร โปรดรอสักครู่...",
    expired: "การชำระเงินหมดอายุ",
    expiredDesc: "QR หรือรายการชำระเงินหมดอายุ กรุณาเริ่มใหม่",
    cancelled: "ยกเลิกการชำระเงิน",
    refunded: "คืนเงินเรียบร้อย",
    notFound: "ไม่พบคำสั่งซื้อ",
    viewOrders: "ดูประวัติคำสั่งซื้อ",
    retry: "ลองชำระเงินอีกครั้ง",
    backToCart: "กลับไปที่ตะกร้า",
    amount: "ยอดชำระ",
  },
  en: {
    title: "Payment result",
    confirming: "Processing your payment",
    paid: "Payment successful",
    paidDesc: "Your payment has been confirmed. Thank you for your order.",
    failed: "Payment failed",
    failedDesc: "We couldn't process your payment. Please try again.",
    pending: "Waiting for confirmation",
    pendingDesc: "Waiting for the bank to confirm your payment...",
    expired: "Payment expired",
    expiredDesc: "Your payment session has expired. Please start again.",
    cancelled: "Payment cancelled",
    refunded: "Payment refunded",
    notFound: "Order not found",
    viewOrders: "View orders",
    retry: "Retry payment",
    backToCart: "Back to cart",
    amount: "Amount",
  },
} as const;

const route = useRoute();
const { locale } = useI18n();
const { isLoggedIn, user } = useAuthSession();
const { clearCartPersisted } = useCart();

const orderId = computed(() => {
  const value = route.query.orderId;
  return Array.isArray(value) ? (value[0] ?? "") : ((value as string) ?? "");
});
const lang = computed<LocaleCode>(() => (locale.value as LocaleCode) ?? "th");
const s = computed(() => STRINGS[lang.value === "en" ? "en" : "th"]);

const status = ref<PaymentStatusResp | null>(null);
const loading = ref(true);
const errorMsg = ref<string | null>(null);

// Polling guards. The user can land here directly via 3DS return_uri before
// the Omise webhook has fired, so we re-fetch status until it reaches a
// terminal state (or we hit the time budget).
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 60_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollStartedAt = 0;
let cartCleared = false;

function isTerminalPaymentStatus(ps: string | undefined): boolean {
  return (
    ps === "paid" ||
    ps === "failed" ||
    ps === "expired" ||
    ps === "cancelled" ||
    ps === "refunded"
  );
}

/**
 * On 3DS return the Supabase session may still be rehydrating, so user.value
 * is briefly null. Wait up to ~3s for the session before clearing the cart so
 * clearCartPersisted() actually targets the user's localStorage + DB row
 * instead of falling through to the unused guest buffer branch.
 */
async function waitForSessionHydrated(timeoutMs = 3000): Promise<void> {
  if (user.value) return;
  const startedAt = Date.now();
  while (!user.value && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function clearCartIfPaidOnce(): Promise<void> {
  if (cartCleared) return;
  if (status.value?.paymentStatus !== "paid") return;
  cartCleared = true;
  try {
    await waitForSessionHydrated();
    await clearCartPersisted();
  } catch {
    // Non-fatal: payment is already confirmed; cart will be cleared lazily.
  }
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(): void {
  pollStartedAt = Date.now();
  pollTimer = setInterval(async () => {
    if (Date.now() - pollStartedAt > POLL_MAX_MS) {
      stopPolling();
      return;
    }
    await refreshStatus();
    if (isTerminalPaymentStatus(status.value?.paymentStatus)) {
      stopPolling();
      await clearCartIfPaidOnce();
    }
  }, POLL_INTERVAL_MS);
}

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) navigateTo("/user/login");
});

async function refreshStatus(): Promise<void> {
  if (!orderId.value) {
    errorMsg.value = s.value.notFound;
    return;
  }
  try {
    status.value = await $fetch<PaymentStatusResp>(
      `/api/payments/status/${encodeURIComponent(orderId.value)}`,
    );
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : s.value.notFound;
  }
}

const view = computed<{
  icon: string;
  color: string;
  title: string;
  description: string;
  showRetry: boolean;
}>(() => {
  const ps = status.value?.paymentStatus ?? "";
  if (ps === "paid") {
    return {
      icon: "bx:check-circle",
      color: "text-success",
      title: s.value.paid,
      description: s.value.paidDesc,
      showRetry: false,
    };
  }
  if (ps === "refunded") {
    return {
      icon: "bx:undo",
      color: "text-info",
      title: s.value.refunded,
      description: s.value.paidDesc,
      showRetry: false,
    };
  }
  if (ps === "cancelled") {
    return {
      icon: "bx:x-circle",
      color: "text-error",
      title: s.value.cancelled,
      description: s.value.failedDesc,
      showRetry: true,
    };
  }
  const attemptStatus = status.value?.latestAttempt?.status;
  if (attemptStatus === "expired") {
    return {
      icon: "bx:time-five",
      color: "text-warning",
      title: s.value.expired,
      description: s.value.expiredDesc,
      showRetry: true,
    };
  }
  if (attemptStatus === "failed") {
    return {
      icon: "bx:error-circle",
      color: "text-error",
      title: s.value.failed,
      description: s.value.failedDesc,
      showRetry: true,
    };
  }
  return {
    icon: "bx:loader-alt",
    color: "text-muted animate-spin",
    title: s.value.pending,
    description: s.value.pendingDesc,
    showRetry: false,
  };
});

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(lang.value === "en" ? "en-US" : "th-TH", {
    style: "currency",
    currency: currency || "THB",
    minimumFractionDigits: 2,
  }).format(amount);
}

onMounted(async () => {
  await refreshStatus();
  loading.value = false;
  // Clear cart only on confirmed paid; preserve on any other state so the
  // user can retry without losing their items.
  if (isTerminalPaymentStatus(status.value?.paymentStatus)) {
    await clearCartIfPaidOnce();
  } else {
    // Webhook may not have arrived yet (esp. on 3DS return). Keep polling
    // until status becomes terminal or the time budget elapses.
    startPolling();
  }
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <UContainer class="py-12">
    <div class="mx-auto max-w-lg">
      <!-- Initial status fetch — show the shared overlay loader instead of
           empty skeleton boxes, matching the /payment/[orderId] experience. -->
      <UCard v-if="loading && !status" class="invisible">
        <div class="h-24" />
      </UCard>

      <UCard v-else-if="!status" class="border border-error/30 bg-error/5">
        <p class="text-sm text-error">{{ errorMsg ?? s.notFound }}</p>
        <template #footer>
          <UButton
            :label="s.viewOrders"
            to="/user/orders"
            icon="bx:list-ul"
            color="neutral"
            variant="outline"
          />
        </template>
      </UCard>

      <UCard v-else>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon :name="view.icon" :class="['text-3xl', view.color]" />
            <div>
              <h1 class="text-xl font-bold">{{ view.title }}</h1>
              <p class="text-sm text-muted">{{ view.description }}</p>
            </div>
          </div>
        </template>

        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">{{ s.amount }}</span>
            <span class="font-semibold">
              {{ formatAmount(status.amount, status.currency) }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Order</span>
            <span class="font-mono text-xs">{{ status.orderId }}</span>
          </div>
        </div>

        <template #footer>
          <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <UButton
              v-if="view.showRetry"
              :label="s.retry"
              :to="`/payment/${status.orderId}`"
              icon="bx:refresh"
              color="primary"
            />
            <UButton
              v-if="view.showRetry"
              :label="s.backToCart"
              to="/user/cart"
              icon="bx:cart"
              variant="outline"
              color="neutral"
            />
            <UButton
              :label="s.viewOrders"
              to="/user/orders"
              icon="bx:list-ul"
              :variant="view.showRetry ? 'outline' : 'solid'"
              :color="view.showRetry ? 'neutral' : 'primary'"
            />
          </div>
        </template>
      </UCard>
    </div>

    <!-- Full-screen processing overlay shown during the initial status fetch.
         Shared CSS classes live in app/assets/css/main.css. -->
    <Teleport to="body">
      <Transition name="payment-fade">
        <div v-if="loading" class="payment-overlay">
          <div class="payment-loader" />
          <p class="payment-overlay__label">{{ s.confirming }}</p>
        </div>
      </Transition>
    </Teleport>
  </UContainer>
</template>
