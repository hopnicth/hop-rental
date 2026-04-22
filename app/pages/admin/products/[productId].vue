<script setup lang="ts">
import { getAdminApiErrorMessage, type AdminApiMeta } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type AdminSkuItem = {
  id: string;
  productId: string;
  labelTh: string;
  labelEn: string;
  imageUrl: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number;
  rentalDeposit: number;
  rentalDaily: number;
  rentalWeekly: number;
  rentalMonthly: number;
  stock: number;
  rentalStock: number;
  reservedStock: number;
  createdAt?: string;
  updatedAt?: string;
};

type AdminProductDetail = {
  id: string;
  slug: string;
  type: "sale" | "rental" | "hybrid";
  nameTh: string;
  nameEn: string;
  descriptionTh: string;
  descriptionEn: string;
  categoryKeys: string[];
  brand: string;
  thumbnailUrl: string;
  rentalMinDays: number;
  rentalMaxDays: number;
  rentalBufferDays: number;
  storeLocationIds: string[];
  isHidden: boolean;
  createdAt?: string;
  updatedAt?: string;
  skus: AdminSkuItem[];
};

const route = useRoute();
const toast = useToast();

const productId = computed(() => String(route.params.productId ?? ""));
const productApiPath = computed(
  () => `/api/admin/products/${encodeURIComponent(productId.value)}`,
);
const skuApiBasePath = computed(() => `${productApiPath.value}/skus`);

const typeOptions = [
  { label: "Sale", value: "sale" },
  { label: "Rental", value: "rental" },
  { label: "Hybrid", value: "hybrid" },
];

const productForm = reactive({
  slug: "",
  type: "sale" as AdminProductDetail["type"],
  nameTh: "",
  nameEn: "",
  descriptionTh: "",
  descriptionEn: "",
  categoryKeysText: "",
  brand: "",
  thumbnailUrl: "",
  rentalMinDays: 1,
  rentalMaxDays: 0,
  rentalBufferDays: 0,
  storeLocationIdsText: "",
  isHidden: false,
});

const skuForm = reactive({
  id: "",
  labelTh: "",
  labelEn: "",
  imageUrl: "",
  price: 0,
  originalPrice: null as number | null,
  discountPercent: 0,
  rentalDeposit: 0,
  rentalDaily: 0,
  rentalWeekly: 0,
  rentalMonthly: 0,
  stock: 0,
  rentalStock: 0,
  reservedStock: 0,
});

const savingProduct = ref(false);
const savingSku = ref(false);
const editingSkuId = ref<string | null>(null);

const { data, pending, error, refresh } = await useFetch<{
  product: AdminProductDetail;
  meta?: AdminApiMeta;
}>(productApiPath, {
  key: `admin-product-${productId.value}`,
});

const product = computed(() => data.value?.product ?? null);
const adminMeta = computed(() => data.value?.meta ?? null);
const adminWarning = computed(() => adminMeta.value?.warning ?? null);
const isReadOnlyAdminMode = computed(
  () => adminMeta.value?.adminMode === "read_only",
);
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown admin product error"),
);
const skuItems = computed(() =>
  [...(product.value?.skus ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
);

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function fillProductForm(item: AdminProductDetail) {
  productForm.slug = item.slug;
  productForm.type = item.type;
  productForm.nameTh = item.nameTh;
  productForm.nameEn = item.nameEn;
  productForm.descriptionTh = item.descriptionTh;
  productForm.descriptionEn = item.descriptionEn;
  productForm.categoryKeysText = item.categoryKeys.join(", ");
  productForm.brand = item.brand;
  productForm.thumbnailUrl = item.thumbnailUrl;
  productForm.rentalMinDays = item.rentalMinDays;
  productForm.rentalMaxDays = item.rentalMaxDays;
  productForm.rentalBufferDays = item.rentalBufferDays;
  productForm.storeLocationIdsText = item.storeLocationIds.join(", ");
  productForm.isHidden = item.isHidden;
}

function resetSkuForm() {
  editingSkuId.value = null;
  skuForm.id = "";
  skuForm.labelTh = "";
  skuForm.labelEn = "";
  skuForm.imageUrl = "";
  skuForm.price = 0;
  skuForm.originalPrice = null;
  skuForm.discountPercent = 0;
  skuForm.rentalDeposit = 0;
  skuForm.rentalDaily = 0;
  skuForm.rentalWeekly = 0;
  skuForm.rentalMonthly = 0;
  skuForm.stock = 0;
  skuForm.rentalStock = 0;
  skuForm.reservedStock = 0;
}

function editSku(item: AdminSkuItem) {
  editingSkuId.value = item.id;
  skuForm.id = item.id;
  skuForm.labelTh = item.labelTh;
  skuForm.labelEn = item.labelEn;
  skuForm.imageUrl = item.imageUrl;
  skuForm.price = item.price;
  skuForm.originalPrice = item.originalPrice;
  skuForm.discountPercent = item.discountPercent;
  skuForm.rentalDeposit = item.rentalDeposit;
  skuForm.rentalDaily = item.rentalDaily;
  skuForm.rentalWeekly = item.rentalWeekly;
  skuForm.rentalMonthly = item.rentalMonthly;
  skuForm.stock = item.stock;
  skuForm.rentalStock = item.rentalStock;
  skuForm.reservedStock = item.reservedStock;
}

watch(
  product,
  (value) => {
    if (value) {
      fillProductForm(value);
    }
  },
  { immediate: true },
);

async function saveProduct() {
  if (!product.value) return;

  if (isReadOnlyAdminMode.value) {
    toast.add({
      title: "Product save unavailable",
      description:
        adminWarning.value?.message ??
        "Admin write mode is unavailable right now.",
      color: "warning",
      icon: "bx:error-circle",
    });
    return;
  }

  savingProduct.value = true;

  try {
    await $fetch(productApiPath.value, {
      method: "PATCH",
      body: {
        slug: productForm.slug,
        type: productForm.type,
        nameTh: productForm.nameTh,
        nameEn: productForm.nameEn,
        descriptionTh: productForm.descriptionTh,
        descriptionEn: productForm.descriptionEn,
        categoryKeys: parseCsv(productForm.categoryKeysText),
        brand: productForm.brand,
        thumbnailUrl: productForm.thumbnailUrl,
        rentalMinDays: productForm.rentalMinDays,
        rentalMaxDays: productForm.rentalMaxDays,
        rentalBufferDays: productForm.rentalBufferDays,
        storeLocationIds: parseCsv(productForm.storeLocationIdsText),
        isHidden: productForm.isHidden,
      },
    });

    toast.add({
      title: "Product updated",
      color: "success",
      icon: "bx:check-circle",
    });

    await refresh();
  } catch (saveError) {
    toast.add({
      title: "Save product failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingProduct.value = false;
  }
}

async function saveSku() {
  if (!product.value) return;

  if (isReadOnlyAdminMode.value) {
    toast.add({
      title: editingSkuId.value
        ? "SKU update unavailable"
        : "SKU create unavailable",
      description:
        adminWarning.value?.message ??
        "Admin write mode is unavailable right now.",
      color: "warning",
      icon: "bx:error-circle",
    });
    return;
  }

  savingSku.value = true;

  try {
    const body = {
      id: skuForm.id,
      labelTh: skuForm.labelTh,
      labelEn: skuForm.labelEn,
      imageUrl: skuForm.imageUrl,
      price: skuForm.price,
      originalPrice: skuForm.originalPrice,
      discountPercent: skuForm.discountPercent,
      rentalDeposit: skuForm.rentalDeposit,
      rentalDaily: skuForm.rentalDaily,
      rentalWeekly: skuForm.rentalWeekly,
      rentalMonthly: skuForm.rentalMonthly,
      stock: skuForm.stock,
      rentalStock: skuForm.rentalStock,
      reservedStock: skuForm.reservedStock,
    };

    if (editingSkuId.value) {
      await $fetch(
        `${skuApiBasePath.value}/${encodeURIComponent(editingSkuId.value)}`,
        {
          method: "PATCH",
          body,
        },
      );
    } else {
      await $fetch(skuApiBasePath.value, {
        method: "POST",
        body,
      });
    }

    toast.add({
      title: editingSkuId.value ? "SKU updated" : "SKU created",
      color: "success",
      icon: "bx:check-circle",
    });

    resetSkuForm();
    await refresh();
  } catch (saveError) {
    toast.add({
      title: editingSkuId.value ? "Update SKU failed" : "Create SKU failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingSku.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm text-muted">Admin / Products</p>
        <h2 class="text-xl font-semibold">Product detail</h2>
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
      title="Failed to load product"
      :description="loadErrorMessage"
    />

    <div v-else-if="pending" class="py-8 text-sm text-muted">
      Loading product...
    </div>

    <template v-else-if="product">
      <UCard>
        <template #header>
          <div
            class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg font-semibold">{{ product.nameTh }}</h3>
                <UBadge color="primary" variant="soft">{{
                  product.type
                }}</UBadge>
                <UBadge v-if="product.isHidden" color="neutral" variant="soft">
                  hidden
                </UBadge>
              </div>
              <p class="text-sm text-muted">
                {{ product.id }} · {{ product.slug }}
              </p>
            </div>

            <div class="text-sm text-muted">
              SKU rows: {{ skuItems.length }}
            </div>
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

        <form class="space-y-4" @submit.prevent="saveProduct">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Product ID">
              <UInput :model-value="product.id" disabled />
            </UFormField>

            <UFormField label="Slug" required>
              <UInput v-model="productForm.slug" />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Type" required>
              <USelectMenu
                v-model="productForm.type"
                :items="typeOptions"
                value-key="value"
              />
            </UFormField>

            <UFormField label="Brand">
              <UInput v-model="productForm.brand" />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Name (TH)" required>
              <UInput v-model="productForm.nameTh" />
            </UFormField>

            <UFormField label="Name (EN)" required>
              <UInput v-model="productForm.nameEn" />
            </UFormField>
          </div>

          <UFormField label="Description (TH)" required>
            <UTextarea v-model="productForm.descriptionTh" :rows="3" />
          </UFormField>

          <UFormField label="Description (EN)" required>
            <UTextarea v-model="productForm.descriptionEn" :rows="3" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Category keys (comma separated)" required>
              <UInput v-model="productForm.categoryKeysText" />
            </UFormField>

            <UFormField label="Store location IDs (comma separated)">
              <UInput v-model="productForm.storeLocationIdsText" />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Thumbnail URL">
              <UInput
                v-model="productForm.thumbnailUrl"
                placeholder="https://..."
              />
            </UFormField>

            <UFormField label="Hidden from storefront">
              <div class="flex h-10 items-center">
                <UCheckbox v-model="productForm.isHidden" />
              </div>
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Min rental days">
              <UInput
                v-model.number="productForm.rentalMinDays"
                type="number"
                min="1"
              />
            </UFormField>

            <UFormField label="Max rental days (0 = no limit)">
              <UInput
                v-model.number="productForm.rentalMaxDays"
                type="number"
                min="0"
              />
            </UFormField>

            <UFormField label="Buffer days">
              <UInput
                v-model.number="productForm.rentalBufferDays"
                type="number"
                min="0"
              />
            </UFormField>
          </div>

          <div class="flex gap-2">
            <UButton
              type="submit"
              color="primary"
              :loading="savingProduct"
              :disabled="isReadOnlyAdminMode"
            >
              Save product
            </UButton>
            <UButton
              type="button"
              variant="soft"
              color="neutral"
              @click="fillProductForm(product)"
            >
              Reset changes
            </UButton>
          </div>
        </form>
      </UCard>

      <div
        class="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]"
      >
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-lg font-semibold">SKU rows</h3>
                <p class="text-sm text-muted">
                  Manage pricing and stock variants under this product.
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

          <div v-if="skuItems.length === 0" class="py-8 text-sm text-muted">
            No SKU rows yet. Create the first SKU using the form.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="sku in skuItems"
              :key="sku.id"
              class="rounded-xl border border-default p-4"
            >
              <div
                class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
              >
                <div>
                  <h4 class="font-medium">{{ sku.labelTh }}</h4>
                  <p class="text-sm text-muted">
                    {{ sku.id }} · {{ sku.labelEn }}
                  </p>
                  <p
                    v-if="sku.imageUrl"
                    class="mt-2 text-xs text-muted break-all"
                  >
                    {{ sku.imageUrl }}
                  </p>
                </div>

                <div class="flex items-start gap-6">
                  <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <p class="text-muted">Price</p>
                      <p class="font-medium">{{ sku.price }}</p>
                    </div>
                    <div>
                      <p class="text-muted">Discount %</p>
                      <p class="font-medium">{{ sku.discountPercent }}</p>
                    </div>
                    <div>
                      <p class="text-muted">Stock</p>
                      <p class="font-medium">{{ sku.stock }}</p>
                    </div>
                    <div>
                      <p class="text-muted">Rental stock</p>
                      <p class="font-medium">{{ sku.rentalStock }}</p>
                    </div>
                  </div>

                  <UButton
                    color="primary"
                    variant="soft"
                    size="sm"
                    icon="bx:edit"
                    :disabled="isReadOnlyAdminMode"
                    @click="editSku(sku)"
                  >
                    Edit
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">
                {{ editingSkuId ? "Edit SKU" : "Create SKU" }}
              </h3>
              <p class="text-sm text-muted">
                Minimal pricing + stock fields from `product_skus`.
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

          <form class="space-y-4" @submit.prevent="saveSku">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="SKU ID" :required="!editingSkuId">
                <UInput
                  v-model="skuForm.id"
                  :disabled="Boolean(editingSkuId)"
                />
              </UFormField>

              <UFormField label="Image URL">
                <UInput v-model="skuForm.imageUrl" placeholder="https://..." />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Label (TH)" required>
                <UInput v-model="skuForm.labelTh" />
              </UFormField>

              <UFormField label="Label (EN)" required>
                <UInput v-model="skuForm.labelEn" />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField label="Price" required>
                <UInput v-model.number="skuForm.price" type="number" min="0" />
              </UFormField>

              <UFormField label="Original price">
                <UInput
                  v-model.number="skuForm.originalPrice"
                  type="number"
                  min="0"
                />
              </UFormField>

              <UFormField label="Discount %">
                <UInput
                  v-model.number="skuForm.discountPercent"
                  type="number"
                  min="0"
                  max="100"
                />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-4">
              <UFormField label="Rental deposit">
                <UInput
                  v-model.number="skuForm.rentalDeposit"
                  type="number"
                  min="0"
                />
              </UFormField>

              <UFormField label="Rental daily">
                <UInput
                  v-model.number="skuForm.rentalDaily"
                  type="number"
                  min="0"
                />
              </UFormField>

              <UFormField label="Rental weekly">
                <UInput
                  v-model.number="skuForm.rentalWeekly"
                  type="number"
                  min="0"
                />
              </UFormField>

              <UFormField label="Rental monthly">
                <UInput
                  v-model.number="skuForm.rentalMonthly"
                  type="number"
                  min="0"
                />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField label="Sale stock">
                <UInput v-model.number="skuForm.stock" type="number" min="0" />
              </UFormField>

              <UFormField label="Rental stock">
                <UInput
                  v-model.number="skuForm.rentalStock"
                  type="number"
                  min="0"
                />
              </UFormField>

              <UFormField label="Reserved stock">
                <UInput
                  v-model.number="skuForm.reservedStock"
                  type="number"
                  min="0"
                />
              </UFormField>
            </div>

            <div class="flex gap-2">
              <UButton
                type="submit"
                color="primary"
                :loading="savingSku"
                :disabled="isReadOnlyAdminMode"
              >
                {{ editingSkuId ? "Update SKU" : "Create SKU" }}
              </UButton>
              <UButton
                type="button"
                variant="soft"
                color="neutral"
                @click="resetSkuForm"
              >
                Reset
              </UButton>
            </div>
          </form>
        </UCard>
      </div>
    </template>
  </div>
</template>
