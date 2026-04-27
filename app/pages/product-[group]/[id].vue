<script setup lang="ts">
import { useAssets } from "~/composables/useAssets";
import type { LocaleCode } from "~/types/locale";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";

const route = useRoute();
const { t, locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

// ── Fetch product by slug from route param ──
const slug = computed(() => route.params.id as string);
const { getProductBySlug, products } = useProducts();
const { getAssetsByProductId, getAssetShowPath } = useAssets();

const product = getProductBySlug(slug.value);

// ── Selected SKU (default = first) ──
const selectedSkuIndex = ref(0);
const selectedSku = computed(() => product.value?.skus[selectedSkuIndex.value]);

const selectedGalleryImages = computed<string[]>(() => {
  if (selectedSku.value?.images?.length) {
    return selectedSku.value.images;
  }

  if (selectedSku.value?.image) {
    return [selectedSku.value.image];
  }

  return product.value?.images ?? [];
});

const selectedGalleryThumbnail = computed<string>(() => {
  if (selectedSku.value?.image) {
    return selectedSku.value.image;
  }

  if (selectedSku.value?.images?.length) {
    return selectedSku.value.images[0] ?? "";
  }

  return product.value?.thumbnail ?? "";
});

// ── Cart & Booking ──
const { addToCart } = useCart();
const toast = useToast();

const assetOptions = computed(() => {
  if (!product.value) return [];
  return getAssetsByProductId(product.value.id).value;
});

const matchedAssetCount = computed(() => assetOptions.value.length);

function handleAddToCart() {
  if (!product.value || !selectedSku.value) return;

  const added = addToCart(
    product.value.id,
    selectedSku.value.id,
    product.value.name[lang.value],
    selectedGalleryThumbnail.value,
    selectedSku.value.price.final,
    1,
    selectedSku.value.price.original,
    selectedSku.value.price.discount,
  );

  if (!added) {
    toast.add({
      title: t("productPage.stockLimitTitle"),
      description: t("productPage.stockLimitDesc"),
      icon: "bx:error-circle",
      color: "warning",
    });
    return;
  }

  toast.add({
    title: t("productPage.addedToCartTitle"),
    description: `${product.value.name[lang.value]} ${t("productPage.addedToCartDesc")}`,
    icon: "i-heroicons-check-circle",
    color: "primary",
    duration: 3000,
  });
}

// ── Section visibility (driven only by products-table data) ──
const hasDescription = computed(
  () => (product.value?.description?.[lang.value] ?? "").trim().length > 0,
);
const hasDetailBlocks = computed(
  () => Object.keys(product.value?.detailBlocks ?? {}).length > 0,
);
const hasSpec = computed(
  () =>
    Object.values(product.value?.spec ?? {}).filter(
      (v) => typeof v === "string" && v.trim().length > 0,
    ).length > 0,
);
const hasDocs = computed(
  () =>
    (product.value?.documents?.length ?? 0) > 0 ||
    (product.value?.mediaLinks?.length ?? 0) > 0,
);

// ── Breadcrumb ──
const breadcrumbItems = computed(() => {
  if (!product.value) return [];
  return [
    { label: t("productDetail.home"), to: "/" },
    { label: t("productDetail.allProducts"), to: "/product-all" },
    { label: product.value.name[lang.value] },
  ];
});

// ── Recommended (same category, exclude current) ──
const recommended = computed(() => {
  if (!product.value) return [];
  const cat = product.value.categories[0];
  if (!cat) return [];
  return products.value
    .filter((p) => p.id !== product.value!.id && p.categories.includes(cat))
    .slice(0, 4);
});
</script>

<template>
  <UContainer class="py-6">
    <HopFeatureBar class="mb-8" />
    <!-- ── Not Found ── -->
    <div v-if="!product" class="py-20 text-center">
      <UIcon name="bx:error-circle" class="mb-4 size-16 text-gray-400" />
      <p class="text-lg text-gray-500">{{ t("productDetail.notFound") }}</p>
      <UButton
        :label="t('productDetail.allProducts')"
        to="/product-all"
        variant="soft"
        class="mt-4"
      />
    </div>

    <template v-else>
      <!-- ── Breadcrumb ── -->
      <UBreadcrumb :items="breadcrumbItems" class="mb-6" />

      <!-- ── Top Section: Gallery (5 cols) + Info (7 cols) ── -->
      <div class="grid grid-cols-12 gap-6">
        <!-- Left: Gallery -->
        <div class="col-span-12 lg:col-span-5">
          <ProductsProductGallery
            :images="selectedGalleryImages"
            :thumbnail="selectedGalleryThumbnail"
            :alt-text="product.name[lang]"
          />
        </div>

        <!-- Right: Product Info -->
        <div class="col-span-12 lg:col-span-7">
          <ProductsProductInfo
            :product="product"
            :matched-asset-count="matchedAssetCount"
            v-model:selected-sku-index="selectedSkuIndex"
            @add-to-cart="handleAddToCart"
          />
        </div>
      </div>

      <!-- ── Rental availability (matched assets) — placed before detail/spec ── -->
      <section v-if="assetOptions.length" class="mt-8 space-y-4">
        <div>
          <h3 class="text-lg font-semibold">
            {{ t("productDetail.rentalAvailableTitle") }}
          </h3>
          <p class="text-sm text-gray-500">
            {{ t("productDetail.rentalAvailableDesc") }}
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LazyProductsAssetCard
            v-for="access in assetOptions"
            :key="access.id"
            :access="access"
            :browse-to="getAssetShowPath(access)"
            hide-matches
          />
        </div>
      </section>

      <!-- ── Description ── -->
      <section v-if="hasDescription" class="mt-10">
        <h3 class="mb-3 text-lg font-semibold">
          {{ t("productDetail.description") }}
        </h3>
        <p class="whitespace-pre-line text-sm leading-relaxed text-default">
          {{ product.description[lang] }}
        </p>
      </section>

      <!-- ── Detail blocks (jsonb-driven sub-sections) ── -->
      <section v-if="hasDetailBlocks" class="mt-10">
        <LazyProductsProductDetailBlocks :blocks="product.detailBlocks" />
      </section>

      <!-- ── Specifications ── -->
      <section v-if="hasSpec" class="mt-10">
        <h3 class="mb-3 text-lg font-semibold">
          {{ t("productDetail.specifications") }}
        </h3>
        <LazyProductsProductSpecTable :spec="product.spec" />
      </section>

      <!-- ── Documents & media links ── -->
      <section v-if="hasDocs" class="mt-10 space-y-3">
        <h3 class="mb-3 text-lg font-semibold">
          {{ t("productDetail.documents") }}
        </h3>
        <LazyProductsProductDocLinks
          :documents="product.documents"
          :media-links="product.mediaLinks"
        />
      </section>

      <!-- ── Recommended Products ── -->
      <div v-if="recommended.length" class="mt-10">
        <h3 class="mb-4 text-lg font-semibold">
          {{ t("productDetail.recommended") }}
        </h3>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <LazyProductsProductCard
            v-for="p in recommended"
            :key="p.id"
            :product-id="p.id"
          />
        </div>
      </div>
    </template>
  </UContainer>
</template>
