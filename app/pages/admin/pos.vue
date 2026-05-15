<script setup lang="ts">
import AdminOrderQrScanner from "~/components/admin/AdminOrderQrScanner.vue";
import DigitalSignaturePad from "~/components/admin/DigitalSignaturePad.vue";
import type { AdminRentalBookingRow } from "~/types/admin-order";
import type {
  AdminCustomerProfile,
  AdminRentalBookingDetail,
} from "~/types/admin-order-detail";
import {
  decomposeRentalDuration,
  type RentalPricingBreakdown,
} from "~/utils/rental-pricing";
import { calculateInclusiveRentalDays } from "~/utils/rental-dates";
import type {
  RentalDepositPaymentMethod,
  RentalDepositRefundStatus,
} from "~/types/rental-booking";
import type {
  AdminBookingChecklist,
  AdminBookingChecklistItem,
  AdminBookingOpsPayload,
  RentalChecklistKind,
  RentalChecklistStatus,
  UpdateChecklistItemPayload,
} from "~/types/admin-booking-ops";
import {
  buildPosRentalFulfillmentPayload,
  normalizePosRentalFulfillmentError,
  requiresReturnRefundProof,
} from "~/utils/admin-rental-fulfillment";
import type {
  RentalPaymentLine,
  RentalPaymentLineSummary,
} from "~/types/rental-payment-line";
import {
  calculateRentalPaymentLines,
  summarizeRentalPaymentLines,
} from "~/utils/rental-payment-lines";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

interface LookupResponse {
  customer: (AdminCustomerProfile & { kind: "account" | "walk_in" }) | null;
  bookings: AdminRentalBookingRow[];
}

interface PosCatalogSku {
  id: string;
  productId: string;
  code?: string;
  labelTh: string;
  labelEn: string;
  imageUrl: string | null;
  price: number;
  depositAmount: number;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  rentalStock: number;
  reservedStock: number;
}

interface PosCatalogProduct {
  id: string;
  slug: string;
  type: "rental" | "sale";
  nameTh: string;
  nameEn: string;
  brand: string | null;
  thumbnailUrl: string | null;
  rentalMinDays: number;
  rentalMaxDays: number;
  skus: PosCatalogSku[];
}

interface PosCatalogResponse {
  items: PosCatalogProduct[];
}

interface BranchOption {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  isActive: boolean;
}

interface PosSaleLine {
  skuId: string;
  productId: string;
  code: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  maxQuantity: number;
}

interface PosHistoryItem {
  id: string;
  type: "sale" | "rental";
  documentNo: string;
  status: string;
  createdAt: string;
  customerName: string;
  amount: number;
  rentalTotal?: number;
  depositPaidAmount?: number;
  depositRefundStatus?: string;
  depositRefundAmount?: number;
  paymentStatus: string;
  paymentMethod: string;
  depositPaymentMethod?: string | null;
  branchId: string;
  branchName: string;
}

interface SaleSkuOption {
  key: string;
  product: PosCatalogProduct;
  sku: PosCatalogSku;
  productName: string;
  skuName: string;
  code: string;
  imageUrl: string | null;
  stock: number;
  searchText: string;
}

interface PosHistoryResponse {
  date: string;
  branchId: string | null;
  items: PosHistoryItem[];
  summary: {
    totalAmount: number;
    totalSales: number;
    totalRentals: number;
    transactionCount: number;
    paymentBreakdown: Record<string, { count: number; amount: number }>;
  };
}

interface RentalBookingCalendarPayload {
  startDate: string;
  numDays: number;
  returnDate: string;
  totalCost: number;
  deposit: number;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  pricingBreakdown: RentalPricingBreakdown;
  isValid: boolean;
}

interface PosBlockingBooking {
  bookingId: string;
  skuId?: string;
  assetId?: string;
  startDate: string;
  returnDate: string;
  status: string;
}

interface PosBookingBlocksResponse {
  items: PosBlockingBooking[];
}

type PosTransactionMode = "rental" | "sale";
type ScannerPurpose = "customer" | "catalog";

const DRAFT_KEY = "hop-admin-pos-draft:v1";
const BRANCH_KEY = "hop-admin-pos-branch:v1";
const PENDING_ID_KEY = "hop-admin-pos-pending-id:v1";
const PENDING_BOOKING_KEY = "hop-admin-pos-pending-booking:v1";
const BOOKING_CALENDAR_BLOCK_REFRESH_MS = 15_000;
const toast = useToast();
const { profile, ensureProfileLoaded } = useUserProfile();

const isScannerOpen = ref(false);
const scannerPurpose = ref<ScannerPurpose>("customer");
const isOnline = ref(true);
const search = ref("");
const lookup = ref<LookupResponse | null>(null);
const loading = ref(false);
const progress = ref(false);
const selectedBooking = ref<AdminRentalBookingRow | null>(null);
const bookingOps = ref<AdminBookingOpsPayload | null>(null);
const bookingOpsLoading = ref(false);
const checklistBusy = ref(false);
const pickupSignature = ref<string | null>(null);
const returnSignature = ref<string | null>(null);
const fulfillmentNotes = ref("");
const fulfillmentErrorMessage = ref<string | null>(null);
const fulfillmentSubmittingType = ref<"pickup" | "return" | null>(null);
const refundForm = reactive({
  status: "pending" as RentalDepositRefundStatus,
  amount: 0,
  notes: "",
});
const refundProofFile = ref<File | null>(null);
const refundProofPreview = ref<string | null>(null);
const refundProofUploadedUrl = ref<string | null>(null);
const refundProofUploading = ref(false);

const draft = reactive({ phone: "", fullName: "", notes: "" });
const idModalOpen = ref(false);
const idFile = ref<File | null>(null);
const idPreview = ref<string | null>(null);
const uploadingId = ref(false);
const viewingIdCard = ref(false);
const hasPendingIdDraft = ref(false);
const transactionMode = ref<PosTransactionMode>("rental");
const branches = ref<BranchOption[]>([]);
const branchLoading = ref(false);
const selectedBranchId = ref("");
const catalogSearch = ref("");
const catalogLoading = ref(false);
const catalogSuggestOpen = ref(false);
const catalogProducts = ref<PosCatalogProduct[]>([]);
const selectedProductId = ref("");
const selectedSkuId = ref("");
const bookingStartDate = ref("");
const bookingEndDate = ref("");
const bookingCalendarValid = ref(false);
const bookingCalendarBlocks = ref<PosBlockingBooking[]>([]);
const bookingCalendarBlocksLoading = ref(false);
const rentalDepositPaidAmount = ref(0);
const salePaidAmount = ref(0);
const depositPaidAmount = computed({
  get: () =>
    transactionMode.value === "sale"
      ? salePaidAmount.value
      : rentalDepositPaidAmount.value,
  set: (value: number) => {
    const normalized = Math.max(0, Number(value) || 0);
    if (transactionMode.value === "sale") salePaidAmount.value = normalized;
    else rentalDepositPaidAmount.value = normalized;
  },
});
const depositPaymentMethod = ref<RentalDepositPaymentMethod>("cash");
const depositNotes = ref("");
const depositProofFile = ref<File | null>(null);
const depositProofPreview = ref<string | null>(null);
const creatingBooking = ref(false);
const creatingSale = ref(false);
const hasPendingBookingDraft = ref(false);
const saleCart = ref<PosSaleLine[]>([]);
const saleNotes = ref("");
const historyDate = ref(todayBangkokDateInput());
const historyLoading = ref(false);
const posHistory = ref<PosHistoryResponse | null>(null);
const showIncompleteOnly = ref(false);
const cancellingHistoryKey = ref<string | null>(null);
const openingFulfillmentHistoryKey = ref<string | null>(null);
const depositConfirmOpen = ref(false);
const depositEditOpen = ref(false);
const depositEditSaving = ref(false);
const pendingDepositAction = ref<"create-booking" | "update-booking" | null>(
  null,
);
const depositAdjustmentReason = ref("");
const depositEdit = reactive({
  bookingId: "",
  documentNo: "",
  currentAmount: 0,
  newAmount: 0,
  currentMethod: "",
  newMethod: "cash" as RentalDepositPaymentMethod,
  currentStatus: "unpaid",
  notes: "",
});
let catalogSearchTimer: ReturnType<typeof setTimeout> | null = null;
let bookingCalendarBlockTimer: ReturnType<typeof setInterval> | null = null;
let bookingCalendarBlockRequestId = 0;

const transactionModeTabs = [
  { label: "เช่า (Rental)", value: "rental", icon: "bx:calendar-check" },
  { label: "ขายขาด", value: "sale", icon: "bx:receipt" },
];

const PRODUCT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='24' fill='%23f1f5f9'/%3E%3Cpath d='M40 112h80L98 84 82 101 68 72z' fill='%23cbd5e1'/%3E%3Ccircle cx='104' cy='54' r='12' fill='%23cbd5e1'/%3E%3C/svg%3E";

const depositProofFileName = computed(
  () => depositProofFile.value?.name ?? "ยังไม่ได้แนบหลักฐานมัดจำ",
);
const refundProofFileName = computed(
  () => refundProofFile.value?.name ?? "ยังไม่ได้แนบหลักฐานคืนมัดจำ",
);

const customer = computed(() => lookup.value?.customer ?? null);
const customerHasIdCardDocument = computed(() =>
  Boolean(customer.value?.idCardUrl),
);
const customerKycVerified = computed(
  () =>
    customer.value?.kind === "account" &&
    customer.value.kycStatus === "verified",
);
const idCardMissing = computed(() => {
  if (!customer.value) return true;
  if (customerKycVerified.value) return false;
  return !customerHasIdCardDocument.value;
});
const customerDocumentBlockReason = computed(() => {
  if (transactionMode.value !== "rental") return null;
  const current = customer.value;
  if (!current) return "กรุณาค้นหาหรือบันทึกข้อมูลลูกค้าก่อน";
  if (current.kind === "account") {
    if (current.kycStatus === "verified") return null;
    if (!current.idCardUrl) return "ต้องบันทึกบัตรประชาชนก่อน";
    if (current.kycStatus === "rejected")
      return "KYC ไม่ผ่าน กรุณาตรวจสอบเอกสาร";
    return "รอผล KYC หรือยังไม่ได้ยืนยันเอกสาร";
  }
  return current.idCardUrl ? null : "ต้องบันทึกบัตรประชาชนก่อน";
});
const requiresIdCardForCheckout = computed(
  () =>
    transactionMode.value === "rental" &&
    Boolean(customerDocumentBlockReason.value),
);
const activeBookings = computed(() => lookup.value?.bookings ?? []);
const pickupCandidates = computed(() =>
  activeBookings.value
    .filter((booking) => booking.status === "confirmed")
    .sort((a, b) => a.startDate.localeCompare(b.startDate)),
);
const activeWorkflowKind = computed<RentalChecklistKind | null>(() => {
  if (selectedBooking.value?.status === "confirmed") return "pickup";
  if (
    selectedBooking.value?.status === "picked_up" ||
    selectedBooking.value?.status === "returned"
  )
    return "return";
  return null;
});
const workflowChecklists = computed(() => {
  const kind = activeWorkflowKind.value;
  if (!kind) return [];
  return (bookingOps.value?.checklists ?? []).filter((c) => c.kind === kind);
});
const workflowTemplates = computed(() => {
  const kind = activeWorkflowKind.value;
  if (!kind) return [];
  return (bookingOps.value?.templates ?? []).filter((t) => t.kind === kind);
});
const primaryWorkflowChecklist = computed<AdminBookingChecklist | null>(
  () =>
    workflowChecklists.value.find((c) => c.status === "completed") ??
    workflowChecklists.value.find((c) => c.status === "in_progress") ??
    workflowChecklists.value.find((c) => c.status === "draft") ??
    workflowChecklists.value.find((c) => c.status !== "cancelled") ??
    workflowChecklists.value[0] ??
    null,
);
const workflowChecklistProgress = computed(() =>
  primaryWorkflowChecklist.value
    ? checklistProgress(primaryWorkflowChecklist.value)
    : { done: 0, total: 0 },
);
const isWorkflowChecklistReady = computed(() => {
  const checklist = primaryWorkflowChecklist.value;
  if (!activeWorkflowKind.value || !checklist) return false;
  return (
    checklist.status === "completed" &&
    requiredChecklistItemsAnswered(checklist)
  );
});
const canConfirmPickup = computed(
  () =>
    selectedBooking.value?.status === "confirmed" &&
    !confirmPickupDisabledReason.value,
);
const canConfirmReturn = computed(
  () =>
    selectedBooking.value?.status === "picked_up" &&
    !confirmReturnDisabledReason.value,
);
const returnRefundProofRequired = computed(
  () =>
    selectedBooking.value?.status === "picked_up" &&
    requiresReturnRefundProof(refundForm.amount, refundForm.status),
);
const confirmPickupDisabledReason = computed(() => {
  const booking = selectedBooking.value;
  if (!booking) return "เลือกรายการจองก่อน";
  if (booking.status !== "confirmed")
    return "Pickup ได้เฉพาะรายการสถานะ confirmed";
  if (customerDocumentBlockReason.value)
    return customerDocumentBlockReason.value;
  const checklist = primaryWorkflowChecklist.value;
  if (bookingOpsLoading.value) return "กำลังโหลด Checklist";
  if (!checklist) return "ต้องสร้าง Pickup Checklist ก่อน";
  if (checklist.status !== "completed")
    return `Checklist ยังเป็น ${checklist.status}`;
  if (!requiredChecklistItemsAnswered(checklist))
    return "ต้องตอบรายการบังคับใน Checklist ให้ครบ";
  if (!pickupSignature.value) return "กรุณาเซ็นชื่อรับสินค้า";
  if (booking.depositPaymentStatus !== "paid")
    return "ต้องชำระมัดจำ/ค่าเช่าให้เป็น paid ก่อน";
  return null;
});
const confirmReturnDisabledReason = computed(() => {
  const booking = selectedBooking.value;
  if (!booking) return "เลือกรายการจองก่อน";
  if (booking.status !== "picked_up")
    return "Return ได้เฉพาะรายการสถานะ picked_up";
  const checklist = primaryWorkflowChecklist.value;
  if (bookingOpsLoading.value) return "กำลังโหลด Checklist";
  if (!checklist) return "ต้องสร้าง Return Checklist ก่อน";
  if (checklist.status !== "completed")
    return `Checklist ยังเป็น ${checklist.status}`;
  if (!requiredChecklistItemsAnswered(checklist))
    return "ต้องตอบรายการบังคับใน Checklist ให้ครบ";
  if (!returnSignature.value) return "กรุณาเซ็นชื่อคืนสินค้า";
  if (refundForm.amount > booking.depositPaidAmount)
    return "Refund Amount ต้องไม่เกินยอดมัดจำที่รับจริง";
  if (returnRefundProofRequired.value && !refundProofUploadedUrl.value) {
    return refundProofFile.value
      ? "กรุณากดอัปโหลด Refund Slip ก่อน Confirm Return"
      : "ต้องแนบและอัปโหลด Refund Slip ก่อน Confirm Return";
  }
  return null;
});
const filteredCatalogProducts = computed(() =>
  catalogProducts.value.filter((p) => p.type === transactionMode.value),
);
const selectedProduct = computed(
  () =>
    filteredCatalogProducts.value.find(
      (p) => p.id === selectedProductId.value,
    ) ?? null,
);
const selectedSku = computed(
  () =>
    selectedProduct.value?.skus.find((s) => s.id === selectedSkuId.value) ??
    null,
);
const defaultDepositAmount = computed(
  () => selectedSku.value?.depositAmount ?? 0,
);
const isRentalDepositAdjusted = computed(
  () =>
    transactionMode.value === "rental" &&
    Boolean(selectedSku.value) &&
    rentalDepositPaidAmount.value !== defaultDepositAmount.value,
);
const customerPhone = computed(
  () => customer.value?.phone || draft.phone || search.value.trim(),
);
const customerNameForCheckout = computed(
  () => customer.value?.fullName || draft.fullName.trim(),
);
const rentalCustomerInfoReady = computed(
  () => Boolean(customerPhone.value) && Boolean(customerNameForCheckout.value),
);
const bookingDays = computed(() =>
  diffDateInputDays(bookingStartDate.value, bookingEndDate.value),
);
const bookingPricing = computed(() => {
  const sku = selectedSku.value;
  if (!sku || bookingDays.value <= 0) return null;
  return decomposeRentalDuration({
    days: bookingDays.value,
    dailyRate: sku.dailyRate,
    dailyEnabled: true,
    weeklyRate: sku.weeklyRate,
    weeklyEnabled: sku.weeklyRate > 0,
    monthlyRate: sku.monthlyRate,
    monthlyEnabled: sku.monthlyRate > 0,
    currencyCode: "THB",
  });
});
const rentalPaymentLines = computed<RentalPaymentLine[]>(() =>
  calculateRentalPaymentLines({
    customerKind: "individual",
    rentalDays: bookingDays.value,
    rentalFeeAmount: bookingPricing.value?.total ?? 0,
    depositAmount: defaultDepositAmount.value,
    source: "cart_preview",
    metadata: {
      previewSurface: "admin_pos",
      actualDepositPaidAmount: rentalDepositPaidAmount.value,
    },
  }),
);
const rentalPaymentSummary = computed<RentalPaymentLineSummary>(() =>
  summarizeRentalPaymentLines(rentalPaymentLines.value),
);
const rentalCheckoutTotal = computed(
  () => rentalPaymentSummary.value.netPayableTotal,
);
const saleCartTotal = computed(() =>
  saleCart.value.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
);
const saleCartQuantityBySku = computed(() => {
  const quantityBySku = new Map<string, number>();
  for (const line of saleCart.value) {
    const quantity = Math.max(0, Number(line.quantity) || 0);
    quantityBySku.set(
      line.skuId,
      (quantityBySku.get(line.skuId) ?? 0) + quantity,
    );
  }
  return quantityBySku;
});
const saleSkuOptions = computed<SaleSkuOption[]>(() =>
  filteredCatalogProducts.value.flatMap((product) =>
    product.skus.map((sku) => {
      const productName = product.nameTh || product.nameEn || product.id;
      const skuName = sku.labelTh || sku.labelEn || sku.id;
      const code = sku.code || sku.id;
      const inCartQuantity = saleCartQuantityBySku.value.get(sku.id) ?? 0;
      return {
        key: `${product.id}:${sku.id}`,
        product,
        sku,
        productName,
        skuName,
        code,
        imageUrl: sku.imageUrl || product.thumbnailUrl,
        stock: Math.max(0, sku.rentalStock - inCartQuantity),
        searchText:
          `${productName} ${product.nameEn} ${skuName} ${sku.labelEn} ${code} ${product.brand ?? ""}`.toLowerCase(),
      };
    }),
  ),
);
const saleSkuSuggestions = computed(() => {
  const term = catalogSearch.value.trim().toLowerCase();
  const options = saleSkuOptions.value;
  if (!term) return options.slice(0, 8);
  return options
    .filter((option) => option.searchText.includes(term))
    .slice(0, 8);
});
const canCreateBooking = computed(
  () =>
    transactionMode.value === "rental" &&
    rentalCustomerInfoReady.value &&
    Boolean(selectedBranchId.value) &&
    Boolean(selectedProduct.value) &&
    Boolean(selectedSku.value) &&
    bookingCalendarValid.value &&
    bookingDays.value > 0 &&
    !creatingBooking.value,
);
const canCreateSale = computed(
  () =>
    transactionMode.value === "sale" &&
    Boolean(selectedBranchId.value) &&
    saleCart.value.length > 0 &&
    saleCartTotal.value > 0 &&
    salePaidAmount.value >= saleCartTotal.value &&
    saleCart.value.every(
      (line) => line.quantity > 0 && line.quantity <= line.maxQuantity,
    ) &&
    !creatingSale.value,
);
const isSuperAdmin = computed(
  () => profile.value?.platformRole === "super_admin",
);
const accountingExportUrl = computed(() => {
  const params = new URLSearchParams();
  if (selectedBranchId.value) params.set("branchId", selectedBranchId.value);
  return `/api/admin/pos/accounting-export${params.size ? `?${params}` : ""}`;
});
const historyPaymentBreakdown = computed(() =>
  Object.entries(posHistory.value?.summary.paymentBreakdown ?? {}).sort(
    (a, b) => a[0].localeCompare(b[0]),
  ),
);
const filteredHistoryItems = computed(() => {
  const items = posHistory.value?.items ?? [];
  if (!showIncompleteOnly.value) return items;
  return items.filter(
    (item) =>
      item.type === "rental" &&
      ["confirmed", "picked_up"].includes(item.status),
  );
});
const incompleteHistoryCount = computed(
  () =>
    (posHistory.value?.items ?? []).filter(
      (item) =>
        item.type === "rental" &&
        ["confirmed", "picked_up"].includes(item.status),
    ).length,
);
const selectedBranch = computed(
  () =>
    branches.value.find((branch) => branch.id === selectedBranchId.value) ??
    null,
);
const modeAccentClass = computed(() =>
  transactionMode.value === "rental"
    ? "border-primary/60 ring-primary/30"
    : "border-secondary/60 ring-secondary/30",
);
const modeSoftClass = computed(() =>
  transactionMode.value === "rental" ? "bg-primary/5" : "bg-secondary/5",
);
const catalogSuggestionItems = computed(() =>
  saleSkuSuggestions.value.map((option) => ({
    key: option.key,
    productName: option.productName,
    skuName: option.skuName,
    code: option.code,
    imageUrl: option.imageUrl,
    stock: option.stock,
    price: option.sku.price,
  })),
);

function todayBangkokDateInput() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function diffDateInputDays(start: string, end: string) {
  return calculateInclusiveRentalDays(start, end);
}

function persistDraft() {
  if (!import.meta.client) return;
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
  );
}

function restoreDraft() {
  if (!import.meta.client) return;
  isOnline.value = navigator.onLine;
  selectedBranchId.value = localStorage.getItem(BRANCH_KEY) ?? "";
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  try {
    Object.assign(draft, JSON.parse(raw));
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
  hasPendingIdDraft.value = Boolean(localStorage.getItem(PENDING_ID_KEY));
  hasPendingBookingDraft.value = Boolean(
    localStorage.getItem(PENDING_BOOKING_KEY),
  );
}

function syncOnlineStatus() {
  if (!import.meta.client) return;
  isOnline.value = navigator.onLine;
}

function refreshBookingCalendarBlocksSilently() {
  if (transactionMode.value !== "rental" || !selectedSkuId.value) return;
  void loadBookingCalendarBlocks(selectedSkuId.value, { silent: true });
}

function refreshBookingCalendarBlocksWhenVisible() {
  if (!import.meta.client || document.visibilityState === "visible") {
    refreshBookingCalendarBlocksSilently();
  }
}

function startBookingCalendarBlockRefresh() {
  if (!import.meta.client || bookingCalendarBlockTimer) return;
  bookingCalendarBlockTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      refreshBookingCalendarBlocksSilently();
    }
  }, BOOKING_CALENDAR_BLOCK_REFRESH_MS);
}

function stopBookingCalendarBlockRefresh() {
  if (!bookingCalendarBlockTimer) return;
  clearInterval(bookingCalendarBlockTimer);
  bookingCalendarBlockTimer = null;
}

watch(draft, persistDraft, { deep: true });
onMounted(() => {
  restoreDraft();
  void ensureProfileLoaded(null, { force: true });
  void loadBranches();
  void loadCatalog();
  void loadPosHistory();
  window.addEventListener("online", syncOnlineStatus);
  window.addEventListener("offline", syncOnlineStatus);
  window.addEventListener("focus", refreshBookingCalendarBlocksSilently);
  document.addEventListener(
    "visibilitychange",
    refreshBookingCalendarBlocksWhenVisible,
  );
  startBookingCalendarBlockRefresh();
});

onUnmounted(() => {
  if (!import.meta.client) return;
  window.removeEventListener("online", syncOnlineStatus);
  window.removeEventListener("offline", syncOnlineStatus);
  window.removeEventListener("focus", refreshBookingCalendarBlocksSilently);
  document.removeEventListener(
    "visibilitychange",
    refreshBookingCalendarBlocksWhenVisible,
  );
  stopBookingCalendarBlockRefresh();
});

watch(selectedProductId, () => {
  selectedSkuId.value = selectedProduct.value?.skus[0]?.id ?? "";
});

watch(transactionMode, () => {
  selectedProductId.value = "";
  selectedSkuId.value = "";
  bookingStartDate.value = "";
  bookingEndDate.value = "";
  bookingCalendarValid.value = false;
  bookingCalendarBlocks.value = [];
  void loadCatalog();
});

watch(selectedBranchId, (branchId) => {
  if (import.meta.client) localStorage.setItem(BRANCH_KEY, branchId);
  if (transactionMode.value === "sale") void loadCatalog();
  void loadPosHistory();
});

watch(historyDate, () => {
  void loadPosHistory();
});

watch(selectedSku, (sku) => {
  if (sku && transactionMode.value === "rental") {
    rentalDepositPaidAmount.value = sku.depositAmount;
  }
});

watch(selectedSkuId, () => {
  if (transactionMode.value !== "rental") return;
  bookingStartDate.value = "";
  bookingEndDate.value = "";
  bookingCalendarValid.value = false;
  void loadBookingCalendarBlocks();
});

watch(
  () => selectedBooking.value?.id,
  (bookingId) => {
    bookingOps.value = null;
    pickupSignature.value = null;
    returnSignature.value = null;
    fulfillmentNotes.value = "";
    fulfillmentErrorMessage.value = null;
    clearRefundProof();
    syncRefundFormFromBooking(selectedBooking.value);
    if (bookingId) void loadBookingOps(bookingId);
  },
);

function handlePosBookingCalendarChange(
  payload: RentalBookingCalendarPayload,
): void {
  bookingStartDate.value = payload.startDate;
  bookingEndDate.value = payload.returnDate;
  bookingCalendarValid.value = payload.isValid;
}

function formatCurrency(value: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency }).format(
    value,
  );
}

function productImageSrc(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && !normalized.endsWith("/favicon.svg")
    ? normalized
    : PRODUCT_IMAGE_PLACEHOLDER;
}

function formatTime(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function scrollToPosSection(
  elementId: string,
  block: ScrollLogicalPosition = "start",
) {
  if (!import.meta.client) return false;
  const element = document.getElementById(elementId);
  if (!element) return false;
  element.scrollIntoView({ behavior: "smooth", block });
  return true;
}

function formatPaymentMethod(value: string) {
  const labels: Record<string, string> = {
    cash: "เงินสด",
    qr_transfer: "QR",
    bank_transfer: "โอนบัญชี",
    card: "บัตร",
    credit_card: "บัตรเครดิต",
    promptpay: "PromptPay",
    company_credit: "เครดิตบริษัท",
    other: "อื่น ๆ",
    unknown: "ไม่ระบุ",
  };
  return labels[value] ?? value;
}

function historyActionKey(item: PosHistoryItem) {
  return `${item.type}:${item.id}`;
}

function isHistoryItemCancelled(item: PosHistoryItem) {
  return item.status === "cancelled" || item.paymentStatus === "cancelled";
}

function showPrintPlaceholder(
  kind: "full" | "abbreviated",
  item: PosHistoryItem,
) {
  toast.add({
    title:
      kind === "full" ? "พิมพ์ใบกำกับภาษี (Full)" : "พิมพ์ใบกำกับภาษีอย่างย่อ",
    description: `Feature coming soon · ${item.documentNo}`,
    color: "info",
  });
}

async function cancelHistoryItem(item: PosHistoryItem) {
  if (!isSuperAdmin.value || isHistoryItemCancelled(item)) return;
  if (!confirm(`ยืนยันยกเลิกรายการ ${item.documentNo}?`)) return;
  const key = historyActionKey(item);
  cancellingHistoryKey.value = key;
  try {
    const result = await $fetch<{
      ok: boolean;
      inventoryReversalRequired?: boolean;
      inventoryRestocked?: boolean;
      restockedQuantity?: number;
      refundRequired?: boolean;
    }>("/api/admin/pos/history/cancel", {
      method: "POST",
      body: { type: item.type, id: item.id },
    });
    toast.add({
      title: "ยกเลิกรายการแล้ว",
      description: result.inventoryRestocked
        ? `คืน Stock อัตโนมัติแล้ว ${result.restockedQuantity ?? 0} ชิ้น กรุณาตรวจสอบการคืนเงินหากมี`
        : result.inventoryReversalRequired
          ? "รายการขายนี้เคยตัด stock แล้ว กรุณาตรวจสอบ/ปรับ stock คืนตามกระบวนการ"
          : result.refundRequired
            ? "รายการนี้มีเงินรับแล้ว กรุณาตรวจสอบการคืนเงิน/มัดจำ"
            : item.documentNo,
      color: "success",
    });
    await Promise.all([loadCatalog(), loadPosHistory()]);
  } catch (e) {
    toast.add({
      title: "ยกเลิกรายการไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    cancellingHistoryKey.value = null;
  }
}

function bookingTitle(booking: AdminRentalBookingRow) {
  return booking.assetName || booking.productName || booking.id;
}

function printFormUrl(bookingId: string, type: "pickup" | "return") {
  return `/admin/rental-bookings/${bookingId}/print?type=${type}`;
}

function preferredSelectedBooking(bookings: AdminRentalBookingRow[]) {
  return (
    bookings.find((booking) => booking.status === "confirmed") ??
    bookings.find((booking) => booking.status === "picked_up") ??
    bookings[0] ??
    null
  );
}

function checklistKindLabel(kind: RentalChecklistKind | null) {
  if (kind === "pickup") return "Pickup";
  if (kind === "return") return "Return";
  return "Checklist";
}

function checklistStatusColor(status: RentalChecklistStatus) {
  const colors: Record<RentalChecklistStatus, string> = {
    draft: "neutral",
    in_progress: "warning",
    completed: "success",
    cancelled: "error",
  };
  return colors[status];
}

function checklistProgress(checklist: AdminBookingChecklist) {
  const total = checklist.items.length;
  const done = checklist.items.filter(
    (item) => item.checked === true || item.resultStatus !== "pending",
  ).length;
  return { done, total };
}

function requiredChecklistItemsAnswered(checklist: AdminBookingChecklist) {
  return checklist.items
    .filter((item) => item.isRequired)
    .every((item) => item.checked === true || item.resultStatus !== "pending");
}

async function createWorkflowChecklist(kind = activeWorkflowKind.value) {
  const booking = selectedBooking.value;
  if (!booking || !kind) return;
  checklistBusy.value = true;
  try {
    const template = workflowTemplates.value[0] ?? null;
    const body = template
      ? { templateId: template.id }
      : { kind, name: `POS ${checklistKindLabel(kind)} Checklist` };
    bookingOps.value = await $fetch<AdminBookingOpsPayload>(
      `/api/admin/rental-bookings/${booking.id}/checklists`,
      { method: "POST", body },
    );
    const created = workflowChecklists.value.find(
      (checklist) => checklist.status === "draft",
    );
    if (created) await setWorkflowChecklistStatus(created, "in_progress");
    toast.add({ title: "สร้าง Checklist แล้ว", color: "success" });
  } catch (e) {
    toast.add({
      title: "สร้าง Checklist ไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    checklistBusy.value = false;
  }
}

async function setWorkflowChecklistStatus(
  checklist: AdminBookingChecklist,
  status: RentalChecklistStatus,
) {
  if (!selectedBooking.value) return;
  checklistBusy.value = true;
  try {
    bookingOps.value = await $fetch<AdminBookingOpsPayload>(
      `/api/admin/rental-bookings/${selectedBooking.value.id}/checklists/${checklist.id}`,
      { method: "PATCH", body: { status } },
    );
  } catch (e) {
    toast.add({
      title: "อัปเดต Checklist ไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    checklistBusy.value = false;
  }
}

async function completeWorkflowChecklist(checklist: AdminBookingChecklist) {
  if (!requiredChecklistItemsAnswered(checklist)) {
    toast.add({
      title: "กรุณาตรวจรายการที่บังคับให้ครบก่อน",
      color: "warning",
    });
    return;
  }
  await setWorkflowChecklistStatus(checklist, "completed");
}

async function patchWorkflowChecklistItem(
  checklist: AdminBookingChecklist,
  item: AdminBookingChecklistItem,
  body: UpdateChecklistItemPayload,
) {
  if (!selectedBooking.value) return;
  checklistBusy.value = true;
  try {
    if (checklist.status === "draft") {
      await setWorkflowChecklistStatus(checklist, "in_progress");
    }
    bookingOps.value = await $fetch<AdminBookingOpsPayload>(
      `/api/admin/rental-bookings/${selectedBooking.value.id}/checklists/${checklist.id}/items/${item.id}`,
      { method: "PATCH", body },
    );
  } catch (e) {
    toast.add({
      title: "บันทึกผล Checklist ไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    checklistBusy.value = false;
  }
}

function openScanner(purpose: ScannerPurpose) {
  scannerPurpose.value = purpose;
  isScannerOpen.value = true;
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
  } catch (e) {
    toast.add({
      title: "โหลดสาขา POS ไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    branchLoading.value = false;
  }
}

async function loadCatalog() {
  catalogLoading.value = true;
  try {
    const query: Record<string, string> = { mode: transactionMode.value };
    if (catalogSearch.value.trim()) query.search = catalogSearch.value.trim();
    if (selectedBranchId.value) query.branchId = selectedBranchId.value;
    const response = await $fetch<PosCatalogResponse>(
      "/api/admin/pos/catalog",
      { query },
    );
    catalogProducts.value = response.items;
    const visibleItems = response.items.filter(
      (p) => p.type === transactionMode.value,
    );
    if (!visibleItems.some((item) => item.id === selectedProductId.value)) {
      selectedProductId.value = visibleItems[0]?.id ?? "";
      selectedSkuId.value = visibleItems[0]?.skus[0]?.id ?? "";
    }
    if (transactionMode.value === "rental" && selectedSkuId.value) {
      void loadBookingCalendarBlocks(selectedSkuId.value, { silent: true });
    }
  } catch (e) {
    toast.add({
      title: "โหลดสินค้า POS ไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    catalogLoading.value = false;
  }
}

function scheduleCatalogSearch() {
  catalogSuggestOpen.value = transactionMode.value === "sale";
  if (catalogSearchTimer) clearTimeout(catalogSearchTimer);
  catalogSearchTimer = setTimeout(() => {
    catalogSearchTimer = null;
    void loadCatalog();
  }, 250);
}

function showCatalogSuggestions() {
  if (transactionMode.value !== "sale") return;
  catalogSuggestOpen.value = true;
  if (catalogProducts.value.length === 0) void loadCatalog();
}

function hideCatalogSuggestionsSoon() {
  setTimeout(() => {
    catalogSuggestOpen.value = false;
  }, 150);
}

async function loadPosHistory() {
  historyLoading.value = true;
  try {
    const query: Record<string, string> = { date: historyDate.value };
    if (selectedBranchId.value) query.branchId = selectedBranchId.value;
    posHistory.value = await $fetch<PosHistoryResponse>(
      "/api/admin/pos/history",
      {
        query,
      },
    );
  } catch (e) {
    toast.add({
      title: "โหลดประวัติ POS ไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    historyLoading.value = false;
  }
}

async function loadBookingCalendarBlocks(
  assetId = selectedSkuId.value,
  options: { silent?: boolean } = {},
) {
  if (transactionMode.value !== "rental" || !assetId) {
    bookingCalendarBlocks.value = [];
    return;
  }
  const requestId = ++bookingCalendarBlockRequestId;
  if (!options.silent) bookingCalendarBlocksLoading.value = true;
  try {
    const response = await $fetch<PosBookingBlocksResponse>(
      "/api/admin/pos/booking-blocks",
      { query: { assetId, t: Date.now() } },
    );
    if (
      requestId === bookingCalendarBlockRequestId &&
      assetId === selectedSkuId.value
    ) {
      bookingCalendarBlocks.value = response.items;
    }
  } catch (e) {
    if (!options.silent) {
      bookingCalendarBlocks.value = [];
      toast.add({
        title: "โหลดวันจองที่ถูกบล็อกไม่สำเร็จ",
        description: e instanceof Error ? e.message : "Unknown error",
        color: "warning",
      });
    }
  } finally {
    if (requestId === bookingCalendarBlockRequestId) {
      bookingCalendarBlocksLoading.value = false;
    }
  }
}

function syncRefundFormFromBooking(booking: AdminRentalBookingRow | null) {
  const paidAmount = Math.max(0, Number(booking?.depositPaidAmount ?? 0));
  const existingAmount = Math.max(
    0,
    Number(booking?.depositRefundAmount ?? paidAmount),
  );
  refundForm.amount = existingAmount || paidAmount;
  refundForm.status =
    paidAmount > 0
      ? booking?.depositRefundStatus === "refunded" ||
        booking?.depositRefundStatus === "forfeited" ||
        booking?.depositRefundStatus === "pending"
        ? booking.depositRefundStatus
        : "pending"
      : "not_applicable";
  refundForm.notes = booking?.depositRefundNotes ?? "";
}

async function loadBookingOps(bookingId = selectedBooking.value?.id) {
  if (!bookingId) return;
  bookingOpsLoading.value = true;
  try {
    bookingOps.value = await $fetch<AdminBookingOpsPayload>(
      `/api/admin/rental-bookings/${bookingId}/ops`,
    );
  } catch (e) {
    toast.add({
      title: "โหลด Checklist ไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    bookingOpsLoading.value = false;
  }
}

function mergeBookingDetail(detail: AdminRentalBookingDetail) {
  const existing = selectedBooking.value;
  const detailCustomer = detail.customer
    ? {
        ...detail.customer,
        kind: detail.userId ? ("account" as const) : ("walk_in" as const),
        phone:
          detail.customer.phone || detail.bookerPhone || detail.walkInPhone,
      }
    : null;
  const merged: AdminRentalBookingRow = {
    ...(existing ?? ({} as AdminRentalBookingRow)),
    id: detail.id,
    userId: detail.userId,
    walkInPhone: detail.walkInPhone,
    status: detail.status,
    assetName: detail.assetName,
    productName: detail.productName,
    thumbnail: detail.assetThumbnail || existing?.thumbnail || null,
    startDate: detail.startDate,
    endDate: detail.endDate,
    rentalDays: detail.rentalDays,
    rentalTotal: detail.rentalTotal,
    depositAmount: detail.depositAmount,
    depositPaidAmount: detail.depositPaidAmount,
    depositPaymentMethod: detail.depositPaymentMethod,
    depositPaymentStatus: detail.depositPaymentStatus,
    depositRefundStatus: detail.depositRefundStatus,
    depositRefundAmount: detail.depositRefundAmount,
    depositRefundNotes: detail.depositRefundNotes,
    currencyCode: detail.currencyCode,
    storageBranchId: detail.storageBranchId,
    storageBranchName: detail.storageBranchName,
    hubName: detail.hubName,
    bookerName: detail.bookerName,
    bookerPhone: detail.bookerPhone,
    createdAt: existing?.createdAt ?? detail.createdAt,
  };

  const existingBookings = lookup.value?.bookings ?? [];
  const bookings = existingBookings.some((booking) => booking.id === merged.id)
    ? existingBookings.map((booking) =>
        booking.id === merged.id ? merged : booking,
      )
    : [merged, ...existingBookings];
  lookup.value = {
    customer: detailCustomer ?? lookup.value?.customer ?? null,
    bookings,
  };
  selectedBooking.value = merged;
  syncRefundFormFromBooking(merged);
}

async function lookupCustomer(term = search.value) {
  if (!term.trim()) return;
  loading.value = true;
  try {
    lookup.value = await $fetch<LookupResponse>("/api/admin/customers/lookup", {
      query: { search: term.trim() },
    });
    selectedBooking.value = preferredSelectedBooking(lookup.value.bookings);
    if (
      transactionMode.value === "rental" &&
      lookup.value.customer &&
      idCardMissing.value
    )
      idModalOpen.value = true;
  } catch (e) {
    toast.add({
      title: "ค้นหาลูกค้าไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    loading.value = false;
  }
}

function handleDecoded(payload: {
  kind:
    | "order"
    | "booking"
    | "customer"
    | "asset"
    | "sku"
    | "product"
    | "barcode"
    | "unknown";
  value: string;
  raw: string;
}) {
  if (payload.kind === "booking") {
    navigateTo(`/admin/rental-bookings/${payload.value}`);
    return;
  }
  if (
    scannerPurpose.value === "catalog" ||
    ["asset", "sku", "product", "barcode"].includes(payload.kind)
  ) {
    void handleCatalogScan(payload.value || payload.raw);
    return;
  }
  search.value = payload.value || payload.raw;
  void lookupCustomer(search.value);
}

async function handleCatalogScan(code: string) {
  const term = code.trim();
  if (!term) return;
  catalogSearch.value = term;
  await loadCatalog();
  const product = filteredCatalogProducts.value[0];
  const sku = product?.skus[0];
  if (!product || !sku) {
    toast.add({
      title: "ไม่พบสินค้า/Asset จากโค้ดที่สแกน",
      description: term,
      color: "warning",
    });
    return;
  }
  selectedProductId.value = product.id;
  selectedSkuId.value = sku.id;
  if (product.type === "sale") addSaleSkuToCart(product, sku);
  toast.add({ title: `เลือก ${sku.labelTh} แล้ว`, color: "success" });
}

function onIdFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  idFile.value = file;
  idPreview.value = file ? URL.createObjectURL(file) : null;
}

function onDepositProofChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  depositProofFile.value = file;
  depositProofPreview.value = file?.type.startsWith("image/")
    ? URL.createObjectURL(file)
    : null;
  (event.target as HTMLInputElement).value = "";
}

function clearDepositProof() {
  depositProofFile.value = null;
  depositProofPreview.value = null;
}

function onRefundProofChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  refundProofFile.value = file;
  refundProofUploadedUrl.value = null;
  refundProofPreview.value = file?.type.startsWith("image/")
    ? URL.createObjectURL(file)
    : null;
  (event.target as HTMLInputElement).value = "";
}

function clearRefundProof() {
  refundProofFile.value = null;
  refundProofPreview.value = null;
  refundProofUploadedUrl.value = null;
}

function addSaleSkuToCart(
  product = selectedProduct.value,
  sku = selectedSku.value,
) {
  if (!product || !sku || product.type !== "sale") return;
  const maxQuantity = Math.max(0, sku.rentalStock);
  if (maxQuantity <= 0) {
    toast.add({ title: "SKU นี้ไม่มี stock พร้อมขาย", color: "warning" });
    return;
  }
  const existing = saleCart.value.find((line) => line.skuId === sku.id);
  if (existing) {
    if (existing.quantity >= existing.maxQuantity) {
      toast.add({
        title: "จำนวนในตะกร้าถึง stock ที่พร้อมขายแล้ว",
        color: "warning",
      });
      return;
    }
    existing.quantity += 1;
  } else {
    saleCart.value.push({
      skuId: sku.id,
      productId: product.id,
      code: sku.code || sku.id,
      name: sku.labelTh || product.nameTh,
      imageUrl: sku.imageUrl || product.thumbnailUrl,
      unitPrice: sku.price,
      quantity: 1,
      maxQuantity,
    });
  }
  salePaidAmount.value = saleCartTotal.value;
}

function selectSaleSkuOption(option: SaleSkuOption) {
  selectedProductId.value = option.product.id;
  selectedSkuId.value = option.sku.id;
  addSaleSkuToCart(option.product, option.sku);
  catalogSearch.value = "";
  catalogSuggestOpen.value = false;
}

function selectSaleSkuSuggestionByKey(key: string) {
  const option = saleSkuSuggestions.value.find((item) => item.key === key);
  if (option) selectSaleSkuOption(option);
}

function applyCommittedSaleToCatalog(
  lines: Array<{ skuId: string; quantity: number }>,
) {
  const soldBySku = new Map<string, number>();
  for (const line of lines) {
    const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
    if (line.skuId && quantity > 0) {
      soldBySku.set(line.skuId, (soldBySku.get(line.skuId) ?? 0) + quantity);
    }
  }
  if (soldBySku.size === 0) return;

  catalogProducts.value = catalogProducts.value.map((product) => ({
    ...product,
    skus: product.skus.map((sku) => {
      const soldQuantity = soldBySku.get(sku.id) ?? 0;
      if (soldQuantity <= 0) return sku;
      return {
        ...sku,
        rentalStock: Math.max(0, sku.rentalStock - soldQuantity),
      };
    }),
  }));
}

function saleLineRemaining(line: PosSaleLine) {
  return Math.max(0, line.maxQuantity - line.quantity);
}

function normalizeSaleLineQuantity(line: PosSaleLine) {
  const next = Math.floor(Number(line.quantity) || 1);
  line.quantity = Math.min(Math.max(1, next), Math.max(1, line.maxQuantity));
}

function removeSaleLine(skuId: string) {
  saleCart.value = saleCart.value.filter((line) => line.skuId !== skuId);
  salePaidAmount.value = saleCartTotal.value;
}

watch(
  saleCart,
  () => {
    if (transactionMode.value === "sale")
      salePaidAmount.value = saleCartTotal.value;
  },
  { deep: true },
);

watch(
  () => refundForm.amount,
  () => {
    refundProofUploadedUrl.value = null;
  },
);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function savePendingIdDraft(file: File) {
  if (!import.meta.client) return;
  localStorage.setItem(
    PENDING_ID_KEY,
    JSON.stringify({ draft, imageDataUrl: await fileToDataUrl(file) }),
  );
  hasPendingIdDraft.value = true;
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, base64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new File([bytes], filename, { type: mime });
}

async function retryPendingIdDraft() {
  if (!import.meta.client) return;
  const raw = localStorage.getItem(PENDING_ID_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as {
      draft?: typeof draft;
      imageDataUrl?: string;
    };
    if (parsed.draft) Object.assign(draft, parsed.draft);
    if (parsed.imageDataUrl) {
      idFile.value = dataUrlToFile(parsed.imageDataUrl, "customer-id.png");
      idPreview.value = parsed.imageDataUrl;
      await submitIdCard();
    }
  } catch {
    localStorage.removeItem(PENDING_ID_KEY);
    hasPendingIdDraft.value = false;
  }
}

async function submitIdCard() {
  const file = idFile.value;
  const phone = customer.value?.phone || draft.phone || search.value;
  if (!file || !phone) return;
  uploadingId.value = true;
  progress.value = true;
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("phone", phone);
    fd.append("fullName", customer.value?.fullName || draft.fullName);
    if (customer.value?.userId) fd.append("userId", customer.value.userId);
    if (draft.notes) fd.append("notes", draft.notes);
    await $fetch("/api/admin/customers/id-card", { method: "POST", body: fd });
    localStorage.removeItem(PENDING_ID_KEY);
    hasPendingIdDraft.value = false;
    toast.add({ title: "บันทึกบัตรประชาชนแล้ว", color: "success" });
    idModalOpen.value = false;
    await lookupCustomer(phone);
  } catch {
    await savePendingIdDraft(file);
    toast.add({
      title: "บันทึกไม่สำเร็จ",
      description: "เก็บข้อมูลไว้ในเครื่องแล้ว สามารถกด Retry เมื่อเน็ตกลับมา",
      color: "warning",
    });
  } finally {
    uploadingId.value = false;
    progress.value = false;
  }
}

async function viewCustomerIdCard() {
  const current = customer.value;
  if (!current) return;

  const query: Record<string, string> = {};
  if (current.kind === "account" && current.userId)
    query.userId = current.userId;
  if (current.phone) query.phone = current.phone;
  if (!query.userId && !query.phone) {
    toast.add({ title: "ไม่พบข้อมูลลูกค้าสำหรับเปิดบัตร", color: "warning" });
    return;
  }

  viewingIdCard.value = true;
  try {
    const response = await $fetch<{ signedUrl: string }>(
      "/api/admin/customers/id-card/signed-url",
      { query },
    );
    if (import.meta.client)
      window.open(response.signedUrl, "_blank", "noopener");
  } catch (e) {
    toast.add({
      title: "เปิดบัตรประชาชนไม่สำเร็จ",
      description: e instanceof Error ? e.message : "กรุณาอัปโหลดบัตรใหม่",
      color: "error",
    });
  } finally {
    viewingIdCard.value = false;
  }
}

async function applyFulfillment(eventType: "pickup" | "return") {
  const booking = selectedBooking.value;
  if (!booking) return;
  const disabledReason =
    eventType === "pickup"
      ? confirmPickupDisabledReason.value
      : confirmReturnDisabledReason.value;
  fulfillmentErrorMessage.value = null;
  if (disabledReason) {
    fulfillmentErrorMessage.value = disabledReason;
    toast.add({ title: disabledReason, color: "warning" });
    return;
  }

  progress.value = true;
  fulfillmentSubmittingType.value = eventType;
  try {
    const detail = await $fetch<AdminRentalBookingDetail>(
      `/api/admin/rental-bookings/${booking.id}/${eventType}`,
      {
        method: "POST",
        body: buildPosRentalFulfillmentPayload({
          bookingId: booking.id,
          eventType,
          signatureDataUrl:
            eventType === "pickup"
              ? String(pickupSignature.value)
              : String(returnSignature.value),
          notes: fulfillmentNotes.value,
          branchId: selectedBranchId.value || booking.storageBranchId || null,
          refundAmount: refundForm.amount,
          refundStatus: refundForm.status,
          refundNotes: refundForm.notes,
          refundProofUrl: refundProofUploadedUrl.value,
        }),
      },
    );
    mergeBookingDetail(detail);
    toast.add({
      title: eventType === "pickup" ? "Pickup complete" : "Return complete",
      color: "success",
    });
    fulfillmentErrorMessage.value = null;
    if (eventType === "pickup") {
      pickupSignature.value = null;
      returnSignature.value = null;
    } else {
      returnSignature.value = null;
    }
    if (eventType === "return") clearRefundProof();
    await Promise.all([loadPosHistory(), loadBookingOps(detail.id)]);
  } catch (error) {
    const normalized = normalizePosRentalFulfillmentError(error, eventType);
    if (normalized.statusCode) {
      fulfillmentErrorMessage.value = normalized.message;
      toast.add({
        title: eventType === "pickup" ? "Pickup ไม่สำเร็จ" : "Return ไม่สำเร็จ",
        description: normalized.message,
        color: "error",
      });
      return;
    }

    localStorage.setItem(
      `hop-admin-fulfillment-retry:${booking.id}`,
      JSON.stringify({
        eventType,
        notes: fulfillmentNotes.value,
        branchId: selectedBranchId.value || booking.storageBranchId || null,
        signature:
          eventType === "pickup"
            ? pickupSignature.value
            : returnSignature.value,
        refundAmount: refundForm.amount,
        refundStatus: refundForm.status,
        refundNotes: refundForm.notes,
        refundProofUrl: refundProofUploadedUrl.value,
        createdAt: new Date().toISOString(),
      }),
    );
    fulfillmentErrorMessage.value =
      "ยังติดต่อเซิร์ฟเวอร์ไม่ได้ ระบบบันทึกข้อมูลสำหรับ Retry ไว้ในเครื่องแล้ว";
    toast.add({
      title: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ",
      description: "บันทึกงานไว้ในเครื่องแล้ว กรุณา Retry เมื่อระบบกลับมาปกติ",
      color: "warning",
    });
  } finally {
    progress.value = false;
    fulfillmentSubmittingType.value = null;
  }
}

async function uploadDepositProof(bookingId: string) {
  const file = depositProofFile.value;
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("amount", String(rentalDepositPaidAmount.value));
  fd.append("paymentMethod", depositPaymentMethod.value);
  if (depositNotes.value) fd.append("notes", depositNotes.value);
  await $fetch(`/api/admin/rental-bookings/${bookingId}/deposit-proof`, {
    method: "POST",
    body: fd,
  });
}

async function uploadRefundProof(bookingId = selectedBooking.value?.id) {
  const file = refundProofFile.value;
  if (!bookingId || !file) return;
  refundProofUploading.value = true;
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("amount", String(refundForm.amount));
    fd.append("paymentMethod", "bank_transfer");
    fd.append("proofKind", "refund");
    if (refundForm.notes) fd.append("notes", refundForm.notes);
    const response = await $fetch<{ fileUrl: string }>(
      `/api/admin/rental-bookings/${bookingId}/deposit-proof`,
      { method: "POST", body: fd },
    );
    refundProofUploadedUrl.value = response.fileUrl;
    toast.add({ title: "อัปโหลด Refund Slip แล้ว", color: "success" });
  } catch (e) {
    toast.add({
      title: "อัปโหลด Refund Slip ไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    refundProofUploading.value = false;
  }
}

function requestCreatePosBooking() {
  if (isRentalDepositAdjusted.value) {
    pendingDepositAction.value = "create-booking";
    depositAdjustmentReason.value = depositNotes.value;
    depositConfirmOpen.value = true;
    return;
  }
  void createPosBooking();
}

function openDepositEdit(item: PosHistoryItem) {
  if (item.type !== "rental") return;
  depositEdit.bookingId = item.id;
  depositEdit.documentNo = item.documentNo;
  depositEdit.currentAmount = item.depositPaidAmount ?? 0;
  depositEdit.newAmount = item.depositPaidAmount ?? 0;
  depositEdit.currentMethod = item.depositPaymentMethod || item.paymentMethod;
  depositEdit.newMethod = (item.depositPaymentMethod ||
    item.paymentMethod ||
    "cash") as RentalDepositPaymentMethod;
  depositEdit.currentStatus = item.paymentStatus || "unpaid";
  depositEdit.notes = "";
  depositAdjustmentReason.value = "";
  depositEditOpen.value = true;
}

async function openFulfillmentFromHistory(item: PosHistoryItem) {
  if (
    item.type !== "rental" ||
    !["confirmed", "picked_up"].includes(item.status) ||
    isHistoryItemCancelled(item)
  )
    return;
  const key = historyActionKey(item);
  openingFulfillmentHistoryKey.value = key;
  progress.value = true;
  try {
    const detail = await $fetch<AdminRentalBookingDetail>(
      `/api/admin/rental-bookings/${item.id}`,
    );
    mergeBookingDetail(detail);
    await loadBookingOps(detail.id);
    await nextTick();
    scrollToPosSection("pos-fulfillment-section");
  } catch (e) {
    toast.add({
      title: "เปิด workflow รับ/คืนสินค้าไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    openingFulfillmentHistoryKey.value = null;
    progress.value = false;
  }
}

async function handlePostCreateNavigation(bookingId: string) {
  await nextTick();
  const didScroll = scrollToPosSection("payment-section", "center");
  if (didScroll) return;
  const createdHistoryItem = (posHistory.value?.items ?? []).find(
    (item) => item.type === "rental" && item.id === bookingId,
  );
  if (createdHistoryItem) openDepositEdit(createdHistoryItem);
}

function requestDepositEditSave() {
  pendingDepositAction.value = "update-booking";
  depositConfirmOpen.value = true;
}

async function confirmDepositAction() {
  const action = pendingDepositAction.value;
  depositConfirmOpen.value = false;
  pendingDepositAction.value = null;
  if (action === "create-booking") {
    await createPosBooking();
    return;
  }
  if (action === "update-booking") {
    await saveDepositAdjustment();
  }
}

async function saveDepositAdjustment() {
  if (!depositEdit.bookingId) return;
  depositEditSaving.value = true;
  progress.value = true;
  try {
    await $fetch(
      `/api/admin/rental-bookings/${depositEdit.bookingId}/deposit`,
      {
        method: "PATCH",
        body: {
          depositPaidAmount: depositEdit.newAmount,
          depositPaymentMethod: depositEdit.newMethod,
          depositPaymentStatus: depositEdit.newAmount > 0 ? "paid" : "unpaid",
          depositNotes: depositEdit.notes,
          reason: depositAdjustmentReason.value,
        },
      },
    );
    toast.add({
      title: "อัปเดตมัดจำและบันทึก Audit Log แล้ว",
      color: "success",
    });
    depositEditOpen.value = false;
    await loadPosHistory();
  } catch (e) {
    toast.add({
      title: "อัปเดตมัดจำไม่สำเร็จ",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    depositEditSaving.value = false;
    progress.value = false;
  }
}

async function createPosBooking() {
  if (!canCreateBooking.value || !selectedProduct.value || !selectedSku.value)
    return;
  const phone = customerPhone.value;
  const payload = {
    userId: customer.value?.kind === "account" ? customer.value.userId : null,
    walkInPhone: phone,
    bookerName: customerNameForCheckout.value,
    bookerPhone: phone,
    productId: selectedProduct.value.id,
    skuId: selectedSku.value.id,
    branchId: selectedBranchId.value,
    startDate: bookingStartDate.value,
    endDate: bookingEndDate.value,
    checkoutTotalAmount: rentalCheckoutTotal.value,
    checkoutPaidAmount: rentalCheckoutTotal.value,
    checkoutPaymentMethod: depositPaymentMethod.value,
    depositPaidAmount: rentalDepositPaidAmount.value,
    depositPaymentMethod: depositPaymentMethod.value,
    depositPaymentStatus: rentalDepositPaidAmount.value > 0 ? "paid" : "unpaid",
    depositNotes: depositNotes.value,
    depositAdjustmentReason: isRentalDepositAdjusted.value
      ? depositAdjustmentReason.value || depositNotes.value
      : null,
  };

  creatingBooking.value = true;
  progress.value = true;
  try {
    const response = await $fetch<{ booking: AdminRentalBookingRow }>(
      "/api/admin/pos/bookings",
      { method: "POST", body: payload },
    );
    if (depositProofFile.value) await uploadDepositProof(response.booking.id);
    lookup.value = lookup.value ?? { customer: null, bookings: [] };
    lookup.value.bookings = [response.booking, ...lookup.value.bookings];
    selectedBooking.value = response.booking;
    if (phone) await lookupCustomer(phone);
    selectedBooking.value =
      lookup.value?.bookings.find(
        (booking) => booking.id === response.booking.id,
      ) ?? response.booking;
    await Promise.all([loadPosHistory(), loadBookingCalendarBlocks()]);
    await handlePostCreateNavigation(response.booking.id);
    localStorage.removeItem(PENDING_BOOKING_KEY);
    hasPendingBookingDraft.value = false;
    toast.add({ title: "สร้างรายการเช่าจาก POS แล้ว", color: "success" });
  } catch {
    localStorage.setItem(
      PENDING_BOOKING_KEY,
      JSON.stringify({ payload, createdAt: new Date().toISOString() }),
    );
    hasPendingBookingDraft.value = true;
    toast.add({
      title: "สร้างรายการไม่สำเร็จ",
      description: "บันทึก draft ไว้ในเครื่องแล้ว สามารถลองใหม่เมื่อเน็ตเสถียร",
      color: "warning",
    });
  } finally {
    creatingBooking.value = false;
    progress.value = false;
  }
}

async function createPosSale() {
  if (!canCreateSale.value) return;
  creatingSale.value = true;
  progress.value = true;
  const payload = {
    userId: customer.value?.kind === "account" ? customer.value.userId : null,
    walkInPhone: customerPhone.value || null,
    customerName: customerNameForCheckout.value || null,
    branchId: selectedBranchId.value,
    paymentMethod: depositPaymentMethod.value,
    paidAmount: salePaidAmount.value,
    notes: saleNotes.value || depositNotes.value,
    items: saleCart.value.map((line) => ({
      skuId: line.skuId,
      quantity: line.quantity,
    })),
  };
  const committedSaleLines = saleCart.value.map((line) => ({
    skuId: line.skuId,
    quantity: line.quantity,
  }));

  try {
    const response = await $fetch<{
      order: { id: string; order_number?: string; orderNumber?: string };
      appliedInventory?: boolean;
    }>("/api/admin/pos/sales", { method: "POST", body: payload });
    if (response.appliedInventory !== false) {
      applyCommittedSaleToCatalog(committedSaleLines);
    }
    saleCart.value = [];
    await Promise.all([loadCatalog(), loadPosHistory()]);
    toast.add({
      title: "บันทึกขายหน้าร้านสำเร็จ",
      description: response.order.order_number || response.order.orderNumber,
      color: "success",
    });
  } catch {
    localStorage.setItem(
      "hop-admin-pos-pending-sale:v1",
      JSON.stringify({ payload, createdAt: new Date().toISOString() }),
    );
    toast.add({
      title: "บันทึกขายไม่สำเร็จ",
      description:
        "เก็บ draft ไว้ในเครื่องแล้ว กรุณาตรวจสอบเน็ต/stock แล้วลองใหม่",
      color: "warning",
    });
  } finally {
    creatingSale.value = false;
    progress.value = false;
  }
}

async function retryPendingBookingDraft() {
  if (!import.meta.client) return;
  const raw = localStorage.getItem(PENDING_BOOKING_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { payload?: Record<string, unknown> };
    if (!parsed.payload) return;
    creatingBooking.value = true;
    const response = await $fetch<{ booking: AdminRentalBookingRow }>(
      "/api/admin/pos/bookings",
      { method: "POST", body: parsed.payload },
    );
    lookup.value = lookup.value ?? { customer: null, bookings: [] };
    lookup.value.bookings = [response.booking, ...lookup.value.bookings];
    selectedBooking.value = response.booking;
    await Promise.all([loadPosHistory(), loadBookingCalendarBlocks()]);
    await handlePostCreateNavigation(response.booking.id);
    localStorage.removeItem(PENDING_BOOKING_KEY);
    hasPendingBookingDraft.value = false;
    toast.add({ title: "Retry สร้าง booking สำเร็จ", color: "success" });
  } finally {
    creatingBooking.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">POS & Fulfillment</h2>
        <p class="text-sm text-muted">
          ค้นหาลูกค้าด้วยเบอร์/QR, ตรวจบัตรประชาชน, Pick-list, Pickup/Return
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UBadge :color="isOnline ? 'success' : 'warning'" variant="soft">{{
          isOnline ? "Online" : "Offline draft mode"
        }}</UBadge>
        <UButton
          icon="bx:barcode-reader"
          label="Scan Product"
          variant="soft"
          @click="openScanner('catalog')"
        />
        <UButton
          icon="bx:download"
          label="Export CSV"
          color="neutral"
          variant="soft"
          :href="accountingExportUrl"
          target="_blank"
          rel="noopener noreferrer"
        />
      </div>
    </div>

    <UProgress v-if="progress" animation="carousel" />

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">Branch Selection</h3>
            <p class="text-sm text-muted">
              เลือกสาขาก่อนเริ่มทำรายการ เพื่อใช้กรองประวัติและ Stock หน้าร้าน
            </p>
          </div>
          <UBadge color="neutral" variant="soft">
            {{ selectedBranch?.nameTh || "ยังไม่ได้เลือกสาขา" }}
          </UBadge>
        </div>
      </template>
      <div class="grid gap-3 md:grid-cols-3">
        <UFormField label="สาขา POS" class="md:col-span-2" required>
          <select
            v-model="selectedBranchId"
            class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
            :disabled="branchLoading"
          >
            <option value="" disabled>เลือกสาขา</option>
            <option
              v-for="branch in branches"
              :key="branch.id"
              :value="branch.id"
            >
              {{ branch.nameTh }} · {{ branch.code }}
            </option>
          </select>
        </UFormField>
        <div class="rounded-xl border border-default p-3 text-sm">
          <p class="font-medium">Workspace status</p>
          <p class="text-muted">
            ประวัติและ Catalog จะอิงจากสาขานี้โดยอัตโนมัติ
          </p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <h3 class="font-semibold">POS Transaction History</h3>
            <p class="text-sm text-muted">
              ประวัติรายการรายวันตามสาขา POS ที่เลือก ใช้วันที่จาก created_at
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UInput v-model="historyDate" type="date" class="w-40" />
            <UButton
              :color="showIncompleteOnly ? 'warning' : 'neutral'"
              :variant="showIncompleteOnly ? 'solid' : 'soft'"
              :label="
                showIncompleteOnly
                  ? 'แสดงทั้งหมด'
                  : `Incomplete (${incompleteHistoryCount})`
              "
              @click="showIncompleteOnly = !showIncompleteOnly"
            />
            <UButton
              icon="bx:refresh"
              variant="soft"
              :loading="historyLoading"
              label="Refresh"
              @click="loadPosHistory"
            />
          </div>
        </div>
      </template>

      <div class="grid gap-3 md:grid-cols-4">
        <div class="rounded-xl border border-default p-3">
          <p class="text-xs text-muted">ยอดรวมรายวัน</p>
          <p class="text-lg font-semibold">
            {{ formatCurrency(posHistory?.summary.totalAmount ?? 0) }}
          </p>
        </div>
        <div class="rounded-xl border border-default p-3">
          <p class="text-xs text-muted">ขายขาด</p>
          <p class="text-lg font-semibold">
            {{ formatCurrency(posHistory?.summary.totalSales ?? 0) }}
          </p>
        </div>
        <div class="rounded-xl border border-default p-3">
          <p class="text-xs text-muted">เช่า / มัดจำ</p>
          <p class="text-lg font-semibold">
            {{ formatCurrency(posHistory?.summary.totalRentals ?? 0) }}
          </p>
        </div>
        <div class="rounded-xl border border-default p-3">
          <p class="text-xs text-muted">จำนวนรายการ</p>
          <p class="text-lg font-semibold">
            {{ posHistory?.summary.transactionCount ?? 0 }} รายการ
          </p>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <UBadge
          v-for="[method, row] in historyPaymentBreakdown"
          :key="method"
          variant="soft"
          color="neutral"
        >
          {{ formatPaymentMethod(method) }} · {{ row.count }} ·
          {{ formatCurrency(row.amount) }}
        </UBadge>
        <span
          v-if="historyPaymentBreakdown.length === 0"
          class="text-sm text-muted"
        >
          ยังไม่มีรายการชำระเงินในวันนี้
        </span>
      </div>

      <div class="mt-4 overflow-x-auto rounded-xl border border-default">
        <table class="min-w-full divide-y divide-default text-sm">
          <thead class="bg-muted/40 text-left text-xs uppercase text-muted">
            <tr>
              <th class="px-3 py-2">เวลา</th>
              <th class="px-3 py-2">เลขที่เอกสาร</th>
              <th class="px-3 py-2">ประเภท</th>
              <th class="px-3 py-2">ลูกค้า</th>
              <th class="px-3 py-2 text-right">ยอดรวม</th>
              <th class="px-3 py-2">ชำระเงิน</th>
              <th class="px-3 py-2">สาขา</th>
              <th class="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-if="historyLoading">
              <td colspan="8" class="px-3 py-6 text-center text-muted">
                กำลังโหลดประวัติ POS...
              </td>
            </tr>
            <tr v-else-if="!filteredHistoryItems.length">
              <td colspan="8" class="px-3 py-6 text-center text-muted">
                {{
                  showIncompleteOnly
                    ? "ไม่พบรายการจองที่ยังไม่เสร็จสิ้นในวันที่เลือก"
                    : "ไม่พบรายการ POS ในวันที่เลือก"
                }}
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="item in filteredHistoryItems"
                :key="`${item.type}:${item.id}`"
                class="hover:bg-elevated/50"
              >
                <td class="whitespace-nowrap px-3 py-2">
                  {{ formatTime(item.createdAt) }}
                </td>
                <td class="whitespace-nowrap px-3 py-2 font-medium">
                  {{ item.documentNo }}
                </td>
                <td class="px-3 py-2">
                  <UBadge
                    :color="
                      isHistoryItemCancelled(item)
                        ? 'error'
                        : item.type === 'sale'
                          ? 'primary'
                          : 'warning'
                    "
                    variant="soft"
                  >
                    {{ item.type === "sale" ? "ขายขาด" : "เช่า" }} ·
                    {{ item.status }}
                  </UBadge>
                </td>
                <td class="px-3 py-2">{{ item.customerName }}</td>
                <td
                  class="whitespace-nowrap px-3 py-2 text-right font-semibold"
                >
                  {{ formatCurrency(item.amount) }}
                </td>
                <td class="px-3 py-2">
                  <div class="space-y-1">
                    <p>{{ formatPaymentMethod(item.paymentMethod) }}</p>
                    <p class="text-xs text-muted">{{ item.paymentStatus }}</p>
                    <p v-if="item.type === 'rental'" class="text-xs text-muted">
                      Refund {{ item.depositRefundStatus || "not_refunded" }} ·
                      {{ formatCurrency(item.depositRefundAmount ?? 0) }}
                    </p>
                  </div>
                </td>
                <td class="px-3 py-2">
                  {{ item.branchName || item.branchId }}
                </td>
                <td class="px-3 py-2">
                  <div class="flex flex-wrap justify-end gap-1">
                    <UButton
                      size="xs"
                      variant="soft"
                      color="neutral"
                      icon="bx:printer"
                      label="Full"
                      @click="showPrintPlaceholder('full', item)"
                    />
                    <UButton
                      size="xs"
                      variant="soft"
                      color="neutral"
                      icon="bx:receipt"
                      label="Abbrev"
                      @click="showPrintPlaceholder('abbreviated', item)"
                    />
                    <UButton
                      v-if="
                        item.type === 'rental' && item.status === 'confirmed'
                      "
                      size="xs"
                      variant="soft"
                      color="primary"
                      icon="bx:package"
                      label="Pickup"
                      :loading="
                        openingFulfillmentHistoryKey === historyActionKey(item)
                      "
                      :disabled="isHistoryItemCancelled(item)"
                      @click="openFulfillmentFromHistory(item)"
                    />
                    <UButton
                      v-if="
                        item.type === 'rental' && item.status === 'picked_up'
                      "
                      size="xs"
                      variant="soft"
                      color="success"
                      icon="bx:undo"
                      label="Return"
                      :loading="
                        openingFulfillmentHistoryKey === historyActionKey(item)
                      "
                      :disabled="isHistoryItemCancelled(item)"
                      @click="openFulfillmentFromHistory(item)"
                    />
                    <UButton
                      v-if="item.type === 'rental'"
                      size="xs"
                      variant="soft"
                      color="warning"
                      icon="bx:money"
                      label="Deposit"
                      :disabled="isHistoryItemCancelled(item)"
                      @click="openDepositEdit(item)"
                    />
                    <UButton
                      v-if="isSuperAdmin"
                      size="xs"
                      variant="soft"
                      color="error"
                      icon="bx:x-circle"
                      label="Void"
                      :loading="cancellingHistoryKey === historyActionKey(item)"
                      :disabled="isHistoryItemCancelled(item)"
                      @click="cancelHistoryItem(item)"
                    />
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </UCard>

    <div class="grid gap-4 lg:grid-cols-3">
      <UCard :class="['lg:col-span-1 ring-1', modeAccentClass]">
        <template #header>
          <div class="space-y-3">
            <div>
              <h3 class="font-semibold">Customer Info Section</h3>
              <p class="text-sm text-muted">
                {{
                  transactionMode === "rental"
                    ? "Rental ต้องมีเบอร์และชื่อ-นามสกุลก่อนสร้างรายการ"
                    : "Sale เป็น Optional — กรอกเมื่ออยากเก็บ reference ลูกค้า"
                }}
              </p>
            </div>
            <UTabs
              v-model="transactionMode"
              :items="transactionModeTabs"
              value-key="value"
              :content="false"
              class="w-full"
            />
          </div>
        </template>
        <div class="space-y-3">
          <UFormField label="เบอร์โทรศัพท์ หรือ Customer ID">
            <UInput
              v-model="search"
              icon="bx:search"
              class="w-full"
              placeholder="08x-xxx-xxxx หรือ customer UUID"
              @keyup.enter="lookupCustomer()"
            />
          </UFormField>
          <UButton
            block
            :loading="loading"
            label="ค้นหา"
            @click="lookupCustomer()"
          />
          <UButton
            block
            icon="bx:qr-scan"
            variant="soft"
            label="Scan Customer"
            @click="openScanner('customer')"
          />

          <div class="border-t border-default pt-3">
            <p class="mb-2 text-sm font-medium">
              {{
                transactionMode === "rental"
                  ? "ลูกค้าใหม่ (ไม่มี Account)"
                  : "ข้อมูลลูกค้าเพิ่มเติม (Optional)"
              }}
            </p>
            <UFormField
              :label="
                transactionMode === 'rental'
                  ? 'เบอร์โทรศัพท์ (จำเป็น)'
                  : 'เบอร์โทรศัพท์ (Optional)'
              "
              :required="transactionMode === 'rental'"
              ><UInput v-model="draft.phone" class="w-full"
            /></UFormField>
            <UFormField
              :label="
                transactionMode === 'rental'
                  ? 'ชื่อ-นามสกุล (จำเป็น)'
                  : 'ชื่อ-นามสกุล (Optional)'
              "
              :required="transactionMode === 'rental'"
              ><UInput v-model="draft.fullName" class="w-full"
            /></UFormField>
            <UFormField label="หมายเหตุ"
              ><UTextarea v-model="draft.notes" class="w-full" :rows="2"
            /></UFormField>
            <UButton
              v-if="transactionMode === 'rental'"
              class="mt-2"
              block
              variant="soft"
              icon="bx:id-card"
              label="ถ่าย/อัปโหลดบัตรประชาชน"
              @click="idModalOpen = true"
            />
            <UButton
              v-if="transactionMode === 'rental' && hasPendingIdDraft"
              class="mt-2"
              block
              color="warning"
              variant="soft"
              icon="bx:refresh"
              label="Retry ข้อมูลบัตรที่ค้างอยู่"
              @click="retryPendingIdDraft"
            />
          </div>
        </div>
      </UCard>

      <UCard :class="['lg:col-span-2 ring-1', modeAccentClass, modeSoftClass]">
        <template #header>
          <div>
            <h3 class="font-semibold">
              {{
                transactionMode === "rental"
                  ? "Rental customer validation"
                  : "Sale customer summary"
              }}
            </h3>
            <p class="text-sm text-muted">
              {{
                transactionMode === "rental"
                  ? "ตรวจข้อมูลลูกค้าและบัตรประชาชน"
                  : "ข้อมูลลูกค้าไม่บังคับในโหมดขายขาด"
              }}
            </p>
          </div>
        </template>
        <UAlert
          v-if="transactionMode === 'rental' && !rentalCustomerInfoReady"
          class="mb-3"
          color="warning"
          variant="soft"
          title="Rental Mode ต้องระบุข้อมูลลูกค้า"
          description="กรอกเบอร์โทรศัพท์และชื่อ-นามสกุล หรือค้นหาลูกค้าที่มีข้อมูลครบก่อนสร้าง Booking"
        />
        <UAlert
          v-if="transactionMode === 'sale' && !customer"
          color="success"
          variant="soft"
          :title="
            customerPhone
              ? 'จะบันทึกข้อมูลลูกค้า Optional จากฟอร์ม'
              : 'ขายขาดแบบไม่ระบุลูกค้าได้'
          "
          :description="
            customerPhone
              ? 'ข้อมูลนี้ใช้เป็น reference ของรายการขาย แต่ไม่ใช่เงื่อนไขบังคับ'
              : 'ระบบจะบันทึกเป็น POS Walk-in โดยไม่มีชื่อ/เบอร์ลูกค้า'
          "
        />
        <div v-else-if="customer" class="space-y-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="font-semibold">
                {{ customer.fullName || "Walk-in customer" }}
              </p>
              <p class="text-sm text-muted">
                {{ customer.phone || customer.userId }}
              </p>
              <UBadge
                :color="customer.kind === 'account' ? 'info' : 'neutral'"
                variant="soft"
                >{{ customer.kind }}</UBadge
              >
              <UBadge
                v-if="customer.kind === 'account'"
                class="ml-2"
                :color="customerKycVerified ? 'success' : 'warning'"
                variant="soft"
              >
                KYC {{ customer.kycStatus || "pending" }}
              </UBadge>
              <p
                v-if="
                  transactionMode === 'rental' && customerDocumentBlockReason
                "
                class="mt-2 text-xs text-warning"
              >
                {{ customerDocumentBlockReason }}
              </p>
            </div>
            <UButton
              v-if="transactionMode === 'rental' && idCardMissing"
              color="warning"
              icon="bx:id-card"
              label="เพิ่มข้อมูลบัตร"
              @click="idModalOpen = true"
            />
            <UButton
              v-else-if="
                transactionMode === 'rental' && customerHasIdCardDocument
              "
              color="success"
              variant="soft"
              icon="bx:check-shield"
              :loading="viewingIdCard"
              :label="
                customerKycVerified ? 'ดูบัตร / KYC Verified' : 'ดูบัตรประชาชน'
              "
              @click="viewCustomerIdCard"
            />
            <UBadge
              v-else-if="transactionMode === 'rental' && customerKycVerified"
              color="success"
              variant="soft"
              label="KYC Verified"
            />
          </div>
        </div>
        <UAlert
          v-else
          :color="transactionMode === 'rental' ? 'info' : 'success'"
          variant="soft"
          :title="
            transactionMode === 'rental'
              ? 'ยังไม่ได้เลือกลูกค้า'
              : 'ยังไม่ระบุข้อมูลลูกค้า'
          "
          :description="
            transactionMode === 'rental'
              ? 'ค้นหาด้วยเบอร์โทรศัพท์หรือสแกน QR จากหน้าโปรไฟล์/รายการเช่าของลูกค้า'
              : 'ยังสามารถบันทึกขายขาดได้ตามปกติ'
          "
        />
      </UCard>
    </div>

    <UCard :class="['ring-1', modeAccentClass]">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">
              Workspace Section ·
              {{
                transactionMode === "rental"
                  ? "สร้างรายการเช่า"
                  : "ขายขาดหน้าร้าน"
              }}
              จาก POS
            </h3>
            <p class="text-sm text-muted">
              สแกน/ค้นหา SKU, เลือกสาขา และรับชำระเงินแบบรวมยอดในครั้งเดียว
            </p>
          </div>
          <UButton
            v-if="transactionMode === 'rental' && hasPendingBookingDraft"
            color="warning"
            variant="soft"
            icon="bx:refresh"
            label="Retry booking draft"
            @click="retryPendingBookingDraft"
          />
        </div>
      </template>

      <UAlert
        class="mb-4"
        :color="transactionMode === 'rental' ? 'primary' : 'secondary'"
        variant="soft"
        :title="
          transactionMode === 'rental'
            ? 'Rental/Booking workspace'
            : 'Sale workspace'
        "
        :description="
          transactionMode === 'rental'
            ? 'เลือก Asset, ระบุวันเช่า, รับมัดจำ และสร้าง Booking'
            : 'เลือก SKU, เพิ่มเข้าตะกร้าขาย, รับชำระ และตัด Stock โดยไม่บังคับข้อมูลลูกค้า'
        "
      />

      <div class="grid gap-4 xl:grid-cols-3">
        <div class="space-y-3 xl:col-span-2">
          <AdminPosCatalogSearch
            v-model="catalogSearch"
            :mode="transactionMode"
            :loading="catalogLoading"
            :suggestions="catalogSuggestionItems"
            :suggestions-open="catalogSuggestOpen"
            @search-input="scheduleCatalogSearch"
            @focus-input="showCatalogSuggestions"
            @blur-input="hideCatalogSuggestionsSoon"
            @submit="loadCatalog"
            @scan="openScanner('catalog')"
            @select-suggestion="selectSaleSkuSuggestionByKey"
          />

          <UAlert
            v-if="!catalogLoading && filteredCatalogProducts.length === 0"
            color="warning"
            variant="soft"
            :title="
              transactionMode === 'rental'
                ? 'ยังไม่มี Asset ที่พร้อมเช่าใน POS'
                : 'ยังไม่มี SKU สำหรับขายในสาขานี้'
            "
            :description="
              transactionMode === 'rental'
                ? 'POS จะแสดงเฉพาะ Asset ที่สถานะ Active, ไม่ถูกซ่อน, เปิด Daily rate และมีราคาเช่ารายวันมากกว่า 0 บาท'
                : 'Sale POS จะแสดง SKU ที่ไม่ซ่อนและมี stock/branch stock พร้อมขาย'
            "
          />

          <div v-if="transactionMode === 'rental'" class="space-y-3">
            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Asset">
                <select
                  v-model="selectedProductId"
                  class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
                >
                  <option value="" disabled>เลือกสินค้า</option>
                  <option
                    v-for="product in filteredCatalogProducts"
                    :key="product.id"
                    :value="product.id"
                  >
                    [{{ product.type }}] {{ product.nameTh }}
                    {{ product.brand ? `· ${product.brand}` : "" }}
                  </option>
                </select>
              </UFormField>

              <UFormField label="Asset / Variant">
                <select
                  v-model="selectedSkuId"
                  class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
                >
                  <option value="" disabled>เลือก SKU</option>
                  <option
                    v-for="sku in selectedProduct?.skus ?? []"
                    :key="sku.id"
                    :value="sku.id"
                  >
                    {{ sku.labelTh }} ·
                    {{
                      transactionMode === "rental"
                        ? `${formatCurrency(sku.dailyRate)}/วัน`
                        : formatCurrency(sku.price)
                    }}
                  </option>
                </select>
              </UFormField>
            </div>

            <ProductsRentalBookingCalendar
              v-if="selectedSku"
              :selected-sku-id="selectedSku.id"
              :asset-id="selectedSku.id"
              :daily-rate="selectedSku.dailyRate"
              :weekly-rate="selectedSku.weeklyRate"
              :monthly-rate="selectedSku.monthlyRate"
              :daily-enabled="true"
              :weekly-enabled="selectedSku.weeklyRate > 0"
              :monthly-enabled="selectedSku.monthlyRate > 0"
              :deposit="defaultDepositAmount"
              currency-code="THB"
              :min-days="selectedProduct?.rentalMinDays ?? 1"
              :max-days="selectedProduct?.rentalMaxDays ?? 0"
              :buffer-days="0"
              :blocking-bookings="bookingCalendarBlocks"
              :loading="creatingBooking || bookingCalendarBlocksLoading"
              @change="handlePosBookingCalendarChange"
            />
            <UAlert
              v-else
              color="neutral"
              variant="soft"
              title="เลือก Asset ก่อนเริ่มจอง"
              description="POS booking จะใช้ปฏิทินและสรุปราคาแบบเดียวกับหน้า Booking ของลูกค้า แต่จะไม่บังคับ buffer day"
            />
          </div>

          <div v-if="transactionMode === 'sale'" class="space-y-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-sm font-medium">รายการ SKU พร้อมขาย</p>
                <p class="text-xs text-muted">
                  แสดงรูปสินค้า ราคา และ stock คงเหลือของสาขาที่เลือก
                </p>
              </div>
              <UBadge color="neutral" variant="soft">
                {{ saleSkuOptions.length }} SKU
              </UBadge>
            </div>
            <div
              class="grid max-h-72 gap-2 overflow-y-auto pr-1 md:grid-cols-2"
            >
              <button
                v-for="option in saleSkuOptions"
                :key="option.key"
                type="button"
                class="flex items-center gap-3 rounded-xl border border-default p-3 text-left transition hover:border-secondary hover:bg-secondary/5 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="option.stock <= 0"
                @click="selectSaleSkuOption(option)"
              >
                <img
                  :src="productImageSrc(option.imageUrl)"
                  alt=""
                  class="h-14 w-14 rounded-lg border object-cover"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold">
                    {{ option.productName }}
                  </span>
                  <span class="block truncate text-xs text-muted">
                    {{ option.skuName }} · {{ option.code }}
                  </span>
                  <span class="block text-xs font-medium">
                    {{ formatCurrency(option.sku.price) }}
                  </span>
                </span>
                <UBadge
                  :color="option.stock > 0 ? 'success' : 'error'"
                  variant="soft"
                >
                  Stock {{ option.stock }}
                </UBadge>
              </button>
            </div>
          </div>
          <UButton
            v-if="transactionMode === 'sale'"
            class="mt-3"
            icon="bx:cart-add"
            color="secondary"
            variant="soft"
            :disabled="!selectedSku"
            label="เพิ่มลงตะกร้าขาย"
            @click="addSaleSkuToCart()"
          />
        </div>

        <div
          id="payment-section"
          :class="['space-y-3 rounded-xl border p-3', modeAccentClass]"
        >
          <AdminPosTotalSummary
            :mode="transactionMode"
            :rental-days="bookingDays"
            :rental-subtotal="bookingPricing?.total ?? null"
            :rental-checkout-total="rentalCheckoutTotal"
            :default-deposit-amount="defaultDepositAmount"
            :current-deposit-amount="depositPaidAmount"
            :is-deposit-adjusted="isRentalDepositAdjusted"
            :payment-lines="rentalPaymentLines"
            :payment-summary="rentalPaymentSummary"
            :sale-cart-count="saleCart.length"
            :sale-cart-total="saleCartTotal"
          />

          <div v-if="transactionMode === 'sale'" class="space-y-3">
            <p class="text-sm font-medium">ตะกร้าขายขาด</p>
            <div v-if="saleCart.length === 0" class="text-sm text-muted">
              ยังไม่มีสินค้าในตะกร้า — สแกน Barcode/QR
              หรือค้นหาแล้วกดเพิ่มลงตะกร้า
            </div>
            <div
              v-for="line in saleCart"
              :key="line.skuId"
              class="rounded-lg border border-default p-2 text-sm"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex min-w-0 gap-3">
                  <img
                    :src="productImageSrc(line.imageUrl)"
                    alt=""
                    class="h-12 w-12 rounded-lg border object-cover"
                  />
                  <div class="min-w-0">
                    <p class="truncate font-medium">{{ line.name }}</p>
                    <p class="text-xs text-muted">
                      {{ line.code }} · {{ formatCurrency(line.unitPrice) }}
                    </p>
                    <p class="text-xs text-muted">
                      พร้อมขาย {{ line.maxQuantity }} · คงเหลือหลังตะกร้า
                      {{ saleLineRemaining(line) }}
                    </p>
                  </div>
                </div>
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="bx:trash"
                  @click="removeSaleLine(line.skuId)"
                />
              </div>
              <UInput
                v-model.number="line.quantity"
                class="mt-2"
                type="number"
                min="1"
                :max="line.maxQuantity"
                @blur="normalizeSaleLineQuantity(line)"
              />
            </div>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            <UFormField
              :label="
                transactionMode === 'rental' ? 'รับมัดจำจริง' : 'รับชำระจริง'
              "
            >
              <div class="flex gap-2">
                <UInput
                  v-model.number="depositPaidAmount"
                  class="w-full"
                  type="number"
                  min="0"
                />
                <UButton
                  v-if="transactionMode === 'rental' && selectedSku"
                  color="neutral"
                  variant="soft"
                  label="Reset"
                  @click="depositPaidAmount = defaultDepositAmount"
                />
              </div>
            </UFormField>
            <UFormField label="วิธีชำระเงิน">
              <select
                v-model="depositPaymentMethod"
                class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
              >
                <option value="cash">เงินสด</option>
                <option value="qr_transfer">โอนผ่าน QR</option>
                <option value="bank_transfer">โอนบัญชี</option>
                <option value="card">บัตร</option>
                <option value="other">อื่น ๆ</option>
              </select>
            </UFormField>
          </div>
          <UFormField
            :label="
              transactionMode === 'rental'
                ? 'หลักฐานมัดจำ'
                : 'หลักฐานการชำระเงิน (Optional)'
            "
          >
            <div class="space-y-2">
              <div class="grid gap-2 sm:grid-cols-2">
                <label
                  for="deposit-proof-camera"
                  :class="[
                    'flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-white shadow-sm',
                    transactionMode === 'rental'
                      ? 'border-primary bg-primary'
                      : 'border-secondary bg-secondary',
                  ]"
                >
                  <UIcon name="bx:camera" />
                  ถ่ายรูปหลักฐาน
                </label>
                <input
                  id="deposit-proof-camera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  class="sr-only"
                  @change="onDepositProofChange"
                />

                <label
                  for="deposit-proof-upload"
                  class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-default bg-white px-3 py-2 text-sm font-medium text-default shadow-sm"
                >
                  <UIcon name="bx:upload" />
                  อัปโหลดรูปภาพ
                </label>
                <input
                  id="deposit-proof-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  class="sr-only"
                  @change="onDepositProofChange"
                />
              </div>
              <div
                class="flex items-center justify-between gap-2 text-xs text-muted"
              >
                <span>{{ depositProofFileName }}</span>
                <UButton
                  v-if="depositProofFile"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  label="ล้างไฟล์"
                  @click="clearDepositProof"
                />
              </div>
              <p class="text-xs text-muted">
                รองรับรูปภาพ JPG, PNG, WebP สูงสุด 10MB
              </p>
              <img
                v-if="depositProofPreview"
                :src="depositProofPreview"
                alt="Deposit proof preview"
                class="max-h-40 rounded-lg border object-contain"
              />
            </div>
          </UFormField>
          <UTextarea
            v-model="depositNotes"
            class="w-full"
            :rows="2"
            :placeholder="
              transactionMode === 'rental'
                ? 'หมายเหตุเงินมัดจำ / เลขอ้างอิงสลิป'
                : 'หมายเหตุการชำระเงิน / เลขอ้างอิงสลิป'
            "
          />
          <UButton
            v-if="transactionMode === 'rental'"
            block
            color="primary"
            icon="bx:plus-circle"
            :loading="creatingBooking"
            :disabled="!canCreateBooking || requiresIdCardForCheckout"
            label="สร้าง Booking และรับชำระรวม"
            @click="requestCreatePosBooking"
          />
          <UButton
            v-else
            block
            color="secondary"
            icon="bx:receipt"
            :loading="creatingSale"
            :disabled="!canCreateSale"
            label="บันทึกขายขาดและตัด Stock"
            @click="createPosSale"
          />
          <p
            v-if="
              transactionMode === 'sale' &&
              saleCart.length > 0 &&
              salePaidAmount < saleCartTotal
            "
            class="text-xs text-error"
          >
            ต้องรับชำระอย่างน้อย
            {{ formatCurrency(saleCartTotal) }} ก่อนบันทึกขายและตัด Stock
          </p>
          <UTextarea
            v-if="transactionMode === 'sale'"
            v-model="saleNotes"
            class="w-full"
            :rows="2"
            placeholder="หมายเหตุการขาย / เลขอ้างอิง"
          />
          <p v-if="requiresIdCardForCheckout" class="text-xs text-warning">
            {{ customerDocumentBlockReason }}
          </p>
        </div>
      </div>
    </UCard>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard>
        <template #header
          ><h3 class="font-semibold">4) Pre-booked Pick-list</h3></template
        >
        <div v-if="pickupCandidates.length" class="space-y-2">
          <button
            v-for="booking in pickupCandidates"
            :key="booking.id"
            class="w-full rounded-xl border p-3 text-left hover:bg-elevated"
            :class="
              selectedBooking?.id === booking.id
                ? 'border-primary bg-primary/5'
                : 'border-default'
            "
            @click="selectedBooking = booking"
          >
            <div class="flex justify-between gap-3">
              <div>
                <p class="font-medium">{{ bookingTitle(booking) }}</p>
                <p class="text-xs text-muted">
                  {{ booking.startDate }} → {{ booking.endDate }} ·
                  {{ booking.hubName || "No hub" }}
                </p>
              </div>
              <UBadge variant="soft">{{ booking.status }}</UBadge>
            </div>
          </button>
        </div>
        <div
          v-else-if="activeBookings.length"
          class="space-y-2 text-sm text-muted"
        >
          <p>
            พบรายการจองของลูกค้าคนนี้ แต่ยังไม่มีรายการสถานะ confirmed สำหรับ
            pickup
          </p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="booking in activeBookings"
              :key="booking.id"
              variant="soft"
              color="neutral"
            >
              {{ bookingTitle(booking) }} · {{ booking.status }}
            </UBadge>
          </div>
        </div>
        <p v-else class="text-sm text-muted">
          ไม่มีรายการจองล่วงหน้าสำหรับลูกค้านี้
        </p>
      </UCard>

      <UCard id="pos-fulfillment-section">
        <template #header
          ><h3 class="font-semibold">5) Pickup / Return</h3></template
        >
        <div v-if="selectedBooking" class="space-y-3">
          <div class="rounded-xl border border-default p-3 text-sm">
            <p class="font-semibold">{{ bookingTitle(selectedBooking) }}</p>
            <p class="text-muted">
              ยอดค่าเช่า
              {{
                formatCurrency(
                  selectedBooking.rentalTotal,
                  selectedBooking.currencyCode,
                )
              }}
              · มัดจำ
              {{
                formatCurrency(
                  selectedBooking.depositPaidAmount,
                  selectedBooking.currencyCode,
                )
              }}
              <span class="text-xs text-muted">
                (รับจริงจาก POS / ยอดตั้งต้น
                {{
                  formatCurrency(
                    selectedBooking.depositAmount,
                    selectedBooking.currencyCode,
                  )
                }})
              </span>
            </p>
            <p class="text-muted">
              Pick-list:
              {{ selectedBooking.assetName || selectedBooking.productName }} /
              {{ selectedBooking.rentalDays }} วัน
            </p>
          </div>
          <UTextarea
            v-model="fulfillmentNotes"
            class="w-full"
            :rows="2"
            placeholder="หมายเหตุการรับ/คืน"
          />

          <div
            v-if="activeWorkflowKind"
            class="space-y-3 rounded-xl border border-default p-3 text-sm"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="font-semibold">
                  {{ checklistKindLabel(activeWorkflowKind) }} Checklist
                </p>
                <p class="text-xs text-muted">
                  บันทึกลง rental_booking_checklists / items ก่อนยืนยันขั้นตอน
                </p>
              </div>
              <UBadge color="neutral" variant="soft">
                Template {{ workflowTemplates.length }} · List
                {{ workflowChecklists.length }}
              </UBadge>
            </div>

            <UProgress
              v-if="bookingOpsLoading || checklistBusy"
              animation="carousel"
            />

            <div v-if="primaryWorkflowChecklist" class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    :color="
                      checklistStatusColor(
                        primaryWorkflowChecklist.status,
                      ) as any
                    "
                    variant="soft"
                  >
                    {{ primaryWorkflowChecklist.status }}
                  </UBadge>
                  <span class="font-medium">
                    {{
                      primaryWorkflowChecklist.templateName ||
                      activeWorkflowKind
                    }}
                  </span>
                  <span class="text-xs text-muted">
                    {{ workflowChecklistProgress.done }} /
                    {{ workflowChecklistProgress.total }} checked
                  </span>
                </div>
                <div class="flex flex-wrap gap-1">
                  <UButton
                    v-if="primaryWorkflowChecklist.status === 'draft'"
                    size="xs"
                    color="warning"
                    variant="soft"
                    :loading="checklistBusy"
                    label="Start"
                    @click="
                      setWorkflowChecklistStatus(
                        primaryWorkflowChecklist,
                        'in_progress',
                      )
                    "
                  />
                  <UButton
                    v-if="primaryWorkflowChecklist.status !== 'completed'"
                    size="xs"
                    color="success"
                    variant="soft"
                    :loading="checklistBusy"
                    label="Complete Checklist"
                    @click="completeWorkflowChecklist(primaryWorkflowChecklist)"
                  />
                </div>
              </div>

              <div class="space-y-2">
                <div
                  v-for="item in primaryWorkflowChecklist.items"
                  :key="item.id"
                  class="rounded-lg border border-default/70 bg-elevated/40 p-2"
                >
                  <div class="flex flex-wrap items-start gap-2">
                    <UCheckbox
                      :model-value="item.checked === true"
                      :disabled="
                        checklistBusy ||
                        primaryWorkflowChecklist.status === 'completed' ||
                        primaryWorkflowChecklist.status === 'cancelled'
                      "
                      @update:model-value="
                        (value: boolean) =>
                          patchWorkflowChecklistItem(
                            primaryWorkflowChecklist,
                            item,
                            {
                              checked: value,
                              resultStatus: value ? 'passed' : 'pending',
                            },
                          )
                      "
                    />
                    <div class="min-w-0 flex-1">
                      <p class="font-medium">
                        {{ item.label }}
                        <span v-if="item.isRequired" class="text-error">*</span>
                      </p>
                      <p v-if="item.instruction" class="text-xs text-muted">
                        {{ item.instruction }}
                      </p>
                      <div class="mt-1 flex flex-wrap gap-1">
                        <UBadge color="neutral" variant="soft">
                          {{ item.resultStatus }}
                        </UBadge>
                        <UButton
                          size="xs"
                          variant="ghost"
                          :color="
                            item.resultStatus === 'failed' ? 'error' : 'neutral'
                          "
                          :disabled="checklistBusy"
                          label="Fail"
                          @click="
                            patchWorkflowChecklistItem(
                              primaryWorkflowChecklist,
                              item,
                              {
                                checked: false,
                                resultStatus:
                                  item.resultStatus === 'failed'
                                    ? 'pending'
                                    : 'failed',
                              },
                            )
                          "
                        />
                        <UButton
                          size="xs"
                          variant="ghost"
                          :color="
                            item.resultStatus === 'not_applicable'
                              ? 'info'
                              : 'neutral'
                          "
                          :disabled="checklistBusy"
                          label="N/A"
                          @click="
                            patchWorkflowChecklistItem(
                              primaryWorkflowChecklist,
                              item,
                              {
                                resultStatus:
                                  item.resultStatus === 'not_applicable'
                                    ? 'pending'
                                    : 'not_applicable',
                              },
                            )
                          "
                        />
                      </div>
                    </div>
                  </div>
                  <UInput
                    v-if="item.responseType === 'text'"
                    :model-value="item.responseText ?? ''"
                    class="mt-2"
                    size="sm"
                    placeholder="Response"
                    @blur="
                      (event: FocusEvent) =>
                        patchWorkflowChecklistItem(
                          primaryWorkflowChecklist,
                          item,
                          {
                            responseText: (event.target as HTMLInputElement)
                              .value,
                          },
                        )
                    "
                  />
                  <UInput
                    v-else-if="item.responseType === 'number'"
                    :model-value="item.responseNumber ?? ''"
                    class="mt-2"
                    type="number"
                    size="sm"
                    placeholder="Response"
                    @blur="
                      (event: FocusEvent) =>
                        patchWorkflowChecklistItem(
                          primaryWorkflowChecklist,
                          item,
                          {
                            responseNumber: Number(
                              (event.target as HTMLInputElement).value,
                            ),
                          },
                        )
                    "
                  />
                  <UTextarea
                    :model-value="item.remark ?? ''"
                    class="mt-2"
                    :rows="1"
                    size="sm"
                    placeholder="หมายเหตุ Checklist"
                    @blur="
                      (event: FocusEvent) =>
                        patchWorkflowChecklistItem(
                          primaryWorkflowChecklist,
                          item,
                          {
                            remark: (event.target as HTMLTextAreaElement).value,
                          },
                        )
                    "
                  />
                </div>
                <p
                  v-if="primaryWorkflowChecklist.items.length === 0"
                  class="text-xs text-warning"
                >
                  Checklist นี้ไม่มี item — ใช้เป็นบันทึกยืนยันแบบ ad-hoc
                </p>
              </div>
            </div>

            <div v-else class="space-y-2">
              <UAlert
                color="warning"
                variant="soft"
                title="ยังไม่มี Checklist สำหรับขั้นตอนนี้"
                :description="
                  workflowTemplates.length
                    ? 'กดสร้างจาก template ของ asset นี้ก่อนทำรายการ'
                    : 'ไม่พบ template ของ asset นี้ ระบบจะสร้าง ad-hoc checklist ให้บันทึก workflow ได้'
                "
              />
              <UButton
                color="primary"
                variant="soft"
                icon="bx:list-check"
                :loading="checklistBusy"
                :label="`สร้าง ${checklistKindLabel(activeWorkflowKind)} Checklist`"
                @click="createWorkflowChecklist()"
              />
            </div>

            <p v-if="!isWorkflowChecklistReady" class="text-xs text-warning">
              ต้องตอบรายการบังคับและกด Complete Checklist ก่อน Confirm
              {{ checklistKindLabel(activeWorkflowKind) }}
            </p>
          </div>

          <div
            v-if="
              selectedBooking.status === 'picked_up' ||
              selectedBooking.status === 'returned'
            "
            class="space-y-3 rounded-xl border border-success/40 bg-success/5 p-3 text-sm"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="font-semibold">Deposit Refund</p>
                <p class="text-xs text-muted">
                  คำนวณจาก deposit_paid_amount ของ booking
                </p>
              </div>
              <UBadge color="success" variant="soft">
                Refund
                {{
                  formatCurrency(
                    refundForm.amount,
                    selectedBooking.currencyCode,
                  )
                }}
              </UBadge>
            </div>
            <div class="grid gap-2 sm:grid-cols-3">
              <div class="rounded-lg border border-default p-2">
                <p class="text-xs text-muted">มัดจำที่รับจริง</p>
                <p class="font-semibold">
                  {{
                    formatCurrency(
                      selectedBooking.depositPaidAmount,
                      selectedBooking.currencyCode,
                    )
                  }}
                </p>
              </div>
              <UFormField label="Refund Amount">
                <UInput
                  v-model.number="refundForm.amount"
                  type="number"
                  min="0"
                  :max="selectedBooking.depositPaidAmount"
                  :disabled="selectedBooking.status === 'returned'"
                />
              </UFormField>
              <UFormField label="Refund Status">
                <select
                  v-model="refundForm.status"
                  class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
                  :disabled="selectedBooking.status === 'returned'"
                >
                  <option value="pending">รอคืนเงิน</option>
                  <option value="refunded">คืนเงินแล้ว</option>
                  <option value="forfeited">ริบมัดจำ</option>
                  <option value="not_applicable">ไม่เกี่ยวข้อง</option>
                </select>
              </UFormField>
            </div>
            <UTextarea
              v-model="refundForm.notes"
              :rows="2"
              :disabled="selectedBooking.status === 'returned'"
              placeholder="หมายเหตุ/เลขอ้างอิงการคืนเงินมัดจำสำหรับบัญชี"
            />
            <div
              v-if="
                selectedBooking.status === 'picked_up' &&
                returnRefundProofRequired
              "
              class="space-y-2 rounded-lg border border-default p-2"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="font-medium">Refund Slip</p>
                  <p class="text-xs text-muted">
                    ต้องอัปโหลดหลักฐานการคืนเงินก่อน Confirm Return
                  </p>
                </div>
                <UBadge
                  :color="refundProofUploadedUrl ? 'success' : 'warning'"
                  variant="soft"
                >
                  {{ refundProofUploadedUrl ? "Uploaded" : "Required" }}
                </UBadge>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <label
                  for="refund-proof-upload"
                  class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-default bg-white px-3 py-2 text-sm font-medium text-default shadow-sm"
                >
                  <UIcon name="bx:upload" />
                  เลือก Refund Slip
                </label>
                <input
                  id="refund-proof-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  class="sr-only"
                  @change="onRefundProofChange"
                />
                <UButton
                  icon="bx:cloud-upload"
                  color="success"
                  variant="soft"
                  label="อัปโหลด Slip"
                  :loading="refundProofUploading"
                  :disabled="!refundProofFile || refundProofUploading"
                  @click="uploadRefundProof()"
                />
              </div>
              <div
                class="flex items-center justify-between gap-2 text-xs text-muted"
              >
                <span>{{ refundProofFileName }}</span>
                <UButton
                  v-if="refundProofFile || refundProofUploadedUrl"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  label="ล้างไฟล์"
                  @click="clearRefundProof"
                />
              </div>
              <img
                v-if="refundProofPreview"
                :src="refundProofPreview"
                alt="Refund slip preview"
                class="max-h-40 rounded-lg border object-contain"
              />
              <UButton
                v-if="refundProofUploadedUrl"
                size="xs"
                variant="link"
                color="success"
                :href="refundProofUploadedUrl"
                target="_blank"
                rel="noopener noreferrer"
                label="เปิดหลักฐานที่อัปโหลดแล้ว"
              />
            </div>
            <p
              v-if="refundForm.amount > selectedBooking.depositPaidAmount"
              class="text-xs text-error"
            >
              Refund Amount ต้องไม่เกินยอดมัดจำที่รับจริง
            </p>
          </div>

          <div v-if="selectedBooking.status === 'confirmed'" class="space-y-2">
            <p class="text-sm font-medium">Pickup Signature</p>
            <DigitalSignaturePad
              v-model="pickupSignature"
              hint="ให้ลูกค้าเซ็นรับของบนหน้าจอนี้"
            />
          </div>
          <div
            v-else-if="selectedBooking.status === 'picked_up'"
            class="space-y-2"
          >
            <p class="text-sm font-medium">Return Signature</p>
            <DigitalSignaturePad
              v-model="returnSignature"
              hint="ให้ลูกค้าเซ็นยืนยันการคืนสินค้าบนหน้าจอนี้"
            />
          </div>
          <UAlert
            v-if="fulfillmentErrorMessage"
            color="error"
            variant="soft"
            title="ยืนยันรายการไม่สำเร็จ"
            :description="fulfillmentErrorMessage"
          />
          <p
            v-if="
              selectedBooking.status === 'confirmed' &&
              confirmPickupDisabledReason
            "
            class="text-xs text-warning"
          >
            ยังยืนยันรับสินค้าไม่ได้: {{ confirmPickupDisabledReason }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="selectedBooking.status === 'confirmed'"
              :loading="fulfillmentSubmittingType === 'pickup'"
              :disabled="
                !canConfirmPickup || Boolean(fulfillmentSubmittingType)
              "
              color="primary"
              icon="bx:package"
              label="Confirm Pickup"
              :title="confirmPickupDisabledReason || 'พร้อม Confirm Pickup'"
              @click="applyFulfillment('pickup')"
            />
            <UButton
              v-if="selectedBooking.status === 'picked_up'"
              :loading="fulfillmentSubmittingType === 'return'"
              :disabled="
                !canConfirmReturn || Boolean(fulfillmentSubmittingType)
              "
              color="success"
              icon="bx:undo"
              label="Confirm Return"
              :title="confirmReturnDisabledReason || 'พร้อม Confirm Return'"
              @click="applyFulfillment('return')"
            />
            <UButton
              v-if="
                selectedBooking.status === 'picked_up' ||
                selectedBooking.status === 'returned'
              "
              variant="soft"
              color="neutral"
              icon="bx:printer"
              label="Print Pickup Form"
              :to="printFormUrl(selectedBooking.id, 'pickup')"
              target="_blank"
            />
            <UButton
              v-if="selectedBooking.status === 'returned'"
              variant="soft"
              color="neutral"
              icon="bx:printer"
              label="Print Return Form"
              :to="printFormUrl(selectedBooking.id, 'return')"
              target="_blank"
            />
            <UButton
              variant="ghost"
              color="neutral"
              :to="`/admin/rental-bookings/${selectedBooking.id}`"
              label="เปิด Detail"
            />
          </div>
          <p
            v-if="
              selectedBooking.status === 'picked_up' &&
              confirmReturnDisabledReason
            "
            class="text-xs text-warning"
          >
            ยังยืนยันคืนสินค้าไม่ได้: {{ confirmReturnDisabledReason }}
          </p>
        </div>
        <p v-else class="text-sm text-muted">
          เลือกรายการจาก Pick-list หรือกด Return จาก POS Transaction History
          ก่อน
        </p>
      </UCard>
    </div>

    <UModal v-model:open="idModalOpen" title="บันทึกข้อมูลบัตรประชาชน">
      <template #body>
        <div class="space-y-3">
          <UAlert
            color="warning"
            variant="soft"
            title="ต้องมีรูปบัตรประชาชนก่อนทำ Pickup"
            description="ไฟล์จะถูกเก็บแบบ private ใน kyc-documents และเปิดดูผ่านลิงก์ชั่วคราวสำหรับแอดมินเท่านั้น"
          />
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              for="customer-id-camera"
              class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-medium text-white shadow-sm"
            >
              <UIcon name="bx:camera" />
              เปิดกล้องถ่ายบัตร
            </label>
            <input
              id="customer-id-camera"
              type="file"
              accept="image/*"
              capture="environment"
              class="sr-only"
              @change="onIdFileChange"
            />

            <label
              for="customer-id-upload"
              class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-default bg-white px-3 py-2 text-sm font-medium text-default shadow-sm"
            >
              <UIcon name="bx:upload" />
              เลือกรูปจากเครื่อง
            </label>
            <input
              id="customer-id-upload"
              type="file"
              accept="image/jpeg,image/png"
              class="sr-only"
              @change="onIdFileChange"
            />
          </div>
          <p class="text-xs text-muted">
            บนมือถือปุ่มกล้องจะเปิดกล้องหลังโดยอัตโนมัติ ถ้าอุปกรณ์ไม่รองรับจะ
            fallback เป็นตัวเลือกรูปภาพ
          </p>
          <img
            v-if="idPreview"
            :src="idPreview"
            alt="ID preview"
            class="max-h-56 rounded-xl border object-contain"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="idModalOpen = false"
          />
          <UButton
            :loading="uploadingId"
            :disabled="!idFile"
            icon="bx:upload"
            label="Upload / Retry"
            @click="submitIdCard"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="depositEditOpen" title="ปรับยอดมัดจำ Booking">
      <template #body>
        <div class="space-y-3">
          <UAlert
            color="warning"
            variant="soft"
            title="Manual Deposit Management"
            description="การแก้ไขยอดมัดจำต้องยืนยันอีกครั้ง และระบบจะบันทึก Staff ID พร้อมรายละเอียดลง Audit Log"
          />
          <div class="rounded-xl border border-default p-3 text-sm">
            <p class="font-medium">{{ depositEdit.documentNo }}</p>
            <p class="text-muted">
              เดิม {{ formatCurrency(depositEdit.currentAmount) }} ·
              {{ formatPaymentMethod(depositEdit.currentMethod) }} ·
              {{ depositEdit.currentStatus }}
            </p>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <UFormField label="ยอดมัดจำใหม่">
              <UInput
                v-model.number="depositEdit.newAmount"
                type="number"
                min="0"
                class="w-full"
              />
            </UFormField>
            <UFormField label="วิธีชำระเงิน">
              <select
                v-model="depositEdit.newMethod"
                class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
              >
                <option value="cash">เงินสด</option>
                <option value="qr_transfer">โอนผ่าน QR</option>
                <option value="bank_transfer">โอนบัญชี</option>
                <option value="card">บัตร</option>
                <option value="other">อื่น ๆ</option>
              </select>
            </UFormField>
          </div>
          <UTextarea
            v-model="depositEdit.notes"
            :rows="2"
            placeholder="หมายเหตุใน booking / เลขอ้างอิง"
          />
          <UTextarea
            v-model="depositAdjustmentReason"
            :rows="2"
            placeholder="เหตุผลที่ปรับยอดมัดจำ (แนะนำให้กรอกเพื่อ Audit)"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="depositEditOpen = false"
          />
          <UButton
            color="warning"
            icon="bx:check-shield"
            :loading="depositEditSaving"
            label="ยืนยันก่อนบันทึก"
            @click="requestDepositEditSave"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="depositConfirmOpen" title="ยืนยันการปรับยอดมัดจำ">
      <template #body>
        <div class="space-y-3">
          <UAlert
            color="warning"
            variant="soft"
            title="โปรดตรวจสอบก่อนบันทึก"
            description="หลังยืนยัน ระบบจะบันทึกยอดใหม่และสร้าง Audit Log พร้อม Staff ID ผู้ทำรายการ"
          />
          <div
            v-if="pendingDepositAction === 'create-booking'"
            class="rounded-xl border border-default p-3 text-sm"
          >
            <p class="font-medium">สร้าง Booking พร้อมยอดมัดจำที่ปรับเอง</p>
            <p class="text-muted">
              {{ formatCurrency(defaultDepositAmount) }} →
              {{ formatCurrency(depositPaidAmount) }}
            </p>
          </div>
          <div v-else class="rounded-xl border border-default p-3 text-sm">
            <p class="font-medium">{{ depositEdit.documentNo }}</p>
            <p class="text-muted">
              {{ formatCurrency(depositEdit.currentAmount) }} →
              {{ formatCurrency(depositEdit.newAmount) }}
            </p>
          </div>
          <UTextarea
            v-model="depositAdjustmentReason"
            :rows="2"
            placeholder="เหตุผล/หมายเหตุสำหรับ Audit Log"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="ย้อนกลับ"
            @click="depositConfirmOpen = false"
          />
          <UButton
            color="warning"
            icon="bx:check"
            label="ยืนยันและบันทึก"
            :loading="creatingBooking || depositEditSaving"
            @click="confirmDepositAction"
          />
        </div>
      </template>
    </UModal>

    <AdminOrderQrScanner
      v-model:open="isScannerOpen"
      :title="
        scannerPurpose === 'catalog'
          ? 'Scan product QR / barcode'
          : 'Scan customer QR'
      "
      :description="
        scannerPurpose === 'catalog'
          ? 'สแกน asset:<code>, sku:<code>, product:<id>, barcode หรือ Barcode จริงเพื่อค้นหา/เพิ่มสินค้า'
          : 'สแกน QR ของลูกค้า รายการเช่า หรือ booking'
      "
      @decoded="handleDecoded"
    />
  </div>
</template>
