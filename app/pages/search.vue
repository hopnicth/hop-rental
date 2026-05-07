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
import type { Asset } from "~/types/asset";
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
import type { Product } from "~/types/product";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { search } = useProductSearch();
const { products, getDisplayPrice, getTotalStock } = useProducts();
const { assets, getAssetShowPath, loading: assetsLoading } = useAssets();
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

function readCategoryQuery(value: unknown): string {
  const raw = readQueryString(value);
  return raw && mainCategoryKeySet.has(raw) ? raw : "all";
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
  if (mainCategoryKeySet.has(selected)) return selected;
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

function assetMatchesSearchText(asset: Asset): boolean {
  const query = q.value.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    asset.code,
    asset.name.th,
    asset.name.en,
    asset.name.cn,
    asset.name.jp,
    asset.description.th,
    asset.description.en,
    asset.description.cn,
    asset.description.jp,
    asset.brand,
    ...asset.categories,
    ...asset.tagKeys,
    ...asset.filterKeys,
    ...Object.values(asset.specSummary ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes(query) ||
    haystack.replaceAll(" ", "").includes(query.replaceAll(" ", ""))
  );
}

const rentalResults = computed(() =>
  assets.value.filter((asset) => assetMatchesSearchText(asset)),
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

  q.value.trim() ? (next.q = q.value.trim()) : delete next.q;
  activeScope.value !== "all"
    ? (next.scope = activeScope.value)
    : delete next.scope;
  selectedCategory.value !== "all"
    ? (next.category = selectedCategory.value)
    : delete next.category;
  selectedType.value !== "all"
    ? (next.type = selectedType.value)
    : delete next.type;
  selectedBrands.value.length > 0
    ? (next.brands = [...selectedBrands.value])
    : delete next.brands;
  minPrice.value !== null
    ? (next.min = String(minPrice.value))
    : delete next.min;
  maxPrice.value !== null && maxPrice.value > 0
    ? (next.max = String(maxPrice.value))
    : delete next.max;
  inStockOnly.value ? (next.stock = "1") : delete next.stock;

  const dynamic = writeDynamicFilters(selectedDynamicFilters.value);
  dynamic ? (next.df = dynamic) : delete next.df;

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
      <UInput
        v-model="q"
        :placeholder="t('search.placeholder')"
        icon="bx:search"
        size="lg"
        variant="outline"
        class="w-full"
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
        @reset="resetFilters"
      />
    </MobileFloatingPanel>
  </UContainer>
</template>
