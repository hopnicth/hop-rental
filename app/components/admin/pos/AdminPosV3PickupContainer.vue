<script setup lang="ts">
import type { AdminRentalBookingDetail } from "~/types/admin-order-detail";
import AdminBookingHandoverItems from "~/components/admin/AdminBookingHandoverItems.vue";
import DigitalSignaturePad from "~/components/admin/DigitalSignaturePad.vue";

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
}>();

const emit = defineEmits<{
  (e: "pickup-confirmed", booking: AdminRentalBookingDetail): void;
  (e: "deposit-collected"): void;
}>();

const signatureDataUrl = ref<string | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const collectingDeposit = ref(false);
const depositCollectError = ref<string | null>(null);

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

const readinessLoading = computed(
  () => props.readiness === null && !isAlreadyPickedUp.value,
);

const hasChecklistError = computed(
  () => !!submitError.value?.toLowerCase().includes("checklist"),
);

const canSubmit = computed(
  () =>
    !submitting.value &&
    !!signatureDataUrl.value &&
    !hasPickupDue.value &&
    !readinessLoading.value,
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
    depositCollectError.value =
      err.statusMessage ??
      err.data?.message ??
      err.message ??
      "รับเงินมัดจำประกันไม่สำเร็จ";
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
        title="ยังไม่สามารถส่งมอบได้ — เงินมัดจำประกันยังไม่ครบ"
        :description="`ยอดเงินมัดจำประกันที่ต้องชำระก่อนรับสินค้า: ฿${remainingDepositDue.toLocaleString()}`"
      />
      <UCard>
        <template #header>
          <div>
            <h3 class="font-semibold">ชำระเงินมัดจำประกันส่วนที่เหลือ</h3>
            <p class="text-sm text-muted">
              เงินมัดจำประกัน (คืนได้) — ไม่ใช่ค่าเช่า
            </p>
          </div>
        </template>
        <div class="space-y-3">
          <p class="text-sm text-muted">
            ค่าเช่าจะชำระวันคืนสินค้า / หลังจบงาน
          </p>
          <UAlert
            v-if="depositCollectError"
            color="error"
            variant="soft"
            :title="depositCollectError"
          />
          <div class="flex justify-end">
            <UButton
              color="primary"
              :loading="collectingDeposit"
              :disabled="collectingDeposit"
              icon="bx:money"
              :label="`รับเงินมัดจำประกัน (เงินสด) ฿${remainingDepositDue.toLocaleString()}`"
              @click="collectRemainingDeposit"
            />
          </div>
        </div>
      </UCard>
    </div>

    <!-- State 4: Active pickup form
         Supports both future confirmed bookings (Case 1) and same-day POS bookings (Case 2).
         Both cases require: status === 'confirmed' AND remainingSecurityDepositDue === 0.
         Rental fee is deferred to return / settlement — it does NOT gate pickup. -->
    <div v-else class="space-y-4">
      <!-- Informational: deferred rental fee (not a blocker) -->
      <UAlert
        v-if="deferredRentalFee > 0"
        color="neutral"
        variant="soft"
        icon="bx:info-circle"
        :title="`ค่าเช่าโดยประมาณ: ฿${deferredRentalFee.toLocaleString()}`"
        description="ชำระวันคืนสินค้า / หลังจบงาน — ตามนโยบายการเช่า"
      />
      <!-- Proactive checklist hint: shown before submission so staff can prepare -->
      <UAlert
        color="info"
        variant="soft"
        icon="bx:list-check"
        title="ตรวจสอบ Pickup Checklist ก่อนส่งมอบ"
      >
        <template #description>
          กรุณาตรวจสอบว่า Pickup Checklist เสร็จสมบูรณ์แล้วก่อนยืนยัน —
          <NuxtLink
            :to="`/admin/rental-bookings/${booking.id}`"
            target="_blank"
            class="underline"
            >เปิดหน้ารายละเอียดการจอง</NuxtLink
          >
          เพื่อสร้าง/ยืนยัน Pickup Checklist หากยังไม่เสร็จ
        </template>
      </UAlert>
      <AdminBookingHandoverItems
        :booking-id="booking.id"
        :booking-status="booking.status"
      />
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
