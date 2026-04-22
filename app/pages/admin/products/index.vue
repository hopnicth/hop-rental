<script setup lang="ts">
import { getAdminApiErrorMessage, type AdminApiMeta } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type AdminProductListItem = {
  id: string;
  slug: string;
  type: "sale" | "rental" | "hybrid";
  nameTh: string;
  nameEn: string;
  categoryKeys: string[];
  brand: string;
  thumbnailUrl: string;
  rentalMinDays: number;
  rentalMaxDays: number;
  rentalBufferDays: number;
  storeLocationIds: string[];
  isHidden: boolean;
  updatedAt?: string;
  skuCount: number;
};

const toast = useToast();

const form = reactive({
  id: "",
  slug: "",
  type: "sale" as AdminProductListItem["type"],
  nameTh: "",
  nameEn: "",
  descriptionTh: "",
  descriptionEn: "",
  categoryKeysText: "tools",
  brand: "",
  thumbnailUrl: "",
  rentalMinDays: 1,
  rentalMaxDays: 0,
  rentalBufferDays: 0,
  storeLocationIdsText: "",
  isHidden: false,
});

const creating = ref(false);

const typeOptions = [
  { label: "Sale", value: "sale" },
  { label: "Rental", value: "rental" },
  { label: "Hybrid", value: "hybrid" },
];

const { data, pending, error, refresh } = await useFetch<{
  items: AdminProductListItem[];
  meta?: AdminApiMeta;
}>("/api/admin/products", {
  key: "admin-products",
  default: () => ({ items: [] }),
});

const items = computed(() => data.value?.items ?? []);
const adminMeta = computed(() => data.value?.meta ?? null);
const adminWarning = computed(() => adminMeta.value?.warning ?? null);
const isReadOnlyAdminMode = computed(
  () => adminMeta.value?.adminMode === "read_only",
);
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown admin products error"),
);

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function resetForm() {
  form.id = "";
  form.slug = "";
  form.type = "sale";
  form.nameTh = "";
  form.nameEn = "";
  form.descriptionTh = "";
  form.descriptionEn = "";
  form.categoryKeysText = "tools";
  form.brand = "";
  form.thumbnailUrl = "";
  form.rentalMinDays = 1;
  form.rentalMaxDays = 0;
  form.rentalBufferDays = 0;
  form.storeLocationIdsText = "";
  form.isHidden = false;
}

async function createProduct() {
  if (isReadOnlyAdminMode.value) {
    toast.add({
      title: "Product create unavailable",
      description:
        adminWarning.value?.message ??
        "Admin write mode is unavailable right now.",
      color: "warning",
      icon: "bx:error-circle",
    });
    return;
  }

  creating.value = true;

  try {
    const response = await $fetch<{ item: AdminProductListItem }>(
      "/api/admin/products",
      {
        method: "POST",
        body: {
          id: form.id,
          slug: form.slug,
          type: form.type,
          nameTh: form.nameTh,
          nameEn: form.nameEn,
          descriptionTh: form.descriptionTh,
          descriptionEn: form.descriptionEn,
          categoryKeys: parseCsv(form.categoryKeysText),
          brand: form.brand,
          thumbnailUrl: form.thumbnailUrl,
          rentalMinDays: form.rentalMinDays,
          rentalMaxDays: form.rentalMaxDays,
          rentalBufferDays: form.rentalBufferDays,
          storeLocationIds: parseCsv(form.storeLocationIdsText),
          isHidden: form.isHidden,
        },
      },
    );

    toast.add({
      title: "Product created",
      description: "Open the detail page to add or update SKU rows.",
      color: "success",
      icon: "bx:check-circle",
    });

    resetForm();
    await refresh();
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
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 class="text-lg font-semibold">Products</h2>
            <p class="text-sm text-muted">
              Staff-facing product list with direct links to detail + SKU
              management.
            </p>
          </div>

          <UButton
            color="primary"
            variant="soft"
            size="sm"
            icon="bx:refresh"
            :loading="pending"
            @click="refresh"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <UAlert
        v-if="adminWarning"
        class="mb-4"
        color="warning"
        variant="soft"
        :title="adminWarning.title"
        :description="adminWarning.message"
      />

      <UAlert
        v-if="error"
        class="mb-4"
        color="error"
        variant="soft"
        title="Failed to load products"
        :description="loadErrorMessage"
      />

      <div v-if="pending" class="py-8 text-sm text-muted">
        Loading products...
      </div>

      <div v-else-if="items.length === 0" class="py-8 text-sm text-muted">
        No product rows yet. Create the first product, then add SKU rows in the
        detail page.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="item in items"
          :key="item.id"
          class="rounded-xl border border-default p-4"
        >
          <div
            class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-medium">{{ item.nameTh }}</h3>
                <UBadge color="primary" variant="soft">{{ item.type }}</UBadge>
                <UBadge v-if="item.isHidden" color="neutral" variant="soft">
                  hidden
                </UBadge>
              </div>

              <p class="text-sm text-muted">{{ item.id }} · {{ item.slug }}</p>
              <p class="mt-2 text-sm text-muted">
                Categories: {{ item.categoryKeys.join(", ") || "—" }}
              </p>
              <p class="text-sm text-muted">
                Stores: {{ item.storeLocationIds.join(", ") || "—" }}
              </p>
            </div>

            <div class="flex flex-col gap-3 lg:items-end">
              <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <p class="text-muted">SKU rows</p>
                  <p class="font-medium">{{ item.skuCount }}</p>
                </div>
                <div>
                  <p class="text-muted">Min rental days</p>
                  <p class="font-medium">{{ item.rentalMinDays }}</p>
                </div>
              </div>

              <UButton
                color="primary"
                variant="soft"
                size="sm"
                icon="bx:right-arrow-alt"
                :to="`/admin/products/${item.id}`"
              >
                Open detail
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Create product</h2>
          <p class="text-sm text-muted">
            Minimal product metadata first, then continue to SKU setup.
          </p>
        </div>
      </template>

      <UAlert
        v-if="adminWarning"
        class="mb-4"
        color="warning"
        variant="soft"
        title="Write actions are disabled"
        :description="adminWarning.message"
      />

      <form class="space-y-4" @submit.prevent="createProduct">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Product ID" required>
            <UInput v-model="form.id" placeholder="prod-electric-drill-01" />
          </UFormField>

          <UFormField label="Slug" required>
            <UInput v-model="form.slug" placeholder="electric-drill-pro" />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Type" required>
            <USelectMenu
              v-model="form.type"
              :items="typeOptions"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Brand">
            <UInput v-model="form.brand" placeholder="Makita" />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Name (TH)" required>
            <UInput v-model="form.nameTh" />
          </UFormField>

          <UFormField label="Name (EN)" required>
            <UInput v-model="form.nameEn" />
          </UFormField>
        </div>

        <UFormField label="Description (TH)" required>
          <UTextarea v-model="form.descriptionTh" :rows="3" />
        </UFormField>

        <UFormField label="Description (EN)" required>
          <UTextarea v-model="form.descriptionEn" :rows="3" />
        </UFormField>

        <UFormField label="Category keys (comma separated)" required>
          <UInput
            v-model="form.categoryKeysText"
            placeholder="tools, drilling"
          />
        </UFormField>

        <UFormField label="Thumbnail URL">
          <UInput v-model="form.thumbnailUrl" placeholder="https://..." />
        </UFormField>

        <UFormField label="Store location IDs (comma separated)">
          <UInput
            v-model="form.storeLocationIdsText"
            placeholder="rama3, bangna"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Min rental days">
            <UInput v-model.number="form.rentalMinDays" type="number" min="1" />
          </UFormField>

          <UFormField label="Max rental days (0 = no limit)">
            <UInput v-model.number="form.rentalMaxDays" type="number" min="0" />
          </UFormField>

          <UFormField label="Buffer days">
            <UInput
              v-model.number="form.rentalBufferDays"
              type="number"
              min="0"
            />
          </UFormField>
        </div>

        <UCheckbox
          v-model="form.isHidden"
          label="Hidden from public storefront"
        />

        <div class="flex gap-2">
          <UButton
            type="submit"
            color="primary"
            :loading="creating"
            :disabled="isReadOnlyAdminMode"
          >
            Create product
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
  </div>
</template>
