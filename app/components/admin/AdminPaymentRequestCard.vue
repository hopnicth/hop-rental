<script setup lang="ts">
/**
 * Related payment-request card for admin order / rental booking detail pages.
 * Fetches the related central payment request (by target) and links to the admin
 * payment-request detail. Reminds staff that a mixed slip may cover both the sale
 * payment and the Booking Deposit, and that confirmation happens via the existing
 * admin actions. Admin pages follow the non-i18n convention (hardcoded English).
 */
const props = defineProps<{
  targetType: "sale_order" | "rental_booking_deposit";
  targetId: string;
}>();

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

function money(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: request.value?.currency || "THB",
  }).format(amount);
}

onMounted(async () => {
  try {
    const res = await $fetch<{ request: RelatedRequest | null }>(
      "/api/admin/manual-payment-requests/by-target",
      { query: { target_type: props.targetType, target_id: props.targetId } },
    );
    request.value = res.request;
  } catch {
    /* silent */
  } finally {
    loaded.value = true;
  }
});
</script>

<template>
  <UCard v-if="loaded && request">
    <template #header><h2 class="font-semibold">Related payment request</h2></template>
    <div class="space-y-2 text-sm">
      <div class="flex items-center justify-between gap-3">
        <div>
          <UBadge color="info" size="xs">{{ request.status }}</UBadge>
          <span class="ml-2 text-muted">{{ request.sourceType }}</span>
        </div>
        <UButton
          size="xs"
          variant="soft"
          :to="request.link"
          icon="bx:right-arrow-alt"
          trailing
          >Open</UButton
        >
      </div>
      <div class="flex justify-between">
        <span class="text-muted">Total amount</span>
        <span class="font-medium">{{ money(request.totalAmountDue) }}</span>
      </div>
      <p
        v-if="request.sourceType === 'mixed'"
        class="text-xs text-muted"
      >
        This evidence may cover both product/shipping payment and Booking Deposit.
        Verify the total and confirm the sale order and booking through the
        existing admin actions.
      </p>
    </div>
  </UCard>
</template>
