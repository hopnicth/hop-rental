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
import type { RentalDepositPaymentMethod } from "~/types/rental-booking";

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

type PosTransactionMode = "rental" | "sale";
type ScannerPurpose = "customer" | "catalog";

const DRAFT_KEY = "hop-admin-pos-draft:v1";
const BRANCH_KEY = "hop-admin-pos-branch:v1";
const PENDING_ID_KEY = "hop-admin-pos-pending-id:v1";
const PENDING_BOOKING_KEY = "hop-admin-pos-pending-booking:v1";
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
const signature = ref<string | null>(null);
const fulfillmentNotes = ref("");

const draft = reactive({ phone: "", fullName: "", notes: "" });
const idModalOpen = ref(false);
const idFile = ref<File | null>(null);
const idPreview = ref<string | null>(null);
const uploadingId = ref(false);
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
const cancellingHistoryKey = ref<string | null>(null);
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

const transactionModeTabs = [
  { label: "เช่า (Rental)", value: "rental", icon: "bx:calendar-check" },
  { label: "ขายขาด", value: "sale", icon: "bx:receipt" },
];

const PRODUCT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='24' fill='%23f1f5f9'/%3E%3Cpath d='M40 112h80L98 84 82 101 68 72z' fill='%23cbd5e1'/%3E%3Ccircle cx='104' cy='54' r='12' fill='%23cbd5e1'/%3E%3C/svg%3E";

const depositProofFileName = computed(
  () => depositProofFile.value?.name ?? "ยังไม่ได้แนบหลักฐานมัดจำ",
);

const customer = computed(() => lookup.value?.customer ?? null);
const idCardMissing = computed(() => !customer.value?.idCardUrl);
const requiresIdCardForCheckout = computed(
  () => transactionMode.value === "rental" && idCardMissing.value,
);
const activeBookings = computed(() => lookup.value?.bookings ?? []);
const pickupCandidates = computed(() =>
  activeBookings.value.filter((b) => b.status === "confirmed"),
);
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
const rentalCheckoutTotal = computed(
  () => (bookingPricing.value?.total ?? 0) + rentalDepositPaidAmount.value,
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
  if (!start || !end) return 0;
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000),
  );
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

watch(draft, persistDraft, { deep: true });
onMounted(() => {
  restoreDraft();
  void ensureProfileLoaded(null, { force: true });
  void loadBranches();
  void loadCatalog();
  void loadPosHistory();
  window.addEventListener("online", () => (isOnline.value = true));
  window.addEventListener("offline", () => (isOnline.value = false));
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
});

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

async function lookupCustomer(term = search.value) {
  if (!term.trim()) return;
  loading.value = true;
  try {
    lookup.value = await $fetch<LookupResponse>("/api/admin/customers/lookup", {
      query: { search: term.trim() },
    });
    selectedBooking.value = lookup.value.bookings[0] ?? null;
    if (
      transactionMode.value === "rental" &&
      lookup.value.customer &&
      !lookup.value.customer.idCardUrl
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

async function applyFulfillment(eventType: "pickup" | "return") {
  const booking = selectedBooking.value;
  if (!booking) return;
  if (eventType === "pickup" && !signature.value) {
    toast.add({ title: "กรุณาให้ลูกค้าเซ็นรับของก่อน", color: "warning" });
    return;
  }
  const previous = booking.status;
  booking.status = eventType === "pickup" ? "picked_up" : "returned";
  progress.value = true;
  try {
    const detail = await $fetch<AdminRentalBookingDetail>(
      `/api/admin/rental-bookings/${booking.id}/fulfillment`,
      {
        method: "POST",
        body: {
          eventType,
          signatureDataUrl: signature.value,
          notes: fulfillmentNotes.value,
        },
      },
    );
    booking.status = detail.status;
    toast.add({
      title: eventType === "pickup" ? "Pickup complete" : "Return complete",
      color: "success",
    });
    signature.value = null;
  } catch {
    booking.status = previous;
    localStorage.setItem(
      `hop-admin-fulfillment-retry:${booking.id}`,
      JSON.stringify({
        eventType,
        notes: fulfillmentNotes.value,
        signature: signature.value,
        createdAt: new Date().toISOString(),
      }),
    );
    toast.add({
      title: "API ช้า/เน็ตไม่เสถียร",
      description: "บันทึกงานไว้ในเครื่องแล้ว กรุณา Retry ภายหลัง",
      color: "warning",
    });
  } finally {
    progress.value = false;
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
    await loadPosHistory();
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
    await loadPosHistory();
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
          :to="accountingExportUrl"
          target="_blank"
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
            <tr v-else-if="!posHistory?.items.length">
              <td colspan="8" class="px-3 py-6 text-center text-muted">
                ไม่พบรายการ POS ในวันที่เลือก
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="item in posHistory?.items ?? []"
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
            </div>
            <UButton
              v-if="transactionMode === 'rental' && idCardMissing"
              color="warning"
              icon="bx:id-card"
              label="เพิ่มข้อมูลบัตร"
              @click="idModalOpen = true"
            />
            <UButton
              v-else-if="transactionMode === 'rental'"
              :to="customer.idCardUrl || undefined"
              target="_blank"
              color="success"
              variant="soft"
              icon="bx:check-shield"
              label="มีบัตรประชาชนแล้ว"
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
              :loading="creatingBooking"
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

        <div :class="['space-y-3 rounded-xl border p-3', modeAccentClass]">
          <AdminPosTotalSummary
            :mode="transactionMode"
            :rental-days="bookingDays"
            :rental-subtotal="bookingPricing?.total ?? null"
            :rental-checkout-total="rentalCheckoutTotal"
            :default-deposit-amount="defaultDepositAmount"
            :current-deposit-amount="depositPaidAmount"
            :is-deposit-adjusted="isRentalDepositAdjusted"
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
            ต้องบันทึกบัตรประชาชนก่อนสร้าง/รับรายการเช่าหน้าร้าน
          </p>
        </div>
      </div>
    </UCard>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard>
        <template #header
          ><h3 class="font-semibold">4) Pre-booked Pick-list</h3></template
        >
        <div v-if="activeBookings.length" class="space-y-2">
          <button
            v-for="booking in activeBookings"
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
        <p v-else class="text-sm text-muted">
          ไม่มีรายการจองล่วงหน้าสำหรับลูกค้านี้
        </p>
      </UCard>

      <UCard>
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
                  selectedBooking.depositAmount,
                  selectedBooking.currencyCode,
                )
              }}
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
          <DigitalSignaturePad
            v-if="pickupCandidates.some((b) => b.id === selectedBooking?.id)"
            v-model="signature"
          />
          <div class="flex flex-wrap gap-2">
            <UButton
              :disabled="
                selectedBooking.status !== 'confirmed' || idCardMissing
              "
              color="primary"
              icon="bx:package"
              label="Confirm Pickup"
              @click="applyFulfillment('pickup')"
            />
            <UButton
              :disabled="selectedBooking.status !== 'picked_up'"
              color="success"
              icon="bx:undo"
              label="Confirm Return"
              @click="applyFulfillment('return')"
            />
            <UButton
              variant="ghost"
              color="neutral"
              :to="`/admin/rental-bookings/${selectedBooking.id}`"
              label="เปิด Detail"
            />
          </div>
        </div>
        <p v-else class="text-sm text-muted">เลือกรายการจาก Pick-list ก่อน</p>
      </UCard>
    </div>

    <UModal v-model:open="idModalOpen" title="บันทึกข้อมูลบัตรประชาชน">
      <template #body>
        <div class="space-y-3">
          <UAlert
            color="warning"
            variant="soft"
            title="ต้องมีรูปบัตรประชาชนก่อนทำ Pickup"
            description="ไฟล์จะถูกเก็บใน catalog-media/customer-ids/ และผูกกับ Profile หรือเบอร์ Walk-in"
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
              accept="image/jpeg,image/png,image/webp"
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
