<script setup lang="ts">
import AdminMediaGalleryManager from "~/components/admin/AdminMediaGalleryManager.vue";
import AdminProductFilterAssignments from "~/components/admin/AdminProductFilterAssignments.vue";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type MediaStatus = "ready" | "processing" | "failed";

type AdminMediaItem = Record<string, unknown>;

type ExistingImageCard = {
  id: string;
  imageUrl: string;
  title: string;
  caption?: string;
  status?: MediaStatus;
  error?: string;
};

type AdminSkuInventoryItem = {
  id: string;
  inventoryId: string;
  inventoryName: string;
  isDefaultInventory: boolean;
  branchId: string;
  branchCode: string;
  branchName: string;
  onHand: number;
  available: number;
  reserved: number;
  incoming: number;
  updatedAt?: string;
};

type BranchOption = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  isActive: boolean;
};

type InventoryOption = {
  id: string;
  branchId: string;
  name: string;
  isDefault: boolean;
};

type AdminSkuItem = {
  id: string;
  productId: string;
  skuCode: string;
  labelTh: string;
  labelEn: string;
  imageUrl: string;
  mediaGallery: AdminMediaItem[];
  useProductImages: boolean;
  attributes: Record<string, unknown>;
  price: number;
  originalPrice: number | null;
  discountPercent: number;
  currencyCode: string;
  pricingTiers: unknown[];
  stock: number;
  inventory: AdminSkuInventoryItem[];
  updatedAt?: string;
};

/* inventory helpers kept lightweight – full management moved to /admin/branches-inventory */

type AdminProductDetail = {
  id: string;
  slug: string;
  type: "sale" | "rental" | "hybrid";
  nameTh: string;
  nameEn: string;
  descriptionTh: string;
  descriptionEn: string;
  mainCategoryKey: string;
  tagKeys: string[];
  searchKeywords: string[];
  brand: string;
  thumbnailUrl: string;
  mediaGallery: AdminMediaItem[];
  spec: Record<string, unknown>;
  detailBlocks: unknown[];
  shippingSize: "free" | "s" | "m" | "l" | "xl";
  isHidden: boolean;
  updatedAt?: string;
  skus: AdminSkuItem[];
};

/* BranchOption type removed – inventory management moved to /admin/branches-inventory */

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

const shippingSizeOptions = [
  { label: "Free (0 ฿)", value: "free" },
  { label: "S (50 ฿)", value: "s" },
  { label: "M (100 ฿)", value: "m" },
  { label: "L (150 ฿)", value: "l" },
  { label: "XL (200 ฿)", value: "xl" },
];

const ADMIN_FORM_GRID_CLASS = "grid gap-4 md:grid-cols-6";
const ADMIN_FIELD_CLASS = "min-w-0 md:col-span-2";
const ADMIN_TEXTAREA_FIELD_CLASS = "min-w-0 md:col-span-3";
const ADMIN_CONTROL_CLASS = "w-full min-w-0";

const productForm = reactive({
  slug: "",
  type: "sale" as AdminProductDetail["type"],
  nameTh: "",
  nameEn: "",
  descriptionTh: "",
  descriptionEn: "",
  mainCategoryKey: "",
  tagKeysText: "",
  searchKeywordsText: "",
  brand: "",
  shippingSize: "s" as AdminProductDetail["shippingSize"],
  isHidden: false,
});

const skuForm = reactive({
  skuCode: "",
  labelTh: "",
  labelEn: "",
  price: 0,
  originalPriceText: "",
  discountPercent: 0,
  currencyCode: "THB",
  useProductImages: true,
});

const specText = ref("{}");
const detailBlocksText = ref("[]");
const skuAttributesText = ref("{}");
const skuPricingTiersText = ref("[]");

const savingProduct = ref(false);
const savingSku = ref(false);
const savingProductMedia = ref(false);
const savingSkuMedia = ref(false);

const editingSkuId = ref<string | null>(null);
const activeSkuId = ref<string | null>(null);

// ── Per-SKU inventory panel state ──
const expandedInventorySkuId = ref<string | null>(null);
const editingStockId = ref<string | null>(null);
const savingStock = ref(false);

const stockForm = reactive({
  branchId: "",
  inventoryId: "",
  onHand: 0,
});

const { data, pending, error, refresh } = await useFetch<{
  product: AdminProductDetail;
}>(productApiPath, {
  key: `admin-product-${productId.value}`,
});

const product = computed(() => data.value?.product ?? null);
const skuItems = computed(() =>
  [...(product.value?.skus ?? [])].sort(
    (a, b) => a.skuCode.localeCompare(b.skuCode) || a.id.localeCompare(b.id),
  ),
);
const activeSku = computed(
  () => skuItems.value.find((item) => item.id === activeSkuId.value) ?? null,
);

// ── Branches list (for inventory picker) ──
const { data: branchesData } = await useFetch<{ items: BranchOption[] }>(
  "/api/admin/branches",
  { key: "admin-product-detail-branches" },
);
const branchOptions = computed(() =>
  (branchesData.value?.items ?? []).filter((b) => b.isActive),
);

// ── Inventories list per selected branch (for inventory picker) ──
const inventoriesApiPath = computed<string | null>(() =>
  stockForm.branchId
    ? `/api/admin/branches/${encodeURIComponent(stockForm.branchId)}/inventories`
    : null,
);
const { data: inventoriesData, pending: inventoriesPending } =
  await useAsyncData<{
    items: InventoryOption[];
  }>(
    "admin-product-detail-inventories",
    async () => {
      const path = inventoriesApiPath.value;
      if (!path) return { items: [] };
      return await $fetch<{ items: InventoryOption[] }>(path as string);
    },
    {
      watch: [inventoriesApiPath],
      immediate: false,
      default: () => ({ items: [] }),
    },
  );
const inventoryOptions = computed(() => inventoriesData.value?.items ?? []);

watch(
  () => stockForm.branchId,
  () => {
    stockForm.inventoryId = "";
  },
);

function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseJsonText<T>(value: string, label: string, fallback: T): T {
  const raw = value.trim();
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function mediaVariantUrl(item: Record<string, unknown>, key: string) {
  const variants = asRecord(item.variants);
  const variant = asRecord(variants[key]);
  return asText(variant.url);
}

function mediaItemUrl(item: Record<string, unknown>) {
  return (
    mediaVariantUrl(item, "card") ||
    mediaVariantUrl(item, "thumbnail") ||
    mediaVariantUrl(item, "large") ||
    asText(item.url)
  );
}

function mapMediaCards(mediaGallery: AdminMediaItem[]): ExistingImageCard[] {
  return (Array.isArray(mediaGallery) ? mediaGallery : []).map(
    (entry, index) => {
      const item = asRecord(entry);
      const status = asText(item.status);
      return {
        id: String(item.id ?? `media-${index}`),
        imageUrl: mediaItemUrl(item),
        title: asText(item.title) || `Image ${index + 1}`,
        caption:
          asText(item.altText) || asText(item.originalFilename) || undefined,
        status:
          status === "processing" || status === "failed" || status === "ready"
            ? status
            : undefined,
        error: asText(item.error) || undefined,
      };
    },
  );
}

function normalizeMediaPositions(mediaGallery: AdminMediaItem[]) {
  return mediaGallery.map((entry, index) => ({
    ...asRecord(entry),
    position: index,
  }));
}

function moveMediaItemToFront(mediaGallery: AdminMediaItem[], imageId: string) {
  const items = mediaGallery.map((entry) => asRecord(entry));
  const selected = items.find((item) => String(item.id ?? "") === imageId);
  if (!selected) return normalizeMediaPositions(items);

  return normalizeMediaPositions([
    selected,
    ...items.filter((item) => String(item.id ?? "") !== imageId),
  ]);
}

function removeMediaItem(mediaGallery: AdminMediaItem[], imageId: string) {
  return normalizeMediaPositions(
    mediaGallery
      .map((entry) => asRecord(entry))
      .filter((item) => String(item.id ?? "") !== imageId),
  );
}

function galleryHasProcessing(mediaGallery: AdminMediaItem[]) {
  return mediaGallery.some((entry) => asRecord(entry).status === "processing");
}

/* inventoryStockTotal removed – inventory management moved to /admin/branches-inventory */

function formatCurrency(value: number, currencyCode = "THB") {
  try {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currencyCode}`;
  }
}

function formatIsoDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function displayedSkuImageUrl(item: AdminSkuItem) {
  if (item.imageUrl) return item.imageUrl;
  if (item.useProductImages) return product.value?.thumbnailUrl || "";
  return "";
}

// ── Inventory management for SKU rows ──
function resetStockForm() {
  editingStockId.value = null;
  stockForm.branchId = "";
  stockForm.inventoryId = "";
  stockForm.onHand = 0;
}

function toggleInventoryPanel(skuId: string) {
  if (expandedInventorySkuId.value === skuId) {
    expandedInventorySkuId.value = null;
    resetStockForm();
  } else {
    expandedInventorySkuId.value = skuId;
    resetStockForm();
  }
}

function fillStockForm(row: AdminSkuInventoryItem) {
  editingStockId.value = row.id;
  stockForm.branchId = row.branchId;
  stockForm.inventoryId = row.inventoryId;
  stockForm.onHand = row.onHand;
}

async function saveStock(sku: AdminSkuItem) {
  if (!stockForm.inventoryId) {
    toast.add({ title: "Please select an inventory", color: "warning" });
    return;
  }
  if (!window.confirm("Confirm stock change?")) return;

  savingStock.value = true;
  try {
    const isEdit = !!editingStockId.value;
    const endpoint = isEdit
      ? `/api/admin/inventories/${encodeURIComponent(stockForm.inventoryId)}/stock/${encodeURIComponent(editingStockId.value!)}`
      : `/api/admin/inventories/${encodeURIComponent(stockForm.inventoryId)}/stock`;

    const body: Record<string, unknown> = {
      onHand: stockForm.onHand,
      available: stockForm.onHand,
    };
    if (!isEdit) {
      body.productId = sku.productId;
      body.skuId = sku.id;
    }

    await $fetch(endpoint, {
      method: isEdit ? "PATCH" : "POST",
      body,
    });

    toast.add({
      title: isEdit ? "Stock updated" : "Stock added",
      color: "success",
      icon: "bx:check-circle",
    });

    await refresh();
    resetStockForm();
  } catch (err) {
    toast.add({
      title: "Stock save failed",
      description: err instanceof Error ? err.message : "Unknown error",
      color: "error",
    });
  } finally {
    savingStock.value = false;
  }
}

async function deleteStockRow(row: AdminSkuInventoryItem) {
  if (
    !window.confirm(
      `Remove this SKU from "${row.inventoryName}" (${row.branchName})?`,
    )
  )
    return;

  savingStock.value = true;
  try {
    await $fetch(
      `/api/admin/inventories/${encodeURIComponent(row.inventoryId)}/stock/${encodeURIComponent(row.id)}`,
      { method: "DELETE" },
    );
    toast.add({
      title: "Stock removed",
      color: "success",
      icon: "bx:check-circle",
    });
    await refresh();
    if (editingStockId.value === row.id) resetStockForm();
  } catch (err) {
    toast.add({
      title: "Delete failed",
      description: err instanceof Error ? err.message : "Unknown error",
      color: "error",
    });
  } finally {
    savingStock.value = false;
  }
}

function fillProductForm(item: AdminProductDetail) {
  productForm.slug = item.slug;
  productForm.type = item.type;
  productForm.nameTh = item.nameTh;
  productForm.nameEn = item.nameEn;
  productForm.descriptionTh = item.descriptionTh;
  productForm.descriptionEn = item.descriptionEn;
  productForm.mainCategoryKey = item.mainCategoryKey;
  productForm.tagKeysText = item.tagKeys.join(", ");
  productForm.searchKeywordsText = item.searchKeywords.join(", ");
  productForm.brand = item.brand;
  productForm.shippingSize = item.shippingSize ?? "s";
  productForm.isHidden = item.isHidden;
  specText.value = JSON.stringify(item.spec ?? {}, null, 2);
  detailBlocksText.value = JSON.stringify(item.detailBlocks ?? [], null, 2);
}

function resetSkuForm() {
  editingSkuId.value = null;
  skuForm.skuCode = "";
  skuForm.labelTh = "";
  skuForm.labelEn = "";
  skuForm.price = 0;
  skuForm.originalPriceText = "";
  skuForm.discountPercent = 0;
  skuForm.currencyCode = "THB";
  skuForm.useProductImages = true;
  skuAttributesText.value = "{}";
  skuPricingTiersText.value = "[]";
}

function fillSkuForm(item: AdminSkuItem) {
  editingSkuId.value = item.id;
  activeSkuId.value = item.id;
  skuForm.skuCode = item.skuCode;
  skuForm.labelTh = item.labelTh;
  skuForm.labelEn = item.labelEn;
  skuForm.price = item.price;
  skuForm.originalPriceText =
    item.originalPrice == null ? "" : String(item.originalPrice);
  skuForm.discountPercent = item.discountPercent;
  skuForm.currencyCode = item.currencyCode || "THB";
  skuForm.useProductImages = item.useProductImages;
  skuAttributesText.value = JSON.stringify(item.attributes ?? {}, null, 2);
  skuPricingTiersText.value = JSON.stringify(item.pricingTiers ?? [], null, 2);
}

watch(
  product,
  (value) => {
    if (value) {
      fillProductForm(value);
    }

    if (
      activeSkuId.value &&
      !value?.skus.some((sku) => sku.id === activeSkuId.value)
    ) {
      activeSkuId.value = null;
    }
  },
  { immediate: true },
);

const productMediaItems = computed(() =>
  mapMediaCards(product.value?.mediaGallery ?? []),
);
const activeSkuMediaItems = computed(() =>
  mapMediaCards(activeSku.value?.mediaGallery ?? []),
);

const hasProcessingMedia = computed(() => {
  if (galleryHasProcessing(product.value?.mediaGallery ?? [])) return true;
  return skuItems.value.some((sku) =>
    galleryHasProcessing(sku.mediaGallery ?? []),
  );
});

let mediaPollingHandle: ReturnType<typeof setInterval> | null = null;

function stopMediaPolling() {
  if (mediaPollingHandle) {
    clearInterval(mediaPollingHandle);
    mediaPollingHandle = null;
  }
}

function startMediaPolling() {
  if (!import.meta.client || mediaPollingHandle) return;
  mediaPollingHandle = setInterval(() => {
    void refresh();
  }, 3000);
}

watch(
  hasProcessingMedia,
  (value) => {
    if (!import.meta.client) return;
    if (value) startMediaPolling();
    else stopMediaPolling();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopMediaPolling();
});

async function saveProduct() {
  if (!product.value) return;

  if (
    productForm.mainCategoryKey !== product.value.mainCategoryKey &&
    !window.confirm(
      "Confirm category change? Existing filter assignments will be cleared.",
    )
  ) {
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
        mainCategoryKey: productForm.mainCategoryKey,
        tagKeys: parseCsv(productForm.tagKeysText),
        searchKeywords: parseCsv(productForm.searchKeywordsText),
        brand: productForm.brand,
        shippingSize: productForm.shippingSize,
        isHidden: productForm.isHidden,
        spec: parseJsonText(specText.value, "spec", {}),
        detailBlocks: parseJsonText(detailBlocksText.value, "detailBlocks", []),
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
      description:
        saveError instanceof Error ? saveError.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingProduct.value = false;
  }
}

async function saveSku() {
  if (!product.value) return;

  savingSku.value = true;

  try {
    const originalPriceText = String(skuForm.originalPriceText ?? "").trim();
    const body = {
      skuCode: skuForm.skuCode,
      labelTh: skuForm.labelTh,
      labelEn: skuForm.labelEn,
      price: skuForm.price,
      originalPrice:
        originalPriceText.length > 0 ? Number(originalPriceText) : null,
      discountPercent: skuForm.discountPercent,
      currencyCode: skuForm.currencyCode,
      useProductImages: skuForm.useProductImages,
      attributes: parseJsonText(skuAttributesText.value, "attributes", {}),
      pricingTiers: parseJsonText(
        skuPricingTiersText.value,
        "pricingTiers",
        [],
      ),
      stock: activeSku.value?.stock ?? 0,
    };

    const result = editingSkuId.value
      ? await $fetch<{ item: AdminSkuItem }>(
          `${skuApiBasePath.value}/${encodeURIComponent(editingSkuId.value)}`,
          { method: "PATCH", body },
        )
      : await $fetch<{ item: AdminSkuItem }>(skuApiBasePath.value, {
          method: "POST",
          body,
        });

    toast.add({
      title: editingSkuId.value ? "SKU updated" : "SKU created",
      color: "success",
      icon: "bx:check-circle",
    });

    activeSkuId.value = result.item.id;
    await refresh();

    const refreshedSku = data.value?.product?.skus.find(
      (sku) => sku.id === result.item.id,
    );
    if (refreshedSku) {
      fillSkuForm(refreshedSku);
    } else {
      resetSkuForm();
    }
  } catch (saveError) {
    toast.add({
      title: editingSkuId.value ? "Update SKU failed" : "Create SKU failed",
      description:
        saveError instanceof Error ? saveError.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingSku.value = false;
  }
}

async function quickCreateDefaultSku() {
  if (!product.value) return;
  if (skuItems.value.length > 0) return;
  if (!window.confirm("Create a default SKU for this product?")) return;

  savingSku.value = true;
  try {
    const labelTh = product.value.nameTh || product.value.nameEn || "Default";
    const labelEn = product.value.nameEn || product.value.nameTh || "Default";
    const skuCode = product.value.slug;

    const result = await $fetch<{ item: AdminSkuItem }>(skuApiBasePath.value, {
      method: "POST",
      body: {
        skuCode,
        labelTh,
        labelEn,
        price: 0,
        originalPrice: null,
        discountPercent: 0,
        currencyCode: "THB",
        useProductImages: true,
        attributes: {},
        pricingTiers: [],
        stock: 0,
      },
    });

    toast.add({
      title: "Default SKU created",
      color: "success",
      icon: "bx:check-circle",
    });

    activeSkuId.value = result.item.id;
    await refresh();

    expandedInventorySkuId.value = result.item.id;
    resetStockForm();

    const refreshedSku = data.value?.product?.skus.find(
      (sku) => sku.id === result.item.id,
    );
    if (refreshedSku) {
      fillSkuForm(refreshedSku);
    }
  } catch (err) {
    toast.add({
      title: "Quick create SKU failed",
      description: err instanceof Error ? err.message : "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingSku.value = false;
  }
}

async function patchProductMediaGallery(mediaGallery: AdminMediaItem[]) {
  savingProductMedia.value = true;

  try {
    await $fetch(productApiPath.value, {
      method: "PATCH",
      body: { mediaGallery },
    });

    await refresh();
  } finally {
    savingProductMedia.value = false;
  }
}

async function patchSkuMediaGallery(
  skuId: string,
  mediaGallery: AdminMediaItem[],
) {
  savingSkuMedia.value = true;

  try {
    await $fetch(`${skuApiBasePath.value}/${encodeURIComponent(skuId)}`, {
      method: "PATCH",
      body: {
        mediaGallery,
        useProductImages: mediaGallery.length === 0,
      },
    });

    await refresh();
  } finally {
    savingSkuMedia.value = false;
  }
}

async function refreshAfterProductUpload() {
  await refresh();
}

async function refreshAfterSkuUpload() {
  await refresh();
}

async function setProductCoverImage(imageId: string) {
  if (!product.value) return;
  await patchProductMediaGallery(
    moveMediaItemToFront(product.value.mediaGallery ?? [], imageId),
  );
}

async function deleteProductImage(imageId: string) {
  if (!product.value) return;
  if (!window.confirm("Delete this product image?")) return;
  await patchProductMediaGallery(
    removeMediaItem(product.value.mediaGallery ?? [], imageId),
  );
}

async function setActiveSkuCoverImage(imageId: string) {
  if (!activeSku.value) return;
  await patchSkuMediaGallery(
    activeSku.value.id,
    moveMediaItemToFront(activeSku.value.mediaGallery ?? [], imageId),
  );
}

async function deleteActiveSkuImage(imageId: string) {
  if (!activeSku.value) return;
  if (!window.confirm("Delete this SKU image?")) return;
  await patchSkuMediaGallery(
    activeSku.value.id,
    removeMediaItem(activeSku.value.mediaGallery ?? [], imageId),
  );
}

/* Inventory CRUD moved to /admin/branches-inventory */
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
      v-if="error"
      color="error"
      variant="soft"
      title="Failed to load product"
      :description="error.message"
    />

    <div v-else-if="pending" class="py-8 text-sm text-muted">
      Loading product...
    </div>

    <template v-else-if="product">
      <UCard>
        <template #header>
          <div
            class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div class="flex items-start gap-4">
              <div
                v-if="product.thumbnailUrl"
                class="hidden h-20 w-20 overflow-hidden rounded-xl border border-default bg-muted sm:block"
              >
                <img
                  :src="product.thumbnailUrl"
                  :alt="product.nameEn || product.nameTh"
                  class="h-full w-full object-cover"
                />
              </div>
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-semibold">{{ product.nameTh }}</h3>
                  <UBadge color="primary" variant="soft">{{
                    product.type
                  }}</UBadge>
                  <UBadge
                    v-if="product.isHidden"
                    color="neutral"
                    variant="soft"
                  >
                    hidden
                  </UBadge>
                </div>
                <p class="text-sm text-muted">
                  {{ product.id }} · {{ product.slug }}
                </p>
                <p class="text-xs text-muted">
                  Updated {{ formatIsoDate(product.updatedAt) }} · SKU rows
                  {{ skuItems.length }}
                </p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm lg:min-w-80">
              <div class="rounded-xl border border-default p-3">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Main category
                </p>
                <p class="mt-1 font-medium">
                  {{ product.mainCategoryKey || "—" }}
                </p>
              </div>
              <div class="rounded-xl border border-default p-3">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Product images
                </p>
                <p class="mt-1 font-medium">
                  {{ product.mediaGallery.length }}
                </p>
              </div>
            </div>
          </div>
        </template>
      </UCard>

      <div
        class="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]"
      >
        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Product details</h3>
              <p class="text-sm text-muted">
                Edit product detail as usual and manage product photos here.
              </p>
            </div>
          </template>

          <form :class="ADMIN_FORM_GRID_CLASS" @submit.prevent="saveProduct">
            <UFormField label="Product ID" :class="ADMIN_FIELD_CLASS">
              <UInput
                :model-value="product.id"
                disabled
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>
            <UFormField label="Slug" required :class="ADMIN_FIELD_CLASS">
              <UInput v-model="productForm.slug" :class="ADMIN_CONTROL_CLASS" />
            </UFormField>
            <UFormField label="Type" required :class="ADMIN_FIELD_CLASS">
              <USelectMenu
                v-model="productForm.type"
                :items="typeOptions"
                value-key="value"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>

            <UFormField label="Brand" :class="ADMIN_FIELD_CLASS">
              <UInput
                v-model="productForm.brand"
                placeholder="DCA"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>
            <UFormField label="Name (TH)" required :class="ADMIN_FIELD_CLASS">
              <UInput
                v-model="productForm.nameTh"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>
            <UFormField label="Name (EN)" required :class="ADMIN_FIELD_CLASS">
              <UInput
                v-model="productForm.nameEn"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>

            <UFormField
              label="Main category key"
              required
              :class="ADMIN_FIELD_CLASS"
            >
              <UInput
                v-model="productForm.mainCategoryKey"
                placeholder="impact_drivers"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>
            <UFormField
              label="Shipping size"
              hint="Used to compute the cart shipping fee via free-unit bin packing."
              :class="ADMIN_FIELD_CLASS"
            >
              <USelectMenu
                v-model="productForm.shippingSize"
                :items="shippingSizeOptions"
                value-key="value"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>
            <UFormField
              label="Hidden from storefront"
              :class="ADMIN_FIELD_CLASS"
            >
              <div class="flex h-10 items-center">
                <UCheckbox v-model="productForm.isHidden" />
              </div>
            </UFormField>

            <UFormField
              label="Description (TH)"
              required
              :class="ADMIN_TEXTAREA_FIELD_CLASS"
            >
              <UTextarea
                v-model="productForm.descriptionTh"
                :rows="3"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>
            <UFormField
              label="Description (EN)"
              required
              :class="ADMIN_TEXTAREA_FIELD_CLASS"
            >
              <UTextarea
                v-model="productForm.descriptionEn"
                :rows="3"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>

            <UFormField
              label="Tags (comma separated)"
              :class="ADMIN_TEXTAREA_FIELD_CLASS"
            >
              <UTextarea
                v-model="productForm.tagKeysText"
                :rows="3"
                placeholder="impact_driver, brushless"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>
            <UFormField
              label="Search keywords (comma separated)"
              :class="ADMIN_TEXTAREA_FIELD_CLASS"
            >
              <UTextarea
                v-model="productForm.searchKeywordsText"
                :rows="3"
                placeholder="cordless drill, one key"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>

            <UFormField
              label="Shared spec JSONB"
              :class="ADMIN_TEXTAREA_FIELD_CLASS"
            >
              <UTextarea
                v-model="specText"
                :rows="6"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>

            <UFormField
              label="Detail blocks JSONB"
              :class="ADMIN_TEXTAREA_FIELD_CLASS"
            >
              <UTextarea
                v-model="detailBlocksText"
                :rows="6"
                :class="ADMIN_CONTROL_CLASS"
              />
            </UFormField>

            <div class="flex gap-2 md:col-span-6">
              <UButton type="submit" color="primary" :loading="savingProduct">
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

        <AdminMediaGalleryManager
          title="Product pictures"
          description="Manage product gallery images. The first image is the storefront cover."
          :upload-endpoint="`${productApiPath}/media`"
          :existing-items="productMediaItems"
          empty-message="No product images yet"
          :disabled="savingProduct"
          :existing-actions-disabled="savingProductMedia"
          @uploaded="refreshAfterProductUpload"
          @set-cover-existing="setProductCoverImage"
          @remove-existing="deleteProductImage"
        />

        <UCard>
          <template #header>
            <div>
              <h3 class="text-lg font-semibold">Filter options</h3>
              <p class="text-sm text-muted">
                Read-only preview. Filter assignments are auto-derived from the
                product's tags; number-range filters are auto-derived from spec
                values.
              </p>
            </div>
          </template>

          <AdminProductFilterAssignments
            :product-id="product.id"
            :main-category-key="product.mainCategoryKey"
          />
        </UCard>
      </div>

      <div
        class="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]"
      >
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-lg font-semibold">SKU rows</h3>
                <p class="text-sm text-muted">
                  Edit SKU details, add SKU photos, and manage inventory per
                  branch.
                </p>
              </div>
              <UButton
                color="primary"
                variant="soft"
                size="sm"
                icon="bx:refresh"
                @click="() => refresh()"
              >
                Refresh
              </UButton>
            </div>
          </template>

          <div
            v-if="skuItems.length === 0"
            class="space-y-4 rounded-xl border border-dashed border-default bg-muted/30 p-6"
          >
            <div class="space-y-1">
              <p class="text-sm font-medium">No SKU yet</p>
              <p class="text-sm text-muted">
                ผลิตภัณฑ์นี้ยังไม่มี SKU จึงยังเข้า inventory ไม่ได้ — สร้าง
                default SKU เพื่อเริ่มจัดการ stock ได้ทันที (ใช้ชื่อและรูปจาก
                product, ราคาเริ่มต้น 0)
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                color="primary"
                icon="bx:bolt-circle"
                :loading="savingSku"
                @click="quickCreateDefaultSku"
              >
                Quick create default SKU
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                icon="bx:edit"
                :disabled="savingSku"
                @click="resetSkuForm"
              >
                Custom create (use form →)
              </UButton>
            </div>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="sku in skuItems"
              :key="sku.id"
              class="rounded-xl border border-default p-4"
            >
              <div
                class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
              >
                <div class="flex gap-4">
                  <div
                    class="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-default bg-muted"
                  >
                    <img
                      v-if="displayedSkuImageUrl(sku)"
                      :src="displayedSkuImageUrl(sku)"
                      :alt="sku.labelEn || sku.labelTh"
                      class="h-full w-full object-cover"
                    />
                    <div
                      v-else
                      class="flex h-full items-center justify-center px-3 text-center text-xs text-muted"
                    >
                      No preview
                    </div>
                  </div>

                  <div class="space-y-2">
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h4 class="font-medium">{{ sku.labelTh }}</h4>
                        <UBadge color="primary" variant="soft">{{
                          sku.skuCode
                        }}</UBadge>
                        <UBadge
                          v-if="sku.useProductImages"
                          color="neutral"
                          variant="soft"
                        >
                          uses product images
                        </UBadge>
                      </div>
                      <p class="text-sm text-muted">
                        {{ sku.id }} · {{ sku.labelEn }}
                      </p>
                    </div>

                    <div
                      class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4"
                    >
                      <div>
                        <p class="text-muted">Price</p>
                        <p class="font-medium">
                          {{ formatCurrency(sku.price, sku.currencyCode) }}
                        </p>
                      </div>
                      <div>
                        <p class="text-muted">Original</p>
                        <p class="font-medium">
                          {{
                            sku.originalPrice == null
                              ? "—"
                              : formatCurrency(
                                  sku.originalPrice,
                                  sku.currencyCode,
                                )
                          }}
                        </p>
                      </div>
                      <div>
                        <p class="text-muted">Stock</p>
                        <p class="font-medium">{{ sku.stock }}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <UButton
                    color="primary"
                    variant="soft"
                    size="sm"
                    icon="bx:edit"
                    @click="fillSkuForm(sku)"
                  >
                    Edit SKU
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="soft"
                    size="sm"
                    :icon="
                      expandedInventorySkuId === sku.id
                        ? 'bx:chevron-up'
                        : 'bx:box'
                    "
                    @click="toggleInventoryPanel(sku.id)"
                  >
                    {{
                      expandedInventorySkuId === sku.id
                        ? "Hide inventory"
                        : "Manage inventory"
                    }}
                  </UButton>
                </div>
              </div>

              <!-- ── Inventory panel (expanded per SKU) ── -->
              <div
                v-if="expandedInventorySkuId === sku.id"
                class="mt-4 space-y-4 rounded-xl border border-default bg-muted/30 p-4"
              >
                <!-- Existing stock rows -->
                <div
                  v-if="sku.inventory.length === 0"
                  class="text-sm text-muted"
                >
                  No inventory rows yet for this SKU. Add one below.
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="row in sku.inventory"
                    :key="row.id"
                    class="rounded-lg border border-default bg-elevated p-3"
                  >
                    <div
                      class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="font-medium truncate">
                            {{ row.branchName }} · {{ row.inventoryName }}
                          </p>
                          <UBadge
                            v-if="row.isDefaultInventory"
                            color="primary"
                            variant="soft"
                            size="xs"
                            >default</UBadge
                          >
                          <UBadge color="neutral" variant="soft" size="xs">
                            {{ row.branchCode }}
                          </UBadge>
                        </div>
                        <p class="text-xs text-muted">
                          Updated {{ formatIsoDate(row.updatedAt) }}
                        </p>
                      </div>
                      <div class="flex items-center gap-4 text-sm">
                        <div class="text-center">
                          <p class="text-xs text-muted">On hand</p>
                          <p class="font-semibold">{{ row.onHand }}</p>
                        </div>
                        <div class="text-center">
                          <p class="text-xs text-muted">Available</p>
                          <p class="font-semibold text-primary">
                            {{ row.available }}
                          </p>
                        </div>
                        <div class="text-center">
                          <p class="text-xs text-muted">Reserved</p>
                          <p class="font-semibold">{{ row.reserved }}</p>
                        </div>
                        <div class="flex gap-1">
                          <UButton
                            size="xs"
                            variant="soft"
                            color="primary"
                            icon="bx:edit"
                            @click="fillStockForm(row)"
                          />
                          <UButton
                            size="xs"
                            variant="soft"
                            color="error"
                            icon="bx:trash"
                            @click="deleteStockRow(row)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Add / edit form -->
                <form
                  class="grid gap-3 border-t border-default pt-3 md:grid-cols-6"
                  @submit.prevent="saveStock(sku)"
                >
                  <p class="text-sm font-medium md:col-span-6">
                    {{ editingStockId ? "Edit stock row" : "Add to inventory" }}
                  </p>
                  <UFormField
                    label="Branch"
                    required
                    :class="ADMIN_FIELD_CLASS"
                  >
                    <USelectMenu
                      v-model="stockForm.branchId"
                      :items="branchOptions"
                      value-key="id"
                      label-key="nameTh"
                      placeholder="Select branch"
                      :disabled="!!editingStockId"
                      :class="ADMIN_CONTROL_CLASS"
                    />
                  </UFormField>
                  <UFormField
                    label="Inventory"
                    required
                    :class="ADMIN_FIELD_CLASS"
                  >
                    <USelectMenu
                      v-model="stockForm.inventoryId"
                      :items="inventoryOptions"
                      value-key="id"
                      label-key="name"
                      :placeholder="
                        stockForm.branchId
                          ? inventoriesPending
                            ? 'Loading...'
                            : 'Select inventory'
                          : 'Select branch first'
                      "
                      :disabled="!stockForm.branchId || !!editingStockId"
                      :class="ADMIN_CONTROL_CLASS"
                    />
                  </UFormField>
                  <UFormField
                    label="On hand"
                    required
                    :class="ADMIN_FIELD_CLASS"
                  >
                    <UInput
                      v-model.number="stockForm.onHand"
                      type="number"
                      min="0"
                      :class="ADMIN_CONTROL_CLASS"
                    />
                  </UFormField>
                  <div class="flex gap-2 md:col-span-6">
                    <UButton
                      type="submit"
                      color="primary"
                      size="sm"
                      :loading="savingStock"
                      :disabled="!stockForm.inventoryId"
                    >
                      {{ editingStockId ? "Save stock" : "Add to inventory" }}
                    </UButton>
                    <UButton
                      v-if="editingStockId"
                      type="button"
                      variant="soft"
                      color="neutral"
                      size="sm"
                      @click="resetStockForm"
                    >
                      Cancel edit
                    </UButton>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </UCard>

        <div class="space-y-6">
          <UCard>
            <template #header>
              <div>
                <h3 class="text-lg font-semibold">
                  {{ editingSkuId ? "Edit SKU" : "Create SKU" }}
                </h3>
                <p class="text-sm text-muted">
                  SKU edit stays here. Photo manager appears for the selected
                  SKU. Inventory is managed in Branch &amp; Inventory.
                </p>
              </div>
            </template>

            <form :class="ADMIN_FORM_GRID_CLASS" @submit.prevent="saveSku">
              <UFormField label="SKU code" required :class="ADMIN_FIELD_CLASS">
                <UInput
                  v-model="skuForm.skuCode"
                  placeholder="SKU-DRILL-01"
                  :class="ADMIN_CONTROL_CLASS"
                />
              </UFormField>
              <UFormField label="Currency code" :class="ADMIN_FIELD_CLASS">
                <UInput
                  v-model="skuForm.currencyCode"
                  placeholder="THB"
                  :class="ADMIN_CONTROL_CLASS"
                />
              </UFormField>
              <UFormField
                label="Label (TH)"
                required
                :class="ADMIN_FIELD_CLASS"
              >
                <UInput
                  v-model="skuForm.labelTh"
                  :class="ADMIN_CONTROL_CLASS"
                />สกุลก็ได้ถ้ายาว
              </UFormField>

              <UFormField
                label="Label (EN)"
                required
                :class="ADMIN_FIELD_CLASS"
              >
                <UInput
                  v-model="skuForm.labelEn"
                  :class="ADMIN_CONTROL_CLASS"
                />
              </UFormField>
              <UFormField label="Price" required :class="ADMIN_FIELD_CLASS">
                <UInput
                  v-model.number="skuForm.price"
                  type="number"
                  min="0"
                  :class="ADMIN_CONTROL_CLASS"
                />
              </UFormField>
              <UFormField label="Original price" :class="ADMIN_FIELD_CLASS">
                <UInput
                  v-model="skuForm.originalPriceText"
                  type="text"
                  inputmode="decimal"
                  placeholder="optional"
                  :class="ADMIN_CONTROL_CLASS"
                />
              </UFormField>

              <UFormField label="Discount %" :class="ADMIN_FIELD_CLASS">
                <UInput
                  v-model.number="skuForm.discountPercent"
                  type="number"
                  min="0"
                  max="100"
                  :class="ADMIN_CONTROL_CLASS"
                />
              </UFormField>
              <div class="flex items-center md:col-span-4">
                <UCheckbox
                  v-model="skuForm.useProductImages"
                  label="Use product images when this SKU has no custom gallery"
                />
              </div>

              <UFormField
                label="SKU attributes JSONB"
                :class="ADMIN_TEXTAREA_FIELD_CLASS"
              >
                <UTextarea
                  v-model="skuAttributesText"
                  :rows="5"
                  :class="ADMIN_CONTROL_CLASS"
                />
              </UFormField>

              <UFormField
                label="Pricing tiers JSONB"
                :class="ADMIN_TEXTAREA_FIELD_CLASS"
              >
                <UTextarea
                  v-model="skuPricingTiersText"
                  :rows="5"
                  :class="ADMIN_CONTROL_CLASS"
                />
              </UFormField>

              <div class="flex gap-2 md:col-span-6">
                <UButton type="submit" color="primary" :loading="savingSku">
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

          <template v-if="activeSku">
            <UAlert
              v-if="
                activeSku.useProductImages &&
                activeSku.mediaGallery.length === 0
              "
              color="neutral"
              variant="soft"
              title="This SKU currently falls back to the product gallery"
              description="Upload a custom SKU image to create a dedicated gallery automatically."
            />

            <AdminMediaGalleryManager
              title="SKU pictures"
              :description="`Manage gallery for ${activeSku.skuCode}.`"
              :upload-endpoint="`${skuApiBasePath}/${encodeURIComponent(activeSku.id)}/media`"
              :existing-items="activeSkuMediaItems"
              empty-message="No custom SKU images yet"
              :disabled="savingSku"
              :existing-actions-disabled="savingSkuMedia"
              @uploaded="refreshAfterSkuUpload"
              @set-cover-existing="setActiveSkuCoverImage"
              @remove-existing="deleteActiveSkuImage"
            />
          </template>

          <UAlert
            v-else
            color="neutral"
            variant="soft"
            title="SKU photo manager appears after selecting a SKU"
            description="Create a SKU first, or click Edit SKU on an existing row."
          />
        </div>
      </div>
    </template>
  </div>
</template>
