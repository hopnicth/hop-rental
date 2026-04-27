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

type AdminPartnerLogo = {
  id: string;
  name: string;
  imageUrl: string;
  linkUrl: string;
  linkTarget: "_blank" | "_self";
  sortOrder: number;
  isActive: boolean;
};

type HomeContentResource =
  | "banner"
  | "linkCard"
  | "featuredProduct"
  | "featuredAsset"
  | "partnerLogo";

type HomeUploadKind = "banner" | "banner-mobile" | "link-card" | "partner-logo";
type UploadField = "imageUrl" | "mobileImageUrl";
type ImageUploadTarget = { imageUrl: string; mobileImageUrl?: string };
type QuickUploadState = { kind: HomeUploadKind; imageUrl: string };

const toast = useToast();
const FEATURED_HOME_LIMIT = 15;

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

const emptyPartnerLogo = (): Omit<AdminPartnerLogo, "id"> => ({
  name: "",
  imageUrl: "",
  linkUrl: "/product-all",
  linkTarget: "_self",
  sortOrder: 0,
  isActive: true,
});

const newBanner = reactive(emptyBanner());
const newLinkCard = reactive(emptyLinkCard());
const newPartnerLogo = reactive(emptyPartnerLogo());
const quickUpload = reactive<QuickUploadState>({
  kind: "banner",
  imageUrl: "",
});
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
  partnerLogos: AdminPartnerLogo[];
  productOptions: SelectOption[];
  assetOptions: SelectOption[];
}>("/api/admin/home-content", {
  key: "admin-home-content",
  default: () => ({
    banners: [],
    linkCards: [],
    featuredProducts: [],
    featuredAssets: [],
    partnerLogos: [],
    productOptions: [],
    assetOptions: [],
  }),
});

const banners = ref<AdminBanner[]>([]);
const linkCards = ref<AdminLinkCard[]>([]);
const featuredProducts = ref<AdminFeaturedProduct[]>([]);
const featuredAssets = ref<AdminFeaturedAsset[]>([]);
const partnerLogos = ref<AdminPartnerLogo[]>([]);
const uploadStates = reactive<Record<string, boolean>>({});
const dragStates = reactive<Record<string, boolean>>({});
const STANDARD_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const PARTNER_LOGO_ACCEPT = `${STANDARD_IMAGE_ACCEPT},image/svg+xml`;

watch(
  data,
  (value) => {
    banners.value = structuredClone(value?.banners ?? []);
    linkCards.value = structuredClone(value?.linkCards ?? []);
    featuredProducts.value = structuredClone(value?.featuredProducts ?? []);
    featuredAssets.value = structuredClone(value?.featuredAssets ?? []);
    partnerLogos.value = structuredClone(value?.partnerLogos ?? []);

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
const canAddFeaturedProducts = computed(
  () => featuredProducts.value.length < FEATURED_HOME_LIMIT,
);
const canAddFeaturedAssets = computed(
  () => featuredAssets.value.length < FEATURED_HOME_LIMIT,
);

async function createResource(
  resource: HomeContentResource,
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
  resource: HomeContentResource,
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

async function deleteResource(
  resource: HomeContentResource,
  id: string,
  successTitle: string,
  confirmMessage: string,
) {
  if (!confirm(confirmMessage)) return;

  try {
    await $fetch(
      `/api/admin/home-content/${resource}/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );

    toast.add({
      title: successTitle,
      color: "success",
      icon: "bx:check-circle",
    });

    await refresh();
  } catch (resourceError) {
    toast.add({
      title: "Delete failed",
      description: getAdminApiErrorMessage(resourceError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

function isUploading(key: string) {
  return uploadStates[key] === true;
}

function isDragActive(key: string) {
  return dragStates[key] === true;
}

function setDragActive(key: string, value: boolean) {
  dragStates[key] = value;
}

function uploadAcceptFor(kind: HomeUploadKind) {
  return kind === "partner-logo" ? PARTNER_LOGO_ACCEPT : STANDARD_IMAGE_ACCEPT;
}

async function uploadFileToField(
  file: File,
  target: ImageUploadTarget,
  field: UploadField,
  key: string,
  kind: HomeUploadKind,
) {
  uploadStates[key] = true;

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);

    const result = await $fetch<{ url: string }>(
      "/api/admin/home-content/upload",
      {
        method: "POST",
        body: formData,
      },
    );

    target[field] = result.url;
    toast.add({
      title: "Image uploaded",
      color: "success",
      icon: "bx:image-add",
    });
  } catch (uploadError) {
    toast.add({
      title: "Upload failed",
      description: getAdminApiErrorMessage(uploadError, "Unknown upload error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    uploadStates[key] = false;
  }
}

async function uploadIntoField(
  event: Event,
  target: ImageUploadTarget,
  field: UploadField,
  key: string,
  kind: HomeUploadKind,
) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  await uploadFileToField(file, target, field, key, kind);
  if (input) input.value = "";
}

async function dropIntoField(
  event: DragEvent,
  target: ImageUploadTarget,
  field: UploadField,
  key: string,
  kind: HomeUploadKind,
) {
  setDragActive(key, false);
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  await uploadFileToField(file, target, field, key, kind);
}

function resetBannerForm() {
  Object.assign(newBanner, emptyBanner());
}

function resetLinkCardForm() {
  Object.assign(newLinkCard, emptyLinkCard());
}

function resetPartnerLogoForm() {
  Object.assign(newPartnerLogo, emptyPartnerLogo());
}

function resetQuickUpload() {
  quickUpload.kind = "banner";
  quickUpload.imageUrl = "";
}

function useQuickUploadForPartnerLogo() {
  if (!quickUpload.imageUrl) return;
  newPartnerLogo.imageUrl = quickUpload.imageUrl;
  quickUpload.kind = "partner-logo";
  toast.add({
    title: "Partner logo form updated",
    color: "success",
    icon: "bx:check-circle",
  });
}

async function deleteUploadedHomeFile(url: string, successTitle: string) {
  if (!url) return false;
  if (!confirm("Delete this uploaded file from home media storage?")) {
    return false;
  }

  try {
    await $fetch("/api/admin/home-content/upload", {
      method: "DELETE",
      body: { url },
    });
    toast.add({
      title: successTitle,
      color: "success",
      icon: "bx:trash",
    });
    return true;
  } catch (deleteError) {
    toast.add({
      title: "Delete failed",
      description: getAdminApiErrorMessage(deleteError, "Unknown delete error"),
      color: "error",
      icon: "bx:error-circle",
    });
    return false;
  }
}

async function deleteQuickUpload() {
  const deleted = await deleteUploadedHomeFile(
    quickUpload.imageUrl,
    "Uploaded image deleted",
  );
  if (deleted) {
    resetQuickUpload();
  }
}

async function copyText(value: string, successTitle: string) {
  if (!value || !import.meta.client) return;

  try {
    await navigator.clipboard.writeText(value);
    toast.add({
      title: successTitle,
      color: "success",
      icon: "bx:copy",
    });
  } catch (copyError) {
    toast.add({
      title: "Copy failed",
      description: getAdminApiErrorMessage(copyError, "Clipboard unavailable"),
      color: "error",
      icon: "bx:error-circle",
    });
  }
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
                Fixed-height main banners for the top of Home with upload
                support.
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
                  <div class="space-y-2">
                    <UFormField label="Image URL">
                      <UInput v-model="item.imageUrl" />
                    </UFormField>
                    <input
                      :accept="uploadAcceptFor('banner')"
                      class="block w-full text-sm text-muted"
                      type="file"
                      :disabled="isUploading(`banner:${item.id}:imageUrl`)"
                      @change="
                        uploadIntoField(
                          $event,
                          item,
                          'imageUrl',
                          `banner:${item.id}:imageUrl`,
                          'banner',
                        )
                      "
                    />
                    <img
                      v-if="item.imageUrl"
                      :src="item.imageUrl"
                      alt="Banner preview"
                      class="h-28 w-full rounded-xl border border-default object-cover"
                    />
                  </div>
                  <div class="space-y-2">
                    <UFormField label="Mobile image URL">
                      <UInput v-model="item.mobileImageUrl" />
                    </UFormField>
                    <input
                      :accept="uploadAcceptFor('banner-mobile')"
                      class="block w-full text-sm text-muted"
                      type="file"
                      :disabled="
                        isUploading(`banner:${item.id}:mobileImageUrl`)
                      "
                      @change="
                        uploadIntoField(
                          $event,
                          item,
                          'mobileImageUrl',
                          `banner:${item.id}:mobileImageUrl`,
                          'banner-mobile',
                        )
                      "
                    />
                    <img
                      v-if="item.mobileImageUrl"
                      :src="item.mobileImageUrl"
                      alt="Mobile banner preview"
                      class="h-28 w-full rounded-xl border border-default object-cover"
                    />
                  </div>
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

                  <div class="flex flex-wrap gap-2">
                    <UButton
                      color="primary"
                      variant="soft"
                      @click="saveResource('banner', item, 'Banner updated')"
                    >
                      Save banner
                    </UButton>
                    <UButton
                      color="error"
                      variant="soft"
                      @click="
                        deleteResource(
                          'banner',
                          item.id,
                          'Banner deleted',
                          `Delete banner ${item.titleEn || item.titleTh || item.id}?`,
                        )
                      "
                    >
                      Delete
                    </UButton>
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Partner logo rail</h3>
              <p class="text-sm text-muted">
                Rotating homepage logo marquee managed by super admin.
              </p>
            </div>
          </template>

          <div v-if="partnerLogos.length === 0" class="py-6 text-sm text-muted">
            No partner logos yet.
          </div>

          <div v-else class="space-y-4">
            <UCard v-for="item in partnerLogos" :key="item.id" variant="subtle">
              <div class="space-y-4">
                <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <img
                    v-if="item.imageUrl"
                    :src="item.imageUrl"
                    :alt="item.name"
                    class="h-20 w-40 rounded-xl border border-default bg-white object-contain p-3"
                  />
                  <div class="grid flex-1 gap-4 sm:grid-cols-2">
                    <UFormField label="Brand name">
                      <UInput v-model="item.name" />
                    </UFormField>
                    <UFormField label="Link URL">
                      <UInput v-model="item.linkUrl" />
                    </UFormField>
                  </div>
                </div>

                <div
                  class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_120px]"
                >
                  <div class="space-y-2">
                    <UFormField label="Image URL">
                      <UInput v-model="item.imageUrl" />
                    </UFormField>
                    <label
                      class="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-4 text-center transition"
                      :class="
                        isDragActive(`partnerLogo:${item.id}:imageUrl`)
                          ? 'border-primary bg-primary/5'
                          : 'border-default hover:border-primary/60'
                      "
                      @dragenter.prevent="
                        setDragActive(`partnerLogo:${item.id}:imageUrl`, true)
                      "
                      @dragover.prevent="
                        setDragActive(`partnerLogo:${item.id}:imageUrl`, true)
                      "
                      @dragleave.prevent="
                        setDragActive(`partnerLogo:${item.id}:imageUrl`, false)
                      "
                      @drop.prevent="
                        dropIntoField(
                          $event,
                          item,
                          'imageUrl',
                          `partnerLogo:${item.id}:imageUrl`,
                          'partner-logo',
                        )
                      "
                    >
                      <input
                        :accept="uploadAcceptFor('partner-logo')"
                        class="hidden"
                        type="file"
                        :disabled="
                          isUploading(`partnerLogo:${item.id}:imageUrl`)
                        "
                        @change="
                          uploadIntoField(
                            $event,
                            item,
                            'imageUrl',
                            `partnerLogo:${item.id}:imageUrl`,
                            'partner-logo',
                          )
                        "
                      />
                      <span class="text-sm font-medium text-default">
                        Drop logo here or click to replace
                      </span>
                      <span class="mt-1 text-xs text-muted">
                        Optimized for prepared partner logos.
                      </span>
                    </label>
                    <p
                      v-if="isUploading(`partnerLogo:${item.id}:imageUrl`)"
                      class="text-xs text-muted"
                    >
                      Uploading logo...
                    </p>
                  </div>
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

                  <div class="flex flex-wrap gap-2">
                    <UButton
                      color="primary"
                      variant="soft"
                      @click="
                        saveResource(
                          'partnerLogo',
                          item,
                          'Partner logo updated',
                        )
                      "
                    >
                      Save logo
                    </UButton>
                    <UButton
                      color="error"
                      variant="soft"
                      @click="
                        deleteResource(
                          'partnerLogo',
                          item.id,
                          'Partner logo deleted',
                          `Delete partner logo ${item.name}?`,
                        )
                      "
                    >
                      Delete
                    </UButton>
                  </div>
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
                  class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_120px]"
                >
                  <div class="space-y-2">
                    <UFormField label="Image URL">
                      <UInput v-model="item.imageUrl" />
                    </UFormField>
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      class="block w-full text-sm text-muted"
                      type="file"
                      :disabled="isUploading(`linkCard:${item.id}:imageUrl`)"
                      @change="
                        uploadIntoField(
                          $event,
                          item,
                          'imageUrl',
                          `linkCard:${item.id}:imageUrl`,
                          'link-card',
                        )
                      "
                    />
                    <img
                      v-if="item.imageUrl"
                      :src="item.imageUrl"
                      alt="Promotion card preview"
                      class="h-24 w-full rounded-xl border border-default object-cover"
                    />
                  </div>
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

                  <div class="flex flex-wrap gap-2">
                    <UButton
                      color="primary"
                      variant="soft"
                      @click="
                        saveResource('linkCard', item, 'Promotion card updated')
                      "
                    >
                      Save card
                    </UButton>
                    <UButton
                      color="error"
                      variant="soft"
                      @click="
                        deleteResource(
                          'linkCard',
                          item.id,
                          'Promotion card deleted',
                          `Delete promotion card ${item.titleEn || item.titleTh || item.id}?`,
                        )
                      "
                    >
                      Delete
                    </UButton>
                  </div>
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
                  class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_120px]"
                >
                  <div class="space-y-2">
                    <UFormField label="Image URL">
                      <UInput v-model="item.imageUrl" />
                    </UFormField>
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      class="block w-full text-sm text-muted"
                      type="file"
                      :disabled="isUploading(`linkCard:${item.id}:imageUrl`)"
                      @change="
                        uploadIntoField(
                          $event,
                          item,
                          'imageUrl',
                          `linkCard:${item.id}:imageUrl`,
                          'link-card',
                        )
                      "
                    />
                    <img
                      v-if="item.imageUrl"
                      :src="item.imageUrl"
                      alt="Service card preview"
                      class="h-24 w-full rounded-xl border border-default object-cover"
                    />
                  </div>
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

                  <div class="flex flex-wrap gap-2">
                    <UButton
                      color="primary"
                      variant="soft"
                      @click="
                        saveResource('linkCard', item, 'Service card updated')
                      "
                    >
                      Save card
                    </UButton>
                    <UButton
                      color="error"
                      variant="soft"
                      @click="
                        deleteResource(
                          'linkCard',
                          item.id,
                          'Service card deleted',
                          `Delete service card ${item.titleEn || item.titleTh || item.id}?`,
                        )
                      "
                    >
                      Delete
                    </UButton>
                  </div>
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
                {{ featuredProducts.length }} / {{ FEATURED_HOME_LIMIT }}
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
                <UButton
                  size="sm"
                  color="error"
                  variant="soft"
                  @click="
                    deleteResource(
                      'featuredProduct',
                      item.id,
                      'Featured product removed',
                      `Remove featured product ${item.productLabel}?`,
                    )
                  "
                >
                  Delete
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
                {{ featuredAssets.length }} / {{ FEATURED_HOME_LIMIT }}
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
                <UButton
                  size="sm"
                  color="error"
                  variant="soft"
                  @click="
                    deleteResource(
                      'featuredAsset',
                      item.id,
                      'Featured asset removed',
                      `Remove featured asset ${item.assetLabel}?`,
                    )
                  "
                >
                  Delete
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
              <h3 class="text-lg font-semibold">Upload image</h3>
              <p class="text-sm text-muted">
                Upload first, then copy the generated URL for banners, cards, or
                partner logos.
              </p>
            </div>
          </template>

          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <UFormField label="Upload type">
                <USelectMenu
                  v-model="quickUpload.kind"
                  :items="[
                    { label: 'Banner', value: 'banner' },
                    { label: 'Banner (mobile)', value: 'banner-mobile' },
                    { label: 'Link card', value: 'link-card' },
                    { label: 'Partner logo', value: 'partner-logo' },
                  ]"
                  value-key="value"
                />
              </UFormField>

              <div class="space-y-2">
                <label
                  class="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition"
                  :class="
                    isDragActive('quick-upload:imageUrl')
                      ? 'border-primary bg-primary/5'
                      : 'border-default hover:border-primary/60'
                  "
                  @dragenter.prevent="
                    setDragActive('quick-upload:imageUrl', true)
                  "
                  @dragover.prevent="
                    setDragActive('quick-upload:imageUrl', true)
                  "
                  @dragleave.prevent="
                    setDragActive('quick-upload:imageUrl', false)
                  "
                  @drop.prevent="
                    dropIntoField(
                      $event,
                      quickUpload,
                      'imageUrl',
                      'quick-upload:imageUrl',
                      quickUpload.kind,
                    )
                  "
                >
                  <input
                    :accept="uploadAcceptFor(quickUpload.kind)"
                    class="hidden"
                    type="file"
                    :disabled="isUploading('quick-upload:imageUrl')"
                    @change="
                      uploadIntoField(
                        $event,
                        quickUpload,
                        'imageUrl',
                        'quick-upload:imageUrl',
                        quickUpload.kind,
                      )
                    "
                  />
                  <span class="text-sm font-medium text-default">
                    Drop image here or click to browse
                  </span>
                  <span class="mt-1 text-xs text-muted">
                    Best for reusable Home URLs before filling forms below.
                  </span>
                </label>
                <p
                  v-if="isUploading('quick-upload:imageUrl')"
                  class="text-xs text-muted"
                >
                  Uploading image...
                </p>
                <p class="text-xs text-muted">
                  Supported: JPG, PNG, WebP. File will be processed and stored
                  in home media storage.
                </p>
              </div>
            </div>

            <div
              v-if="quickUpload.imageUrl"
              class="space-y-3 rounded-xl border border-default p-4"
            >
              <img
                :src="quickUpload.imageUrl"
                alt="Uploaded image preview"
                class="h-40 w-full rounded-xl border border-default bg-white object-contain p-3"
              />

              <UFormField label="Uploaded URL">
                <UInput v-model="quickUpload.imageUrl" readonly />
              </UFormField>

              <div class="flex flex-wrap gap-2">
                <UButton
                  type="button"
                  color="primary"
                  variant="soft"
                  icon="bx:copy"
                  @click="copyText(quickUpload.imageUrl, 'Upload URL copied')"
                >
                  Copy URL
                </UButton>
                <UButton
                  v-if="quickUpload.kind === 'partner-logo'"
                  type="button"
                  color="secondary"
                  variant="soft"
                  @click="useQuickUploadForPartnerLogo"
                >
                  Use in partner logo form
                </UButton>
                <UButton
                  type="button"
                  color="error"
                  variant="soft"
                  icon="bx:trash"
                  @click="deleteQuickUpload"
                >
                  Delete file
                </UButton>
                <UButton
                  type="button"
                  color="neutral"
                  variant="soft"
                  @click="resetQuickUpload"
                >
                  Clear
                </UButton>
              </div>
            </div>

            <div
              v-else
              class="rounded-xl border border-dashed border-default px-4 py-6 text-sm text-muted"
            >
              No image uploaded yet. Use this section when you want a reusable
              URL before filling any content form below.
            </div>
          </div>
        </UCard>

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

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <UFormField label="Image URL" required>
                  <UInput v-model="newBanner.imageUrl" />
                </UFormField>
                <input
                  :accept="uploadAcceptFor('banner')"
                  class="block w-full text-sm text-muted"
                  type="file"
                  :disabled="isUploading('banner:new:imageUrl')"
                  @change="
                    uploadIntoField(
                      $event,
                      newBanner,
                      'imageUrl',
                      'banner:new:imageUrl',
                      'banner',
                    )
                  "
                />
                <img
                  v-if="newBanner.imageUrl"
                  :src="newBanner.imageUrl"
                  alt="New banner preview"
                  class="h-28 w-full rounded-xl border border-default object-cover"
                />
              </div>

              <div class="space-y-2">
                <UFormField label="Mobile image URL">
                  <UInput v-model="newBanner.mobileImageUrl" />
                </UFormField>
                <input
                  :accept="uploadAcceptFor('banner-mobile')"
                  class="block w-full text-sm text-muted"
                  type="file"
                  :disabled="isUploading('banner:new:mobileImageUrl')"
                  @change="
                    uploadIntoField(
                      $event,
                      newBanner,
                      'mobileImageUrl',
                      'banner:new:mobileImageUrl',
                      'banner-mobile',
                    )
                  "
                />
                <img
                  v-if="newBanner.mobileImageUrl"
                  :src="newBanner.mobileImageUrl"
                  alt="New mobile banner preview"
                  class="h-28 w-full rounded-xl border border-default object-cover"
                />
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_120px]">
              <UFormField label="Link URL" required>
                <UInput v-model="newBanner.linkUrl" />
              </UFormField>
              <UFormField label="Link target">
                <USelectMenu
                  v-model="newBanner.linkTarget"
                  :items="[
                    { label: 'Same tab', value: '_self' },
                    { label: 'New tab', value: '_blank' },
                  ]"
                  value-key="value"
                />
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

            <div class="space-y-2">
              <UFormField label="Image URL" required>
                <UInput v-model="newLinkCard.imageUrl" />
              </UFormField>
              <input
                accept="image/jpeg,image/png,image/webp"
                class="block w-full text-sm text-muted"
                type="file"
                :disabled="isUploading('linkCard:new:imageUrl')"
                @change="
                  uploadIntoField(
                    $event,
                    newLinkCard,
                    'imageUrl',
                    'linkCard:new:imageUrl',
                    'link-card',
                  )
                "
              />
              <img
                v-if="newLinkCard.imageUrl"
                :src="newLinkCard.imageUrl"
                alt="New link card preview"
                class="h-28 w-full rounded-xl border border-default object-cover"
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_120px]">
              <UFormField label="Link URL" required>
                <UInput v-model="newLinkCard.linkUrl" />
              </UFormField>
              <UFormField label="Link target">
                <USelectMenu
                  v-model="newLinkCard.linkTarget"
                  :items="[
                    { label: 'Same tab', value: '_self' },
                    { label: 'New tab', value: '_blank' },
                  ]"
                  value-key="value"
                />
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
              <h3 class="text-lg font-semibold">Add partner logo</h3>
              <p class="text-sm text-muted">
                Create or upload a logo for the homepage marquee.
              </p>
            </div>
          </template>

          <form
            class="space-y-4"
            @submit.prevent="
              createResource(
                'partnerLogo',
                newPartnerLogo,
                'Partner logo created',
              );
              resetPartnerLogoForm();
            "
          >
            <UFormField label="Brand name" required>
              <UInput v-model="newPartnerLogo.name" />
            </UFormField>

            <div class="space-y-2">
              <UFormField label="Image URL" required>
                <UInput v-model="newPartnerLogo.imageUrl" />
              </UFormField>
              <label
                class="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition"
                :class="
                  isDragActive('partnerLogo:new:imageUrl')
                    ? 'border-primary bg-primary/5'
                    : 'border-default hover:border-primary/60'
                "
                @dragenter.prevent="
                  setDragActive('partnerLogo:new:imageUrl', true)
                "
                @dragover.prevent="
                  setDragActive('partnerLogo:new:imageUrl', true)
                "
                @dragleave.prevent="
                  setDragActive('partnerLogo:new:imageUrl', false)
                "
                @drop.prevent="
                  dropIntoField(
                    $event,
                    newPartnerLogo,
                    'imageUrl',
                    'partnerLogo:new:imageUrl',
                    'partner-logo',
                  )
                "
              >
                <input
                  :accept="uploadAcceptFor('partner-logo')"
                  class="hidden"
                  type="file"
                  :disabled="isUploading('partnerLogo:new:imageUrl')"
                  @change="
                    uploadIntoField(
                      $event,
                      newPartnerLogo,
                      'imageUrl',
                      'partnerLogo:new:imageUrl',
                      'partner-logo',
                    )
                  "
                />
                <span class="text-sm font-medium text-default">
                  Drop prepared logo here or click to browse
                </span>
                <span class="mt-1 text-xs text-muted">
                  Recommended for partner logo rail setup.
                </span>
              </label>
              <p
                v-if="isUploading('partnerLogo:new:imageUrl')"
                class="text-xs text-muted"
              >
                Uploading logo...
              </p>
              <img
                v-if="newPartnerLogo.imageUrl"
                :src="newPartnerLogo.imageUrl"
                alt="New partner logo preview"
                class="h-24 w-full rounded-xl border border-default bg-white object-contain p-3"
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_120px]">
              <UFormField label="Link URL" required>
                <UInput v-model="newPartnerLogo.linkUrl" />
              </UFormField>
              <UFormField label="Link target">
                <USelectMenu
                  v-model="newPartnerLogo.linkTarget"
                  :items="[
                    { label: 'Same tab', value: '_self' },
                    { label: 'New tab', value: '_blank' },
                  ]"
                  value-key="value"
                />
              </UFormField>
              <UFormField label="Sort order">
                <UInput
                  v-model.number="newPartnerLogo.sortOrder"
                  type="number"
                  min="0"
                />
              </UFormField>
            </div>

            <UCheckbox
              v-model="newPartnerLogo.isActive"
              label="Active on homepage"
            />

            <div class="flex gap-2">
              <UButton type="submit" color="primary"
                >Create partner logo</UButton
              >
              <UButton
                type="button"
                variant="soft"
                color="neutral"
                @click="resetPartnerLogoForm"
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
              <p class="text-sm text-muted">
                Curate section 5 for Home. Max {{ FEATURED_HOME_LIMIT }} items.
              </p>
            </div>
          </template>

          <UAlert
            v-if="!canAddFeaturedProducts"
            color="warning"
            variant="soft"
            title="Featured product rail is full"
            :description="`Remove one item before adding more than ${FEATURED_HOME_LIMIT}.`"
            class="mb-4"
          />

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

            <UButton
              type="submit"
              color="primary"
              :disabled="!canAddFeaturedProducts"
              >Add featured product</UButton
            >
          </form>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Add featured asset</h3>
              <p class="text-sm text-muted">
                Curate section 4 for Home. Max {{ FEATURED_HOME_LIMIT }} items.
              </p>
            </div>
          </template>

          <UAlert
            v-if="!canAddFeaturedAssets"
            color="warning"
            variant="soft"
            title="Featured asset rail is full"
            :description="`Remove one item before adding more than ${FEATURED_HOME_LIMIT}.`"
            class="mb-4"
          />

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

            <UButton
              type="submit"
              color="secondary"
              :disabled="!canAddFeaturedAssets"
              >Add featured asset</UButton
            >
          </form>
        </UCard>
      </div>
    </div>
  </div>
</template>
