<script setup lang="ts">
/**
 * Reusable product-filter sidebar. Owns no state — all fields are bound via
 * `defineModel` so parent pages can wire them into local refs or composables.
 * Facet options (category / brand) are derived from the full product catalog.
 */
import type { CatalogType } from "~/composables/useProductSearch";
import { mainCategories, mockSubCategories } from "~/mock/categories";

type TypeOption = CatalogType | "all";

const props = withDefaults(
  defineProps<{
    allowedTypes?: TypeOption[];
  }>(),
  {
    allowedTypes: () => ["all", "sale", "rental"] as TypeOption[],
  },
);

const category = defineModel<string>("category", { default: "all" });
const type = defineModel<TypeOption>("type", { default: "all" });
const brands = defineModel<string[]>("brands", { default: () => [] });
const minPrice = defineModel<number | null>("minPrice", { default: null });
const maxPrice = defineModel<number | null>("maxPrice", { default: null });
const inStock = defineModel<boolean>("inStock", { default: false });

const emit = defineEmits<{ reset: [] }>();

const { t } = useI18n();
const { products } = useProducts();

// Resolve raw category key → localized label via mock catalog map.
const categoryLabelMap = computed(() => {
  const m = new Map<string, string>();
  for (const main of mainCategories) m.set(main.key, t(main.labelKey));
  for (const sub of mockSubCategories) m.set(sub.id, t(sub.labelKey));
  return m;
});

function labelForCategoryKey(key: string) {
  return categoryLabelMap.value.get(key) ?? key;
}

const categoryOptions = computed(() => {
  const set = new Set<string>();
  for (const p of products.value) {
    for (const key of p.categories) set.add(key);
  }
  return [
    { label: t("search.categoryAll"), value: "all" },
    ...[...set]
      .map((c) => ({ label: labelForCategoryKey(c), value: c }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
});

const brandOptions = computed(() => {
  const set = new Set<string>();
  for (const p of products.value) {
    if (p.brand) set.add(p.brand);
  }
  return [...set].sort();
});

const typeOptions = computed(() => {
  const allOptions = [
    { label: t("search.typeAll"), value: "all" as const },
    { label: t("search.typeSale"), value: "sale" as const },
    { label: t("search.typeRental"), value: "rental" as const },
  ];

  return allOptions.filter((option) =>
    props.allowedTypes.includes(option.value),
  );
});

watchEffect(() => {
  if (!props.allowedTypes.includes(type.value)) {
    type.value = props.allowedTypes[0] ?? "all";
  }
});
</script>

<template>
  <UCard :ui="{ body: 'space-y-4' }">
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">{{ t("search.filters") }}</h2>
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          :label="t('search.reset')"
          @click="emit('reset')"
        />
      </div>
    </template>

    <!-- Product type -->
    <div v-if="typeOptions.length > 1">
      <p class="mb-1 text-xs font-medium text-muted">{{ t("search.type") }}</p>
      <USelect v-model="type" :items="typeOptions" class="w-full" />
    </div>

    <!-- Price range -->
    <div>
      <p class="mb-1 text-xs font-medium text-muted">
        {{ t("search.priceRange") }}
      </p>
      <div class="flex items-center gap-2">
        <UInput
          v-model.number="minPrice"
          type="number"
          :placeholder="t('search.min')"
          size="sm"
          class="w-full"
        />
        <span class="text-xs text-muted">—</span>
        <UInput
          v-model.number="maxPrice"
          type="number"
          :placeholder="t('search.max')"
          size="sm"
          class="w-full"
        />
      </div>
    </div>

    <!-- Category (single-select, immediate query) -->
    <div v-if="categoryOptions.length > 1">
      <p class="mb-1 text-xs font-medium text-muted">
        {{ t("search.category") }}
      </p>
      <USelect
        v-model="category"
        :items="categoryOptions"
        value-key="value"
        class="w-full"
      />
    </div>

    <!-- Brand multi-select -->
    <div v-if="brandOptions.length > 0">
      <p class="mb-1 text-xs font-medium text-muted">{{ t("search.brand") }}</p>
      <div class="max-h-40 space-y-1 overflow-y-auto">
        <UCheckbox
          v-for="b in brandOptions"
          :key="b"
          :model-value="brands.includes(b)"
          :label="b"
          @update:model-value="
            (v: boolean) =>
              (brands = v ? [...brands, b] : brands.filter((x) => x !== b))
          "
        />
      </div>
    </div>

    <!-- In-stock toggle -->
    <UCheckbox v-model="inStock" :label="t('search.inStockOnly')" />
  </UCard>
</template>
