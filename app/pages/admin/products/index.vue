<script setup lang="ts">
import { getAdminApiErrorMessage, type AdminApiMeta } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type AdminProductListItem = {
  id: string;
  slug: string;
  type: "sale" | "rental" | "hybrid";
  nameTh: string;
  nameEn: string;
  mainCategoryKey: string;
  tagKeys: string[];
  categoryKeys: string[];
  brand: string;
  thumbnailUrl: string;
  searchKeywords: string[];
  isHidden: boolean;
  updatedAt?: string;
  skuCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  maxOriginalPrice: number | null;
  currencyCode: string;
  viewCount: number;
  orderCount: number;
  rentalCount: number;
  wishlistCount: number;
  trendingScore: number;
};

type MainCategoryItem = {
  key: string;
  labelTh: string;
  labelEn: string;
  isActive: boolean;
};

const { profile } = useUserProfile();
const toast = useToast();

const searchQuery = ref("");
const selectedCategory = ref("all");
const visibilityFilter = ref("all");
const visibilitySavingId = ref<string | null>(null);

const visibilityOptions = [
  { label: "All visibility", value: "all" },
  { label: "Visible only", value: "visible" },
  { label: "Hidden only", value: "hidden" },
];

const { data, pending, error, refresh } = await useFetch<{
  items: AdminProductListItem[];
  meta?: AdminApiMeta;
}>("/api/admin/products", {
  key: "admin-products",
  default: () => ({ items: [] }),
});

const {
  data: categoriesData,
  pending: categoriesPending,
  refresh: refreshCategories,
} = await useFetch<{
  items: MainCategoryItem[];
  options: Array<{ value: string; label: string }>;
}>("/api/admin/main-categories", {
  key: "admin-main-categories-options",
  default: () => ({ items: [], options: [] }),
});

const items = computed(() => data.value?.items ?? []);
const adminWarning = computed(() => data.value?.meta?.warning ?? null);
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown admin products error"),
);
const isSuperAdmin = computed(
  () => profile.value?.platformRole === "super_admin",
);

const categoryLabelMap = computed(() => {
  return Object.fromEntries(
    (categoriesData.value?.items ?? []).map((item) => [item.key, item.labelTh]),
  );
});

const categoryOptions = computed(() => [
  { label: "All main categories", value: "all" },
  ...((categoriesData.value?.options ?? []) as Array<{
    label: string;
    value: string;
  }>),
]);

const filteredItems = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase();

  return items.value.filter((item) => {
    const matchesSearch =
      keyword.length === 0 ||
      [
        item.id,
        item.slug,
        item.nameTh,
        item.nameEn,
        item.brand,
        item.mainCategoryKey,
        ...item.tagKeys,
        ...item.searchKeywords,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    const matchesCategory =
      selectedCategory.value === "all" ||
      item.mainCategoryKey === selectedCategory.value;

    const matchesVisibility =
      visibilityFilter.value === "all" ||
      (visibilityFilter.value === "hidden" && item.isHidden) ||
      (visibilityFilter.value === "visible" && !item.isHidden);

    return matchesSearch && matchesCategory && matchesVisibility;
  });
});

function categoryLabel(key: string) {
  return categoryLabelMap.value[key] ?? key;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: currencyCode || "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPriceRange(item: AdminProductListItem) {
  if (item.minPrice == null || item.maxPrice == null) return "—";
  if (item.minPrice === item.maxPrice) {
    return formatCurrency(item.minPrice, item.currencyCode);
  }
  return `${formatCurrency(item.minPrice, item.currencyCode)} – ${formatCurrency(
    item.maxPrice,
    item.currencyCode,
  )}`;
}

async function refreshAll() {
  await Promise.all([refresh(), refreshCategories()]);
}

async function toggleProductVisibility(
  item: AdminProductListItem,
  visible: boolean,
) {
  if (!isSuperAdmin.value) return;
  const nextHidden = !visible;
  if (item.isHidden === nextHidden) return;

  visibilitySavingId.value = item.id;
  try {
    await $fetch(`/api/admin/products/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      body: { isHidden: nextHidden },
    });
    item.isHidden = nextHidden;
    toast.add({
      title: nextHidden ? "Product hidden" : "Product shown",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Visibility update failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    visibilitySavingId.value = null;
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <h2 class="text-lg font-semibold">Products</h2>
            <p class="text-sm text-muted">
              List view for product shells before drilling into SKU attributes,
              JSONB spec, tags, and albums.
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton to="/admin/products/new" color="primary" icon="bx:plus">
              New product
            </UButton>
            <UButton
              v-if="isSuperAdmin"
              to="/admin/main-categories"
              variant="soft"
              color="neutral"
              icon="bx:category-alt"
            >
              Manage categories
            </UButton>
            <UButton
              color="primary"
              variant="soft"
              icon="bx:refresh"
              :loading="pending || categoriesPending"
              @click="refreshAll"
            >
              Refresh
            </UButton>
          </div>
        </div>
      </template>

      <UAlert
        v-if="adminWarning"
        class="mb-4"
        color="warning"
        variant="soft"
        :title="adminWarning.title"
        :description="adminWarning.message"
      />

      <UAlert
        v-if="error"
        class="mb-4"
        color="error"
        variant="soft"
        title="Failed to load products"
        :description="loadErrorMessage"
      />

      <div class="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_240px_200px]">
        <UFormField label="Search">
          <UInput
            v-model="searchQuery"
            icon="bx:search"
            placeholder="Search by name, slug, brand, tags, keywords"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Main category">
          <USelectMenu
            v-model="selectedCategory"
            :items="categoryOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Visibility">
          <USelectMenu
            v-model="visibilityFilter"
            :items="visibilityOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold">Product list</h3>
            <p class="text-sm text-muted">
              {{ filteredItems.length }} of {{ items.length }} products
            </p>
          </div>
        </div>
      </template>

      <div v-if="pending" class="py-8 text-sm text-muted">
        Loading products...
      </div>

      <div
        v-else-if="filteredItems.length === 0"
        class="py-8 text-sm text-muted"
      >
        No products matched the current filters.
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="rounded-2xl border border-default p-4"
        >
          <div
            class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
          >
            <div class="flex gap-4">
              <img
                v-if="item.thumbnailUrl"
                :src="item.thumbnailUrl"
                alt=""
                class="hidden size-24 rounded-xl object-cover sm:block"
              />

              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-medium">{{ item.nameTh }}</h4>
                  <UBadge color="primary" variant="soft">{{
                    item.type
                  }}</UBadge>
                  <UBadge color="neutral" variant="soft">
                    {{ categoryLabel(item.mainCategoryKey) }}
                  </UBadge>
                  <UBadge v-if="item.isHidden" color="warning" variant="soft">
                    hidden
                  </UBadge>
                </div>

                <p class="text-sm text-muted">
                  {{ item.id }} · {{ item.slug }}
                  <span v-if="item.brand">· {{ item.brand }}</span>
                </p>

                <div
                  v-if="item.tagKeys.length > 0"
                  class="flex flex-wrap gap-2"
                >
                  <UBadge
                    v-for="tag in item.tagKeys"
                    :key="tag"
                    color="neutral"
                    variant="subtle"
                  >
                    {{ tag }}
                  </UBadge>
                </div>

                <p
                  v-if="item.searchKeywords.length > 0"
                  class="text-xs text-muted"
                >
                  Search keywords: {{ item.searchKeywords.join(", ") }}
                </p>
              </div>
            </div>

            <div class="flex flex-col gap-3 xl:items-end">
              <div class="xl:text-right">
                <p class="text-xs text-muted">Price</p>
                <p class="text-lg font-semibold text-primary">
                  {{ formatPriceRange(item) }}
                </p>
                <p
                  v-if="
                    item.maxOriginalPrice != null &&
                    item.maxPrice != null &&
                    item.maxOriginalPrice > item.maxPrice
                  "
                  class="text-xs text-muted line-through"
                >
                  {{ formatCurrency(item.maxOriginalPrice, item.currencyCode) }}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <p class="text-muted">SKU rows</p>
                  <p class="font-medium">{{ item.skuCount }}</p>
                </div>
                <div>
                  <p class="text-muted">Views</p>
                  <p class="font-medium">{{ formatNumber(item.viewCount) }}</p>
                </div>
                <div>
                  <p class="text-muted">Orders</p>
                  <p class="font-medium">{{ formatNumber(item.orderCount) }}</p>
                </div>
                <div>
                  <p class="text-muted">Wishlist</p>
                  <p class="font-medium">
                    {{ formatNumber(item.wishlistCount) }}
                  </p>
                </div>
              </div>

              <UButton
                color="primary"
                variant="soft"
                size="sm"
                icon="bx:right-arrow-alt"
                :to="`/admin/products/${item.id}`"
              >
                Open detail
              </UButton>
              <div
                v-if="isSuperAdmin"
                class="flex items-center justify-end gap-2 text-xs text-muted"
              >
                <span>{{ item.isHidden ? "Hidden" : "Shown" }}</span>
                <USwitch
                  :model-value="!item.isHidden"
                  :disabled="visibilitySavingId === item.id"
                  @update:model-value="
                    (visible: boolean) =>
                      void toggleProductVisibility(item, visible)
                  "
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
