<script setup lang="ts">
import { getAdminApiErrorMessage } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["super_admin"],
});

type SelectOption = {
  value: string;
  label: string;
  status?: string;
  isHidden?: boolean;
};

type AdminBanner = {
  id: string;
  titleTh: string;
  titleEn: string;
  titleCn: string;
  titleJp: string;
  subtitleTh: string;
  subtitleEn: string;
  subtitleCn: string;
  subtitleJp: string;
  ctaLabelTh: string;
  ctaLabelEn: string;
  ctaLabelCn: string;
  ctaLabelJp: string;
  imageUrl: string;
  mobileImageUrl: string;
  linkUrl: string;
  linkTarget: "_blank" | "_self";
  sortOrder: number;
  isActive: boolean;
};

type AdminLinkCard = {
  id: string;
  sectionKey: "promotion" | "service";
  titleTh: string;
  titleEn: string;
  titleCn: string;
  titleJp: string;
  descriptionTh: string;
  descriptionEn: string;
  descriptionCn: string;
  descriptionJp: string;
  imageUrl: string;
  linkUrl: string;
  linkTarget: "_blank" | "_self";
  sortOrder: number;
  isActive: boolean;
};

type AdminFeaturedProduct = {
  id: string;
  productId: string;
  sortOrder: number;
  isActive: boolean;
  productLabel: string;
  productHidden: boolean;
};

type AdminFeaturedAsset = {
  id: string;
  assetId: string;
  sortOrder: number;
  isActive: boolean;
  assetLabel: string;
  assetHidden: boolean;
  assetStatus: string;
};

const toast = useToast();

const emptyBanner = (): Omit<AdminBanner, "id"> => ({
  titleTh: "",
  titleEn: "",
  titleCn: "",
  titleJp: "",
  subtitleTh: "",
  subtitleEn: "",
  subtitleCn: "",
  subtitleJp: "",
  ctaLabelTh: "",
  ctaLabelEn: "",
  ctaLabelCn: "",
  ctaLabelJp: "",
  imageUrl: "",
  mobileImageUrl: "",
  linkUrl: "/",
  linkTarget: "_self",
  sortOrder: 0,
  isActive: true,
});

const emptyLinkCard = (): Omit<AdminLinkCard, "id"> => ({
  sectionKey: "promotion",
  titleTh: "",
  titleEn: "",
  titleCn: "",
  titleJp: "",
  descriptionTh: "",
  descriptionEn: "",
  descriptionCn: "",
  descriptionJp: "",
  imageUrl: "",
  linkUrl: "/",
  linkTarget: "_self",
  sortOrder: 0,
  isActive: true,
});

const newBanner = reactive(emptyBanner());
const newLinkCard = reactive(emptyLinkCard());
const newFeaturedProduct = reactive({
  productId: "",
  sortOrder: 0,
  isActive: true,
});
const newFeaturedAsset = reactive({
  assetId: "",
  sortOrder: 0,
  isActive: true,
});

const { data, pending, error, refresh } = await useFetch<{
  banners: AdminBanner[];
  linkCards: AdminLinkCard[];
  featuredProducts: AdminFeaturedProduct[];
  featuredAssets: AdminFeaturedAsset[];
  productOptions: SelectOption[];
  assetOptions: SelectOption[];
}>("/api/admin/home-content", {
  key: "admin-home-content",
  default: () => ({
    banners: [],
    linkCards: [],
    featuredProducts: [],
    featuredAssets: [],
    productOptions: [],
    assetOptions: [],
  }),
});

const banners = ref<AdminBanner[]>([]);
const linkCards = ref<AdminLinkCard[]>([]);
const featuredProducts = ref<AdminFeaturedProduct[]>([]);
const featuredAssets = ref<AdminFeaturedAsset[]>([]);

watch(
  data,
  (value) => {
    banners.value = structuredClone(value?.banners ?? []);
    linkCards.value = structuredClone(value?.linkCards ?? []);
    featuredProducts.value = structuredClone(value?.featuredProducts ?? []);
    featuredAssets.value = structuredClone(value?.featuredAssets ?? []);

    if (!newFeaturedProduct.productId && value?.productOptions?.[0]) {
      newFeaturedProduct.productId = value.productOptions[0].value;
    }

    if (!newFeaturedAsset.assetId && value?.assetOptions?.[0]) {
      newFeaturedAsset.assetId = value.assetOptions[0].value;
    }
  },
  { immediate: true },
);

const promotionCards = computed(() =>
  linkCards.value.filter((item) => item.sectionKey === "promotion"),
);
const serviceCards = computed(() =>
  linkCards.value.filter((item) => item.sectionKey === "service"),
);

async function createResource(
  resource: string,
  body: Record<string, unknown>,
  successTitle: string,
) {
  try {
    await $fetch("/api/admin/home-content", {
      method: "POST",
      body: {
        resource,
        ...body,
      },
    });

    toast.add({
      title: successTitle,
      color: "success",
      icon: "bx:check-circle",
    });

    await refresh();
  } catch (resourceError) {
    toast.add({
      title: "Action failed",
      description: getAdminApiErrorMessage(resourceError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

async function saveResource(
  resource: string,
  body: Record<string, unknown>,
  successTitle: string,
) {
  try {
    await $fetch("/api/admin/home-content", {
      method: "PATCH",
      body: {
        resource,
        ...body,
      },
    });

    toast.add({
      title: successTitle,
      color: "success",
      icon: "bx:check-circle",
    });

    await refresh();
  } catch (resourceError) {
    toast.add({
      title: "Save failed",
      description: getAdminApiErrorMessage(resourceError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

function resetBannerForm() {
  Object.assign(newBanner, emptyBanner());
}

function resetLinkCardForm() {
  Object.assign(newLinkCard, emptyLinkCard());
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm text-muted">Admin / Home Content</p>
        <h2 class="text-2xl font-semibold">Homepage content</h2>
      </div>

      <UButton
        color="primary"
        variant="soft"
        icon="bx:refresh"
        :loading="pending"
        @click="refresh"
      >
        Refresh
      </UButton>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      title="Failed to load home content"
      :description="getAdminApiErrorMessage(error, 'Unknown admin error')"
    />

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <div class="space-y-6">
        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Hero banners</h3>
              <p class="text-sm text-muted">
                Fixed-height main banners for the top of Home.
              </p>
            </div>
          </template>

          <div v-if="banners.length === 0" class="py-6 text-sm text-muted">
            No banners yet.
          </div>

          <div v-else class="space-y-4">
            <UCard v-for="item in banners" :key="item.id" variant="subtle">
              <div class="space-y-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="Title (TH)">
                    <UInput v-model="item.titleTh" />
                  </UFormField>
                  <UFormField label="Title (EN)">
                    <UInput v-model="item.titleEn" />
                  </UFormField>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="Subtitle (TH)">
                    <UTextarea v-model="item.subtitleTh" :rows="2" />
                  </UFormField>
                  <UFormField label="Subtitle (EN)">
                    <UTextarea v-model="item.subtitleEn" :rows="2" />
                  </UFormField>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="CTA (TH)">
                    <UInput v-model="item.ctaLabelTh" />
                  </UFormField>
                  <UFormField label="CTA (EN)">
                    <UInput v-model="item.ctaLabelEn" />
                  </UFormField>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="Image URL">
                    <UInput v-model="item.imageUrl" />
                  </UFormField>
                  <UFormField label="Mobile image URL">
                    <UInput v-model="item.mobileImageUrl" />
                  </UFormField>
                </div>

                <div
                  class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_120px]"
                >
                  <UFormField label="Link URL">
                    <UInput v-model="item.linkUrl" />
                  </UFormField>
                  <UFormField label="Link target">
                    <USelectMenu
                      v-model="item.linkTarget"
                      :items="[
                        { label: 'Same tab', value: '_self' },
                        { label: 'New tab', value: '_blank' },
                      ]"
                      value-key="value"
                    />
                  </UFormField>
                  <UFormField label="Sort order">
                    <UInput
                      v-model.number="item.sortOrder"
                      type="number"
                      min="0"
                    />
                  </UFormField>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3">
                  <UCheckbox
                    v-model="item.isActive"
                    label="Active on homepage"
                  />

                  <UButton
                    color="primary"
                    variant="soft"
                    @click="saveResource('banner', item, 'Banner updated')"
                  >
                    Save banner
                  </UButton>
                </div>
              </div>
            </UCard>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Promotion cards</h3>
              <p class="text-sm text-muted">
                Horizontal card rail content for section 3.
              </p>
            </div>
          </template>

          <div
            v-if="promotionCards.length === 0"
            class="py-6 text-sm text-muted"
          >
            No promotion cards yet.
          </div>

          <div v-else class="space-y-4">
            <UCard
              v-for="item in promotionCards"
              :key="item.id"
              variant="subtle"
            >
              <div class="space-y-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="Title (TH)">
                    <UInput v-model="item.titleTh" />
                  </UFormField>
                  <UFormField label="Title (EN)">
                    <UInput v-model="item.titleEn" />
                  </UFormField>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="Description (TH)">
                    <UTextarea v-model="item.descriptionTh" :rows="2" />
                  </UFormField>
                  <UFormField label="Description (EN)">
                    <UTextarea v-model="item.descriptionEn" :rows="2" />
                  </UFormField>
                </div>

                <div
                  class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px_120px]"
                >
                  <UFormField label="Image URL">
                    <UInput v-model="item.imageUrl" />
                  </UFormField>
                  <UFormField label="Link URL">
                    <UInput v-model="item.linkUrl" />
                  </UFormField>
                  <UFormField label="Sort order">
                    <UInput
                      v-model.number="item.sortOrder"
                      type="number"
                      min="0"
                    />
                  </UFormField>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3">
                  <UCheckbox
                    v-model="item.isActive"
                    label="Active on homepage"
                  />

                  <UButton
                    color="primary"
                    variant="soft"
                    @click="
                      saveResource('linkCard', item, 'Promotion card updated')
                    "
                  >
                    Save card
                  </UButton>
                </div>
              </div>
            </UCard>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Service cards</h3>
              <p class="text-sm text-muted">Custom link cards for section 6.</p>
            </div>
          </template>

          <div v-if="serviceCards.length === 0" class="py-6 text-sm text-muted">
            No service cards yet.
          </div>

          <div v-else class="space-y-4">
            <UCard v-for="item in serviceCards" :key="item.id" variant="subtle">
              <div class="space-y-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="Title (TH)">
                    <UInput v-model="item.titleTh" />
                  </UFormField>
                  <UFormField label="Title (EN)">
                    <UInput v-model="item.titleEn" />
                  </UFormField>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="Description (TH)">
                    <UTextarea v-model="item.descriptionTh" :rows="2" />
                  </UFormField>
                  <UFormField label="Description (EN)">
                    <UTextarea v-model="item.descriptionEn" :rows="2" />
                  </UFormField>
                </div>

                <div
                  class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px_120px]"
                >
                  <UFormField label="Image URL">
                    <UInput v-model="item.imageUrl" />
                  </UFormField>
                  <UFormField label="Link URL">
                    <UInput v-model="item.linkUrl" />
                  </UFormField>
                  <UFormField label="Sort order">
                    <UInput
                      v-model.number="item.sortOrder"
                      type="number"
                      min="0"
                    />
                  </UFormField>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3">
                  <UCheckbox
                    v-model="item.isActive"
                    label="Active on homepage"
                  />

                  <UButton
                    color="primary"
                    variant="soft"
                    @click="
                      saveResource('linkCard', item, 'Service card updated')
                    "
                  >
                    Save card
                  </UButton>
                </div>
              </div>
            </UCard>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Featured product rail</h3>
              <p class="text-sm text-muted">
                Super-admin curated cards for homepage section 5.
              </p>
            </div>
          </template>

          <div
            v-if="featuredProducts.length === 0"
            class="py-6 text-sm text-muted"
          >
            No featured products yet.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="item in featuredProducts"
              :key="item.id"
              class="flex flex-col gap-3 rounded-xl border border-default p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p class="font-medium">{{ item.productLabel }}</p>
                <p class="text-sm text-muted">
                  Hidden: {{ item.productHidden ? "Yes" : "No" }}
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <UInput
                  v-model.number="item.sortOrder"
                  type="number"
                  min="0"
                  class="w-28"
                />
                <UCheckbox v-model="item.isActive" label="Active" />
                <UButton
                  size="sm"
                  color="primary"
                  variant="soft"
                  @click="
                    saveResource(
                      'featuredProduct',
                      item,
                      'Featured product updated',
                    )
                  "
                >
                  Save
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Featured asset rail</h3>
              <p class="text-sm text-muted">
                Super-admin curated cards for homepage section 4.
              </p>
            </div>
          </template>

          <div
            v-if="featuredAssets.length === 0"
            class="py-6 text-sm text-muted"
          >
            No featured assets yet.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="item in featuredAssets"
              :key="item.id"
              class="flex flex-col gap-3 rounded-xl border border-default p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p class="font-medium">{{ item.assetLabel }}</p>
                <p class="text-sm text-muted">
                  Status: {{ item.assetStatus }} · Hidden:
                  {{ item.assetHidden ? "Yes" : "No" }}
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <UInput
                  v-model.number="item.sortOrder"
                  type="number"
                  min="0"
                  class="w-28"
                />
                <UCheckbox v-model="item.isActive" label="Active" />
                <UButton
                  size="sm"
                  color="secondary"
                  variant="soft"
                  @click="
                    saveResource(
                      'featuredAsset',
                      item,
                      'Featured asset updated',
                    )
                  "
                >
                  Save
                </UButton>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <div class="space-y-6">
        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Create banner</h3>
              <p class="text-sm text-muted">Add a new hero slide.</p>
            </div>
          </template>

          <form
            class="space-y-4"
            @submit.prevent="
              createResource('banner', newBanner, 'Banner created');
              resetBannerForm();
            "
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Title (TH)" required>
                <UInput v-model="newBanner.titleTh" />
              </UFormField>
              <UFormField label="Title (EN)" required>
                <UInput v-model="newBanner.titleEn" />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Subtitle (TH)" required>
                <UTextarea v-model="newBanner.subtitleTh" :rows="2" />
              </UFormField>
              <UFormField label="Subtitle (EN)" required>
                <UTextarea v-model="newBanner.subtitleEn" :rows="2" />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="CTA (TH)" required>
                <UInput v-model="newBanner.ctaLabelTh" />
              </UFormField>
              <UFormField label="CTA (EN)" required>
                <UInput v-model="newBanner.ctaLabelEn" />
              </UFormField>
            </div>

            <UFormField label="Image URL" required>
              <UInput v-model="newBanner.imageUrl" />
            </UFormField>

            <UFormField label="Mobile image URL">
              <UInput v-model="newBanner.mobileImageUrl" />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
              <UFormField label="Link URL" required>
                <UInput v-model="newBanner.linkUrl" />
              </UFormField>
              <UFormField label="Sort order">
                <UInput
                  v-model.number="newBanner.sortOrder"
                  type="number"
                  min="0"
                />
              </UFormField>
            </div>

            <UCheckbox
              v-model="newBanner.isActive"
              label="Active on homepage"
            />

            <div class="flex gap-2">
              <UButton type="submit" color="primary">Create banner</UButton>
              <UButton
                type="button"
                variant="soft"
                color="neutral"
                @click="resetBannerForm"
              >
                Reset
              </UButton>
            </div>
          </form>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">
                Create promotion / service card
              </h3>
              <p class="text-sm text-muted">
                Add a new horizontal card for section 3 or 6.
              </p>
            </div>
          </template>

          <form
            class="space-y-4"
            @submit.prevent="
              createResource('linkCard', newLinkCard, 'Link card created');
              resetLinkCardForm();
            "
          >
            <UFormField label="Section" required>
              <USelectMenu
                v-model="newLinkCard.sectionKey"
                :items="[
                  { label: 'Promotion', value: 'promotion' },
                  { label: 'Service', value: 'service' },
                ]"
                value-key="value"
              />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Title (TH)" required>
                <UInput v-model="newLinkCard.titleTh" />
              </UFormField>
              <UFormField label="Title (EN)" required>
                <UInput v-model="newLinkCard.titleEn" />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Description (TH)" required>
                <UTextarea v-model="newLinkCard.descriptionTh" :rows="2" />
              </UFormField>
              <UFormField label="Description (EN)" required>
                <UTextarea v-model="newLinkCard.descriptionEn" :rows="2" />
              </UFormField>
            </div>

            <UFormField label="Image URL" required>
              <UInput v-model="newLinkCard.imageUrl" />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
              <UFormField label="Link URL" required>
                <UInput v-model="newLinkCard.linkUrl" />
              </UFormField>
              <UFormField label="Sort order">
                <UInput
                  v-model.number="newLinkCard.sortOrder"
                  type="number"
                  min="0"
                />
              </UFormField>
            </div>

            <UCheckbox
              v-model="newLinkCard.isActive"
              label="Active on homepage"
            />

            <div class="flex gap-2">
              <UButton type="submit" color="primary">Create link card</UButton>
              <UButton
                type="button"
                variant="soft"
                color="neutral"
                @click="resetLinkCardForm"
              >
                Reset
              </UButton>
            </div>
          </form>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Add featured product</h3>
              <p class="text-sm text-muted">Curate section 5 for Home.</p>
            </div>
          </template>

          <form
            class="space-y-4"
            @submit.prevent="
              createResource(
                'featuredProduct',
                newFeaturedProduct,
                'Featured product added',
              )
            "
          >
            <UFormField label="Product" required>
              <USelectMenu
                v-model="newFeaturedProduct.productId"
                :items="data?.productOptions ?? []"
                value-key="value"
              />
            </UFormField>

            <UFormField label="Sort order">
              <UInput
                v-model.number="newFeaturedProduct.sortOrder"
                type="number"
                min="0"
              />
            </UFormField>

            <UCheckbox
              v-model="newFeaturedProduct.isActive"
              label="Active on homepage"
            />

            <UButton type="submit" color="primary"
              >Add featured product</UButton
            >
          </form>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Add featured asset</h3>
              <p class="text-sm text-muted">Curate section 4 for Home.</p>
            </div>
          </template>

          <form
            class="space-y-4"
            @submit.prevent="
              createResource(
                'featuredAsset',
                newFeaturedAsset,
                'Featured asset added',
              )
            "
          >
            <UFormField label="Asset" required>
              <USelectMenu
                v-model="newFeaturedAsset.assetId"
                :items="data?.assetOptions ?? []"
                value-key="value"
              />
            </UFormField>

            <UFormField label="Sort order">
              <UInput
                v-model.number="newFeaturedAsset.sortOrder"
                type="number"
                min="0"
              />
            </UFormField>

            <UCheckbox
              v-model="newFeaturedAsset.isActive"
              label="Active on homepage"
            />

            <UButton type="submit" color="secondary"
              >Add featured asset</UButton
            >
          </form>
        </UCard>
      </div>
    </div>
  </div>
</template>
