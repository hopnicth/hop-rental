<script setup lang="ts">
/**
 * "Mark Deposit Received" — admin records a manually-verified bank-transfer
 * booking deposit and confirms the booking. ADVANCE bookings only (owner
 * decision 2026-07-10): same-day walk-ins are processed in POS V3, which
 * collects the full security deposit under the correct ledger category.
 *
 * The amount is NOT staff-entered: it is the 3-tier booking-deposit formula
 * (calculateBookingDepositDueNow — same derivation as POS V3) shown read-only,
 * and the server re-computes and rejects any mismatch (422).
 *
 * Posts to /api/admin/rental-bookings/:id/record-deposit, which records the
 * deposit as a held-balance liability and confirms atomically via the
 * migration-119 RPC (f_confirm_rental_booking_deposit).
 * This panel NEVER confirms the booking by itself and NEVER touches Omise/QR.
 * Shown only while the booking is draft + deposit unpaid.
 */
import { calculateBookingDepositDueNow } from "~/utils/rental-payment-lines";

interface DepositSlipOption {
  id: string;
  originalFilename: string;
  status: string;
}

const props = defineProps<{
  bookingId: string;
  rentalDays?: number;
  securityDepositAmount?: number;
  startDate?: string;
  currencyCode?: string;
}>();
const emit = defineEmits<{ (e: "confirmed"): void }>();
const toast = useToast();

const CHANNEL_OPTIONS = [
  { value: "uploaded_slip", label: "Uploaded slip" },
  { value: "line_slip", label: "LINE slip" },
  { value: "whatsapp_slip", label: "WhatsApp slip" },
  { value: "manual", label: "Manual" },
];

// Sentinel for the "— None —" option: Reka <SelectItem> forbids an empty-string
// value (reserved for the cleared/placeholder state) — an empty string here
// crashes the whole page. Mapped back to null at the submit boundary; the
// record-deposit endpoint's wire contract (null = no slip) is unchanged.
const NO_SLIP_VALUE = "__none__";

/** Formula amount — single source of truth shared with POS V3 + the server guard. */
const bookingDepositDue = computed(() =>
  calculateBookingDepositDueNow({
    rentalDays: props.rentalDays,
    requiredSecurityDepositAmount: props.securityDepositAmount,
  }),
);
const remainingSecurityDeposit = computed(() =>
  Math.max(0, (props.securityDepositAmount ?? 0) - bookingDepositDue.value),
);

/** Bangkok local date (YYYY-MM-DD) — same convention as the booking dates. */
function bangkokToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const startsToday = computed(
  () => Boolean(props.startDate) && props.startDate === bangkokToday(),
);

function formatMoney(value: number): string {
  return `฿${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const paymentChannel = ref<string>("uploaded_slip");
const depositSlipId = ref<string>(NO_SLIP_VALUE);
const externalReference = ref<string>("");
const adminNote = ref<string>("");
const submitting = ref(false);
const slips = ref<DepositSlipOption[]>([]);

const slipOptions = computed(() => [
  { value: NO_SLIP_VALUE, label: "— None —" },
  ...slips.value.map((s) => ({
    value: s.id,
    label: `${s.originalFilename} (${s.status})`,
  })),
]);

async function loadSlips(): Promise<void> {
  if (!props.bookingId) return;
  try {
    const res = await $fetch<{ slips: DepositSlipOption[] }>(
      `/api/admin/rental-bookings/${props.bookingId}/deposit-slips`,
    );
    slips.value = res.slips ?? [];
  } catch {
    // Slip list is optional context for the dropdown — ignore load failures.
    slips.value = [];
  }
}

async function submit(): Promise<void> {
  if (!(bookingDepositDue.value > 0)) {
    toast.add({
      title: "Booking deposit could not be computed for this booking",
      color: "warning",
    });
    return;
  }
  submitting.value = true;
  try {
    await $fetch(`/api/admin/rental-bookings/${props.bookingId}/record-deposit`, {
      method: "POST",
      body: {
        // Sent for auditability; the server re-computes and rejects mismatches.
        amount: bookingDepositDue.value,
        paymentChannel: paymentChannel.value,
        // Boundary map: sentinel → null (the exact wire value for "no slip").
        depositSlipId:
          depositSlipId.value && depositSlipId.value !== NO_SLIP_VALUE
            ? depositSlipId.value
            : null,
        externalReference: externalReference.value || null,
        adminNote: adminNote.value || null,
      },
    });
    toast.add({
      title: "Deposit recorded — booking confirmed",
      color: "success",
    });
    emit("confirmed");
  } catch (e) {
    toast.add({
      title: "Failed to record deposit",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    submitting.value = false;
  }
}

onMounted(loadSlips);
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="font-semibold">Mark Deposit Received</h3>
    </template>

    <p class="mb-3 text-sm text-gray-500">
      Record a manually-verified bank-transfer booking deposit. This confirms
      the booking. Uploading a slip alone does not confirm — staff verify
      first. Advance bookings only.
    </p>

    <UAlert
      v-if="startsToday"
      class="mb-3"
      color="warning"
      variant="soft"
      title="Booking starts today"
    >
      <template #description>
        Same-day walk-ins should be processed via
        <NuxtLink to="/admin/pos-v3" class="underline font-medium">POS V3</NuxtLink>
        (full security deposit collected there). This surface collects the
        booking deposit only.
      </template>
    </UAlert>

    <div class="space-y-3">
      <div class="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-800">
        <p class="font-medium">
          เงินมัดจำจอง (Booking Deposit):
          {{ formatMoney(bookingDepositDue) }}
        </p>
        <p class="text-gray-500">
          เงินมัดจำประกันเก็บตอนรับของ (Security Deposit at pickup):
          {{ formatMoney(remainingSecurityDeposit) }}
        </p>
        <p class="mt-1 text-xs text-gray-400">
          Amount is fixed by the booking-deposit policy and validated
          server-side — it cannot be edited here.
        </p>
      </div>

      <UFormField label="Payment channel" required>
        <USelect v-model="paymentChannel" :items="CHANNEL_OPTIONS" />
      </UFormField>

      <UFormField v-if="slips.length" label="Linked slip">
        <USelect v-model="depositSlipId" :items="slipOptions" />
      </UFormField>

      <UFormField label="External reference">
        <UInput
          v-model="externalReference"
          placeholder="Bank / transfer reference (optional)"
        />
      </UFormField>

      <UFormField label="Admin note">
        <UTextarea v-model="adminNote" placeholder="Internal note (optional)" />
      </UFormField>

      <UButton
        color="primary"
        icon="i-heroicons-check-circle"
        :loading="submitting"
        :disabled="!(bookingDepositDue > 0)"
        @click="submit"
      >
        Mark Deposit Received
      </UButton>
    </div>
  </UCard>
</template>
