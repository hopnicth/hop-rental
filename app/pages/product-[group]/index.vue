<script setup lang="ts">
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import MobileFloatingPanel from "~/components/mobile/MobileFloatingPanel.vue";
import SearchFilters from "~/components/search/SearchFilters.vue";
import type { CatalogType } from "~/composables/useProductSearch";

const { t } = useI18n();
const { products, getDisplayPrice, getTotalStock } = useProducts();

// ── Filter state (bound to SearchFilters) ──
const selectedCategory = ref<string>("all");
const selectedType = ref<CatalogType | "all">("all");
const selectedBrands = ref<string[]>([]);
const minPrice = ref<number | null>(null);
const maxPrice = ref<number | null>(null);
const inStockOnly = ref(false);

function scrollToTop() {
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function resetFilters() {
  selectedCategory.value = "all";
  selectedType.value = "all";
  selectedBrands.value = [];
  minPrice.value = null;
  maxPrice.value = null;
  inStockOnly.value = false;
}

// ── Sort ──
type SortDir = "high" | "low";
const sortDir = ref<SortDir>("high");

function toggleSort() {
  sortDir.value = sortDir.value === "high" ? "low" : "high";
}

const sortLabel = computed(() =>
  sortDir.value === "high"
    ? t("productPage.priceHighToLow")
    : t("productPage.priceLowToHigh"),
);

// ── Pagination ──
const itemsOptions = [9, 15, 21] as const;
const itemsPerPage = ref<(typeof itemsOptions)[number]>(9);
const currentPage = ref(1);

// ── Filtered + sorted products (client-side) ──
const filtered = computed(() => {
  // Treat maxPrice === 0 as "no upper bound"
  const effectiveMax =
    maxPrice.value !== null && maxPrice.value > 0 ? maxPrice.value : null;

  return products.value.filter((p) => {
    if (
      selectedCategory.value !== "all" &&
      !p.categories.includes(selectedCategory.value)
    ) {
      return false;
    }
    if (selectedType.value === "sale" && !p.isForSale) return false;
    if (selectedType.value === "rental" && !p.rentalConfig.isRental) {
      return false;
    }
    if (selectedBrands.value.length > 0) {
      if (!p.brand || !selectedBrands.value.includes(p.brand)) return false;
    }
    const price = getDisplayPrice(p).final;
    if (minPrice.value !== null && price < minPrice.value) return false;
    if (effectiveMax !== null && price > effectiveMax) return false;
    if (inStockOnly.value) {
      const stock = getTotalStock(p);
      if (stock.available <= 0 && stock.inStock <= 0) return false;
    }
    return true;
  });
});

const sorted = computed(() => {
  const list = [...filtered.value];
  return sortDir.value === "high"
    ? list.sort((a, b) => getDisplayPrice(b).final - getDisplayPrice(a).final)
    : list.sort((a, b) => getDisplayPrice(a).final - getDisplayPrice(b).final);
});

// ── Paginated slice ──
const totalItems = computed(() => sorted.value.length);

const paginatedProducts = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return sorted.value.slice(start, start + itemsPerPage.value);
});

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

watch(itemsPerPage, () => {
  currentPage.value = 1;
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
    currentPage.value = 1;
    scrollToTop();
  },
  { deep: true },
);

// ── Recommended (static mockup) ──
const recommended = computed(() => products.value.slice(0, 3));
</script>

<template>
  <UContainer class="py-6">
    <div class="grid grid-cols-12 gap-4 lg:gap-6">
      <!-- ── Left: Search & Filter (4 cols on lg+) ── -->
      <div class="hidden lg:block lg:col-span-4">
        <SearchFilters
          v-model:category="selectedCategory"
          v-model:type="selectedType"
          v-model:brands="selectedBrands"
          v-model:min-price="minPrice"
          v-model:max-price="maxPrice"
          v-model:in-stock="inStockOnly"
          @reset="resetFilters"
        />
      </div>

      <!-- ── Right: Content (8 cols on lg+) ── -->
      <div class="col-span-12 lg:col-span-8">
        <!-- ── Header: Sort ── -->
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

        <!-- ── Body: Product Grid ── -->
        <div
          v-if="paginatedProducts.length"
          class="grid grid-cols-2 gap-4 sm:grid-cols-3"
        >
          <LazyProductsProductCard
            v-for="p in paginatedProducts"
            :key="p.id"
            :product-id="p.id"
          />
        </div>
        <div v-else class="py-20 text-center text-gray-400">
          {{ t("productPage.noProducts") }}
        </div>

        <!-- ── Footer Section 1: Pagination ── -->
        <div
          class="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between"
        >
          <!-- Page numbers -->
          <UPagination
            v-model:page="currentPage"
            :items-per-page="itemsPerPage"
            :total="totalItems"
            :sibling-count="1"
            show-edges
            size="sm"
          />

          <!-- Rows per page selector -->
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

        <!-- ── Footer Section 2: Recommended ── -->
        <div class="mt-10">
          <h3 class="mb-4 text-base font-semibold">
            {{ t("productPage.recommended") }}
          </h3>
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <LazyProductsProductCard
              v-for="p in recommended"
              :key="'rec-' + p.id"
              :product-id="p.id"
            />
          </div>
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
        @reset="resetFilters"
      />
    </MobileFloatingPanel>
  </UContainer>
</template>
