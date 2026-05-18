<script setup lang="ts">
import AdminOrderQrScanner from "~/components/admin/AdminOrderQrScanner.vue";
import AdminPosHeader from "~/components/admin/pos/AdminPosHeader.vue";
import AdminPosQuickLookup from "~/components/admin/pos/AdminPosQuickLookup.vue";
import AdminPosQueueCards from "~/components/admin/pos/AdminPosQueueCards.vue";
import AdminPosScanPanel from "~/components/admin/pos/AdminPosScanPanel.vue";
import AdminPosShell from "~/components/admin/pos/AdminPosShell.vue";
import AdminPosSidebar from "~/components/admin/pos/AdminPosSidebar.vue";
import type { RentalDepositPaymentMethod } from "~/types/rental-booking";
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

interface PosV2PickupReadinessReason {
  code: string;
  severity: "blocker" | "warning" | "info";
  message: string;
  context?: Record<string, unknown>;
}

interface PosV2PickupReadiness {
  booking: {
    id: string;
    reference: string;
    status: string;
  };
  customer: {
    kind: "account" | "walk_in" | "unknown";
    displayName: string | null;
    phone: string | null;
    kycStatus: string | null;
    idEvidencePresent: boolean;
  };
  rental: {
    branchId: string | null;
    assetCode: string | null;
    assetName: string | null;
    startDate: string;
    endDate: string;
    rentalDays: number;
    branchName: string | null;
  };
  readiness: {
    classification: "ready" | "warning" | "blocked";
    canProceedToPickup: boolean;
    blockers: PosV2PickupReadinessReason[];
    warnings: PosV2PickupReadinessReason[];
  };
  moneySummary: PosV2MoneySummary;
  moneyWarnings: Array<{ code: string; message: string; severity: string }>;
}

interface PosV2PickupReadinessResponse {
  readiness: PosV2PickupReadiness;
}

interface PosV2PickupCompletionResponse {
  completion: {
    bookingId: string;
    status: string;
    pickupCompleted: true;
  };
  payment: {
    paymentMethod: RentalDepositPaymentMethod;
    collectedAmount: number;
    expectedPickupAmount: number;
  };
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
const pickupBookingInput = ref("");
const pickupReadinessLoading = ref(false);
const pickupReadinessResult = ref<PosV2PickupReadiness | null>(null);
const pickupReadinessError = ref<string | null>(null);
const pickupPaymentMethod = ref<RentalDepositPaymentMethod>("cash");
const pickupCollectedAmount = ref("");
const pickupSignature = ref<string | null>(null);
const pickupCompletionSubmitting = ref(false);
const pickupCompletionError = ref<string | null>(null);
const pickupCompletionResult = ref<PosV2PickupCompletionResponse | null>(null);

const pickupPaymentMethods: Array<{
  value: RentalDepositPaymentMethod;
  label: string;
}> = [
  { value: "cash", label: "เงินสด" },
  { value: "qr_transfer", label: "โอนผ่าน QR" },
  { value: "bank_transfer", label: "โอนบัญชี" },
  { value: "card", label: "บัตร" },
  { value: "other", label: "อื่น ๆ" },
];

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
      "Staff-created future bookings and pickup readiness are live. Pickup completion, return, and settlement remain later phases.",
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
    : "Scans booking/customer QR and routes staff into lookup or Pickup Readiness.",
);

const readinessBadgeColor = computed(() => {
  const classification = pickupReadinessResult.value?.readiness.classification;
  if (classification === "ready") return "success";
  if (classification === "blocked") return "error";
  return "warning";
});
const pickupDueAmount = computed(
  () =>
    pickupReadinessResult.value?.moneySummary.pickupDue.totalPickupDueAmount ??
    0,
);
const completionHardBlockers = computed(() => {
  const readiness = pickupReadinessResult.value;
  if (!readiness) return ["Load pickup readiness before completing pickup."];
  const blockers = readiness.readiness.blockers.map((item) => item.message);
  const futurePickup = readiness.readiness.warnings.find(
    (item) => item.code === "pickup_date_in_future",
  );
  if (futurePickup) blockers.push(futurePickup.message);
  const materialMoneyWarnings = readiness.moneyWarnings.filter((warning) =>
    [
      "missing_payment_lines",
      "missing_expected_line",
      "duplicate_active_line",
      "inconsistent_booking_total",
      "line_semantics_conflict",
      "legacy_limited_interpretation",
    ].includes(warning.code),
  );
  blockers.push(...materialMoneyWarnings.map((warning) => warning.message));
  return blockers;
});
const canSubmitPickupCompletion = computed(
  () =>
    Boolean(pickupReadinessResult.value) &&
    completionHardBlockers.value.length === 0 &&
    !pickupCompletionSubmitting.value,
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

function resetPickupCompletionForm(total = pickupDueAmount.value) {
  pickupPaymentMethod.value = "cash";
  pickupCollectedAmount.value = String(Number(total ?? 0));
  pickupSignature.value = null;
  pickupCompletionError.value = null;
  pickupCompletionResult.value = null;
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

function normalizeBookingInput(value: string) {
  return value
    .trim()
    .replace(/^booking:/i, "")
    .trim();
}

async function loadPickupReadiness(bookingId = pickupBookingInput.value) {
  const normalized = normalizeBookingInput(bookingId);
  if (!normalized) {
    pickupReadinessError.value = "Enter a booking ID or scan a booking QR.";
    return;
  }
  pickupBookingInput.value = normalized;
  pickupReadinessLoading.value = true;
  pickupReadinessError.value = null;
  try {
    const response = await $fetch<PosV2PickupReadinessResponse>(
      `/api/admin/pos-v2/rental-bookings/${encodeURIComponent(normalized)}/pickup-readiness`,
    );
    pickupReadinessResult.value = response.readiness;
    resetPickupCompletionForm(
      response.readiness.moneySummary.pickupDue.totalPickupDueAmount,
    );
  } catch (error) {
    pickupReadinessResult.value = null;
    resetPickupCompletionForm(0);
    pickupReadinessError.value =
      error instanceof Error
        ? error.message
        : "Unable to load pickup readiness";
    toast.add({
      title: "โหลด Pickup Readiness ไม่สำเร็จ",
      description: pickupReadinessError.value,
      color: "error",
    });
  } finally {
    pickupReadinessLoading.value = false;
  }
}

async function openPickupReadinessForBooking(bookingId: string) {
  pickupBookingInput.value = bookingId;
  await loadPickupReadiness(bookingId);
}

function normalizedErrorMessage(error: unknown) {
  const candidate = (
    typeof error === "object" && error !== null ? error : null
  ) as {
    data?: { statusMessage?: string; message?: string };
    response?: { _data?: { statusMessage?: string; message?: string } };
    statusMessage?: string;
    message?: string;
  } | null;
  return (
    candidate?.data?.statusMessage ||
    candidate?.response?._data?.statusMessage ||
    candidate?.statusMessage ||
    candidate?.data?.message ||
    candidate?.response?._data?.message ||
    (error instanceof Error ? error.message : null) ||
    "Unable to complete pickup"
  );
}

async function completePickupFromReadiness() {
  const readiness = pickupReadinessResult.value;
  if (!readiness || pickupCompletionSubmitting.value) return;
  pickupCompletionError.value = null;
  pickupCompletionResult.value = null;

  if (completionHardBlockers.value.length > 0) {
    pickupCompletionError.value = completionHardBlockers.value[0];
    return;
  }
  const collectedAmount = Number(pickupCollectedAmount.value);
  if (!Number.isFinite(collectedAmount) || collectedAmount < 0) {
    pickupCompletionError.value = "Enter a valid collected amount.";
    return;
  }
  if (!pickupSignature.value) {
    pickupCompletionError.value = "Customer pickup signature is required.";
    return;
  }

  pickupCompletionSubmitting.value = true;
  try {
    const result = await $fetch<PosV2PickupCompletionResponse>(
      `/api/admin/pos-v2/rental-bookings/${encodeURIComponent(readiness.booking.id)}/pickup-complete`,
      {
        method: "POST",
        body: {
          paymentMethod: pickupPaymentMethod.value,
          collectedAmount,
          signatureDataUrl: pickupSignature.value,
          branchId: readiness.rental.branchId,
        },
      },
    );
    toast.add({ title: "Pickup completed", color: "success" });
    await loadPickupReadiness(readiness.booking.id);
    pickupCompletionResult.value = result;
    if (pickupReadinessResult.value) {
      pickupReadinessResult.value.booking.status = result.completion.status;
      pickupReadinessResult.value.readiness.classification = "blocked";
      pickupReadinessResult.value.readiness.canProceedToPickup = false;
      pickupReadinessResult.value.readiness.blockers = [
        {
          code: "pickup_completed",
          severity: "blocker",
          message: "Pickup is complete. This booking is now picked_up.",
        },
      ];
      pickupReadinessResult.value.readiness.warnings = [];
    }
    pickupSignature.value = null;
  } catch (error) {
    pickupCompletionError.value = normalizedErrorMessage(error);
    toast.add({
      title: pickupCompletionError.value.includes("payment was recorded")
        ? "Pickup needs manual follow-up"
        : "Complete pickup failed",
      description: pickupCompletionError.value,
      color: "error",
    });
  } finally {
    pickupCompletionSubmitting.value = false;
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
    await openPickupReadinessForBooking(value);
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
      title="Phase 4B2 guardrail: Pickup payment + completion only"
      description="POS V2 can create future rental bookings, load pickup readiness, and complete eligible pickup through the Phase 4B1 backend. Fiscal documents, return, settlement, refunds, and tax invoice/ABB flows remain out of scope."
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
        @open-pickup-readiness="openPickupReadinessForBooking"
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
            title="Future booking is still unpaid"
            description="Payment is collected later from the Pickup Readiness workspace. This creation step still does not issue fiscal documents or complete pickup."
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
              class="mr-2"
              size="sm"
              color="primary"
              @click="
                openPickupReadinessForBooking(futureBookingResult.booking.id)
              "
            >
              Open pickup readiness
            </UButton>
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

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Pickup Readiness workspace</h2>
            <p class="text-sm text-muted">
              Load server readiness first, then collect pickup payment and
              customer signature through the Phase 4B1 backend.
            </p>
          </div>
          <UBadge color="primary" variant="soft">Pickup completion</UBadge>
        </div>
      </template>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div class="space-y-4">
          <div class="flex flex-col gap-2 md:flex-row">
            <UInput
              v-model="pickupBookingInput"
              icon="bx:barcode-reader"
              class="flex-1"
              placeholder="Booking ID or booking: QR value"
              @keyup.enter="loadPickupReadiness()"
            />
            <UButton
              icon="bx:search"
              color="primary"
              :loading="pickupReadinessLoading"
              @click="loadPickupReadiness()"
            >
              Load readiness
            </UButton>
          </div>

          <UAlert
            color="info"
            variant="soft"
            title="Pickup V2 guardrail"
            description="Completion uses server readiness, the Phase 2A money summary, and the Phase 4B1 pickup-complete endpoint. Checklist editing, fiscal documents, return, and settlement remain out of scope."
          />

          <UAlert
            v-if="pickupReadinessError"
            color="error"
            variant="soft"
            title="Pickup readiness unavailable"
            :description="pickupReadinessError"
          />
        </div>

        <div v-if="pickupReadinessResult" class="space-y-4">
          <div class="rounded-2xl border border-default p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm text-muted">Booking reference</p>
                <p class="font-medium text-default">
                  {{ pickupReadinessResult.booking.reference }}
                </p>
                <p class="text-sm text-muted">
                  {{ pickupReadinessResult.rental.assetName || "Rental asset" }}
                  · {{ pickupReadinessResult.rental.startDate }} →
                  {{ pickupReadinessResult.rental.endDate }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UBadge color="neutral" variant="soft">
                  {{ pickupReadinessResult.booking.status }}
                </UBadge>
                <UBadge :color="readinessBadgeColor" variant="soft">
                  {{ pickupReadinessResult.readiness.classification }}
                </UBadge>
              </div>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-2xl border border-default p-4">
              <p class="text-sm text-muted">Customer</p>
              <p class="font-medium text-default">
                {{
                  pickupReadinessResult.customer.displayName ||
                  "Unnamed customer"
                }}
              </p>
              <p class="text-sm text-muted">
                {{ pickupReadinessResult.customer.phone || "No phone" }} ·
                {{ pickupReadinessResult.customer.kind }}
              </p>
              <p class="text-xs text-muted">
                KYC {{ pickupReadinessResult.customer.kycStatus || "n/a" }} · ID
                evidence
                {{
                  pickupReadinessResult.customer.idEvidencePresent
                    ? "present"
                    : "missing"
                }}
              </p>
            </div>
            <div class="rounded-2xl border border-default p-4">
              <p class="text-sm text-muted">Asset / pickup branch</p>
              <p class="font-medium text-default">
                {{ pickupReadinessResult.rental.assetCode || "No asset code" }}
              </p>
              <p class="text-sm text-muted">
                {{
                  pickupReadinessResult.rental.branchName || "No branch context"
                }}
                · {{ pickupReadinessResult.rental.rentalDays }} day(s)
              </p>
            </div>
          </div>

          <div class="rounded-2xl border border-default p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <p class="font-medium text-default">Money due at pickup</p>
              <UBadge color="primary" variant="soft"
                >Server money summary</UBadge
              >
            </div>
            <div class="grid gap-2 text-sm">
              <div class="flex justify-between gap-3">
                <span>Rental fee due</span>
                <strong>{{
                  formatMoney(
                    pickupReadinessResult.moneySummary.pickupDue
                      .rentalFeeDueAmount,
                  )
                }}</strong>
              </div>
              <div class="flex justify-between gap-3">
                <span>Remaining security deposit</span>
                <strong>{{
                  formatMoney(
                    pickupReadinessResult.moneySummary.pickupDue
                      .remainingSecurityDepositDueAmount,
                  )
                }}</strong>
              </div>
              <div
                class="flex justify-between gap-3 border-t border-default pt-2"
              >
                <span>Total pickup amount due</span>
                <strong>{{
                  formatMoney(
                    pickupReadinessResult.moneySummary.pickupDue
                      .totalPickupDueAmount,
                  )
                }}</strong>
              </div>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <UAlert
              v-if="pickupReadinessResult.readiness.blockers.length"
              color="error"
              variant="soft"
              title="Cannot proceed yet"
            >
              <template #description>
                <ul class="list-disc space-y-1 pl-4">
                  <li
                    v-for="item in pickupReadinessResult.readiness.blockers"
                    :key="item.code + item.message"
                  >
                    {{ item.message }}
                  </li>
                </ul>
              </template>
            </UAlert>
            <UAlert
              v-else
              color="success"
              variant="soft"
              title="Ready to proceed to pickup"
              description="No server-side readiness blockers were found. Confirm payment and capture the customer signature below."
            />

            <UAlert
              v-if="pickupReadinessResult.readiness.warnings.length"
              color="warning"
              variant="soft"
              title="Warnings"
            >
              <template #description>
                <ul class="list-disc space-y-1 pl-4">
                  <li
                    v-for="item in pickupReadinessResult.readiness.warnings"
                    :key="item.code + item.message"
                  >
                    {{ item.message }}
                  </li>
                </ul>
              </template>
            </UAlert>
          </div>

          <div class="space-y-4 rounded-2xl border border-default p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-medium text-default">Pickup Completion</p>
                <p class="text-sm text-muted">
                  Collect exactly the server-calculated pickup amount, then
                  capture customer pickup signature.
                </p>
              </div>
              <UBadge color="primary" variant="soft">Phase 4B1 backend</UBadge>
            </div>

            <UAlert
              v-if="pickupCompletionResult"
              color="success"
              variant="soft"
              title="Pickup completed"
              :description="`Booking ${pickupCompletionResult.completion.bookingId} is now ${pickupCompletionResult.completion.status}. Collected ${formatMoney(pickupCompletionResult.payment.collectedAmount)} via ${pickupCompletionResult.payment.paymentMethod}.`"
            />

            <UAlert
              v-if="completionHardBlockers.length && !pickupCompletionResult"
              color="error"
              variant="soft"
              title="Pickup completion is blocked"
            >
              <template #description>
                <ul class="list-disc space-y-1 pl-4">
                  <li v-for="item in completionHardBlockers" :key="item">
                    {{ item }}
                  </li>
                </ul>
              </template>
            </UAlert>

            <UAlert
              v-if="pickupCompletionError"
              color="error"
              variant="soft"
              :title="
                pickupCompletionError.includes('payment was recorded')
                  ? 'Pickup payment recorded; fulfillment follow-up needed'
                  : 'Pickup completion failed'
              "
              :description="pickupCompletionError"
            />

            <div class="grid gap-3 md:grid-cols-3">
              <div class="rounded-xl bg-muted/40 p-3 text-sm">
                <p class="text-muted">Rental fee due</p>
                <p class="font-semibold text-default">
                  {{
                    formatMoney(
                      pickupReadinessResult.moneySummary.pickupDue
                        .rentalFeeDueAmount,
                    )
                  }}
                </p>
              </div>
              <div class="rounded-xl bg-muted/40 p-3 text-sm">
                <p class="text-muted">Security deposit due</p>
                <p class="font-semibold text-default">
                  {{
                    formatMoney(
                      pickupReadinessResult.moneySummary.pickupDue
                        .remainingSecurityDepositDueAmount,
                    )
                  }}
                </p>
              </div>
              <div class="rounded-xl bg-primary/10 p-3 text-sm">
                <p class="text-muted">Total pickup amount due</p>
                <p class="font-semibold text-primary">
                  {{ formatMoney(pickupDueAmount) }}
                </p>
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Payment method">
                <select
                  v-model="pickupPaymentMethod"
                  class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
                  :disabled="
                    !canSubmitPickupCompletion ||
                    Boolean(pickupCompletionResult)
                  "
                >
                  <option
                    v-for="method in pickupPaymentMethods"
                    :key="method.value"
                    :value="method.value"
                  >
                    {{ method.label }}
                  </option>
                </select>
              </UFormField>
              <UFormField label="Collected amount">
                <UInput
                  v-model="pickupCollectedAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  :disabled="
                    !canSubmitPickupCompletion ||
                    Boolean(pickupCompletionResult)
                  "
                />
              </UFormField>
            </div>

            <div class="space-y-2">
              <p class="text-sm font-medium">Customer pickup signature</p>
              <DigitalSignaturePad
                v-model="pickupSignature"
                hint="ให้ลูกค้าเซ็นรับของสำหรับ POS V2 Pickup Completion"
              />
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3">
              <UButton
                :to="`/admin/rental-bookings/${pickupReadinessResult.booking.id}`"
                variant="soft"
                color="neutral"
                icon="bx:clipboard"
              >
                Complete checklist in booking detail
              </UButton>
              <UButton
                color="primary"
                icon="bx:package"
                :loading="pickupCompletionSubmitting"
                :disabled="
                  !canSubmitPickupCompletion || Boolean(pickupCompletionResult)
                "
                @click="completePickupFromReadiness"
              >
                Complete pickup
              </UButton>
            </div>
          </div>
        </div>

        <UAlert
          v-else
          color="neutral"
          variant="soft"
          title="No pickup readiness loaded"
          description="Create a future booking, scan a booking QR, pick a lookup result, or enter a booking ID to load the server readiness payload."
        />
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
