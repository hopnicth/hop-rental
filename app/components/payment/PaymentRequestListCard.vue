<script setup lang="ts">
/**
 * One payment-request card in the /user/payments list. Shows status, source-type
 * label, amount due now, created date, a short allocation summary, slip status,
 * and the primary action (pay/upload, view, or re-upload) linking to
 * /user/payments/[id].
 */
interface PaymentRequestItemSummary {
  targetType: string;
  amountDue: number;
  label: string;
}
interface PaymentRequestCard {
  id: string;
  status: string;
  sourceType: string;
  currency: string;
  totalAmountDue: number;
  createdAt: string;
  items: PaymentRequestItemSummary[];
  slipExists: boolean;
  link: string;
}

const props = defineProps<{ request: PaymentRequestCard }>();
const { t } = useI18n();

function money(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: props.request.currency || "THB",
  }).format(amount);
}
function formatDate(v: string): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString();
}
const sourceLabel = computed(() => {
  if (props.request.sourceType === "sale_only")
    return t("paymentRequests.sourceSale");
  if (props.request.sourceType === "booking_only")
    return t("paymentRequests.sourceBooking");
  return t("paymentRequests.sourceMixed");
});
const actionLabel = computed(() => {
  switch (props.request.status) {
    case "awaiting_payment":
      return t("paymentRequests.goToPayment");
    case "rejected":
      return t("paymentRequests.uploadAgain");
    default:
      return t("paymentRequests.viewDetail");
  }
});
</script>

<template>
  <UCard class="h-full">
    <div class="flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <UBadge color="neutral" variant="outline" size="xs">{{
            sourceLabel
          }}</UBadge>
          <p class="mt-1 text-xs text-muted">
            {{ t("paymentRequests.createdAt") }}: {{ formatDate(request.createdAt) }}
          </p>
        </div>
        <PaymentRequestStatusBadge :status="request.status" />
      </div>

      <div class="flex items-baseline justify-between gap-3">
        <span class="text-sm text-muted">{{
          t("paymentRequests.amountDueNow")
        }}</span>
        <span class="text-base font-bold text-primary">{{
          money(request.totalAmountDue)
        }}</span>
      </div>

      <ul class="space-y-1 text-xs text-muted">
        <li
          v-for="(item, i) in request.items"
          :key="i"
          class="flex justify-between gap-2"
        >
          <span class="truncate">{{ item.label }}</span>
          <span>{{ money(item.amountDue) }}</span>
        </li>
      </ul>

      <div class="mt-auto flex items-center justify-between gap-2 pt-2">
        <span class="text-xs text-muted">
          <UIcon
            :name="request.slipExists ? 'bx:check-circle' : 'bx:time'"
            class="align-middle"
          />
          {{
            request.slipExists
              ? t("paymentRequests.slipUploaded")
              : t("paymentRequests.slipNone")
          }}
        </span>
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
    </div>
  </UCard>
</template>
