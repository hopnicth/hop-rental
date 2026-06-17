<script setup lang="ts">
/**
 * /user/payments — the customer's manual payment request list.
 *
 * Lets a customer return later (e.g. after closing the browser) to pay / upload a
 * slip. Filter tabs: all / awaiting payment / pending review / rejected / reviewed.
 * Each card links to /user/payments/[id]. Auth is enforced globally by
 * @nuxtjs/supabase (no route middleware — repo has no `auth` middleware).
 */
interface PaymentRequestCard {
  id: string;
  status: string;
  sourceType: string;
  currency: string;
  totalAmountDue: number;
  createdAt: string;
  items: { targetType: string; amountDue: number; label: string }[];
  slipExists: boolean;
  link: string;
}

const { t } = useI18n();

const FILTERS = [
  { key: "", labelKey: "paymentRequests.filterAll" },
  { key: "awaiting_payment", labelKey: "paymentRequests.awaitingPayment" },
  { key: "pending_review", labelKey: "paymentRequests.pendingReview" },
  { key: "rejected", labelKey: "paymentRequests.rejected" },
  { key: "reviewed", labelKey: "paymentRequests.reviewed" },
] as const;

const activeFilter = ref<string>("");
const loading = ref(false);
const error = ref<string | null>(null);
const requests = ref<PaymentRequestCard[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const query = activeFilter.value ? { status: activeFilter.value } : {};
    const res = await $fetch<{ items: PaymentRequestCard[] }>(
      "/api/user/manual-payment-requests",
      { query },
    );
    requests.value = res.items ?? [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("paymentRequests.loadFailed");
  } finally {
    loading.value = false;
  }
}

watch(activeFilter, load);
onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-4">
    <h1 class="text-xl font-bold">{{ t("paymentRequests.listTitle") }}</h1>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="f in FILTERS"
        :key="f.key"
        size="xs"
        :variant="activeFilter === f.key ? 'solid' : 'outline'"
        @click="activeFilter = f.key"
      >
        {{ t(f.labelKey) }}
      </UButton>
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
    <UCard v-else-if="requests.length === 0">
      <p class="text-sm text-muted">{{ t("paymentRequests.empty") }}</p>
    </UCard>
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <PaymentRequestListCard
        v-for="req in requests"
        :key="req.id"
        :request="req"
      />
    </div>
  </div>
</template>
