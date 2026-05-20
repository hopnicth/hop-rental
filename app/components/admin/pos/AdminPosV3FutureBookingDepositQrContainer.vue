<script setup lang="ts">
interface DraftBookingResult {
  booking: {
    id: string;
    asset: { code: string | null; name: string };
    customer: {
      kind: "account" | "walk_in";
      userId: string | null;
      walkInPhone: string | null;
      bookerName: string | null;
    };
    dates: {
      startDate: string;
      customerReturnDate: string;
      rentalDays: number;
    };
  };
  quote: {
    currencyCode: string;
    bookingDepositDueNow: number;
    requiredSecurityDepositAmount: number;
    remainingSecurityDepositDueAtPickup: number;
  };
}

type QrAttemptStatus =
  | "pending"
  | "requires_action"
  | "finalizing"
  | "paid"
  | "paid_confirm_failed"
  | "expired"
  | "failed"
  | "cancelled";

interface QrAttemptResponse {
  paymentAttemptId: string;
  qrImageUrl: string | null;
  amount: number;
  currency: string;
  expiresAt: string | null;
  status: QrAttemptStatus;
}

interface QrBookingConfirmedResult extends QrAttemptResponse {
  bookingId: string;
  paymentMethod: "promptpay_qr";
}

const props = defineProps<{ draftResult: DraftBookingResult }>();
const emit = defineEmits<{
  "booking-confirmed": [result: QrBookingConfirmedResult];
}>();

const attempt = ref<QrAttemptResponse | null>(null);
const idempotencyKey = ref(crypto.randomUUID());
const isCreating = ref(false);
const isPolling = ref(false);
const createError = ref<string | null>(null);
const pollError = ref<string | null>(null);
const now = ref(Date.now());
const hasEmittedConfirmed = ref(false);

let pollHandle: ReturnType<typeof setInterval> | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;
let componentActive = false;

const terminalStatuses: QrAttemptStatus[] = [
  "paid",
  "paid_confirm_failed",
  "expired",
  "failed",
  "cancelled",
];
const isTerminalStatus = computed(() =>
  Boolean(attempt.value && terminalStatuses.includes(attempt.value.status)),
);
const isPending = computed(() => attempt.value?.status === "pending");
// requires_action: stale DB value from old mapper — treat the same as pending (QR still active).
const isRequiresAction = computed(
  () => attempt.value?.status === "requires_action",
);
const isFinalizing = computed(() => attempt.value?.status === "finalizing");
const isPaid = computed(() => attempt.value?.status === "paid");
const isDegradedSuccess = computed(
  () => attempt.value?.status === "paid_confirm_failed",
);
const isExpired = computed(() => attempt.value?.status === "expired");
const isFailed = computed(() => attempt.value?.status === "failed");
const canRegenerate = computed(
  () =>
    isExpired.value || isFailed.value || attempt.value?.status === "cancelled",
);
const isZeroDue = computed(
  () => props.draftResult.quote.bookingDepositDueNow <= 0,
);

const expiresAtMs = computed(() =>
  attempt.value?.expiresAt ? new Date(attempt.value.expiresAt).getTime() : 0,
);
const remainingSeconds = computed(() =>
  expiresAtMs.value
    ? Math.max(0, Math.floor((expiresAtMs.value - now.value) / 1000))
    : 0,
);
const remainingLabel = computed(() => {
  const total = remainingSeconds.value;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
});
const isLocallyPastExpiry = computed(() =>
  Boolean(
    expiresAtMs.value &&
    remainingSeconds.value === 0 &&
    (isPending.value || isRequiresAction.value),
  ),
);

function fmt(value: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function stopPolling() {
  if (!pollHandle) return;
  clearInterval(pollHandle);
  pollHandle = null;
}
function startPolling() {
  if (pollHandle || !attempt.value || isTerminalStatus.value) return;
  if (
    !["pending", "requires_action", "finalizing"].includes(attempt.value.status)
  )
    return;
  pollHandle = setInterval(() => void pollQrAttempt(), 3000);
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
function resetAttemptState() {
  stopPolling();
  attempt.value = null;
  createError.value = null;
  pollError.value = null;
  hasEmittedConfirmed.value = false;
}

function emitConfirmedOnce(result: QrAttemptResponse) {
  if (hasEmittedConfirmed.value || result.status !== "paid") return;
  hasEmittedConfirmed.value = true;
  emit("booking-confirmed", {
    ...result,
    bookingId: props.draftResult.booking.id,
    paymentMethod: "promptpay_qr",
  });
}

async function createQrAttempt() {
  if (isCreating.value || isZeroDue.value) return;
  resetAttemptState();
  idempotencyKey.value = crypto.randomUUID();
  isCreating.value = true;
  try {
    const result = await $fetch<QrAttemptResponse>(
      `/api/admin/pos-v3/rental-bookings/${encodeURIComponent(props.draftResult.booking.id)}/booking-deposit-qr`,
      {
        method: "POST",
        body: {
          idempotencyKey: idempotencyKey.value,
          amount: props.draftResult.quote.bookingDepositDueNow,
        },
      },
    );
    if (!componentActive) return;
    attempt.value = result;
    emitConfirmedOnce(result);
    startPolling();
  } catch (err: unknown) {
    createError.value =
      err instanceof Error ? err.message : "ไม่สามารถสร้าง QR ได้";
  } finally {
    isCreating.value = false;
  }
}

async function pollQrAttempt() {
  if (!attempt.value || isPolling.value || isTerminalStatus.value) return;
  isPolling.value = true;
  try {
    const result = await $fetch<QrAttemptResponse>(
      `/api/admin/pos-v3/rental-bookings/${encodeURIComponent(props.draftResult.booking.id)}/booking-deposit-qr/poll`,
      {
        method: "POST",
        body: { paymentAttemptId: attempt.value.paymentAttemptId },
      },
    );
    if (!componentActive) return;
    attempt.value = result;
    pollError.value = null;
    emitConfirmedOnce(result);
    if (terminalStatuses.includes(result.status)) stopPolling();
  } catch (err: unknown) {
    pollError.value =
      err instanceof Error ? err.message : "ตรวจสอบสถานะ QR ไม่สำเร็จ";
  } finally {
    isPolling.value = false;
  }
}

watch(
  () => props.draftResult.booking.id,
  () => void createQrAttempt(),
);
onMounted(() => {
  componentActive = true;
  startTicker();
  void createQrAttempt();
});
onBeforeUnmount(() => {
  componentActive = false;
  stopPolling();
  stopTicker();
});
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">
            สแกน QR เพื่อชำระเงินมัดจำการจอง
          </h2>
          <p class="text-sm text-muted">
            เมื่อลูกค้าชำระสำเร็จ ระบบจะยืนยันการจองให้อัตโนมัติ
          </p>
        </div>
        <UBadge
          :color="
            isPaid
              ? 'success'
              : isDegradedSuccess
                ? 'warning'
                : isFailed
                  ? 'error'
                  : 'neutral'
          "
          variant="soft"
        >
          {{ attempt?.status || (isCreating ? "creating" : "awaiting_qr") }}
        </UBadge>
      </div>
    </template>

    <div class="space-y-5">
      <div class="grid gap-3 text-sm md:grid-cols-4">
        <div>
          <p class="text-muted">Booking ID</p>
          <p class="font-mono text-xs font-semibold">
            {{ draftResult.booking.id }}
          </p>
        </div>
        <div>
          <p class="text-muted">Asset</p>
          <p class="font-semibold">{{ draftResult.booking.asset.name }}</p>
          <p class="text-xs text-muted">
            {{ draftResult.booking.asset.code || "—" }}
          </p>
        </div>
        <div>
          <p class="text-muted">Customer</p>
          <p class="font-semibold">
            {{
              draftResult.booking.customer.bookerName ||
              (draftResult.booking.customer.kind === "account"
                ? "Account customer"
                : "Walk-in")
            }}
          </p>
        </div>
        <div>
          <p class="text-muted">Booking Deposit</p>
          <p class="text-xl font-bold text-primary">
            {{
              fmt(
                draftResult.quote.bookingDepositDueNow,
                draftResult.quote.currencyCode,
              )
            }}
          </p>
        </div>
      </div>

      <UAlert
        v-if="isZeroDue"
        color="warning"
        variant="soft"
        title="ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED"
        description="Booking Deposit due = ฿0. PromptPay QR finalization is not enabled for zero-deposit bookings."
      />
      <UAlert
        v-else-if="createError"
        color="error"
        variant="soft"
        title="สร้าง QR ไม่สำเร็จ"
        :description="createError"
      />

      <div
        v-if="isCreating && !attempt"
        class="flex flex-col items-center gap-4 py-4"
      >
        <div class="h-72 w-72 animate-pulse rounded-lg bg-elevated" />
        <p class="text-sm text-muted">กำลังสร้าง PromptPay QR...</p>
      </div>

      <div v-else-if="attempt" class="space-y-4">
        <UAlert
          v-if="isPaid"
          color="success"
          variant="soft"
          title="Booking Deposit received"
          description="Booking confirmed · Future rental is now ready for pickup on the booked date."
        />
        <UAlert
          v-else-if="isDegradedSuccess"
          color="warning"
          variant="soft"
          title="ได้รับชำระเงินแล้ว · ต้องตรวจสอบด้วยตนเอง"
          description="Payment appears received, but booking confirmation needs manual review. Staff must not collect payment again."
        />
        <UAlert
          v-else-if="isFinalizing"
          color="info"
          variant="soft"
          icon="bx:loader-circle"
          title="ตรวจพบการชำระเงินแล้ว"
          description="กำลังยืนยันการจองและเตรียมข้อมูลที่เกี่ยวข้อง กรุณารอสักครู่"
        />
        <UAlert
          v-else-if="isExpired"
          color="warning"
          variant="soft"
          title="QR หมดเวลาแล้ว"
          description="ลูกค้ายังไม่ได้ชำระภายในเวลาที่กำหนด สามารถสร้าง QR ใหม่ได้"
        />
        <UAlert
          v-else-if="isFailed"
          color="error"
          variant="soft"
          title="การชำระเงินผ่าน QR ไม่สำเร็จ"
          description="Provider หรือ gateway แจ้งสถานะล้มเหลว สามารถสร้าง QR ใหม่ได้หากต้องการ"
        />
        <UAlert
          v-else-if="isLocallyPastExpiry"
          color="warning"
          variant="soft"
          title="QR หมดเวลา · กำลังตรวจสอบสถานะล่าสุด"
          description="ระบบจะยังใช้ผลจาก backend เป็นสถานะจริง และจะไม่ยืนยันการจองจากเวลาบนอุปกรณ์นี้"
        />

        <div
          v-if="isPending || isRequiresAction || isFinalizing"
          class="flex flex-col items-center gap-4 rounded-xl border border-default bg-elevated/40 p-4 text-center"
        >
          <img
            v-if="attempt.qrImageUrl"
            :src="attempt.qrImageUrl"
            alt="PromptPay QR"
            class="h-72 w-72 rounded-lg border bg-white object-contain p-2"
          />
          <div v-else class="h-72 w-72 animate-pulse rounded-lg bg-elevated" />
          <p class="text-sm text-muted">
            รหัสการจอง:
            <span class="font-mono text-default">{{
              draftResult.booking.id
            }}</span>
          </p>
          <p v-if="attempt.expiresAt" class="text-sm text-muted">
            เวลาที่เหลือ:
            <span class="font-mono font-semibold text-default">{{
              remainingLabel
            }}</span>
          </p>
          <div
            v-if="isPolling"
            class="inline-flex items-center gap-2 rounded-full bg-elevated px-3 py-1 text-xs text-muted"
          >
            <UIcon name="bx:loader-alt" class="animate-spin" /><span
              >กำลังตรวจสอบสถานะล่าสุด</span
            >
          </div>
        </div>

        <div
          v-if="isPaid || isDegradedSuccess"
          class="grid gap-3 text-sm md:grid-cols-3"
        >
          <div>
            <p class="text-muted">Paid</p>
            <p class="font-semibold">
              {{ fmt(attempt.amount, attempt.currency) }}
            </p>
            <UBadge size="sm" color="neutral" variant="soft"
              >PromptPay QR</UBadge
            >
          </div>
          <div>
            <p class="text-muted">Payment attempt</p>
            <p class="font-mono text-xs">{{ attempt.paymentAttemptId }}</p>
          </div>
          <div>
            <p class="text-muted">Document</p>
            <p class="text-xs text-muted">
              Poll response does not expose document number or print link.
            </p>
          </div>
        </div>

        <UAlert
          v-if="pollError && !isTerminalStatus"
          color="warning"
          variant="soft"
          title="ตรวจสอบสถานะ QR ไม่สำเร็จ"
          :description="pollError"
        />
      </div>

      <UButton
        v-if="createError || canRegenerate"
        icon="bx:refresh"
        color="primary"
        :loading="isCreating"
        :disabled="isZeroDue || isFinalizing"
        @click="createQrAttempt"
        >สร้าง QR ใหม่</UButton
      >
    </div>
  </UCard>
</template>
