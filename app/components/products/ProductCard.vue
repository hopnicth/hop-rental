<script setup lang="ts">
import CatalogCardShell from "~/components/products/CatalogCardShell.vue";
import type { LocaleCode } from "~/types/locale";

const toast = useToast();

const props = defineProps<{
  /** Product ID — used to fetch product data from composable */
  productId: string;
}>();

const { locale, t } = useI18n();
const { getProductById, getDefaultSKU, getTotalStock } = useProducts();
const { assets } = useAssets();
const { addToCart } = useCart();
const user = useSupabaseUser();
const { isWishlisted, isToggling, toggleWishlist } = useWishlist();

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

const matchedAssetCount = computed(() => {
  if (!product.value) return 0;
  const productId = product.value.id;
  return assets.value.filter((access) =>
    access.matches.some(
      (m) => m.productId === productId && m.matchType === "compatible",
    ),
  ).length;
});

const hasMultipleSkus = computed(() => (product.value?.skus.length ?? 0) > 1);

const canQuickAddToCart = computed(
  () =>
    !!product.value &&
    !!sku.value &&
    product.value.isForSale &&
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

const wishlisted = isWishlisted(props.productId);
const wishlistLoading = isToggling(props.productId);
const wishlistLabel = computed(() =>
  wishlisted.value
    ? t("productCard.removeWishlist")
    : t("productCard.addWishlist"),
);

const productUrl = computed(() =>
  product.value
    ? `/product-${product.value.categories[0]}/${product.value.slug}`
    : "#",
);

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

async function handleWishlistToggle() {
  if (!product.value) return;
  if (!user.value) {
    toast.add({
      title: t("productCard.wishlistLoginTitle"),
      description: t("productCard.wishlistLoginDesc"),
      icon: "bx:log-in-circle",
      color: "warning",
      duration: 3000,
    });
    await navigateTo("/user/login");
    return;
  }

  try {
    const next = await toggleWishlist(product.value.id);
    toast.add({
      title: next
        ? t("productCard.wishlistAdded")
        : t("productCard.wishlistRemoved"),
      icon: next ? "bx:heart" : "bx:check-circle",
      color: next ? "error" : "neutral",
      duration: 2200,
    });
  } catch (error) {
    toast.add({
      title: t("productCard.wishlistError"),
      description: error instanceof Error ? error.message : "Unknown error",
      icon: "bx:error-circle",
      color: "error",
      duration: 3000,
    });
  }
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
        <div class="flex flex-wrap gap-2">
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
            v-if="matchedAssetCount > 0"
            color="secondary"
            size="sm"
            variant="subtle"
          >
            {{ t("productPage.available") }}
            <span class="ml-1">
              {{ capCount(matchedAssetCount) }}
            </span>
          </UBadge>
        </div>
      </template>

      <template #badges>
        <div v-if="sku" class="flex items-baseline gap-2">
          <span class="text-base font-bold text-primary">
            ฿{{ sku.price.final.toLocaleString() }}
          </span>
          <span
            v-if="sku.price.discount > 0"
            class="text-xs text-gray-400 line-through"
          >
            ฿{{ sku.price.original.toLocaleString() }}
          </span>
        </div>
      </template>

      <template #actions>
        <UTooltip :text="wishlistLabel" :popper="{ placement: 'top' }">
          <UButton
            icon="bx:heart"
            :color="wishlisted ? 'error' : 'neutral'"
            :variant="wishlisted ? 'solid' : 'soft'"
            size="sm"
            square
            :loading="wishlistLoading"
            class="transition-all duration-200 hover:scale-110 hover:shadow-md"
            :aria-label="wishlistLabel"
            @click.prevent.stop="handleWishlistToggle()"
          />
        </UTooltip>

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
