<script setup lang="ts">
/**
 * "Mark Deposit Received" — admin records a manually-verified bank-transfer
 * booking deposit and confirms the booking.
 *
 * Posts to /api/admin/rental-bookings/:id/record-deposit, which records the
 * deposit as a held-balance liability and confirms via confirmRentalBooking().
 * This panel NEVER confirms the booking by itself and NEVER touches Omise/QR.
 * Shown only while the booking is draft + deposit unpaid.
 */
interface DepositSlipOption {
  id: string;
  originalFilename: string;
  status: string;
}

const props = defineProps<{
  bookingId: string;
  defaultAmount?: number;
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

const amount = ref<number>(props.defaultAmount ?? 0);
const paymentChannel = ref<string>("uploaded_slip");
const depositSlipId = ref<string>("");
const externalReference = ref<string>("");
const adminNote = ref<string>("");
const submitting = ref(false);
const slips = ref<DepositSlipOption[]>([]);

const slipOptions = computed(() => [
  { value: "", label: "— None —" },
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
  if (!(amount.value > 0)) {
    toast.add({
      title: "Enter the deposit amount received",
      color: "warning",
    });
    return;
  }
  submitting.value = true;
  try {
    await $fetch(`/api/admin/rental-bookings/${props.bookingId}/record-deposit`, {
      method: "POST",
      body: {
        amount: amount.value,
        paymentChannel: paymentChannel.value,
        depositSlipId: depositSlipId.value || null,
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
      Record a manually-verified bank-transfer deposit. This confirms the
      booking. Uploading a slip alone does not confirm — staff verify first.
    </p>

    <div class="space-y-3">
      <UFormField label="Amount received" required>
        <UInput
          v-model.number="amount"
          type="number"
          min="0"
          step="0.01"
          :placeholder="`Deposit in ${currencyCode ?? 'THB'}`"
        />
      </UFormField>

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
        :disabled="!(amount > 0)"
        @click="submit"
      >
        Mark Deposit Received
      </UButton>
    </div>
  </UCard>
</template>
