<script setup lang="ts">
/**
 * /search?q=... — product search results with faceted filter sidebar.
 *
 * Uses the Supabase `search_products` RPC for ranked results; the full
 * catalog is still hydrated via `useProducts()` so result cards can reuse
 * the existing `ProductCard` component.
 */
import type {
  CatalogType,
  ProductSearchResult,
} from "~/composables/useProductSearch";
import type { ContentPage, ContentType } from "~/types/content";
import type {
  CategorySelectOption,
  StorefrontMainCategory,
} from "~/types/category";
import { useMainCategories } from "~/composables/useMainCategories";
import MobileFloatingPanel from "~/components/mobile/MobileFloatingPanel.vue";
import { mainCategories, mockSubCategories } from "~/mock/categories";
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
import { assetMatchesSearchText } from "~/utils/asset-search";
import type { Product } from "~/types/product";
import type { Asset } from "~/types/asset";

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const { search } = useProductSearch();
const { products, getDisplayPrice, getTotalStock } = useProducts();
const { assets, getAssetShowPath, loading: assetsLoading } = useAssets();
const { categories: productMainCategories } = useMainCategories("product");
const { categories: rentalMainCategories } = useMainCategories("asset");
const { fetchContentPages, searchContentPages } = useContentPages();

const SEARCH_FACET_LIMIT = 1000;
type SearchScope = "all" | "product" | "rental" | ContentType;

const searchScopes: SearchScope[] = [
  "all",
  "product",
  "rental",
  "service",
  "review",
  "blog",
  "promotion",
];

const contentScopes: ContentType[] = ["service", "review", "blog", "promotion"];

const mainCategoryKeySet = new Set(mainCategories.map((item) => item.key));
const subToMainCategory = new Map(
  mockSubCategories.map((item) => [item.id, item.mainCategoryKey] as const),
);

// DB-backed category key set — mirrors the storefrontMainCategoryKeySet pattern
// used in /product-[group]/index.vue, but unions ALL scopes relevant to /search
// (product + asset) so that the resolver is not limited to rental-only DB keys.
//
// Service scope (and other content scopes) intentionally omitted here:
// the filter sidebar is hidden for all content scopes (showProductFilters = false),
// so useFilterGroups is never triggered for service/blog/review/promotion.
// Service category key resolution can be added when a filter sidebar is introduced
// for those scopes.
const storefrontMainCategoryKeySet = computed(() => {
  const keys = new Set<string>();
  for (const item of productMainCategories.value) keys.add(item.key);
  for (const item of rentalMainCategories.value) keys.add(item.key);
  return keys;
});

// Union of the hardcoded mock keys (product-era) and the DB-backed asset keys.
// This is the same allMainCategoryKeySet pattern from /product-[group]/index.vue.
const allMainCategoryKeySet = computed(
  () => new Set([...mainCategoryKeySet, ...storefrontMainCategoryKeySet.value]),
);

function readCategoryQuery(value: unknown): string {
  // Accept any non-empty string — do NOT gate on the hardcoded product-era
  // mainCategoryKeySet. Asset-only category keys are valid on the rental scope
  // and must survive URL parsing. The result filtering (rentalResults computed)
  // and the available category options are the authoritative scope gates.
  return readQueryString(value) || "all";
}

function readTypeQuery(value: unknown): CatalogType | "all" {
  const raw = readQueryString(value);
  return raw === "sale" || raw === "rental" ? raw : "all";
}

function readScopeQuery(value: unknown): SearchScope {
  const raw = readQueryString(value);
  return searchScopes.includes(raw as SearchScope)
    ? (raw as SearchScope)
    : "all";
}

// ── Query state ──
const q = ref(readQueryString(route.query.q));
const activeScope = ref<SearchScope>(readScopeQuery(route.query.scope));
const selectedCategory = ref<string>(readCategoryQuery(route.query.category));
const selectedType = ref<CatalogType | "all">(readTypeQuery(route.query.type));
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
const showSearchProgress = ref(false);
let progressStartedAt = 0;
let progressTimer: ReturnType<typeof setTimeout> | null = null;

const mainCategoryKey = computed<string | null>(() => {
  const selected = selectedCategory.value;
  if (!selected || selected === "all") return null;
  // Check the combined mock + DB-backed key set (same resolution order as
  // /product-[group]/index.vue's allMainCategoryKeySet check).
  if (allMainCategoryKeySet.value.has(selected)) return selected;
  return subToMainCategory.get(selected) ?? null;
});

const { groups: filterGroups, pending: filterGroupsPending } =
  useFilterGroups(mainCategoryKey);

const filterGroupById = computed(() => {
  const map = new Map<string, FilterGroup>();
  for (const group of filterGroups.value) map.set(group.id, group);
  return map;
});

const categorySearchLabelsByKey = computed(() => {
  const map = new Map<string, string[]>();
  for (const item of mainCategories) {
    map.set(item.key, [item.key, t(item.labelKey)]);
  }
  for (const item of mockSubCategories) {
    map.set(item.id, [item.id, t(item.labelKey)]);
  }
  return map;
});

const filterSearchLabelsByKey = computed(() => {
  const map = new Map<string, string[]>();
  for (const group of filterGroups.value) {
    for (const option of group.options) {
      map.set(`${group.key}__${option.key}`, [
        group.key,
        group.labelTh,
        group.labelEn,
        option.key,
        option.labelTh,
        option.labelEn,
      ]);
    }
  }
  return map;
});

// ── Rental-scope category options ─────────────────────────────────────────────
// Mirrors the pattern from app/pages/product-[group]/index.vue (rental/assets
// listing path). When activeScope is "rental" these are passed to both
// SearchFilters instances so the dropdown shows asset-relevant categories
// instead of the default product-catalog-derived fallback.

function localizedMainCategoryLabel(item: StorefrontMainCategory): string {
  if (locale.value === "th") return item.labelTh || item.labelEn || item.key;
  return item.labelEn || item.labelTh || item.key;
}

const rentalCategoryOptions = computed<CategorySelectOption[] | undefined>(
  () => {
    if (activeScope.value !== "rental") return undefined;
    const optionsByValue = new Map<string, CategorySelectOption>();
    for (const item of rentalMainCategories.value) {
      optionsByValue.set(item.key, {
        value: item.key,
        label: localizedMainCategoryLabel(item),
      });
    }
    // Include any mainCategoryKey values used by loaded assets that were not
    // already represented by the DB-backed list (graceful fallback).
    for (const asset of assets.value) {
      const key = asset.mainCategoryKey;
      if (key && !optionsByValue.has(key)) {
        optionsByValue.set(key, { value: key, label: key });
      }
    }
    // Return undefined (not []) when no options are available yet — an empty
    // array passed to SearchFilters is treated as "use these options" (truthy),
    // which produces only the "All" sentinel and hides the dropdown entirely.
    // undefined signals SearchFilters to fall back gracefully.
    const result = [...optionsByValue.values()];
    return result.length > 0 ? result : undefined;
  },
);

const rentalCategoryLabels = computed<Record<string, string> | undefined>(
  () => {
    if (activeScope.value !== "rental") return undefined;
    return Object.fromEntries(
      (rentalCategoryOptions.value ?? []).map((option) => [
        option.value,
        option.label,
      ]),
    );
  },
);

// ── Product-scope category options ────────────────────────────────────────────
// When activeScope is "product" these are passed to both SearchFilters instances
// so the dropdown shows DB-backed product main categories instead of falling
// back to the legacy products.value scan + 7-key mock gate inside SearchFilters.

const productCategoryOptions = computed<CategorySelectOption[] | undefined>(
  () => {
    if (activeScope.value !== "product") return undefined;
    const optionsByValue = new Map<string, CategorySelectOption>();
    for (const item of productMainCategories.value) {
      optionsByValue.set(item.key, {
        value: item.key,
        label: localizedMainCategoryLabel(item),
      });
    }
    // Return undefined (not []) when no options are available yet — an empty
    // array passed to SearchFilters is treated as "use these options" (truthy),
    // which produces only the "All" sentinel and hides the dropdown entirely.
    const result = [...optionsByValue.values()];
    return result.length > 0 ? result : undefined;
  },
);

const productCategoryLabels = computed<Record<string, string> | undefined>(
  () => {
    if (activeScope.value !== "product") return undefined;
    return Object.fromEntries(
      (productCategoryOptions.value ?? []).map((option) => [
        option.value,
        option.label,
      ]),
    );
  },
);

// ── All-scope category options ────────────────────────────────────────────────
// Union of active product main categories + active asset main categories from
// `main_categories`. Deduplication is key-first: if the same key exists in both
// sources the product-set label wins (product rows are iterated first).
// Returns undefined (not []) when both sources are empty so SearchFilters falls
// back gracefully rather than hiding its dropdown.

const allCategoryOptions = computed<CategorySelectOption[] | undefined>(() => {
  if (activeScope.value !== "all") return undefined;
  const optionsByValue = new Map<string, CategorySelectOption>();
  for (const item of productMainCategories.value) {
    optionsByValue.set(item.key, {
      value: item.key,
      label: localizedMainCategoryLabel(item),
    });
  }
  for (const item of rentalMainCategories.value) {
    if (!optionsByValue.has(item.key)) {
      optionsByValue.set(item.key, {
        value: item.key,
        label: localizedMainCategoryLabel(item),
      });
    }
  }
  const result = [...optionsByValue.values()];
  return result.length > 0 ? result : undefined;
});

const allCategoryLabels = computed<Record<string, string> | undefined>(() => {
  if (activeScope.value !== "all") return undefined;
  return Object.fromEntries(
    (allCategoryOptions.value ?? []).map((option) => [
      option.value,
      option.label,
    ]),
  );
});

// ── Pagination ──
const pageSize = 12;
const page = ref(1);

// ── Results ──
const results = ref<ProductSearchResult[]>([]);
const rpcFacetResults = ref<ProductSearchResult[]>([]);
const contentResults = ref<ContentPage[]>([]);
const totalCount = ref(0);
const loading = ref(false);
const contentLoading = ref(false);
let searchRunSeq = 0;
let contentSearchRunSeq = 0;

function scopeLabelKey(scope: SearchScope) {
  return `search.scope.${scope}`;
}

function contentResultsFor(scope: ContentType) {
  return contentResults.value.filter((item) => item.contentType === scope);
}

// Coerce specSummary (Record<string, unknown>) into the string-valued shape
// expected by the dynamic-filter matcher's number_range branch.
// Mirrors assetSpecForMatcher from /product-[group]/index.vue exactly.
function assetSpecForMatcher(asset: Asset): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(asset.specSummary)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean")
      out[k] = String(v);
  }
  return out;
}

const rentalResults = computed(() =>
  assets.value.filter((asset) => {
    // 1. Text / query match (unchanged)
    if (!assetMatchesSearchText(asset, q.value)) return false;
    // 2. Category match — skip when "all" is selected (unchanged)
    if (
      selectedCategory.value !== "all" &&
      asset.mainCategoryKey !== selectedCategory.value &&
      !asset.categories.includes(selectedCategory.value)
    ) {
      return false;
    }
    // 3. Dynamic filter match — rental scope only.
    //    Only applied when the user is actively viewing the rental scope so that
    //    rental assets shown inside the "all" scope panel are not affected until
    //    all-scope dynamic-filter semantics are addressed in a later phase.
    if (
      activeScope.value === "rental" &&
      !productMatchesDynamicFilters(
        { filterKeys: asset.filterKeys, spec: assetSpecForMatcher(asset) },
        selectedDynamicFilters.value,
        filterGroupById.value,
      )
    ) {
      return false;
    }
    return true;
  }),
);

const visibleContentResults = computed(() => {
  if (activeScope.value === "all") return contentResults.value;
  if (contentScopes.includes(activeScope.value as ContentType)) {
    return contentResultsFor(activeScope.value as ContentType);
  }
  return [];
});

function scopeCount(scope: SearchScope) {
  if (scope === "all") {
    return (
      totalCount.value +
      rentalResults.value.length +
      contentResults.value.length
    );
  }
  if (scope === "product") return totalCount.value;
  if (scope === "rental") return rentalResults.value.length;
  return contentResultsFor(scope).length;
}

const currentTotalCount = computed(() => scopeCount(activeScope.value));
const isCurrentScopeLoading = computed(() => {
  if (activeScope.value === "all") {
    return loading.value || contentLoading.value || assetsLoading.value;
  }
  if (activeScope.value === "product") return loading.value;
  if (activeScope.value === "rental") return assetsLoading.value;
  return contentLoading.value;
});

const showProductFilters = computed(() => true);

function setScope(scope: SearchScope) {
  activeScope.value = scope;
  page.value = 1;
  scrollToTop();
}

function scrollToTop() {
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function applyRouteQuery() {
  if (isSyncingToQuery.value) return;
  isApplyingRouteQuery.value = true;
  const nextDynamicFilters = readDynamicFilters(route.query.df);
  q.value = readQueryString(route.query.q);
  activeScope.value = readScopeQuery(route.query.scope);
  selectedCategory.value = readCategoryQuery(route.query.category);
  selectedType.value = readTypeQuery(route.query.type);
  selectedBrands.value = readQueryList(route.query.brands);
  minPrice.value = readQueryNumber(route.query.min);
  maxPrice.value = readQueryNumber(route.query.max);
  inStockOnly.value = readQueryBoolean(route.query.stock);
  selectedDynamicFilters.value = nextDynamicFilters;
  selectedAddedDynamicGroupIds.value = Object.keys(nextDynamicFilters);
  nextTick(() => {
    isApplyingRouteQuery.value = false;
    void runContentSearch();
    syncFiltersToQuery();
  });
}

function syncFiltersToQuery() {
  if (!import.meta.client || isApplyingRouteQuery.value) return;
  const next = { ...route.query };

  if (q.value.trim()) next.q = q.value.trim();
  else delete next.q;

  if (activeScope.value !== "all") next.scope = activeScope.value;
  else delete next.scope;

  if (selectedCategory.value !== "all") next.category = selectedCategory.value;
  else delete next.category;

  if (selectedType.value !== "all") next.type = selectedType.value;
  else delete next.type;

  if (selectedBrands.value.length > 0) next.brands = [...selectedBrands.value];
  else delete next.brands;

  if (minPrice.value !== null) next.min = String(minPrice.value);
  else delete next.min;

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

function setSearchProgress(value: boolean) {
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
  if (value) {
    progressStartedAt = Date.now();
    showSearchProgress.value = true;
    return;
  }
  const remaining = Math.max(0, 500 - (Date.now() - progressStartedAt));
  progressTimer = setTimeout(() => {
    showSearchProgress.value = false;
    progressTimer = null;
  }, remaining);
}

// ── Search execution ──
async function runSearch() {
  const seq = ++searchRunSeq;
  loading.value = true;
  setSearchProgress(true);
  const baseParams = {
    q: q.value.trim() || undefined,
    categories:
      selectedCategory.value !== "all" ? [selectedCategory.value] : undefined,
    type: selectedType.value === "all" ? undefined : selectedType.value,
    minPrice: minPrice.value ?? undefined,
    // Treat maxPrice === 0 as "no upper bound"
    maxPrice:
      maxPrice.value !== null && maxPrice.value > 0
        ? maxPrice.value
        : undefined,
    inStock: inStockOnly.value,
  };

  const [res, facetRes] = await Promise.all([
    search({
      ...baseParams,
      brands:
        selectedBrands.value.length > 0 ? selectedBrands.value : undefined,
      dynamicFilters: selectedDynamicFilters.value,
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
    }),
    search({
      ...baseParams,
      limit: SEARCH_FACET_LIMIT,
      offset: 0,
    }),
  ]);

  if (seq !== searchRunSeq) return;

  results.value = res.items.filter((item) => searchResultMatchesDynamic(item));
  rpcFacetResults.value = facetRes.items;
  totalCount.value = res.totalCount;
  loading.value = false;
  setSearchProgress(false);
}

async function runContentSearch() {
  const query = q.value.trim();
  const seq = ++contentSearchRunSeq;

  contentLoading.value = true;
  try {
    const items = query
      ? await searchContentPages({ q: query, limit: 48 })
      : (
          await Promise.all(
            contentScopes.map((scope) => fetchContentPages(scope)),
          )
        )
          .flat()
          .slice(0, 48);
    if (seq !== contentSearchRunSeq) return;
    contentResults.value = items;
  } catch (error) {
    console.warn("[search] browse content failed:", error);
    if (seq === contentSearchRunSeq) contentResults.value = [];
  } finally {
    if (seq === contentSearchRunSeq) contentLoading.value = false;
  }
}

const rpcFacetResultIds = computed(() => {
  if (!q.value.trim()) return null;
  return new Set(rpcFacetResults.value.map((item) => item.id));
});

function productMatchesSearchFacetSource(product: Product): boolean {
  const ids = rpcFacetResultIds.value;
  if (!ids) return productMatchesSearchText(product);
  return ids.has(product.id);
}

const productsById = computed(() => {
  const map = new Map<string, Product>();
  for (const product of products.value) map.set(product.id, product);
  return map;
});

function searchResultMatchesDynamic(item: ProductSearchResult): boolean {
  const product = productsById.value.get(item.id);
  if (!product) return true;
  return productMatchesDynamicFilters(
    product,
    selectedDynamicFilters.value,
    filterGroupById.value,
  );
}

function productMatchesSearchText(product: Product): boolean {
  const query = q.value.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    product.name.th,
    product.name.en,
    product.name.cn,
    product.name.jp,
    product.description.th,
    product.description.en,
    product.brand,
    ...product.categories,
    ...product.categories.flatMap(
      (key) => categorySearchLabelsByKey.value.get(key) ?? [],
    ),
    ...product.filterKeys,
    ...product.filterKeys.flatMap(
      (key) => filterSearchLabelsByKey.value.get(key) ?? [],
    ),
    ...Object.values(product.spec ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    haystack.includes(query) ||
    haystack.replaceAll(" ", "").includes(query.replaceAll(" ", ""))
  );
}

type SearchFilterExclude = {
  brand?: boolean;
  category?: boolean;
  type?: boolean;
  price?: boolean;
  stock?: boolean;
  dynamicGroupId?: string;
};

function productMatchesAllFilters(
  product: Product,
  exclude: SearchFilterExclude = {},
): boolean {
  if (!productMatchesSearchFacetSource(product)) return false;
  if (
    !exclude.category &&
    selectedCategory.value !== "all" &&
    !product.categories.includes(selectedCategory.value)
  ) {
    return false;
  }
  if (!exclude.type) {
    if (selectedType.value === "sale" && !product.isForSale) return false;
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
    if (stock.inStock <= 0) return false;
  }
  return productMatchesDynamicFilters(
    product,
    selectedDynamicFilters.value,
    filterGroupById.value,
    { excludeGroupId: exclude.dynamicGroupId },
  );
}

const brandFacetCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const product of products.value) {
    if (!productMatchesAllFilters(product, { brand: true })) continue;
    if (!product.brand) continue;
    counts[product.brand] = (counts[product.brand] ?? 0) + 1;
  }
  return counts;
});

const dynamicFacetCounts = computed<Record<string, Record<string, number>>>(
  () => {
    const result: Record<string, Record<string, number>> = {};
    for (const group of filterGroups.value) {
      if (!(group.id in selectedDynamicFilters.value)) continue;
      const optionCounts: Record<string, number> = {};
      for (const option of group.options) optionCounts[option.id] = 0;
      for (const product of products.value) {
        if (!productMatchesAllFilters(product, { dynamicGroupId: group.id })) {
          continue;
        }
        for (const option of group.options) {
          const key = `${group.key}__${option.key}`;
          if (product.filterKeys.includes(key)) optionCounts[option.id]++;
        }
      }
      result[group.id] = optionCounts;
    }
    return result;
  },
);

const hasActiveDynamicFilters = computed(() =>
  Object.values(selectedDynamicFilters.value).some((value) =>
    Array.isArray(value)
      ? value.length > 0
      : value.min !== null || value.max !== null,
  ),
);

// Reset to page 1 when the text query changes
watch(
  q,
  () => {
    if (isApplyingRouteQuery.value) return;
    page.value = 1;
    void runContentSearch();
  },
  { immediate: true },
);

watch(activeScope, () => {
  if (isApplyingRouteQuery.value) return;
  page.value = 1;
  // Clear the selected category so a product-era key cannot leak into the rental
  // zone (or vice-versa) when the user switches scope tabs.
  selectedCategory.value = "all";
});

// Reset pagination + scroll to top when filters change
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
    page.value = 1;
    scrollToTop();
  },
  { deep: true },
);

// Run search on any state change (including page)
watch(
  [
    q,
    activeScope,
    selectedCategory,
    selectedType,
    selectedBrands,
    minPrice,
    maxPrice,
    inStockOnly,
    selectedDynamicFilters,
    page,
  ],
  () => {
    void runSearch();
  },
  { deep: true, immediate: true },
);

watch(
  () => route.fullPath,
  () => applyRouteQuery(),
  { immediate: true },
);

// Keep all filters in the URL so refresh/back/share restores the same state.
watch(
  [
    q,
    activeScope,
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

const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalCount.value / pageSize)),
);

const hasActiveFilters = computed(() => {
  return (
    selectedCategory.value !== "all" ||
    selectedType.value !== "all" ||
    selectedBrands.value.length > 0 ||
    (minPrice.value ?? 0) > 0 ||
    (maxPrice.value ?? 0) > 0 ||
    inStockOnly.value ||
    hasActiveDynamicFilters.value
  );
});

const hasTextQuery = computed(() => q.value.trim().length > 0);
const hasSearchIntent = computed(
  () => hasTextQuery.value || hasActiveFilters.value,
);
const resultSummary = computed(() => {
  if (isCurrentScopeLoading.value) return t("search.searching");
  return t(
    hasSearchIntent.value ? "search.resultCount" : "search.browseCount",
    {
      n: currentTotalCount.value,
    },
  );
});
const emptyStateMessageKey = computed(() =>
  hasSearchIntent.value ? "search.noResults" : "search.browseEmpty",
);

function resetFilters() {
  selectedCategory.value = "all";
  selectedType.value = "all";
  selectedBrands.value = [];
  minPrice.value = null;
  maxPrice.value = null;
  inStockOnly.value = false;
  selectedDynamicFilters.value = {};
  selectedAddedDynamicGroupIds.value = [];
}

watch(mainCategoryKey, (next, previous) => {
  if (next !== previous && !isApplyingRouteQuery.value) {
    selectedDynamicFilters.value = {};
    selectedAddedDynamicGroupIds.value = [];
  }
});
</script>

<template>
  <UContainer class="py-6">
    <h1 class="mb-4 text-xl font-bold sm:text-2xl">
      {{ t("search.title") }}
    </h1>

    <!-- Search input bar (big, editable) -->
    <div class="mb-4">
      <SearchBar
        v-model="q"
        v-model:scope="activeScope"
        size="lg"
        full-width
        :navigate-on-submit="false"
      />
    </div>

    <div class="mb-5 flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="scope in searchScopes"
        :key="scope"
        type="button"
        class="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition"
        :class="
          activeScope === scope
            ? 'bg-primary text-inverted'
            : 'bg-elevated text-muted hover:text-highlighted'
        "
        @click="setScope(scope)"
      >
        <span>{{ t(scopeLabelKey(scope)) }}</span>
        <span v-if="scopeCount(scope) > 0" class="text-xs opacity-75">
          {{ scopeCount(scope) }}
        </span>
      </button>
    </div>

    <div class="grid grid-cols-12 gap-4 lg:gap-6">
      <!-- ── Filter sidebar (4 cols on lg+) ── -->
      <aside v-if="showProductFilters" class="hidden lg:block lg:col-span-3">
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
          :category-options="
            activeScope === 'all'
              ? allCategoryOptions
              : activeScope === 'product'
                ? productCategoryOptions
                : activeScope === 'rental'
                  ? rentalCategoryOptions
                  : undefined
          "
          :category-labels="
            activeScope === 'all'
              ? allCategoryLabels
              : activeScope === 'product'
                ? productCategoryLabels
                : activeScope === 'rental'
                  ? rentalCategoryLabels
                  : undefined
          "
          @reset="resetFilters"
        />
      </aside>

      <!-- ── Results (9 cols on lg+) ── -->
      <main
        class="col-span-12"
        :class="showProductFilters ? 'lg:col-span-9' : ''"
      >
        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm text-muted">
            {{ resultSummary }}
          </p>
        </div>
        <div
          v-if="showSearchProgress || isCurrentScopeLoading"
          class="mb-3 h-1 overflow-hidden rounded-full bg-muted"
        >
          <div class="h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </div>

        <UCard v-if="!hasSearchIntent" class="mb-4">
          <div class="flex gap-3">
            <UIcon name="bx:compass" class="mt-0.5 text-2xl text-primary" />
            <div>
              <h2 class="text-base font-semibold">
                {{ t("search.browseTitle") }}
              </h2>
              <p class="mt-1 text-sm text-muted">
                {{ t("search.browseDescription") }}
              </p>
            </div>
          </div>
        </UCard>

        <div
          v-if="isCurrentScopeLoading && currentTotalCount === 0"
          class="space-y-4"
        >
          <CommonLoadingCat />
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <ProductsCatalogCardSkeleton
              v-for="index in pageSize"
              :key="`search-skel-${index}`"
            />
          </div>
        </div>

        <div v-else-if="activeScope === 'all'" class="space-y-8">
          <section v-if="results.length > 0" class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold">
                {{ t("search.scope.product") }}
              </h2>
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                :label="t('search.viewAll')"
                @click="setScope('product')"
              />
            </div>
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <LazyProductsProductCard
                v-for="item in results.slice(0, 8)"
                :key="item.id"
                :product-id="item.id"
              />
            </div>
          </section>

          <section v-if="rentalResults.length > 0" class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold">
                {{ t("search.scope.rental") }}
              </h2>
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                :label="t('search.viewAll')"
                @click="setScope('rental')"
              />
            </div>
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <ProductsAssetCard
                v-for="asset in rentalResults.slice(0, 6)"
                :key="asset.id"
                :access="asset"
                :browse-to="getAssetShowPath(asset)"
                hide-matches
              />
            </div>
          </section>

          <template v-for="scope in contentScopes" :key="scope">
            <section
              v-if="contentResultsFor(scope).length > 0"
              class="space-y-3"
            >
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-base font-semibold">
                  {{ t(scopeLabelKey(scope)) }}
                </h2>
                <UButton
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  :label="t('search.viewAll')"
                  @click="setScope(scope)"
                />
              </div>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ContentPageCard
                  v-for="pageItem in contentResultsFor(scope).slice(0, 3)"
                  :key="pageItem.id"
                  :page="pageItem"
                />
              </div>
            </section>
          </template>

          <UCard v-if="currentTotalCount === 0">
            <div class="py-10 text-center">
              <UIcon
                name="bx:search-alt"
                class="mx-auto mb-2 text-3xl text-muted"
              />
              <p class="text-sm text-muted">
                {{ t(emptyStateMessageKey) }}
              </p>
            </div>
          </UCard>
        </div>

        <template v-else-if="activeScope === 'product'">
          <div
            v-if="results.length > 0"
            class="grid grid-cols-2 gap-4 sm:grid-cols-3"
          >
            <LazyProductsProductCard
              v-for="item in results"
              :key="item.id"
              :product-id="item.id"
            />
          </div>

          <UCard v-else>
            <div class="py-10 text-center">
              <UIcon
                name="bx:search-alt"
                class="mx-auto mb-2 text-3xl text-muted"
              />
              <p class="text-sm text-muted">
                {{ t(emptyStateMessageKey) }}
              </p>
            </div>
          </UCard>

          <div v-if="totalPages > 1" class="mt-6 flex justify-center">
            <UPagination
              v-model:page="page"
              :total="totalCount"
              :items-per-page="pageSize"
            />
          </div>
        </template>

        <div v-else-if="activeScope === 'rental'" class="space-y-4">
          <div
            v-if="rentalResults.length > 0"
            class="grid grid-cols-2 gap-4 sm:grid-cols-3"
          >
            <ProductsAssetCard
              v-for="asset in rentalResults"
              :key="asset.id"
              :access="asset"
              :browse-to="getAssetShowPath(asset)"
              hide-matches
            />
          </div>
          <UCard v-else>
            <div class="py-10 text-center">
              <UIcon
                name="bx:search-alt"
                class="mx-auto mb-2 text-3xl text-muted"
              />
              <p class="text-sm text-muted">
                {{ t(emptyStateMessageKey) }}
              </p>
            </div>
          </UCard>
        </div>

        <div v-else class="space-y-4">
          <div
            v-if="visibleContentResults.length > 0"
            class="grid grid-cols-2 gap-4 sm:grid-cols-3"
          >
            <ContentPageCard
              v-for="pageItem in visibleContentResults"
              :key="pageItem.id"
              :page="pageItem"
            />
          </div>
          <UCard v-else>
            <div class="py-10 text-center">
              <UIcon
                name="bx:search-alt"
                class="mx-auto mb-2 text-3xl text-muted"
              />
              <p class="text-sm text-muted">
                {{ t(emptyStateMessageKey) }}
              </p>
            </div>
          </UCard>
        </div>
      </main>
    </div>

    <MobileFloatingPanel
      v-if="showProductFilters"
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
        :category-options="
          activeScope === 'all'
            ? allCategoryOptions
            : activeScope === 'product'
              ? productCategoryOptions
              : activeScope === 'rental'
                ? rentalCategoryOptions
                : undefined
        "
        :category-labels="
          activeScope === 'all'
            ? allCategoryLabels
            : activeScope === 'product'
              ? productCategoryLabels
              : activeScope === 'rental'
                ? rentalCategoryLabels
                : undefined
        "
        @reset="resetFilters"
      />
    </MobileFloatingPanel>
  </UContainer>
</template>
