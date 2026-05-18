<script setup lang="ts">
interface PendingUserSummary {
  userId: string;
  fullName: string | null;
  phone: string | null;
  kycStatus?: string | null;
}

interface AdminPosV3PendingWorkItem {
  kind: "order" | "booking";
  id: string;
  reference: string;
  status: string;
  secondary: string;
}

defineProps<{
  user: PendingUserSummary;
  items: AdminPosV3PendingWorkItem[];
  loading?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  select: [item: AdminPosV3PendingWorkItem];
}>();

function badgeColor(kind: "order" | "booking") {
  return kind === "booking" ? "primary" : "info";
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Pending operational work</h2>
          <p class="text-sm text-muted">
            {{ user.fullName || "User context" }} ·
            {{ user.phone || user.userId }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UBadge v-if="user.kycStatus" color="neutral" variant="soft">
            KYC: {{ user.kycStatus }}
          </UBadge>
          <UBadge color="primary" variant="soft"
            >{{ items.length }} items</UBadge
          >
        </div>
      </div>
    </template>

    <UProgress v-if="loading" animation="carousel" />
    <UAlert
      v-if="error"
      class="mb-3"
      color="error"
      variant="soft"
      :title="error"
    />

    <div v-if="!loading && items.length === 0" class="text-sm text-muted">
      No pending pickup orders or active rental bookings were found for this
      user.
    </div>

    <div v-else class="max-h-80 space-y-2 overflow-y-auto pr-1">
      <button
        v-for="item in items"
        :key="`${item.kind}-${item.id}`"
        type="button"
        class="w-full rounded-2xl border border-default p-3 text-left transition hover:border-primary hover:bg-primary/5"
        @click="emit('select', item)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="badgeColor(item.kind)" variant="soft">
                {{ item.kind }}
              </UBadge>
              <p class="truncate font-semibold text-default">
                {{ item.reference }}
              </p>
            </div>
            <p class="mt-1 line-clamp-2 text-sm text-muted">
              {{ item.secondary }}
            </p>
          </div>
          <UBadge color="neutral" variant="soft">{{ item.status }}</UBadge>
        </div>
      </button>
    </div>
  </UCard>
</template>
