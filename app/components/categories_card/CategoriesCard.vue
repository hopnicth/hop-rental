<script setup lang="ts">
import type { SelectItem } from "@nuxt/ui";

const { t } = useI18n();
const { mainCategories, getSubCategories } = useCategories();
const emit = defineEmits<{ selected: [subId: string] }>();

// Track selected sub-category per main category (single active selection at a time)
const selectedValues = ref<Record<string, string | undefined>>({});

/**
 * Build SelectItem[] for a given main category key.
 */
function getDropdownItems(mainKey: string): SelectItem[] {
  const subs = getSubCategories(mainKey);
  return subs.value.map((sub) => ({
    label: t(sub.labelKey),
    value: sub.id,
  }));
}

/**
 * Picking a sub-category clears sibling selections and jumps straight to
 * `/search?q=<localized sub label>`. The search page handles the rest.
 */
async function onSelect(mainKey: string, subId: unknown) {
  const id = typeof subId === "string" && subId.length > 0 ? subId : null;
  if (!id) return;

  selectedValues.value = { [mainKey]: id };

  const sub = getSubCategories(mainKey).value.find((s) => s.id === id);
  if (!sub) return;

  emit("selected", id);

  await navigateTo({
    path: "/search",
    query: { q: t(sub.labelKey) },
  });
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
      <div v-for="main in mainCategories" :key="main.key" class="space-y-1.5">
        <!-- Main category label -->
        <div class="flex items-center gap-2">
          <UIcon v-if="main.icon" :name="main.icon" class="size-4 text-muted" />
          <span class="text-sm font-medium">{{ t(main.labelKey) }}</span>
        </div>

        <!-- Sub-category dropdown — no internal search, immediate query on pick -->
        <USelect
          :model-value="selectedValues[main.key]"
          :items="getDropdownItems(main.key)"
          value-key="value"
          :placeholder="t('categories.selectPlaceholder')"
          class="w-full"
          @update:model-value="(v: unknown) => onSelect(main.key, v)"
        />
      </div>
    </div>
  </UCard>
</template>
