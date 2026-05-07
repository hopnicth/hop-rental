<script setup lang="ts">
import type { LocaleCode } from "~/types/locale";

const { isLoggedIn } = useAuthSession();
const route = useRoute();
const { locale, t } = useI18n();
const { products } = useProducts();
const { productIds, loading, loadWishlist } = useWishlist();

const lang = computed(() => locale.value as LocaleCode);
const wishlistProducts = computed(() => {
  const ids = new Set(productIds.value);
  return products.value.filter((product) => ids.has(product.id));
});

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`);
  }
});

if (import.meta.client) {
  onMounted(() => {
    void loadWishlist({ force: true });
  });
}

useSeoMeta({ title: () => t("wishlistPage.title") });
</script>

<template>
  <UContainer class="py-8">
    <div
      class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p class="text-sm font-semibold uppercase tracking-wide text-primary">
          {{ t("wishlistPage.eyebrow") }}
        </p>
        <h1 class="text-2xl font-bold text-default">
          {{ t("wishlistPage.title") }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ t("wishlistPage.description") }}
        </p>
      </div>
      <UButton to="/product-all" variant="soft" color="primary" icon="bx:store">
        {{ t("wishlistPage.browseProducts") }}
      </UButton>
    </div>

    <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <ProductsCatalogCardSkeleton v-for="index in 6" :key="index" />
    </div>

    <UCard v-else-if="wishlistProducts.length === 0" class="text-center">
      <div class="mx-auto max-w-md py-10">
        <UIcon name="bx:heart" class="mx-auto mb-3 size-12 text-muted" />
        <h2 class="text-lg font-semibold text-default">
          {{ t("wishlistPage.emptyTitle") }}
        </h2>
        <p class="mt-2 text-sm text-muted">
          {{ t("wishlistPage.emptyDescription") }}
        </p>
        <UButton to="/product-all" class="mt-5" color="primary" icon="bx:store">
          {{ t("wishlistPage.browseProducts") }}
        </UButton>
      </div>
    </UCard>

    <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <ProductsProductCard
        v-for="product in wishlistProducts"
        :key="product.id"
        :product-id="product.id"
      />
    </div>
  </UContainer>
</template>
