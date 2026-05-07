<script setup lang="ts">
import CatalogCardShell from "~/components/products/CatalogCardShell.vue";
import type { LocaleCode } from "~/types/locale";
import type { Asset } from "~/types/asset";

const props = defineProps<{
  access: Asset;
  browseTo?: string | null;
  actionTo?: string | null;
  hideMatches?: boolean;
}>();

const emit = defineEmits<{ bookNow: [access: Asset] }>();

const toast = useToast();
const { locale, t } = useI18n();
const user = useSupabaseUser();
const { isSaved, isToggling, toggleSaveList } = useSaveList();
const lang = computed(() => locale.value as LocaleCode);
const saved = isSaved("asset", props.access.id);
const saveLoading = isToggling("asset", props.access.id);
const saveLabel = computed(() =>
  saved.value ? t("saveList.removeAsset") : t("saveList.addAsset"),
);
const primaryPrice = computed(() => {
  if (props.access.pricing.dailyEnabled) {
    return {
      amount: props.access.pricing.daily,
      label: t("productDetail.perDay"),
    };
  }
  if (props.access.pricing.weeklyEnabled) {
    return {
      amount: props.access.pricing.weekly,
      label: t("productDetail.perWeek"),
    };
  }
  if (props.access.pricing.monthlyEnabled) {
    return {
      amount: props.access.pricing.monthly,
      label: t("productDetail.perMonth"),
    };
  }
  return {
    amount: props.access.pricing.deposit,
    label: t("productDetail.deposit"),
  };
});

function formatMoney(value: number): string {
  return `฿${value.toLocaleString()}`;
}

async function handleSaveToggle() {
  if (!user.value) {
    toast.add({
      title: t("saveList.loginTitle"),
      description: t("saveList.loginDesc"),
      icon: "bx:log-in-circle",
      color: "warning",
      duration: 3000,
    });
    await navigateTo("/user/login");
    return;
  }

  try {
    const next = await toggleSaveList("asset", props.access.id);
    toast.add({
      title: next ? t("saveList.savedAdded") : t("saveList.savedRemoved"),
      icon: next ? "bx:bookmark" : "bx:check-circle",
      color: next ? "secondary" : "neutral",
      duration: 2200,
    });
  } catch (error) {
    toast.add({
      title: t("saveList.saveError"),
      description: error instanceof Error ? error.message : "Unknown error",
      icon: "bx:error-circle",
      color: "error",
      duration: 3000,
    });
  }
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
    <template #overlay>
      <UTooltip :text="saveLabel" :popper="{ placement: 'top' }">
        <UButton
          icon="bx:bookmark"
          :color="saved ? 'secondary' : 'neutral'"
          :variant="saved ? 'solid' : 'soft'"
          size="sm"
          square
          :loading="saveLoading"
          class="shadow-sm backdrop-blur transition-all duration-200 hover:scale-110 hover:shadow-md"
          :aria-label="saveLabel"
          @click.prevent.stop="handleSaveToggle()"
        />
      </UTooltip>
    </template>

    <template #description>
      <p class="line-clamp-2 text-sm text-gray-600">
        {{ access.description[lang] }}
      </p>
    </template>

    <template #details>
      <div class="flex flex-wrap gap-2">
        <UBadge color="secondary" size="sm" variant="subtle">
          {{ t("search.rentalBadge") }}
        </UBadge>
        <UBadge color="neutral" size="sm" variant="subtle">
          {{ t("productDetail.deposit") }}
          {{ formatMoney(access.pricing.deposit) }}
        </UBadge>
      </div>
    </template>

    <template #tags>
      <div class="flex flex-wrap gap-2">
        <UBadge v-if="access.brand" color="neutral" variant="soft">
          {{ access.brand }}
        </UBadge>
        <UBadge
          v-for="product in hideMatches
            ? []
            : access.matchedProducts.slice(0, 2)"
          :key="product.id"
          color="secondary"
          variant="soft"
        >
          {{ product.name[lang] }}
        </UBadge>
      </div>
    </template>

    <template #badges>
      <div class="flex items-baseline gap-2">
        <span class="text-base font-bold text-secondary">
          {{ formatMoney(primaryPrice.amount) }}
        </span>
        <span class="text-xs text-gray-400">
          {{ primaryPrice.label }}
        </span>
      </div>
    </template>

    <template #actions>
      <UTooltip
        :text="browseTo ? t('asset.viewDetails') : t('productDetail.bookNow')"
        :popper="{ placement: 'top' }"
      >
        <UButton
          v-if="browseTo"
          :to="browseTo"
          icon="bx:info-circle"
          color="secondary"
          variant="soft"
          size="sm"
          square
          :aria-label="t('asset.viewDetails')"
        />
        <UButton
          v-else-if="actionTo"
          :to="actionTo"
          icon="bx:calendar-check"
          color="secondary"
          variant="soft"
          size="sm"
          square
          :aria-label="t('productDetail.bookNow')"
        />
        <UButton
          v-else
          icon="bx:calendar-check"
          color="secondary"
          variant="soft"
          size="sm"
          square
          :aria-label="t('productDetail.bookNow')"
          @click="emit('bookNow', access)"
        />
      </UTooltip>
    </template>
  </CatalogCardShell>
</template>
