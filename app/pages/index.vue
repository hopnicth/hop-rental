<script setup lang="ts">
import HopBanner from "~/components/banner/HopBanner.vue";
import HomeHorizontalRail from "~/components/home/HomeHorizontalRail.vue";
import HomeLinkCard from "~/components/home/HomeLinkCard.vue";
import HomeSectionShell from "~/components/home/HomeSectionShell.vue";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import MobileFloatingPanel from "~/components/mobile/MobileFloatingPanel.vue";
import HopPartnerSlide from "~/components/partners/HopPartnerSlide.vue";
import ProductCard from "~/components/products/ProductCard.vue";
import AssetCard from "~/components/products/AssetCard.vue";
import CategoriesCard from "~/components/categories_card/CategoriesCard.vue";

const { t } = useI18n();
const isCategoryPanelOpen = ref(false);
const { getAssetShowPath } = useAssets();
const {
  promotionCards,
  featuredAssets,
  featuredProducts,
  serviceCards,
} = useHomeContent();
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
          <div
            class="rounded-3xl border border-default bg-white/70 px-4 py-4 sm:px-5"
          >
            <HopPartnerSlide />
          </div>
        </div>

        <HomeSectionShell
          :title="t('home.promotionsTitle')"
          :description="t('home.promotionsDescription')"
        >
          <HomeHorizontalRail
            :items="promotionCards"
            :empty-label="t('home.emptyPromotions')"
          >
            <template #item="{ item }">
              <HomeLinkCard :card="item" />
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
          >
            <template #item="{ item }">
              <AssetCard
                :access="item"
                :browse-to="getAssetShowPath(item)"
              />
            </template>
          </HomeHorizontalRail>
        </HomeSectionShell>

        <HomeSectionShell
          :title="t('home.productsTitle')"
          :description="t('home.productsDescription')"
        >
          <template #action>
            <UButton to="/product-all" variant="soft" color="primary" size="sm">
              {{ t("home.viewAllProducts") }}
            </UButton>
          </template>

          <HomeHorizontalRail
            :items="featuredProducts"
            :empty-label="t('home.emptyProducts')"
          >
            <template #item="{ item }">
              <ProductCard :product-id="item.id" />
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
          >
            <template #item="{ item }">
              <HomeLinkCard :card="item" />
            </template>
          </HomeHorizontalRail>
        </HomeSectionShell>
      </div>
    </div>

    <MobileFloatingPanel
      v-model:open="isCategoryPanelOpen"
      :title="t('categories.title')"
      icon="bx:category"
      :button-label="t('categories.title')"
    >
      <CategoriesCard @selected="isCategoryPanelOpen = false" />
    </MobileFloatingPanel>
  </UContainer>
</template>
