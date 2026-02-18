<script setup lang="ts">
import ProductFilterForm from "~/components/products/ProductFilterForm.vue";
import RentalFilterForm from "~/components/products/RentalFilterForm.vue";

const { t } = useI18n();

/** Tab items for Sale / Rental */
const tabs = computed(() => [
  { label: t("productPage.sale"), value: "sale" },
  { label: t("productPage.rental"), value: "rental" },
]);

/** Currently active tab */
const activeTab = ref("sale");

/** Mobile: toggle filter panel open/close */
const mobileOpen = ref(false);
</script>

<template>
  <!-- ── Desktop: always visible sidebar ── -->
  <UCard class="hidden lg:block" :ui="{ body: 'p-0' }">
    <template #header>
      <h3 class="text-sm font-semibold">
        {{ t("productPage.searchAndFilter") }}
      </h3>
    </template>

    <UTabs
      v-model="activeTab"
      :items="tabs"
      value-key="value"
      class="w-full"
      :content="false"
    />

    <!-- Filter body — switches by active tab -->
    <ProductFilterForm v-if="activeTab === 'sale'" />
    <RentalFilterForm v-else />
  </UCard>

  <!-- ── Mobile: collapsible button + panel ── -->
  <div class="lg:hidden">
    <UButton
      block
      color="neutral"
      variant="soft"
      icon="bx:filter-alt"
      :label="t('productPage.filter')"
      @click="mobileOpen = !mobileOpen"
    />

    <UCard v-if="mobileOpen" class="mt-2" :ui="{ body: 'p-0' }">
      <UTabs
        v-model="activeTab"
        :items="tabs"
        value-key="value"
        class="w-full"
        :content="false"
      />

      <ProductFilterForm v-if="activeTab === 'sale'" />
      <RentalFilterForm v-else />
    </UCard>
  </div>
</template>

