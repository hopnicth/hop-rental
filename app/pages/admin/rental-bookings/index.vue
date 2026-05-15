<script setup lang="ts">
import type {
  AdminFlatRentalListResponse,
  AdminRentalBookingRow,
} from "~/types/admin-order";
import type { RentalBookingStatus } from "~/types/rental-booking";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type StatusFilter = "" | RentalBookingStatus;
type BadgeColor =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "error"
  | "primary";

const search = ref("");
const statusFilter = ref<StatusFilter>("");
const bookings = ref<AdminRentalBookingRow[]>([]);
const total = ref(0);
const page = ref(0);
const pageSize = ref(20);
const hasMore = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

const statusTabs: Array<{ label: string; value: StatusFilter }> = [
  { label: "ทั้งหมด", value: "" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Picked up", value: "picked_up" },
  { label: "No-show", value: "no_show" },
  { label: "Returned", value: "returned" },
  { label: "Cancelled", value: "cancelled" },
];

const visibleStart = computed(() =>
  total.value === 0 ? 0 : page.value * pageSize.value + 1,
);
const visibleEnd = computed(() =>
  Math.min(total.value, page.value * pageSize.value + bookings.value.length),
);

async function loadBookings(targetPage = page.value): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const res = await $fetch<AdminFlatRentalListResponse>(
      "/api/admin/rental-bookings",
      {
        query: {
          page: targetPage,
          pageSize: pageSize.value,
          search: search.value || undefined,
          rentalStatus: statusFilter.value || undefined,
        },
      },
    );
    bookings.value = res.items;
    total.value = res.total;
    page.value = res.page;
    pageSize.value = res.pageSize;
    hasMore.value = res.hasMore;
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to load rental bookings";
  } finally {
    loading.value = false;
  }
}

function setStatus(value: StatusFilter): void {
  statusFilter.value = value;
  void loadBookings(0);
}

function resetFilters(): void {
  search.value = "";
  statusFilter.value = "";
  void loadBookings(0);
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function statusColor(status: RentalBookingStatus): BadgeColor {
  if (status === "confirmed") return "primary";
  if (status === "picked_up") return "info";
  if (status === "returned") return "success";
  if (status === "no_show") return "error";
  if (status === "cancelled") return "neutral";
  return "warning";
}

function depositColor(status: string): BadgeColor {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  if (status === "refunded") return "neutral";
  return "info";
}

function formatDate(value: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("th-TH", { dateStyle: "medium" });
}

function formatCurrency(value: number, currency = "THB"): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
  }).format(value);
}

onMounted(() => void loadBookings(0));
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-primary">
          Booking manager
        </p>
        <h2 class="text-2xl font-bold">Rental bookings</h2>
        <p class="text-sm text-muted">
          ดูรายการจองเช่า ค้นหาลูกค้า และเปิด booking detail สำหรับ pickup,
          return, no-show และเอกสารที่เกี่ยวข้อง
        </p>
      </div>
      <UButton icon="bx:refresh" :loading="loading" @click="loadBookings()">
        Refresh
      </UButton>
    </div>

    <UCard>
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
        <UFormField label="Search" class="flex-1">
          <UInput
            v-model="search"
            placeholder="ชื่อลูกค้า เบอร์โทร หรือ booking id…"
            icon="bx:search"
            @keyup.enter="loadBookings(0)"
          />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton color="primary" :loading="loading" @click="loadBookings(0)">
            Search
          </UButton>
          <UButton color="neutral" variant="ghost" @click="resetFilters">
            Reset
          </UButton>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          v-for="tab in statusTabs"
          :key="tab.value || 'all'"
          size="sm"
          color="primary"
          :variant="statusFilter === tab.value ? 'solid' : 'soft'"
          @click="setStatus(tab.value)"
        >
          {{ tab.label }}
        </UButton>
      </div>
    </UCard>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      title="โหลด Booking Manager ไม่สำเร็จ"
      :description="error"
    />

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="font-semibold">Rental booking list</p>
            <p class="text-xs text-muted">
              Showing {{ visibleStart }}–{{ visibleEnd }} of {{ total }} bookings
            </p>
          </div>
          <UBadge v-if="loading" color="primary" variant="soft">
            Updating…
          </UBadge>
        </div>
      </template>

      <div v-if="loading && bookings.length === 0" class="space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-16 w-full" />
      </div>
      <div v-else-if="bookings.length === 0" class="py-10 text-center text-muted">
        ไม่พบรายการจองเช่าตามเงื่อนไขนี้
      </div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th class="py-2 pr-4">Booking</th>
              <th class="py-2 pr-4">Customer</th>
              <th class="py-2 pr-4">Rental period</th>
              <th class="py-2 pr-4">Status</th>
              <th class="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="booking in bookings" :key="booking.id" class="border-t">
              <td class="py-3 pr-4 align-top">
                <NuxtLink
                  :to="`/admin/rental-bookings/${booking.id}`"
                  class="font-semibold text-primary hover:underline"
                >
                  {{ booking.assetName || booking.productName }}
                </NuxtLink>
                <p class="text-xs text-muted">{{ booking.id.slice(0, 8) }}</p>
              </td>
              <td class="py-3 pr-4 align-top">
                <p class="font-medium">{{ booking.bookerName || '(no name)' }}</p>
                <p class="text-xs text-muted">
                  {{ booking.bookerPhone || booking.walkInPhone || 'No phone' }}
                </p>
              </td>
              <td class="py-3 pr-4 align-top">
                <p>{{ formatDate(booking.startDate) }}</p>
                <p class="text-xs text-muted">
                  ถึง {{ formatDate(booking.endDate) }} · {{ booking.rentalDays }} วัน
                </p>
              </td>
              <td class="py-3 pr-4 align-top">
                <div class="flex flex-wrap gap-1">
                  <UBadge :color="statusColor(booking.status)" variant="soft">
                    {{ statusLabel(booking.status) }}
                  </UBadge>
                  <UBadge
                    :color="depositColor(booking.depositPaymentStatus)"
                    variant="subtle"
                  >
                    deposit {{ statusLabel(booking.depositPaymentStatus) }}
                  </UBadge>
                </div>
              </td>
              <td class="py-3 text-right align-top">
                <p class="font-semibold text-primary">
                  {{ formatCurrency(booking.rentalTotal, booking.currencyCode) }}
                </p>
                <UButton
                  class="mt-2"
                  size="xs"
                  color="primary"
                  variant="soft"
                  trailing-icon="bx:right-arrow-alt"
                  :to="`/admin/rental-bookings/${booking.id}`"
                >
                  เปิดรายละเอียด
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-muted">Page {{ page + 1 }}</p>
        <div class="flex gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            :disabled="page === 0 || loading"
            @click="loadBookings(page - 1)"
          >
            Previous
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            :disabled="!hasMore || loading"
            @click="loadBookings(page + 1)"
          >
            Next
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>