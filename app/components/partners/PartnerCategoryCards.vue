<script setup lang="ts">
/**
 * PartnerCategoryCards — home "ร้านค้าและบริการของเรา" section body.
 * Renders the 8 level-0 categories from the shared config as cards, each linking
 * to the partner directory pre-filtered by taxCategory. Presentational and
 * href-based (no route reads) → page-agnostic and reusable.
 *
 * Card chrome mirrors the home rental/sale cards (CatalogCardShell → UCard
 * outline: rounded-lg + ring-default; hover -translate-y + ring-primary — see
 * app/components/CLAUDE.md §7). Labels use the shared partners.categories.${slug}
 * i18n keys; icons come from app/config/partner-categories.ts.
 */
import { PARTNER_LEVEL0_CATEGORIES } from "~/config/partner-categories";

const { t } = useI18n();
const categories = PARTNER_LEVEL0_CATEGORIES;
</script>

<template>
  <!-- Mobile: horizontal scroll rail. sm+: 4-col grid (× 2 rows). -->
  <div
    class="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0"
  >
    <NuxtLink
      v-for="cat in categories"
      :key="cat.slug"
      :to="`/partners?taxCategory=${cat.slug}`"
      class="group w-40 shrink-0 snap-start sm:w-auto"
    >
      <UCard
        class="h-full cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-primary"
      >
        <div class="flex items-center gap-3">
          <span
            class="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white"
          >
            <UIcon :name="cat.icon" class="size-5" />
          </span>
          <span class="text-sm font-semibold text-default">
            {{ t(`partners.categories.${cat.slug}`) }}
          </span>
        </div>
      </UCard>
    </NuxtLink>
  </div>
</template>
