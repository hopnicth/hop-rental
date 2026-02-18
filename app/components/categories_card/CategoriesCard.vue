<script setup lang="ts">
import type { SelectMenuItem } from "@nuxt/ui";
import type { CategorySearchPayload } from "~/types/category";

const { t } = useI18n();
const { mainCategories, getSubCategories, isSearching, searchByCategories } =
  useCategories();

const toast = useToast();

// Track selected sub-category per main category
const selectedValues = ref<Record<string, string | undefined>>({});

/**
 * Build SelectMenuItem[] for a given main category key.
 */
function getDropdownItems(mainKey: string): SelectMenuItem[] {
  const subs = getSubCategories(mainKey);
  return subs.value.map((sub) => ({
    label: t(sub.labelKey),
    value: sub.id,
  }));
}

/**
 * Collect selected values, send to API, and prepare for redirect.
 */
async function handleSearch() {
  // Build payload from selectedValues — keep only entries that have a value
  const selections = Object.entries(selectedValues.value)
    .filter(([, subId]) => subId !== undefined && subId !== "")
    .map(([mainKey, subId]) => ({
      mainCategoryKey: mainKey,
      subCategoryId: subId!,
    }));

  // Guard: at least 1 selection required
  if (selections.length === 0) {
    toast.add({
      title: t("categories.noSelection"),
      color: "warning",
      icon: "bx:info-circle",
    });
    return;
  }

  const payload: CategorySearchPayload = { selections };

  const results = await searchByCategories(payload);

  console.log("[CategoriesCard] search results:", results);

  // ── TODO: redirect to results page when ready ──
  // await navigateTo({ path: '/search-results', query: { ... } });
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <!-- Left: icon + title -->
        <div class="flex items-center gap-2">
          <UIcon name="bx:category" class="size-5" />
          <span class="text-lg font-semibold">{{ t("categories.title") }}</span>
        </div>

        <!-- Right: Search button -->
        <UButton
          :label="t('categories.searchButton')"
          icon="bx:search"
          :loading="isSearching"
          @click="handleSearch"
        />
      </div>
    </template>

    <div class="space-y-4">
      <div v-for="main in mainCategories" :key="main.key" class="space-y-1.5">
        <!-- Main category label -->
        <div class="flex items-center gap-2">
          <UIcon v-if="main.icon" :name="main.icon" class="size-4 text-muted" />
          <span class="text-sm font-medium">{{ t(main.labelKey) }}</span>
        </div>

        <!-- Sub-category dropdown (max-height ~5 lines, scrollable) -->
        <USelectMenu
          v-model="selectedValues[main.key]"
          :items="getDropdownItems(main.key)"
          value-key="value"
          :placeholder="t('categories.selectPlaceholder')"
          class="w-full"
          :ui="{ viewport: 'max-h-40 overflow-y-auto' }"
        />
      </div>
    </div>
  </UCard>
</template>
