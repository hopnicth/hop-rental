<script setup lang="ts">
import { getAdminApiErrorMessage } from "~/utils/admin-api";

type FilterType = "checkbox" | "dropdown" | "number_range";

type FilterOption = {
  id: string;
  key: string;
  labelEn: string;
  labelTh: string;
  isActive: boolean;
};

type FilterGroup = {
  id: string;
  mainCategoryKey: string;
  key: string;
  labelEn: string;
  labelTh: string;
  filterType: FilterType;
  isActive: boolean;
  options: FilterOption[];
};

const props = defineProps<{
  productId: string;
  mainCategoryKey: string;
}>();

const groups = ref<FilterGroup[]>([]);
const selectedIds = ref<Set<string>>(new Set());
const loading = ref(false);
const loadError = ref<string | null>(null);

const assignableGroups = computed(() =>
  groups.value.filter(
    (g) =>
      g.isActive && g.filterType !== "number_range" && g.options.length > 0,
  ),
);

const numberRangeGroups = computed(() =>
  groups.value.filter((g) => g.isActive && g.filterType === "number_range"),
);

async function reload() {
  if (!props.mainCategoryKey || !props.productId) {
    groups.value = [];
    selectedIds.value = new Set();
    return;
  }

  loading.value = true;
  loadError.value = null;

  try {
    const [groupsRes, assignmentsRes] = await Promise.all([
      $fetch<{ items: FilterGroup[] }>("/api/admin/filter-groups", {
        query: { mainCategory: props.mainCategoryKey },
      }),
      $fetch<{ filterOptionIds: string[] }>(
        `/api/admin/products/${props.productId}/filter-options`,
      ),
    ]);

    groups.value = groupsRes.items ?? [];
    selectedIds.value = new Set(assignmentsRes.filterOptionIds ?? []);
  } catch (error) {
    loadError.value = getAdminApiErrorMessage(error, "Failed to load filters");
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.productId, props.mainCategoryKey] as const,
  () => {
    reload();
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-4">
    <div v-if="!mainCategoryKey" class="text-sm text-muted">
      Select a main category and save the product first to manage filter
      options.
    </div>

    <template v-else>
      <div v-if="loading" class="py-4 text-sm text-muted">
        Loading filter groups...
      </div>

      <UAlert
        v-else-if="loadError"
        color="error"
        variant="soft"
        title="Failed to load filters"
        :description="loadError"
      />

      <div
        v-else-if="
          assignableGroups.length === 0 && numberRangeGroups.length === 0
        "
        class="rounded-lg border border-dashed border-default p-3 text-sm text-muted"
      >
        No filter groups configured for this main category yet. Super-admin can
        create them in
        <ULink to="/admin/filter-groups">/admin/filter-groups</ULink>.
      </div>

      <template v-else>
        <UAlert
          color="info"
          variant="soft"
          title="Filter assignments are auto-derived from product tags"
          description="A filter option is checked when its key appears in the product's tag_keys (case-sensitive). To change what is checked, edit the Tags field above."
        />

        <div
          v-for="group in assignableGroups"
          :key="group.id"
          class="rounded-xl border border-default p-3"
        >
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ group.labelEn }}</span>
            <UBadge color="neutral" variant="soft" size="xs">
              {{ group.key }}
            </UBadge>
            <UBadge color="info" variant="soft" size="xs">
              {{ group.filterType }}
            </UBadge>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            <UCheckbox
              v-for="opt in group.options"
              :key="opt.id"
              :model-value="selectedIds.has(opt.id)"
              :label="`${opt.labelEn} (${opt.key})${opt.isActive ? '' : ' — inactive'}`"
              disabled
            />
          </div>
        </div>

        <UAlert
          v-if="numberRangeGroups.length > 0"
          color="info"
          variant="soft"
          title="Number-range filters are auto-derived"
          :description="
            `These groups read values from product spec keys: ` +
            numberRangeGroups
              .map((g) => `${g.labelEn} (spec.${g.key})`)
              .join(', ')
          "
        />
      </template>
    </template>
  </div>
</template>
