<script setup lang="ts">
import type { LocaleCode } from "~/types/locale";
import type { RentalAccessMatchedProduct } from "~/types/rental-access";
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

const { rentalAccesses } = useRentalAccesses();
const { products, getDefaultSKU } = useProducts();
const { confirmBooking } = useBooking();

const access = computed(() =>
  rentalAccesses.value.find((item) => item.slug === slug.value),
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

const canBookAccess = computed(
  () => !!access.value && !!primaryMatchedProduct.value && !!bookingSku.value,
);

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

function getProductPath(product: RentalAccessMatchedProduct): string {
  return `/product-${product.categoryKey}/${product.slug}`;
}

function buildRentalAccessSnapshot() {
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
}) {
  if (
    !access.value ||
    !primaryMatchedProduct.value ||
    !bookingSku.value ||
    isSubmittingBooking.value
  ) {
    return;
  }

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

  isSubmittingBooking.value = true;

  try {
    await confirmBooking({
      userId: user.value.id,
      productId: primaryMatchedProduct.value.id,
      skuId: bookingSku.value.id,
      rentalAccessId: access.value.id,
      rentalAccessCode: access.value.code,
      rentalAccessSlug: access.value.slug,
      rentalAccessName: access.value.name[lang.value],
      rentalAccessThumbnail: access.value.thumbnail,
      rentalAccessSnapshot: buildRentalAccessSnapshot(),
      matchedProductId: primaryMatchedProduct.value.id,
      matchedProductName: primaryMatchedProduct.value.name[lang.value],
      productName: access.value.name[lang.value],
      thumbnail: access.value.thumbnail,
      startDate: payload.startDate,
      numDays: payload.numDays,
      returnDate: payload.returnDate,
      dailyRate: access.value.pricing.daily,
      totalCost: payload.totalCost,
      deposit: payload.deposit,
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
    console.warn("[RentalAccess] confirmBooking failed:", error);
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
</script>

<template>
  <UContainer class="py-6">
    <HopFeatureBar class="mb-8" />

    <div v-if="!access" class="py-20 text-center">
      <UIcon name="bx:error-circle" class="mb-4 size-16 text-gray-400" />
      <p class="text-lg text-gray-500">{{ t("rentalAccess.notFound") }}</p>
      <p class="mt-2 text-sm text-gray-400">
        {{ t("rentalAccess.notFoundDesc") }}
      </p>
      <UButton
        class="mt-6"
        color="neutral"
        variant="outline"
        icon="bx:left-arrow-alt"
        :label="t('rentalAccess.backToRentals')"
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
            <div>
              <span class="text-gray-500">{{ t("productDetail.perDay") }}</span>
              <p class="font-semibold">
                {{ formatMoney(access.pricing.daily) }}
              </p>
            </div>
            <div>
              <span class="text-gray-500">{{
                t("productDetail.perWeek")
              }}</span>
              <p class="font-semibold">
                {{ formatMoney(access.pricing.weekly) }}
              </p>
            </div>
            <div>
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
              :label="t('rentalAccess.backToRentals')"
            />
          </div>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              {{ t("rentalAccess.rentalRules") }}
            </h2>
          </template>

          <div class="grid grid-cols-3 gap-3 text-sm">
            <div>
              <span class="text-gray-500">{{ t("rentalAccess.minDays") }}</span>
              <p class="font-semibold">{{ access.rentalRules.minDays }}</p>
            </div>
            <div>
              <span class="text-gray-500">{{ t("rentalAccess.maxDays") }}</span>
              <p class="font-semibold">
                {{
                  access.rentalRules.maxDays > 0
                    ? access.rentalRules.maxDays
                    : "—"
                }}
              </p>
            </div>
            <div>
              <span class="text-gray-500">{{
                t("rentalAccess.bufferDays")
              }}</span>
              <p class="font-semibold">{{ access.rentalRules.bufferDays }}</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              {{ t("rentalAccess.compatibleProducts") }}
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
        </UCard>
      </div>

      <div
        v-if="showBookingForm && access && primaryMatchedProduct && bookingSku"
        ref="bookingFormRef"
        class="mt-6"
      >
        <ProductsRentalBookingForm
          :product="primaryMatchedProduct"
          :selected-sku="bookingSku"
          :rental-access="access"
          :loading="isSubmittingBooking"
          @submit="handleBookingSubmit"
          @cancel="showBookingForm = false"
        />
      </div>

      <UCard class="mt-6">
        <template #header>
          <h2 class="text-lg font-semibold">
            {{ t("rentalAccess.specSummary") }}
          </h2>
        </template>

        <ProductsProductSpecTable :spec="specSummary" />
      </UCard>
    </template>
  </UContainer>
</template>
