<script setup lang="ts">
import type { LocaleCode } from "~/types/locale";

const toast = useToast();

const props = defineProps<{
  /** Product ID — used to fetch product data from composable */
  productId: string;
}>();

const { locale, t } = useI18n();
const { getProductById, getDefaultSKU, getTotalStock, isRental } =
  useProducts();
const { addToCart } = useCart();
const { getRemainingAvailability } = useBooking();

const product = getProductById(props.productId);

/** Current locale cast to LocaleCode for accessing LocalizedString */
const lang = computed(() => locale.value as LocaleCode);

/** Default SKU — used for price & rental display */
const sku = computed(() =>
  product.value ? getDefaultSKU(product.value) : null,
);

/** Aggregated stock across all SKUs */
const stock = computed(() =>
  product.value
    ? getTotalStock(product.value)
    : { inStock: 0, available: 0, reserved: 0 },
);

const rentalProduct = computed(() =>
  product.value ? isRental(product.value) : false,
);

const remainingRentalAvailability = computed(() =>
  product.value
    ? product.value.skus.reduce(
        (total, itemSku) =>
          total + getRemainingAvailability(itemSku.id, itemSku.stock.available),
        0,
      )
    : 0,
);

const hasMultipleSkus = computed(() => (product.value?.skus.length ?? 0) > 1);

/**
 * Listing cards should only quick-add when the user does not need to make
 * any further decision first.
 */
const canQuickAddToCart = computed(
  () =>
    !!product.value &&
    !!sku.value &&
    product.value.isForSale &&
    !rentalProduct.value &&
    !hasMultipleSkus.value &&
    stock.value.inStock > 0,
);

const canShowSaleAction = computed(
  () => !!product.value && product.value.isForSale && stock.value.inStock > 0,
);

const saleActionRequiresDetail = computed(
  () => canShowSaleAction.value && !canQuickAddToCart.value,
);

const saleActionTooltipLabel = computed(() =>
  canQuickAddToCart.value
    ? t("productCard.addToCart")
    : t("productCard.chooseOptions"),
);

const rentalActionTooltipLabel = computed(() =>
  t("productCard.chooseRentalOptions"),
);

/**
 * Multi-SKU and rental-capable products should go through the detail page
 * before the user takes an action.
 */
const requiresDetailAction = computed(
  () => !!product.value && rentalProduct.value,
);

/** Product detail URL — opens in new tab */
const productUrl = computed(() =>
  product.value
    ? `/product-${product.value.categories[0]}/${product.value.slug}`
    : "#",
);

/** Cap a number at 99 for display (e.g. "99+" if over) */
function capCount(n: number): string {
  return n > 99 ? "99+" : String(n);
}

function handleAddToCart() {
  if (!product.value || !sku.value) return;

  const added = addToCart(
    product.value.id,
    sku.value.id,
    product.value.name[lang.value],
    product.value.thumbnail,
    sku.value.price.final,
    1,
    sku.value.price.original,
    sku.value.price.discount,
  );

  if (!added) {
    toast.add({
      title: t("productPage.stockLimitTitle"),
      description: t("productPage.stockLimitDesc"),
      icon: "bx:error-circle",
      color: "warning",
      duration: 3000,
    });
    return;
  }

  toast.add({
    title: t("productPage.addedToCartTitle") || "Success!",
    description: `${product.value.name[lang.value]} ${t("productPage.addedToCartDesc")}`,
    icon: "i-heroicons-check-circle",
    color: "primary",
    duration: 3000, // ✅ เปลี่ยนจาก duration เป็น timeout ตามมาตรฐาน Nuxt UI
  });
}
</script>

<template>
  <NuxtLink v-if="product" :to="productUrl" target="_blank" class="block">
    <UCard
      class="overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary"
    >
      <!-- ── Title (name) ── -->
      <template #header>
        <h3 class="truncate text-sm font-semibold">
          {{ product.name[lang] }}
        </h3>
      </template>

      <!-- ── Image — lazy loaded ── -->
      <NuxtImg
        :src="product.thumbnail"
        :alt="product.name[lang]"
        loading="lazy"
        class="h-48 w-full object-cover"
      />

      <!-- ── Body: description + pricing + action buttons ── -->
      <div class="mt-3 space-y-2" :style="{ height: '10rem' }">
        <!-- Description — max 2 lines -->
        <p class="line-clamp-2 text-sm text-gray-600">
          {{ product.description[lang] }}
        </p>

        <!-- Price row (from default SKU) -->
        <div v-if="sku" class="flex pt-5 items-baseline justify-end gap-2">
          <!-- Strikethrough original if discounted -->
          <span
            v-if="sku.price.discount > 0"
            class="text-xs text-gray-400 line-through"
          >
            ฿{{ sku.price.original.toLocaleString() }}
          </span>
          <span class="text-base font-bold text-primary">
            ฿{{ sku.price.final.toLocaleString() }}
          </span>
        </div>

        <!-- Rental price (daily) — only when product is for rent -->
        <div
          v-if="sku && isRental(product) && sku.rentalPrice.daily > 0"
          class="text-right"
        >
          <span class="text-xs text-gray-500">
            {{
              lang === "th"
                ? "เช่า"
                : lang === "cn"
                  ? "租赁"
                  : lang === "jp"
                    ? "レンタル"
                    : "Rent"
            }}
            ฿{{ sku.rentalPrice.daily.toLocaleString() }}/{{
              lang === "th"
                ? "วัน"
                : lang === "cn"
                  ? "天"
                  : lang === "jp"
                    ? "日"
                    : "day"
            }}
          </span>
        </div>

        <!-- Action buttons — after price -->
        <div class="flex items-center justify-end gap-2 pt-1">
          <!-- Sale action — always show cart icon when sale stock exists -->
          <UTooltip
            :text="saleActionTooltipLabel"
            :popper="{ placement: 'top' }"
          >
            <UButton
              v-if="canQuickAddToCart"
              icon="bx:cart-add"
              color="primary"
              variant="soft"
              size="sm"
              square
              class="transition-all duration-200 hover:scale-110 hover:shadow-md hover:ring-1 hover:ring-primary"
              :aria-label="t('productCard.addToCart')"
              @click.prevent.stop="handleAddToCart()"
            />

            <UButton
              v-else-if="saleActionRequiresDetail"
              :to="productUrl"
              icon="bx:cart-add"
              color="primary"
              variant="soft"
              size="sm"
              square
              class="transition-all duration-200 hover:scale-110 hover:shadow-md hover:ring-1 hover:ring-primary"
              :aria-label="saleActionTooltipLabel"
            />
          </UTooltip>

          <!-- Rental action — still goes through detail page -->
          <UTooltip
            :text="rentalActionTooltipLabel"
            :popper="{ placement: 'top' }"
          >
            <UButton
              v-if="requiresDetailAction"
              :to="productUrl"
              icon="bx:calendar-check"
              color="secondary"
              variant="soft"
              size="sm"
              square
              class="transition-all duration-200 hover:scale-110 hover:shadow-md hover:ring-1 hover:ring-secondary"
              :aria-label="rentalActionTooltipLabel"
            />
          </UTooltip>
        </div>
      </div>

      <!-- Chips: isForSale / isRental -->
      <div class="flex align-bottom justify-end gap-2 mt-6">
        <!-- Sale chip — green when in stock -->
        <UBadge
          class="mx-1"
          v-if="product.isForSale"
          :color="stock.inStock > 0 ? 'success' : 'neutral'"
          size="sm"
          variant="subtle"
        >
          {{ t("productPage.inStock") }}
          <span v-if="stock.inStock > 0" class="ml-1">
            {{ capCount(stock.inStock) }}
          </span>
        </UBadge>

        <!-- Rent chip -->
        <UBadge
          class="mx-1"
          v-if="isRental(product)"
          :color="remainingRentalAvailability > 0 ? 'info' : 'neutral'"
          size="sm"
          variant="subtle"
        >
          {{ t("productPage.available") }}
          <span v-if="remainingRentalAvailability > 0" class="ml-1">
            {{ capCount(remainingRentalAvailability) }}
          </span>
        </UBadge>
      </div>
    </UCard>
  </NuxtLink>
</template>
