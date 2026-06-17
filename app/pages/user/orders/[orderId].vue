<script setup lang="ts">
// Auth is enforced globally by @nuxtjs/supabase redirectOptions (this route is
// not in the public `exclude` list), matching cart.vue / rentals detail — no
// per-page route middleware (the repo has no `auth` middleware, only `role`).
//
// Order history role: this page shows the order summary + payment slip history
// and LINKS to the central payment request (/user/payments/[id]) for the
// pay/upload UX. The primary upload form lives on the central payment page, not
// here, so we don't duplicate it.

const { t } = useI18n();
const route = useRoute();
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

      <UCard v-if="isPaid">
        <UAlert
          color="success"
          icon="bx:check-circle"
          :title="t('ordersPage.paymentSlip.paidTitle')"
          :description="t('ordersPage.paymentSlip.paidDesc')"
        />
      </UCard>

      <!-- Pay / upload lives on the central payment request page. -->
      <PaymentRequestRelatedCard
        v-else
        target-type="sale_order"
        :target-id="detail.order.id"
      />

      <PaymentSlipHistory :slips="detail.paymentSlips" />
    </template>
  </div>
</template>
