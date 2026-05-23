<script setup lang="ts">
import type { AdminRentalBookingDetail } from "~/types/admin-order-detail";
import AdminBookingChecklists from "~/components/admin/AdminBookingChecklists.vue";
import DigitalSignaturePad from "~/components/admin/DigitalSignaturePad.vue";
import AdminPosV3PickupDepositQrCard from "~/components/admin/pos/AdminPosV3PickupDepositQrCard.vue";
import type {
  AdminBookingChecklist,
  AdminBookingOpsPayload,
  AssetChecklistTemplateSummary,
} from "~/types/admin-booking-ops";

interface PickupReadinessPreview {
  readiness?: { classification?: string; canProceedToPickup?: boolean };
  moneySummary?: {
    pickupDue?: {
      totalPickupDueAmount?: number;
      remainingSecurityDepositDueAmount?: number;
    };
    rentalFee?: { expectedGrossAmount?: number };
  };
}

const props = defineProps<{
  booking: AdminRentalBookingDetail;
  readiness: PickupReadinessPreview | null;
  checklists: AdminBookingChecklist[];
  templates: AssetChecklistTemplateSummary[];
}>();

const emit = defineEmits<{
  (e: "pickup-confirmed", booking: AdminRentalBookingDetail): void;
  (e: "deposit-collected"): void;
  (e: "checklist-updated", payload: AdminBookingOpsPayload): void;
}>();

const signatureDataUrl = ref<string | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const collectingDeposit = ref(false);
const depositCollectError = ref<string | null>(null);
const cashReceived = ref(0);
// Phase 2E-B2 QR: tender choice for State 3 deposit collection. null = not yet selected.
const depositTenderMethod = ref<"cash" | "qr" | null>(null);
// Bug 2 fix: manual-review lock propagated from cash endpoint (GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW).
// When true, both Cash and QR paths are disabled — Omise already captured the money.
const isCashManualReviewLocked = ref(false);

const isAlreadyPickedUp = computed(
  () =>
    props.booking.status === "picked_up" || props.booking.status === "returned",
);

const totalPickupDue = computed(
  () => props.readiness?.moneySummary?.pickupDue?.totalPickupDueAmount ?? -1,
);

// True only when remaining security deposit is still due at pickup.
// Rental fee is NOT a pickup gate — it is deferred to return / settlement.
const hasPickupDue = computed(() => totalPickupDue.value > 0);

// Remaining security deposit amount for the deposit-specific blocker message.
const remainingDepositDue = computed(
  () =>
    props.readiness?.moneySummary?.pickupDue
      ?.remainingSecurityDepositDueAmount ?? totalPickupDue.value,
);

// Rental fee shown as informational in the active form (deferred to return).
const deferredRentalFee = computed(
  () => props.readiness?.moneySummary?.rentalFee?.expectedGrossAmount ?? 0,
);

const isSameDayNoBookingDeposit = computed(() =>
  (props.booking.rentalPaymentLines ?? []).some(
    (line) =>
      line.source === "pos_v3_same_day_quote" ||
      String(line.metadata?.bookingDepositPolicy ?? "") ===
        "not_applicable_same_day",
  ),
);

const change = computed(() =>
  Math.max(0, cashReceived.value - remainingDepositDue.value),
);

const cashInsufficient = computed(
  () =>
    cashReceived.value > 0 && cashReceived.value < remainingDepositDue.value,
);

const canCollectDeposit = computed(
  () =>
    !collectingDeposit.value &&
    cashReceived.value >= remainingDepositDue.value &&
    remainingDepositDue.value > 0,
);

const readinessLoading = computed(
  () => props.readiness === null && !isAlreadyPickedUp.value,
);

const hasChecklistError = computed(
  () => !!submitError.value?.toLowerCase().includes("checklist"),
);

// Exact blocking reason displayed near the disabled Confirm Pickup button.
// Guides staff through the required steps without ambiguity.
const pickupBlockingReason = computed((): string | null => {
  if (canSubmit.value || submitting.value) return null;
  const pickupLists = props.checklists.filter((c) => c.kind === "pickup");
  if (pickupLists.length === 0)
    return "ต้องสร้าง Pickup Checklist ก่อนยืนยันรับอุปกรณ์";
  if (!hasCompletedPickupChecklist.value)
    return "ต้องกด Complete Checklist ก่อนยืนยันรับอุปกรณ์";
  if (!signatureDataUrl.value) return "รอลายเซ็นลูกค้า";
  return null;
});

// Phase 2E-B2: true when at least one pickup checklist is completed.
// This is a client-side UX gate only — server fulfillment gate remains authoritative.
const hasCompletedPickupChecklist = computed(() =>
  props.checklists.some((c) => c.kind === "pickup" && c.status === "completed"),
);

const canSubmit = computed(
  () =>
    !submitting.value &&
    !!signatureDataUrl.value &&
    !hasPickupDue.value &&
    !readinessLoading.value &&
    hasCompletedPickupChecklist.value,
);

async function collectRemainingDeposit() {
  if (collectingDeposit.value) return;
  collectingDeposit.value = true;
  depositCollectError.value = null;
  try {
    await $fetch(
      `/api/admin/pos-v3/rental-bookings/${encodeURIComponent(props.booking.id)}/remaining-security-deposit-payments`,
      {
        method: "POST",
        body: {
          idempotencyKey: `pos-v3:remaining-deposit:${props.booking.id}:${Date.now()}`,
          amount: remainingDepositDue.value,
          paymentMethod: "cash",
        },
      },
    );
    emit("deposit-collected");
  } catch (e) {
    const err = e as {
      statusMessage?: string;
      data?: { message?: string };
      message?: string;
    };
    const msg = err.statusMessage ?? err.data?.message ?? err.message ?? "";
    // Bug 2 fix: gateway already captured money — lock all payment paths.
    if (msg === "GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW") {
      isCashManualReviewLocked.value = true;
      depositTenderMethod.value = null;
      return;
    }
    depositCollectError.value = msg || "รับเงินมัดจำประกันไม่สำเร็จ";
  } finally {
    collectingDeposit.value = false;
  }
}

async function submitPickup() {
  if (!canSubmit.value) return;
  submitting.value = true;
  submitError.value = null;
  try {
    const result = await $fetch<AdminRentalBookingDetail>(
      `/api/admin/rental-bookings/${encodeURIComponent(props.booking.id)}/pickup`,
      {
        method: "POST",
        body: {
          signatureDataUrl: signatureDataUrl.value,
          idempotencyKey: `pos-v3:pickup:${props.booking.id}:${Date.now()}`,
        },
      },
    );
    emit("pickup-confirmed", result);
  } catch (e) {
    const err = e as {
      statusMessage?: string;
      data?: { message?: string };
      message?: string;
    };
    submitError.value =
      err.statusMessage ??
      err.data?.message ??
      err.message ??
      "ยืนยันรับอุปกรณ์ไม่สำเร็จ";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">ส่งมอบอุปกรณ์ (Pickup)</h2>
          <p class="text-sm text-muted">
            {{ booking.assetName ?? booking.productName }} ·
            {{ booking.startDate }} →
            {{ booking.endDate }}
          </p>
        </div>
        <UBadge
          :color="isAlreadyPickedUp ? 'success' : 'warning'"
          variant="soft"
        >
          {{ booking.status }}
        </UBadge>
      </div>
    </template>

    <!-- State 1: Already picked up -->
    <div v-if="isAlreadyPickedUp" class="space-y-3">
      <UAlert
        color="success"
        variant="soft"
        icon="bx:check-circle"
        title="รับอุปกรณ์แล้ว"
        description="การส่งมอบอุปกรณ์สำเร็จแล้ว"
      />
      <div class="flex justify-end">
        <UButton
          :to="`/admin/rental-bookings/${booking.id}/print?type=pickup`"
          target="_blank"
          size="sm"
          variant="soft"
          icon="bx:printer"
          label="ดูรายละเอียดและพิมพ์ใบส่งมอบ"
        />
      </div>
    </div>

    <!-- State 2: Readiness still loading -->
    <div
      v-else-if="readinessLoading"
      class="py-6 text-center text-sm text-muted"
    >
      กำลังตรวจสอบสถานะการรับมอบ…
    </div>

    <!-- State 3: Collect remaining security deposit — interactive cash collection card.
         Rental fee is NOT collected here; it is deferred to return / settlement. -->
    <div v-else-if="hasPickupDue" class="space-y-3">
      <UAlert
        color="warning"
        variant="soft"
        icon="bx:lock"
        :title="
          isSameDayNoBookingDeposit
            ? 'ยังไม่สามารถส่งมอบได้ — ต้องรับเงินมัดจำประกันก่อน'
            : 'ยังไม่สามารถส่งมอบได้ — เงินมัดจำประกันยังไม่ครบ'
        "
        :description="`ยอดเงินมัดจำประกันที่ต้องชำระก่อนรับสินค้า: ฿${remainingDepositDue.toLocaleString()}`"
      />
      <UCard v-if="isSameDayNoBookingDeposit">
        <div class="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <p class="text-muted">Rental fee</p>
            <p class="font-semibold">ชำระวันคืนสินค้า / หลังจบงาน</p>
          </div>
          <div>
            <p class="text-muted">Total refundable security deposit</p>
            <p class="font-semibold">
              ฿{{ booking.depositAmount.toLocaleString() }}
            </p>
          </div>
          <div>
            <p class="text-muted">Booking Deposit</p>
            <p class="font-semibold">ไม่ใช้ / ฿0</p>
          </div>
          <div>
            <p class="text-muted">Refundable security deposit due at pickup</p>
            <p class="font-semibold">
              ฿{{ remainingDepositDue.toLocaleString() }}
            </p>
          </div>
        </div>
      </UCard>
      <UCard>
        <template #header>
          <div>
            <h3 class="font-semibold">มัดจำประกันที่ต้องชำระตอนรับของ</h3>
            <p class="text-sm text-muted">
              เงินมัดจำประกัน (คืนได้) — ไม่ใช่ค่าเช่า
            </p>
          </div>
        </template>
        <div class="space-y-3">
          <p class="text-sm text-muted">
            ค่าเช่าจะชำระวันคืนสินค้า / หลังจบงาน
          </p>
          <!-- Amount due -->
          <div
            class="flex items-center justify-between rounded bg-muted/20 px-3 py-2"
          >
            <span class="text-sm text-muted"
              >มัดจำประกันที่ต้องชำระตอนรับของ</span
            >
            <span class="font-semibold"
              >฿{{ remainingDepositDue.toLocaleString() }}</span
            >
          </div>

          <!-- Bug 2 fix: manual-review locked state from cash or QR path -->
          <UAlert
            v-if="isCashManualReviewLocked"
            color="error"
            variant="soft"
            icon="bx:lock"
            title="พบการชำระเงินจาก Omise แล้ว แต่ระบบยังต้องตรวจสอบรายการนี้"
            description="ห้ามรับชำระซ้ำ — Omise รับเงินไว้แล้ว แต่ระบบภายในยังไม่อัปเดต กรุณาแจ้งผู้ดูแลระบบตรวจสอบและแก้ไขรายการนี้ก่อนดำเนินการต่อ"
          />

          <!-- Phase 2E-B2 QR: Tender method selector — Cash or QR Code -->
          <div
            v-if="!isCashManualReviewLocked && depositTenderMethod === null"
            class="space-y-2"
          >
            <p class="text-sm font-medium">เลือกวิธีรับชำระมัดจำประกัน</p>
            <div class="flex gap-2">
              <UButton
                icon="bx:money"
                label="Cash"
                color="neutral"
                variant="soft"
                @click="depositTenderMethod = 'cash'"
              />
              <UButton
                icon="bx:qr"
                label="QR Code"
                color="primary"
                variant="soft"
                @click="depositTenderMethod = 'qr'"
              />
            </div>
          </div>

          <!-- Cash path (unchanged); hidden when manual-review locked -->
          <template
            v-if="!isCashManualReviewLocked && depositTenderMethod === 'cash'"
          >
            <div>
              <label class="mb-1 block text-sm font-medium"
                >รับเงินสดจากลูกค้า</label
              >
              <UInput
                v-model.number="cashReceived"
                type="number"
                min="0"
                :placeholder="`฿${remainingDepositDue.toLocaleString()}`"
              />
            </div>
            <div
              class="flex items-center justify-between rounded bg-muted/20 px-3 py-2"
            >
              <span class="text-sm text-muted">เงินทอน</span>
              <span class="font-semibold text-success"
                >฿{{ change.toLocaleString() }}</span
              >
            </div>
            <UAlert
              v-if="cashInsufficient"
              color="warning"
              variant="soft"
              title="รับเงินสดยังไม่ครบมัดจำประกันที่ต้องชำระตอนรับของ"
            />
            <UAlert
              v-if="depositCollectError"
              color="error"
              variant="soft"
              :title="depositCollectError"
            />
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                label="เปลี่ยนวิธีชำระ"
                @click="depositTenderMethod = null"
              />
              <UButton
                color="primary"
                :loading="collectingDeposit"
                :disabled="!canCollectDeposit"
                icon="bx:check"
                label="ยืนยันรับมัดจำประกัน"
                @click="collectRemainingDeposit"
              />
            </div>
          </template>
        </div>
      </UCard>

      <!-- QR path — hidden when manual-review locked; rendered outside the card -->
      <AdminPosV3PickupDepositQrCard
        v-if="!isCashManualReviewLocked && depositTenderMethod === 'qr'"
        :booking-id="booking.id"
        :amount="remainingDepositDue"
        :currency="booking.currencyCode ?? 'THB'"
        @deposit-collected="emit('deposit-collected')"
      />
      <UButton
        v-if="!isCashManualReviewLocked && depositTenderMethod === 'qr'"
        color="neutral"
        variant="ghost"
        size="sm"
        label="เปลี่ยนวิธีชำระ"
        @click="depositTenderMethod = null"
      />
    </div>

    <!-- State 4: Active pickup form
         Deposit is clear. Rental fee is deferred to return / settlement.
         Supports both future confirmed bookings (Case 1) and same-day POS bookings (Case 2). -->
    <div v-else class="space-y-4">
      <!-- ── มัดจำประกันที่ต้องชำระตอนรับของ ──────────────────────────────── -->
      <!-- Always visible in State 4 so staff can confirm deposit status at a glance. -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 class="font-semibold">มัดจำประกันที่ต้องชำระตอนรับของ</h3>
              <p class="text-sm text-muted">
                เงินมัดจำประกัน (คืนได้) — ไม่ใช่ค่าเช่า
              </p>
            </div>
            <UBadge color="success" variant="soft" icon="bx:check-circle">
              ชำระครบแล้ว ✓
            </UBadge>
          </div>
        </template>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-muted">ยอดมัดจำประกัน (คืนได้)</span>
            <span class="font-semibold">
              ฿{{ booking.depositAmount.toLocaleString() }}
            </span>
          </div>
          <p class="text-xs text-muted">
            ค่าเช่าจะชำระวันคืนสินค้า / หลังจบงาน —
            ไม่ใช่ยอดที่ต้องชำระตอนรับของ
            <span v-if="deferredRentalFee > 0">
              (ค่าเช่าโดยประมาณ: ฿{{ deferredRentalFee.toLocaleString() }})
            </span>
          </p>
        </div>
      </UCard>

      <!-- ── 1. Pickup Checklist ─────────────────────────────────────────── -->
      <!-- Staff must complete this checklist before Confirm Pickup is enabled. -->
      <div>
        <div class="mb-2">
          <p class="text-sm font-semibold">
            1. Pickup Checklist — ตรวจสอบสภาพสินค้าก่อนส่งมอบ
          </p>
          <p class="text-xs text-muted">
            ต้องกด Complete Checklist ก่อนกด Confirm Pickup — server
            จะตรวจสอบซ้ำ
          </p>
        </div>
        <!-- Phase 2E-B2: autoExpand=true so items are immediately visible without extra clicks. -->
        <AdminBookingChecklists
          :booking-id="booking.id"
          :checklists="checklists"
          :templates="templates"
          :auto-expand="true"
          @updated="$emit('checklist-updated', $event)"
        />
        <p class="mt-1 text-xs text-muted">
          เปิดหน้ารายละเอียดการจองสำหรับ Checklist เพิ่มเติม:
          <NuxtLink
            :to="`/admin/rental-bookings/${booking.id}`"
            target="_blank"
            class="text-primary underline"
            >เปิดหน้ารายละเอียดการจอง</NuxtLink
          >
        </p>
      </div>

      <!-- ── ลายเซ็นลูกค้า ──────────────────────────────────────────────── -->
      <UCard>
        <template #header>
          <h3 class="font-semibold">ลายเซ็นลูกค้า</h3>
        </template>
        <DigitalSignaturePad v-model="signatureDataUrl" />
      </UCard>

      <UAlert
        v-if="submitError"
        color="error"
        variant="soft"
        :title="submitError"
      />
      <p v-if="hasChecklistError" class="text-sm text-muted">
        กรุณา
        <NuxtLink
          :to="`/admin/rental-bookings/${booking.id}`"
          target="_blank"
          class="text-primary underline"
          >เปิดหน้ารายละเอียดการจอง</NuxtLink
        >
        เพื่อสร้างและยืนยัน Pickup Checklist ก่อนดำเนินการส่งมอบ
      </p>
      <!-- Exact reason the Confirm Pickup button is still disabled -->
      <UAlert
        v-if="pickupBlockingReason"
        color="warning"
        variant="soft"
        icon="bx:lock"
        :title="pickupBlockingReason"
      />
      <div class="flex items-center justify-between gap-3">
        <p
          class="text-sm"
          :class="signatureDataUrl ? 'text-success' : 'text-muted'"
        >
          {{ signatureDataUrl ? "ลายเซ็นพร้อมแล้ว ✓" : "รอลายเซ็นลูกค้า" }}
        </p>
        <UButton
          color="primary"
          size="lg"
          :loading="submitting"
          :disabled="!canSubmit"
          icon="bx:check-double"
          label="ยืนยันรับอุปกรณ์"
          @click="submitPickup"
        />
      </div>
    </div>
  </UCard>
</template>
