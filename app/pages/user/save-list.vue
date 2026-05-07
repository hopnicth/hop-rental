<script setup lang="ts">
const { isLoggedIn } = useAuthSession();
const { t } = useI18n();
const { assets } = useAssets();
const { fetchContentPages } = useContentPages();
const { assetIds, serviceIds, loading, loadSaveList } = useSaveList();

const { data: servicePages, pending: servicesPending } = await useAsyncData(
  "user-save-list:services",
  () => fetchContentPages("service"),
  { default: () => [] },
);

const savedAssets = computed(() => {
  const ids = new Set(assetIds.value);
  return assets.value.filter((asset) => ids.has(asset.id));
});

const savedServices = computed(() => {
  const ids = new Set(serviceIds.value);
  return servicePages.value.filter((page) => ids.has(page.id));
});

const isLoading = computed(() => loading.value || servicesPending.value);
const isEmpty = computed(
  () => savedAssets.value.length === 0 && savedServices.value.length === 0,
);

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo("/user/login");
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
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
        <UButton to="/product-rental" variant="soft" color="secondary" icon="bx:box">
          {{ t("saveListPage.browseAssets") }}
        </UButton>
        <UButton to="/services" variant="soft" color="primary" icon="bx:briefcase">
          {{ t("saveListPage.browseServices") }}
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

      <section v-if="savedServices.length" class="space-y-3">
        <h2 class="text-lg font-semibold text-default">
          {{ t("saveListPage.servicesTitle") }}
        </h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <ContentPageCard
            v-for="page in savedServices"
            :key="page.id"
            :page="page"
          />
        </div>
      </section>
    </div>
  </UContainer>
</template>