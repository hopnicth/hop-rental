<script setup lang="ts">
interface SidebarItem {
  key: string;
  label: string;
  description: string;
  icon: string;
  to?: string | null;
  status: "live" | "planned";
}

const props = defineProps<{
  items: SidebarItem[];
}>();

const route = useRoute();

function statusColor(status: SidebarItem["status"]) {
  return status === "live" ? "success" : "neutral";
}
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          POS V2
        </p>
        <h2 class="text-lg font-semibold text-default">Workspace map</h2>
      </div>
    </template>

    <div class="space-y-3">
      <div
        v-for="item in props.items"
        :key="item.key"
        class="rounded-2xl border border-default p-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <UIcon :name="item.icon" class="text-lg text-primary" />
              <p class="font-medium text-default">{{ item.label }}</p>
            </div>
            <p class="mt-1 text-sm text-muted">
              {{ item.description }}
            </p>
          </div>
          <UBadge :color="statusColor(item.status)" variant="soft" size="sm">
            {{ item.status === "live" ? "Now" : "Planned" }}
          </UBadge>
        </div>

        <UButton
          v-if="item.to"
          :to="item.to"
          color="primary"
          :variant="route.path === item.to ? 'solid' : 'soft'"
          size="sm"
          class="mt-3"
        >
          Open
        </UButton>
      </div>
    </div>
  </UCard>

  <UAlert
    color="info"
    variant="soft"
    title="Phase 1 guardrails"
    description="This shell is intentionally frontend-only. Legacy /admin/pos remains the working operational screen during transition."
  />
</template>