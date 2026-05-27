<script setup lang="ts">
import type { PartnerCard } from "~/types/partner";

const { isLoggedIn } = useAuthSession();
const route = useRoute();
const { t } = useI18n();
const { assets } = useAssets();
const { assetIds, loading, loadSaveList } = useSaveList();
const { savedPartnerIds } = useSavedPartners();

// Fetch full partner cards for saved partners (most-recently-saved first).
const { data: savedPartnerData, pending: partnersPending } = await useAsyncData(
  "user-save-list:partners",
  () => $fetch<{ items: PartnerCard[] }>("/api/user/saved-partners"),
  { default: () => ({ items: [] as PartnerCard[] }) },
);

const savedAssets = computed(() => {
  const ids = new Set(assetIds.value);
  return assets.value.filter((asset) => ids.has(asset.id));
});

// Filter by live savedPartnerIds so unsaving a card removes it immediately.
const savedPartners = computed(() => {
  const ids = new Set(savedPartnerIds.value);
  return (savedPartnerData.value?.items ?? []).filter((p) => ids.has(p.id));
});

const isLoading = computed(() => loading.value || partnersPending.value);
const isEmpty = computed(
  () => savedAssets.value.length === 0 && savedPartners.value.length === 0,
);

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`);
  }
});

if (import.meta.client) {
  onMounted(() => {
    void loadSaveList({ force: true });
  });
}

useSeoMeta({ title: () => t("saveListPage.title") });
</script>

<template>
  <UContainer class="py-8">
    <div
      class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p class="text-sm font-semibold uppercase tracking-wide text-secondary">
          {{ t("saveListPage.eyebrow") }}
        </p>
        <h1 class="text-2xl font-bold text-default">
          {{ t("saveListPage.title") }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ t("saveListPage.description") }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          to="/product-rental"
          variant="soft"
          color="secondary"
          icon="bx:box"
        >
          {{ t("saveListPage.browseAssets") }}
        </UButton>
        <UButton
          to="/partners"
          variant="soft"
          color="primary"
          icon="bx:store-alt"
        >
          {{ t("saveListPage.browsePartners") }}
        </UButton>
      </div>
    </div>

    <div v-if="isLoading" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <ProductsCatalogCardSkeleton v-for="index in 6" :key="index" />
    </div>

    <UCard v-else-if="isEmpty" class="text-center">
      <div class="mx-auto max-w-md py-10">
        <UIcon name="bx:bookmark" class="mx-auto mb-3 size-12 text-muted" />
        <h2 class="text-lg font-semibold text-default">
          {{ t("saveListPage.emptyTitle") }}
        </h2>
        <p class="mt-2 text-sm text-muted">
          {{ t("saveListPage.emptyDescription") }}
        </p>
      </div>
    </UCard>

    <div v-else class="space-y-8">
      <section v-if="savedAssets.length" class="space-y-3">
        <h2 class="text-lg font-semibold text-default">
          {{ t("saveListPage.assetsTitle") }}
        </h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <ProductsAssetCard
            v-for="asset in savedAssets"
            :key="asset.id"
            :access="asset"
            :browse-to="`/asset/${asset.slug}`"
            hide-matches
          />
        </div>
      </section>

      <section v-if="savedPartners.length" class="space-y-3">
        <h2 class="text-lg font-semibold text-default">
          {{ t("saveListPage.partnersTitle") }}
        </h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <PartnersPartnerCard
            v-for="partner in savedPartners"
            :key="partner.id"
            :partner="partner"
          />
        </div>
      </section>
    </div>
  </UContainer>
</template>
