<script setup lang="ts">
/**
 * PartnerCategoryRail — horizontal level-0 taxonomy rail for the public partner
 * directory. Presentational only: it renders "All" + the 8 level-0 categories
 * from the static config and emits the chosen slug. The parent owns URL/state,
 * so this component is reusable (e.g. on the home page) with no page assumptions.
 *
 * Labels come from the shared `partners.categories.${slug}` i18n keys; icons come
 * from `app/config/partner-categories.ts` (see its DB-sync note).
 */
import { PARTNER_LEVEL0_CATEGORIES } from "~/config/partner-categories";

const props = defineProps<{
  /** Active level-0 slug. null / undefined / "" all mean the "All" chip is active. */
  activeCategory?: string | null;
}>();

const emit = defineEmits<{
  /** Emitted on chip click. null = "All" (clear the taxonomy filter). */
  select: [slug: string | null];
}>();

const { t } = useI18n();

const categories = PARTNER_LEVEL0_CATEGORIES;

function isActive(slug: string | null): boolean {
  return (props.activeCategory || null) === slug;
}
</script>

<template>
  <div
    class="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    <div class="flex snap-x gap-2">
      <UButton
        :variant="isActive(null) ? 'solid' : 'soft'"
        :color="isActive(null) ? 'primary' : 'neutral'"
        size="sm"
        class="shrink-0 snap-start"
        :aria-pressed="isActive(null)"
        @click="emit('select', null)"
      >
        {{ t("partners.rail.all") }}
      </UButton>
      <UButton
        v-for="cat in categories"
        :key="cat.slug"
        :variant="isActive(cat.slug) ? 'solid' : 'soft'"
        :color="isActive(cat.slug) ? 'primary' : 'neutral'"
        size="sm"
        :icon="cat.icon"
        class="shrink-0 snap-start"
        :aria-pressed="isActive(cat.slug)"
        @click="emit('select', cat.slug)"
      >
        {{ t(`partners.categories.${cat.slug}`) }}
      </UButton>
    </div>
  </div>
</template>
