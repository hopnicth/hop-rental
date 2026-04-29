<script setup lang="ts">
/**
 * Payment gateway page. Branches by paymentMethod:
 *   - credit_card: collect card via Omise.js, tokenize, call /api/payments/initiate,
 *     handle 3DS redirect, success or failure.
 *   - promptpay: auto-initiate, show QR + countdown, poll status until terminal.
 */
import type { LocaleCode } from "~/types/locale";

interface PaymentAttemptResp {
  paymentAttemptId: string;
  orderId: string;
  method: "credit_card" | "promptpay";
  status: string;
  amount: number;
  currency: string;
  redirectUrl: string | null;
  qrImageUrl: string | null;
  expiresAt: string | null;
}

interface PaymentStatusResp {
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: "credit_card" | "promptpay" | "company_credit" | null;
  amount: number;
  currency: string;
  attempts: PaymentAttemptResp[];
  latestAttempt: PaymentAttemptResp | null;
}

const STRINGS = {
  th: {
    title: "ชำระเงิน",
    summary: "ยอดที่ต้องชำระ",
    cardName: "ชื่อบนบัตร",
    cardNumber: "หมายเลขบัตร",
    expiry: "วันหมดอายุ (MM/YY)",
    cvc: "CVC",
    pay: "ชำระเงิน",
    processing: "กำลังประมวลผล...",
    confirming: "กำลังดำเนินการ",
    cancel: "ยกเลิก",
    cancelConfirm: "ต้องการยกเลิกการชำระเงินนี้?",
    invalidCard: "หมายเลขบัตรไม่ถูกต้อง",
    promptPayTitle: "สแกน QR ด้วยแอปธนาคารเพื่อชำระเงิน",
    timeLeft: "QR จะหมดอายุใน",
    expired: "QR หมดอายุ",
    retry: "ลองใหม่อีกครั้ง",
    pending: "รอการยืนยันจากธนาคาร...",
    preparingQr: "กำลังสร้าง QR...",
    failed: "การชำระเงินล้มเหลว",
    failedDesc: "กรุณาลองใหม่อีกครั้ง หรือเลือกวิธีอื่น",
    backToCart: "กลับไปที่ตะกร้า",
    notFound: "ไม่พบคำสั่งซื้อ",
    methodMissing: "คำสั่งซื้อนี้ยังไม่ได้เลือกวิธีชำระเงิน",
  },
  en: {
    title: "Payment",
    summary: "Amount due",
    cardName: "Cardholder name",
    cardNumber: "Card number",
    expiry: "Expiry (MM/YY)",
    cvc: "CVC",
    pay: "Pay",
    processing: "Processing...",
    confirming: "Processing your payment",
    cancel: "Cancel",
    cancelConfirm: "Cancel this payment?",
    invalidCard: "Invalid card number",
    promptPayTitle: "Scan the QR code with your banking app to pay",
    timeLeft: "QR expires in",
    expired: "QR expired",
    retry: "Try again",
    pending: "Waiting for bank confirmation...",
    preparingQr: "Preparing QR...",
    failed: "Payment failed",
    failedDesc: "Please try again or choose another method.",
    backToCart: "Back to cart",
    notFound: "Order not found",
    methodMissing: "No payment method was selected for this order.",
  },
} as const;

const route = useRoute();
const { locale } = useI18n();
const { isLoggedIn } = useAuthSession();
const { createCardToken } = useOmise();
const { clearCartPersisted } = useCart();

const orderId = computed(() => String(route.params.orderId ?? ""));
const lang = computed<LocaleCode>(() => (locale.value as LocaleCode) ?? "th");
const s = computed(() => STRINGS[lang.value === "en" ? "en" : "th"]);

const status = ref<PaymentStatusResp | null>(null);
const loading = ref(true);
const submitting = ref(false);
const cancelling = ref(false);
const errorMsg = ref<string | null>(null);
const idempotencyKey = ref(
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `pay_${Date.now()}_${Math.random().toString(36).slice(2)}`,
);

const card = reactive({ name: "", number: "", expiry: "", cvc: "" });

// ── Card-number formatting & validation ──
// Best practices: detect brand from BIN/IIN, cap input length per brand,
// and apply brand-specific gap pattern (Amex 4-6-5, others 4-4-4-4 or
// 4-4-4-4-3 for 19-digit cards). Final validation uses Luhn (mod-10) before
// tokenization.
type CardBrand = {
  brand: string;
  maxDigits: number;
  gaps: number[];
};
function detectCardBrand(digits: string): CardBrand {
  if (/^3[47]/.test(digits))
    return { brand: "amex", maxDigits: 15, gaps: [4, 10] };
  if (/^35/.test(digits))
    return { brand: "jcb", maxDigits: 19, gaps: [4, 8, 12, 16] };
  if (/^(30[0-5]|36|38|39)/.test(digits))
    return { brand: "diners", maxDigits: 14, gaps: [4, 10] };
  if (/^4/.test(digits))
    return { brand: "visa", maxDigits: 19, gaps: [4, 8, 12, 16] };
  if (/^(5[1-5]|2[2-7])/.test(digits))
    return { brand: "mastercard", maxDigits: 16, gaps: [4, 8, 12] };
  if (/^(6011|65|64[4-9]|622)/.test(digits))
    return { brand: "discover", maxDigits: 19, gaps: [4, 8, 12, 16] };
  if (/^(62|81)/.test(digits))
    return { brand: "unionpay", maxDigits: 19, gaps: [4, 8, 12, 16] };
  return { brand: "unknown", maxDigits: 19, gaps: [4, 8, 12, 16] };
}
function formatCardNumber(input: string): string {
  const all = (input ?? "").replace(/[^0-9]/g, "");
  const brand = detectCardBrand(all);
  const digits = all.slice(0, brand.maxDigits);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && brand.gaps.includes(i)) out += " ";
    out += digits[i];
  }
  return out;
}
function formatExpiry(input: string): string {
  const digits = (input ?? "").replace(/[^0-9]/g, "").slice(0, 4);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
// Luhn (mod-10) check. PCI-acceptable digit range is 12–19.
function isValidLuhn(digits: string): boolean {
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i] ?? "0", 10);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
watch(
  () => card.number,
  (val) => {
    const formatted = formatCardNumber(val ?? "");
    if (formatted !== val) card.number = formatted;
  },
);
watch(
  () => card.expiry,
  (val) => {
    const formatted = formatExpiry(val ?? "");
    if (formatted !== val) card.expiry = formatted;
  },
);
// Brand-aware maxlength for the card-number input. Equals the brand's
// digit cap plus the number of gaps that fall before that cap.
const cardMaxLength = computed(() => {
  const digits = card.number.replace(/[^0-9]/g, "");
  const brand = detectCardBrand(digits);
  const gapsApplied = brand.gaps.filter((g) => g < brand.maxDigits).length;
  return brand.maxDigits + gapsApplied;
});

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) navigateTo("/user/login");
});

const method = computed(() => status.value?.paymentMethod ?? null);
const latestAttempt = computed(() => status.value?.latestAttempt ?? null);

const isTerminalStatus = computed(() => {
  const ps = status.value?.paymentStatus;
  return ps === "paid" || ps === "cancelled" || ps === "refunded";
});

const isPromptPayExpired = computed(
  () => latestAttempt.value?.status === "expired",
);

async function refreshStatus(): Promise<void> {
  if (!orderId.value) return;
  try {
    status.value = await $fetch<PaymentStatusResp>(
      `/api/payments/status/${encodeURIComponent(orderId.value)}`,
    );
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : s.value.notFound;
  }
}

async function goToResult(): Promise<void> {
  if (status.value?.paymentStatus === "paid") {
    try {
      await clearCartPersisted();
    } catch {
      // Non-fatal: payment is already confirmed; cart will be cleared lazily.
    }
  }
  await navigateTo({
    path: "/payment/result",
    query: { orderId: orderId.value },
  });
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(lang.value === "en" ? "en-US" : "th-TH", {
    style: "currency",
    currency: currency || "THB",
    minimumFractionDigits: 2,
  }).format(amount);
}

// ── PromptPay countdown ──
const now = ref(Date.now());
let tickHandle: ReturnType<typeof setInterval> | null = null;
function startTicker(): void {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    now.value = Date.now();
  }, 1000);
}
function stopTicker(): void {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}
const expiresAtMs = computed(() => {
  const expiresAt = latestAttempt.value?.expiresAt;
  return expiresAt ? new Date(expiresAt).getTime() : 0;
});
const remainingSeconds = computed(() => {
  if (!expiresAtMs.value) return 0;
  return Math.max(0, Math.floor((expiresAtMs.value - now.value) / 1000));
});
const remainingLabel = computed(() => {
  const total = remainingSeconds.value;
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
});

// ── Status polling ──
let pollHandle: ReturnType<typeof setInterval> | null = null;
function stopPolling(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}
function startPolling(): void {
  if (pollHandle) return;
  pollHandle = setInterval(async () => {
    await refreshStatus();
    if (isTerminalStatus.value) {
      stopPolling();
      stopTicker();
      void goToResult();
    }
  }, 3000);
}

async function initiatePayment(
  cardToken?: string,
): Promise<PaymentAttemptResp> {
  return await $fetch<PaymentAttemptResp>("/api/payments/initiate", {
    method: "POST",
    body: {
      orderId: orderId.value,
      method: method.value,
      idempotencyKey: idempotencyKey.value,
      ...(cardToken ? { cardToken } : {}),
    },
  });
}

function parseExpiry(input: string): { month: number; year: number } | null {
  const trimmed = input.replace(/\s+/g, "");
  const match = trimmed.match(/^(\d{1,2})\/?(\d{2}|\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  let year = Number(match[2]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return null;
  return { month, year };
}

async function handleCardSubmit(): Promise<void> {
  errorMsg.value = null;
  const digitsOnly = card.number.replace(/[^0-9]/g, "");
  if (!isValidLuhn(digitsOnly)) {
    errorMsg.value = s.value.invalidCard;
    return;
  }
  const expiry = parseExpiry(card.expiry);
  if (!expiry) {
    errorMsg.value = s.value.expiry;
    return;
  }
  submitting.value = true;
  try {
    const token = await createCardToken({
      name: card.name.trim(),
      number: card.number,
      expirationMonth: expiry.month,
      expirationYear: expiry.year,
      securityCode: card.cvc.trim(),
    });
    const attempt = await initiatePayment(token);
    if (attempt.redirectUrl) {
      window.location.href = attempt.redirectUrl;
      return;
    }
    if (attempt.status === "paid") {
      await refreshStatus();
      await goToResult();
      return;
    }
    if (attempt.status === "failed") {
      errorMsg.value = s.value.failed;
      return;
    }
    await refreshStatus();
    if (isTerminalStatus.value) await goToResult();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : s.value.failed;
  } finally {
    submitting.value = false;
  }
}

async function handlePromptPayRetry(): Promise<void> {
  errorMsg.value = null;
  idempotencyKey.value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `pay_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  submitting.value = true;
  try {
    await initiatePayment();
    await refreshStatus();
    startTicker();
    startPolling();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : s.value.failed;
  } finally {
    submitting.value = false;
  }
}

// User-initiated cancel. Marks the order/attempt cancelled server-side,
// best-effort expires the gateway charge, then sends the user back to the
// cart with their items still in place.
async function handleCancel(): Promise<void> {
  if (cancelling.value) return;
  if (typeof window !== "undefined" && !window.confirm(s.value.cancelConfirm)) {
    return;
  }
  cancelling.value = true;
  stopPolling();
  stopTicker();
  try {
    await $fetch("/api/payments/cancel", {
      method: "POST",
      body: { orderId: orderId.value },
    });
  } catch {
    // Swallow: even on failure we send the user back to cart and let
    // server-side reconciliation clean up any drift.
  } finally {
    cancelling.value = false;
  }
  await navigateTo("/user/cart");
}

onMounted(async () => {
  await refreshStatus();
  loading.value = false;
  if (isTerminalStatus.value) {
    await goToResult();
    return;
  }
  if (method.value === "promptpay") {
    if (!latestAttempt.value || latestAttempt.value.status === "expired") {
      try {
        await initiatePayment();
        await refreshStatus();
      } catch (err) {
        errorMsg.value = err instanceof Error ? err.message : s.value.failed;
      }
    }
    startTicker();
    startPolling();
  }
});

onBeforeUnmount(() => {
  stopPolling();
  stopTicker();
});
</script>

<template>
  <UContainer class="py-10">
    <div class="mx-auto max-w-xl">
      <h1 class="mb-6 text-2xl font-bold">{{ s.title }}</h1>

      <div v-if="loading" class="space-y-3">
        <div class="h-24 animate-pulse rounded-xl bg-elevated" />
        <div class="h-48 animate-pulse rounded-xl bg-elevated" />
      </div>

      <UCard v-else-if="!status" class="border border-error/30 bg-error/5">
        <p class="text-sm text-error">{{ errorMsg ?? s.notFound }}</p>
        <template #footer>
          <UButton
            :label="s.backToCart"
            to="/user/cart"
            icon="bx:arrow-back"
            color="neutral"
            variant="outline"
          />
        </template>
      </UCard>

      <template v-else>
        <UCard class="mb-6">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted">{{ s.summary }}</span>
            <span class="text-2xl font-bold text-primary">
              {{ formatAmount(status.amount, status.currency) }}
            </span>
          </div>
        </UCard>

        <UAlert
          v-if="errorMsg"
          color="error"
          variant="soft"
          icon="bx:error-circle"
          class="mb-4"
          :title="s.failed"
          :description="errorMsg"
        />

        <UCard v-if="!method" class="border border-warning/30 bg-warning/5">
          <p class="text-sm">{{ s.methodMissing }}</p>
          <template #footer>
            <UButton
              :label="s.backToCart"
              to="/user/cart"
              icon="bx:arrow-back"
              color="neutral"
              variant="outline"
            />
          </template>
        </UCard>

        <!-- Credit card form -->
        <UCard v-else-if="method === 'credit_card'">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="bx:credit-card" class="text-xl text-primary" />
              <h2 class="font-semibold">{{ s.title }}</h2>
            </div>
          </template>
          <form
            class="space-y-4"
            @submit.prevent="() => void handleCardSubmit()"
          >
            <UFormField :label="s.cardName">
              <UInput v-model="card.name" autocomplete="cc-name" required />
            </UFormField>
            <UFormField :label="s.cardNumber">
              <UInput
                v-model="card.number"
                inputmode="numeric"
                autocomplete="cc-number"
                placeholder="0000 0000 0000 0000"
                :maxlength="cardMaxLength"
                required
              />
            </UFormField>
            <div class="grid grid-cols-2 gap-3">
              <UFormField :label="s.expiry">
                <UInput
                  v-model="card.expiry"
                  inputmode="numeric"
                  autocomplete="cc-exp"
                  placeholder="MM/YY"
                  :maxlength="5"
                  required
                />
              </UFormField>
              <UFormField :label="s.cvc">
                <UInput
                  v-model="card.cvc"
                  inputmode="numeric"
                  autocomplete="cc-csc"
                  placeholder="123"
                  :maxlength="4"
                  required
                />
              </UFormField>
            </div>
            <UButton
              type="submit"
              :label="submitting ? s.processing : s.pay"
              icon="bx:lock"
              size="lg"
              block
              :loading="submitting"
              :disabled="submitting"
            />
            <UButton
              :label="s.cancel"
              icon="bx:x"
              size="lg"
              block
              color="neutral"
              variant="ghost"
              :disabled="cancelling"
              :loading="cancelling"
              @click="() => void handleCancel()"
            />
          </form>
        </UCard>

        <!-- PromptPay QR -->
        <UCard v-else-if="method === 'promptpay'">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="bx:qr" class="text-xl text-primary" />
              <h2 class="font-semibold">{{ s.promptPayTitle }}</h2>
            </div>
          </template>

          <div class="flex flex-col items-center gap-4">
            <!-- Pre-charge / initial load: avoids flashing the "expired"
                 panel before the first QR has been created. -->
            <template v-if="!latestAttempt">
              <div class="h-72 w-72 animate-pulse rounded-lg bg-elevated" />
              <p class="text-sm text-muted">{{ s.preparingQr }}</p>
            </template>
            <!-- Truly expired: gateway said so, OR local countdown ran out. -->
            <template
              v-else-if="
                isPromptPayExpired ||
                (expiresAtMs > 0 && remainingSeconds === 0)
              "
            >
              <UIcon name="bx:time-five" class="text-5xl text-warning" />
              <p class="text-sm text-muted">{{ s.expired }}</p>
              <UButton
                :label="s.retry"
                icon="bx:refresh"
                size="lg"
                :loading="submitting"
                @click="() => void handlePromptPayRetry()"
              />
            </template>
            <template v-else-if="latestAttempt.qrImageUrl">
              <img
                :src="latestAttempt.qrImageUrl"
                alt="PromptPay QR"
                class="h-72 w-72 rounded-lg border bg-white object-contain p-2"
              />
              <p class="text-sm text-muted">
                {{ s.timeLeft }}:
                <span class="font-mono font-semibold text-default">
                  {{ remainingLabel }}
                </span>
              </p>
              <p class="text-xs text-muted">{{ s.pending }}</p>
            </template>
            <template v-else>
              <div class="h-72 w-72 animate-pulse rounded-lg bg-elevated" />
              <p class="text-sm text-muted">{{ s.preparingQr }}</p>
            </template>
          </div>
        </UCard>

        <!-- Cancel sits OUTSIDE the QR card so internal state changes
             (loader, expired panel, etc.) can never displace it. -->
        <div v-if="method === 'promptpay'" class="mt-4">
          <UButton
            :label="s.cancel"
            icon="bx:x"
            size="lg"
            block
            color="neutral"
            variant="ghost"
            :disabled="cancelling"
            :loading="cancelling"
            @click="() => void handleCancel()"
          />
        </div>
      </template>
    </div>

    <!-- Full-screen processing overlay (white backdrop, theme-yellow loader).
         Only shown during empty waiting periods (card submit / retry init).
         Styles are global in app/assets/css/main.css and shared with the
         payment-result page. -->
    <Teleport to="body">
      <Transition name="payment-fade">
        <div v-if="submitting" class="payment-overlay">
          <div class="payment-loader" />
          <p class="payment-overlay__label">{{ s.confirming }}</p>
        </div>
      </Transition>
    </Teleport>
  </UContainer>
</template>
