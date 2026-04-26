<script setup lang="ts">
import type { LocaleCode } from "~/types/locale";
import type { Product } from "~/types/product";

const props = defineProps<{
  product: Product;
}>();

const { locale, t } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

const productUrl = computed(
  () =>
    `/product-${props.product.categories[0] ?? "all"}/${props.product.slug}`,
);

const displayPrice = computed(
  () =>
    props.product.skus.reduce((lowest, sku) =>
      sku.price.final < lowest.price.final ? sku : lowest,
    ).price,
);
</script>

<template>
  <NuxtLink :to="productUrl" class="block h-full">
    <UCard
      class="h-88 overflow-hidden transition-shadow duration-200 hover:shadow-lg"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <div class="flex h-full flex-col">
        <NuxtImg
          :src="props.product.thumbnail"
          :alt="props.product.name[lang]"
          class="h-48 w-full object-cover"
          loading="lazy"
        />

        <div class="flex flex-1 flex-col gap-3 p-4">
          <div class="space-y-2">
            <UBadge color="neutral" variant="soft" size="sm">
              {{ props.product.brand }}
            </UBadge>
            <h3
              class="line-clamp-2 text-base font-semibold text-[var(--ui-text)]"
            >
              {{ props.product.name[lang] }}
            </h3>
            <p class="line-clamp-3 text-sm text-[var(--ui-text-muted)]">
              {{ props.product.description[lang] }}
            </p>
          </div>

          <div class="mt-auto flex items-end justify-between gap-3">
            <div>
              <p class="text-xs text-[var(--ui-text-muted)]">
                {{ t("productPage.sale") }}
              </p>
              <p class="text-lg font-bold text-[var(--ui-primary)]">
                ฿{{ displayPrice.final.toLocaleString() }}
              </p>
            </div>

            <UButton size="sm" color="primary" variant="soft">
              {{ t("home.viewDetails") }}
            </UButton>
          </div>
        </div>
      </div>
    </UCard>้
    
  </NuxtLink>
</template>

