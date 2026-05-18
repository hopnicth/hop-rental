<script setup lang="ts">
interface UserContext {
  userId: string;
  fullName: string | null;
  phone: string | null;
  kycStatus?: string | null;
}
interface BranchOption {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  isActive: boolean;
}
interface CatalogAssetItem {
  id: string;
  type: "rental" | "sale";
  nameTh: string;
  nameEn: string;
  thumbnailUrl: string | null;
  rentalMinDays: number;
  rentalMaxDays: number;
  skus: Array<{
    id: string;
    code: string;
    labelTh: string;
    dailyRate: number;
    weeklyRate: number;
    monthlyRate: number;
    depositAmount: number;
  }>;
}

interface PosBlockingBooking {
  bookingId: string;
  skuId?: string;
  assetId?: string;
  startDate: string;
  returnDate: string;
  status: string;
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
  pricingBreakdown: unknown;
  isValid: boolean;
}
interface DraftResponse {
  booking: {
    id: string;
    status: string;
    asset: {
      id: string;
      code: string | null;
      name: string;
      thumbnailUrl: string | null;
    };
    customer: {
      kind: "account" | "walk_in";
      userId: string | null;
      walkInPhone: string | null;
      bookerName: string | null;
      bookerPhone: string | null;
    };
    branch: { id: string; code: string; name: string };
    dates: {
      startDate: string;
      endDate: string;
      customerReturnDate: string;
      rentalDays: number;
    };
  };
  quote: {
    currencyCode: string;
    rentalTotalAmount: number;
    requiredSecurityDepositAmount: number;
    bookingDepositDueNow: number;
    remainingSecurityDepositDueAtPickup: number;
    estimatedPickupDueAmount: number;
  };
  payment: { bookingDepositPaymentStatus: string; paymentRequired: boolean };
  warnings: string[];
}

const props = defineProps<{ userContext: UserContext | null }>();
const emit = defineEmits<{ "draft-created": [result: DraftResponse] }>();

// Branch
const branches = ref<BranchOption[]>([]);
const branchLoading = ref(false);
const selectedBranchId = ref("");
const selectedBranch = computed(
  () => branches.value.find((b) => b.id === selectedBranchId.value) ?? null,
);

// Customer
type CustomerMode = "account" | "walk_in";
const customerMode = ref<CustomerMode>(
  props.userContext ? "account" : "walk_in",
);
const walkInPhone = ref("");
const bookerName = ref("");
watch(
  () => props.userContext,
  (ctx) => {
    if (!ctx && customerMode.value === "account")
      customerMode.value = "walk_in";
  },
);

// Asset search
const assetSearch = ref("");
const catalogItems = ref<CatalogAssetItem[]>([]);
const catalogLoading = ref(false);
const selectedAssetId = ref("");
const selectedAsset = computed(
  () => catalogItems.value.find((a) => a.id === selectedAssetId.value) ?? null,
);

// Availability / Date Selection
const bookingCalendarBlocks = ref<PosBlockingBooking[]>([]);
const bookingCalendarBlocksLoading = ref(false);
const bookingCalendarBlocksError = ref<string | null>(null);
let bookingCalendarBlockRequestId = 0;

function emptyCalendarPayload(): RentalBookingCalendarPayload {
  return {
    startDate: "",
    numDays: 0,
    returnDate: "",
    totalCost: 0,
    deposit: 0,
    dailyRate: 0,
    weeklyRate: 0,
    monthlyRate: 0,
    pricingBreakdown: {},
    isValid: false,
  };
}
const calendarPayload = ref<RentalBookingCalendarPayload>(
  emptyCalendarPayload(),
);

async function loadBookingCalendarBlocks(assetId: string) {
  if (!assetId) {
    bookingCalendarBlocks.value = [];
    return;
  }
  const requestId = ++bookingCalendarBlockRequestId;
  bookingCalendarBlocksLoading.value = true;
  bookingCalendarBlocksError.value = null;
  try {
    const res = await $fetch<{ items: PosBlockingBooking[] }>(
      "/api/admin/pos/booking-blocks",
      { query: { assetId, t: Date.now() } },
    );
    if (requestId === bookingCalendarBlockRequestId) {
      bookingCalendarBlocks.value = res.items ?? [];
    }
  } catch (err: unknown) {
    if (requestId === bookingCalendarBlockRequestId) {
      bookingCalendarBlocks.value = [];
      bookingCalendarBlocksError.value =
        err instanceof Error ? err.message : "Failed to load availability";
    }
  } finally {
    if (requestId === bookingCalendarBlockRequestId) {
      bookingCalendarBlocksLoading.value = false;
    }
  }
}

// When asset changes: clear calendar state, reload blocking bookings
watch(selectedAssetId, (newId) => {
  calendarPayload.value = emptyCalendarPayload();
  bookingCalendarBlocks.value = [];
  bookingCalendarBlocksError.value = null;
  if (newId) void loadBookingCalendarBlocks(newId);
});

// Submit
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);
const createdDraftResult = ref<DraftResponse | null>(null);

// Idempotency: generate once per form attempt; reset on material change
const idempotencyKey = ref(crypto.randomUUID());
function resetIdempotencyKey() {
  idempotencyKey.value = crypto.randomUUID();
}
watch(
  [selectedBranchId, selectedAssetId, walkInPhone, customerMode],
  resetIdempotencyKey,
);
watch(
  () =>
    calendarPayload.value.startDate + ":" + calendarPayload.value.returnDate,
  resetIdempotencyKey,
);
watch(() => props.userContext?.userId, resetIdempotencyKey);

const canSubmit = computed(() => {
  if (isSubmitting.value || !selectedBranchId.value || !selectedAssetId.value)
    return false;
  if (
    !calendarPayload.value.isValid ||
    !calendarPayload.value.startDate ||
    !calendarPayload.value.returnDate
  )
    return false;
  return customerMode.value === "account"
    ? !!props.userContext?.userId
    : !!walkInPhone.value.trim();
});

async function loadBranches() {
  branchLoading.value = true;
  try {
    const res = await $fetch<{ items: BranchOption[] }>(
      "/api/admin/pos/branches",
    );
    branches.value = res.items ?? [];
    if (!selectedBranchId.value && branches.value[0])
      selectedBranchId.value = branches.value[0].id;
  } catch {
    /* silent — staff sees empty dropdown */
  } finally {
    branchLoading.value = false;
  }
}

async function searchAssets() {
  if (!selectedBranchId.value) return;
  catalogLoading.value = true;
  try {
    const res = await $fetch<{ items: CatalogAssetItem[] }>(
      "/api/admin/pos/catalog",
      {
        query: {
          mode: "rental",
          branchId: selectedBranchId.value,
          search: assetSearch.value.trim(),
        },
      },
    );
    catalogItems.value = (res.items ?? []).filter(
      (item) => item.type === "rental",
    );
    if (!selectedAssetId.value && catalogItems.value[0])
      selectedAssetId.value = catalogItems.value[0].id;
  } catch {
    /* user sees no results */
  } finally {
    catalogLoading.value = false;
  }
}

async function submitDraft() {
  if (!canSubmit.value) return;
  isSubmitting.value = true;
  submitError.value = null;
  createdDraftResult.value = null;
  const isAccount = customerMode.value === "account";
  try {
    const result = await $fetch<DraftResponse>(
      "/api/admin/pos-v3/rental-bookings/drafts",
      {
        method: "POST",
        body: {
          idempotencyKey: idempotencyKey.value,
          branchId: selectedBranchId.value,
          assetId: selectedAssetId.value,
          startDate: calendarPayload.value.startDate,
          endDate: calendarPayload.value.returnDate,
          userId:
            isAccount && props.userContext ? props.userContext.userId : null,
          walkInPhone: !isAccount ? walkInPhone.value.trim() || null : null,
          bookerName: !isAccount ? bookerName.value.trim() || null : null,
        },
      },
    );
    createdDraftResult.value = result;
    resetIdempotencyKey();
    emit("draft-created", result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Draft creation failed";
    const code = (err as { statusCode?: number })?.statusCode;
    submitError.value = code ? `[${code}] ${msg}` : msg;
  } finally {
    isSubmitting.value = false;
  }
}

function fmt(value: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function resetForm() {
  createdDraftResult.value = null;
  submitError.value = null;
  selectedAssetId.value = "";
  catalogItems.value = [];
  calendarPayload.value = emptyCalendarPayload();
  bookingCalendarBlocks.value = [];
  bookingCalendarBlocksError.value = null;
  resetIdempotencyKey();
}

const ZERO_DUE_WARNING = "ZERO_BOOKING_DEPOSIT_CONFIRMATION_NOT_ENABLED";
const hasZeroDueWarning = computed(
  () => createdDraftResult.value?.warnings.includes(ZERO_DUE_WARNING) ?? false,
);

onMounted(() => {
  void loadBranches();
});
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Create Future Rental Booking</h2>
          <p class="text-sm text-muted">
            สร้าง Draft booking ล่วงหน้า · Staff selects asset, dates, and
            customer identity.
          </p>
        </div>
        <UBadge color="neutral" variant="soft">Draft</UBadge>
      </div>
    </template>

    <!-- ── Success summary ── -->
    <div v-if="createdDraftResult" class="space-y-4">
      <UAlert
        color="success"
        variant="soft"
        title="Draft booking created"
        :description="`Booking ID: ${createdDraftResult.booking.id} · status: draft`"
      />
      <div class="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div>
          <p class="text-muted">Asset</p>
          <p class="font-semibold">
            {{ createdDraftResult.booking.asset.name }}
          </p>
          <p class="text-xs text-muted">
            {{ createdDraftResult.booking.asset.code }}
          </p>
        </div>
        <div>
          <p class="text-muted">Customer</p>
          <p class="font-semibold">
            {{
              createdDraftResult.booking.customer.bookerName ||
              (createdDraftResult.booking.customer.kind === "account"
                ? "Account customer"
                : "Walk-in")
            }}
          </p>
          <p class="text-xs text-muted">
            {{
              createdDraftResult.booking.customer.walkInPhone ||
              createdDraftResult.booking.customer.userId ||
              "—"
            }}
          </p>
        </div>
        <div>
          <p class="text-muted">Dates</p>
          <p class="font-semibold">
            {{ createdDraftResult.booking.dates.startDate }} →
            {{ createdDraftResult.booking.dates.customerReturnDate }}
          </p>
          <p class="text-xs text-muted">
            {{ createdDraftResult.booking.dates.rentalDays }} วัน
          </p>
        </div>
        <div>
          <p class="text-muted">Booking Deposit due</p>
          <p class="font-semibold">
            {{
              fmt(
                createdDraftResult.quote.bookingDepositDueNow,
                createdDraftResult.quote.currencyCode,
              )
            }}
          </p>
          <UBadge size="sm" color="warning" variant="soft"
            >unpaid · draft</UBadge
          >
        </div>
      </div>
      <UAlert
        v-if="hasZeroDueWarning"
        color="warning"
        variant="soft"
        title="Zero Booking Deposit"
        description="Booking Deposit due = 0. Cash finalization is not enabled for this case."
      />
      <p class="text-xs text-muted">
        Cash Booking Deposit finalization will be handled in the next step.
      </p>
      <UButton icon="bx:plus" variant="soft" @click="resetForm"
        >Create another booking</UButton
      >
    </div>

    <!-- ── Draft creation form ── -->
    <div v-else class="space-y-5">
      <!-- Branch -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted">
          Branch (POS)
        </p>
        <div v-if="branchLoading" class="text-sm text-muted">
          Loading branches…
        </div>
        <select
          v-else
          v-model="selectedBranchId"
          class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm"
          :disabled="branchLoading"
        >
          <option value="" disabled>Select branch</option>
          <option
            v-for="branch in branches"
            :key="branch.id"
            :value="branch.id"
          >
            {{ branch.nameTh }} · {{ branch.code }}
          </option>
        </select>
        <p v-if="selectedBranch" class="text-xs text-muted">
          {{ selectedBranch.nameEn }}
        </p>
      </div>

      <!-- Customer -->
      <div class="space-y-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted">
          Customer
        </p>
        <div class="flex gap-2">
          <button
            v-if="userContext"
            type="button"
            class="rounded-lg border px-3 py-1.5 text-sm transition"
            :class="
              customerMode === 'account'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-default hover:bg-elevated'
            "
            @click="customerMode = 'account'"
          >
            <UIcon name="bx:user-check" class="mr-1 inline size-4" />Selected
            customer
          </button>
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-sm transition"
            :class="
              customerMode === 'walk_in'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-default hover:bg-elevated'
            "
            @click="customerMode = 'walk_in'"
          >
            <UIcon name="bx:walk" class="mr-1 inline size-4" />Walk-in
          </button>
        </div>
        <div
          v-if="customerMode === 'account' && userContext"
          class="rounded-xl border border-default bg-elevated/50 p-3"
        >
          <p class="font-semibold">{{ userContext.fullName || "—" }}</p>
          <p class="text-sm text-muted">
            {{ userContext.phone || "No phone" }} · ID: {{ userContext.userId }}
          </p>
        </div>
        <UAlert
          v-else-if="customerMode === 'account' && !userContext"
          color="warning"
          variant="soft"
          title="No resolved customer"
          description="Resolve a customer via the QR resolver above, or switch to Walk-in mode."
        />
        <div
          v-if="customerMode === 'walk_in'"
          class="grid gap-3 md:grid-cols-2"
        >
          <UFormField label="Phone" required>
            <UInput
              v-model="walkInPhone"
              icon="bx:phone"
              placeholder="0812345678"
            />
          </UFormField>
          <UFormField label="Name (optional)">
            <UInput
              v-model="bookerName"
              icon="bx:user"
              placeholder="ชื่อลูกค้า / Customer name"
            />
          </UFormField>
        </div>
      </div>

      <!-- Asset search -->
      <div class="space-y-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted">
          Rental Asset
        </p>
        <div class="flex gap-2">
          <UInput
            v-model="assetSearch"
            icon="bx:search"
            class="flex-1"
            placeholder="Search asset code / name"
            @keyup.enter="searchAssets"
          />
          <UButton
            icon="bx:search"
            :loading="catalogLoading"
            @click="searchAssets"
            >Search</UButton
          >
        </div>
        <div v-if="catalogItems.length" class="grid gap-3 md:grid-cols-2">
          <button
            v-for="item in catalogItems"
            :key="item.id"
            type="button"
            class="rounded-2xl border p-3 text-left transition"
            :class="
              item.id === selectedAssetId
                ? 'border-primary bg-primary/5'
                : 'border-default hover:bg-elevated'
            "
            @click="selectedAssetId = item.id"
          >
            <p class="font-medium text-default">
              {{ item.nameTh || item.nameEn }}
            </p>
            <p class="text-sm text-muted">
              {{ item.skus[0]?.code }} · {{ fmt(item.skus[0]?.dailyRate) }}/day
            </p>
            <p class="text-xs text-muted">
              Deposit {{ fmt(item.skus[0]?.depositAmount) }} · Min
              {{ item.rentalMinDays }} day(s)
            </p>
          </button>
        </div>
        <p
          v-else-if="!catalogLoading && assetSearch"
          class="text-sm text-muted"
        >
          No rental assets found for "{{ assetSearch }}".
        </p>
        <div
          v-if="selectedAsset"
          class="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm"
        >
          <UIcon name="bx:check-circle" class="text-primary" />
          <span class="font-medium">{{
            selectedAsset.nameTh || selectedAsset.nameEn
          }}</span>
          <span class="text-muted">{{ selectedAsset.skus[0]?.code }}</span>
        </div>
      </div>

      <!-- Availability / Date Selection -->
      <div class="space-y-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted">
          Rental Period
        </p>
        <ProductsRentalBookingCalendar
          v-if="selectedAsset"
          :asset-id="selectedAssetId"
          :blocking-bookings="bookingCalendarBlocks"
          :buffer-days="0"
          :enforce-customer-time-restriction="false"
          :min-days="selectedAsset.rentalMinDays"
          :max-days="selectedAsset.rentalMaxDays"
          :daily-rate="selectedAsset.skus[0]?.dailyRate ?? 0"
          :weekly-rate="selectedAsset.skus[0]?.weeklyRate ?? 0"
          :monthly-rate="selectedAsset.skus[0]?.monthlyRate ?? 0"
          :daily-enabled="true"
          :weekly-enabled="(selectedAsset.skus[0]?.weeklyRate ?? 0) > 0"
          :monthly-enabled="(selectedAsset.skus[0]?.monthlyRate ?? 0) > 0"
          :deposit="selectedAsset.skus[0]?.depositAmount ?? 0"
          currency-code="THB"
          :loading="bookingCalendarBlocksLoading"
          @change="calendarPayload = $event"
        />
        <UAlert
          v-else
          color="neutral"
          variant="soft"
          title="Select a rental asset first"
          description="Choose an asset above to load availability and select rental dates."
        />
        <UAlert
          v-if="bookingCalendarBlocksError"
          color="warning"
          variant="soft"
          title="Availability load error"
          :description="bookingCalendarBlocksError"
        />
      </div>

      <!-- Error -->
      <UAlert
        v-if="submitError"
        color="error"
        variant="soft"
        title="Booking draft failed"
        :description="submitError"
      />

      <!-- Submit -->
      <UButton
        icon="bx:calendar-plus"
        color="primary"
        :loading="isSubmitting"
        :disabled="!canSubmit"
        @click="submitDraft"
      >
        Create Future Booking Draft
      </UButton>
    </div>
  </UCard>
</template>
