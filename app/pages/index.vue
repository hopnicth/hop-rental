<script setup lang="ts">
import HopBanner from "~/components/banner/HopBanner.vue";
import HomeHorizontalRail from "~/components/home/HomeHorizontalRail.vue";
import HomeLinkCard from "~/components/home/HomeLinkCard.vue";
import HomeSectionShell from "~/components/home/HomeSectionShell.vue";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import HopPartnerSlide from "~/components/partners/HopPartnerSlide.vue";
import CategoriesCard from "~/components/categories_card/CategoriesCard.vue";
import type { Asset } from "~/types/asset";
import type { HomeLinkCard as HomeLinkCardType } from "~/types/home";
import type { Product } from "~/types/product";

const { t } = useI18n();
const { getAssetShowPath, loading: assetsLoading } = useAssets();
const { loading: productsLoading } = useProducts();
const {
  promotionCards,
  featuredAssets,
  featuredProducts,
  serviceCards,
  loading: homeContentLoading,
} = useHomeContent();

const linkCardsLoading = computed(() => homeContentLoading.value);
const featuredAssetsLoading = computed(
  () => homeContentLoading.value || assetsLoading.value,
);
const featuredProductsLoading = computed(
  () => homeContentLoading.value || productsLoading.value,
);

function asHomeLinkCard(item: unknown) {
  return item as HomeLinkCardType;
}

function asAsset(item: unknown) {
  return item as Asset;
}

function asProduct(item: unknown) {
  return item as Product;
}
</script>

<template>
  <UContainer class="py-4 sm:py-6">
    <div class="grid grid-cols-12 items-start gap-4 lg:gap-6">
      <div class="hidden lg:block lg:col-span-3">
        <CategoriesCard />
      </div>

      <div class="col-span-12 space-y-7 lg:col-span-9 sm:space-y-8">
        <HopBanner />

        <div class="space-y-4 sm:space-y-5">
          <HopFeatureBar />
          <HomeCategoryShortcutRail />
          <div
            class="hidden rounded-1xl border border-default bg-white/70 px-4 py-4 sm:block sm:px-5"
          >
            <HopPartnerSlide />
          </div>
        </div>

        <div>
          <HomeSectionShell
            :title="t('home.promotionsTitle')"
            :description="t('home.promotionsDescription')"
          >
            <HomeHorizontalRail
              :items="promotionCards"
              :empty-label="t('home.emptyPromotions')"
              :loading="linkCardsLoading"
            >
              <template #skeleton>
                <HomeLinkCardSkeleton />
              </template>
              <template #item="{ item }">
                <HomeLinkCard
                  :card="asHomeLinkCard(item)"
                  class="lg:mx-0.5 sm:mx-0"
                />
              </template>
            </HomeHorizontalRail>
          </HomeSectionShell>

          <HomeSectionShell
            :title="t('home.rentalTitle')"
            :description="t('home.rentalDescription')"
          >
            <template #action>
              <UButton
                to="/product-rental"
                variant="soft"
                color="secondary"
                size="sm"
              >
                {{ t("home.viewAllRentals") }}
              </UButton>
            </template>

            <HomeHorizontalRail
              :items="featuredAssets"
              :empty-label="t('home.emptyRentals')"
              :loading="featuredAssetsLoading"
            >
              <template #item="{ item }">
                <LazyProductsAssetCard
                  :access="asAsset(item)"
                  :browse-to="getAssetShowPath(asAsset(item))"
                  hide-matches
                  class="lg:mx-0.5"
                />
              </template>
            </HomeHorizontalRail>
          </HomeSectionShell>

          <HomeSectionShell
            :title="t('home.productsTitle')"
            :description="t('home.productsDescription')"
          >
            <template #action>
              <UButton
                to="/product-all"
                variant="soft"
                color="primary"
                size="sm"
              >
                {{ t("home.viewAllProducts") }}
              </UButton>
            </template>

            <HomeHorizontalRail
              :items="featuredProducts"
              :empty-label="t('home.emptyProducts')"
              :loading="featuredProductsLoading"
            >
              <template #item="{ item }">
                <LazyProductsProductCard
                  :product-id="asProduct(item).id"
                  class="lg:mx-0.5"
                />
              </template>
            </HomeHorizontalRail>
          </HomeSectionShell>

          <HomeSectionShell
            :title="t('home.servicesTitle')"
            :description="t('home.servicesDescription')"
          >
            <HomeHorizontalRail
              :items="serviceCards"
              :empty-label="t('home.emptyServices')"
              :loading="linkCardsLoading"
            >
              <template #skeleton>
                <HomeLinkCardSkeleton />
              </template>
              <template #item="{ item }">
                <HomeLinkCard :card="asHomeLinkCard(item)" class="lg:mx-0.5" />
              </template>
            </HomeHorizontalRail>
          </HomeSectionShell>
        </div>
      </div>
    </div>
  </UContainer>
</template>
