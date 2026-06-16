<script setup lang="ts">
/**
 * Admin view of customer-uploaded bank-transfer deposit-slip evidence.
 *
 * Lists slip metadata (filename / status / uploaded time / size) and opens the
 * file via a SHORT-LIVED signed URL fetched on demand. The bucket is private —
 * this component never receives or renders a permanent public URL. Viewing a
 * slip does NOT confirm the booking; admins confirm via "Mark Deposit Received".
 */
type BadgeColor = "neutral" | "info" | "warning" | "success" | "error";

interface DepositSlip {
  id: string;
  rentalBookingId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

const props = defineProps<{ bookingId: string }>();
const toast = useToast();

const slips = ref<DepositSlip[]>([]);
const loading = ref(false);
const viewingId = ref<string | null>(null);

const STATUS_COLOR: Record<string, BadgeColor> = {
  pending_review: "warning",
  reviewed: "success",
  rejected: "error",
};

function statusColor(status: string): BadgeColor {
  return STATUS_COLOR[status] ?? "neutral";
}

function statusLabel(status: string): string {
  if (status === "pending_review") return "Pending review";
  if (status === "reviewed") return "Reviewed";
  if (status === "rejected") return "Rejected";
  return status;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

async function loadSlips(): Promise<void> {
  if (!props.bookingId) return;
  loading.value = true;
  try {
    const res = await $fetch<{ slips: DepositSlip[] }>(
      `/api/admin/rental-bookings/${props.bookingId}/deposit-slips`,
    );
    slips.value = res.slips ?? [];
  } catch (e) {
    toast.add({
      title: "Failed to load deposit slips",
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
      `/api/admin/rental-bookings/${props.bookingId}/deposit-slips/${slipId}/signed-url`,
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

defineExpose({ loadSlips });

onMounted(loadSlips);
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Deposit Slip Evidence ({{ slips.length }})</h3>
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
      No deposit slip uploaded by the customer yet.
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
            <UBadge size="xs" :color="statusColor(slip.status)">
              {{ statusLabel(slip.status) }}
            </UBadge>
          </div>
          <div class="text-xs text-gray-500">
            {{ formatDate(slip.uploadedAt) }} · {{ slip.mimeType }} ·
            {{ formatBytes(slip.fileSizeBytes) }}
          </div>
          <p v-if="slip.reviewNote" class="mt-1 text-xs text-gray-500">
            Note: {{ slip.reviewNote }}
          </p>
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
  </UCard>
</template>
