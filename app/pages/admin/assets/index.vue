<script setup lang="ts">
import AdminAssetDetailBlocksEditor from "~/components/admin/AdminAssetDetailBlocksEditor.vue";
import AdminCommaSuggestInput from "~/components/admin/AdminCommaSuggestInput.vue";
import AdminMediaGalleryManager from "~/components/admin/AdminMediaGalleryManager.vue";
import type { AssetDetailBlock } from "~/types/asset";
import { getAdminApiErrorMessage, type AdminApiMeta } from "~/utils/admin-api";

type SuggestionItem = {
  value: string;
  label: string;
  source: string;
  sourceLabel: string;
  description?: string | null;
};

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

function normalizeKeywordValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type AssetStatus = "draft" | "active" | "archived";

type ListItem = {
  id: string;
  code: string;
  slug: string;
  status: AssetStatus;
  nameTh: string;
  nameEn: string;
  nameCn: string;
  nameJp: string;
  brand: string;
  thumbnailUrl: string;
  mainCategoryKey: string;
  tagKeys: string[];
  categoryKeys: string[];
  searchKeywords: string[];
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  depositAmount: number;
  currencyCode: string;
  minRentalDays: number;
  maxRentalDays: number;
  bufferDays: number;
  storageLocationCode: string;
  storageBranchId: string;
  storageInventoryId: string;
  isHidden: boolean;
  sortOrder: number;
  updatedAt?: string;
  matchCount: number;
};

type Detail = ListItem & {
  descriptionTh: string;
  descriptionEn: string;
  descriptionCn: string;
  descriptionJp: string;
  imageUrls: string[];
  specSummary: Record<string, unknown>;
  detailBlocks: AssetDetailBlock[];
  pricingModel: string;
  storageLocationNote: string;
  serviceCycleValue: number;
  serviceCycleUnit: string;
  lastServicedAt: string;
  nextServiceDueAt: string;
  viewCount: number;
  rentalCount: number;
  lastRentedAt: string;
  createdAt?: string;
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
  isDefaultRental: boolean;
};

type SelectOption = {
  value: string;
  label: string;
  isHidden?: boolean;
};

type MatchItem = {
  id: string;
  assetId: string;
  productId: string;
  matchType: string;
  sortOrder: number;
  note: string;
  productLabel: string;
  productHidden: boolean;
  updatedAt?: string;
};

type FormState = {
  code: string;
  slug: string;
  status: AssetStatus;
  nameTh: string;
  nameEn: string;
  nameCn: string;
  nameJp: string;
  descriptionTh: string;
  descriptionEn: string;
  descriptionCn: string;
  descriptionJp: string;
  mainCategoryKey: string;
  tagKeys: string[];
  searchKeywords: string[];
  brand: string;
  thumbnailUrl: string;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  depositAmount: number;
  minRentalDays: number;
  maxRentalDays: number;
  bufferDays: number;
  storageLocationCode: string;
  storageLocationNote: string;
  storageBranchId: string;
  storageInventoryId: string;
  serviceCycleValue: number;
  serviceCycleUnit: "" | "day" | "week" | "month" | "year";
  lastServicedAt: string;
  nextServiceDueAt: string;
  sortOrder: number;
  isHidden: boolean;
  detailBlocks: AssetDetailBlock[];
};

const toast = useToast();
const { profile } = useUserProfile();
const formatter = new Intl.NumberFormat("th-TH");
const searchQuery = ref("");
const selectedCategory = ref("all");
const visibilityFilter = ref("all");
const statusFilter = ref("all");

const { data, pending, error, refresh } = await useFetch<{
  items: ListItem[];
  meta?: AdminApiMeta;
}>("/api/admin/assets", {
  key: "admin-assets",
  default: () => ({ items: [] }),
});

const { data: mainCategoriesData } = await useFetch<{
  items: Array<{
    key: string;
    labelTh: string;
    labelEn: string;
    isActive: boolean;
  }>;
  options: Array<{ value: string; label: string }>;
}>("/api/admin/main-categories", {
  key: "admin-assets-main-categories",
  query: { entityType: "asset" },
  default: () => ({ items: [], options: [] }),
});

const mainCategoryOptions = computed(
  () => mainCategoriesData.value?.options ?? [],
);

const categoryLabelMap = computed(() => {
  return Object.fromEntries(
    (mainCategoriesData.value?.items ?? []).map((item) => [
      item.key,
      item.labelTh || item.labelEn || item.key,
    ]),
  );
});

const categoryOptions = computed(() => [
  { label: "All main categories", value: "all" },
  ...((mainCategoriesData.value?.options ?? []) as Array<{
    label: string;
    value: string;
  }>),
]);

const { data: suggestionData } = await useFetch<{
  tagSuggestions: SuggestionItem[];
  searchKeywordSuggestions: SuggestionItem[];
}>("/api/admin/products/suggestions", {
  key: "admin-assets-tag-suggestions",
  default: () => ({ tagSuggestions: [], searchKeywordSuggestions: [] }),
});

const tagSuggestions = computed(() =>
  dedupeSuggestions(
    [
      ...(mainCategoriesData.value?.items ?? [])
        .filter((item) => item.isActive)
        .map((item) => ({
          value: item.key,
          label: item.labelTh || item.labelEn || item.key,
          source: "category",
          sourceLabel: "category",
          description: item.key,
        })),
      ...(suggestionData.value?.tagSuggestions ?? []),
    ],
    normalizeTagValue,
  ),
);

const searchKeywordSuggestions = computed(() =>
  dedupeSuggestions(
    suggestionData.value?.searchKeywordSuggestions ?? [],
    normalizeKeywordValue,
  ),
);

const items = computed(() => data.value?.items ?? []);
const adminMeta = computed(() => data.value?.meta ?? null);
const adminWarning = computed(() => adminMeta.value?.warning ?? null);
const isReadOnlyAdminMode = computed(
  () => adminMeta.value?.adminMode === "read_only",
);
const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Unknown admin asset error"),
);

const visibilityOptions = [
  { label: "All visibility", value: "all" },
  { label: "Visible only", value: "visible" },
  { label: "Hidden only", value: "hidden" },
];

const statusFilterOptions = [
  { label: "All status", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
];

const filteredItems = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase();

  return items.value.filter((item) => {
    const matchesSearch =
      keyword.length === 0 ||
      [
        item.id,
        item.code,
        item.slug,
        item.nameTh,
        item.nameEn,
        item.nameCn,
        item.nameJp,
        item.brand,
        item.mainCategoryKey,
        ...item.tagKeys,
        ...item.searchKeywords,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    const matchesCategory =
      selectedCategory.value === "all" ||
      item.mainCategoryKey === selectedCategory.value;

    const matchesVisibility =
      visibilityFilter.value === "all" ||
      (visibilityFilter.value === "hidden" && item.isHidden) ||
      (visibilityFilter.value === "visible" && !item.isHidden);

    const matchesStatus =
      statusFilter.value === "all" || item.status === statusFilter.value;

    return (
      matchesSearch && matchesCategory && matchesVisibility && matchesStatus
    );
  });
});

const statusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
];

const serviceCycleOptions = [
  { label: "—", value: "" },
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
];

function generateAssetCode() {
  const seed =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()
      : Math.random().toString(16).slice(2, 10).toUpperCase();
  return `R-${seed}`;
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

function buildAssetSlug(input: {
  nameEn: string;
  nameTh: string;
  brand: string;
  code: string;
}) {
  const nameSegment =
    slugifySegment(input.nameEn) || slugifySegment(input.nameTh) || "asset";
  const brandSegment = slugifySegment(input.brand);
  const codeTail = slugifySegment(input.code).slice(-8) || "draft";
  return [nameSegment, brandSegment, codeTail].filter(Boolean).join("-");
}

function emptyForm(): FormState {
  const code = generateAssetCode();
  return {
    code,
    slug: "",
    status: "draft",
    nameTh: "",
    nameEn: "",
    nameCn: "",
    nameJp: "",
    descriptionTh: "",
    descriptionEn: "",
    descriptionCn: "",
    descriptionJp: "",
    mainCategoryKey: "others",
    tagKeys: [],
    searchKeywords: [],
    brand: "",
    thumbnailUrl: "",
    dailyRate: 0,
    weeklyRate: 0,
    monthlyRate: 0,
    dailyEnabled: true,
    weeklyEnabled: true,
    monthlyEnabled: true,
    depositAmount: 0,
    minRentalDays: 1,
    maxRentalDays: 0,
    bufferDays: 0,
    storageLocationCode: "",
    storageLocationNote: "",
    storageBranchId: "",
    storageInventoryId: "",
    serviceCycleValue: 0,
    serviceCycleUnit: "",
    lastServicedAt: "",
    nextServiceDueAt: "",
    sortOrder: 0,
    isHidden: false,
    detailBlocks: [],
  };
}

const mode = ref<"create" | "edit">("create");
const selectedId = ref<string | null>(null);
const detail = ref<Detail | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);

const form = reactive<FormState>(emptyForm());
const specSummaryText = ref("{}");
const specSummaryError = ref<string | null>(null);
const slugTouched = ref(false);

const creating = ref(false);
const saving = ref(false);
const deleting = ref(false);
const uploadingThumb = ref(false);
const savingGallery = ref(false);
const thumbnailFiles = ref<File[]>([]);
const detailBlocksUploading = ref(false);
const visibilitySavingId = ref<string | null>(null);

const isSuperAdmin = computed(
  () => profile.value?.platformRole === "super_admin",
);

const { data: branchesData } = await useFetch<{ items: BranchOption[] }>(
  "/api/admin/branches",
  { key: "admin-assets-branches" },
);
const branchOptions = computed(() =>
  (branchesData.value?.items ?? []).filter((b) => b.isActive),
);

const inventoriesApiPath = computed(() =>
  form.storageBranchId
    ? `/api/admin/branches/${encodeURIComponent(form.storageBranchId)}/inventories`
    : null,
);
const { data: inventoriesData, pending: inventoriesPending } = await useFetch<{
  items: InventoryOption[];
}>(inventoriesApiPath, {
  key: "admin-assets-inventories",
  watch: [inventoriesApiPath],
  immediate: false,
});
const inventoryOptions = computed(() => inventoriesData.value?.items ?? []);

watch(
  () => form.storageBranchId,
  (newBranchId, oldBranchId) => {
    if (newBranchId === oldBranchId) return;
    if (!newBranchId) {
      form.storageInventoryId = "";
      return;
    }
    const current = inventoryOptions.value.find(
      (inv) => inv.id === form.storageInventoryId,
    );
    if (!current || current.branchId !== newBranchId) {
      form.storageInventoryId = "";
    }
  },
);

watch(inventoryOptions, (items) => {
  if (!form.storageBranchId || form.storageInventoryId) return;
  const fallback =
    items.find((inv) => inv.isDefaultRental) ??
    items.find((inv) => inv.isDefault);
  if (fallback) {
    form.storageInventoryId = fallback.id;
  }
});

// ── Stock per inventory state ──
type StockItem = {
  id: string;
  assetId: string;
  inventoryId: string;
  inventoryName: string;
  isDefaultInventory: boolean;
  isDefaultRentalInventory: boolean;
  branchId: string;
  branchCode: string;
  branchName: string;
  onHand: number;
  available: number;
  reserved: number;
  incoming: number;
  safetyStock: number;
  notes: string;
};

const stockItems = ref<StockItem[]>([]);
const stockLoading = ref(false);
const stockSavingId = ref<string | null>(null);
const stockEditRows = reactive<Record<string, StockItem>>({});

const newStock = reactive({
  branchId: "",
  inventoryId: "",
  onHand: 0,
  available: 0,
  reserved: 0,
  incoming: 0,
  safetyStock: 0,
  notes: "",
});
const addingStock = ref(false);

const newStockInventoriesPath = computed(() =>
  newStock.branchId
    ? `/api/admin/branches/${encodeURIComponent(newStock.branchId)}/inventories`
    : null,
);
const { data: newStockInventoriesData, pending: newStockInventoriesPending } =
  await useFetch<{ items: InventoryOption[] }>(newStockInventoriesPath, {
    key: "admin-asset-stock-new-inventories",
    watch: [newStockInventoriesPath],
    immediate: false,
  });
const newStockInventoryOptions = computed(
  () => newStockInventoriesData.value?.items ?? [],
);

// ── Product matches state ──
const matchItems = ref<MatchItem[]>([]);
const productOptions = ref<SelectOption[]>([]);
const matchesLoading = ref(false);
const addingMatch = ref(false);
const matchSavingId = ref<string | null>(null);
const newMatch = reactive({
  productId: "",
  matchType: "compatible",
  sortOrder: 0,
  note: "",
});

const availableProductOptions = computed(() => {
  const used = new Set(matchItems.value.map((row) => row.productId));
  return productOptions.value.filter((option) => !used.has(option.value));
});

watch(
  () => newStock.branchId,
  (newId, oldId) => {
    if (newId === oldId) return;
    newStock.inventoryId = "";
  },
);

watch(newStockInventoryOptions, (items) => {
  if (!newStock.branchId || newStock.inventoryId) return;
  const fallback =
    items.find((inv) => inv.isDefaultRental) ??
    items.find((inv) => inv.isDefault);
  if (fallback) newStock.inventoryId = fallback.id;
});

watch(availableProductOptions, (items) => {
  if (
    newMatch.productId &&
    items.some((item) => item.value === newMatch.productId)
  ) {
    return;
  }
  newMatch.productId = items[0]?.value ?? "";
});

const generatedSlug = computed(() =>
  buildAssetSlug({
    nameEn: form.nameEn,
    nameTh: form.nameTh,
    brand: form.brand,
    code: form.code,
  }),
);

watch(
  generatedSlug,
  (value) => {
    if (mode.value !== "create") return;
    if (!slugTouched.value || !form.slug.trim()) {
      form.slug = value;
    }
  },
  { immediate: true },
);

function setSlugManually(value: string | number) {
  slugTouched.value = true;
  form.slug = slugifySegment(String(value ?? ""));
}

function regenerateSlug() {
  slugTouched.value = false;
  form.slug = generatedSlug.value;
}

function regenerateCode() {
  form.code = generateAssetCode();
  if (mode.value === "create" && !slugTouched.value) {
    form.slug = generatedSlug.value;
  }
}

const galleryItems = computed(() =>
  (detail.value?.imageUrls ?? []).map((url, index) => ({
    id: url,
    imageUrl: url,
    title: `Image ${index + 1}`,
    status: "ready" as const,
  })),
);

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatCurrency(value: number): string {
  return formatter.format(value);
}

function categoryLabel(key: string): string {
  return categoryLabelMap.value[key] ?? key;
}

function patchListItem(id: string, patch: Partial<ListItem>) {
  const list = data.value?.items;
  if (!list) return;
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return;
  list[index] = {
    ...list[index],
    ...patch,
  };
}

async function toggleAssetVisibility(item: ListItem, visible: boolean) {
  if (!isSuperAdmin.value) return;
  const nextHidden = !visible;
  if (item.isHidden === nextHidden) return;

  visibilitySavingId.value = item.id;
  try {
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(item.id)}`,
      { method: "PATCH", body: { isHidden: nextHidden } },
    );
    patchListItem(item.id, { isHidden: result.item.isHidden });
    if (detail.value?.id === item.id) {
      detail.value = result.item;
      form.isHidden = result.item.isHidden;
    }
    toast.add({
      title: nextHidden ? "Asset hidden" : "Asset shown",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Visibility update failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    visibilitySavingId.value = null;
  }
}

function resetFormState() {
  Object.assign(form, emptyForm());
  specSummaryText.value = "{}";
  specSummaryError.value = null;
  slugTouched.value = false;
}

function fillFormFromDetail(d: Detail) {
  form.code = d.code;
  form.slug = d.slug;
  slugTouched.value = true;
  form.status = d.status;
  form.nameTh = d.nameTh;
  form.nameEn = d.nameEn;
  form.nameCn = d.nameCn;
  form.nameJp = d.nameJp;
  form.descriptionTh = d.descriptionTh;
  form.descriptionEn = d.descriptionEn;
  form.descriptionCn = d.descriptionCn;
  form.descriptionJp = d.descriptionJp;
  form.mainCategoryKey = d.mainCategoryKey || "others";
  form.tagKeys = [...d.tagKeys];
  form.searchKeywords = [...d.searchKeywords];
  form.brand = d.brand;
  form.thumbnailUrl = d.thumbnailUrl;
  form.dailyRate = d.dailyRate;
  form.weeklyRate = d.weeklyRate;
  form.monthlyRate = d.monthlyRate;
  form.dailyEnabled = d.dailyEnabled;
  form.weeklyEnabled = d.weeklyEnabled;
  form.monthlyEnabled = d.monthlyEnabled;
  form.depositAmount = d.depositAmount;
  form.minRentalDays = d.minRentalDays;
  form.maxRentalDays = d.maxRentalDays;
  form.bufferDays = d.bufferDays;
  form.storageLocationCode = d.storageLocationCode;
  form.storageLocationNote = d.storageLocationNote;
  form.storageBranchId = d.storageBranchId;
  form.storageInventoryId = d.storageInventoryId;
  form.serviceCycleValue = d.serviceCycleValue;
  form.serviceCycleUnit =
    (d.serviceCycleUnit as FormState["serviceCycleUnit"]) || "";
  form.lastServicedAt = d.lastServicedAt;
  form.nextServiceDueAt = d.nextServiceDueAt;
  form.sortOrder = d.sortOrder;
  form.isHidden = d.isHidden;
  form.detailBlocks = Array.isArray(d.detailBlocks)
    ? JSON.parse(JSON.stringify(d.detailBlocks))
    : [];
  specSummaryText.value = JSON.stringify(d.specSummary ?? {}, null, 2);
  specSummaryError.value = null;
}

function resetStockState() {
  stockItems.value = [];
  for (const key of Object.keys(stockEditRows)) delete stockEditRows[key];
  newStock.branchId = "";
  newStock.inventoryId = "";
  newStock.onHand = 0;
  newStock.available = 0;
  newStock.reserved = 0;
  newStock.incoming = 0;
  newStock.safetyStock = 0;
  newStock.notes = "";
}

function resetMatchesState() {
  matchItems.value = [];
  productOptions.value = [];
  newMatch.productId = "";
  newMatch.matchType = "compatible";
  newMatch.sortOrder = 0;
  newMatch.note = "";
}

function syncMatchCount() {
  if (!selectedId.value) return;
  const matchCount = matchItems.value.length;
  patchListItem(selectedId.value, { matchCount });
  if (detail.value) detail.value.matchCount = matchCount;
}

async function loadMatches(id: string) {
  matchesLoading.value = true;
  try {
    const result = await $fetch<{
      items: MatchItem[];
      productOptions: SelectOption[];
    }>(`/api/admin/assets/${encodeURIComponent(id)}/matches`);
    matchItems.value = result.items ?? [];
    productOptions.value = result.productOptions ?? [];
    syncMatchCount();
  } catch (err) {
    toast.add({
      title: "Failed to load matches",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    matchesLoading.value = false;
  }
}

async function loadStock(id: string) {
  stockLoading.value = true;
  try {
    const result = await $fetch<{ items: StockItem[] }>(
      `/api/admin/assets/${encodeURIComponent(id)}/stock`,
    );
    stockItems.value = result.items ?? [];
    for (const key of Object.keys(stockEditRows)) delete stockEditRows[key];
  } catch (err) {
    toast.add({
      title: "Failed to load stock",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    stockLoading.value = false;
  }
}

function startCreate() {
  mode.value = "create";
  selectedId.value = null;
  detail.value = null;
  detailError.value = null;
  resetFormState();
  resetStockState();
  resetMatchesState();
}

async function selectItem(id: string) {
  mode.value = "edit";
  selectedId.value = id;
  detailLoading.value = true;
  detailError.value = null;
  resetStockState();
  resetMatchesState();
  try {
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(id)}`,
    );
    detail.value = result.item;
    fillFormFromDetail(result.item);
    await Promise.all([loadStock(id), loadMatches(id)]);
  } catch (err) {
    detailError.value = getAdminApiErrorMessage(err, "Failed to load asset");
  } finally {
    detailLoading.value = false;
  }
}

function buildPayload(): Record<string, unknown> {
  let specSummary: Record<string, unknown> = {};
  const text = specSummaryText.value.trim();
  if (text.length > 0) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Spec summary must be a JSON object");
      }
      specSummary = parsed as Record<string, unknown>;
      specSummaryError.value = null;
    } catch (e) {
      specSummaryError.value = e instanceof Error ? e.message : "Invalid JSON";
      throw e;
    }
  }
  return {
    code: form.code,
    slug: form.slug,
    status: form.status,
    nameTh: form.nameTh,
    nameEn: form.nameEn,
    nameCn: form.nameCn || null,
    nameJp: form.nameJp || null,
    descriptionTh: form.descriptionTh,
    descriptionEn: form.descriptionEn,
    descriptionCn: form.descriptionCn || null,
    descriptionJp: form.descriptionJp || null,
    mainCategoryKey: form.mainCategoryKey || "others",
    tagKeys: form.tagKeys,
    searchKeywords: form.searchKeywords,
    brand: form.brand || null,
    thumbnailUrl: form.thumbnailUrl || null,
    dailyRate: form.dailyRate,
    weeklyRate: form.weeklyRate,
    monthlyRate: form.monthlyRate,
    dailyEnabled: form.dailyEnabled,
    weeklyEnabled: form.weeklyEnabled,
    monthlyEnabled: form.monthlyEnabled,
    depositAmount: form.depositAmount,
    minRentalDays: form.minRentalDays,
    maxRentalDays: form.maxRentalDays,
    bufferDays: form.bufferDays,
    storageLocationCode: form.storageLocationCode || null,
    storageLocationNote: form.storageLocationNote || null,
    storageBranchId: form.storageBranchId || null,
    storageInventoryId: form.storageInventoryId || null,
    serviceCycleValue: form.serviceCycleValue,
    serviceCycleUnit: form.serviceCycleUnit || null,
    lastServicedAt: form.lastServicedAt || null,
    nextServiceDueAt: form.nextServiceDueAt || null,
    sortOrder: form.sortOrder,
    isHidden: form.isHidden,
    specSummary,
    detailBlocks: form.detailBlocks,
  };
}

async function createAsset() {
  if (isReadOnlyAdminMode.value) return;
  creating.value = true;
  try {
    const result = await $fetch<{ item: Detail }>("/api/admin/assets", {
      method: "POST",
      body: buildPayload(),
    });
    toast.add({
      title: "Asset created",
      color: "success",
      icon: "bx:check-circle",
    });
    await refresh();
    await selectItem(result.item.id);
  } catch (err) {
    toast.add({
      title: "Create failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    creating.value = false;
  }
}

async function saveAsset() {
  if (!selectedId.value || isReadOnlyAdminMode.value) return;
  saving.value = true;
  try {
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}`,
      { method: "PATCH", body: buildPayload() },
    );
    detail.value = result.item;
    fillFormFromDetail(result.item);
    toast.add({
      title: "Saved",
      color: "success",
      icon: "bx:check-circle",
    });
    await refresh();
  } catch (err) {
    toast.add({
      title: "Save failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    saving.value = false;
  }
}

async function deleteAsset() {
  if (!selectedId.value || isReadOnlyAdminMode.value) return;
  if (!confirm("Delete this asset? This cannot be undone.")) return;
  deleting.value = true;
  try {
    await $fetch(`/api/admin/assets/${encodeURIComponent(selectedId.value)}`, {
      method: "DELETE",
    });
    toast.add({
      title: "Deleted",
      color: "success",
      icon: "bx:check-circle",
    });
    startCreate();
    await refresh();
  } catch (err) {
    toast.add({
      title: "Delete failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    deleting.value = false;
  }
}

async function uploadThumbnailFile(file: File) {
  if (!selectedId.value) {
    toast.add({
      title: "Save the asset first",
      description: "Create the asset before uploading a thumbnail.",
      color: "warning",
      icon: "bx:info-circle",
    });
    thumbnailFiles.value = [];
    return;
  }
  uploadingThumb.value = true;
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("target", "thumbnail");
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/media`,
      { method: "POST", body: fd },
    );
    detail.value = result.item;
    form.thumbnailUrl = result.item.thumbnailUrl;
    patchListItem(result.item.id, { thumbnailUrl: result.item.thumbnailUrl });
    toast.add({
      title: "Thumbnail updated",
      color: "success",
      icon: "bx:check-circle",
    });
    await refresh();
  } catch (err) {
    toast.add({
      title: "Thumbnail upload failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    uploadingThumb.value = false;
    thumbnailFiles.value = [];
  }
}

watch(thumbnailFiles, (files) => {
  const file = files?.[0];
  if (file) {
    void uploadThumbnailFile(file);
  }
});

async function refreshAfterGalleryUpload() {
  if (!selectedId.value) return;
  await selectItem(selectedId.value);
  await refresh();
}

async function setGalleryAsThumbnail(url: string) {
  if (!selectedId.value || !detail.value) return;
  savingGallery.value = true;
  try {
    const current = detail.value.imageUrls ?? [];
    const next = [url, ...current.filter((entry) => entry !== url)];
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}`,
      {
        method: "PATCH",
        body: { thumbnailUrl: url, imageUrls: next },
      },
    );
    detail.value = result.item;
    form.thumbnailUrl = result.item.thumbnailUrl;
    patchListItem(result.item.id, { thumbnailUrl: result.item.thumbnailUrl });
    toast.add({
      title: "Thumbnail set",
      color: "success",
      icon: "bx:check-circle",
    });
    await refresh();
  } catch (err) {
    toast.add({
      title: "Update failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingGallery.value = false;
  }
}

async function removeGalleryImage(url: string) {
  if (!selectedId.value || !detail.value) return;
  savingGallery.value = true;
  try {
    const next = detail.value.imageUrls.filter((entry) => entry !== url);
    const body: Record<string, unknown> = { imageUrls: next };
    if (detail.value.thumbnailUrl === url) {
      body.thumbnailUrl = next[0] ?? "";
    }
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}`,
      { method: "PATCH", body },
    );
    detail.value = result.item;
    form.thumbnailUrl = result.item.thumbnailUrl;
    patchListItem(result.item.id, { thumbnailUrl: result.item.thumbnailUrl });
    toast.add({
      title: "Image removed",
      color: "success",
      icon: "bx:check-circle",
    });
    await refresh();
  } catch (err) {
    toast.add({
      title: "Remove failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingGallery.value = false;
  }
}

// ── Detail blocks media handlers ──
async function persistTextEditsBeforeUpload() {
  if (!selectedId.value) return false;
  try {
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}`,
      { method: "PATCH", body: { detailBlocks: form.detailBlocks } },
    );
    detail.value = result.item;
    fillFormFromDetail(result.item);
    return true;
  } catch (err) {
    toast.add({
      title: "Save failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
    return false;
  }
}

async function uploadDetailBlockImage(payload: {
  blockKey: string;
  file: File;
}) {
  if (!selectedId.value || isReadOnlyAdminMode.value) return;
  if (!(await persistTextEditsBeforeUpload())) return;
  detailBlocksUploading.value = true;
  try {
    const fd = new FormData();
    fd.append("file", payload.file);
    fd.append("blockKey", payload.blockKey);
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/detail-blocks/image`,
      { method: "POST", body: fd },
    );
    detail.value = result.item;
    fillFormFromDetail(result.item);
    toast.add({
      title: "Image uploaded",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Image upload failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    detailBlocksUploading.value = false;
  }
}

async function uploadDetailBlockDocument(payload: {
  blockKey: string;
  file: File;
  kind: string;
  title: string;
}) {
  if (!selectedId.value || isReadOnlyAdminMode.value) return;
  if (!(await persistTextEditsBeforeUpload())) return;
  detailBlocksUploading.value = true;
  try {
    const fd = new FormData();
    fd.append("file", payload.file);
    fd.append("blockKey", payload.blockKey);
    fd.append("kind", payload.kind);
    if (payload.title) fd.append("title", payload.title);
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/detail-blocks/document`,
      { method: "POST", body: fd },
    );
    detail.value = result.item;
    fillFormFromDetail(result.item);
    toast.add({
      title: "Document uploaded",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Document upload failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    detailBlocksUploading.value = false;
  }
}

async function deleteDetailBlockImage(payload: {
  blockKey: string;
  imageId: string;
}) {
  if (!selectedId.value || isReadOnlyAdminMode.value) return;
  if (!confirm("Remove this image from the block?")) return;
  detailBlocksUploading.value = true;
  try {
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/detail-blocks/image`,
      { method: "DELETE", body: payload },
    );
    detail.value = result.item;
    fillFormFromDetail(result.item);
    toast.add({
      title: "Image removed",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Remove image failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    detailBlocksUploading.value = false;
  }
}

async function deleteDetailBlockDocument(payload: {
  blockKey: string;
  documentId: string;
}) {
  if (!selectedId.value || isReadOnlyAdminMode.value) return;
  if (!confirm("Remove this document from the block?")) return;
  detailBlocksUploading.value = true;
  try {
    const result = await $fetch<{ item: Detail }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/detail-blocks/document`,
      { method: "DELETE", body: payload },
    );
    detail.value = result.item;
    fillFormFromDetail(result.item);
    toast.add({
      title: "Document removed",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Remove document failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    detailBlocksUploading.value = false;
  }
}

// ── Product match CRUD ──
async function addMatchRow() {
  if (!selectedId.value || !newMatch.productId) return;
  addingMatch.value = true;
  try {
    const result = await $fetch<{ item: MatchItem }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/matches`,
      {
        method: "POST",
        body: {
          productId: newMatch.productId,
          matchType: newMatch.matchType,
          sortOrder: newMatch.sortOrder,
          note: newMatch.note,
        },
      },
    );
    matchItems.value = [...matchItems.value, result.item];
    newMatch.matchType = "compatible";
    newMatch.sortOrder = 0;
    newMatch.note = "";
    syncMatchCount();
    toast.add({
      title: "Product match added",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Add match failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    addingMatch.value = false;
  }
}

async function deleteMatchRow(id: string) {
  if (!selectedId.value) return;
  if (!confirm("Remove this product match?")) return;
  matchSavingId.value = id;
  try {
    await $fetch(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/matches/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    matchItems.value = matchItems.value.filter((row) => row.id !== id);
    syncMatchCount();
    toast.add({
      title: "Product match removed",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Remove match failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    matchSavingId.value = null;
  }
}

// ── Stock per inventory CRUD ──
async function addStockRow() {
  if (!selectedId.value) return;
  if (!newStock.branchId || !newStock.inventoryId) {
    toast.add({
      title: "Pick branch and inventory",
      color: "warning",
      icon: "bx:info-circle",
    });
    return;
  }
  addingStock.value = true;
  try {
    const result = await $fetch<{ item: StockItem }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/stock`,
      {
        method: "POST",
        body: {
          inventoryId: newStock.inventoryId,
          onHand: newStock.onHand,
          available: newStock.available,
          reserved: newStock.reserved,
          incoming: newStock.incoming,
          safetyStock: newStock.safetyStock,
          notes: newStock.notes,
        },
      },
    );
    stockItems.value = [...stockItems.value, result.item];
    newStock.branchId = "";
    newStock.inventoryId = "";
    newStock.onHand = 0;
    newStock.available = 0;
    newStock.reserved = 0;
    newStock.incoming = 0;
    newStock.safetyStock = 0;
    newStock.notes = "";
    toast.add({
      title: "Stock row added",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Add stock failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    addingStock.value = false;
  }
}

function startEditStock(row: StockItem) {
  stockEditRows[row.id] = { ...row };
}

function cancelEditStock(id: string) {
  delete stockEditRows[id];
}

async function updateStockRow(id: string) {
  if (!selectedId.value) return;
  const draft = stockEditRows[id];
  if (!draft) return;
  stockSavingId.value = id;
  try {
    const result = await $fetch<{ item: StockItem }>(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/stock/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: {
          onHand: draft.onHand,
          available: draft.available,
          reserved: draft.reserved,
          incoming: draft.incoming,
          safetyStock: draft.safetyStock,
          notes: draft.notes,
        },
      },
    );
    stockItems.value = stockItems.value.map((row) =>
      row.id === id ? result.item : row,
    );
    delete stockEditRows[id];
    toast.add({
      title: "Stock updated",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Update stock failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    stockSavingId.value = null;
  }
}

async function deleteStockRow(id: string) {
  if (!selectedId.value) return;
  if (!confirm("Delete this stock row?")) return;
  stockSavingId.value = id;
  try {
    await $fetch(
      `/api/admin/assets/${encodeURIComponent(selectedId.value)}/stock/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    stockItems.value = stockItems.value.filter((row) => row.id !== id);
    delete stockEditRows[id];
    toast.add({
      title: "Stock row removed",
      color: "success",
      icon: "bx:check-circle",
    });
  } catch (err) {
    toast.add({
      title: "Delete stock failed",
      description: getAdminApiErrorMessage(err, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    stockSavingId.value = null;
  }
}
</script>

<template>
  <div
    class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1.1fr)] items-start"
  >
    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 class="text-lg font-semibold">Assets</h2>
            <p class="text-sm text-muted">
              Click a row to edit, or create a new package.
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="bx:plus"
              :disabled="isReadOnlyAdminMode"
              @click="startCreate"
            >
              New
            </UButton>
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
        title="Failed to load assets"
        :description="loadErrorMessage"
      />

      <div
        class="mb-4 grid gap-4 md:grid-cols-[minmax(0,1.5fr)_220px_180px_180px]"
      >
        <UFormField label="Search">
          <UInput
            v-model="searchQuery"
            icon="bx:search"
            placeholder="Search by code, slug, name, brand, tags, keywords"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Main category">
          <USelectMenu
            v-model="selectedCategory"
            :items="categoryOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Status">
          <USelectMenu
            v-model="statusFilter"
            :items="statusFilterOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Visibility">
          <USelectMenu
            v-model="visibilityFilter"
            :items="visibilityOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>

      <div v-if="pending" class="py-8 text-sm text-muted">
        Loading assets...
      </div>

      <div v-else-if="items.length === 0" class="py-8 text-sm text-muted">
        No asset rows yet. Use the form to create the first package.
      </div>

      <div
        v-else-if="filteredItems.length === 0"
        class="py-8 text-sm text-muted"
      >
        No assets matched the current filters.
      </div>

      <div v-else class="space-y-2">
        <p class="text-sm text-muted">
          {{ filteredItems.length }} of {{ items.length }} assets
        </p>
        <div
          v-for="item in filteredItems"
          :key="item.id"
          role="button"
          tabindex="0"
          class="block w-full rounded-xl border border-default p-3 text-left transition hover:border-primary/60 hover:bg-elevated/40"
          :class="{
            'border-primary ring-2 ring-primary/30': selectedId === item.id,
          }"
          @click="selectItem(item.id)"
          @keydown.enter.prevent="selectItem(item.id)"
          @keydown.space.prevent="selectItem(item.id)"
        >
          <div class="flex gap-3">
            <div
              class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-default bg-muted"
            >
              <img
                v-if="item.thumbnailUrl"
                :src="item.thumbnailUrl"
                :alt="item.nameTh"
                class="h-full w-full object-cover"
              />
              <span v-else class="text-[10px] text-muted">No image</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate font-medium">
                  {{ item.nameTh || item.nameEn }}
                </h3>
                <UBadge
                  :color="
                    item.status === 'active'
                      ? 'success'
                      : item.status === 'archived'
                        ? 'neutral'
                        : 'warning'
                  "
                  variant="soft"
                  size="sm"
                >
                  {{ item.status }}
                </UBadge>
                <UBadge
                  v-if="item.isHidden"
                  color="neutral"
                  variant="soft"
                  size="sm"
                >
                  hidden
                </UBadge>
                <UBadge color="neutral" variant="soft" size="sm">
                  {{ categoryLabel(item.mainCategoryKey) }}
                </UBadge>
              </div>
              <p class="truncate text-xs text-muted">
                {{ item.code }} · {{ item.slug }}
                <span v-if="item.brand">· {{ item.brand }}</span>
              </p>
              <div
                v-if="item.tagKeys.length > 0"
                class="mt-1 flex flex-wrap gap-1.5"
              >
                <UBadge
                  v-for="tag in item.tagKeys.slice(0, 4)"
                  :key="tag"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  {{ tag }}
                </UBadge>
                <UBadge
                  v-if="item.tagKeys.length > 4"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  +{{ item.tagKeys.length - 4 }} more
                </UBadge>
              </div>
              <p
                v-if="item.searchKeywords.length > 0"
                class="mt-1 truncate text-xs text-muted"
              >
                Keywords: {{ item.searchKeywords.join(", ") }}
              </p>
              <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                <span class="text-muted"
                  >Daily
                  <span class="font-medium text-default"
                    >฿{{ formatCurrency(item.dailyRate) }}</span
                  ></span
                >
                <span class="text-muted"
                  >Weekly
                  <span class="font-medium text-default"
                    >฿{{ formatCurrency(item.weeklyRate) }}</span
                  ></span
                >
                <span class="text-muted"
                  >Monthly
                  <span class="font-medium text-default"
                    >฿{{ formatCurrency(item.monthlyRate) }}</span
                  ></span
                >
                <span class="text-muted"
                  >Deposit
                  <span class="font-medium text-default"
                    >฿{{ formatCurrency(item.depositAmount) }}</span
                  ></span
                >
                <span class="text-muted"
                  >Min
                  <span class="font-medium text-default"
                    >{{ item.minRentalDays }}d</span
                  ></span
                >
                <span class="text-muted"
                  >Matches
                  <span class="font-medium text-default">{{
                    item.matchCount
                  }}</span></span
                >
              </div>
              <div
                v-if="isSuperAdmin"
                class="mt-3 flex items-center gap-2 text-xs text-muted"
                @click.stop
                @keydown.stop
              >
                <span>{{ item.isHidden ? "Hidden" : "Shown" }}</span>
                <USwitch
                  :model-value="!item.isHidden"
                  :disabled="visibilitySavingId === item.id"
                  @update:model-value="
                    (visible: boolean) =>
                      void toggleAssetVisibility(item, visible)
                  "
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <div class="space-y-4">
      <UCard>
        <template #header>
          <div
            class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 class="text-lg font-semibold">
                {{ mode === "create" ? "Create asset" : "Edit asset" }}
              </h2>
              <p v-if="mode === 'edit' && detail" class="text-sm text-muted">
                {{ detail.code }} · updated
                {{
                  detail.updatedAt
                    ? new Date(detail.updatedAt).toLocaleString()
                    : "—"
                }}
              </p>
              <p v-else class="text-sm text-muted">
                Fill in package details and save.
              </p>
            </div>
            <div v-if="mode === 'edit'" class="flex gap-2">
              <UButton
                size="sm"
                variant="soft"
                color="error"
                icon="bx:trash"
                :loading="deleting"
                :disabled="isReadOnlyAdminMode"
                @click="deleteAsset"
              >
                Delete
              </UButton>
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

        <UAlert
          v-if="detailError"
          class="mb-4"
          color="error"
          variant="soft"
          title="Failed to load detail"
          :description="detailError"
        />

        <div v-if="detailLoading" class="py-8 text-sm text-muted">
          Loading asset...
        </div>

        <form
          v-else
          class="space-y-4"
          @submit.prevent="mode === 'create' ? createAsset() : saveAsset()"
        >
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Code" required>
              <div class="flex flex-col gap-2 md:flex-row">
                <UInput
                  v-model="form.code"
                  class="w-full min-w-0 flex-1"
                  placeholder="R-A1B2C3D4"
                />
                <UButton
                  v-if="mode === 'create'"
                  type="button"
                  variant="soft"
                  color="neutral"
                  icon="bx:refresh"
                  @click="regenerateCode"
                >
                  Regenerate
                </UButton>
              </div>
              <template #hint>Auto format: R-{8 hex}</template>
            </UFormField>
            <UFormField label="Slug" required>
              <div class="flex flex-col gap-2 md:flex-row">
                <UInput
                  :model-value="form.slug"
                  class="w-full min-w-0 flex-1"
                  placeholder="rent-electrician-package"
                  @update:model-value="setSlugManually"
                />
                <UButton
                  v-if="mode === 'create'"
                  type="button"
                  variant="soft"
                  color="neutral"
                  icon="bx:refresh"
                  @click="regenerateSlug"
                >
                  Regenerate
                </UButton>
              </div>
              <template #hint>Auto format: name-brand-codetail</template>
            </UFormField>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Status">
              <USelectMenu
                v-model="form.status"
                :items="statusOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Brand">
              <UInput v-model="form.brand" class="w-full" />
            </UFormField>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Name (TH)" required>
              <UInput v-model="form.nameTh" class="w-full" />
            </UFormField>
            <UFormField label="Name (EN)" required>
              <UInput v-model="form.nameEn" class="w-full" />
            </UFormField>
            <UFormField label="Name (CN)">
              <UInput v-model="form.nameCn" class="w-full" />
            </UFormField>
            <UFormField label="Name (JP)">
              <UInput v-model="form.nameJp" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Description (TH)" required>
            <UTextarea v-model="form.descriptionTh" class="w-full" :rows="3" />
          </UFormField>
          <UFormField label="Description (EN)" required>
            <UTextarea v-model="form.descriptionEn" class="w-full" :rows="3" />
          </UFormField>
          <UFormField label="Description (CN)">
            <UTextarea v-model="form.descriptionCn" class="w-full" :rows="3" />
          </UFormField>
          <UFormField label="Description (JP)">
            <UTextarea v-model="form.descriptionJp" class="w-full" :rows="3" />
          </UFormField>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Main category" required>
              <USelectMenu
                v-model="form.mainCategoryKey"
                :items="mainCategoryOptions"
                value-key="value"
                placeholder="Select main category"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Tags">
              <AdminCommaSuggestInput
                v-model="form.tagKeys"
                mode="tag"
                :suggestions="tagSuggestions"
                :excluded-values="
                  form.mainCategoryKey ? [form.mainCategoryKey] : []
                "
                placeholder="package, scaffold"
                helper-text="Comma-separated tags with autocomplete from main categories and existing catalog tags."
              />
            </UFormField>
            <div class="md:col-span-2">
              <UFormField label="Search keywords">
                <AdminCommaSuggestInput
                  v-model="form.searchKeywords"
                  mode="keyword"
                  :suggestions="searchKeywordSuggestions"
                  :excluded-values="[
                    form.code,
                    form.slug,
                    form.nameTh,
                    form.nameEn,
                    form.brand,
                    form.mainCategoryKey,
                    ...form.tagKeys,
                  ]"
                  placeholder="เครื่องมือเช่า, scaffold rental"
                  helper-text="AI/admin aliases only. Use synonyms, customer wording, or TH/EN variants. Avoid duplicating code, names, brand, main category, or tags."
                />
              </UFormField>
            </div>
          </div>

          <p v-if="mode === 'create'" class="text-xs text-muted">
            Save the asset first, then upload a thumbnail in the panel below.
          </p>

          <div class="space-y-3">
            <p class="text-sm font-medium">Pricing tiers</p>
            <p class="text-xs text-muted">
              Tick each tier you want to expose to customers. Untick to hide
              that pricing option from the public storefront.
            </p>
            <div class="grid gap-3 md:grid-cols-2">
              <div class="rounded-lg border border-default p-3">
                <UCheckbox v-model="form.dailyEnabled" label="Daily" />
                <UInput
                  v-model.number="form.dailyRate"
                  class="mt-2 w-full"
                  type="number"
                  min="0"
                  :disabled="!form.dailyEnabled"
                  placeholder="Daily rate"
                />
              </div>
              <div class="rounded-lg border border-default p-3">
                <UCheckbox v-model="form.weeklyEnabled" label="Weekly" />
                <UInput
                  v-model.number="form.weeklyRate"
                  class="mt-2 w-full"
                  type="number"
                  min="0"
                  :disabled="!form.weeklyEnabled"
                  placeholder="Weekly rate"
                />
              </div>
              <div class="rounded-lg border border-default p-3">
                <UCheckbox v-model="form.monthlyEnabled" label="Monthly" />
                <UInput
                  v-model.number="form.monthlyRate"
                  class="mt-2 w-full"
                  type="number"
                  min="0"
                  :disabled="!form.monthlyEnabled"
                  placeholder="Monthly rate"
                />
              </div>
            </div>
          </div>

          <UFormField label="Deposit amount">
            <UInput
              v-model.number="form.depositAmount"
              class="w-full"
              type="number"
              min="0"
            />
          </UFormField>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Min rental days">
              <UInput
                v-model.number="form.minRentalDays"
                class="w-full"
                type="number"
                min="1"
              />
            </UFormField>
            <UFormField label="Max rental days (0 = no limit)">
              <UInput
                v-model.number="form.maxRentalDays"
                class="w-full"
                type="number"
                min="0"
              />
            </UFormField>
            <UFormField label="Buffer days">
              <UInput
                v-model.number="form.bufferDays"
                class="w-full"
                type="number"
                min="0"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Storage branch">
              <USelectMenu
                v-model="form.storageBranchId"
                :items="branchOptions"
                value-key="id"
                label-key="nameTh"
                placeholder="Select branch"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Storage inventory">
              <USelectMenu
                v-model="form.storageInventoryId"
                :items="inventoryOptions"
                value-key="id"
                label-key="name"
                :placeholder="
                  form.storageBranchId
                    ? inventoriesPending
                      ? 'Loading...'
                      : 'Select inventory'
                    : 'Pick a branch first'
                "
                :disabled="!form.storageBranchId || inventoriesPending"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Storage location code (optional)">
              <UInput
                v-model="form.storageLocationCode"
                class="w-full"
                placeholder="HQ-A1"
              />
            </UFormField>
            <UFormField label="Sort order">
              <UInput
                v-model.number="form.sortOrder"
                class="w-full"
                type="number"
              />
            </UFormField>
          </div>

          <UFormField label="Storage location note">
            <UTextarea
              v-model="form.storageLocationNote"
              class="w-full"
              :rows="2"
              placeholder="Shelf number, locker code, or other granular detail"
            />
          </UFormField>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Service cycle value">
              <UInput
                v-model.number="form.serviceCycleValue"
                class="w-full"
                type="number"
                min="0"
              />
            </UFormField>
            <UFormField label="Service cycle unit">
              <USelectMenu
                v-model="form.serviceCycleUnit"
                :items="serviceCycleOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Last serviced at">
              <UInput
                v-model="form.lastServicedAt"
                class="w-full"
                type="date"
              />
            </UFormField>
            <UFormField label="Next service due">
              <UInput
                v-model="form.nextServiceDueAt"
                class="w-full"
                type="date"
              />
            </UFormField>
          </div>

          <UFormField label="Spec summary (JSON object)">
            <UTextarea
              v-model="specSummaryText"
              class="w-full"
              :rows="6"
              placeholder="{ }"
            />
            <p v-if="specSummaryError" class="mt-1 text-xs text-error">
              {{ specSummaryError }}
            </p>
          </UFormField>

          <UCheckbox
            v-model="form.isHidden"
            label="Hidden from public storefront"
            :disabled="!isSuperAdmin || isReadOnlyAdminMode"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              color="primary"
              :loading="creating || saving"
              :disabled="isReadOnlyAdminMode"
            >
              {{ mode === "create" ? "Create asset" : "Save changes" }}
            </UButton>
            <UButton
              type="button"
              variant="soft"
              color="neutral"
              :disabled="creating || saving"
              @click="
                mode === 'create'
                  ? resetFormState()
                  : detail && fillFormFromDetail(detail)
              "
            >
              {{ mode === "create" ? "Reset" : "Revert" }}
            </UButton>
            <UButton
              v-if="mode === 'edit'"
              type="button"
              variant="soft"
              color="neutral"
              icon="bx:x"
              @click="startCreate"
            >
              Cancel
            </UButton>
          </div>
        </form>
      </UCard>

      <UCard v-if="mode === 'edit' && detail">
        <template #header>
          <div>
            <h3 class="text-lg font-semibold">Thumbnail</h3>
            <p class="text-sm text-muted">
              Cover image used in listings. Upload a JPEG, PNG, or WebP up to
              15MB.
            </p>
          </div>
        </template>

        <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div
            class="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-neutral-50"
          >
            <img
              v-if="form.thumbnailUrl"
              :src="form.thumbnailUrl"
              alt="thumbnail"
              class="max-h-full max-w-full object-contain"
            />
            <span v-else class="text-xs text-muted">No image</span>
          </div>
          <div class="flex-1 space-y-2">
            <UFileUpload
              v-model="thumbnailFiles"
              accept="image/jpeg,image/png,image/webp"
              layout="grid"
              label="Drop a thumbnail here"
              description="JPEG, PNG, or WebP up to 15MB."
              icon="i-lucide-image"
              class="min-h-32 w-full"
              :disabled="uploadingThumb || isReadOnlyAdminMode"
            />
            <p v-if="uploadingThumb" class="text-xs text-muted">Uploading...</p>
          </div>
        </div>
      </UCard>

      <AdminMediaGalleryManager
        v-if="mode === 'edit' && detail"
        title="Gallery"
        description="Additional images for the asset detail page. The first queued upload becomes the listing thumbnail (cover) and overrides any existing thumbnail."
        :upload-endpoint="`/api/admin/assets/${selectedId}/media`"
        :existing-items="galleryItems"
        empty-message="No gallery images yet"
        :disabled="isReadOnlyAdminMode || savingGallery"
        @uploaded="refreshAfterGalleryUpload"
        @set-cover-existing="setGalleryAsThumbnail"
        @remove-existing="removeGalleryImage"
      />

      <UCard v-if="mode === 'edit' && detail">
        <template #header>
          <div>
            <h3 class="text-lg font-semibold">Detail blocks</h3>
            <p class="text-sm text-muted">
              Essay-style content sections shown on the public asset page. Title
              and body support all four locales. Images and PDF documents are
              uploaded directly to the targeted block.
            </p>
          </div>
        </template>

        <AdminAssetDetailBlocksEditor
          v-model="form.detailBlocks"
          :disabled="isReadOnlyAdminMode || saving || creating"
          :uploading="detailBlocksUploading"
          @upload-image="uploadDetailBlockImage"
          @upload-document="uploadDetailBlockDocument"
          @remove-image="deleteDetailBlockImage"
          @remove-document="deleteDetailBlockDocument"
        />
      </UCard>

      <UCard v-if="mode === 'edit' && detail">
        <template #header>
          <div
            class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 class="text-lg font-semibold">Product matches</h3>
              <p class="text-sm text-muted">
                Link this asset to products for storefront discovery and
                booking.
              </p>
            </div>
            <UButton
              size="xs"
              variant="soft"
              icon="bx:refresh"
              :loading="matchesLoading"
              @click="selectedId && loadMatches(selectedId)"
            >
              Refresh
            </UButton>
          </div>
        </template>

        <div class="space-y-4">
          <div v-if="matchesLoading" class="text-sm text-muted">
            Loading matches...
          </div>
          <div
            v-else-if="matchItems.length === 0"
            class="rounded border border-dashed border-default p-4 text-sm text-muted"
          >
            No product matches yet. Add one below.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="row in matchItems"
              :key="row.id"
              class="rounded border border-default p-3"
            >
              <div
                class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium">
                    {{ row.productLabel }}
                    <UBadge
                      v-if="row.productHidden"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      class="ml-2"
                    >
                      hidden
                    </UBadge>
                  </div>
                  <div class="text-xs text-muted">
                    {{ row.matchType }} · sort {{ row.sortOrder }}
                    <span v-if="row.note"> · {{ row.note }}</span>
                  </div>
                </div>
                <UButton
                  size="xs"
                  color="error"
                  variant="soft"
                  icon="bx:trash"
                  :loading="matchSavingId === row.id"
                  :disabled="isReadOnlyAdminMode"
                  @click="deleteMatchRow(row.id)"
                >
                  Remove
                </UButton>
              </div>
            </div>
          </div>

          <div class="rounded border border-default p-3">
            <p class="mb-2 text-sm font-medium">Add product match</p>
            <div class="grid gap-2 md:grid-cols-2">
              <UFormField label="Product">
                <USelectMenu
                  v-model="newMatch.productId"
                  :items="availableProductOptions"
                  value-key="value"
                  placeholder="Select product"
                  :disabled="availableProductOptions.length === 0"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Match type">
                <UInput
                  v-model="newMatch.matchType"
                  class="w-full"
                  placeholder="compatible"
                />
              </UFormField>
              <UFormField label="Sort order">
                <UInput
                  v-model.number="newMatch.sortOrder"
                  class="w-full"
                  type="number"
                  min="0"
                />
              </UFormField>
              <UFormField label="Note">
                <UInput
                  v-model="newMatch.note"
                  class="w-full"
                  placeholder="Optional"
                />
              </UFormField>
            </div>
            <div class="mt-3 flex justify-end">
              <UButton
                color="primary"
                icon="bx:link"
                :loading="addingMatch"
                :disabled="
                  isReadOnlyAdminMode ||
                  !newMatch.productId ||
                  availableProductOptions.length === 0
                "
                @click="addMatchRow"
              >
                Add match
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <UCard v-if="mode === 'edit' && detail">
        <template #header>
          <div
            class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 class="text-lg font-semibold">Stock per inventory</h3>
              <p class="text-sm text-muted">
                Track on-hand units per branch and inventory location.
              </p>
            </div>
            <UButton
              size="xs"
              variant="soft"
              icon="bx:refresh"
              :loading="stockLoading"
              @click="selectedId && loadStock(selectedId)"
            >
              Refresh
            </UButton>
          </div>
        </template>

        <div class="space-y-4">
          <div v-if="stockLoading" class="text-sm text-muted">
            Loading stock...
          </div>
          <div
            v-else-if="stockItems.length === 0"
            class="rounded border border-dashed border-default p-4 text-sm text-muted"
          >
            No stock rows yet. Add one below.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="row in stockItems"
              :key="row.id"
              class="rounded border border-default p-3"
            >
              <div
                class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="text-sm">
                  <div class="font-medium">
                    {{ row.branchName }}
                    <span class="text-muted">
                      / {{ row.inventoryName || row.inventoryId }}</span
                    >
                    <UBadge
                      v-if="row.isDefaultRentalInventory"
                      color="success"
                      variant="subtle"
                      size="xs"
                      class="ml-2"
                    >
                      Default rental
                    </UBadge>
                  </div>
                  <div class="text-xs text-muted">
                    {{ row.branchCode || row.branchId }}
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-if="!stockEditRows[row.id]"
                    size="xs"
                    variant="soft"
                    icon="bx:edit"
                    :disabled="isReadOnlyAdminMode"
                    @click="startEditStock(row)"
                  >
                    Edit
                  </UButton>
                  <UButton
                    v-if="stockEditRows[row.id]"
                    size="xs"
                    color="primary"
                    icon="bx:check"
                    :loading="stockSavingId === row.id"
                    :disabled="isReadOnlyAdminMode"
                    @click="updateStockRow(row.id)"
                  >
                    Save
                  </UButton>
                  <UButton
                    v-if="stockEditRows[row.id]"
                    size="xs"
                    variant="ghost"
                    icon="bx:x"
                    @click="cancelEditStock(row.id)"
                  >
                    Cancel
                  </UButton>
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    icon="bx:trash"
                    :loading="stockSavingId === row.id"
                    :disabled="isReadOnlyAdminMode"
                    @click="deleteStockRow(row.id)"
                  >
                    Delete
                  </UButton>
                </div>
              </div>

              <div
                v-if="stockEditRows[row.id]"
                class="mt-3 grid gap-2 md:grid-cols-2"
              >
                <UFormField label="On hand">
                  <UInput
                    v-model.number="stockEditRows[row.id].onHand"
                    class="w-full"
                    type="number"
                    :min="0"
                  />
                </UFormField>
                <UFormField label="Available">
                  <UInput
                    v-model.number="stockEditRows[row.id].available"
                    class="w-full"
                    type="number"
                    :min="0"
                  />
                </UFormField>
                <UFormField label="Reserved">
                  <UInput
                    v-model.number="stockEditRows[row.id].reserved"
                    class="w-full"
                    type="number"
                    :min="0"
                  />
                </UFormField>
                <UFormField label="Incoming">
                  <UInput
                    v-model.number="stockEditRows[row.id].incoming"
                    class="w-full"
                    type="number"
                    :min="0"
                  />
                </UFormField>
                <UFormField label="Safety stock">
                  <UInput
                    v-model.number="stockEditRows[row.id].safetyStock"
                    class="w-full"
                    type="number"
                    :min="0"
                  />
                </UFormField>
                <UFormField class="md:col-span-2" label="Notes">
                  <UTextarea
                    v-model="stockEditRows[row.id].notes"
                    class="w-full"
                    :rows="2"
                  />
                </UFormField>
              </div>
              <div
                v-else
                class="mt-2 grid gap-2 text-xs text-muted sm:grid-cols-5"
              >
                <div>
                  On hand: <span class="text-default">{{ row.onHand }}</span>
                </div>
                <div>
                  Available:
                  <span class="text-default">{{ row.available }}</span>
                </div>
                <div>
                  Reserved: <span class="text-default">{{ row.reserved }}</span>
                </div>
                <div>
                  Incoming: <span class="text-default">{{ row.incoming }}</span>
                </div>
                <div>
                  Safety:
                  <span class="text-default">{{ row.safetyStock }}</span>
                </div>
                <div v-if="row.notes" class="sm:col-span-5">
                  Notes: <span class="text-default">{{ row.notes }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded border border-default p-3">
            <p class="mb-2 text-sm font-medium">Add inventory row</p>
            <div class="grid gap-2 md:grid-cols-2">
              <UFormField label="Branch">
                <USelectMenu
                  v-model="newStock.branchId"
                  :items="branchOptions"
                  value-key="id"
                  label-key="nameTh"
                  placeholder="Select branch"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Inventory">
                <USelectMenu
                  v-model="newStock.inventoryId"
                  :items="newStockInventoryOptions"
                  value-key="id"
                  label-key="name"
                  :placeholder="
                    newStock.branchId
                      ? newStockInventoriesPending
                        ? 'Loading...'
                        : 'Select inventory'
                      : 'Pick a branch first'
                  "
                  :disabled="!newStock.branchId || newStockInventoriesPending"
                  class="w-full"
                />
              </UFormField>
            </div>
            <div class="mt-2 grid gap-2 md:grid-cols-2">
              <UFormField label="On hand">
                <UInput
                  v-model.number="newStock.onHand"
                  class="w-full"
                  type="number"
                  :min="0"
                />
              </UFormField>
              <UFormField label="Available">
                <UInput
                  v-model.number="newStock.available"
                  class="w-full"
                  type="number"
                  :min="0"
                />
              </UFormField>
              <UFormField label="Reserved">
                <UInput
                  v-model.number="newStock.reserved"
                  class="w-full"
                  type="number"
                  :min="0"
                />
              </UFormField>
              <UFormField label="Incoming">
                <UInput
                  v-model.number="newStock.incoming"
                  class="w-full"
                  type="number"
                  :min="0"
                />
              </UFormField>
              <UFormField label="Safety">
                <UInput
                  v-model.number="newStock.safetyStock"
                  class="w-full"
                  type="number"
                  :min="0"
                />
              </UFormField>
            </div>
            <UFormField class="mt-2" label="Notes">
              <UTextarea v-model="newStock.notes" class="w-full" :rows="2" />
            </UFormField>
            <div class="mt-3 flex justify-end">
              <UButton
                color="primary"
                icon="bx:plus"
                :loading="addingStock"
                :disabled="
                  isReadOnlyAdminMode ||
                  !newStock.branchId ||
                  !newStock.inventoryId
                "
                @click="addStockRow"
              >
                Add row
              </UButton>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
