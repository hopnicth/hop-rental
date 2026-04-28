<script setup lang="ts">
const { t } = useI18n();
const { categoryGroups, pending, error } = useCategories();
const emit = defineEmits<{ selected: [subId: string] }>();
const router = useRouter();

// Track selected sub-category per main category (single active selection at a time).
// Each group is explicitly initialized to "" so native <select> renders the
// placeholder instead of letting the browser auto-select the first option during
// async category hydration.
const selectedValues = ref<Record<string, string>>({});

watch(
  categoryGroups,
  (groups) => {
    const next: Record<string, string> = {};
    for (const group of groups) {
      const current = selectedValues.value[group.mainCategoryKey] ?? "";
      next[group.mainCategoryKey] = group.options.some(
        (option) => option.optionKey === current,
      )
        ? current
        : "";
    }
    selectedValues.value = next;
  },
  { immediate: true },
);

/**
 * Picking a sub-category clears sibling selections and jumps straight to
 * `/search` with only a keyword query. The search page category filter should
 * remain "all categories" because these option keys are Home-card shortcuts,
 * not main-category filter keys.
 */
async function onSelect(mainKey: string, subId: unknown) {
  const id = typeof subId === "string" && subId.length > 0 ? subId : null;
  if (!id) return;

  selectedValues.value = { [mainKey]: id };

  const group = categoryGroups.value.find(
    (item) => item.mainCategoryKey === mainKey,
  );
  const option = group?.options.find((item) => item.optionKey === id);
  if (!option) return;

  emit("selected", id);

  const params = new URLSearchParams({
    q: option.searchQuery || option.label,
  });

  await router.push(`/search?${params.toString()}`);
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="bx:category" class="size-5" />
        <span class="text-lg font-semibold">{{ t("categories.title") }}</span>
      </div>
    </template>

    <div class="space-y-4">
      <p v-if="pending" class="text-xs text-muted">Loading categories...</p>
      <p v-else-if="error" class="text-xs text-warning">
        Using fallback categories.
      </p>

      <div v-for="main in categoryGroups" :key="main.id" class="space-y-1.5">
        <!-- Main category label -->
        <div class="flex items-center gap-2">
          <UIcon v-if="main.icon" :name="main.icon" class="size-4 text-muted" />
          <span class="text-sm font-medium">{{ main.label }}</span>
        </div>

        <select
          v-model="selectedValues[main.mainCategoryKey]"
          class="w-full rounded-xl border border-default bg-white px-3 py-2 text-sm text-default outline-none transition focus:border-primary"
          @change="
            onSelect(
              main.mainCategoryKey,
              ($event.target as HTMLSelectElement).value,
            )
          "
        >
          <option value="" disabled>
            {{ t("categories.selectPlaceholder") }}
          </option>
          <option
            v-for="sub in main.options"
            :key="sub.id"
            :value="sub.optionKey"
          >
            {{ sub.label }}
          </option>
        </select>
      </div>
    </div>
  </UCard>
</template>
