<script setup lang="ts">
import AdminPosV3ModeNav from "~/components/admin/pos/AdminPosV3ModeNav.vue";
import AdminPosV3ResolverPanel from "~/components/admin/pos/AdminPosV3ResolverPanel.vue";
import AdminPosV3PendingWorkList from "~/components/admin/pos/AdminPosV3PendingWorkList.vue";
import AdminPosV3BookingContext from "~/components/admin/pos/AdminPosV3BookingContext.vue";
import AdminPosV3OrderContext from "~/components/admin/pos/AdminPosV3OrderContext.vue";
import AdminPosV3FutureBookingDraftContainer from "~/components/admin/pos/AdminPosV3FutureBookingDraftContainer.vue";
import AdminPosV3FutureBookingDepositCashContainer from "~/components/admin/pos/AdminPosV3FutureBookingDepositCashContainer.vue";
import type {
  AdminRentalBookingRow,
  AdminSaleOrderQueueResponse,
  AdminSaleOrderQueueRow,
} from "~/types/admin-order";
import type {
  AdminCustomerProfile,
  AdminRentalBookingDetail,
  AdminSaleOrderDetail,
} from "~/types/admin-order-detail";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type AdminPosV3Mode = "sale" | "booking" | "kyc";
type ScannerKind =
  | "order"
  | "booking"
  | "customer"
  | "asset"
  | "sku"
  | "product"
  | "barcode"
  | "unknown";
type NoticeColor = "info" | "warning" | "error" | "success" | "neutral";
interface ResolverNotice {
  color: NoticeColor;
  title: string;
  description?: string;
}
interface CustomerLookupResponse {
  customer: (AdminCustomerProfile & { kind: "account" | "walk_in" }) | null;
  bookings: AdminRentalBookingRow[];
}
interface UserContext {
  userId: string;
  fullName: string | null;
  phone: string | null;
  kycStatus?: string | null;
}
interface PosV2ReadinessResponse {
  readiness: Record<string, unknown>;
}
interface PickupReadinessPreview {
  readiness?: { classification?: string; canProceedToPickup?: boolean };
  moneySummary?: { pickupDue?: { totalPickupDueAmount?: number } };
}
interface AdminPosV3PendingWorkItem {
  kind: "order" | "booking";
  id: string;
  reference: string;
  status: string;
  secondary: string;
}
interface PendingWorkItem extends AdminPosV3PendingWorkItem {
  sortAt: string;
  booking?: AdminRentalBookingRow;
  order?: AdminSaleOrderQueueRow;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activeMode = ref<AdminPosV3Mode>("booking");
const resolverNotice = ref<ResolverNotice | null>(null);
const lastResolved = ref<string | null>(null);

const userContext = ref<UserContext | null>(null);
const pendingItems = ref<PendingWorkItem[]>([]);
const pendingLoading = ref(false);
const pendingError = ref<string | null>(null);

const bookingContext = ref<AdminRentalBookingDetail | null>(null);
const bookingReadiness = ref<PickupReadinessPreview | null>(null);
const bookingReadinessError = ref<string | null>(null);
const bookingLoading = ref(false);
const bookingError = ref<string | null>(null);

const orderQueueContext = ref<AdminSaleOrderQueueRow | null>(null);
const orderDetail = ref<AdminSaleOrderDetail | null>(null);
const orderLoading = ref(false);
const orderError = ref<string | null>(null);

// Container 1 — Future Booking Draft result (drives Container 2 mount)
const latestDraftResult = ref<any>(null);
function handleDraftCreated(result: unknown) {
  latestDraftResult.value = result;
}

// Container 1 — Same-Day Rental intent (preserved for future Same-Day Rental flow)
// This is separate from latestDraftResult and must NOT trigger Container 2.
const latestSameDayIntent = ref<unknown>(null);
function handleSameDayIntent(payload: unknown) {
  latestSameDayIntent.value = payload;
}

// Container 2 — Confirmed Future Booking result (stored for future routing/display)
const latestConfirmedFutureBookingResult = ref<unknown>(null);
function handleBookingConfirmed(result: unknown) {
  latestConfirmedFutureBookingResult.value = result;
}

const resolverBusy = computed(
  () => pendingLoading.value || bookingLoading.value || orderLoading.value,
);
const cleanInitialState = computed(
  () =>
    !userContext.value &&
    !bookingContext.value &&
    !orderQueueContext.value &&
    !bookingLoading.value &&
    !orderLoading.value,
);

function normalizeBookingInput(value: string) {
  return value
    .trim()
    .replace(/^booking:/i, "")
    .trim();
}
function normalizeUserInput(value: string) {
  return value
    .trim()
    .replace(/^customer:/i, "")
    .trim();
}
function isUuidLike(value: string) {
  return UUID_RE.test(value.trim());
}
function clearUserContext() {
  userContext.value = null;
  pendingItems.value = [];
  pendingError.value = null;
}
function clearBookingContext() {
  bookingContext.value = null;
  bookingReadiness.value = null;
  bookingReadinessError.value = null;
  bookingError.value = null;
}
function clearOrderContext() {
  orderQueueContext.value = null;
  orderDetail.value = null;
  orderError.value = null;
}
function clearAllContexts() {
  clearUserContext();
  clearBookingContext();
  clearOrderContext();
}

function bookingTitle(row: AdminRentalBookingRow) {
  return row.assetName || row.productName || row.id;
}
function bookingSecondary(row: AdminRentalBookingRow) {
  return `${bookingTitle(row)} · ${row.startDate || "—"} → ${row.endDate || "—"} · ${row.hubName || row.storageBranchName || "No branch"}`;
}
function orderSecondary(row: AdminSaleOrderQueueRow) {
  return `${row.pickupBranch?.name || "Pickup branch not set"} · ${row.itemCount} items · ${row.currencyCode} ${row.grandTotal}`;
}
function sortTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}
function comparePendingWork(a: PendingWorkItem, b: PendingWorkItem) {
  const byPickupDate = sortTimestamp(a.sortAt) - sortTimestamp(b.sortAt);
  if (byPickupDate !== 0) return byPickupDate;
  const byKind = a.kind.localeCompare(b.kind);
  if (byKind !== 0) return byKind;
  const byReference = a.reference.localeCompare(b.reference);
  if (byReference !== 0) return byReference;
  return a.id.localeCompare(b.id);
}
function buildPendingItems(
  bookings: AdminRentalBookingRow[],
  orders: AdminSaleOrderQueueRow[],
): PendingWorkItem[] {
  const activeBookings = bookings.filter((booking) =>
    ["confirmed", "picked_up"].includes(booking.status),
  );
  return [
    ...activeBookings.map((booking) => ({
      kind: "booking" as const,
      id: booking.id,
      reference: booking.id,
      status: booking.status,
      secondary: bookingSecondary(booking),
      sortAt: booking.startDate,
      booking,
    })),
    ...orders.map((order) => ({
      kind: "order" as const,
      id: order.id,
      reference: order.orderNumber,
      status: `${order.paymentStatus} / ${order.fulfillmentStatus}`,
      secondary: orderSecondary(order),
      // Sale pickup queue rows do not expose a true pickup date yet.
      // Use order creation time as the deterministic pickup-order fallback.
      sortAt: order.createdAt,
      order,
    })),
  ].sort(comparePendingWork);
}

async function loadBookingContext(
  rawValue: string,
  options: { clearUser?: boolean } = { clearUser: true },
) {
  const bookingId = normalizeBookingInput(rawValue);
  if (!bookingId) {
    resolverNotice.value = {
      color: "warning",
      title: "Invalid booking input",
      description: "Enter a booking ID or booking:<id>.",
    };
    return;
  }
  if (options.clearUser) clearUserContext();
  clearOrderContext();
  bookingLoading.value = true;
  bookingError.value = null;
  bookingReadiness.value = null;
  bookingReadinessError.value = null;
  try {
    const detail = await $fetch<AdminRentalBookingDetail>(
      `/api/admin/rental-bookings/${encodeURIComponent(bookingId)}`,
    );
    bookingContext.value = detail;
    lastResolved.value = `booking: ${detail.id}`;
    resolverNotice.value = {
      color: "success",
      title: "Booking resolved",
      description: detail.id,
    };
    if (detail.status === "confirmed") {
      try {
        const response = await $fetch<PosV2ReadinessResponse>(
          `/api/admin/pos-v2/rental-bookings/${encodeURIComponent(detail.id)}/pickup-readiness`,
        );
        bookingReadiness.value = response.readiness as PickupReadinessPreview;
      } catch {
        bookingReadinessError.value =
          "Pickup readiness preview is unavailable for this booking.";
      }
    }
  } catch (error) {
    clearBookingContext();
    bookingError.value = "Booking context could not be loaded.";
    resolverNotice.value = {
      color: "error",
      title: "Booking not found or unavailable",
      description: error instanceof Error ? error.message : undefined,
    };
  } finally {
    bookingLoading.value = false;
  }
}

async function loadUserPendingWork(rawValue: string) {
  const userId = normalizeUserInput(rawValue);
  if (!userId || !isUuidLike(userId)) {
    clearAllContexts();
    resolverNotice.value = {
      color: "warning",
      title: "Invalid user input",
      description:
        "Use customer:<userId> or a UUID user ID. Phone QR lookup belongs to a later KYC/search phase.",
    };
    return;
  }
  clearBookingContext();
  clearOrderContext();
  clearUserContext();
  pendingLoading.value = true;
  try {
    const [lookup, orderQueue] = await Promise.all([
      $fetch<CustomerLookupResponse>("/api/admin/customers/lookup", {
        query: { userId },
      }),
      $fetch<AdminSaleOrderQueueResponse>("/api/admin/orders/queue", {
        query: { queue: "pickup", search: userId, pageSize: 20 },
      }),
    ]);
    const combined = buildPendingItems(
      lookup.bookings ?? [],
      orderQueue.items ?? [],
    );
    if (!lookup.customer && combined.length === 0) {
      resolverNotice.value = {
        color: "warning",
        title: "User lookup not found",
        description: userId,
      };
      return;
    }
    userContext.value = {
      userId,
      fullName:
        lookup.customer?.fullName ??
        orderQueue.items?.[0]?.customer.name ??
        null,
      phone:
        lookup.customer?.phone ?? orderQueue.items?.[0]?.customer.phone ?? null,
      kycStatus: lookup.customer?.kycStatus ?? null,
    };
    pendingItems.value = combined;
    lastResolved.value = `customer: ${userId}`;
    resolverNotice.value = {
      color: "success",
      title: "User context resolved",
      description: `${combined.length} pending operational item(s).`,
    };
  } catch (error) {
    pendingError.value = "Pending work could not be loaded.";
    resolverNotice.value = {
      color: "error",
      title: "User pending work failed",
      description: error instanceof Error ? error.message : undefined,
    };
  } finally {
    pendingLoading.value = false;
  }
}

async function loadOrderContext(item: PendingWorkItem) {
  clearBookingContext();
  orderQueueContext.value = item.order ?? null;
  orderDetail.value = null;
  orderError.value = null;
  orderLoading.value = true;
  try {
    orderDetail.value = await $fetch<AdminSaleOrderDetail>(
      `/api/admin/orders/${encodeURIComponent(item.id)}`,
    );
    lastResolved.value = `order: ${orderDetail.value.orderNumber}`;
  } catch {
    orderError.value =
      "Order detail is unavailable; showing queue context only.";
  } finally {
    orderLoading.value = false;
  }
}

function handlePendingSelect(item: AdminPosV3PendingWorkItem) {
  const source = pendingItems.value.find(
    (candidate) => candidate.kind === item.kind && candidate.id === item.id,
  );
  if (!source) return;
  if (source.kind === "booking")
    void loadBookingContext(source.id, { clearUser: false });
  else void loadOrderContext(source);
}

function handleScannerDecoded(payload: {
  raw: string;
  kind: ScannerKind;
  value: string;
}) {
  const value = payload.value || payload.raw;
  if (payload.kind === "booking") {
    void loadBookingContext(value, { clearUser: true });
    return;
  }
  if (payload.kind === "customer") {
    if (isUuidLike(value)) {
      void loadUserPendingWork(value);
      return;
    }
    clearAllContexts();
    resolverNotice.value = {
      color: "warning",
      title: "Customer phone QR is not supported yet",
      description:
        "Use a User QR with customer:<userId>. Phone/walk-in search belongs to a later KYC phase.",
    };
    return;
  }
  clearAllContexts();
  resolverNotice.value = {
    color: "warning",
    title: "Unsupported POS V3 payload",
    description: payload.raw,
  };
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
      <UCard class="border-primary/30 bg-primary/5">
        <div class="space-y-4">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-[0.2em] text-primary"
            >
              HOPNIC POS V3
            </p>
            <h1 class="text-2xl font-semibold text-default">
              Operational Entry Shell
            </h1>
            <p class="mt-1 text-sm text-muted">
              Start from scan/search, resolve the work context, then hand off to
              the right operational section.
            </p>
          </div>
          <AdminPosV3ModeNav v-model="activeMode" />
          <UAlert
            color="info"
            variant="soft"
            title="Phase 1 scope"
            description="Shell, QR resolver, pending work list, and booking/order context handoff only. Completion, sale checkout, KYC, and fiscal workflows are not implemented here."
          />
        </div>
      </UCard>

      <AdminPosV3ResolverPanel
        :loading="resolverBusy"
        :last-resolved="lastResolved"
        :notice="resolverNotice"
        @resolve-booking="loadBookingContext($event, { clearUser: true })"
        @resolve-user="loadUserPendingWork"
        @scanner-decoded="handleScannerDecoded"
      />
    </div>

    <AdminPosV3PendingWorkList
      v-if="userContext"
      :user="userContext"
      :items="pendingItems"
      :loading="pendingLoading"
      :error="pendingError"
      @select="handlePendingSelect"
    />

    <AdminPosV3BookingContext
      v-if="bookingContext || bookingLoading || bookingError"
      :booking="bookingContext"
      :readiness="bookingReadiness"
      :loading="bookingLoading"
      :error="bookingError"
      :readiness-error="bookingReadinessError"
    />

    <AdminPosV3OrderContext
      v-if="orderQueueContext || orderDetail || orderLoading || orderError"
      :queue-row="orderQueueContext"
      :detail="orderDetail"
      :loading="orderLoading"
      :error="orderError"
    />

    <UAlert
      v-if="cleanInitialState"
      color="neutral"
      variant="soft"
      title="Ready to scan"
      description="No user pending list, booking context, or order context is shown until a booking or user payload is resolved."
    />

    <!-- Container 1: Future Booking Draft Creation (Booking mode only) -->
    <AdminPosV3FutureBookingDraftContainer
      v-if="activeMode === 'booking'"
      :user-context="userContext"
      @draft-created="handleDraftCreated"
      @same-day-rental-intent="handleSameDayIntent"
    />

    <!-- Container 2: Future Booking Cash Deposit Finalization
         Mounts only when a future draft exists. Never mounts for same-day intents. -->
    <AdminPosV3FutureBookingDepositCashContainer
      v-if="activeMode === 'booking' && latestDraftResult !== null"
      :draft-result="latestDraftResult"
      @booking-confirmed="handleBookingConfirmed"
    />
  </div>
</template>
