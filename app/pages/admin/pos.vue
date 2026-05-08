<script setup lang="ts">
import AdminOrderQrScanner from "~/components/admin/AdminOrderQrScanner.vue";
import DigitalSignaturePad from "~/components/admin/DigitalSignaturePad.vue";
import type { AdminRentalBookingRow } from "~/types/admin-order";
import type {
  AdminCustomerProfile,
  AdminRentalBookingDetail,
} from "~/types/admin-order-detail";
import { decomposeRentalDuration } from "~/utils/rental-pricing";
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
  labelTh: string;
  labelEn: string;
  imageUrl: string | null;
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

const DRAFT_KEY = "hop-admin-pos-draft:v1";
const PENDING_ID_KEY = "hop-admin-pos-pending-id:v1";
const PENDING_BOOKING_KEY = "hop-admin-pos-pending-booking:v1";
const toast = useToast();

const isScannerOpen = ref(false);
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
const catalogSearch = ref("");
const catalogLoading = ref(false);
const catalogProducts = ref<PosCatalogProduct[]>([]);
const selectedProductId = ref("");
const selectedSkuId = ref("");
const bookingStartDate = ref(toDateInputValue(new Date()));
const bookingEndDate = ref(toDateInputValue(addDays(new Date(), 1)));
const depositPaidAmount = ref(0);
const depositPaymentMethod = ref<RentalDepositPaymentMethod>("cash");
const depositNotes = ref("");
const depositProofFile = ref<File | null>(null);
const depositProofPreview = ref<string | null>(null);
const creatingBooking = ref(false);
const hasPendingBookingDraft = ref(false);

const depositProofFileName = computed(
  () => depositProofFile.value?.name ?? "ยังไม่ได้แนบหลักฐานมัดจำ",
);

const customer = computed(() => lookup.value?.customer ?? null);
const idCardMissing = computed(() => !customer.value?.idCardUrl);
const activeBookings = computed(() => lookup.value?.bookings ?? []);
const pickupCandidates = computed(() =>
  activeBookings.value.filter((b) => b.status === "confirmed"),
);
const returnCandidates = computed(() =>
  activeBookings.value.filter((b) => b.status === "picked_up"),
);
const selectedProduct = computed(
  () =>
    catalogProducts.value.find((p) => p.id === selectedProductId.value) ?? null,
);
const selectedSku = computed(
  () =>
    selectedProduct.value?.skus.find((s) => s.id === selectedSkuId.value) ??
    null,
);
const customerPhone = computed(
  () => customer.value?.phone || draft.phone || search.value.trim(),
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
const canCreateBooking = computed(
  () =>
    Boolean(customerPhone.value) &&
    Boolean(selectedProduct.value) &&
    Boolean(selectedSku.value) &&
    bookingDays.value > 0 &&
    !creatingBooking.value,
);

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
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
  void loadCatalog();
  window.addEventListener("online", () => (isOnline.value = true));
  window.addEventListener("offline", () => (isOnline.value = false));
});

watch(selectedProductId, () => {
  selectedSkuId.value = selectedProduct.value?.skus[0]?.id ?? "";
});

watch(selectedSku, (sku) => {
  if (sku) depositPaidAmount.value = sku.depositAmount;
});

function formatCurrency(value: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency }).format(
    value,
  );
}

function bookingTitle(booking: AdminRentalBookingRow) {
  return booking.assetName || booking.productName || booking.id;
}

async function loadCatalog() {
  catalogLoading.value = true;
  try {
    const response = await $fetch<PosCatalogResponse>(
      "/api/admin/pos/catalog",
      {
        query: catalogSearch.value.trim()
          ? { search: catalogSearch.value.trim() }
          : {},
      },
    );
    catalogProducts.value = response.items;
    if (!selectedProductId.value && response.items[0]) {
      selectedProductId.value = response.items[0].id;
      selectedSkuId.value = response.items[0].skus[0]?.id ?? "";
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

async function lookupCustomer(term = search.value) {
  if (!term.trim()) return;
  loading.value = true;
  try {
    lookup.value = await $fetch<LookupResponse>("/api/admin/customers/lookup", {
      query: { search: term.trim() },
    });
    selectedBooking.value = lookup.value.bookings[0] ?? null;
    if (lookup.value.customer && !lookup.value.customer.idCardUrl)
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
  kind: "order" | "booking" | "customer" | "unknown";
  value: string;
  raw: string;
}) {
  if (payload.kind === "booking") {
    navigateTo(`/admin/rental-bookings/${payload.value}`);
    return;
  }
  search.value = payload.value || payload.raw;
  void lookupCustomer(search.value);
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
  } catch (e) {
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
  } catch (e) {
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
  fd.append("amount", String(depositPaidAmount.value));
  fd.append("paymentMethod", depositPaymentMethod.value);
  if (depositNotes.value) fd.append("notes", depositNotes.value);
  await $fetch(`/api/admin/rental-bookings/${bookingId}/deposit-proof`, {
    method: "POST",
    body: fd,
  });
}

async function createPosBooking() {
  if (!canCreateBooking.value || !selectedProduct.value || !selectedSku.value)
    return;
  const phone = customerPhone.value;
  const payload = {
    userId: customer.value?.kind === "account" ? customer.value.userId : null,
    walkInPhone: phone,
    bookerName: customer.value?.fullName || draft.fullName,
    bookerPhone: phone,
    productId: selectedProduct.value.id,
    skuId: selectedSku.value.id,
    startDate: bookingStartDate.value,
    endDate: bookingEndDate.value,
    depositPaidAmount: depositPaidAmount.value,
    depositPaymentMethod: depositPaymentMethod.value,
    depositPaymentStatus: depositPaidAmount.value > 0 ? "paid" : "unpaid",
    depositNotes: depositNotes.value,
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
    localStorage.removeItem(PENDING_BOOKING_KEY);
    hasPendingBookingDraft.value = false;
    toast.add({ title: "สร้างรายการเช่าจาก POS แล้ว", color: "success" });
  } catch (e) {
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
      <div class="flex gap-2">
        <UBadge :color="isOnline ? 'success' : 'warning'" variant="soft">{{
          isOnline ? "Online" : "Offline draft mode"
        }}</UBadge>
        <UButton
          icon="bx:qr-scan"
          label="Scan QR"
          @click="isScannerOpen = true"
        />
      </div>
    </div>

    <UProgress v-if="progress" animation="carousel" />

    <div class="grid gap-4 lg:grid-cols-3">
      <UCard class="lg:col-span-1">
        <template #header
          ><h3 class="font-semibold">
            1) Customer lookup / New walk-in
          </h3></template
        >
        <div class="space-y-3">
          <UFormField label="เบอร์โทรศัพท์ หรือ Customer ID">
            <UInput
              v-model="search"
              icon="bx:search"
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

          <div class="border-t border-default pt-3">
            <p class="mb-2 text-sm font-medium">ลูกค้าใหม่ (ไม่มี Account)</p>
            <UFormField label="เบอร์โทรศัพท์ (Primary Key)"
              ><UInput v-model="draft.phone"
            /></UFormField>
            <UFormField label="ชื่อ-นามสกุล"
              ><UInput v-model="draft.fullName"
            /></UFormField>
            <UFormField label="หมายเหตุ"
              ><UTextarea v-model="draft.notes" :rows="2"
            /></UFormField>
            <UButton
              class="mt-2"
              block
              variant="soft"
              icon="bx:id-card"
              label="ถ่าย/อัปโหลดบัตรประชาชน"
              @click="idModalOpen = true"
            />
            <UButton
              v-if="hasPendingIdDraft"
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

      <UCard class="lg:col-span-2">
        <template #header
          ><h3 class="font-semibold">2) Customer & ID check</h3></template
        >
        <div v-if="customer" class="space-y-3">
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
              v-if="idCardMissing"
              color="warning"
              icon="bx:id-card"
              label="เพิ่มข้อมูลบัตร"
              @click="idModalOpen = true"
            />
            <UButton
              v-else
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
          color="info"
          variant="soft"
          title="ยังไม่ได้เลือกลูกค้า"
          description="ค้นหาด้วยเบอร์โทรศัพท์หรือสแกน QR จากหน้าโปรไฟล์/รายการเช่าของลูกค้า"
        />
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">3) สร้างรายการเช่าใหม่จาก POS</h3>
            <p class="text-sm text-muted">
              เลือกสินค้า/SKU, วันที่เช่า และบันทึกเงินมัดจำพร้อมหลักฐาน
            </p>
          </div>
          <UButton
            v-if="hasPendingBookingDraft"
            color="warning"
            variant="soft"
            icon="bx:refresh"
            label="Retry booking draft"
            @click="retryPendingBookingDraft"
          />
        </div>
      </template>

      <div class="grid gap-4 xl:grid-cols-3">
        <div class="space-y-3 xl:col-span-2">
          <div class="flex gap-2">
            <UInput
              v-model="catalogSearch"
              icon="bx:search"
              placeholder="ค้นหาสินค้า / SKU"
              @keyup.enter="loadCatalog"
            />
            <UButton
              :loading="catalogLoading"
              icon="bx:refresh"
              label="ค้นหา"
              @click="loadCatalog"
            />
          </div>

          <UAlert
            v-if="!catalogLoading && catalogProducts.length === 0"
            color="warning"
            variant="soft"
            title="ยังไม่มี Asset ที่พร้อมเช่าใน POS"
            description="POS จะแสดงเฉพาะ Asset ที่สถานะ Active, ไม่ถูกซ่อน, เปิด Daily rate และมีราคาเช่ารายวันมากกว่า 0 บาท"
          />

          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="สินค้า">
              <select
                v-model="selectedProductId"
                class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
              >
                <option value="" disabled>เลือกสินค้า</option>
                <option
                  v-for="product in catalogProducts"
                  :key="product.id"
                  :value="product.id"
                >
                  {{ product.nameTh }}
                  {{ product.brand ? `· ${product.brand}` : "" }}
                </option>
              </select>
            </UFormField>

            <UFormField label="SKU / Variant">
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
                  {{ sku.labelTh }} · {{ formatCurrency(sku.dailyRate) }}/วัน
                </option>
              </select>
            </UFormField>

            <UFormField label="วันที่เริ่มเช่า">
              <UInput v-model="bookingStartDate" type="date" />
            </UFormField>
            <UFormField label="วันที่คืนสินค้า">
              <UInput v-model="bookingEndDate" type="date" />
            </UFormField>
          </div>
        </div>

        <div class="space-y-3 rounded-xl border border-default p-3">
          <div>
            <p class="text-sm font-medium">ราคาเช่าอัตโนมัติ</p>
            <p class="text-xs text-muted">
              ใช้ logic tier day/week/month เดียวกับหน้าจองของลูกค้า
            </p>
          </div>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between">
              <span class="text-muted">จำนวนวัน</span>
              <span class="font-medium">{{ bookingDays || "—" }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">ยอดค่าเช่า</span>
              <span class="font-semibold">
                {{
                  bookingPricing ? formatCurrency(bookingPricing.total) : "—"
                }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">มัดจำตาม SKU</span>
              <span class="font-semibold">
                {{
                  selectedSku ? formatCurrency(selectedSku.depositAmount) : "—"
                }}
              </span>
            </div>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            <UFormField label="รับมัดจำจริง">
              <UInput
                v-model.number="depositPaidAmount"
                type="number"
                min="0"
              />
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
          <UFormField label="หลักฐานมัดจำ">
            <div class="space-y-2">
              <div class="grid gap-2 sm:grid-cols-2">
                <label
                  for="deposit-proof-camera"
                  class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-medium text-white shadow-sm"
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
            :rows="2"
            placeholder="หมายเหตุเงินมัดจำ / เลขอ้างอิงสลิป"
          />
          <UButton
            block
            color="primary"
            icon="bx:plus-circle"
            :loading="creatingBooking"
            :disabled="!canCreateBooking || idCardMissing"
            label="สร้าง Booking และบันทึกมัดจำ"
            @click="createPosBooking"
          />
          <p v-if="idCardMissing" class="text-xs text-warning">
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

    <AdminOrderQrScanner
      v-model:open="isScannerOpen"
      @decoded="handleDecoded"
    />
  </div>
</template>
