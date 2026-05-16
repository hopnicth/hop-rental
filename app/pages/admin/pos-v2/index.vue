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

interface PosCatalogSku {
  id: string;
  code: string;
  labelTh: string;
  labelEn: string;
  imageUrl?: string | null;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  depositAmount: number;
}

interface PosCatalogItem {
  id: string;
  type: "rental" | "sale";
  nameTh: string;
  nameEn: string;
  brand?: string | null;
  thumbnailUrl?: string | null;
  rentalMinDays: number;
  rentalMaxDays: number;
  skus: PosCatalogSku[];
}

interface PosV2MoneySummary {
  bookingDeposit: {
    expectedAmount: number;
    paidAmount: number;
    isRevenue: false;
  };
  refundableSecurityDeposit: {
    expectedTotalAmount: number;
    remainingDueAtPickupAmount: number;
    isRevenue: false;
  };
  rentalFee: {
    expectedGrossAmount: number;
    expectedNetPayableAmount: number;
    isRevenue: true;
  };
  pickupDue: {
    rentalFeeDueAmount: number;
    remainingSecurityDepositDueAmount: number;
    totalPickupDueAmount: number;
  };
  warnings: Array<{ code: string; message: string; severity: string }>;
}

interface PosV2RentalBookingResponse {
  booking: {
    id: string;
    status: string;
    assetName: string;
    startDate: string;
    customerReturnDate: string;
    rentalDays: number;
  };
  moneySummary: PosV2MoneySummary;
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
const rentalAssetSearch = ref("");
const rentalCatalogLoading = ref(false);
const rentalCatalogItems = ref<PosCatalogItem[]>([]);
const selectedRentalAssetId = ref("");
const rentalStartDate = ref("");
const rentalEndDate = ref("");
const walkInName = ref("");
const creatingFutureBooking = ref(false);
const futureBookingResult = ref<PosV2RentalBookingResponse | null>(null);

const sidebarItems = [
  {
    key: "dashboard",
    label: "Dashboard / Lookup",
    description:
      "Safe shell entry point with quick search, scan actions, and queue placeholders.",
    icon: "bx:home-alt-2",
    to: "/admin/pos-v2",
    status: "live" as const,
  },
  {
    key: "rental",
    label: "Rental workspace",
    description:
      "Staff-created future bookings are live. Pickup, return, and settlement remain later phases.",
    icon: "bx:calendar-check",
    status: "live" as const,
  },
  {
    key: "sales",
    label: "Sales workspace",
    description:
      "Sales checkout and history stay planned until the dedicated V2 flow is ready.",
    icon: "bx:receipt",
    status: "planned" as const,
  },
  {
    key: "customers",
    label: "Customers / KYC",
    description:
      "Lookup, walk-in creation, KYC capture, and tax profiles will be layered in later phases.",
    icon: "bx:user-circle",
    status: "planned" as const,
  },
  {
    key: "documents",
    label: "Documents / Reprint",
    description:
      "Operational documents and reprint/download tools remain future placeholders in this shell.",
    icon: "bx:printer",
    status: "planned" as const,
  },
];

const currentBranch = computed(
  () =>
    branches.value.find((branch) => branch.id === selectedBranchId.value) ??
    null,
);
const branchName = computed(() => {
  if (!currentBranch.value) return "No branch selected yet";
  return `${currentBranch.value.nameTh || currentBranch.value.nameEn} · ${currentBranch.value.code}`;
});
const staffName = computed(() => profile.value?.fullName || "Staff");
const staffRole = computed(() =>
  formatPlatformRole(profile.value?.platformRole),
);
const lookupCustomer = computed(
  () => quickLookupResult.value?.customer ?? null,
);
const selectedRentalItem = computed(
  () =>
    rentalCatalogItems.value.find(
      (item) => item.id === selectedRentalAssetId.value,
    ) ?? null,
);
const selectedRentalSku = computed(
  () => selectedRentalItem.value?.skus[0] ?? null,
);
const customerPhoneForBooking = computed(
  () => lookupCustomer.value?.phone || quickLookupTerm.value.trim(),
);
const customerNameForBooking = computed(
  () =>
    lookupCustomer.value?.fullName ||
    walkInName.value.trim() ||
    "Walk-in customer",
);
const canCreateFutureBooking = computed(
  () =>
    Boolean(selectedBranchId.value) &&
    Boolean(customerPhoneForBooking.value || lookupCustomer.value?.userId) &&
    Boolean(selectedRentalSku.value?.id) &&
    Boolean(rentalStartDate.value) &&
    Boolean(rentalEndDate.value) &&
    !creatingFutureBooking.value,
);
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
    const response = await $fetch<{ items: BranchOption[] }>(
      "/api/admin/pos/branches",
    );
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

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

async function searchRentalAssets() {
  rentalCatalogLoading.value = true;
  try {
    const response = await $fetch<{ items: PosCatalogItem[] }>(
      "/api/admin/pos/catalog",
      {
        query: {
          mode: "rental",
          branchId: selectedBranchId.value,
          search: rentalAssetSearch.value.trim(),
        },
      },
    );
    rentalCatalogItems.value = response.items.filter(
      (item) => item.type === "rental",
    );
    if (!selectedRentalAssetId.value && rentalCatalogItems.value[0]) {
      selectedRentalAssetId.value = rentalCatalogItems.value[0].id;
    }
  } catch (error) {
    toast.add({
      title: "ค้นหาอุปกรณ์เช่าไม่สำเร็จ",
      description: error instanceof Error ? error.message : "Unknown error",
      color: "error",
    });
  } finally {
    rentalCatalogLoading.value = false;
  }
}

async function createFutureRentalBooking() {
  if (!canCreateFutureBooking.value || !selectedRentalSku.value) return;
  creatingFutureBooking.value = true;
  futureBookingResult.value = null;
  try {
    const customer = lookupCustomer.value;
    const response = await $fetch<PosV2RentalBookingResponse>(
      "/api/admin/pos-v2/rental-bookings",
      {
        method: "POST",
        body: {
          userId: customer?.kind === "account" ? customer.userId : null,
          walkInPhone:
            customer?.kind === "account" ? null : customerPhoneForBooking.value,
          bookerName: customerNameForBooking.value,
          bookerPhone: customerPhoneForBooking.value,
          assetId: selectedRentalSku.value.id,
          branchId: selectedBranchId.value,
          startDate: rentalStartDate.value,
          endDate: rentalEndDate.value,
        },
      },
    );
    futureBookingResult.value = response;
    toast.add({
      title: "สร้าง Future Booking ใน POS V2 แล้ว",
      color: "success",
    });
    if (customerPhoneForBooking.value)
      await submitQuickLookup(customerPhoneForBooking.value);
  } catch (error) {
    toast.add({
      title: "สร้าง Future Booking ไม่สำเร็จ",
      description: error instanceof Error ? error.message : "Unknown error",
      color: "error",
    });
  } finally {
    creatingFutureBooking.value = false;
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
    description:
      "This scan type is stored in the shell, ready for later rental/sales modules.",
    color: "info",
  });
}

watch(selectedBranchId, (branchId) => {
  rentalCatalogItems.value = [];
  selectedRentalAssetId.value = "";
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
      color="info"
      variant="soft"
      title="Phase 3 guardrail: Future Booking only"
      description="POS V2 can create staff-confirmed future rental bookings. It does not collect payment, issue fiscal documents, pick up, return, or settle deposits in this phase."
    />

    <div
      class="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]"
    >
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

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Rental workspace</h2>
            <p class="text-sm text-muted">
              Create a staff-confirmed future booking using the Phase 2A money
              summary contract. Payment and fiscal document actions are
              disabled.
            </p>
          </div>
          <UBadge color="success" variant="soft">Future Booking</UBadge>
        </div>
      </template>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div class="space-y-4">
          <div class="grid gap-3 md:grid-cols-2">
            <UInput
              v-model="rentalAssetSearch"
              icon="bx:search"
              placeholder="Search asset code / name"
              @keyup.enter="searchRentalAssets"
            />
            <UButton
              icon="bx:search"
              color="primary"
              :loading="rentalCatalogLoading"
              @click="searchRentalAssets"
            >
              Search rental assets
            </UButton>
          </div>

          <div
            v-if="rentalCatalogItems.length"
            class="grid gap-3 md:grid-cols-2"
          >
            <button
              v-for="item in rentalCatalogItems"
              :key="item.id"
              type="button"
              class="rounded-2xl border p-4 text-left transition"
              :class="
                item.id === selectedRentalAssetId
                  ? 'border-primary bg-primary/5'
                  : 'border-default'
              "
              @click="selectedRentalAssetId = item.id"
            >
              <p class="font-medium text-default">
                {{ item.nameTh || item.nameEn }}
              </p>
              <p class="text-sm text-muted">
                {{ item.skus[0]?.code }} ·
                {{ formatMoney(item.skus[0]?.dailyRate) }}/day
              </p>
              <p class="text-xs text-muted">
                Deposit {{ formatMoney(item.skus[0]?.depositAmount) }} · Min
                {{ item.rentalMinDays }} day(s)
              </p>
            </button>
          </div>

          <UAlert
            v-else
            color="neutral"
            variant="soft"
            title="No rental asset selected"
            description="Search and select an asset before creating a future booking."
          />

          <div class="grid gap-3 md:grid-cols-3">
            <UInput
              v-model="walkInName"
              placeholder="Walk-in name (optional)"
            />
            <UInput v-model="rentalStartDate" type="date" label="Start date" />
            <UInput v-model="rentalEndDate" type="date" label="Return date" />
          </div>

          <UAlert
            color="warning"
            variant="soft"
            title="No pickup or payment in this phase"
            description="The server records expected rental fee, booking deposit, and refundable security deposit lines, but all paid amounts remain zero."
          />
        </div>

        <div class="space-y-4 rounded-2xl border border-default p-4">
          <div>
            <p class="text-sm text-muted">Customer</p>
            <p class="font-medium text-default">{{ customerNameForBooking }}</p>
            <p class="text-sm text-muted">
              {{ customerPhoneForBooking || "Search/select customer first" }}
            </p>
          </div>

          <div v-if="selectedRentalSku">
            <p class="text-sm text-muted">Selected asset</p>
            <p class="font-medium text-default">
              {{ selectedRentalItem?.nameTh || selectedRentalItem?.nameEn }}
            </p>
            <p class="text-sm text-muted">{{ selectedRentalSku.code }}</p>
          </div>

          <UButton
            block
            color="primary"
            icon="bx:calendar-plus"
            :disabled="!canCreateFutureBooking"
            :loading="creatingFutureBooking"
            @click="createFutureRentalBooking"
          >
            Create future booking
          </UButton>

          <div
            v-if="futureBookingResult"
            class="space-y-3 rounded-xl bg-muted/40 p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-medium text-default">Created</p>
              <UBadge color="success" variant="soft">
                {{ futureBookingResult.booking.status }}
              </UBadge>
            </div>
            <p class="text-sm text-muted">
              {{ futureBookingResult.booking.assetName }} ·
              {{ futureBookingResult.booking.startDate }} →
              {{ futureBookingResult.booking.customerReturnDate }}
            </p>
            <div class="grid gap-2 text-sm">
              <div class="flex justify-between gap-3">
                <span>Rental fee</span>
                <strong>{{
                  formatMoney(
                    futureBookingResult.moneySummary.rentalFee
                      .expectedGrossAmount,
                  )
                }}</strong>
              </div>
              <div class="flex justify-between gap-3">
                <span>Booking Deposit expected</span>
                <strong>{{
                  formatMoney(
                    futureBookingResult.moneySummary.bookingDeposit
                      .expectedAmount,
                  )
                }}</strong>
              </div>
              <div class="flex justify-between gap-3">
                <span>Pickup due</span>
                <strong>{{
                  formatMoney(
                    futureBookingResult.moneySummary.pickupDue
                      .totalPickupDueAmount,
                  )
                }}</strong>
              </div>
            </div>
            <UButton
              :to="`/admin/rental-bookings/${futureBookingResult.booking.id}`"
              size="sm"
              variant="soft"
              color="primary"
            >
              Open booking detail
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <AdminPosQueueCards />

    <AdminOrderQrScanner
      v-model:open="scannerOpen"
      :title="scannerTitle"
      :description="scannerDescription"
      @decoded="handleDecoded"
    />
  </AdminPosShell>
</template>
