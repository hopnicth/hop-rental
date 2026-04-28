<script setup lang="ts">
import AdminContentEditor from "~/components/admin/AdminContentEditor.vue";
import {
  SERVICE_AREA_OPTIONS,
  type ServiceAreaOption,
} from "~/data/thaiServiceAreas";
import {
  emptyLocalizedDoc,
  type ContentType,
  type LocalizedDoc,
} from "~/types/content";
import type { MainCategoryEntityType } from "~/types/category";
import { getAdminApiErrorMessage } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["super_admin"],
});

type AdminContentPage = {
  id: string;
  contentType: ContentType;
  slug: string;
  mainCategoryKey: string;
  titleTh: string;
  titleEn: string;
  titleCn: string;
  titleJp: string;
  excerptTh: string;
  excerptEn: string;
  excerptCn: string;
  excerptJp: string;
  coverImageUrl: string;
  body: LocalizedDoc;
  serviceAreas: string[];
  linkedProductIds: string[];
  linkedAssetIds: string[];
  sortOrder: number;
  isActive: boolean;
  publishedAt: string;
  updatedAt?: string;
};

type LinkOption = { value: string; label: string; isHidden: boolean };

const toast = useToast();
const formRef = ref<HTMLElement | null>(null);
const selectedType = ref<ContentType | "all">("all");
const editingId = ref<string | null>(null);
const saving = ref(false);
const deletingId = ref<string | null>(null);
const uploadingCover = ref(false);

const contentTypeOptions: Array<{
  value: ContentType;
  label: string;
  path: string;
}> = [
  { value: "blog", label: "Blog", path: "/blog" },
  { value: "service", label: "Services", path: "/services" },
  { value: "promotion", label: "Promotions", path: "/promotions" },
  { value: "review", label: "Reviews", path: "/reviews" },
];

const emptyForm = (): Omit<AdminContentPage, "id"> => ({
  contentType: "blog",
  slug: "",
  mainCategoryKey: "",
  titleTh: "",
  titleEn: "",
  titleCn: "",
  titleJp: "",
  excerptTh: "",
  excerptEn: "",
  excerptCn: "",
  excerptJp: "",
  coverImageUrl: "",
  body: emptyLocalizedDoc(),
  serviceAreas: [],
  linkedProductIds: [],
  linkedAssetIds: [],
  sortOrder: 0,
  isActive: true,
  publishedAt: "",
});

const serviceAreaItems = SERVICE_AREA_OPTIONS.map(
  (option: ServiceAreaOption) => ({
    value: option.value,
    label: `${option.labelTh} (${option.labelEn})`,
  }),
);

const form = reactive(emptyForm());
const formCategoryEntityType = computed<MainCategoryEntityType>(
  () => form.contentType,
);
const { categories: formMainCategories } = useMainCategories(
  formCategoryEntityType,
);
const formMainCategoryOptions = computed(() =>
  formMainCategories.value.map((item) => ({
    value: item.key,
    label: item.labelEn || item.labelTh || item.key,
  })),
);
const categoryLabelMap = computed(() => {
  const map = new Map<string, string>();
  for (const option of formMainCategoryOptions.value) {
    map.set(option.value, option.label);
  }
  for (const item of items.value) {
    if (item.mainCategoryKey && !map.has(item.mainCategoryKey)) {
      map.set(item.mainCategoryKey, item.mainCategoryKey);
    }
  }
  return map;
});

const { data, pending, error, refresh } = await useFetch<{
  items: AdminContentPage[];
  productOptions: LinkOption[];
  assetOptions: LinkOption[];
}>("/api/admin/content", {
  key: "admin-content-pages",
  default: () => ({ items: [], productOptions: [], assetOptions: [] }),
});

const items = computed(() => data.value?.items ?? []);
const productOptions = computed(() => data.value?.productOptions ?? []);
const assetOptions = computed(() => data.value?.assetOptions ?? []);
const filteredItems = computed(() =>
  selectedType.value === "all"
    ? items.value
    : items.value.filter((item) => item.contentType === selectedType.value),
);
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown content error"),
);

function resetForm() {
  editingId.value = null;
  Object.assign(form, emptyForm());
}

function editItem(item: AdminContentPage) {
  editingId.value = item.id;
  form.contentType = item.contentType;
  form.slug = item.slug;
  form.mainCategoryKey = item.mainCategoryKey ?? "";
  form.titleTh = item.titleTh;
  form.titleEn = item.titleEn;
  form.titleCn = item.titleCn;
  form.titleJp = item.titleJp;
  form.excerptTh = item.excerptTh;
  form.excerptEn = item.excerptEn;
  form.excerptCn = item.excerptCn;
  form.excerptJp = item.excerptJp;
  form.coverImageUrl = item.coverImageUrl;
  form.body = structuredClone(item.body ?? emptyLocalizedDoc());
  form.serviceAreas = [...(item.serviceAreas ?? [])];
  form.linkedProductIds = [...(item.linkedProductIds ?? [])];
  form.linkedAssetIds = [...(item.linkedAssetIds ?? [])];
  form.sortOrder = item.sortOrder;
  form.isActive = item.isActive;
  form.publishedAt = item.publishedAt;

  nextTick(() =>
    formRef.value?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}

function pagePath(item: AdminContentPage) {
  const match = contentTypeOptions.find(
    (option) => option.value === item.contentType,
  );
  return `${match?.path ?? "/blog"}/${item.slug}`;
}

function contentTypeLabel(type: ContentType) {
  return (
    contentTypeOptions.find((option) => option.value === type)?.label ?? type
  );
}

function categoryLabel(key: string) {
  return categoryLabelMap.value.get(key) ?? key;
}

watch(formMainCategoryOptions, (options) => {
  if (!form.mainCategoryKey || options.length === 0) return;
  if (!options.some((option) => option.value === form.mainCategoryKey)) {
    form.mainCategoryKey = "";
  }
});

async function savePage() {
  saving.value = true;
  try {
    await $fetch(
      editingId.value
        ? `/api/admin/content/${encodeURIComponent(editingId.value)}`
        : "/api/admin/content",
      {
        method: editingId.value ? "PATCH" : "POST",
        body: { ...form, body: form.body },
      },
    );

    toast.add({
      title: editingId.value ? "Content updated" : "Content created",
      color: "success",
      icon: "bx:check-circle",
    });
    resetForm();
    await refresh();
  } catch (saveError) {
    toast.add({
      title: editingId.value ? "Update failed" : "Create failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    saving.value = false;
  }
}

async function deleteItem(item: AdminContentPage) {
  if (
    !confirm(
      `Delete content '${item.titleTh || item.slug}'? This cannot be undone.`,
    )
  )
    return;

  deletingId.value = item.id;
  try {
    await $fetch(`/api/admin/content/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    if (editingId.value === item.id) resetForm();
    toast.add({ title: "Content deleted", color: "success", icon: "bx:trash" });
    await refresh();
  } catch (deleteError) {
    toast.add({
      title: "Delete failed",
      description: getAdminApiErrorMessage(deleteError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    deletingId.value = null;
  }
}

async function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  uploadingCover.value = true;
  try {
    const body = new FormData();
    body.append("kind", "image");
    body.append("file", file);
    const result = await $fetch<{ url: string }>("/api/admin/content/upload", {
      method: "POST",
      body,
    });
    form.coverImageUrl = result.url;
  } catch (uploadError) {
    toast.add({
      title: "Cover upload failed",
      description: getAdminApiErrorMessage(uploadError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    uploadingCover.value = false;
  }
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h2 class="text-lg font-semibold">Content pages</h2>
            <p class="text-sm text-muted">
              Manage blog, services, and promotions with reusable content
              blocks.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="option in contentTypeOptions"
              :key="option.value"
              :to="option.path"
              target="_blank"
              size="sm"
              variant="soft"
              color="neutral"
            >
              View {{ option.label }}
            </UButton>
            <UButton
              size="sm"
              variant="soft"
              icon="bx:refresh"
              :loading="pending"
              @click="refresh"
            >
              Refresh
            </UButton>
          </div>
        </div>
      </template>

      <UAlert
        v-if="error"
        class="mb-4"
        color="error"
        variant="soft"
        title="Failed to load content"
        :description="loadErrorMessage"
      />

      <div class="mb-4 flex flex-wrap gap-2">
        <UButton
          :variant="selectedType === 'all' ? 'solid' : 'soft'"
          size="sm"
          @click="selectedType = 'all'"
        >
          All
        </UButton>
        <UButton
          v-for="option in contentTypeOptions"
          :key="option.value"
          :variant="selectedType === option.value ? 'solid' : 'soft'"
          size="sm"
          @click="selectedType = option.value"
        >
          {{ option.label }}
        </UButton>
      </div>

      <div v-if="pending" class="space-y-3">
        <USkeleton v-for="index in 5" :key="index" class="h-28 rounded-lg" />
      </div>
      <div v-else-if="filteredItems.length" class="space-y-3">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="rounded-lg border border-default p-4"
        >
          <div
            class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
          >
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="primary" variant="soft">{{
                  contentTypeLabel(item.contentType)
                }}</UBadge>
                <UBadge
                  v-if="item.mainCategoryKey"
                  color="neutral"
                  variant="soft"
                >
                  {{ categoryLabel(item.mainCategoryKey) }}
                </UBadge>
                <UBadge
                  :color="item.isActive ? 'success' : 'neutral'"
                  variant="soft"
                >
                  {{ item.isActive ? "Active" : "Hidden" }}
                </UBadge>
              </div>
              <h3 class="font-semibold text-highlighted">
                {{ item.titleTh || item.slug }}
              </h3>
              <p class="text-sm text-muted">{{ pagePath(item) }}</p>
              <p class="line-clamp-2 text-sm text-muted">
                {{ item.excerptTh }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                :to="pagePath(item)"
                target="_blank"
                size="xs"
                variant="soft"
                color="neutral"
              >
                View
              </UButton>
              <UButton
                size="xs"
                variant="soft"
                icon="bx:edit"
                @click="editItem(item)"
              >
                Edit
              </UButton>
              <UButton
                size="xs"
                color="error"
                variant="soft"
                icon="bx:trash"
                :loading="deletingId === item.id"
                @click="deleteItem(item)"
              >
                Delete
              </UButton>
            </div>
          </div>
        </div>
      </div>
      <UAlert
        v-else
        color="neutral"
        variant="soft"
        title="No content pages yet"
      />
    </UCard>

    <UCard ref="formRef">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">
              {{ editingId ? "Edit content" : "Create content" }}
            </h2>
            <p class="text-sm text-muted">
              Rich-text editor with locale tabs (TH / EN / CN / JP).
            </p>
          </div>
          <UButton
            v-if="editingId"
            size="sm"
            variant="ghost"
            color="neutral"
            @click="resetForm"
          >
            New
          </UButton>
        </div>
      </template>

      <div class="space-y-5">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Type">
            <select
              v-model="form.contentType"
              class="h-9 w-full rounded border border-default bg-white px-3 text-sm"
            >
              <option
                v-for="option in contentTypeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </UFormField>
          <UFormField label="Slug">
            <UInput v-model="form.slug" placeholder="my-content-slug" />
          </UFormField>
        </div>

        <UFormField
          label="Main category"
          help="Optional. Used by the public category filter for this content type."
        >
          <select
            v-model="form.mainCategoryKey"
            class="h-9 w-full rounded border border-default bg-white px-3 text-sm"
          >
            <option value="">No category</option>
            <option
              v-for="option in formMainCategoryOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Title TH"
            ><UInput v-model="form.titleTh"
          /></UFormField>
          <UFormField label="Title EN"
            ><UInput v-model="form.titleEn"
          /></UFormField>
          <UFormField label="Title CN"
            ><UInput v-model="form.titleCn"
          /></UFormField>
          <UFormField label="Title JP"
            ><UInput v-model="form.titleJp"
          /></UFormField>
        </div>

        <UFormField label="Excerpt TH"
          ><UTextarea v-model="form.excerptTh" :rows="2"
        /></UFormField>
        <UFormField label="Excerpt EN"
          ><UTextarea v-model="form.excerptEn" :rows="2"
        /></UFormField>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Excerpt CN"
            ><UTextarea v-model="form.excerptCn" :rows="2"
          /></UFormField>
          <UFormField label="Excerpt JP"
            ><UTextarea v-model="form.excerptJp" :rows="2"
          /></UFormField>
        </div>

        <UFormField label="Cover image URL">
          <UInput v-model="form.coverImageUrl" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-3">
          <label class="inline-flex">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              @change="uploadCover"
            />
            <UButton
              as="span"
              size="sm"
              variant="soft"
              icon="bx:upload"
              :loading="uploadingCover"
            >
              Upload cover
            </UButton>
          </label>
          <NuxtImg
            v-if="form.coverImageUrl"
            :src="form.coverImageUrl"
            class="h-20 rounded object-cover"
          />
        </div>

        <UFormField
          v-if="form.contentType === 'service'"
          label="พื้นที่ให้บริการ (Service areas)"
          help="เลือกได้หลายจังหวัด/ภาค หรือเลือก ทั่วประเทศ"
        >
          <USelectMenu
            v-model="form.serviceAreas"
            :items="serviceAreaItems"
            value-key="value"
            multiple
            searchable
            placeholder="เลือกพื้นที่ให้บริการ"
            class="w-full"
          />
        </UFormField>

        <template v-if="form.contentType === 'review'">
          <UFormField
            label="Linked products"
            help="รีวิวนี้จะไปแสดงที่หน้ารายละเอียดของสินค้าที่เลือก"
          >
            <USelectMenu
              v-model="form.linkedProductIds"
              :items="productOptions"
              value-key="value"
              multiple
              searchable
              placeholder="เลือกสินค้า"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Linked assets"
            help="รีวิวนี้จะไปแสดงที่หน้ารายละเอียดของ asset ที่เลือก"
          >
            <USelectMenu
              v-model="form.linkedAssetIds"
              :items="assetOptions"
              value-key="value"
              multiple
              searchable
              placeholder="เลือก asset"
              class="w-full"
            />
          </UFormField>
        </template>

        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="Sort order"
            ><UInput v-model="form.sortOrder" type="number"
          /></UFormField>
          <UFormField label="Published at"
            ><UInput
              v-model="form.publishedAt"
              placeholder="2026-04-27T09:00:00Z"
          /></UFormField>
          <UFormField label="Active"
            ><UCheckbox v-model="form.isActive"
          /></UFormField>
        </div>

        <div class="space-y-2">
          <h3 class="font-semibold text-highlighted">Body</h3>
          <AdminContentEditor v-model="form.body" :disabled="saving" />
        </div>

        <div class="flex justify-end gap-2">
          <UButton
            variant="soft"
            color="neutral"
            :disabled="saving"
            @click="resetForm"
          >
            Reset
          </UButton>
          <UButton
            color="primary"
            icon="bx:save"
            :loading="saving"
            @click="savePage"
          >
            {{ editingId ? "Update content" : "Create content" }}
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
