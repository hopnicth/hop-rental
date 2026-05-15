<script setup lang="ts">
import { useProducts } from "~/composables/useProducts";
import { useAssets } from "~/composables/useAssets";
import { useMainCategories } from "~/composables/useMainCategories";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import MobileFloatingPanel from "~/components/mobile/MobileFloatingPanel.vue";
import SearchFilters from "~/components/search/SearchFilters.vue";
import type { CatalogType } from "~/composables/useProductSearch";
import {
  useFilterGroups,
  type DynamicFilterValue,
  type FilterGroup,
} from "~/composables/useFilterGroups";
import { productMatchesDynamicFilters } from "~/utils/dynamic-filters";
import {
  queryObjectsEqual,
  readDynamicFilters,
  readQueryBoolean,
  readQueryList,
  readQueryNumber,
  readQueryString,
  writeDynamicFilters,
} from "~/utils/filter-query";
import { mainCategories, mockSubCategories } from "~/mock/categories";
import type { Product } from "~/types/product";
import type { Asset } from "~/types/asset";
import type {
  CategorySelectOption,
  MainCategoryEntityType,
  StorefrontMainCategory,
} from "~/types/category";

const RESERVED_GROUPS = new Set(["all", "sale", "rental"]);

// Lookup tables used to map a user-selected category back to its owning
// main_category (so dynamic filter groups can light up on /product-all and
// /product-sale). Built once at module-load — both maps are static.
const MAIN_CATEGORY_KEYS = new Set(mainCategories.map((m) => m.key));
const SUB_TO_MAIN = new Map(
  mockSubCategories.map((s) => [s.id, s.mainCategoryKey] as const),
);

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const {
  products,
  getDisplayPrice,
  getTotalStock,
  loading: productsLoading,
} = useProducts();
const { assets, getAssetShowPath, loading: assetsLoading } = useAssets();

const isListingLoading = computed(() =>
  listingMode.value === "assets"
    ? assetsLoading.value || productsLoading.value
    : productsLoading.value || assetsLoading.value,
);

type ListingType = CatalogType | "all";
type SortDir = "high" | "low";
type ListingMode = "products" | "assets";

const group = computed(() => String(route.params.group ?? "all"));
const listingMode = computed<ListingMode>(() =>
  group.value === "rental" ? "assets" : "products",
);
const mainCategoryEntityType = computed<MainCategoryEntityType>(() =>
  listingMode.value === "assets" ? "asset" : "product",
);
const { categories: storefrontMainCategories } = useMainCategories(
  mainCategoryEntityType,
);
const defaultCategory = computed(() =>
  RESERVED_GROUPS.has(group.value) ? "all" : group.value,
);
const defaultType = computed<ListingType>(() => {
  if (group.value === "sale") return "sale";
  if (group.value === "rental") return "rental";
  return "all";
});

function readListingType(value: unknown): ListingType {
  const raw = readQueryString(value);
  return raw === "sale" || raw === "rental" || raw === "hybrid"
    ? raw
    : defaultType.value;
}

const selectedCategory = ref<string>(
  readQueryString(route.query.category) || defaultCategory.value,
);
const selectedType = ref<ListingType>(readListingType(route.query.type));
const selectedBrands = ref<string[]>(readQueryList(route.query.brands));
const minPrice = ref<number | null>(readQueryNumber(route.query.min));
const maxPrice = ref<number | null>(readQueryNumber(route.query.max));
const inStockOnly = ref(readQueryBoolean(route.query.stock));
const selectedDynamicFilters = ref<Record<string, DynamicFilterValue>>(
  readDynamicFilters(route.query.df),
);
const selectedAddedDynamicGroupIds = ref<string[]>(
  Object.keys(selectedDynamicFilters.value),
);
const isApplyingRouteQuery = ref(false);
const isSyncingToQuery = ref(false);

const storefrontMainCategoryKeySet = computed(
  () => new Set(storefrontMainCategories.value.map((item) => item.key)),
);

const allMainCategoryKeySet = computed(
  () => new Set([...MAIN_CATEGORY_KEYS, ...storefrontMainCategoryKeySet.value]),
);

function localizedMainCategoryLabel(item: StorefrontMainCategory): string {
  if (locale.value === "th") return item.labelTh || item.labelEn || item.key;
  return item.labelEn || item.labelTh || item.key;
}

const rentalCategoryOptions = computed<CategorySelectOption[] | undefined>(
  () => {
    if (listingMode.value !== "assets") return undefined;
    const optionsByValue = new Map<string, CategorySelectOption>();

    for (const item of storefrontMainCategories.value) {
      optionsByValue.set(item.key, {
        value: item.key,
        label: localizedMainCategoryLabel(item),
      });
    }

    for (const asset of assets.value) {
      const key = asset.mainCategoryKey;
      if (key && !optionsByValue.has(key)) {
        optionsByValue.set(key, { value: key, label: key });
      }
    }

    return [...optionsByValue.values()];
  },
);

const rentalCategoryLabels = computed<Record<string, string> | undefined>(
  () => {
    if (listingMode.value !== "assets") return undefined;
    return Object.fromEntries(
      (rentalCategoryOptions.value ?? []).map((option) => [
        option.value,
        option.label,
      ]),
    );
  },
);

// Main-category context for dynamic filter groups.
//   • Category-scoped routes (/product-power_tools, …) → use the route group.
//   • Reserved routes (/product-all, /product-sale, /product-rental) → derive
//     from the user-selected category so dynamic filters light up once they
//     pick a main- or sub-category from the dropdown. Assets carry their own
//     filter_keys (migration 043), so this path now applies to rentals too.
const mainCategoryKey = computed<string | null>(() => {
  if (!RESERVED_GROUPS.has(group.value)) return group.value;
  const sel = selectedCategory.value;
  if (!sel || sel === "all") return null;
  if (allMainCategoryKeySet.value.has(sel)) return sel;
  return SUB_TO_MAIN.get(sel) ?? null;
});

const { groups: filterGroups, pending: filterGroupsPending } =
  useFilterGroups(mainCategoryKey);

// Product is "rentable" only when at least one asset matches it with
// match_type === 'compatible' (per business rule for /product-all).
const compatibleProductIds = computed(
  () =>
    new Set(
      assets.value.flatMap((access) =>
        access.matches
          .filter((m) => m.matchType === "compatible")
          .map((m) => m.productId),
      ),
    ),
);

function scrollToTop() {
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function resetFilters() {
  selectedCategory.value = defaultCategory.value;
  selectedType.value = defaultType.value;
  selectedBrands.value = [];
  minPrice.value = null;
  maxPrice.value = null;
  inStockOnly.value = false;
  selectedDynamicFilters.value = {};
  selectedAddedDynamicGroupIds.value = [];
}

function applyRouteQuery() {
  if (isSyncingToQuery.value) return;
  isApplyingRouteQuery.value = true;
  const nextDynamicFilters = readDynamicFilters(route.query.df);

  selectedCategory.value =
    readQueryString(route.query.category) || defaultCategory.value;
  selectedType.value = readListingType(route.query.type);
  selectedBrands.value = readQueryList(route.query.brands);
  minPrice.value = readQueryNumber(route.query.min);
  maxPrice.value = readQueryNumber(route.query.max);
  inStockOnly.value = readQueryBoolean(route.query.stock);
  selectedDynamicFilters.value = nextDynamicFilters;
  selectedAddedDynamicGroupIds.value = Object.keys(nextDynamicFilters);

  nextTick(() => {
    isApplyingRouteQuery.value = false;
  });
}

function syncFiltersToQuery() {
  if (!import.meta.client || isApplyingRouteQuery.value) return;
  const next = { ...route.query };

  if (
    selectedCategory.value !== defaultCategory.value &&
    selectedCategory.value !== "all"
  ) {
    next.category = selectedCategory.value;
  } else {
    delete next.category;
  }

  if (
    selectedType.value !== defaultType.value &&
    selectedType.value !== "all"
  ) {
    next.type = selectedType.value;
  } else {
    delete next.type;
  }

  if (selectedBrands.value.length > 0) {
    next.brands = selectedBrands.value.join(",");
  } else {
    delete next.brands;
  }

  if (minPrice.value !== null && minPrice.value > 0) {
    next.min = String(minPrice.value);
  } else {
    delete next.min;
  }

  if (maxPrice.value !== null && maxPrice.value > 0) {
    next.max = String(maxPrice.value);
  } else {
    delete next.max;
  }

  if (inStockOnly.value) next.stock = "1";
  else delete next.stock;

  const dynamic = writeDynamicFilters(selectedDynamicFilters.value);
  if (dynamic) next.df = dynamic;
  else delete next.df;

  if (!queryObjectsEqual(route.query, next)) {
    isSyncingToQuery.value = true;
    void router.replace({ query: next }).finally(() => {
      nextTick(() => {
        isSyncingToQuery.value = false;
      });
    });
  }
}

// Index added groups by id for fast lookup inside the filter loop.
const filterGroupById = computed(() => {
  const map = new Map<string, FilterGroup>();
  for (const g of filterGroups.value) map.set(g.id, g);
  return map;
});

const sortDir = ref<SortDir>("high");

function toggleSort() {
  sortDir.value = sortDir.value === "high" ? "low" : "high";
}

const sortLabel = computed(() =>
  sortDir.value === "high"
    ? t("productPage.priceHighToLow")
    : t("productPage.priceLowToHigh"),
);

const itemsOptions = [9, 15, 21] as const;
const itemsPerPage = ref<(typeof itemsOptions)[number]>(9);
const currentPage = ref(1);

// Single source-of-truth predicate used by both the listing and the
// facet-count pipeline. Pass `exclude` to skip a dimension so we can compute
// "products matching all OTHER active filters" (Logic B / Lazada-style).
type ProductFilterExclude = {
  brand?: boolean;
  category?: boolean;
  type?: boolean;
  price?: boolean;
  stock?: boolean;
  dynamicGroupId?: string;
};

function productMatchesAllFilters(
  product: Product,
  exclude: ProductFilterExclude = {},
): boolean {
  if (
    !exclude.category &&
    selectedCategory.value !== "all" &&
    !product.categories.includes(selectedCategory.value)
  ) {
    return false;
  }
  if (!exclude.type) {
    if (selectedType.value === "sale" && !product.isForSale) return false;
    if (
      selectedType.value === "rental" &&
      !compatibleProductIds.value.has(product.id)
    ) {
      return false;
    }
  }
  if (!exclude.brand && selectedBrands.value.length > 0) {
    if (!product.brand || !selectedBrands.value.includes(product.brand)) {
      return false;
    }
  }
  if (!exclude.price) {
    const effectiveMax =
      maxPrice.value !== null && maxPrice.value > 0 ? maxPrice.value : null;
    const price = getDisplayPrice(product).final;
    if (minPrice.value !== null && price < minPrice.value) return false;
    if (effectiveMax !== null && price > effectiveMax) return false;
  }
  if (!exclude.stock && inStockOnly.value) {
    const stock = getTotalStock(product);
    if (selectedType.value === "rental") {
      if (stock.available <= 0 && stock.inStock <= 0) return false;
    } else if (stock.inStock <= 0) {
      return false;
    }
  }
  if (
    !productMatchesDynamicFilters(
      product,
      selectedDynamicFilters.value,
      filterGroupById.value,
      { excludeGroupId: exclude.dynamicGroupId },
    )
  ) {
    return false;
  }
  return true;
}

const filteredProducts = computed<Product[]>(() =>
  products.value.filter((p) => productMatchesAllFilters(p)),
);

const sortedProducts = computed(() => {
  const list = [...filteredProducts.value];
  return sortDir.value === "high"
    ? list.sort((a, b) => getDisplayPrice(b).final - getDisplayPrice(a).final)
    : list.sort((a, b) => getDisplayPrice(a).final - getDisplayPrice(b).final);
});

// ── Asset listing pipeline (used when listingMode === "assets") ──
type AssetFilterExclude = {
  brand?: boolean;
  category?: boolean;
  price?: boolean;
  dynamicGroupId?: string;
};

// Coerce specSummary (Record<string, unknown>) into the string-valued shape
// expected by the dynamic-filter matcher's number_range branch.
function assetSpecForMatcher(
  access: Asset,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(access.specSummary)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean")
      out[k] = String(v);
  }
  return out;
}

function assetMatchesAllFilters(
  access: Asset,
  exclude: AssetFilterExclude = {},
): boolean {
  if (
    !exclude.category &&
    selectedCategory.value !== "all" &&
    !access.categories.includes(selectedCategory.value)
  ) {
    return false;
  }
  if (!exclude.brand && selectedBrands.value.length > 0) {
    if (!access.brand || !selectedBrands.value.includes(access.brand)) {
      return false;
    }
  }
  if (!exclude.price) {
    const effectiveMax =
      maxPrice.value !== null && maxPrice.value > 0 ? maxPrice.value : null;
    const price = access.pricing.daily;
    if (minPrice.value !== null && price < minPrice.value) return false;
    if (effectiveMax !== null && price > effectiveMax) return false;
  }
  if (
    !productMatchesDynamicFilters(
      { filterKeys: access.filterKeys, spec: assetSpecForMatcher(access) },
      selectedDynamicFilters.value,
      filterGroupById.value,
      { excludeGroupId: exclude.dynamicGroupId },
    )
  ) {
    return false;
  }
  return true;
}

const filteredAssets = computed<Asset[]>(() =>
  assets.value.filter((a) => assetMatchesAllFilters(a)),
);

// ── Facet counts (Logic B — match-all-OTHER-filters) ──
const productBrandFacetCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const p of products.value) {
    if (!productMatchesAllFilters(p, { brand: true })) continue;
    if (!p.brand) continue;
    counts[p.brand] = (counts[p.brand] ?? 0) + 1;
  }
  return counts;
});

const assetBrandFacetCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const a of assets.value) {
    if (!assetMatchesAllFilters(a, { brand: true })) continue;
    if (!a.brand) continue;
    counts[a.brand] = (counts[a.brand] ?? 0) + 1;
  }
  return counts;
});

const brandFacetCounts = computed<Record<string, number>>(() =>
  listingMode.value === "assets"
    ? assetBrandFacetCounts.value
    : productBrandFacetCounts.value,
);

const dynamicFacetCounts = computed<Record<string, Record<string, number>>>(
  () => {
    const result: Record<string, Record<string, number>> = {};
    const useAssetsSource = listingMode.value === "assets";
    for (const group of filterGroups.value) {
      if (!(group.id in selectedDynamicFilters.value)) continue;
      const optionCounts: Record<string, number> = {};
      for (const opt of group.options) optionCounts[opt.id] = 0;
      if (useAssetsSource) {
        for (const a of assets.value) {
          if (!assetMatchesAllFilters(a, { dynamicGroupId: group.id })) {
            continue;
          }
          for (const opt of group.options) {
            const key = `${group.key}__${opt.key}`;
            if (a.filterKeys.includes(key)) optionCounts[opt.id]++;
          }
        }
      } else {
        for (const p of products.value) {
          if (!productMatchesAllFilters(p, { dynamicGroupId: group.id })) {
            continue;
          }
          for (const opt of group.options) {
            const key = `${group.key}__${opt.key}`;
            if (p.filterKeys.includes(key)) optionCounts[opt.id]++;
          }
        }
      }
      result[group.id] = optionCounts;
    }
    return result;
  },
);

const sortedAssets = computed(() => {
  const list = [...filteredAssets.value];
  return sortDir.value === "high"
    ? list.sort((a, b) => b.pricing.daily - a.pricing.daily)
    : list.sort((a, b) => a.pricing.daily - b.pricing.daily);
});

const totalItems = computed(() =>
  listingMode.value === "assets"
    ? sortedAssets.value.length
    : sortedProducts.value.length,
);

const paginatedProducts = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return sortedProducts.value.slice(start, start + itemsPerPage.value);
});

const paginatedAssets = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return sortedAssets.value.slice(start, start + itemsPerPage.value);
});

const recommendedAssets = computed(() => filteredAssets.value.slice(0, 3));

const hasActiveFilters = computed(() => {
  return (
    selectedCategory.value !== defaultCategory.value ||
    selectedType.value !== defaultType.value ||
    selectedBrands.value.length > 0 ||
    (minPrice.value ?? 0) > 0 ||
    (maxPrice.value ?? 0) > 0 ||
    inStockOnly.value ||
    Object.keys(selectedDynamicFilters.value).length > 0
  );
});

watch(itemsPerPage, () => {
  currentPage.value = 1;
});

watch(group, (next, previous) => {
  if (next === previous) return;
  currentPage.value = 1;
  resetFilters();
  syncFiltersToQuery();
});

watch(() => route.query, applyRouteQuery, { deep: true });

// Filter groups are scoped per main_category, so any time the effective
// main_category swaps (user picks a different category on /product-all)
// we must drop selections that belong to the old group.
watch(mainCategoryKey, (next, prev) => {
  if (next === prev || isApplyingRouteQuery.value) return;

  // On refresh, DB-backed asset categories can load after the route query is
  // restored, causing mainCategoryKey to change from null → selected category.
  // Preserve df in that hydration case; clear only on actual category changes.
  const routeCategory = readQueryString(route.query.category);
  const routeDynamicFilters = readDynamicFilters(route.query.df);
  if (
    !prev &&
    routeCategory === selectedCategory.value &&
    Object.keys(routeDynamicFilters).length > 0
  ) {
    return;
  }

  selectedDynamicFilters.value = {};
  selectedAddedDynamicGroupIds.value = [];
});

watch(
  [
    selectedCategory,
    selectedType,
    selectedBrands,
    minPrice,
    maxPrice,
    inStockOnly,
    selectedDynamicFilters,
  ],
  () => {
    if (isApplyingRouteQuery.value) return;
    currentPage.value = 1;
    scrollToTop();
  },
  { deep: true },
);

watch(
  [
    selectedCategory,
    selectedType,
    selectedBrands,
    minPrice,
    maxPrice,
    inStockOnly,
    selectedDynamicFilters,
  ],
  syncFiltersToQuery,
  { deep: true },
);

const recommendedProducts = computed(() => filteredProducts.value.slice(0, 3));
</script>

<template>
  <UContainer class="py-6">
    <div class="grid grid-cols-12 gap-4 lg:gap-6">
      <div class="hidden lg:block lg:col-span-4">
        <SearchFilters
          v-model:category="selectedCategory"
          v-model:type="selectedType"
          v-model:brands="selectedBrands"
          v-model:min-price="minPrice"
          v-model:max-price="maxPrice"
          v-model:in-stock="inStockOnly"
          v-model:dynamic-filters="selectedDynamicFilters"
          v-model:added-dynamic-group-ids="selectedAddedDynamicGroupIds"
          :main-category-key="mainCategoryKey"
          :brand-counts="brandFacetCounts"
          :dynamic-option-counts="dynamicFacetCounts"
          :filter-groups-loading="filterGroupsPending"
          :category-options="rentalCategoryOptions"
          :category-labels="rentalCategoryLabels"
          @reset="resetFilters"
        />
      </div>

      <div class="col-span-12 lg:col-span-8">
        <HopFeatureBar />
        <div class="mb-4 mt-4 flex items-center justify-end">
          <UButton
            variant="ghost"
            color="neutral"
            icon="bx:sort"
            :label="sortLabel"
            size="sm"
            @click="toggleSort"
          />
        </div>

        <template v-if="listingMode === 'assets'">
          <div
            v-if="paginatedAssets.length"
            class="grid grid-cols-2 gap-4 sm:grid-cols-3"
          >
            <LazyProductsAssetCard
              v-for="access in paginatedAssets"
              :key="access.id"
              :access="access"
              :browse-to="getAssetShowPath(access)"
              hide-matches
            />
          </div>
          <div v-else-if="isListingLoading" class="space-y-4">
            <CommonLoadingCat />
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <ProductsCatalogCardSkeleton
                v-for="index in itemsPerPage"
                :key="`asset-skel-${index}`"
              />
            </div>
          </div>
          <div v-else class="py-20 text-center text-gray-400">
            {{ t("productPage.noProducts") }}
          </div>
        </template>
        <template v-else>
          <div
            v-if="paginatedProducts.length"
            class="grid grid-cols-2 gap-4 sm:grid-cols-3"
          >
            <LazyProductsProductCard
              v-for="product in paginatedProducts"
              :key="product.id"
              :product-id="product.id"
            />
          </div>
          <div v-else-if="isListingLoading" class="space-y-4">
            <CommonLoadingCat />
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <ProductsCatalogCardSkeleton
                v-for="index in itemsPerPage"
                :key="`product-skel-${index}`"
              />
            </div>
          </div>
          <div v-else class="py-20 text-center text-gray-400">
            {{ t("productPage.noProducts") }}
          </div>
        </template>

        <div
          class="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between"
        >
          <UPagination
            v-model:page="currentPage"
            :items-per-page="itemsPerPage"
            :total="totalItems"
            :sibling-count="1"
            show-edges
            size="sm"
          />

          <div class="flex items-center gap-2 text-sm">
            <span class="text-gray-500">{{
              t("productPage.itemsPerPage")
            }}</span>
            <USelectMenu
              v-model="itemsPerPage"
              :items="itemsOptions.map((n) => ({ label: String(n), value: n }))"
              value-key="value"
              class="w-20"
              size="sm"
            />
          </div>
        </div>

        <div class="mt-10">
          <h3 class="mb-4 text-base font-semibold">
            {{ t("productPage.recommended") }}
          </h3>
          <template v-if="listingMode === 'assets'">
            <div
              v-if="recommendedAssets.length"
              class="grid grid-cols-2 gap-4 sm:grid-cols-3"
            >
              <LazyProductsAssetCard
                v-for="access in recommendedAssets"
                :key="`rec-asset-${access.id}`"
                :access="access"
                :browse-to="getAssetShowPath(access)"
                hide-matches
              />
            </div>
            <div
              v-else-if="isListingLoading"
              class="grid grid-cols-2 gap-4 sm:grid-cols-3"
            >
              <ProductsCatalogCardSkeleton
                v-for="index in 3"
                :key="`rec-asset-skel-${index}`"
              />
            </div>
          </template>
          <template v-else>
            <div
              v-if="recommendedProducts.length"
              class="grid grid-cols-2 gap-4 sm:grid-cols-3"
            >
              <LazyProductsProductCard
                v-for="product in recommendedProducts"
                :key="`rec-product-${product.id}`"
                :product-id="product.id"
              />
            </div>
            <div
              v-else-if="isListingLoading"
              class="grid grid-cols-2 gap-4 sm:grid-cols-3"
            >
              <ProductsCatalogCardSkeleton
                v-for="index in 3"
                :key="`rec-product-skel-${index}`"
              />
            </div>
          </template>
        </div>
      </div>
    </div>

    <MobileFloatingPanel
      :title="t('search.filters')"
      icon="bx:filter-alt"
      :button-label="t('search.filters')"
      :active="hasActiveFilters"
    >
      <SearchFilters
        v-model:category="selectedCategory"
        v-model:type="selectedType"
        v-model:brands="selectedBrands"
        v-model:min-price="minPrice"
        v-model:max-price="maxPrice"
        v-model:in-stock="inStockOnly"
        v-model:dynamic-filters="selectedDynamicFilters"
        v-model:added-dynamic-group-ids="selectedAddedDynamicGroupIds"
        :main-category-key="mainCategoryKey"
        :brand-counts="brandFacetCounts"
        :dynamic-option-counts="dynamicFacetCounts"
        :filter-groups-loading="filterGroupsPending"
        :category-options="rentalCategoryOptions"
        :category-labels="rentalCategoryLabels"
        @reset="resetFilters"
      />
    </MobileFloatingPanel>
  </UContainer>
</template>
