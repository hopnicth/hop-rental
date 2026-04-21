<script setup lang="ts">
import CatalogCardShell from "~/components/products/CatalogCardShell.vue";
import type { LocaleCode } from "~/types/locale";
import type { RentalAccess } from "~/types/rental-access";

const props = defineProps<{
  access: RentalAccess;
  browseTo?: string | null;
  actionTo?: string | null;
}>();

const emit = defineEmits<{ bookNow: [access: RentalAccess] }>();

const { locale, t } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

function formatMoney(value: number): string {
  return `฿${value.toLocaleString()}`;
}
</script>

<template>
  <CatalogCardShell
    :title="access.name[lang]"
    :subtitle="access.code"
    :image-src="access.thumbnail"
    :image-alt="access.name[lang]"
    :to="browseTo ?? null"
    :clickable="Boolean(browseTo)"
    card-class="hover:ring-2 hover:ring-secondary"
  >
    <template #description>
      <p class="line-clamp-2 text-sm text-gray-600">
        {{ access.description[lang] }}
      </p>
    </template>

    <template #details>
      <div
        class="grid grid-cols-2 gap-2 rounded-lg bg-blue-50 p-3 text-sm dark:bg-blue-950"
      >
        <div>
          <span class="text-gray-500">{{ t("productDetail.deposit") }}</span>
          <p class="font-semibold">{{ formatMoney(access.pricing.deposit) }}</p>
        </div>
        <div>
          <span class="text-gray-500">{{ t("productDetail.perDay") }}</span>
          <p class="font-semibold">{{ formatMoney(access.pricing.daily) }}</p>
        </div>
      </div>
    </template>

    <template #tags>
      <div class="flex flex-wrap gap-2">
        <UBadge v-if="access.brand" color="neutral" variant="soft">
          {{ access.brand }}
        </UBadge>
        <UBadge
          v-for="product in access.matchedProducts.slice(0, 2)"
          :key="product.id"
          color="secondary"
          variant="soft"
        >
          {{ product.name[lang] }}
        </UBadge>
      </div>
    </template>

    <template #actions>
      <UButton
        v-if="browseTo"
        :to="browseTo"
        icon="bx:info-circle"
        color="secondary"
        :label="t('rentalAccess.viewDetails')"
      />
      <UButton
        v-else-if="actionTo"
        :to="actionTo"
        icon="bx:calendar-check"
        color="secondary"
        :label="t('productDetail.bookNow')"
      />
      <UButton
        v-else
        icon="bx:calendar-check"
        color="secondary"
        :label="t('productDetail.bookNow')"
        @click="emit('bookNow', access)"
      />
    </template>
  </CatalogCardShell>
</template>
