<script setup lang="ts">
/**
 * Small "related payment request" card for the order / rental detail pages.
 * Fetches the customer's payment request that covers this target and links to
 * the central /user/payments/[id] page. The detail pages keep their history
 * role; the central page owns the pay/upload UX (no duplicate upload form here).
 */
const props = defineProps<{
  targetType: "sale_order" | "rental_booking_deposit";
  targetId: string;
}>();

const { t } = useI18n();

interface RelatedRequest {
  id: string;
  status: string;
  sourceType: string;
  totalAmountDue: number;
  currency: string;
  link: string;
}

const request = ref<RelatedRequest | null>(null);
const loaded = ref(false);

const actionLabel = computed(() => {
  switch (request.value?.status) {
    case "awaiting_payment":
      return t("paymentRequests.goToPayment");
    case "rejected":
      return t("paymentRequests.uploadAgain");
    default:
      return t("paymentRequests.viewDetail");
  }
});
function money(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: request.value?.currency || "THB",
  }).format(amount);
}

onMounted(async () => {
  try {
    const res = await $fetch<{ request: RelatedRequest | null }>(
      "/api/user/manual-payment-requests/by-target",
      { query: { target_type: props.targetType, target_id: props.targetId } },
    );
    request.value = res.request;
  } catch {
    /* silent — the card just won't render */
  } finally {
    loaded.value = true;
  }
});
</script>

<template>
  <UCard v-if="loaded && request">
    <template #header>
      <h2 class="font-semibold">
        {{ t("paymentRequests.relatedPaymentRequest") }}
      </h2>
    </template>
    <div class="flex items-center justify-between gap-3 text-sm">
      <div class="space-y-1">
        <PaymentRequestStatusBadge :status="request.status" />
        <p class="text-muted">
          {{ t("paymentRequests.amountDueNow") }}:
          <span class="font-medium">{{ money(request.totalAmountDue) }}</span>
        </p>
      </div>
      <UButton
        size="xs"
        variant="outline"
        :to="request.link"
        icon="bx:right-arrow-alt"
        trailing
      >
        {{ actionLabel }}
      </UButton>
    </div>
  </UCard>
</template>
