<script setup lang="ts">
/**
 * AdminPosV3PickupDepositQrCard
 *
 * QR Code payment card for POS V3 pickup remaining security deposit.
 * Simpler than AdminPosV3FutureBookingDepositQrContainer:
 *   - No BDC document logic
 *   - No session buffer (in-person pickup flow)
 *   - Emits deposit-collected on paid → parent re-fetches pickup readiness
 */
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

const props = defineProps<{
  bookingId: string;
  amount: number;
  currency?: string;
}>();
const emit = defineEmits<{ "deposit-collected": [] }>();

const attempt = ref<QrAttemptResponse | null>(null);
const isCreating = ref(false);
const isPolling = ref(false);
const createError = ref<string | null>(null);
const pollError = ref<string | null>(null);
const now = ref(Date.now());
const hasEmittedCollected = ref(false);
// Bug 2 fix: locked manual-review state when gateway already captured money but
// internal finalization failed. Staff must not collect again.
const isGatewayPaidManualReview = ref(false);
let pollHandle: ReturnType<typeof setInterval> | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;
let componentActive = false;

const TERMINAL: QrAttemptStatus[] = [
  "paid",
  "paid_confirm_failed",
  "expired",
  "failed",
  "cancelled",
];
const isTerminal = computed(() =>
  Boolean(attempt.value && TERMINAL.includes(attempt.value.status)),
);
const isPending = computed(() => attempt.value?.status === "pending");
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
const expiresAtMs = computed(() =>
  attempt.value?.expiresAt ? new Date(attempt.value.expiresAt).getTime() : 0,
);
const remainingSeconds = computed(() =>
  expiresAtMs.value
    ? Math.max(0, Math.floor((expiresAtMs.value - now.value) / 1000))
    : 0,
);
const remainingLabel = computed(() => {
  const t = remainingSeconds.value;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
});
const isLocallyPastExpiry = computed(() =>
  Boolean(
    expiresAtMs.value &&
    remainingSeconds.value === 0 &&
    (isPending.value || isRequiresAction.value),
  ),
);

function fmt(v: number, c = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0));
}
function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}
function startPolling() {
  if (pollHandle || !attempt.value || isTerminal.value) return;
  if (
    !["pending", "requires_action", "finalizing"].includes(attempt.value.status)
  )
    return;
  pollHandle = setInterval(() => void pollQrAttempt(), 3000);
}
function startTicker() {
  if (!tickHandle)
    tickHandle = setInterval(() => {
      now.value = Date.now();
    }, 1000);
}
function stopTicker() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}
function emitCollectedOnce() {
  if (hasEmittedCollected.value || !isPaid.value) return;
  hasEmittedCollected.value = true;
  emit("deposit-collected");
}
function resetAttemptState() {
  stopPolling();
  attempt.value = null;
  createError.value = null;
  pollError.value = null;
  hasEmittedCollected.value = false;
}

async function createQrAttempt() {
  if (isCreating.value || props.amount <= 0) return;
  resetAttemptState();
  isCreating.value = true;
  try {
    const result = await $fetch<QrAttemptResponse>(
      `/api/admin/pos-v3/rental-bookings/${encodeURIComponent(props.bookingId)}/remaining-security-deposit-qr`,
      {
        method: "POST",
        body: { idempotencyKey: crypto.randomUUID(), amount: props.amount },
      },
    );
    if (!componentActive) return;
    attempt.value = result;
    emitCollectedOnce();
    startPolling();
  } catch (err: unknown) {
    const e = err as {
      statusMessage?: string;
      data?: { message?: string };
      message?: string;
    };
    const msg = e.statusMessage ?? e.data?.message ?? e.message ?? "";
    if (msg === "EXISTING_ACTIVE_QR_NOT_EXPIRED") {
      await resumeActiveAttempt();
      return;
    }
    // Bug 2 fix: gateway already captured money but internal finalization failed.
    // Lock the UI so staff cannot collect again. Manual review required.
    if (msg === "GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW") {
      isGatewayPaidManualReview.value = true;
      return;
    }
    createError.value = msg || "ไม่สามารถสร้าง QR ได้";
  } finally {
    isCreating.value = false;
  }
}

async function resumeActiveAttempt() {
  try {
    const { attempt: active } = await $fetch<{
      attempt: QrAttemptResponse | null;
    }>(
      `/api/admin/pos-v3/rental-bookings/${encodeURIComponent(props.bookingId)}/remaining-security-deposit-qr/active`,
    );
    if (!componentActive) return;
    if (active) {
      attempt.value = active;
      emitCollectedOnce();
      startPolling();
    } else {
      createError.value = "มี QR ที่ยังใช้งานอยู่ กรุณารอสักครู่แล้วลองใหม่";
    }
  } catch {
    createError.value = "ไม่สามารถโหลดข้อมูล QR ได้";
  }
}

async function pollQrAttempt() {
  if (!attempt.value || isPolling.value || isTerminal.value) return;
  isPolling.value = true;
  try {
    const result = await $fetch<QrAttemptResponse>(
      `/api/admin/pos-v3/rental-bookings/${encodeURIComponent(props.bookingId)}/remaining-security-deposit-qr/poll`,
      {
        method: "POST",
        body: { paymentAttemptId: attempt.value.paymentAttemptId },
      },
    );
    if (!componentActive) return;
    attempt.value = result;
    pollError.value = null;
    emitCollectedOnce();
    if (TERMINAL.includes(result.status)) stopPolling();
  } catch (err: unknown) {
    const e = err as { message?: string };
    pollError.value = e.message ?? "ตรวจสอบสถานะ QR ไม่สำเร็จ";
  } finally {
    isPolling.value = false;
  }
}

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
          <h3 class="font-semibold">สแกน QR เพื่อชำระมัดจำประกัน</h3>
          <p class="text-sm text-muted">
            {{ fmt(amount, currency ?? "THB") }} — มัดจำประกัน (คืนได้)
          </p>
        </div>
        <UBadge
          :color="
            isGatewayPaidManualReview || isDegradedSuccess
              ? 'error'
              : isPaid
                ? 'success'
                : isFailed
                  ? 'error'
                  : 'neutral'
          "
          variant="soft"
        >
          {{
            isGatewayPaidManualReview
              ? "manual_review"
              : attempt?.status || (isCreating ? "creating" : "awaiting_qr")
          }}
        </UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Locked manual-review: gateway captured money but finalization failed.
           Staff must not collect again. Shown for both: create-time 409 lock
           and poll/webhook paid_confirm_failed detection. -->
      <UAlert
        v-if="isGatewayPaidManualReview || isDegradedSuccess"
        color="error"
        variant="soft"
        icon="bx:lock"
        title="พบการชำระเงินจาก Omise แล้ว แต่ระบบยังต้องตรวจสอบรายการนี้"
        description="ห้ามรับชำระซ้ำ — Omise รับเงินไว้แล้ว แต่ระบบภายในยังไม่อัปเดต กรุณาแจ้งผู้ดูแลระบบตรวจสอบและแก้ไขรายการนี้ก่อนดำเนินการต่อ"
      />
      <UAlert
        v-else-if="isPaid"
        color="success"
        variant="soft"
        icon="bx:check-circle"
        title="ชำระมัดจำประกันแล้ว"
        description="รับเงินมัดจำประกันสำเร็จ — กรุณาดำเนินการส่งมอบอุปกรณ์ต่อ"
      />
      <UAlert
        v-else-if="isFinalizing"
        color="info"
        variant="soft"
        icon="bx:loader-circle"
        title="ตรวจพบการชำระเงินแล้ว"
        description="กำลังยืนยันการรับมัดจำ กรุณารอสักครู่"
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
        description="สามารถสร้าง QR ใหม่ได้หากต้องการ"
      />
      <UAlert
        v-else-if="isLocallyPastExpiry"
        color="warning"
        variant="soft"
        title="QR หมดเวลา · กำลังตรวจสอบสถานะล่าสุด"
        description="ระบบจะใช้ผลจาก backend เป็นสถานะจริง"
      />
      <UAlert
        v-if="createError"
        color="error"
        variant="soft"
        title="สร้าง QR ไม่สำเร็จ"
        :description="createError"
      />

      <div
        v-if="isCreating && !attempt"
        class="flex flex-col items-center gap-4 py-4"
      >
        <div class="h-56 w-56 animate-pulse rounded-lg bg-elevated" />
        <p class="text-sm text-muted">กำลังสร้าง PromptPay QR...</p>
      </div>

      <div
        v-else-if="attempt && (isPending || isRequiresAction || isFinalizing)"
        class="flex flex-col items-center gap-4 rounded-xl border border-default bg-elevated/40 p-4 text-center"
      >
        <img
          v-if="attempt.qrImageUrl"
          :src="attempt.qrImageUrl"
          alt="PromptPay QR"
          class="h-56 w-56 rounded-lg border bg-white object-contain p-2"
        />
        <div v-else class="h-56 w-56 animate-pulse rounded-lg bg-elevated" />
        <p v-if="attempt.expiresAt" class="text-sm text-muted">
          เวลาที่เหลือ:
          <span class="font-mono font-semibold text-default">{{
            remainingLabel
          }}</span>
        </p>
        <p v-if="isPolling" class="text-xs text-muted">กำลังตรวจสอบสถานะ...</p>
      </div>

      <UAlert
        v-if="pollError && !isTerminal"
        color="warning"
        variant="soft"
        title="ตรวจสอบสถานะ QR ไม่สำเร็จ"
        :description="pollError"
      />

      <!-- Regenerate: hidden in manual-review locked state (Omise already has money) -->
      <UButton
        v-if="
          !isGatewayPaidManualReview &&
          !isDegradedSuccess &&
          (createError || canRegenerate)
        "
        icon="bx:refresh"
        color="primary"
        :loading="isCreating"
        :disabled="isFinalizing"
        @click="createQrAttempt"
      >
        สร้าง QR ใหม่
      </UButton>
    </div>
  </UCard>
</template>
