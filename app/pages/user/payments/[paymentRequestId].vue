<script setup lang="ts">
/**
 * /user/payments/[paymentRequestId] — the PRIMARY customer payment page.
 *
 * One amount due now (allocated across sale order and/or Booking Deposit(s)), the
 * Hopnic bank-transfer card, ONE slip upload, slip history, and related order/
 * booking summaries. Slip upload is EVIDENCE ONLY — it moves the request to
 * pending_review; staff verify the amount and confirm the order/booking through
 * the existing admin actions. Auth is enforced globally by @nuxtjs/supabase.
 */
interface AllocationItem {
  id: string;
  targetType: string;
  targetId: string;
  amountDue: number;
  label: string;
}
interface SlipRow {
  id: string;
  originalFilename: string | null;
  status: string;
  uploadedAt: string;
}
interface Detail {
  paymentRequest: {
    id: string;
    sourceType: string;
    status: string;
    currency: string;
    totalAmountDue: number;
    createdAt: string;
    rejectedReason: string | null;
  };
  items: AllocationItem[];
  slips: SlipRow[];
  saleOrders: {
    id: string;
    orderNumber: string;
    grandTotal: number;
    paymentStatus: string;
  }[];
  bookings: {
    id: string;
    itemName: string;
    status: string;
    startDate: string;
    hubName: string;
  }[];
}

const { t } = useI18n();
const route = useRoute();
const toast = useToast();

const requestId = computed(() =>
  typeof route.params.paymentRequestId === "string"
    ? route.params.paymentRequestId
    : "",
);

const loading = ref(false);
const error = ref<string | null>(null);
const detail = ref<Detail | null>(null);
const slipFile = ref<File | null>(null);
const uploading = ref(false);
const cancelling = ref(false);
const dragOver = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const currency = computed(() => detail.value?.paymentRequest.currency || "THB");
function money(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: currency.value,
  }).format(amount);
}

const saleAllocation = computed(() =>
  (detail.value?.items ?? [])
    .filter((i) => i.targetType === "sale_order")
    .reduce((sum, i) => sum + i.amountDue, 0),
);
const depositAllocation = computed(() =>
  (detail.value?.items ?? [])
    .filter((i) => i.targetType === "rental_booking_deposit")
    .reduce((sum, i) => sum + i.amountDue, 0),
);
const status = computed(() => detail.value?.paymentRequest.status ?? "");
const canUpload = computed(() =>
  ["awaiting_payment", "pending_review", "rejected"].includes(status.value),
);
const canCancel = computed(() => status.value === "awaiting_payment");
const historySlips = computed(() =>
  (detail.value?.slips ?? []).map((s) => ({
    id: s.id,
    originalFilename: s.originalFilename ?? "slip",
    status: s.status,
    uploadedAt: s.uploadedAt,
  })),
);

async function load(): Promise<void> {
  if (!requestId.value) return;
  loading.value = true;
  error.value = null;
  try {
    detail.value = await $fetch<Detail>(
      `/api/user/manual-payment-requests/${encodeURIComponent(requestId.value)}`,
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("paymentRequests.loadFailed");
  } finally {
    loading.value = false;
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  slipFile.value = input.files?.[0] ?? null;
}

function onDrop(event: DragEvent): void {
  dragOver.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) slipFile.value = file;
}

async function uploadSlip(): Promise<void> {
  if (!slipFile.value) {
    toast.add({ title: t("paymentRequests.noFile"), color: "warning" });
    return;
  }
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append("file", slipFile.value);
    await $fetch(
      `/api/user/manual-payment-requests/${encodeURIComponent(requestId.value)}/slips`,
      { method: "POST", body: fd },
    );
    slipFile.value = null;
    toast.add({ title: t("paymentRequests.uploadSuccess"), color: "success" });
    await load();
  } catch (e) {
    toast.add({
      title: e instanceof Error ? e.message : t("paymentRequests.uploadError"),
      color: "error",
    });
  } finally {
    uploading.value = false;
  }
}

async function cancelRequest(): Promise<void> {
  if (cancelling.value) return;
  cancelling.value = true;
  try {
    await $fetch(
      `/api/user/manual-payment-requests/${encodeURIComponent(requestId.value)}/cancel`,
      { method: "POST" },
    );
    toast.add({ title: t("paymentRequests.cancelSuccess"), color: "success" });
    await load();
  } catch (e) {
    toast.add({
      title: e instanceof Error ? e.message : t("paymentRequests.uploadError"),
      color: "error",
    });
  } finally {
    cancelling.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6 p-4">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-bold">{{ t("paymentRequests.pageTitle") }}</h1>
      <PaymentRequestStatusBadge v-if="detail" :status="status" />
    </div>

    <UCard v-if="loading">
      <p class="text-sm text-muted">{{ t("paymentRequests.loading") }}</p>
    </UCard>
    <UAlert
      v-else-if="error"
      color="error"
      :title="t('paymentRequests.loadFailed')"
      :description="error"
    />
    <template v-else-if="detail">
      <UAlert
        v-if="status === 'rejected' && detail.paymentRequest.rejectedReason"
        color="error"
        variant="soft"
        icon="bx:error"
        :title="t('paymentRequests.rejected')"
        :description="detail.paymentRequest.rejectedReason"
      />

      <!-- Amount due + allocation -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">{{ t("paymentRequests.allocationTitle") }}</h2>
        </template>
        <div class="space-y-2 text-sm">
          <div v-if="saleAllocation > 0" class="flex justify-between">
            <span class="text-muted">{{
              t("paymentRequests.productAndShipping")
            }}</span>
            <span>{{ money(saleAllocation) }}</span>
          </div>
          <div v-if="depositAllocation > 0" class="flex justify-between">
            <span class="text-muted">{{ t("paymentRequests.bookingDeposit") }}</span>
            <span>{{ money(depositAllocation) }}</span>
          </div>
          <div
            class="flex justify-between border-t pt-2 text-base font-bold"
          >
            <span>{{ t("paymentRequests.amountDueNow") }}</span>
            <span class="text-primary">{{
              money(detail.paymentRequest.totalAmountDue)
            }}</span>
          </div>
          <UAlert
            color="info"
            variant="soft"
            icon="bx:info-circle"
            class="mt-2"
            :description="t('paymentRequests.combinedNote')"
          />
        </div>
      </UCard>

      <!-- Related targets -->
      <UCard v-if="detail.saleOrders.length || detail.bookings.length">
        <template #header>
          <h2 class="font-semibold">{{ t("paymentRequests.relatedTitle") }}</h2>
        </template>
        <div class="space-y-2 text-sm">
          <NuxtLink
            v-for="order in detail.saleOrders"
            :key="order.id"
            :to="`/user/orders/${order.id}`"
            class="flex items-center justify-between gap-2 hover:underline"
          >
            <span
              ><UIcon name="bx:package" class="align-middle" />
              {{ t("paymentRequests.relatedSaleOrder") }}
              <span class="font-mono">{{ order.orderNumber }}</span></span
            >
            <span>{{ money(order.grandTotal) }}</span>
          </NuxtLink>
          <NuxtLink
            v-for="booking in detail.bookings"
            :key="booking.id"
            :to="`/user/rentals/${booking.id}`"
            class="flex items-center justify-between gap-2 hover:underline"
          >
            <span
              ><UIcon name="bx:calendar" class="align-middle" />
              {{ t("paymentRequests.relatedBooking") }}: {{ booking.itemName }}</span
            >
            <UIcon name="bx:right-arrow-alt" />
          </NuxtLink>
        </div>
      </UCard>

      <PaymentBankTransferCard />

      <!-- Slip upload -->
      <UCard v-if="canUpload">
        <template #header>
          <h2 class="font-semibold">{{ t("paymentRequests.uploadSlip") }}</h2>
        </template>
        <div class="space-y-3">
          <p class="text-sm text-muted">{{ t("paymentRequests.nextStepNote") }}</p>
          <div
            class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors"
            :class="dragOver ? 'border-primary bg-primary/5' : 'border-default hover:border-primary/50'"
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop.prevent="onDrop"
            @click="fileInputRef?.click()"
          >
            <UIcon
              name="bx:cloud-upload"
              class="size-8"
              :class="dragOver ? 'text-primary' : 'text-muted'"
            />
            <p class="text-sm text-muted">
              {{ t("paymentRequests.dropHint") }}
              <span class="font-medium text-primary underline">{{ t("paymentRequests.chooseFile") }}</span>
            </p>
            <p v-if="slipFile" class="flex items-center gap-1 text-sm font-medium text-primary">
              <UIcon name="bx:paperclip" class="size-4 shrink-0" />
              {{ slipFile.name }}
            </p>
            <p v-else class="text-xs text-muted">JPG · PNG · PDF</p>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              class="sr-only"
              @change="onFileChange"
            />
          </div>
          <UButton
            icon="bx:upload"
            :loading="uploading"
            :disabled="!slipFile"
            @click="uploadSlip"
          >
            {{ t("paymentRequests.uploadAction") }}
          </UButton>
        </div>
      </UCard>

      <PaymentSlipHistory :slips="historySlips" />

      <div v-if="canCancel" class="flex justify-end">
        <UButton
          variant="ghost"
          color="error"
          size="xs"
          :loading="cancelling"
          @click="cancelRequest"
        >
          {{ t("paymentRequests.cancel") }}
        </UButton>
      </div>
    </template>
  </div>
</template>
