<script setup lang="ts">
import type { LocaleCode } from "~/types/locale";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";

const route = useRoute();
const { t, locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

// ── Fetch product by slug from route param ──
const slug = computed(() => route.params.id as string);
const { getProductBySlug, products } = useProducts();

const product = getProductBySlug(slug.value);

// ── Selected SKU (default = first) ──
const selectedSkuIndex = ref(0);
const selectedSku = computed(() => product.value?.skus[selectedSkuIndex.value]);

// ── Cart & Booking ──
const { isRental } = useProducts();
const { addToCart } = useCart();
const { confirmBooking, getRemainingAvailability } = useBooking();
const user = useSupabaseUser();
const toast = useToast();
const showBookingForm = ref(false);
const isSubmittingBooking = ref(false);

const selectedRentalAvailability = computed(() => {
  if (!selectedSku.value) return 0;
  return getRemainingAvailability(
    selectedSku.value.id,
    selectedSku.value.stock.available,
  );
});

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
    await navigateTo("/user/login");
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
    const booking = await confirmBooking({
      productId: currentProduct.id,
      skuId: currentSku.id,
      productName: currentProduct.name[lang.value],
      thumbnail: currentProduct.thumbnail,
      startDate: payload.startDate,
      numDays: payload.numDays,
      returnDate: payload.returnDate,
      dailyRate: currentSku.rentalPrice.daily,
      totalCost: payload.totalCost,
      deposit: payload.deposit,
    });

    console.log("[Booking] confirmed:", booking.bookingId);
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
            :images="product.images"
            :thumbnail="product.thumbnail"
            :alt-text="product.name[lang]"
          />
        </div>

        <!-- Right: Product Info -->
        <div class="col-span-12 lg:col-span-7">
          <ProductsProductInfo
            :product="product"
            :rental-available="selectedRentalAvailability"
            v-model:selected-sku-index="selectedSkuIndex"
            @add-to-cart="
              () => {
                if (product && selectedSku) {
                  addToCart(
                    product.id,
                    selectedSku.id,
                    product.name[lang],
                    product.thumbnail,
                    selectedSku.price.final,
                  );
                }
              }
            "
            @book-now="handleBookNow"
          />
        </div>
      </div>

      <!-- ── Rental Booking Form (below gallery + info) ── -->
      <div
        v-if="showBookingForm && selectedSku && isRental(product)"
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
