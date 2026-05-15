<script setup lang="ts">
interface BranchOption {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  isActive: boolean;
}

const props = defineProps<{
  staffName: string;
  staffRole: string;
  branchName: string;
  branches: BranchOption[];
  selectedBranchId: string;
  branchLoading?: boolean;
  isOnline?: boolean;
}>();

const emit = defineEmits<{
  "update:selectedBranchId": [value: string];
}>();

function handleBranchChange(event: Event) {
  emit(
    "update:selectedBranchId",
    (event.target as HTMLSelectElement).value ?? "",
  );
}
</script>

<template>
  <UCard class="border-primary/30 bg-primary/5">
    <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          HOPNIC POS V2
        </p>
        <h1 class="text-2xl font-semibold text-default">
          Shell + Dashboard / Lookup Skeleton
        </h1>
        <p class="mt-1 text-sm text-muted">
          Safe starting point for the modular POS rebuild. No backend behavior is changed in this phase.
        </p>
      </div>

      <div class="flex flex-col gap-3 xl:min-w-[360px]">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="primary" variant="soft" size="lg">
            {{ staffName }}
          </UBadge>
          <UBadge color="warning" variant="soft" size="lg">
            {{ staffRole }}
          </UBadge>
          <UBadge :color="isOnline ? 'success' : 'warning'" variant="soft" size="lg">
            {{ isOnline ? "Online" : "Offline" }}
          </UBadge>
        </div>

        <div class="rounded-xl border border-default bg-default p-3">
          <label class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Branch context
          </label>
          <select
            :value="selectedBranchId"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
            :disabled="branchLoading"
            @change="handleBranchChange"
          >
            <option value="" disabled>เลือกสาขา</option>
            <option v-for="branch in branches" :key="branch.id" :value="branch.id">
              {{ branch.nameTh || branch.nameEn }} · {{ branch.code }}
            </option>
          </select>
          <p class="mt-2 text-sm text-muted">
            Current branch: {{ branchName }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton to="/admin/pos" icon="bx:store" color="primary">
            Open legacy POS
          </UButton>
          <UButton to="/admin/orders" icon="bx:receipt" variant="soft" color="primary">
            Orders & bookings
          </UButton>
        </div>
      </div>
    </div>
  </UCard>
</template>