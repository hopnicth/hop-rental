<script setup lang="ts">
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import SearchAndFilter from "~/components/products/SearchAndFilter.vue";

const { t } = useI18n();
const { products, getDisplayPrice } = useProducts();

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

// ── Sorted products ──
const sorted = computed(() => {
  const list = [...products.value];
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

// Reset to page 1 when items-per-page changes
watch(itemsPerPage, () => {
  currentPage.value = 1;
});

// ── Recommended (static mockup) ──
const recommended = computed(() => products.value.slice(0, 3));
</script>

<template>
  <UContainer class="py-6">
    <div class="grid grid-cols-12 gap-4 lg:gap-6">
      <!-- ── Left: Search & Filter (4 cols on lg+) ── -->
      <div class="col-span-12 lg:col-span-4">
        <SearchAndFilter />
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
  </UContainer>
</template>
