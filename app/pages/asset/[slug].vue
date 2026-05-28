<script setup lang="ts">
import type { LocaleCode } from "~/types/locale";
import type { AssetMatchedProduct } from "~/types/asset";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";

const route = useRoute();
const { t, locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);
const slug = computed(() => String(route.params.slug ?? ""));
const toast = useToast();
const user = useSupabaseUser();
const bookingFormRef = ref<HTMLElement | null>(null);
const showBookingForm = ref(false);
const isSubmittingBooking = ref(false);

const { assets } = useAssets();
const { products, getDefaultSKU } = useProducts();
const { addBooking } = useBooking();

const access = computed(() =>
  assets.value.find((item) => item.slug === slug.value),
);

// ── Online booking-block calendar data ──────────────────────────────────────
// Fetch all confirmed/picked_up bookings for this asset so the calendar can
// shade unavailable dates before the customer reaches checkout.
// Failure is non-fatal: checkout prevalidation remains the authoritative guard.
type OnlineBookingBlock = {
  assetId?: string;
  startDate: string;
  returnDate: string;
  status: string;
};
const onlineBookingBlocks = ref<OnlineBookingBlock[]>([]);

// access must be declared before this computed references it.
const assetIdForBlocks = computed(() => access.value?.id ?? "");
watch(
  assetIdForBlocks,
  async (id) => {
    if (!id) {
      onlineBookingBlocks.value = [];
      return;
    }
    try {
      const res = await $fetch<{ items: OnlineBookingBlock[] }>(
        `/api/assets/${id}/booking-blocks`,
      );
      onlineBookingBlocks.value = res.items ?? [];
    } catch (e) {
      console.warn("[Asset] booking-blocks fetch failed:", e);
      onlineBookingBlocks.value = [];
    }
  },
  { immediate: true },
);

const loginRedirectPath = computed(
  () => route.fullPath || `/asset/${slug.value}`,
);

const primaryMatchedProduct = computed(() => {
  const productId = access.value?.matchedProductIds[0];
  if (!productId) return null;
  return products.value.find((item) => item.id === productId) ?? null;
});

const bookingSku = computed(() =>
  primaryMatchedProduct.value
    ? getDefaultSKU(primaryMatchedProduct.value)
    : undefined,
);

const canBookAccess = computed(() => !!access.value);

const specSummary = computed<Record<string, string | undefined>>(() => {
  const raw = access.value?.specSummary ?? {};

  return Object.fromEntries(
    Object.entries(raw)
      .filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      )
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value : String(value),
      ]),
  );
});

function formatMoney(value: number): string {
  return `฿${value.toLocaleString()}`;
}

function getProductPath(product: AssetMatchedProduct): string {
  return `/product-${product.categoryKey}/${product.slug}`;
}

function buildAssetSnapshot() {
  if (!access.value) return undefined;

  return {
    id: access.value.id,
    code: access.value.code,
    slug: access.value.slug,
    name: access.value.name[lang.value],
    thumbnailUrl: access.value.thumbnail,
    brand: access.value.brand,
    categoryKeys: access.value.categories,
    dailyRate: access.value.pricing.daily,
    weeklyRate: access.value.pricing.weekly,
    monthlyRate: access.value.pricing.monthly,
    depositAmount: access.value.pricing.deposit,
    minDays: access.value.rentalRules.minDays,
    maxDays: access.value.rentalRules.maxDays,
    bufferDays: access.value.rentalRules.bufferDays,
  };
}

async function openBookingForm() {
  if (!canBookAccess.value) return;

  showBookingForm.value = true;
  await nextTick();
  bookingFormRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleBookingSubmit(payload: {
  startDate: string;
  numDays: number;
  returnDate: string;
  totalCost: number;
  deposit: number;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  pricingBreakdown: import("~/utils/rental-pricing").RentalPricingBreakdown;
  bookerName: string;
  bookerPhone: string;
}) {
  if (!access.value || isSubmittingBooking.value) {
    return;
  }

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

  isSubmittingBooking.value = true;

  try {
    await addBooking({
      userId: user.value.id,
      productId: primaryMatchedProduct.value?.id,
      skuId: bookingSku.value?.id,
      assetId: access.value.id,
      assetCode: access.value.code,
      assetSlug: access.value.slug,
      assetName: access.value.name[lang.value],
      assetThumbnail: access.value.thumbnail,
      assetSnapshot: buildAssetSnapshot(),
      matchedProductId: primaryMatchedProduct.value?.id,
      matchedProductName: primaryMatchedProduct.value?.name[lang.value],
      productName: access.value.name[lang.value],
      thumbnail: access.value.thumbnail,
      startDate: payload.startDate,
      numDays: payload.numDays,
      returnDate: payload.returnDate,
      dailyRate: payload.dailyRate,
      weeklyRate: payload.weeklyRate,
      monthlyRate: payload.monthlyRate,
      totalCost: payload.totalCost,
      deposit: payload.deposit,
      pricingBreakdown: payload.pricingBreakdown,
      bookerName: payload.bookerName,
      bookerPhone: payload.bookerPhone,
    });

    toast.add({
      title: t("booking.success"),
      description: t("booking.successDesc", {
        product: access.value.name[lang.value],
      }),
      icon: "bx:check-circle",
      color: "success",
    });

    await navigateTo("/user/cart");
  } catch (error) {
    console.warn("[Asset] addBooking failed:", error);
    toast.add({
      title: t("booking.confirmError"),
      description: t("booking.confirmErrorDesc"),
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    isSubmittingBooking.value = false;
  }
}

watch(
  canBookAccess,
  (value) => {
    showBookingForm.value = value;
  },
  { immediate: true },
);

// ── Linked reviews ──
const { fetchReviewsForAsset } = useContentPages();
const assetId = computed(() => access.value?.id ?? "");
const { data: reviews } = await useAsyncData(
  `asset-reviews:${slug.value}`,
  () =>
    assetId.value ? fetchReviewsForAsset(assetId.value) : Promise.resolve([]),
  { default: () => [], watch: [assetId] },
);
</script>

<template>
  <UContainer class="py-6">
    <HopFeatureBar class="mb-8" />

    <div v-if="!access" class="py-20 text-center">
      <UIcon name="bx:error-circle" class="mb-4 size-16 text-gray-400" />
      <p class="text-lg text-gray-500">{{ t("asset.notFound") }}</p>
      <p class="mt-2 text-sm text-gray-400">
        {{ t("asset.notFoundDesc") }}
      </p>
      <UButton
        class="mt-6"
        color="neutral"
        variant="outline"
        icon="bx:left-arrow-alt"
        :label="t('asset.backToRentals')"
        to="/product-rental"
      />
    </div>

    <template v-else>
      <div class="grid grid-cols-12 gap-6 lg:gap-8">
        <div class="col-span-12 lg:col-span-5">
          <ProductsProductGallery
            :images="access.images"
            :thumbnail="access.thumbnail"
            :alt-text="access.name[lang]"
          />
        </div>

        <div class="col-span-12 lg:col-span-7 space-y-5">
          <div class="flex flex-wrap gap-2">
            <UBadge color="neutral" variant="soft">{{ access.code }}</UBadge>
            <UBadge v-if="access.brand" color="secondary" variant="soft">
              {{ access.brand }}
            </UBadge>
            <UBadge
              v-for="category in access.categories.slice(0, 3)"
              :key="category"
              color="primary"
              variant="subtle"
            >
              {{ category }}
            </UBadge>
          </div>

          <div>
            <h1 class="text-3xl font-bold">{{ access.name[lang] }}</h1>
            <p class="mt-3 whitespace-pre-line text-gray-600">
              {{ access.description[lang] }}
            </p>
          </div>

          <div
            class="grid grid-cols-2 gap-3 rounded-lg bg-blue-50 p-4 text-sm dark:bg-blue-950 sm:grid-cols-4"
          >
            <div>
              <span class="text-gray-500">{{
                t("productDetail.deposit")
              }}</span>
              <p class="font-semibold">
                {{ formatMoney(access.pricing.deposit) }}
              </p>
            </div>
            <div v-if="access.pricing.dailyEnabled">
              <span class="text-gray-500">{{ t("productDetail.perDay") }}</span>
              <p class="font-semibold">
                {{ formatMoney(access.pricing.daily) }}
              </p>
            </div>
            <div v-if="access.pricing.weeklyEnabled">
              <span class="text-gray-500">{{
                t("productDetail.perWeek")
              }}</span>
              <p class="font-semibold">
                {{ formatMoney(access.pricing.weekly) }}
              </p>
            </div>
            <div v-if="access.pricing.monthlyEnabled">
              <span class="text-gray-500">{{
                t("productDetail.perMonth")
              }}</span>
              <p class="font-semibold">
                {{ formatMoney(access.pricing.monthly) }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <UButton
              v-if="canBookAccess"
              icon="bx:calendar-check"
              color="secondary"
              size="lg"
              :label="t('productDetail.bookNow')"
              @click="openBookingForm"
            />
            <UButton
              to="/product-rental"
              icon="bx:left-arrow-alt"
              color="neutral"
              variant="outline"
              :label="t('asset.backToRentals')"
            />
          </div>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-1">
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              {{ t("asset.rentalRules") }}
            </h2>
          </template>

          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span class="text-gray-500">{{ t("asset.minDays") }}</span>
              <p class="font-semibold">{{ access.rentalRules.minDays }}</p>
            </div>
            <div>
              <span class="text-gray-500">{{ t("asset.maxDays") }}</span>
              <p class="font-semibold">
                {{
                  access.rentalRules.maxDays > 0
                    ? access.rentalRules.maxDays
                    : "—"
                }}
              </p>
            </div>
            <!-- <div>
              <span class="text-gray-500">{{ t("asset.bufferDays") }}</span>
              <p class="font-semibold">{{ access.rentalRules.bufferDays }}</p>
            </div> -->
          </div>
        </UCard>

        <!-- <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              {{ t("asset.compatibleProducts") }}
            </h2>
          </template>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="product in access.matchedProducts"
              :key="product.id"
              :to="getProductPath(product)"
              color="neutral"
              variant="outline"
              size="sm"
            >
              {{ product.name[lang] }}
            </UButton>
          </div>
        </UCard> -->
      </div>

      <div v-if="showBookingForm && access" ref="bookingFormRef" class="mt-6">
        <ProductsRentalBookingForm
          :selected-sku="bookingSku"
          :asset="access"
          :blocking-bookings="onlineBookingBlocks"
          :loading="isSubmittingBooking"
          @submit="handleBookingSubmit"
          @cancel="showBookingForm = false"
        />
      </div>

      <UCard v-if="access.detailBlocks?.length" class="mt-6">
        <template #header>
          <h2 class="text-lg font-semibold">
            {{ t("asset.detailContents") }}
          </h2>
        </template>

        <LazyProductsAssetDetailBlocks :blocks="access.detailBlocks" />
      </UCard>

      <UCard class="mt-6">
        <template #header>
          <h2 class="text-lg font-semibold">
            {{ t("asset.specSummary") }}
          </h2>
        </template>

        <ProductsProductSpecTable :spec="specSummary" />
      </UCard>

      <section v-if="reviews.length" class="mt-10 space-y-4">
        <h3 class="text-lg font-semibold">
          {{ t("productDetail.reviews") }}
        </h3>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <LazyContentPageCard
            v-for="review in reviews"
            :key="review.id"
            :page="review"
          />
        </div>
      </section>
    </template>
  </UContainer>
</template>
