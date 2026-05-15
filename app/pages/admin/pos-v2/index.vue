<script setup lang="ts">
import AdminOrderQrScanner from "~/components/admin/AdminOrderQrScanner.vue";
import AdminPosHeader from "~/components/admin/pos/AdminPosHeader.vue";
import AdminPosQuickLookup from "~/components/admin/pos/AdminPosQuickLookup.vue";
import AdminPosQueueCards from "~/components/admin/pos/AdminPosQueueCards.vue";
import AdminPosScanPanel from "~/components/admin/pos/AdminPosScanPanel.vue";
import AdminPosShell from "~/components/admin/pos/AdminPosShell.vue";
import AdminPosSidebar from "~/components/admin/pos/AdminPosSidebar.vue";
import { formatPlatformRole } from "~/utils/role-display";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

interface BranchOption {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  isActive: boolean;
}

interface LookupResponse {
  customer: {
    userId?: string | null;
    fullName: string | null;
    phone: string | null;
    kind: "account" | "walk_in";
    kycStatus?: string | null;
  } | null;
  bookings: Array<{
    id: string;
    status: string;
    productName?: string | null;
    assetName?: string | null;
    startDate: string;
    endDate: string;
  }>;
}

type ScannerPurpose = "lookup" | "catalog";
type ScannerPayloadKind =
  | "order"
  | "booking"
  | "customer"
  | "customer-phone"
  | "asset"
  | "sku"
  | "product"
  | "barcode"
  | "unknown";

const BRANCH_KEY = "hop-admin-pos-v2-branch:v1";

const toast = useToast();
const { profile, ensureProfileLoaded } = useUserProfile();

const branches = ref<BranchOption[]>([]);
const selectedBranchId = ref("");
const branchLoading = ref(false);
const isOnline = ref(true);
const quickLookupTerm = ref("");
const quickLookupLoading = ref(false);
const quickLookupResult = ref<LookupResponse | null>(null);
const scannerOpen = ref(false);
const scannerPurpose = ref<ScannerPurpose>("lookup");
const lastScanSummary = ref<string | null>(null);

const sidebarItems = [
  {
    key: "dashboard",
    label: "Dashboard / Lookup",
    description: "Safe shell entry point with quick search, scan actions, and queue placeholders.",
    icon: "bx:home-alt-2",
    to: "/admin/pos-v2",
    status: "live" as const,
  },
  {
    key: "rental",
    label: "Rental workspace",
    description: "New booking, pickup, return, active rentals, and extensions will land here later.",
    icon: "bx:calendar-check",
    status: "planned" as const,
  },
  {
    key: "sales",
    label: "Sales workspace",
    description: "Sales checkout and history stay planned until the dedicated V2 flow is ready.",
    icon: "bx:receipt",
    status: "planned" as const,
  },
  {
    key: "customers",
    label: "Customers / KYC",
    description: "Lookup, walk-in creation, KYC capture, and tax profiles will be layered in later phases.",
    icon: "bx:user-circle",
    status: "planned" as const,
  },
  {
    key: "documents",
    label: "Documents / Reprint",
    description: "Operational documents and reprint/download tools remain future placeholders in this shell.",
    icon: "bx:printer",
    status: "planned" as const,
  },
];

const currentBranch = computed(
  () => branches.value.find((branch) => branch.id === selectedBranchId.value) ?? null,
);
const branchName = computed(() => {
  if (!currentBranch.value) return "No branch selected yet";
  return `${currentBranch.value.nameTh || currentBranch.value.nameEn} · ${currentBranch.value.code}`;
});
const staffName = computed(() => profile.value?.fullName || "Staff");
const staffRole = computed(() => formatPlatformRole(profile.value?.platformRole));
const scannerTitle = computed(() =>
  scannerPurpose.value === "catalog"
    ? "Scan asset / SKU / product"
    : "Scan booking / customer QR",
);
const scannerDescription = computed(() =>
  scannerPurpose.value === "catalog"
    ? "Scans are captured now so future rental/sales modules can plug in without replacing the scanner."
    : "Scans booking/customer QR and routes staff into the existing lookup or booking detail flow.",
);

function syncOnlineStatus() {
  if (!import.meta.client) return;
  isOnline.value = navigator.onLine;
}

async function loadBranches() {
  branchLoading.value = true;
  try {
    const response = await $fetch<{ items: BranchOption[] }>("/api/admin/pos/branches");
    branches.value = response.items;
    if (!selectedBranchId.value && response.items[0]) {
      selectedBranchId.value = response.items[0].id;
    }
  } catch (error) {
    toast.add({
      title: "โหลดสาขา POS ไม่สำเร็จ",
      description: error instanceof Error ? error.message : "Unknown error",
      color: "error",
    });
  } finally {
    branchLoading.value = false;
  }
}

async function submitQuickLookup(term = quickLookupTerm.value) {
  const normalized = term.trim();
  if (!normalized) return;
  quickLookupLoading.value = true;
  try {
    quickLookupResult.value = await $fetch<LookupResponse>(
      "/api/admin/customers/lookup",
      { query: { search: normalized } },
    );
  } catch (error) {
    toast.add({
      title: "ค้นหาข้อมูลไม่สำเร็จ",
      description: error instanceof Error ? error.message : "Unknown error",
      color: "error",
    });
  } finally {
    quickLookupLoading.value = false;
  }
}

function openScanner(purpose: ScannerPurpose) {
  scannerPurpose.value = purpose;
  scannerOpen.value = true;
}

async function handleDecoded(payload: {
  raw: string;
  kind: ScannerPayloadKind;
  value: string;
}) {
  const value = payload.value || payload.raw;
  lastScanSummary.value = `${payload.kind}: ${value}`;

  if (payload.kind === "booking") {
    await navigateTo(`/admin/rental-bookings/${value}`);
    return;
  }

  if (["customer", "customer-phone", "unknown"].includes(payload.kind)) {
    quickLookupTerm.value = value;
    await submitQuickLookup(value);
    return;
  }

  toast.add({
    title: "Scan captured",
    description: "This scan type is stored in the shell, ready for later rental/sales modules.",
    color: "info",
  });
}

watch(selectedBranchId, (branchId) => {
  if (!import.meta.client || !branchId) return;
  localStorage.setItem(BRANCH_KEY, branchId);
});

onMounted(() => {
  if (import.meta.client) {
    selectedBranchId.value = localStorage.getItem(BRANCH_KEY) ?? "";
    syncOnlineStatus();
    window.addEventListener("online", syncOnlineStatus);
    window.addEventListener("offline", syncOnlineStatus);
  }

  void ensureProfileLoaded(null, { force: true });
  void loadBranches();
});

onUnmounted(() => {
  if (!import.meta.client) return;
  window.removeEventListener("online", syncOnlineStatus);
  window.removeEventListener("offline", syncOnlineStatus);
});
</script>

<template>
  <AdminPosShell>
    <template #sidebar>
      <AdminPosSidebar :items="sidebarItems" />
    </template>

    <template #header>
      <AdminPosHeader
        :staff-name="staffName"
        :staff-role="staffRole"
        :branch-name="branchName"
        :branches="branches"
        :selected-branch-id="selectedBranchId"
        :branch-loading="branchLoading"
        :is-online="isOnline"
        @update:selected-branch-id="selectedBranchId = $event"
      />
    </template>

    <UAlert
      color="warning"
      variant="soft"
      title="Phase 1 skeleton only"
      description="Pickup, return, money summary, and document generation still run through existing flows. This route is for layout, navigation, scanner reuse, and lookup groundwork."
    />

    <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
      <AdminPosQuickLookup
        v-model="quickLookupTerm"
        :loading="quickLookupLoading"
        :branch-label="branchName"
        :result="quickLookupResult"
        @submit="submitQuickLookup()"
        @scan="openScanner('lookup')"
      />

      <AdminPosScanPanel
        :last-scan-summary="lastScanSummary"
        @scan-lookup="openScanner('lookup')"
        @scan-catalog="openScanner('catalog')"
      />
    </div>

    <AdminPosQueueCards />

    <AdminOrderQrScanner
      v-model:open="scannerOpen"
      :title="scannerTitle"
      :description="scannerDescription"
      @decoded="handleDecoded"
    />
  </AdminPosShell>
</template>