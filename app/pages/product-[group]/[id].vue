<script setup lang="ts">
import { useRentalAccesses } from "~/composables/useRentalAccesses";
import type { LocaleCode } from "~/types/locale";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";

const route = useRoute();
const { t, locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

// ── Fetch product by slug from route param ──
const slug = computed(() => route.params.id as string);
const { getProductBySlug, products } = useProducts();
const { getRentalAccessesByProductId, getRentalAccessShowPath } =
  useRentalAccesses();

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
const { isRental } = useProducts();
const { addToCart } = useCart();
const { addBooking, getRemainingAvailability } = useBooking();
const user = useSupabaseUser();
const toast = useToast();
const showBookingForm = ref(false);
const isSubmittingBooking = ref(false);
const loginRedirectPath = computed(() => route.fullPath || "/");

const rentalAccessOptions = computed(() => {
  if (!product.value) return [];
  return getRentalAccessesByProductId(product.value.id).value;
});

const matchedRentalAccessCount = computed(
  () => rentalAccessOptions.value.length,
);

const selectedRentalAvailability = computed(() => {
  if (!selectedSku.value) return 0;
  return getRemainingAvailability(
    selectedSku.value.id,
    selectedSku.value.stock.available,
  );
});

function isAvailabilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("no rental unit") ||
    message.includes("availability") ||
    message.includes("out of stock")
  );
}

function handleBookNow() {
  if (isSubmittingBooking.value || !selectedSku.value) return;

  if (selectedRentalAvailability.value <= 0) {
    toast.add({
      title: t("booking.unavailable"),
      description: t("booking.unavailableDesc"),
      icon: "bx:error-circle",
      color: "warning",
    });
    showBookingForm.value = false;
    return;
  }

  showBookingForm.value = !showBookingForm.value;
}

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

async function handleBookingSubmit(payload: {
  startDate: string;
  numDays: number;
  returnDate: string;
  totalCost: number;
  deposit: number;
}) {
  if (!product.value || !selectedSku.value || isSubmittingBooking.value) return;

  if (!user.value) {
    toast.add({
      title: t("booking.loginRequired"),
      description: t("booking.loginRequiredDesc"),
      icon: "bx:lock-alt",
      color: "warning",
    });
    await navigateTo({
      path: "/user/login",
      query: { redirect: loginRedirectPath.value },
    });
    return;
  }

  if (selectedRentalAvailability.value <= 0) {
    showBookingForm.value = false;
    toast.add({
      title: t("booking.unavailable"),
      description: t("booking.unavailableDesc"),
      icon: "bx:error-circle",
      color: "warning",
    });
    return;
  }

  const currentProduct = product.value;
  const currentSku = selectedSku.value;
  isSubmittingBooking.value = true;

  try {
    await addBooking({
      userId: user.value.id,
      productId: currentProduct.id,
      skuId: currentSku.id,
      matchedProductId: currentProduct.id,
      matchedProductName: currentProduct.name[lang.value],
      productName: currentProduct.name[lang.value],
      thumbnail: selectedGalleryThumbnail.value,
      startDate: payload.startDate,
      numDays: payload.numDays,
      returnDate: payload.returnDate,
      dailyRate: currentSku.rentalPrice.daily,
      totalCost: payload.totalCost,
      deposit: payload.deposit,
    });

    showBookingForm.value = false;

    toast.add({
      title: t("booking.success"),
      description: t("booking.successDesc", {
        product: currentProduct.name[lang.value],
      }),
      icon: "bx:check-circle",
      color: "success",
    });

    await navigateTo("/user/cart");
  } catch (error) {
    console.warn("[Booking] addBooking failed:", error);
    const availabilityError = isAvailabilityError(error);

    toast.add({
      title: availabilityError
        ? t("booking.unavailable")
        : t("booking.confirmError"),
      description: availabilityError
        ? t("booking.unavailableDesc")
        : t("booking.confirmErrorDesc"),
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    isSubmittingBooking.value = false;
  }
}

// ── Tabs ──
const tabs = computed(() => [
  { label: t("productDetail.description"), value: "description" },
  { label: t("productDetail.specifications"), value: "spec" },
  { label: t("productDetail.documents"), value: "doc" },
]);
const activeTab = ref("description");

// ── Breadcrumb ──
const breadcrumbItems = computed(() => {
  if (!product.value) return [];
  const group = route.params.group as string;
  return [
    { label: t("productDetail.home"), to: "/" },
    { label: t("productDetail.allProducts"), to: `/product-${group}` },
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

watch(
  rentalAccessOptions,
  (accesses) => {
    if (accesses.length > 0) {
      showBookingForm.value = false;
    }
  },
  { immediate: true },
);
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
            :rental-available="selectedRentalAvailability"
            :matched-rental-access-count="matchedRentalAccessCount"
            :show-rental-action="rentalAccessOptions.length === 0"
            v-model:selected-sku-index="selectedSkuIndex"
            @add-to-cart="handleAddToCart"
            @book-now="handleBookNow"
          />
        </div>
      </div>

      <div v-if="rentalAccessOptions.length" class="mt-8 space-y-4">
        <div>
          <h3 class="text-lg font-semibold">
            {{ t("productDetail.rentalOptions") }}
          </h3>
          <p class="text-sm text-gray-500">
            {{ t("productDetail.rentalOptionsDesc") }}
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LazyProductsRentalAccessCard
            v-for="access in rentalAccessOptions"
            :key="access.id"
            :access="access"
            :browse-to="getRentalAccessShowPath(access)"
          />
        </div>
      </div>

      <!-- ── Rental Booking Form (below gallery + info) ── -->
      <div
        v-if="
          showBookingForm &&
          selectedSku &&
          rentalAccessOptions.length === 0 &&
          isRental(product)
        "
        class="mt-6"
      >
        <ProductsRentalBookingForm
          :product="product"
          :selected-sku="selectedSku"
          :loading="isSubmittingBooking"
          @submit="handleBookingSubmit"
          @cancel="showBookingForm = false"
        />
      </div>

      <!-- ── Bottom Section: Tabs ── -->
      <div class="mt-10">
        <UTabs
          v-model="activeTab"
          :items="tabs"
          value-key="value"
          class="w-full"
          :content="false"
        />

        <!-- Description Tab -->
        <div v-if="activeTab === 'description'" class="prose max-w-none py-6">
          <p>{{ product.description[lang] }}</p>
        </div>

        <!-- Spec Tab -->
        <div v-else-if="activeTab === 'spec'" class="py-6">
          <ProductsProductSpecTable :spec="product.spec" />
        </div>

        <!-- Doc Tab -->
        <div v-else-if="activeTab === 'doc'" class="space-y-3 py-6">
          <ProductsProductDocLinks :doc="product.doc" />
        </div>
      </div>

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
