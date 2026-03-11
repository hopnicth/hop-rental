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

  // 2. เรียก Logic: ตัวที่เป็น computed (sku, lang) ต้องเติม .value เสมอ
  addToCart(
    product.value.id,
    sku.value.id, // ✅ sku.value
    product.value.name[lang.value], // ✅ lang.value
    product.value.thumbnail,
    sku.value.price.final, // ✅ sku.value
  );

  // 3. แสดง Notification
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
          <!-- Add to Cart — only when for sale & in stock -->
          <UTooltip
            :text="t('productPage.addToCart')"
            :popper="{ placement: 'top' }"
          >
            <UButton
              v-if="product.isForSale && stock.inStock > 0 && sku"
              icon="bx:cart-add"
              color="primary"
              variant="soft"
              size="sm"
              square
              class="transition-all duration-200 hover:scale-110 hover:shadow-md hover:ring-1 hover:ring-primary"
              :aria-label="t('productPage.addToCart')"
              @click.prevent.stop="handleAddToCart()"
            />
          </UTooltip>

          <!-- Book Now — only when for rent & available -->
          <UTooltip
            :text="t('productPage.bookNow')"
            :popper="{ placement: 'top' }"
          >
            <UButton
              :to="productUrl"
              v-if="isRental(product) && stock.available > 0"
              icon="bx:calendar-check"
              color="secondary"
              variant="soft"
              size="sm"
              square
              class="transition-all duration-200 hover:scale-110 hover:shadow-md hover:ring-1 hover:ring-secondary"
              :aria-label="t('productPage.bookNow')"
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
          :color="stock.available > 0 ? 'info' : 'neutral'"
          size="sm"
          variant="subtle"
        >
          {{ t("productPage.available") }}
          <span v-if="stock.available > 0" class="ml-1">
            {{ capCount(stock.available) }}
          </span>
        </UBadge>
      </div>
    </UCard>
  </NuxtLink>
</template>
