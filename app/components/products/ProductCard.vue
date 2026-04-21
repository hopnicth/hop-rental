<script setup lang="ts">
import CatalogCardShell from "~/components/products/CatalogCardShell.vue";
import type { LocaleCode } from "~/types/locale";

const toast = useToast();

const props = defineProps<{
  /** Product ID — used to fetch product data from composable */
  productId: string;
}>();

const { locale, t } = useI18n();
const { getProductById, getDefaultSKU, getTotalStock, isRental } =
  useProducts();
const { rentalAccesses } = useRentalAccesses();
const { addToCart } = useCart();
const { getRemainingAvailability } = useBooking();

const product = getProductById(props.productId);
const lang = computed(() => locale.value as LocaleCode);

const sku = computed(() =>
  product.value ? getDefaultSKU(product.value) : null,
);

const stock = computed(() =>
  product.value
    ? getTotalStock(product.value)
    : { inStock: 0, available: 0, reserved: 0 },
);

const rentalProduct = computed(() =>
  product.value ? isRental(product.value) : false,
);

const matchedRentalAccesses = computed(() =>
  product.value
    ? rentalAccesses.value.filter((access) =>
        access.matchedProductIds.includes(product.value!.id),
      )
    : [],
);

const matchedRentalAccessCount = computed(
  () => matchedRentalAccesses.value.length,
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

const productUrl = computed(() =>
  product.value
    ? `/product-${product.value.categories[0]}/${product.value.slug}`
    : "#",
);

const rentalLabel = computed(() => {
  switch (lang.value) {
    case "th":
      return "เช่า";
    case "cn":
      return "租赁";
    case "jp":
      return "レンタル";
    default:
      return "Rent";
  }
});

const rentalDayLabel = computed(() => {
  switch (lang.value) {
    case "th":
      return "วัน";
    case "cn":
      return "天";
    case "jp":
      return "日";
    default:
      return "day";
  }
});

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
    duration: 3000,
  });
}
</script>

<template>
  <NuxtLink v-if="product" :to="productUrl" class="block h-full">
    <CatalogCardShell
      :title="product.name[lang]"
      :image-src="product.thumbnail"
      :image-alt="product.name[lang]"
      :clickable="true"
      card-class="hover:ring-2 hover:ring-primary"
    >
      <template #description>
        <p class="line-clamp-2 text-sm text-gray-600">
          {{ product.description[lang] }}
        </p>
      </template>

      <template #details>
        <div v-if="sku" class="space-y-1 text-right">
          <div class="flex items-baseline justify-end gap-2">
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

          <div
            v-if="isRental(product) && sku.rentalPrice.daily > 0"
            class="text-xs text-gray-500"
          >
            {{ rentalLabel }}
            ฿{{ sku.rentalPrice.daily.toLocaleString() }}/{{ rentalDayLabel }}
          </div>
        </div>
      </template>

      <template #badges>
        <UBadge
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

        <UBadge
          v-if="matchedRentalAccessCount > 0"
          color="secondary"
          size="sm"
          variant="subtle"
        >
          {{ t("productPage.available") }}
          <span class="ml-1">
            {{ capCount(matchedRentalAccessCount) }}
          </span>
        </UBadge>

        <UBadge
          v-else-if="isRental(product)"
          :color="remainingRentalAvailability > 0 ? 'info' : 'neutral'"
          size="sm"
          variant="subtle"
        >
          {{ t("productPage.available") }}
          <span v-if="remainingRentalAvailability > 0" class="ml-1">
            {{ capCount(remainingRentalAvailability) }}
          </span>
        </UBadge>
      </template>

      <template #actions>
        <UTooltip :text="saleActionTooltipLabel" :popper="{ placement: 'top' }">
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
            icon="bx:cart-add"
            color="primary"
            variant="soft"
            size="sm"
            square
            class="transition-all duration-200 hover:scale-110 hover:shadow-md hover:ring-1 hover:ring-primary"
            :aria-label="saleActionTooltipLabel"
          />
        </UTooltip>
      </template>
    </CatalogCardShell>
  </NuxtLink>
</template>
