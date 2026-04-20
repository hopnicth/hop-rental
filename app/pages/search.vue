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
import MobileFloatingPanel from "~/components/mobile/MobileFloatingPanel.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { search } = useProductSearch();

// ── Query state ──
const q = ref(String(route.query.q ?? ""));
const selectedCategory = ref<string>("all");
const selectedType = ref<CatalogType | "all">("all");
const selectedBrands = ref<string[]>([]);
const minPrice = ref<number | null>(null);
const maxPrice = ref<number | null>(null);
const inStockOnly = ref(false);

// ── Pagination ──
const pageSize = 12;
const page = ref(1);

// ── Results ──
const results = ref<ProductSearchResult[]>([]);
const totalCount = ref(0);
const loading = ref(false);

function scrollToTop() {
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ── Search execution ──
async function runSearch() {
  loading.value = true;
  const res = await search({
    q: q.value.trim() || undefined,
    categories:
      selectedCategory.value !== "all" ? [selectedCategory.value] : undefined,
    type: selectedType.value === "all" ? undefined : selectedType.value,
    brands: selectedBrands.value.length > 0 ? selectedBrands.value : undefined,
    minPrice: minPrice.value ?? undefined,
    // Treat maxPrice === 0 as "no upper bound"
    maxPrice:
      maxPrice.value !== null && maxPrice.value > 0
        ? maxPrice.value
        : undefined,
    inStock: inStockOnly.value,
    limit: pageSize,
    offset: (page.value - 1) * pageSize,
  });
  results.value = res.items;
  totalCount.value = res.totalCount;
  loading.value = false;
}

// Reset to page 1 when the text query changes
watch(q, () => {
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
  ],
  () => {
    page.value = 1;
    scrollToTop();
  },
  { deep: true },
);

// Run search on any state change (including page)
watch(
  [
    q,
    selectedCategory,
    selectedType,
    selectedBrands,
    minPrice,
    maxPrice,
    inStockOnly,
    page,
  ],
  () => {
    void runSearch();
  },
  { deep: true, immediate: true },
);

// Keep the URL in sync with the query string (so the result page is shareable)
watch(q, (value) => {
  const next = { ...route.query };
  if (value.trim()) {
    next.q = value.trim();
  } else {
    delete next.q;
  }
  router.replace({ query: next });
});

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
    inStockOnly.value
  );
});

function resetFilters() {
  selectedCategory.value = "all";
  selectedType.value = "all";
  selectedBrands.value = [];
  minPrice.value = null;
  maxPrice.value = null;
  inStockOnly.value = false;
}
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

    <div class="grid grid-cols-12 gap-4 lg:gap-6">
      <!-- ── Filter sidebar (4 cols on lg+) ── -->
      <aside class="hidden lg:block lg:col-span-3">
        <SearchFilters
          v-model:category="selectedCategory"
          v-model:type="selectedType"
          v-model:brands="selectedBrands"
          v-model:min-price="minPrice"
          v-model:max-price="maxPrice"
          v-model:in-stock="inStockOnly"
          @reset="resetFilters"
        />
      </aside>

      <!-- ── Results (9 cols on lg+) ── -->
      <main class="col-span-12 lg:col-span-9">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm text-muted">
            {{
              loading
                ? t("search.searching")
                : t("search.resultCount", { n: totalCount })
            }}
          </p>
        </div>

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

        <UCard v-else-if="!loading">
          <div class="py-10 text-center">
            <UIcon
              name="bx:search-alt"
              class="mx-auto mb-2 text-3xl text-muted"
            />
            <p class="text-sm text-muted">
              {{ t("search.noResults") }}
            </p>
          </div>
        </UCard>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="mt-6 flex justify-center">
          <UPagination
            v-model:page="page"
            :total="totalCount"
            :items-per-page="pageSize"
          />
        </div>
      </main>
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
        @reset="resetFilters"
      />
    </MobileFloatingPanel>
  </UContainer>
</template>
