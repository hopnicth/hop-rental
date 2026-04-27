<script setup lang="ts">
import { useProducts } from "~/composables/useProducts";
import { useAssets } from "~/composables/useAssets";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import MobileFloatingPanel from "~/components/mobile/MobileFloatingPanel.vue";
import SearchFilters from "~/components/search/SearchFilters.vue";
import type { CatalogType } from "~/composables/useProductSearch";
import type { Product } from "~/types/product";
import type { Asset } from "~/types/asset";

const route = useRoute();
const { t } = useI18n();
const { products, getDisplayPrice, getTotalStock } = useProducts();
const { assets, getAssetShowPath } = useAssets();

type ListingType = CatalogType | "all";
type SortDir = "high" | "low";
type ListingMode = "products" | "assets";

const RESERVED_GROUPS = new Set(["all", "sale", "rental"]);
const group = computed(() => String(route.params.group ?? "all"));
const listingMode = computed<ListingMode>(() =>
  group.value === "rental" ? "assets" : "products",
);
const defaultCategory = computed(() =>
  RESERVED_GROUPS.has(group.value) ? "all" : group.value,
);
const defaultType = computed<ListingType>(() => {
  if (group.value === "sale") return "sale";
  if (group.value === "rental") return "rental";
  return "all";
});

const selectedCategory = ref<string>(defaultCategory.value);
const selectedType = ref<ListingType>(defaultType.value);
const selectedBrands = ref<string[]>([]);
const minPrice = ref<number | null>(null);
const maxPrice = ref<number | null>(null);
const inStockOnly = ref(false);

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
}

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

const filteredProducts = computed<Product[]>(() => {
  const effectiveMax =
    maxPrice.value !== null && maxPrice.value > 0 ? maxPrice.value : null;

  return products.value.filter((product) => {
    if (
      selectedCategory.value !== "all" &&
      !product.categories.includes(selectedCategory.value)
    ) {
      return false;
    }
    if (selectedType.value === "sale" && !product.isForSale) return false;
    if (
      selectedType.value === "rental" &&
      !compatibleProductIds.value.has(product.id)
    ) {
      return false;
    }
    if (selectedBrands.value.length > 0) {
      if (!product.brand || !selectedBrands.value.includes(product.brand)) {
        return false;
      }
    }

    const price = getDisplayPrice(product).final;
    if (minPrice.value !== null && price < minPrice.value) return false;
    if (effectiveMax !== null && price > effectiveMax) return false;

    if (inStockOnly.value) {
      const stock = getTotalStock(product);
      if (selectedType.value === "rental") {
        if (stock.available <= 0 && stock.inStock <= 0) return false;
      } else if (stock.inStock <= 0) {
        return false;
      }
    }

    return true;
  });
});

const sortedProducts = computed(() => {
  const list = [...filteredProducts.value];
  return sortDir.value === "high"
    ? list.sort((a, b) => getDisplayPrice(b).final - getDisplayPrice(a).final)
    : list.sort((a, b) => getDisplayPrice(a).final - getDisplayPrice(b).final);
});

// ── Asset listing pipeline (used when listingMode === "assets") ──
const filteredAssets = computed<Asset[]>(() => {
  const effectiveMax =
    maxPrice.value !== null && maxPrice.value > 0 ? maxPrice.value : null;

  return assets.value.filter((access) => {
    if (
      selectedCategory.value !== "all" &&
      !access.categories.includes(selectedCategory.value)
    ) {
      return false;
    }
    if (selectedBrands.value.length > 0) {
      if (!access.brand || !selectedBrands.value.includes(access.brand)) {
        return false;
      }
    }
    const price = access.pricing.daily;
    if (minPrice.value !== null && price < minPrice.value) return false;
    if (effectiveMax !== null && price > effectiveMax) return false;
    return true;
  });
});

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
    inStockOnly.value
  );
});

watch(itemsPerPage, () => {
  currentPage.value = 1;
});

watch(
  group,
  () => {
    currentPage.value = 1;
    resetFilters();
  },
  { immediate: true },
);

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
          <div
            v-if="listingMode === 'assets'"
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
          <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <LazyProductsProductCard
              v-for="product in recommendedProducts"
              :key="`rec-product-${product.id}`"
              :product-id="product.id"
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
