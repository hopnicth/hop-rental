<script setup lang="ts">
/**
 * Admin view of customer-uploaded SALE ORDER payment-slip evidence + the
 * "Mark Payment Received" action (manual bank-transfer flow).
 *
 * Lists slip metadata, opens files via SHORT-LIVED signed URLs (private bucket,
 * no permanent public URL), and confirms payment through the existing safe
 * order model (record-payment route → paid + inventory + cart clear). Never
 * touches rental ledgers.
 */
type BadgeColor = "neutral" | "info" | "warning" | "success" | "error";

interface Slip {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  uploadedAt: string;
}

const props = defineProps<{ orderId: string; paymentStatus: string }>();
const emit = defineEmits<{ (e: "updated"): void }>();
const toast = useToast();

const slips = ref<Slip[]>([]);
const loading = ref(false);
const viewingId = ref<string | null>(null);
const marking = ref(false);

const isPaid = computed(() => props.paymentStatus === "paid");

const STATUS_COLOR: Record<string, BadgeColor> = {
  pending_review: "warning",
  reviewed: "success",
  rejected: "error",
};
function statusColor(s: string): BadgeColor {
  return STATUS_COLOR[s] ?? "neutral";
}
function formatDate(v: string): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

async function loadSlips(): Promise<void> {
  if (!props.orderId) return;
  loading.value = true;
  try {
    const res = await $fetch<{ slips: Slip[] }>(
      `/api/admin/orders/${props.orderId}/payment-slips`,
    );
    slips.value = res.slips ?? [];
  } catch (e) {
    toast.add({
      title: "Failed to load payment slips",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    loading.value = false;
  }
}

async function viewSlip(slipId: string): Promise<void> {
  viewingId.value = slipId;
  try {
    const res = await $fetch<{ url: string }>(
      `/api/admin/orders/${props.orderId}/payment-slips/${slipId}/signed-url`,
    );
    if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
  } catch (e) {
    toast.add({
      title: "Failed to open slip",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    viewingId.value = null;
  }
}

async function markPaymentReceived(): Promise<void> {
  marking.value = true;
  try {
    const latestSlipId = slips.value[0]?.id ?? null;
    await $fetch(`/api/admin/orders/${props.orderId}/record-payment`, {
      method: "POST",
      body: { paymentSlipId: latestSlipId },
    });
    toast.add({ title: "Payment recorded — order paid", color: "success" });
    await loadSlips();
    emit("updated");
  } catch (e) {
    toast.add({
      title: "Failed to record payment",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    marking.value = false;
  }
}

defineExpose({ loadSlips });
onMounted(loadSlips);
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Payment Slip Evidence ({{ slips.length }})</h3>
        <UButton
          size="xs"
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="loading"
          @click="loadSlips"
        >
          Refresh
        </UButton>
      </div>
    </template>

    <p v-if="!loading && slips.length === 0" class="text-sm text-gray-500">
      No payment slip uploaded by the customer yet.
    </p>

    <ul v-else class="divide-y divide-gray-100">
      <li
        v-for="slip in slips"
        :key="slip.id"
        class="flex items-center justify-between gap-3 py-3"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium">{{ slip.originalFilename }}</span>
            <UBadge size="xs" :color="statusColor(slip.status)">{{
              slip.status
            }}</UBadge>
          </div>
          <div class="text-xs text-gray-500">
            {{ formatDate(slip.uploadedAt) }} · {{ slip.mimeType }}
          </div>
        </div>
        <UButton
          size="xs"
          variant="soft"
          icon="i-heroicons-eye"
          :loading="viewingId === slip.id"
          @click="viewSlip(slip.id)"
        >
          View slip
        </UButton>
      </li>
    </ul>

    <UAlert
      v-if="slips.length"
      class="mt-3"
      color="neutral"
      variant="soft"
      icon="i-heroicons-information-circle"
      title="Mixed payment note"
      description="This payment evidence may cover both product/shipping payment and a Booking Deposit. Verify the total amount and confirm the related sale and booking targets through the existing admin actions — do not assume it covers only this order. หลักฐานนี้อาจครอบคลุมทั้งค่าสินค้า/ค่าส่ง และเงินมัดจำจอง กรุณาตรวจสอบยอดรวมและยืนยันรายการที่เกี่ยวข้องด้วยขั้นตอนของผู้ดูแลระบบ"
    />

    <template #footer>
      <div v-if="isPaid" class="text-sm font-medium text-green-600">
        Payment received — order paid.
      </div>
      <UButton
        v-else
        color="primary"
        icon="i-heroicons-check-circle"
        :loading="marking"
        @click="markPaymentReceived"
      >
        Mark Payment Received
      </UButton>
    </template>
  </UCard>
</template>
