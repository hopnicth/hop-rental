<script setup lang="ts">
/**
 * Combined manual bank-transfer payment page for a MIXED checkout.
 *
 * Customer sees ONE combined amount due now (sale order total + shipping +
 * Booking Deposit) and uploads ONE slip once. The single upload fans out to
 * per-target pending_review evidence via POST /api/user/checkout-payment/slip
 * (no combined/payment_group backend). Evidence-only: nothing is marked paid /
 * confirmed / inventory-deducted here — staff review advances state.
 *
 * Amounts are authoritative: order total from the order GET; each Booking
 * Deposit due-now is computed with the SAME `calculateRentalPaymentLines`
 * helper the cart uses (rentalDays + security deposit), so it matches the cart.
 *
 * Reached as /user/checkout-payment?order=<id?>&bookings=<id,id>. Durable
 * per-target status also lives on /user/orders/[id] and /user/rentals/[id].
 */
import { calculateRentalPaymentLines } from "~/utils/rental-payment-lines";

// Auth is enforced globally by @nuxtjs/supabase redirectOptions (this route is
// not in the public `exclude` list), matching cart.vue / rentals detail — no
// per-page route middleware (the repo has no `auth` middleware, only `role`).

const { t } = useI18n();
const route = useRoute();
const toast = useToast();

const orderId = computed(() =>
  typeof route.query.order === "string" ? route.query.order : "",
);
const bookingIds = computed(() =>
  (typeof route.query.bookings === "string" ? route.query.bookings : "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

interface Slip {
  id: string;
  originalFilename: string;
  status: string;
  uploadedAt: string;
}
interface Allocation {
  saleTotal: number;
  shipping: number;
  bookingDeposit: number;
  currencyCode: string;
}

const loading = ref(false);
const error = ref<string | null>(null);
const orderPaymentStatus = ref<string>("");
const allocation = ref<Allocation>({
  saleTotal: 0,
  shipping: 0,
  bookingDeposit: 0,
  currencyCode: "THB",
});
const slips = ref<Slip[]>([]);
const slipFile = ref<File | null>(null);
const uploading = ref(false);

const combinedTotal = computed(
  () => allocation.value.saleTotal + allocation.value.bookingDeposit,
);
const canUpload = computed(
  () =>
    orderPaymentStatus.value !== "paid" &&
    (orderId.value !== "" || bookingIds.value.length > 0),
);

function money(amount: number, currency = allocation.value.currencyCode): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: currency || "THB",
  }).format(amount);
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const next: Allocation = {
    saleTotal: 0,
    shipping: 0,
    bookingDeposit: 0,
    currencyCode: "THB",
  };
  const collected: Slip[] = [];
  try {
    if (orderId.value) {
      const res = await $fetch<{
        order: {
          grandTotal: number;
          shippingCost?: number;
          currencyCode: string;
          paymentStatus: string;
        };
        paymentSlips: Slip[];
      }>(`/api/user/orders/${encodeURIComponent(orderId.value)}`);
      next.saleTotal = Number(res.order.grandTotal ?? 0);
      next.shipping = Number(res.order.shippingCost ?? 0);
      next.currencyCode = res.order.currencyCode || next.currencyCode;
      orderPaymentStatus.value = res.order.paymentStatus;
      collected.push(...(res.paymentSlips ?? []));
    }
    for (const id of bookingIds.value) {
      const res = await $fetch<{
        booking: { rentalDays: number };
        money: {
          currencyCode: string;
          securityDepositTotal: number;
          rentalFeeDueAtPickup: number;
        };
      }>(`/api/user/rental-bookings/${encodeURIComponent(id)}`);
      next.currencyCode = res.money.currencyCode || next.currencyCode;
      const lines = calculateRentalPaymentLines({
        customerKind: "individual",
        rentalDays: res.booking.rentalDays,
        rentalFeeAmount: res.money.rentalFeeDueAtPickup,
        depositAmount: res.money.securityDepositTotal,
        source: "checkout_payment_preview",
      });
      const depositLine = lines.find((l) => l.lineType === "booking_deposit");
      next.bookingDeposit += depositLine?.grossAmount ?? 0;
      const slipRes = await $fetch<{ slips: Slip[] }>(
        `/api/user/rental-bookings/${encodeURIComponent(id)}/deposit-slips`,
      );
      collected.push(...(slipRes.slips ?? []));
    }
    allocation.value = next;
    slips.value = collected;
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : t("checkoutPayment.loadFailed");
  } finally {
    loading.value = false;
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  slipFile.value = input.files?.[0] ?? null;
}

async function uploadSlip(): Promise<void> {
  if (!slipFile.value) {
    toast.add({ title: t("checkoutPayment.noFile"), color: "warning" });
    return;
  }
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append("file", slipFile.value);
    if (orderId.value) fd.append("orderId", orderId.value);
    if (bookingIds.value.length) fd.append("bookingIds", bookingIds.value.join(","));
    await $fetch("/api/user/checkout-payment/slip", { method: "POST", body: fd });
    slipFile.value = null;
    toast.add({ title: t("checkoutPayment.uploadSuccess"), color: "success" });
    await load();
  } catch (e) {
    toast.add({
      title: e instanceof Error ? e.message : t("checkoutPayment.uploadError"),
      color: "error",
    });
  } finally {
    uploading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6 p-4">
    <h1 class="text-xl font-bold">{{ t("checkoutPayment.title") }}</h1>

    <UCard v-if="loading"
      ><p class="text-sm text-muted">{{ t("checkoutPayment.loading") }}</p></UCard
    >
    <UAlert
      v-else-if="error"
      color="error"
      :title="t('checkoutPayment.loadFailed')"
      :description="error"
    />
    <template v-else>
      <UCard>
        <template #header>
          <h2 class="font-semibold">{{ t("checkoutPayment.amountTitle") }}</h2>
        </template>
        <div class="space-y-2 text-sm">
          <div v-if="allocation.saleTotal > 0" class="flex justify-between">
            <span class="text-muted">{{ t("checkoutPayment.saleAllocation") }}</span>
            <span>{{ money(allocation.saleTotal) }}</span>
          </div>
          <div v-if="allocation.bookingDeposit > 0" class="flex justify-between">
            <span class="text-muted">{{ t("checkoutPayment.depositAllocation") }}</span>
            <span>{{ money(allocation.bookingDeposit) }}</span>
          </div>
          <div class="flex justify-between border-t pt-2 text-base font-bold">
            <span>{{ t("checkoutPayment.combinedTotal") }}</span>
            <span class="text-primary">{{ money(combinedTotal) }}</span>
          </div>
          <UAlert
            color="info"
            variant="soft"
            icon="bx:info-circle"
            class="mt-2"
            :description="t('checkoutPayment.customerNote')"
          />
        </div>
      </UCard>

      <PaymentBankTransferCard />

      <UCard v-if="canUpload">
        <template #header>
          <h2 class="font-semibold">{{ t("checkoutPayment.uploadTitle") }}</h2>
        </template>
        <div class="space-y-3">
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            class="block w-full text-sm"
            @change="onFileChange"
          />
          <UButton
            icon="bx:upload"
            :loading="uploading"
            :disabled="!slipFile"
            @click="uploadSlip"
          >
            {{ t("checkoutPayment.uploadAction") }}
          </UButton>
        </div>
      </UCard>

      <PaymentSlipHistory :slips="slips" />
    </template>
  </div>
</template>
