<script setup lang="ts">
definePageMeta({ middleware: "auth" });

const { t } = useI18n();
const route = useRoute();
const toast = useToast();
const orderId = computed(() => String(route.params.orderId || ""));

interface Slip {
  id: string;
  originalFilename: string;
  status: string;
  uploadedAt: string;
}
interface OrderDetail {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    grandTotal: number;
    currencyCode: string;
    createdAt: string;
  };
  items: {
    id: string;
    name: string;
    thumbnail: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  paymentSlips: Slip[];
}

const detail = ref<OrderDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const slipFile = ref<File | null>(null);
const slipUploading = ref(false);

const canUploadSlip = computed(() =>
  ["awaiting_payment", "pending_review"].includes(
    detail.value?.order.paymentStatus ?? "",
  ),
);
const isPaid = computed(() => detail.value?.order.paymentStatus === "paid");

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: currency || "THB",
  }).format(amount);
}

async function loadDetail(): Promise<void> {
  if (!orderId.value) return;
  loading.value = true;
  error.value = null;
  try {
    detail.value = await $fetch<OrderDetail>(
      `/api/user/orders/${encodeURIComponent(orderId.value)}`,
    );
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : t("ordersPage.paymentSlip.loadFailed");
  } finally {
    loading.value = false;
  }
}

function onSlipChange(event: Event) {
  const input = event.target as HTMLInputElement;
  slipFile.value = input.files?.[0] ?? null;
}

async function uploadSlip(): Promise<void> {
  if (!slipFile.value) {
    toast.add({ title: t("ordersPage.paymentSlip.noFile"), color: "warning" });
    return;
  }
  slipUploading.value = true;
  try {
    const fd = new FormData();
    fd.append("file", slipFile.value);
    await $fetch(
      `/api/user/orders/${encodeURIComponent(orderId.value)}/payment-slip`,
      { method: "POST", body: fd },
    );
    slipFile.value = null;
    toast.add({
      title: t("ordersPage.paymentSlip.uploadSuccess"),
      color: "success",
    });
    await loadDetail();
  } catch (e) {
    toast.add({
      title:
        e instanceof Error ? e.message : t("ordersPage.paymentSlip.uploadError"),
      color: "error",
    });
  } finally {
    slipUploading.value = false;
  }
}

watch(orderId, () => void loadDetail(), { immediate: true });
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-4">
    <UCard v-if="loading"
      ><p class="text-sm text-muted">{{ t("ordersPage.paymentSlip.loading") }}</p></UCard
    >
    <UAlert
      v-else-if="error"
      color="error"
      :title="t('ordersPage.paymentSlip.loadFailed')"
      :description="error"
    />
    <template v-else-if="detail">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h1 class="text-xl font-bold">
              {{
                t("ordersPage.paymentSlip.orderTitle", {
                  number: detail.order.orderNumber,
                })
              }}
            </h1>
            <UBadge color="info">{{
              t(`ordersPage.status.payment.${detail.order.paymentStatus}`)
            }}</UBadge>
          </div>
        </template>
        <ul class="divide-y divide-gray-100">
          <li
            v-for="item in detail.items"
            :key="item.id"
            class="flex items-center justify-between py-2 text-sm"
          >
            <span>{{ item.name }} × {{ item.quantity }}</span>
            <span>{{ money(item.lineTotal, detail.order.currencyCode) }}</span>
          </li>
        </ul>
        <div class="mt-3 flex justify-between font-semibold">
          <span>{{ t("ordersPage.paymentSlip.grandTotal") }}</span>
          <span>{{ money(detail.order.grandTotal, detail.order.currencyCode) }}</span>
        </div>
      </UCard>

      <PaymentBankTransferCard v-if="!isPaid" />

      <UCard v-if="isPaid">
        <UAlert
          color="success"
          icon="bx:check-circle"
          :title="t('ordersPage.paymentSlip.paidTitle')"
          :description="t('ordersPage.paymentSlip.paidDesc')"
        />
      </UCard>

      <UCard v-else-if="canUploadSlip">
        <template #header
          ><h2 class="font-semibold">
            {{ t("ordersPage.paymentSlip.title") }}
          </h2></template
        >
        <div class="space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-muted">{{
              t("ordersPage.paymentSlip.amountToTransfer")
            }}</span>
            <span class="font-semibold">{{
              money(detail.order.grandTotal, detail.order.currencyCode)
            }}</span>
          </div>
          <p class="text-sm text-muted">
            {{ t("ordersPage.paymentSlip.instructions") }}
          </p>
          <UAlert
            color="info"
            icon="bx:info-circle"
            :description="t('ordersPage.paymentSlip.note')"
          />
          <UAlert
            v-if="detail.order.paymentStatus === 'pending_review' || detail.paymentSlips.length"
            color="success"
            icon="bx:check"
            :title="t('ordersPage.paymentSlip.pendingTitle')"
            :description="t('ordersPage.paymentSlip.pendingDesc')"
          />
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            class="block w-full text-sm"
            @change="onSlipChange"
          />
          <UButton
            icon="bx:upload"
            :loading="slipUploading"
            :disabled="!slipFile"
            @click="uploadSlip"
          >
            {{ t("ordersPage.paymentSlip.uploadAction") }}
          </UButton>
        </div>
      </UCard>

      <PaymentSlipHistory :slips="detail.paymentSlips" />
    </template>
  </div>
</template>
