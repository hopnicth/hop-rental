<script setup lang="ts">
import { getAdminApiErrorMessage, type AdminApiMeta } from "~/utils/admin-api";
import {
  formatJsonText,
  parseJsonArrayText,
  parseJsonObjectText,
} from "~/utils/admin-catalog-form";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type ProductType = "sale" | "rental" | "hybrid";

type MainCategoryItem = {
  key: string;
  labelTh: string;
  labelEn: string;
  icon: string;
  descriptionTh: string;
  descriptionEn: string;
  isActive: boolean;
  sortOrder: number;
};

type MainCategoryForm = {
  key: string;
  labelTh: string;
  labelEn: string;
  icon: string;
  descriptionTh: string;
  descriptionEn: string;
  isActive: boolean;
  sortOrder: number;
};

type SuggestionItem = {
  value: string;
  label: string;
  source: string;
  sourceLabel: string;
  description?: string | null;
};

type ProductListItem = {
  id: string;
};

type PendingImageItem = {
  id: string;
  file: File;
  objectUrl: string;
  name: string;
  sizeLabel: string;
};

const toast = useToast();
const { profile } = useUserProfile();

const shippingSizeOptions = [
  { label: "Free (0 ฿)", value: "free" },
  { label: "S (50 ฿)", value: "s" },
  { label: "M (100 ฿)", value: "m" },
  { label: "L (150 ฿)", value: "l" },
  { label: "XL (200 ฿)", value: "xl" },
];

const typeOptions = [
  { label: "Sale", value: "sale" },
  { label: "Rental", value: "rental" },
  { label: "Hybrid", value: "hybrid" },
];

function generateProductId() {
  const seed = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `prod-${seed}`;
}

function slugifySegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
}

function buildProductSlug(input: {
  nameEn: string;
  nameTh: string;
  brand: string;
  productId: string;
}) {
  const nameSegment =
    slugifySegment(input.nameEn) || slugifySegment(input.nameTh) || "product";
  const brandSegment = slugifySegment(input.brand);
  const shortId = input.productId.replace(/^prod-/, "").slice(0, 8) || "draft";

  return [nameSegment, brandSegment, shortId].filter(Boolean).join("-");
}

function normalizeFileList(value: File[] | File | null | undefined) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function formatFileSize(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function normalizeCategoryKeyInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeTagValue(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function dedupeSuggestions(
  items: SuggestionItem[],
  normalizeValue: (value: string) => string,
) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = normalizeValue(item.value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const form = reactive({
  slug: "",
  type: "sale" as ProductType,
  nameTh: "",
  nameEn: "",
  descriptionTh: "",
  descriptionEn: "",
  brand: "",
  mainCategoryKey: "",
  tagKeys: [] as string[],
  searchKeywords: [] as string[],
  shippingSize: "s" as "free" | "s" | "m" | "l" | "xl",
});

const specText = ref(formatJsonText({}, "object"));
const detailBlocksText = ref(formatJsonText([], "array"));
const creating = ref(false);
const previewOpen = ref(false);
const slugTouched = ref(false);
const draftProductId = ref(generateProductId());
const imageFiles = ref<File[] | null>([]);
const imageItems = ref<PendingImageItem[]>([]);
const mainCategoryEditorOpen = ref(false);
const creatingMainCategory = ref(false);
const mainCategoryForm = reactive<MainCategoryForm>({
  key: "",
  labelTh: "",
  labelEn: "",
  icon: "",
  descriptionTh: "",
  descriptionEn: "",
  isActive: true,
  sortOrder: 0,
});

const { data, pending, error, refresh } = await useFetch<{
  items: MainCategoryItem[];
  meta?: AdminApiMeta;
}>("/api/admin/main-categories", {
  key: "admin-product-create-categories",
  default: () => ({ items: [] }),
});

const { data: suggestionData } = await useFetch<{
  tagSuggestions: SuggestionItem[];
  searchKeywordSuggestions: SuggestionItem[];
}>("/api/admin/products/suggestions", {
  key: "admin-product-create-suggestions",
  default: () => ({
    tagSuggestions: [],
    searchKeywordSuggestions: [],
  }),
});

const categoryItems = computed(() => data.value?.items ?? []);
const adminWarning = computed(() => data.value?.meta?.warning ?? null);
const isSuperAdmin = computed(
  () => profile.value?.platformRole === "super_admin",
);

const categoryOptions = computed(() =>
  categoryItems.value
    .filter((item) => item.isActive)
    .map((item) => ({
      value: item.key,
      label: `${item.labelTh} · ${item.key}`,
      description: item.descriptionTh || item.labelEn,
    })),
);

const mainCategorySelection = computed<string[]>({
  get: () => (form.mainCategoryKey ? [form.mainCategoryKey] : []),
  set: (value) => {
    form.mainCategoryKey = value[0] ?? "";
  },
});

const tagSuggestions = computed(() =>
  dedupeSuggestions(
    [
      ...categoryItems.value
        .filter((item) => item.isActive)
        .map((item) => ({
          value: item.key,
          label: item.labelTh || item.labelEn || item.key,
          source: "category",
          sourceLabel: "category",
          description: item.descriptionTh || item.descriptionEn || item.key,
        })),
      ...(suggestionData.value?.tagSuggestions ?? []),
    ],
    normalizeTagValue,
  ),
);

const searchKeywordSuggestions = computed(
  () => suggestionData.value?.searchKeywordSuggestions ?? [],
);

const generatedSlug = computed(() =>
  buildProductSlug({
    nameEn: form.nameEn,
    nameTh: form.nameTh,
    brand: form.brand,
    productId: draftProductId.value,
  }),
);

const effectiveSlug = computed(() => form.slug || generatedSlug.value);

watch(
  generatedSlug,
  (value) => {
    if (!slugTouched.value || !form.slug.trim()) {
      form.slug = value;
    }
  },
  { immediate: true },
);

watch(
  () => form.mainCategoryKey,
  (value) => {
    const normalized = normalizeTagValue(value);
    if (!normalized) return;
    form.tagKeys = form.tagKeys.filter(
      (item) => normalizeTagValue(item) !== normalized,
    );
  },
  { immediate: true },
);

function syncImageItems(files: File[]) {
  const previous = new Map(
    imageItems.value.map((item) => [
      `${item.file.name}:${item.file.size}:${item.file.lastModified}`,
      item.objectUrl,
    ]),
  );

  const next = files.map((file, index) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    const objectUrl = previous.get(key) ?? URL.createObjectURL(file);

    previous.delete(key);

    return {
      id: `${key}:${index}`,
      file,
      objectUrl,
      name: file.name,
      sizeLabel: formatFileSize(file.size),
    } satisfies PendingImageItem;
  });

  for (const url of previous.values()) {
    URL.revokeObjectURL(url);
  }

  imageItems.value = next;
}

watch(imageFiles, (value) => {
  syncImageItems(normalizeFileList(value));
});

onBeforeUnmount(() => {
  for (const item of imageItems.value) {
    URL.revokeObjectURL(item.objectUrl);
  }
});

function setSlugManually(value: string | number) {
  slugTouched.value = true;
  form.slug = slugifySegment(String(value ?? ""));
}

function regenerateSlug() {
  slugTouched.value = false;
  form.slug = generatedSlug.value;
}

function updateImageOrder(next: PendingImageItem[]) {
  imageItems.value = next;
  imageFiles.value = next.map((item) => item.file);
}

function setCoverImage(imageId: string) {
  const item = imageItems.value.find((entry) => entry.id === imageId);
  if (!item) return;

  updateImageOrder([
    item,
    ...imageItems.value.filter((entry) => entry.id !== imageId),
  ]);
}

function removeImage(imageId: string) {
  const removed = imageItems.value.find((entry) => entry.id === imageId);
  if (removed) {
    URL.revokeObjectURL(removed.objectUrl);
  }

  updateImageOrder(imageItems.value.filter((entry) => entry.id !== imageId));
}

function setMainCategoryKey(value: string | number) {
  mainCategoryForm.key = normalizeCategoryKeyInput(String(value ?? ""));
}

function resetMainCategoryForm() {
  mainCategoryForm.key = "";
  mainCategoryForm.labelTh = "";
  mainCategoryForm.labelEn = "";
  mainCategoryForm.icon = "";
  mainCategoryForm.descriptionTh = "";
  mainCategoryForm.descriptionEn = "";
  mainCategoryForm.isActive = true;
  mainCategoryForm.sortOrder = 0;
}

async function createMainCategoryInline() {
  if (!isSuperAdmin.value) return;

  creatingMainCategory.value = true;

  try {
    const response = await $fetch<{ item: MainCategoryItem }>(
      "/api/admin/main-categories",
      {
        method: "POST",
        body: {
          key: mainCategoryForm.key,
          labelTh: mainCategoryForm.labelTh,
          labelEn: mainCategoryForm.labelEn,
          icon: mainCategoryForm.icon,
          descriptionTh: mainCategoryForm.descriptionTh,
          descriptionEn: mainCategoryForm.descriptionEn,
          isActive: mainCategoryForm.isActive,
          sortOrder: mainCategoryForm.sortOrder,
        },
      },
    );

    await refresh();

    if (response.item.isActive) {
      form.mainCategoryKey = response.item.key;
    }

    toast.add({
      title: "Main category created",
      description: response.item.isActive
        ? `Selected ${response.item.labelTh || response.item.key} in the product form.`
        : "Category was created as inactive, so it was not auto-selected.",
      color: "success",
      icon: "bx:check-circle",
    });

    resetMainCategoryForm();
    mainCategoryEditorOpen.value = false;
  } catch (saveError) {
    toast.add({
      title: "Create main category failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    creatingMainCategory.value = false;
  }
}

function resetForm() {
  draftProductId.value = generateProductId();
  slugTouched.value = false;
  form.slug = "";
  form.type = "sale";
  form.nameTh = "";
  form.nameEn = "";
  form.descriptionTh = "";
  form.descriptionEn = "";
  form.brand = "";
  form.mainCategoryKey = "";
  form.tagKeys = [];
  form.searchKeywords = [];
  form.shippingSize = "s";
  specText.value = formatJsonText({}, "object");
  detailBlocksText.value = formatJsonText([], "array");
  imageFiles.value = [];
  previewOpen.value = false;
  mainCategoryEditorOpen.value = false;
  resetMainCategoryForm();
}

function formatSpecJson() {
  try {
    specText.value = formatJsonText(
      parseJsonObjectText(specText.value, "Spec"),
      "object",
    );
  } catch (formatError) {
    toast.add({
      title: "Spec JSON invalid",
      description:
        formatError instanceof Error ? formatError.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

function formatDetailBlocksJson() {
  try {
    detailBlocksText.value = formatJsonText(
      parseJsonArrayText(detailBlocksText.value, "Detail blocks"),
      "array",
    );
  } catch (formatError) {
    toast.add({
      title: "Detail blocks JSON invalid",
      description:
        formatError instanceof Error ? formatError.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

function buildCreateBody() {
  return {
    id: draftProductId.value,
    slug: effectiveSlug.value,
    type: form.type,
    nameTh: form.nameTh,
    nameEn: form.nameEn,
    descriptionTh: form.descriptionTh,
    descriptionEn: form.descriptionEn,
    brand: form.brand,
    mainCategoryKey: form.mainCategoryKey,
    tagKeys: form.tagKeys,
    searchKeywords: form.searchKeywords,
    spec: parseJsonObjectText(specText.value, "Spec"),
    detailBlocks: parseJsonArrayText(detailBlocksText.value, "Detail blocks"),
    shippingSize: form.shippingSize,
    isHidden: true,
  };
}

function openPreview() {
  try {
    void buildCreateBody();
    previewOpen.value = true;
  } catch (previewError) {
    toast.add({
      title: "Preview unavailable",
      description: getAdminApiErrorMessage(
        previewError,
        "Please fix the form first",
      ),
      color: "error",
      icon: "bx:error-circle",
    });
  }
}

async function uploadSelectedImages(productId: string) {
  let uploaded = 0;
  let failed = 0;

  for (const [index, item] of imageItems.value.entries()) {
    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("fit", "contain");
    formData.append(
      "title",
      index === 0 ? "Cover image" : `Gallery image ${index + 1}`,
    );

    try {
      await $fetch(
        `/api/admin/products/${encodeURIComponent(productId)}/media`,
        {
          method: "POST",
          body: formData,
        },
      );
      uploaded += 1;
    } catch (uploadError) {
      failed += 1;
      console.warn("[admin/products/new] image upload failed", uploadError);
    }
  }

  return { uploaded, failed };
}

async function createProduct() {
  creating.value = true;

  try {
    const response = await $fetch<{ item: ProductListItem }>(
      "/api/admin/products",
      {
        method: "POST",
        body: buildCreateBody(),
      },
    );

    const uploadResult = await uploadSelectedImages(response.item.id);

    toast.add({
      title: "Hidden draft created",
      description:
        uploadResult.uploaded > 0
          ? `Uploaded ${uploadResult.uploaded} image(s) for background processing. Continue in the detail page to add SKU rows.`
          : "Continue in the detail page to add SKU rows.",
      color: "success",
      icon: "bx:check-circle",
    });

    if (uploadResult.failed > 0) {
      toast.add({
        title: "Some images could not be queued",
        description: `${uploadResult.failed} file(s) failed to upload. You can retry from the product detail page.`,
        color: "warning",
        icon: "bx:error-circle",
      });
    }

    await navigateTo(`/admin/products/${response.item.id}`);
  } catch (createError) {
    toast.add({
      title: "Create product failed",
      description: getAdminApiErrorMessage(createError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm text-muted">Admin / Products</p>
        <h2 class="text-xl font-semibold">Create product</h2>
      </div>

      <UButton
        to="/admin/products"
        variant="soft"
        color="neutral"
        icon="bx:left-arrow-alt"
      >
        Back to products
      </UButton>
    </div>

    <UAlert
      v-if="adminWarning"
      color="warning"
      variant="soft"
      :title="adminWarning.title"
      :description="adminWarning.message"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      title="Failed to load category options"
      :description="
        getAdminApiErrorMessage(error, 'Unknown category load error')
      "
    />

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <UCard>
        <template #header>
          <div>
            <h3 class="text-lg font-semibold">Publish basic product draft</h3>
            <p class="text-sm text-muted">
              Publish the shared product first with images and core marketing
              data, then finish SKU rows in the edit page.
            </p>
          </div>
        </template>

        <form class="space-y-5" @submit.prevent="createProduct">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Slug" required>
              <div class="flex gap-2">
                <UInput
                  :model-value="form.slug"
                  class="w-full min-w-0 flex-1"
                  placeholder="cordless-drill-dca-a1b2c3d4"
                  @update:model-value="setSlugManually"
                />
                <UButton
                  type="button"
                  variant="soft"
                  color="neutral"
                  icon="bx:refresh"
                  @click="regenerateSlug"
                >
                  Regenerate
                </UButton>
              </div>
              <template #hint>
                Auto format: `name-brand-id` · draft id {{ draftProductId }}
              </template>
            </UFormField>

            <UAlert
              color="neutral"
              variant="soft"
              title="Product ID is auto-generated"
              description="Admins no longer type product IDs manually. A draft-safe product id is generated for preview and publish."
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Type" required>
              <USelectMenu
                v-model="form.type"
                :items="typeOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Brand">
              <UInput v-model="form.brand" class="w-full" placeholder="DCA" />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Shipping size"
              hint="Used to compute the cart shipping fee via free-unit bin packing."
            >
              <USelectMenu
                v-model="form.shippingSize"
                :items="shippingSizeOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Name (TH)" required>
              <UInput v-model="form.nameTh" class="w-full" />
            </UFormField>

            <UFormField label="Name (EN)" required>
              <UInput v-model="form.nameEn" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Description (TH)" required>
            <UTextarea v-model="form.descriptionTh" class="w-full" :rows="3" />
          </UFormField>

          <UFormField label="Description (EN)" required>
            <UTextarea v-model="form.descriptionEn" class="w-full" :rows="3" />
          </UFormField>

          <UFormField label="Main category" required>
            <div class="space-y-3">
              <AdminChipInput
                v-model="mainCategorySelection"
                :options="categoryOptions"
                :max-items="1"
                placeholder="Type to search allowed categories"
                hint="Only active categories can be selected here."
              />

              <div v-if="isSuperAdmin" class="space-y-3">
                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    type="button"
                    size="sm"
                    variant="soft"
                    color="primary"
                    icon="bx:category-alt"
                    @click="mainCategoryEditorOpen = !mainCategoryEditorOpen"
                  >
                    {{
                      mainCategoryEditorOpen
                        ? "Hide add main category"
                        : "Add main category here"
                    }}
                  </UButton>
                  <p class="text-xs text-muted">
                    Create a new category inline without leaving this draft
                    form.
                  </p>
                </div>

                <UCard v-if="mainCategoryEditorOpen" variant="subtle">
                  <template #header>
                    <div>
                      <h4 class="font-medium">Create main category inline</h4>
                      <p class="text-sm text-muted">
                        Same fields as the dedicated page, but stays inside the
                        product draft flow.
                      </p>
                    </div>
                  </template>

                  <form
                    class="space-y-4"
                    @submit.prevent="createMainCategoryInline"
                  >
                    <div class="grid gap-4 sm:grid-cols-2">
                      <UFormField label="Key" required>
                        <UInput
                          :model-value="mainCategoryForm.key"
                          class="w-full"
                          placeholder="impact_drivers"
                          @update:model-value="setMainCategoryKey"
                        />
                        <template #hint>
                          Lowercase, numbers, underscore. Hyphen/space becomes
                          underscore.
                        </template>
                      </UFormField>

                      <UFormField label="Sort order">
                        <UInput
                          v-model.number="mainCategoryForm.sortOrder"
                          class="w-full"
                          type="number"
                          min="0"
                        />
                      </UFormField>
                    </div>

                    <div class="grid gap-4 sm:grid-cols-2">
                      <UFormField label="Label (TH)" required>
                        <UInput
                          v-model="mainCategoryForm.labelTh"
                          class="w-full"
                          placeholder="สว่านกระแทก"
                        />
                      </UFormField>

                      <UFormField label="Label (EN)" required>
                        <UInput
                          v-model="mainCategoryForm.labelEn"
                          class="w-full"
                          placeholder="Impact Drivers"
                        />
                      </UFormField>
                    </div>

                    <UFormField label="Icon">
                      <UInput
                        v-model="mainCategoryForm.icon"
                        class="w-full"
                        placeholder="bx:drill"
                      />
                    </UFormField>

                    <UFormField label="Description (TH)">
                      <UTextarea
                        v-model="mainCategoryForm.descriptionTh"
                        class="w-full"
                        :rows="2"
                      />
                    </UFormField>

                    <UFormField label="Description (EN)">
                      <UTextarea
                        v-model="mainCategoryForm.descriptionEn"
                        class="w-full"
                        :rows="2"
                      />
                    </UFormField>

                    <UCheckbox
                      v-model="mainCategoryForm.isActive"
                      label="Active and selectable in product forms"
                    />

                    <div class="flex gap-2">
                      <UButton
                        type="submit"
                        color="primary"
                        :loading="creatingMainCategory"
                      >
                        Create category
                      </UButton>
                      <UButton
                        type="button"
                        variant="soft"
                        color="neutral"
                        @click="resetMainCategoryForm"
                      >
                        Reset category form
                      </UButton>
                    </div>
                  </form>
                </UCard>
              </div>
            </div>
          </UFormField>

          <UFormField label="Tags">
            <AdminCommaSuggestInput
              v-model="form.tagKeys"
              mode="tag"
              :suggestions="tagSuggestions"
              :excluded-values="
                form.mainCategoryKey ? [form.mainCategoryKey] : []
              "
              placeholder="impact_driver, brushless, one-key"
              helper-text="Comma-separated tags with autocomplete from main categories and existing tags. The primary main category is excluded automatically."
            />
          </UFormField>

          <UFormField label="Search keywords / aliases">
            <AdminCommaSuggestInput
              v-model="form.searchKeywords"
              mode="keyword"
              :suggestions="searchKeywordSuggestions"
              placeholder="cordless drill, impact driver, one key"
              helper-text="Comma-separated search aliases with autocomplete from previously used search keywords."
            />
          </UFormField>

          <UAlert
            color="warning"
            variant="soft"
            title="This action publishes a hidden draft"
            description="The product starts hidden from storefront by default. After publish, continue on the detail page to add SKU rows before making it visible."
          />

          <UAlert
            color="info"
            variant="soft"
            title="Filter options are assigned after publish"
            description="Dynamic filter options for this main category can be assigned on the detail page after the draft is published."
          />

          <UFormField label="Draft images">
            <div class="space-y-4">
              <UFileUpload
                v-model="imageFiles"
                multiple
                accept="image/jpeg,image/png,image/webp"
                layout="grid"
                label="Drop product images here"
                description="JPEG, PNG, or WebP up to 15MB each. The first image becomes the cover."
                icon="i-lucide-image"
                class="w-full min-h-52"
              />

              <div v-if="imageItems.length > 0" class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-medium">Local preview order</p>
                  <p class="text-xs text-muted">
                    {{ imageItems.length }} image(s) ready for publish
                  </p>
                </div>

                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <UCard
                    v-for="(item, index) in imageItems"
                    :key="item.id"
                    variant="subtle"
                  >
                    <div class="space-y-3">
                      <img
                        :src="item.objectUrl"
                        :alt="item.name"
                        class="aspect-square w-full rounded-lg border border-default object-cover"
                      />

                      <div class="space-y-1">
                        <div class="flex items-center justify-between gap-2">
                          <p class="truncate text-sm font-medium">
                            {{ item.name }}
                          </p>
                          <UBadge
                            :color="index === 0 ? 'primary' : 'neutral'"
                            variant="soft"
                          >
                            {{ index === 0 ? "Cover" : `#${index + 1}` }}
                          </UBadge>
                        </div>
                        <p class="text-xs text-muted">{{ item.sizeLabel }}</p>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <UButton
                          type="button"
                          size="xs"
                          variant="soft"
                          color="primary"
                          :disabled="index === 0"
                          @click="setCoverImage(item.id)"
                        >
                          Set as cover
                        </UButton>
                        <UButton
                          type="button"
                          size="xs"
                          variant="soft"
                          color="error"
                          @click="removeImage(item.id)"
                        >
                          Remove
                        </UButton>
                      </div>
                    </div>
                  </UCard>
                </div>
              </div>
            </div>
          </UFormField>

          <UFormField label="Shared spec JSONB">
            <div class="space-y-2">
              <div class="flex justify-end">
                <UButton
                  type="button"
                  size="xs"
                  variant="soft"
                  @click="formatSpecJson"
                >
                  Format JSON
                </UButton>
              </div>
              <UTextarea v-model="specText" class="w-full" :rows="10" />
            </div>
          </UFormField>

          <UFormField label="Detail blocks JSONB">
            <div class="space-y-2">
              <div class="flex justify-end">
                <UButton
                  type="button"
                  size="xs"
                  variant="soft"
                  @click="formatDetailBlocksJson"
                >
                  Format JSON
                </UButton>
              </div>
              <UTextarea v-model="detailBlocksText" class="w-full" :rows="10" />
            </div>
          </UFormField>

          <div class="flex gap-2">
            <UButton
              type="button"
              variant="soft"
              color="neutral"
              icon="bx:show"
              @click="openPreview"
            >
              Preview
            </UButton>
            <UButton type="submit" color="primary" :loading="creating">
              Publish basic product
            </UButton>
            <UButton
              type="button"
              variant="soft"
              color="neutral"
              @click="resetForm"
            >
              Reset
            </UButton>
          </div>
        </form>
      </UCard>

      <div class="space-y-6">
        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Pattern hints</h3>
              <p class="text-sm text-muted">
                Keep product JSON focused on shared facts and marketing-friendly
                blocks.
              </p>
            </div>
          </template>

          <ul class="space-y-3 text-sm text-muted">
            <li>
              • `spec` = shared technical facts across every SKU of this model.
            </li>
            <li>
              • `detailBlocks` = flexible marketing/detail sections such as
              highlights, usage, included items, or warnings.
            </li>
            <li>
              • SKU-specific values like breaker amp, size, color, or capacity
              should stay in SKU `attributes`.
            </li>
            <li>
              • Use `tags` for future filters and `searchKeywords` for search
              recall/aliases.
            </li>
            <li>
              • Upload draft images here first, then finish advanced media,
              links, and documents in the detail page after publish.
            </li>
            <li>
              • The first publish is intentionally hidden so the storefront
              never sees a product before SKU pricing/stock is ready.
            </li>
          </ul>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Main categories</h3>
              <p class="text-sm text-muted">
                The primary category is strict by design.
              </p>
            </div>
          </template>

          <div class="space-y-3 text-sm text-muted">
            <p>
              If the category you need is missing, it must be created first
              before this product can be saved.
            </p>

            <UButton
              v-if="isSuperAdmin"
              type="button"
              variant="soft"
              color="primary"
              icon="bx:category-alt"
              @click="mainCategoryEditorOpen = !mainCategoryEditorOpen"
            >
              {{
                mainCategoryEditorOpen
                  ? "Hide inline category form"
                  : "Add main category inline"
              }}
            </UButton>

            <p v-else>Ask a super admin to add the new main category first.</p>
          </div>
        </UCard>
      </div>
    </div>

    <UModal
      v-model:open="previewOpen"
      title="Preview hidden draft"
      description="Quick check before creating the hidden draft. Advanced fields can be completed on the edit page."
    >
      <template #body>
        <div
          class="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
        >
          <div class="space-y-3">
            <img
              v-if="imageItems[0]"
              :src="imageItems[0].objectUrl"
              :alt="form.nameEn || form.nameTh || 'Product preview'"
              class="aspect-square w-full rounded-xl border border-default object-cover"
            />
            <div
              v-else
              class="flex aspect-square items-center justify-center rounded-xl border border-dashed border-default bg-muted text-sm text-muted"
            >
              No image selected yet
            </div>

            <div v-if="imageItems.length > 1" class="grid grid-cols-3 gap-2">
              <img
                v-for="item in imageItems.slice(1, 4)"
                :key="item.id"
                :src="item.objectUrl"
                :alt="item.name"
                class="aspect-square rounded-lg border border-default object-cover"
              />
            </div>
          </div>

          <div class="rounded-xl border border-default bg-default p-4">
            <p
              class="mb-3 text-xs font-medium uppercase tracking-wide text-muted"
            >
              Draft summary
            </p>

            <dl class="divide-y divide-default text-sm">
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Product ID</dt>
                <dd class="font-medium text-default break-all">
                  {{ draftProductId }}
                </dd>
              </div>
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Slug</dt>
                <dd class="font-medium text-default break-all">
                  {{ effectiveSlug }}
                </dd>
              </div>
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Type</dt>
                <dd class="font-medium text-default">{{ form.type }}</dd>
              </div>
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Brand</dt>
                <dd class="font-medium text-default">
                  {{ form.brand || "—" }}
                </dd>
              </div>
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Name (TH)</dt>
                <dd class="font-medium text-default">
                  {{ form.nameTh || "—" }}
                </dd>
              </div>
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Name (EN)</dt>
                <dd class="font-medium text-default">
                  {{ form.nameEn || "—" }}
                </dd>
              </div>
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Main category</dt>
                <dd class="font-medium text-default">
                  {{ form.mainCategoryKey || "Not selected" }}
                </dd>
              </div>
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Tags</dt>
                <dd class="font-medium text-default">
                  {{ form.tagKeys.length ? form.tagKeys.join(", ") : "—" }}
                </dd>
              </div>
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Search keywords</dt>
                <dd class="font-medium text-default">
                  {{
                    form.searchKeywords.length
                      ? form.searchKeywords.join(", ")
                      : "—"
                  }}
                </dd>
              </div>
              <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2">
                <dt class="text-muted">Queued images</dt>
                <dd class="font-medium text-default">
                  {{ imageItems.length }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            type="button"
            variant="ghost"
            color="neutral"
            @click="previewOpen = false"
          >
            Close
          </UButton>
          <UButton
            type="button"
            color="primary"
            :loading="creating"
            @click="createProduct"
          >
            Publish basic product
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
