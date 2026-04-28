<script setup lang="ts">
/**
 * Reusable product-filter sidebar. Owns no state — all fields are bound via
 * `defineModel` so parent pages can wire them into local refs or composables.
 * Facet options (category / brand) are derived from the full product catalog.
 *
 * Dynamic filter groups (per main_category) are loaded via useFilterGroups when
 * `mainCategoryKey` prop is set; the parent owns the `dynamicFilters` model
 * keyed by groupId. Optional dynamic filter block visibility is tracked
 * separately via `addedDynamicGroupIds` so clearing a value does not remove the
 * block and make the UI feel like a page refresh.
 */
import type { DropdownMenuItem } from "@nuxt/ui";
import type { CatalogType } from "~/composables/useProductSearch";
import { mainCategories, mockSubCategories } from "~/mock/categories";
import type { CategorySelectOption } from "~/types/category";
import {
  useFilterGroups,
  type DynamicFilterValue,
  type FilterGroup,
  type FilterOption,
} from "~/composables/useFilterGroups";

type TypeOption = CatalogType | "all";

// Sentinel used by the dropdown filter to represent "no selection" — Reka UI
// (Nuxt UI's Select primitive) forbids items with an empty-string value.
const DROPDOWN_ALL_VALUE = "__all__";

// Show the inline brand search input only when the brand list grows past this
// threshold, to keep the UI clean for short lists.
const BRAND_SEARCH_THRESHOLD = 10;

// Visible chip cap before the "+N more" toggle kicks in.
const CHIP_VISIBLE_LIMIT = 6;

// Filter-group key that should be auto-pinned to the sidebar (always shown,
// not removable via the per-block × button) once it loads for the current
// main category.
const PINNED_GROUP_KEY = "sub_category";

const props = defineProps<{
  mainCategoryKey?: string | null;
  /** Category value that represents the page's no-op default (e.g. route group). */
  categoryNoopValue?: string | null;
  /** Brand → product-count map, computed by parent with brand filter excluded. */
  brandCounts?: Record<string, number>;
  /** groupId → optionId → count, computed with that group's selection excluded. */
  dynamicOptionCounts?: Record<string, Record<string, number>>;
  /** Mirrors useFilterGroups pending so the parent can drive the skeleton. */
  filterGroupsLoading?: boolean;
  /** Optional page-provided category options, used by rental/assets listings. */
  categoryOptions?: CategorySelectOption[];
  /** Optional raw key → localized label lookup for active chips. */
  categoryLabels?: Record<string, string>;
}>();

const category = defineModel<string>("category", { default: "all" });
// `type` model is retained so parent v-model bindings still work, but the
// product-type selector UI has been removed by request.
defineModel<TypeOption>("type", { default: "all" });
const brands = defineModel<string[]>("brands", { default: () => [] });
const minPrice = defineModel<number | null>("minPrice", { default: null });
const maxPrice = defineModel<number | null>("maxPrice", { default: null });
const inStock = defineModel<boolean>("inStock", { default: false });
const dynamicFilters = defineModel<Record<string, DynamicFilterValue>>(
  "dynamicFilters",
  { default: () => ({}) },
);
const addedDynamicGroupIds = defineModel<string[]>("addedDynamicGroupIds", {
  default: () => [],
});

const emit = defineEmits<{ reset: [] }>();

const { t, locale } = useI18n();
const { products } = useProducts();
const { groups: filterGroupsData, pending: filterGroupsPending } =
  useFilterGroups(() => props.mainCategoryKey ?? null);

function groupLabel(group: FilterGroup): string {
  return locale.value === "th" ? group.labelTh : group.labelEn;
}

function optionLabel(option: FilterOption): string {
  return locale.value === "th" ? option.labelTh : option.labelEn;
}

const addFilterMenuItems = computed<DropdownMenuItem[][]>(() => {
  if (availableGroups.value.length === 0) return [[]];
  return [
    availableGroups.value.map((group) => ({
      label: groupLabel(group),
      onSelect: () => addFilterGroup(group),
    })),
  ];
});

const showDynamicFilters = computed(
  () =>
    typeof props.mainCategoryKey === "string" &&
    props.mainCategoryKey.length > 0,
);

function isPinnedGroup(group: FilterGroup): boolean {
  return group.key === PINNED_GROUP_KEY;
}

const addedGroups = computed<FilterGroup[]>(() => {
  if (!showDynamicFilters.value) return [];
  const ids = new Set([
    ...addedDynamicGroupIds.value,
    ...Object.keys(dynamicFilters.value),
  ]);
  // Pin sub_category first; preserve the underlying sort_order for the rest.
  return filterGroupsData.value
    .filter((g) => ids.has(g.id))
    .slice()
    .sort((a, b) => {
      const ap = isPinnedGroup(a) ? 0 : 1;
      const bp = isPinnedGroup(b) ? 0 : 1;
      return ap - bp;
    });
});

const availableGroups = computed<FilterGroup[]>(() => {
  if (!showDynamicFilters.value) return [];
  const ids = new Set(addedGroups.value.map((group) => group.id));
  // Hide the pinned group from "+ Add Filter" — it auto-mounts on load.
  return filterGroupsData.value.filter(
    (g) => !ids.has(g.id) && !isPinnedGroup(g),
  );
});

function emptyValueForGroup(group: FilterGroup): DynamicFilterValue {
  return group.filterType === "number_range" ? { min: null, max: null } : [];
}

function ensureGroupVisible(groupId: string) {
  if (!addedDynamicGroupIds.value.includes(groupId)) {
    addedDynamicGroupIds.value = [...addedDynamicGroupIds.value, groupId];
  }
}

function addFilterGroup(group: FilterGroup) {
  ensureGroupVisible(group.id);
  const next = { ...dynamicFilters.value };
  if (!(group.id in next)) next[group.id] = emptyValueForGroup(group);
  dynamicFilters.value = next;
}

function removeFilterGroup(groupId: string) {
  const group = filterGroupsData.value.find((g) => g.id === groupId);
  // Pinned groups cannot be removed — clear their selection instead.
  if (group && isPinnedGroup(group)) {
    clearDynamicGroup(groupId);
    return;
  }
  const next = { ...dynamicFilters.value };
  delete next[groupId];
  dynamicFilters.value = next;
  addedDynamicGroupIds.value = addedDynamicGroupIds.value.filter(
    (id) => id !== groupId,
  );
}

function ensurePinnedGroupMounted(groups = filterGroupsData.value) {
  if (!showDynamicFilters.value) return;
  const pinned = groups.find((g) => isPinnedGroup(g));
  if (!pinned) return;
  if (pinned.id in dynamicFilters.value) return;
  addFilterGroup(pinned);
}

// Auto-mount the pinned sub_category group whenever filter groups load or the
// parent switches main category. Watching `showDynamicFilters` too is important
// on /search, where the sidebar can become dynamic after the user picks a main
// category without a full page refresh. `flush: "post"` lets parent reset stale
// dynamic filters first, then this component re-adds the pinned group.
watch(
  [filterGroupsData, showDynamicFilters, () => props.mainCategoryKey],
  ([groups]) => ensurePinnedGroupMounted(groups),
  { immediate: true, flush: "post" },
);

// Preserve visibility for groups that have values restored from URL query, and
// initialize empty values for visible groups so checkboxes/dropdowns can mutate
// them without special casing `undefined`.
watch(
  [filterGroupsData, addedDynamicGroupIds, dynamicFilters],
  ([groups]) => {
    if (!showDynamicFilters.value) return;
    const validIds = new Set(groups.map((group) => group.id));
    const nextVisible = new Set(
      addedDynamicGroupIds.value.filter((id) => validIds.has(id)),
    );
    for (const id of Object.keys(dynamicFilters.value)) {
      if (validIds.has(id)) nextVisible.add(id);
    }

    const nextFilters = { ...dynamicFilters.value };
    for (const id of nextVisible) {
      if (id in nextFilters) continue;
      const group = groups.find((item) => item.id === id);
      if (group) nextFilters[id] = emptyValueForGroup(group);
    }

    const visibleList = [...nextVisible];
    if (visibleList.join("|") !== addedDynamicGroupIds.value.join("|")) {
      addedDynamicGroupIds.value = visibleList;
    }
    if (
      Object.keys(nextFilters).length !==
      Object.keys(dynamicFilters.value).length
    ) {
      dynamicFilters.value = nextFilters;
    }
  },
  { immediate: true, deep: true, flush: "post" },
);

function toggleOption(groupId: string, optionId: string) {
  const current = dynamicFilters.value[groupId];
  if (!Array.isArray(current)) return;
  const next = current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
  dynamicFilters.value = { ...dynamicFilters.value, [groupId]: next };
}

function setRangeMin(groupId: string, value: number | null) {
  const current = dynamicFilters.value[groupId];
  const range = Array.isArray(current) ? { min: null, max: null } : current;
  dynamicFilters.value = {
    ...dynamicFilters.value,
    [groupId]: { ...range, min: value },
  };
}

function setRangeMax(groupId: string, value: number | null) {
  const current = dynamicFilters.value[groupId];
  const range = Array.isArray(current) ? { min: null, max: null } : current;
  dynamicFilters.value = {
    ...dynamicFilters.value,
    [groupId]: { ...range, max: value },
  };
}

// Resolve raw category key → localized label via mock catalog map plus optional
// DB-backed page-provided labels (used by /product-rental asset categories).
const categoryLabelMap = computed(() => {
  const m = new Map<string, string>();
  for (const main of mainCategories) m.set(main.key, t(main.labelKey));
  for (const sub of mockSubCategories) m.set(sub.id, t(sub.labelKey));
  for (const [key, label] of Object.entries(props.categoryLabels ?? {})) {
    if (key && label) m.set(key, label);
  }
  for (const option of props.categoryOptions ?? []) {
    if (option.value && option.label) m.set(option.value, option.label);
  }
  return m;
});

function labelForCategoryKey(key: string) {
  return categoryLabelMap.value.get(key) ?? key;
}

const categoryOptions = computed(() => {
  if (props.categoryOptions) {
    const optionsByValue = new Map<string, CategorySelectOption>();
    for (const option of props.categoryOptions) {
      if (option.value && option.value !== "all") {
        optionsByValue.set(option.value, option);
      }
    }
    return [
      { label: t("search.categoryAll"), value: "all" },
      ...optionsByValue.values(),
    ];
  }

  const mainCategoryKeys = new Set(mainCategories.map((main) => main.key));
  const set = new Set<string>();
  for (const p of products.value) {
    for (const key of p.categories) {
      // `product.categories` is backed by category_keys, which now contains
      // `[main_category_key] + tag_keys` for search/filter sync. Do not let raw
      // tags (brand, feature, sub_category option keys, etc.) leak into the
      // public Category dropdown — only known main categories belong here.
      if (mainCategoryKeys.has(key)) set.add(key);
    }
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
  if (props.brandCounts) {
    for (const brand of Object.keys(props.brandCounts)) {
      if (brand) set.add(brand);
    }
    for (const brand of brands.value) {
      if (brand) set.add(brand);
    }
    return [...set].sort();
  }
  for (const p of products.value) {
    if (p.brand) set.add(p.brand);
  }
  return [...set].sort();
});

// ── Facet-count lookups (props-driven; safe when parent omits them) ──
function brandCountFor(brand: string): number {
  return props.brandCounts?.[brand] ?? 0;
}

function dynamicCountFor(groupId: string, optionId: string): number {
  return props.dynamicOptionCounts?.[groupId]?.[optionId] ?? 0;
}

function brandLabelWithCount(brand: string): string {
  return props.brandCounts ? `${brand} (${brandCountFor(brand)})` : brand;
}

function optionLabelWithCount(group: FilterGroup, opt: FilterOption): string {
  const base = optionLabel(opt);
  return props.dynamicOptionCounts
    ? `${base} (${dynamicCountFor(group.id, opt.id)})`
    : base;
}

// ── Brand search-in-list (only renders past the threshold) ──
const brandSearch = ref("");
const showBrandSearch = computed(
  () => brandOptions.value.length > BRAND_SEARCH_THRESHOLD,
);
const filteredBrandOptions = computed(() => {
  const q = brandSearch.value.trim().toLowerCase();
  if (!q) return brandOptions.value;
  return brandOptions.value.filter((b) => b.toLowerCase().includes(q));
});

// ── Per-block "Clear" actions + active-state predicates ──
const isPriceActive = computed(
  () =>
    minPrice.value !== null || (maxPrice.value !== null && maxPrice.value > 0),
);

const isPriceInverted = computed(
  () =>
    minPrice.value !== null &&
    maxPrice.value !== null &&
    maxPrice.value > 0 &&
    minPrice.value > maxPrice.value,
);

function clearPrice() {
  minPrice.value = null;
  maxPrice.value = null;
}

function clearBrands() {
  brands.value = [];
}

function clearDynamicGroup(groupId: string) {
  const g = filterGroupsData.value.find((gr) => gr.id === groupId);
  ensureGroupVisible(groupId);
  const next = { ...dynamicFilters.value };
  next[groupId] = g ? emptyValueForGroup(g) : [];
  dynamicFilters.value = next;
}

function isDynamicGroupActive(groupId: string): boolean {
  const v = dynamicFilters.value[groupId];
  if (Array.isArray(v)) return v.length > 0;
  if (v) return v.min !== null || v.max !== null;
  return false;
}

function isRangeInverted(groupId: string): boolean {
  const v = dynamicFilters.value[groupId];
  if (Array.isArray(v) || !v) return false;
  return (
    typeof v.min === "number" &&
    typeof v.max === "number" &&
    Number.isFinite(v.min) &&
    Number.isFinite(v.max) &&
    v.min > v.max
  );
}

// ── Active filter chips (single source of truth shown above all blocks) ──
type FilterChip = { kind: string; label: string; remove: () => void };

const activeChips = computed<FilterChip[]>(() => {
  const list: FilterChip[] = [];
  // Skip the chip when the current category matches the page's main-category
  // route (selectedCategory defaults to that on category-scoped pages, so it
  // is the no-op state, not a user-applied filter).
  if (
    category.value &&
    category.value !== "all" &&
    category.value !== props.categoryNoopValue
  ) {
    const key = category.value;
    list.push({
      kind: "category",
      label: `${t("search.category")}: ${labelForCategoryKey(key)}`,
      remove: () => (category.value = "all"),
    });
  }
  if (isPriceActive.value) {
    const min = minPrice.value ?? 0;
    const max =
      maxPrice.value !== null && maxPrice.value > 0 ? maxPrice.value : "∞";
    list.push({
      kind: "price",
      label: `${t("search.priceRange")}: ${min}–${max}`,
      remove: clearPrice,
    });
  }
  for (const b of brands.value) {
    list.push({
      kind: "brand",
      label: `${t("search.brand")}: ${b}`,
      remove: () => (brands.value = brands.value.filter((x) => x !== b)),
    });
  }
  if (inStock.value) {
    list.push({
      kind: "stock",
      label: t("search.inStockOnly"),
      remove: () => (inStock.value = false),
    });
  }
  for (const g of addedGroups.value) {
    const v = dynamicFilters.value[g.id];
    if (Array.isArray(v)) {
      for (const oid of v) {
        const opt = g.options.find((o) => o.id === oid);
        if (!opt) continue;
        list.push({
          kind: "dynamic",
          label: `${groupLabel(g)}: ${optionLabel(opt)}`,
          remove: () => {
            const next = { ...dynamicFilters.value };
            next[g.id] = (next[g.id] as string[]).filter((x) => x !== oid);
            dynamicFilters.value = next;
          },
        });
      }
    } else if (v && (v.min !== null || v.max !== null)) {
      const min = v.min ?? 0;
      const max = v.max ?? "∞";
      list.push({
        kind: "dynamic",
        label: `${groupLabel(g)}: ${min}–${max}`,
        remove: () => {
          const next = { ...dynamicFilters.value };
          next[g.id] = { min: null, max: null };
          dynamicFilters.value = next;
        },
      });
    }
  }
  return list;
});

const activeCount = computed(() => activeChips.value.length);

const chipsExpanded = ref(false);
const visibleChips = computed(() =>
  chipsExpanded.value || activeChips.value.length <= CHIP_VISIBLE_LIMIT
    ? activeChips.value
    : activeChips.value.slice(0, CHIP_VISIBLE_LIMIT),
);
const hiddenChipCount = computed(() =>
  Math.max(0, activeChips.value.length - visibleChips.value.length),
);

// ── Skeleton: render placeholders while groups are loading & cache empty ──
const showFilterGroupsSkeleton = computed(
  () =>
    showDynamicFilters.value &&
    (filterGroupsPending.value || props.filterGroupsLoading === true) &&
    filterGroupsData.value.length === 0,
);
</script>

<template>
  <UCard :ui="{ body: 'space-y-4' }">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <h2 class="text-sm font-semibold">{{ t("search.filters") }}</h2>
          <UBadge
            v-if="activeCount > 0"
            color="primary"
            variant="soft"
            size="sm"
          >
            {{ activeCount }}
          </UBadge>
        </div>
        <UButton
          v-if="activeCount > 0"
          variant="ghost"
          color="neutral"
          size="xs"
          :label="t('search.clearAll')"
          @click="emit('reset')"
        />
      </div>
    </template>

    <!-- Active filter chips (summary of every applied selection) -->
    <div v-if="activeChips.length > 0" class="flex flex-wrap gap-1.5">
      <UButton
        v-for="(chip, idx) in visibleChips"
        :key="`chip-${idx}-${chip.kind}`"
        :label="chip.label"
        icon="i-lucide-x"
        variant="soft"
        color="primary"
        size="xs"
        @click="chip.remove()"
      />
      <UButton
        v-if="hiddenChipCount > 0"
        :label="t('search.moreFilters', { n: hiddenChipCount })"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="chipsExpanded = true"
      />
      <UButton
        v-else-if="chipsExpanded && activeChips.length > CHIP_VISIBLE_LIMIT"
        :label="t('search.showLess')"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="chipsExpanded = false"
      />
    </div>

    <!-- Price range -->
    <div>
      <div class="mb-1 flex items-center justify-between">
        <p class="text-xs font-medium text-muted">
          {{ t("search.priceRange") }}
        </p>
        <UButton
          v-if="isPriceActive"
          variant="ghost"
          color="neutral"
          size="xs"
          :label="t('search.clear')"
          @click="clearPrice"
        />
      </div>
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
      <p v-if="isPriceInverted" class="mt-1 text-xs text-error">
        {{ t("search.minMaxError") }}
      </p>
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
      <div class="mb-1 flex items-center justify-between">
        <p class="text-xs font-medium text-muted">{{ t("search.brand") }}</p>
        <UButton
          v-if="brands.length > 0"
          variant="ghost"
          color="neutral"
          size="xs"
          :label="t('search.clear')"
          @click="clearBrands"
        />
      </div>
      <UInput
        v-if="showBrandSearch"
        v-model="brandSearch"
        size="xs"
        icon="i-lucide-search"
        :placeholder="t('search.searchBrand')"
        class="mb-2 w-full"
      />
      <div class="max-h-60 space-y-1 overflow-y-auto">
        <UCheckbox
          v-for="b in filteredBrandOptions"
          :key="b"
          :model-value="brands.includes(b)"
          :label="brandLabelWithCount(b)"
          @update:model-value="
            (v: boolean) =>
              (brands = v ? [...brands, b] : brands.filter((x) => x !== b))
          "
        />
      </div>
    </div>

    <!-- Dynamic filter groups (per main_category) -->
    <template v-if="showDynamicFilters">
      <!-- Skeleton placeholders while groups load on first paint -->
      <template v-if="showFilterGroupsSkeleton">
        <div
          v-for="i in 2"
          :key="`fg-skel-${i}`"
          class="border-default border-t pt-3"
        >
          <USkeleton class="mb-2 h-3 w-24" />
          <USkeleton class="h-8 w-full" />
        </div>
      </template>

      <template v-else>
        <div
          v-for="group in addedGroups"
          :key="group.id"
          class="border-default border-t pt-3"
        >
          <div class="mb-1 flex items-center justify-between">
            <p class="text-xs font-medium text-muted">
              {{ groupLabel(group) }}
            </p>
            <div class="flex items-center gap-1">
              <UButton
                v-if="isDynamicGroupActive(group.id)"
                variant="ghost"
                color="neutral"
                size="xs"
                :label="t('search.clear')"
                @click="clearDynamicGroup(group.id)"
              />
              <UButton
                v-if="!isPinnedGroup(group)"
                icon="i-lucide-x"
                variant="ghost"
                color="neutral"
                size="xs"
                :aria-label="`Remove ${groupLabel(group)} filter`"
                @click="removeFilterGroup(group.id)"
              />
            </div>
          </div>

          <!-- checkbox -->
          <div
            v-if="group.filterType === 'checkbox'"
            class="max-h-60 space-y-1 overflow-y-auto"
          >
            <UCheckbox
              v-for="opt in group.options"
              :key="opt.id"
              :model-value="
                Array.isArray(dynamicFilters[group.id]) &&
                (dynamicFilters[group.id] as string[]).includes(opt.id)
              "
              :label="optionLabelWithCount(group, opt)"
              @update:model-value="() => toggleOption(group.id, opt.id)"
            />
          </div>

          <!-- dropdown (single-select; sentinel '__all__' represents
               'no selection' since Reka UI rejects empty-string item values) -->
          <USelect
            v-else-if="group.filterType === 'dropdown'"
            :model-value="
              Array.isArray(dynamicFilters[group.id]) &&
              (dynamicFilters[group.id] as string[]).length > 0
                ? (dynamicFilters[group.id] as string[])[0]
                : DROPDOWN_ALL_VALUE
            "
            :items="[
              { label: t('search.categoryAll'), value: DROPDOWN_ALL_VALUE },
              ...group.options.map((o) => ({
                label: optionLabelWithCount(group, o),
                value: o.id,
              })),
            ]"
            value-key="value"
            class="w-full"
            @update:model-value="
              (v: string) => {
                dynamicFilters = {
                  ...dynamicFilters,
                  [group.id]: v && v !== DROPDOWN_ALL_VALUE ? [v] : [],
                };
              }
            "
          />

          <!-- number_range -->
          <template v-else-if="group.filterType === 'number_range'">
            <div class="flex items-center gap-2">
              <UInput
                type="number"
                size="sm"
                class="w-full"
                :placeholder="t('search.min')"
                :model-value="
                  !Array.isArray(dynamicFilters[group.id])
                    ? ((
                        dynamicFilters[group.id] as {
                          min: number | null;
                          max: number | null;
                        }
                      ).min ?? null)
                    : null
                "
                @update:model-value="
                  (v) =>
                    setRangeMin(
                      group.id,
                      v === '' || v == null ? null : Number(v),
                    )
                "
              />
              <span class="text-xs text-muted">—</span>
              <UInput
                type="number"
                size="sm"
                class="w-full"
                :placeholder="t('search.max')"
                :model-value="
                  !Array.isArray(dynamicFilters[group.id])
                    ? ((
                        dynamicFilters[group.id] as {
                          min: number | null;
                          max: number | null;
                        }
                      ).max ?? null)
                    : null
                "
                @update:model-value="
                  (v) =>
                    setRangeMax(
                      group.id,
                      v === '' || v == null ? null : Number(v),
                    )
                "
              />
            </div>
            <p v-if="isRangeInverted(group.id)" class="mt-1 text-xs text-error">
              {{ t("search.minMaxError") }}
            </p>
          </template>
        </div>

        <!-- Add filter -->
        <div
          v-if="availableGroups.length > 0"
          class="border-default border-t pt-3"
        >
          <UDropdownMenu :items="addFilterMenuItems">
            <UButton
              icon="i-lucide-plus"
              variant="soft"
              color="neutral"
              size="sm"
              block
              :label="t('search.addFilter')"
            />
          </UDropdownMenu>
        </div>
      </template>
    </template>

    <!-- In-stock toggle -->
    <UCheckbox v-model="inStock" :label="t('search.inStockOnly')" />
  </UCard>
</template>
