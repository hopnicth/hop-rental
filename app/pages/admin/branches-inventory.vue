<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type BranchItem = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  addressTh: string;
  addressEn: string;
  phone: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

type StockRow = {
  id: string;
  productId: string;
  skuId: string;
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

type InventoryItem = {
  id: string;
  branchId: string;
  name: string;
  isDefault: boolean;
  notes: Record<string, unknown>;
  sortOrder: number;
};

type SkuSearchItem = {
  skuId: string;
  productId: string;
  skuCode: string;
  labelTh: string;
  labelEn: string;
  price: number;
  stock: number;
  productNameTh: string;
  productNameEn: string;
  productSlug: string;
};

const toast = useToast();
const { profile } = useUserProfile();
const isSuperAdmin = computed(
  () => profile.value?.platformRole === "super_admin",
);

// ── Branch state ──
const savingBranch = ref(false);
const editingBranchId = ref<string | null>(null);

const branchForm = reactive({
  code: "",
  nameTh: "",
  nameEn: "",
  addressTh: "",
  addressEn: "",
  phone: "",
  email: "",
  notes: "",
  isActive: true,
  sortOrder: 0,
});

// ── Selection state ──
const selectedBranchId = ref<string | null>(null);
const selectedInventoryId = ref<string | null>(null);

// ── Inventory container state ──
const savingInventory = ref(false);
const editingInventoryId = ref<string | null>(null);
const showCreateInventory = ref(false);

const inventoryForm = reactive({
  name: "",
  sortOrder: 100,
});

// ── Stock state (per selected inventory) ──
const savingStock = ref(false);
const editingStockId = ref<string | null>(null);
const stockSearch = ref("");
const showCreateStock = ref(false);

const stockForm = reactive({
  productId: "",
  skuId: "",
  skuLabel: "",
  onHand: 0,
});

// ── SKU search for "add product to inventory" ──
const skuSearchQuery = ref("");
const skuSearchDebounced = ref("");
let skuSearchTimer: ReturnType<typeof setTimeout> | null = null;

watch(skuSearchQuery, (val) => {
  if (skuSearchTimer) clearTimeout(skuSearchTimer);
  skuSearchTimer = setTimeout(() => {
    skuSearchDebounced.value = val.trim();
  }, 350);
});

const skuSearchApiPath = computed(() =>
  skuSearchDebounced.value.length >= 1
    ? `/api/admin/products/skus-search?q=${encodeURIComponent(skuSearchDebounced.value)}`
    : null,
);

const { data: skuSearchData, pending: skuSearchPending } = await useFetch<{
  items: SkuSearchItem[];
}>(skuSearchApiPath, {
  key: "admin-branch-sku-search",
  watch: [skuSearchApiPath],
  immediate: false,
});

const skuSearchResults = computed(() => skuSearchData.value?.items ?? []);

// ── Fetch branches ──
const {
  data: branchData,
  pending: branchesPending,
  error: branchesError,
  refresh: refreshBranches,
} = await useFetch<{ items: BranchItem[] }>("/api/admin/branches", {
  key: "admin-branches-inventory-branches",
});

const branches = computed(() => branchData.value?.items ?? []);
const selectedBranch = computed(
  () => branches.value.find((b) => b.id === selectedBranchId.value) ?? null,
);

// ── Branch helpers ──
function resetBranchForm() {
  editingBranchId.value = null;
  branchForm.code = "";
  branchForm.nameTh = "";
  branchForm.nameEn = "";
  branchForm.addressTh = "";
  branchForm.addressEn = "";
  branchForm.phone = "";
  branchForm.email = "";
  branchForm.notes = "";
  branchForm.isActive = true;
  branchForm.sortOrder = 0;
}

function fillBranchForm(item: BranchItem) {
  editingBranchId.value = item.id;
  selectedBranchId.value = item.id;
  branchForm.code = item.code;
  branchForm.nameTh = item.nameTh;
  branchForm.nameEn = item.nameEn;
  branchForm.addressTh = item.addressTh;
  branchForm.addressEn = item.addressEn;
  branchForm.phone = item.phone;
  branchForm.email = item.email;
  branchForm.notes = item.notes;
  branchForm.isActive = item.isActive;
  branchForm.sortOrder = item.sortOrder;
}

function selectBranch(item: BranchItem) {
  selectedBranchId.value = item.id;
  selectedInventoryId.value = null;
  editingBranchId.value = null;
  resetInventoryForm();
  resetStockForm();
  showCreateInventory.value = false;
  showCreateStock.value = false;
}

function selectInventory(item: InventoryItem) {
  selectedInventoryId.value = item.id;
  resetStockForm();
  showCreateStock.value = false;
}

// ── Inventory container helpers ──
function resetInventoryForm() {
  editingInventoryId.value = null;
  inventoryForm.name = "";
  inventoryForm.sortOrder = 100;
}

function fillInventoryForm(item: InventoryItem) {
  editingInventoryId.value = item.id;
  inventoryForm.name = item.name;
  inventoryForm.sortOrder = item.sortOrder;
  showCreateInventory.value = true;
}

function openCreateInventory() {
  resetInventoryForm();
  showCreateInventory.value = true;
}

// ── Stock helpers ──
function resetStockForm() {
  editingStockId.value = null;
  stockForm.productId = "";
  stockForm.skuId = "";
  stockForm.skuLabel = "";
  stockForm.onHand = 0;
  skuSearchQuery.value = "";
}

function pickSku(item: SkuSearchItem) {
  stockForm.productId = item.productId;
  stockForm.skuId = item.skuId;
  stockForm.skuLabel = `${item.skuCode} · ${item.productNameTh}`;
  skuSearchQuery.value = "";
}

function editStockRow(row: StockRow) {
  editingStockId.value = row.id;
  stockForm.productId = row.productId;
  stockForm.skuId = row.skuId;
  stockForm.skuLabel = `SKU ${row.skuId}`;
  stockForm.onHand = row.onHand;
  showCreateStock.value = true;
}

function openCreateStock() {
  resetStockForm();
  showCreateStock.value = true;
}

// ── Fetch inventories for selected branch ──
const inventoriesApiPath = computed(() =>
  selectedBranchId.value
    ? `/api/admin/branches/${encodeURIComponent(selectedBranchId.value)}/inventories`
    : null,
);

const {
  data: inventoriesData,
  pending: inventoriesPending,
  refresh: refreshInventories,
} = await useFetch<{ items: InventoryItem[] }>(inventoriesApiPath, {
  key: "admin-branches-inventories",
  watch: [inventoriesApiPath],
  immediate: false,
});

const inventories = computed(() => inventoriesData.value?.items ?? []);
const selectedInventory = computed(
  () =>
    inventories.value.find((inv) => inv.id === selectedInventoryId.value) ??
    null,
);

// ── Fetch stock rows for selected inventory ──
const stockApiPath = computed(() =>
  selectedInventoryId.value
    ? `/api/admin/inventories/${encodeURIComponent(selectedInventoryId.value)}/stock`
    : null,
);

const {
  data: stockData,
  pending: stockPending,
  refresh: refreshStock,
} = await useFetch<{ items: StockRow[] }>(stockApiPath, {
  key: "admin-inventory-stock",
  watch: [stockApiPath],
  immediate: false,
});

const stockRows = computed(() => stockData.value?.items ?? []);

// ── Branch CRUD ──
async function saveBranch() {
  if (!isSuperAdmin.value) {
    toast.add({
      title: "Permission denied",
      description: "Only super admins can edit branches.",
      color: "error",
    });
    return;
  }

  savingBranch.value = true;
  try {
    const endpoint = editingBranchId.value
      ? `/api/admin/branches/${encodeURIComponent(editingBranchId.value)}`
      : "/api/admin/branches";

    await $fetch(endpoint, {
      method: editingBranchId.value ? "PATCH" : "POST",
      body: { ...branchForm },
    });

    toast.add({
      title: editingBranchId.value ? "Branch updated" : "Branch created",
      color: "success",
      icon: "bx:check-circle",
    });

    await refreshBranches();
    resetBranchForm();
  } catch (err) {
    toast.add({
      title: "Branch save failed",
      description: err instanceof Error ? err.message : "Unknown error",
      color: "error",
    });
  } finally {
    savingBranch.value = false;
  }
}

// ── Inventory container CRUD ──
async function saveInventory() {
  if (!selectedBranchId.value) return;
  if (!inventoryForm.name.trim()) {
    toast.add({ title: "Inventory name is required", color: "warning" });
    return;
  }

  savingInventory.value = true;
  try {
    const isEdit = !!editingInventoryId.value;
    const endpoint = isEdit
      ? `/api/admin/branches/${encodeURIComponent(selectedBranchId.value)}/inventories/${encodeURIComponent(editingInventoryId.value!)}`
      : `/api/admin/branches/${encodeURIComponent(selectedBranchId.value)}/inventories`;

    const body: Record<string, unknown> = {
      name: inventoryForm.name.trim(),
      sortOrder: inventoryForm.sortOrder,
    };

    await $fetch(endpoint, {
      method: isEdit ? "PATCH" : "POST",
      body,
    });

    toast.add({
      title: isEdit ? "Inventory updated" : "Inventory created",
      color: "success",
      icon: "bx:check-circle",
    });

    await refreshInventories();
    resetInventoryForm();
    showCreateInventory.value = false;
  } catch (err) {
    toast.add({
      title: "Inventory save failed",
      description: err instanceof Error ? err.message : "Unknown error",
      color: "error",
    });
  } finally {
    savingInventory.value = false;
  }
}

async function deleteInventory(item: InventoryItem) {
  if (item.isDefault) {
    toast.add({
      title: "Default inventory cannot be deleted",
      color: "warning",
    });
    return;
  }
  if (!window.confirm(`Delete inventory "${item.name}"?`)) return;

  savingInventory.value = true;
  try {
    await $fetch(
      `/api/admin/branches/${encodeURIComponent(item.branchId)}/inventories/${encodeURIComponent(item.id)}`,
      { method: "DELETE" },
    );
    toast.add({
      title: "Inventory deleted",
      color: "success",
      icon: "bx:check-circle",
    });
    if (selectedInventoryId.value === item.id) {
      selectedInventoryId.value = null;
    }
    await refreshInventories();
  } catch (err) {
    toast.add({
      title: "Delete failed",
      description: err instanceof Error ? err.message : "Unknown error",
      color: "error",
    });
  } finally {
    savingInventory.value = false;
  }
}

// ── Stock CRUD ──
async function saveStock() {
  if (!selectedInventoryId.value) return;
  if (!stockForm.skuId && !editingStockId.value) {
    toast.add({ title: "Please select a SKU first", color: "warning" });
    return;
  }
  if (!window.confirm("Confirm stock change?")) return;

  savingStock.value = true;
  try {
    const isEdit = !!editingStockId.value;
    const endpoint = isEdit
      ? `/api/admin/inventories/${encodeURIComponent(selectedInventoryId.value)}/stock/${encodeURIComponent(editingStockId.value!)}`
      : `/api/admin/inventories/${encodeURIComponent(selectedInventoryId.value)}/stock`;

    const body: Record<string, unknown> = {
      onHand: stockForm.onHand,
      available: stockForm.onHand,
    };

    if (!isEdit) {
      body.productId = stockForm.productId;
      body.skuId = stockForm.skuId;
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

    await refreshStock();
    resetStockForm();
    showCreateStock.value = false;
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

async function deleteStockRow(row: StockRow) {
  if (!selectedInventoryId.value) return;
  if (!window.confirm(`Remove SKU ${row.skuId} from this inventory?`)) return;

  savingStock.value = true;
  try {
    await $fetch(
      `/api/admin/inventories/${encodeURIComponent(selectedInventoryId.value)}/stock/${encodeURIComponent(row.id)}`,
      { method: "DELETE" },
    );
    toast.add({
      title: "Stock removed",
      color: "success",
      icon: "bx:check-circle",
    });
    await refreshStock();
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

const filteredStockRows = computed(() => {
  const q = stockSearch.value.trim().toLowerCase();
  if (!q) return stockRows.value;
  return stockRows.value.filter(
    (row) =>
      row.skuId.toLowerCase().includes(q) ||
      row.productId.toLowerCase().includes(q),
  );
});

function formatIsoDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm text-muted">Admin</p>
        <h2 class="text-xl font-semibold">Branch &amp; Inventory</h2>
        <p class="text-sm text-muted">
          Manage store branches and their inventory stock. Branch editing
          requires super admin.
        </p>
      </div>
      <UButton
        variant="soft"
        color="neutral"
        icon="bx:refresh"
        @click="refreshBranches"
      >
        Refresh
      </UButton>
    </div>

    <UAlert
      v-if="branchesError"
      color="error"
      variant="soft"
      title="Failed to load branches"
      :description="branchesError.message"
    />

    <div v-else-if="branchesPending" class="py-8 text-sm text-muted">
      Loading branches...
    </div>

    <template v-else>
      <!-- ── Branch list ── -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold">Branches</h3>
              <p class="text-sm text-muted">
                {{ branches.length }} branch(es) registered.
              </p>
            </div>
          </div>
        </template>

        <div v-if="branches.length === 0" class="py-6 text-sm text-muted">
          No branches yet. Create one below.
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="branch in branches"
            :key="branch.id"
            class="cursor-pointer rounded-xl border p-4 transition-colors"
            :class="
              selectedBranchId === branch.id
                ? 'border-primary bg-primary/5'
                : 'border-default hover:border-primary/50'
            "
            @click="selectBranch(branch)"
          >
            <div
              class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
            >
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-medium">{{ branch.nameTh }}</h4>
                  <UBadge color="primary" variant="soft">{{
                    branch.code
                  }}</UBadge>
                  <UBadge v-if="!branch.isActive" color="neutral" variant="soft"
                    >inactive</UBadge
                  >
                </div>
                <p class="text-sm text-muted">{{ branch.nameEn }}</p>
                <p v-if="branch.addressTh" class="text-xs text-muted">
                  {{ branch.addressTh }}
                </p>
                <p
                  v-if="branch.phone || branch.email"
                  class="text-xs text-muted"
                >
                  {{ [branch.phone, branch.email].filter(Boolean).join(" · ") }}
                </p>
              </div>

              <div class="flex gap-2">
                <UButton
                  v-if="isSuperAdmin"
                  size="xs"
                  variant="soft"
                  color="primary"
                  icon="bx:edit"
                  @click.stop="fillBranchForm(branch)"
                >
                  Edit
                </UButton>
                <UButton
                  size="xs"
                  variant="soft"
                  color="neutral"
                  icon="bx:box"
                  @click.stop="selectBranch(branch)"
                >
                  View inventory
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- ── Branch form (super admin only) ── -->
      <UCard v-if="isSuperAdmin">
        <template #header>
          <div>
            <h3 class="text-lg font-semibold">
              {{ editingBranchId ? "Edit branch" : "Create branch" }}
            </h3>
            <p class="text-sm text-muted">
              Only super admins can create or edit branches.
            </p>
          </div>
        </template>

        <form class="space-y-4" @submit.prevent="saveBranch">
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Branch code" required>
              <UInput
                v-model="branchForm.code"
                class="w-full"
                placeholder="HQ"
              />
            </UFormField>
            <UFormField label="Name (TH)" required>
              <UInput
                v-model="branchForm.nameTh"
                class="w-full"
                placeholder="สำนักงานใหญ่"
              />
            </UFormField>
            <UFormField label="Name (EN)">
              <UInput
                v-model="branchForm.nameEn"
                class="w-full"
                placeholder="Head Office"
              />
            </UFormField>
          </div>

          <UFormField label="Address (TH)">
            <UTextarea
              v-model="branchForm.addressTh"
              class="w-full"
              :rows="2"
            />
          </UFormField>
          <UFormField label="Address (EN)">
            <UTextarea
              v-model="branchForm.addressEn"
              class="w-full"
              :rows="2"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Phone">
              <UInput
                v-model="branchForm.phone"
                class="w-full"
                placeholder="0954792333"
              />
            </UFormField>
            <UFormField label="Email">
              <UInput
                v-model="branchForm.email"
                class="w-full"
                type="email"
                placeholder="info@hopnic.co.th"
              />
            </UFormField>
            <UFormField label="Sort order">
              <UInput
                v-model.number="branchForm.sortOrder"
                class="w-full"
                type="number"
              />
            </UFormField>
          </div>

          <UFormField label="Notes">
            <UTextarea
              v-model="branchForm.notes"
              class="w-full"
              :rows="2"
              placeholder="Internal notes"
            />
          </UFormField>

          <UCheckbox
            v-model="branchForm.isActive"
            label="Active (visible for inventory linking)"
          />

          <div class="flex gap-2">
            <UButton type="submit" color="primary" :loading="savingBranch">
              {{ editingBranchId ? "Update branch" : "Create branch" }}
            </UButton>
            <UButton
              v-if="editingBranchId"
              type="button"
              variant="soft"
              color="neutral"
              @click="resetBranchForm"
            >
              Cancel
            </UButton>
          </div>
        </form>
      </UCard>

      <!-- ── Inventory list for selected branch ── -->
      <UCard v-if="selectedBranch">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold">
                Inventories · {{ selectedBranch.nameTh }}
              </h3>
              <p class="text-sm text-muted">
                {{ selectedBranch.code }} · {{ inventories.length }}
                inventory location(s). Default cannot be deleted or renamed.
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                size="xs"
                variant="soft"
                color="primary"
                icon="bx:plus"
                @click="openCreateInventory"
              >
                New inventory
              </UButton>
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                icon="bx:refresh"
                @click="refreshInventories"
              >
                Refresh
              </UButton>
            </div>
          </div>
        </template>

        <div v-if="inventoriesPending" class="py-6 text-sm text-muted">
          Loading inventories...
        </div>

        <div
          v-else-if="inventories.length === 0"
          class="py-6 text-sm text-muted"
        >
          No inventories yet for this branch.
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="inv in inventories"
            :key="inv.id"
            class="cursor-pointer rounded-xl border p-3 transition-colors"
            :class="
              selectedInventoryId === inv.id
                ? 'border-primary bg-primary/5'
                : 'border-default hover:border-primary/50'
            "
            @click="selectInventory(inv)"
          >
            <div
              class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
            >
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-medium truncate">{{ inv.name }}</p>
                  <UBadge
                    v-if="inv.isDefault"
                    color="primary"
                    variant="soft"
                    size="xs"
                    >default</UBadge
                  >
                </div>
                <p class="text-xs text-muted">id: {{ inv.id }}</p>
              </div>
              <div class="flex items-center gap-1" @click.stop>
                <UButton
                  v-if="!inv.isDefault"
                  size="xs"
                  variant="soft"
                  color="primary"
                  icon="bx:edit"
                  @click="fillInventoryForm(inv)"
                />
                <UButton
                  v-if="!inv.isDefault"
                  size="xs"
                  variant="soft"
                  color="error"
                  icon="bx:trash"
                  @click="deleteInventory(inv)"
                />
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- ── Create / Edit inventory form ── -->
      <UCard v-if="selectedBranch && showCreateInventory">
        <template #header>
          <div>
            <h3 class="text-lg font-semibold">
              {{ editingInventoryId ? "Edit inventory" : "New inventory" }}
            </h3>
            <p class="text-sm text-muted">
              Name your inventory location (e.g. "Front Store", "Warehouse B").
            </p>
          </div>
        </template>

        <form class="space-y-4" @submit.prevent="saveInventory">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Name" required>
              <UInput
                v-model="inventoryForm.name"
                class="w-full"
                placeholder="Front Store"
              />
            </UFormField>
            <UFormField label="Sort order">
              <UInput
                v-model.number="inventoryForm.sortOrder"
                class="w-full"
                type="number"
              />
            </UFormField>
          </div>

          <div class="flex gap-2">
            <UButton
              type="submit"
              color="primary"
              :loading="savingInventory"
              :disabled="!inventoryForm.name.trim()"
            >
              {{ editingInventoryId ? "Save inventory" : "Create inventory" }}
            </UButton>
            <UButton
              type="button"
              variant="soft"
              color="neutral"
              @click="
                showCreateInventory = false;
                resetInventoryForm();
              "
            >
              Cancel
            </UButton>
          </div>
        </form>
      </UCard>

      <!-- ── Stock for selected inventory ── -->
      <UCard v-if="selectedInventory">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold">
                Stock · {{ selectedInventory.name }}
              </h3>
              <p class="text-sm text-muted">
                {{ stockRows.length }} SKU row(s). Changes are logged.
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                size="xs"
                variant="soft"
                color="primary"
                icon="bx:plus"
                @click="openCreateStock"
              >
                Add product / SKU
              </UButton>
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                icon="bx:refresh"
                @click="refreshStock"
              >
                Refresh
              </UButton>
            </div>
          </div>
        </template>

        <div v-if="stockPending" class="py-6 text-sm text-muted">
          Loading stock...
        </div>

        <div v-else class="space-y-4">
          <UInput
            v-if="stockRows.length > 3"
            v-model="stockSearch"
            placeholder="Search by SKU ID, product ID..."
            icon="bx:search"
            size="sm"
            class="w-full"
          />

          <div
            v-if="stockRows.length === 0 && !showCreateStock"
            class="rounded-xl border border-dashed border-default p-6 text-center text-sm text-muted"
          >
            <p class="mb-2">No stock rows in this inventory yet.</p>
            <UButton
              size="sm"
              variant="soft"
              color="primary"
              @click="openCreateStock"
            >
              Add your first product / SKU
            </UButton>
          </div>

          <div v-if="filteredStockRows.length > 0" class="space-y-3">
            <div
              v-for="row in filteredStockRows"
              :key="row.id"
              class="rounded-xl border border-default p-3"
            >
              <div
                class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-medium truncate">{{ row.skuId }}</p>
                    <UBadge color="neutral" variant="soft" size="xs">{{
                      row.productId
                    }}</UBadge>
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
                  <div class="text-center">
                    <p class="text-xs text-muted">Incoming</p>
                    <p class="font-semibold">{{ row.incoming }}</p>
                  </div>
                  <div class="flex gap-1">
                    <UButton
                      size="xs"
                      variant="soft"
                      color="primary"
                      icon="bx:edit"
                      @click="editStockRow(row)"
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

          <p
            v-else-if="stockRows.length > 0 && filteredStockRows.length === 0"
            class="py-4 text-center text-sm text-muted"
          >
            No rows match "{{ stockSearch }}".
          </p>
        </div>
      </UCard>

      <!-- ── Create / Edit stock form ── -->
      <UCard v-if="selectedInventory && showCreateStock">
        <template #header>
          <div>
            <h3 class="text-lg font-semibold">
              {{
                editingStockId ? "Edit stock" : "Add product / SKU to inventory"
              }}
            </h3>
            <p class="text-sm text-muted">
              {{
                editingStockId
                  ? "Update stock for this row."
                  : "Search for a product SKU, then set the initial stock."
              }}
            </p>
          </div>
        </template>

        <form class="space-y-4" @submit.prevent="saveStock">
          <div v-if="!editingStockId" class="space-y-2">
            <UFormField label="Search product / SKU" required>
              <UInput
                v-model="skuSearchQuery"
                placeholder="Type SKU code or product name..."
                icon="bx:search"
                :loading="skuSearchPending"
                class="w-full"
              />
            </UFormField>

            <div
              v-if="skuSearchResults.length > 0"
              class="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-default p-2"
            >
              <div
                v-for="item in skuSearchResults"
                :key="item.skuId"
                class="cursor-pointer rounded-lg p-2 text-sm hover:bg-primary/5 transition-colors"
                @click="pickSku(item)"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-medium truncate">{{ item.skuCode }}</p>
                    <p class="text-xs text-muted truncate">
                      {{ item.productNameTh }} · {{ item.labelTh }}
                    </p>
                  </div>
                  <div class="text-right text-xs text-muted shrink-0">
                    <p>฿{{ item.price.toLocaleString() }}</p>
                    <p>stock {{ item.stock }}</p>
                  </div>
                </div>
              </div>
            </div>

            <p
              v-else-if="skuSearchDebounced.length > 0 && !skuSearchPending"
              class="text-xs text-muted"
            >
              No SKUs found for "{{ skuSearchDebounced }}".
            </p>

            <div
              v-if="stockForm.skuId"
              class="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
            >
              <p class="font-medium">Selected: {{ stockForm.skuLabel }}</p>
              <p class="text-xs text-muted">
                SKU {{ stockForm.skuId }} · Product
                {{ stockForm.productId }}
              </p>
            </div>
          </div>

          <div
            v-else
            class="rounded-lg border border-default bg-muted/30 p-3 text-sm"
          >
            <p class="font-medium">{{ stockForm.skuLabel }}</p>
            <p class="text-xs text-muted">SKU {{ stockForm.skuId }}</p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Stock (on hand)" required>
              <UInput
                v-model.number="stockForm.onHand"
                class="w-full"
                type="number"
                min="0"
              />
            </UFormField>
          </div>

          <div class="flex gap-2">
            <UButton
              type="submit"
              color="primary"
              :loading="savingStock"
              :disabled="!editingStockId && !stockForm.skuId"
            >
              {{ editingStockId ? "Save stock" : "Add to inventory" }}
            </UButton>
            <UButton
              type="button"
              variant="soft"
              color="neutral"
              @click="
                showCreateStock = false;
                resetStockForm();
              "
            >
              Cancel
            </UButton>
          </div>
        </form>
      </UCard>
    </template>
  </div>
</template>
