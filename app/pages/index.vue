<script setup lang="ts">
import HopBanner from "~/components/banner/HopBanner.vue";
import HopFeatureBar from "~/components/featurebar/HopFeatureBar.vue";
import MobileFloatingPanel from "~/components/mobile/MobileFloatingPanel.vue";
import CategoriesCard from "~/components/categories_card/CategoriesCard.vue";
import HopPartnerSlide from "~/components/partners/HopPartnerSlide.vue";

const { t } = useI18n();
const isCategoryPanelOpen = ref(false);
</script>

<template>
  <UContainer class="py-4 sm:py-6">
    <div class="grid grid-cols-12 gap-4 lg:gap-6">
      <div class="hidden lg:block lg:col-span-3">
        <CategoriesCard />
      </div>

      <div class="col-span-12 lg:col-span-9 flex-row justify-center">
        <div class="mb-10">
          <HopBanner />
        </div>
        <div class="pa-3">
          <HopFeatureBar />
        </div>
        <div class="mt-10 pa-5">
          <HopPartnerSlide />
        </div>
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
