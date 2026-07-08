<script setup lang="ts">
/**
 * PartnerCategoryCards — home "ร้านค้าและบริการของพันธมิตร" section body.
 * Renders the 8 level-0 categories in the SAME carousel the home product /
 * rental sections use (HomeHorizontalRail → UCarousel), so the cards share the
 * product carousel's slides-per-view (basis-1/2 sm:basis-1/3), arrows/dots/
 * autoplay, and scale responsively on mobile and desktop. Presentational and
 * href-based (no route reads) → page-agnostic and reusable.
 *
 * Card chrome mirrors the home product cards (UCard outline + hover -translate-y
 * + ring-primary — app/components/CLAUDE.md §7). The icon sits in an
 * aspect-square primary-soft zone occupying the product image's footprint; the
 * label is centered below (line-clamp-2 for long Thai names). Labels use the
 * shared partners.categories.${slug} keys; icons from app/config/partner-categories.ts.
 */
import HomeHorizontalRail from "~/components/home/HomeHorizontalRail.vue";
import {
  PARTNER_LEVEL0_CATEGORIES,
  type PartnerLevel0Category,
} from "~/config/partner-categories";

const { t } = useI18n();
const categories = PARTNER_LEVEL0_CATEGORIES;

function asCategory(item: unknown): PartnerLevel0Category {
  return item as PartnerLevel0Category;
}
</script>

<template>
  <HomeHorizontalRail :items="categories" :empty-label="''">
    <template #item="{ item }">
      <NuxtLink
        :to="`/partners?taxCategory=${asCategory(item).slug}`"
        class="group block lg:mx-0.5"
      >
        <UCard
          class="h-full cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-primary"
        >
          <!-- Icon zone: same aspect-square footprint the product image occupies -->
          <div
            class="flex aspect-square items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary/15"
          >
            <UIcon :name="asCategory(item).icon" class="size-14 sm:size-16" />
          </div>
          <!-- Text zone: category name centered horizontally + vertically -->
          <div class="mt-3 flex min-h-12 items-center justify-center">
            <span
              class="line-clamp-2 text-center text-sm font-semibold text-default"
            >
              {{ t(`partners.categories.${asCategory(item).slug}`) }}
            </span>
          </div>
        </UCard>
      </NuxtLink>
    </template>
  </HomeHorizontalRail>
</template>
