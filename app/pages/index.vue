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
import type { PartnerCard } from "~/types/partner";

const { t } = useI18n();
const { getAssetShowPath, loading: assetsLoading } = useAssets();
const { loading: productsLoading } = useProducts();
const {
  promotionCards,
  featuredAssets,
  featuredProducts,
  loading: homeContentLoading,
} = useHomeContent();

const { partners, pending: partnersPending } = useHomePartners();

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

function asPartnerCard(item: unknown) {
  return item as PartnerCard;
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
          <!-- Desktop sm+: partner slide with heading row -->
          <div
            class="hidden rounded-1xl border border-default bg-white/70 px-4 py-4 sm:block sm:px-5"
          >
            <div class="mb-3 flex items-center justify-between gap-3">
              <p class="text-sm font-semibold text-default">
                {{ t("nav.partners") }}
              </p>
              <UButton
                to="/partners"
                variant="soft"
                color="primary"
                size="sm"
                trailing-icon="bx:chevron-right"
              >
                {{ t("home.viewAllPartners") }}
              </UButton>
            </div>
            <HopPartnerSlide />
          </div>

          <!-- Mobile-only: partner section heading + CTA (slide hidden on mobile) -->
          <div class="flex items-center justify-between sm:hidden">
            <p class="text-sm font-semibold text-default">
              {{ t("nav.partners") }}
            </p>
            <UButton
              to="/partners"
              variant="soft"
              color="primary"
              size="sm"
              trailing-icon="bx:chevron-right"
            >
              {{ t("home.viewAllPartners") }}
            </UButton>
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

          <HomeSectionShell :title="t('home.partnersSection')">
            <template #action>
              <UButton
                to="/partners"
                variant="soft"
                color="primary"
                size="sm"
                trailing-icon="bx:chevron-right"
              >
                {{ t("home.viewAllPartners") }}
              </UButton>
            </template>

            <HomeHorizontalRail
              :items="partners"
              :empty-label="t('home.emptyPartners')"
              :loading="partnersPending"
            >
              <template #skeleton>
                <PartnersPartnerCardSkeleton />
              </template>
              <template #item="{ item }">
                <PartnersPartnerCard
                  :partner="asPartnerCard(item)"
                  class="lg:mx-0.5"
                />
              </template>
            </HomeHorizontalRail>
          </HomeSectionShell>
        </div>
      </div>
    </div>
  </UContainer>
</template>
