<script setup lang="ts">
import type { Product } from "~/types/product";
import type { LocaleCode } from "~/types/locale";

/**
 * ProductInfo — Displays product name, brand, rating, SKU picker,
 * price, rental pricing, stock badges, action buttons, and insight stats.
 */

const props = withDefaults(
  defineProps<{
    product: Product;
    selectedSkuIndex: number;
    matchedAssetCount?: number;
  }>(),
  {
    matchedAssetCount: 0,
  },
);

const emit = defineEmits<{
  "update:selectedSkuIndex": [value: number];
  addToCart: [];
}>();

const { t, locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

const selectedSku = computed(() => props.product.skus[props.selectedSkuIndex]);

const selectedSaleStock = computed(() => selectedSku.value?.stock.inStock ?? 0);

const hasMatchedAssets = computed(
  () => (props.matchedAssetCount ?? 0) > 0,
);
</script>

<template>
  <div class="space-y-4">
    <!-- Name -->
    <h1 class="text-2xl font-bold">{{ product.name[lang] }}</h1>

    <!-- Brand + Rating -->
    <div class="flex items-center gap-4 text-sm text-gray-500">
      <span>
        {{ t("productDetail.brand") }}:
        <strong>{{ product.brand }}</strong>
      </span>
      <span
        v-if="product.insight.avgRating > 0"
        class="flex items-center gap-1"
      >
        <UIcon name="bx:star" class="text-yellow-500" />
        {{ product.insight.avgRating.toFixed(1) }}
        ({{ product.insight.reviewCount }} {{ t("productDetail.reviews") }})
      </span>
    </div>

    <!-- SKU Picker (if multiple SKUs) -->
    <div v-if="product.skus.length > 1" class="space-y-2">
      <p class="text-sm font-medium">
        {{ t("productDetail.selectVariant") }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="(sku, idx) in product.skus"
          :key="sku.id"
          :variant="idx === selectedSkuIndex ? 'solid' : 'outline'"
          size="sm"
          @click="emit('update:selectedSkuIndex', idx)"
        >
          {{ sku.label?.[lang] || sku.id }}
        </UButton>
      </div>
    </div>

    <!-- Price -->
    <div v-if="selectedSku" class="space-y-1">
      <div class="flex items-baseline gap-3">
        <span class="text-3xl font-bold text-primary">
          ฿{{ selectedSku.price.final.toLocaleString() }}
        </span>
        <span
          v-if="selectedSku.price.discount > 0"
          class="text-lg text-gray-400 line-through"
        >
          ฿{{ selectedSku.price.original.toLocaleString() }}
        </span>
        <UBadge
          v-if="selectedSku.price.discount > 0"
          color="error"
          variant="soft"
          size="sm"
        >
          -{{ selectedSku.price.discount }}%
        </UBadge>
      </div>
    </div>

    <!-- Stock Badges -->
    <div class="flex gap-3">
      <UBadge
        v-if="product.isForSale"
        :color="selectedSaleStock > 0 ? 'success' : 'neutral'"
        variant="subtle"
      >
        {{ t("productDetail.inStock") }}: {{ selectedSaleStock }}
      </UBadge>
      <UBadge
        v-if="hasMatchedAssets"
        color="secondary"
        variant="subtle"
      >
        {{ t("productDetail.available") }}:
        {{ matchedAssetCount }}
      </UBadge>
    </div>

    <!-- Action Buttons -->
    <div class="flex gap-3 pt-2">
      <UButton
        v-if="product.isForSale && selectedSaleStock > 0"
        icon="bx:cart-add"
        :label="t('productDetail.addToCart')"
        color="primary"
        size="lg"
        @click="emit('addToCart')"
      />
    </div>

    <!-- Insight stats -->
    <div class="flex gap-4 text-xs text-gray-400 pt-2">
      <span>
        {{ t("productDetail.sold") }}: {{ product.insight.orderCount }}
      </span>
      <span v-if="hasMatchedAssets">
        {{ t("productDetail.rented") }}: {{ product.insight.rentalCount }}
      </span>
    </div>
  </div>
</template>
