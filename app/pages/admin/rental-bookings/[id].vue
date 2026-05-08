<script setup lang="ts">
import type { AdminBookingOpsPayload } from "~/types/admin-booking-ops";
import type {
  AdminRentalBookingDetail,
  AdminRentalBookingPatchPayload,
} from "~/types/admin-order-detail";
import type { RentalBookingStatus } from "~/types/rental-booking";
import { RENTAL_BOOKING_STATUS_TRANSITIONS } from "~/utils/admin-order-transitions";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type BadgeColor =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "error"
  | "primary";

const route = useRoute();
const toast = useToast();
const bookingId = computed(() => String(route.params.id ?? ""));

const booking = ref<AdminRentalBookingDetail | null>(null);
const ops = ref<AdminBookingOpsPayload | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const updating = ref(false);

async function loadOps(): Promise<void> {
  if (!bookingId.value) return;
  try {
    ops.value = await $fetch<AdminBookingOpsPayload>(
      `/api/admin/rental-bookings/${bookingId.value}/ops`,
    );
  } catch (e) {
    toast.add({
      title: "Failed to load checklists/documents",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  }
}

async function load(): Promise<void> {
  if (!bookingId.value) return;
  loading.value = true;
  error.value = null;
  try {
    const [detail] = await Promise.all([
      $fetch<AdminRentalBookingDetail>(
        `/api/admin/rental-bookings/${bookingId.value}`,
      ),
      loadOps(),
    ]);
    booking.value = detail;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load booking";
  } finally {
    loading.value = false;
  }
}

function onOpsUpdated(payload: AdminBookingOpsPayload): void {
  ops.value = payload;
}

async function applyPatch(
  patch: AdminRentalBookingPatchPayload,
): Promise<void> {
  if (!bookingId.value) return;
  updating.value = true;
  try {
    booking.value = await $fetch<AdminRentalBookingDetail>(
      `/api/admin/rental-bookings/${bookingId.value}`,
      { method: "PATCH", body: patch },
    );
    toast.add({ title: "Booking updated", color: "success" });
  } catch (e) {
    toast.add({
      title: "Update failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    updating.value = false;
  }
}

if (import.meta.client) {
  onMounted(() => void load());
}

// ── Formatting helpers ──
function formatCurrency(value: number, currency = "THB"): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateOnly(value: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function unitLabel(unit: "day" | "week" | "month", count: number): string {
  if (unit === "day") return count === 1 ? "day" : "days";
  if (unit === "week") return count === 1 ? "week" : "weeks";
  return count === 1 ? "month" : "months";
}

function rentalStatusColor(s: RentalBookingStatus): BadgeColor {
  if (s === "confirmed") return "success";
  if (s === "picked_up") return "info";
  if (s === "returned") return "primary";
  if (s === "draft") return "warning";
  return "error";
}

const allowedStatuses = computed<RentalBookingStatus[]>(() =>
  booking.value
    ? (RENTAL_BOOKING_STATUS_TRANSITIONS[booking.value.status] ?? [])
    : [],
);

const breakdownLines = computed(() => {
  const bd = booking.value?.pricingBreakdown;
  if (!bd || !("lines" in bd)) return [];
  return bd.lines ?? [];
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="space-y-1">
        <h2 class="text-xl font-semibold">
          {{ booking?.assetCode || booking?.productName || "Rental booking" }}
        </h2>
        <p class="text-sm text-muted">Booking ID: {{ bookingId }}</p>
      </div>
      <UButton
        icon="bx:arrow-back"
        label="Back to orders"
        color="neutral"
        variant="ghost"
        to="/admin/orders"
      />
    </div>

    <div v-if="loading" class="space-y-3">
      <div class="h-24 animate-pulse rounded-xl bg-elevated" />
      <div class="h-40 animate-pulse rounded-xl bg-elevated" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="bx:error-circle"
      title="Failed to load"
      :description="error"
    >
      <template #actions>
        <UButton size="sm" label="Retry" @click="void load()" />
      </template>
    </UAlert>

    <template v-else-if="booking">
      <!-- Status + transitions -->
      <UCard>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="rentalStatusColor(booking.status)" variant="subtle">
              Status: {{ booking.status }}
            </UBadge>
            <UBadge color="neutral" variant="soft">
              {{ booking.rentalDays }} day{{
                booking.rentalDays === 1 ? "" : "s"
              }}
            </UBadge>
            <UBadge v-if="booking.hubName" color="neutral" variant="soft">
              Hub: {{ booking.hubName }}
            </UBadge>
            <UBadge
              v-if="booking.storageBranchName"
              color="neutral"
              variant="soft"
            >
              Storage: {{ booking.storageBranchName }}
            </UBadge>
          </div>

          <div v-if="allowedStatuses.length > 0">
            <p class="mb-1 text-xs font-semibold uppercase text-muted">
              Booking status
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="next in allowedStatuses"
                :key="`bs-${next}`"
                size="sm"
                variant="soft"
                :color="rentalStatusColor(next)"
                :loading="updating"
                @click="void applyPatch({ status: next })"
              >
                → {{ next }}
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Customer + Booker -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Customer / Booker</h3>
          </template>
          <div class="space-y-3 text-sm">
            <div
              v-if="booking.bookerName || booking.bookerPhone"
              class="space-y-1"
            >
              <p class="text-xs font-semibold uppercase text-muted">
                Booker (from booking form)
              </p>
              <p class="font-medium">
                {{ booking.bookerName || "—" }}
              </p>
              <a
                v-if="booking.bookerPhone"
                :href="`tel:${booking.bookerPhone}`"
                class="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <UIcon name="bx:phone" />
                {{ booking.bookerPhone }}
              </a>
            </div>
            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase text-muted">Account</p>
              <p class="font-medium">
                {{ booking.customer.fullName || "Unnamed customer" }}
              </p>
              <a
                v-if="booking.customer.phone"
                :href="`tel:${booking.customer.phone}`"
                class="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <UIcon name="bx:phone" />
                {{ booking.customer.phone }}
              </a>
              <p v-else class="text-muted">No phone on file</p>
              <p class="text-xs text-muted">
                User ID:
                <span class="font-mono">{{ booking.customer.userId }}</span>
              </p>
            </div>
          </div>
        </UCard>

        <!-- Asset snapshot -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Asset</h3>
          </template>
          <div class="flex gap-3 text-sm">
            <img
              v-if="booking.assetThumbnail || booking.thumbnail"
              :src="booking.assetThumbnail || booking.thumbnail || ''"
              :alt="booking.assetName || booking.productName"
              class="h-20 w-20 shrink-0 rounded-lg object-cover"
            />
            <div class="space-y-1">
              <p class="font-medium">
                {{ booking.assetName || booking.productName }}
              </p>
              <p v-if="booking.assetCode" class="text-xs text-muted">
                Code: <span class="font-mono">{{ booking.assetCode }}</span>
              </p>
              <p v-if="booking.matchedProductName" class="text-xs text-muted">
                Matched product: {{ booking.matchedProductName }}
              </p>
              <p v-if="booking.skuId" class="text-xs text-muted">
                SKU: <span class="font-mono">{{ booking.skuId }}</span>
              </p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Rental period -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Rental period</h3>
            <p class="text-xs text-muted">
              Created {{ formatDate(booking.createdAt) }} · Updated
              {{ formatDate(booking.updatedAt) }}
            </p>
          </div>
        </template>
        <div class="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <p class="text-xs font-semibold uppercase text-muted">Start</p>
            <p class="font-medium">{{ formatDateOnly(booking.startDate) }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase text-muted">End</p>
            <p class="font-medium">{{ formatDateOnly(booking.endDate) }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase text-muted">Duration</p>
            <p class="font-medium">
              {{ booking.rentalDays }} day{{
                booking.rentalDays === 1 ? "" : "s"
              }}
            </p>
          </div>
        </div>
      </UCard>

      <!-- Pricing breakdown -->
      <UCard>
        <template #header>
          <h3 class="font-semibold">Pricing breakdown</h3>
        </template>

        <div class="grid gap-2 text-xs text-muted md:grid-cols-3">
          <p>
            Daily:
            {{ formatCurrency(booking.dailyRate, booking.currencyCode) }}
          </p>
          <p>
            Weekly:
            {{ formatCurrency(booking.weeklyRate, booking.currencyCode) }}
          </p>
          <p>
            Monthly:
            {{ formatCurrency(booking.monthlyRate, booking.currencyCode) }}
          </p>
        </div>

        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-default text-xs uppercase text-muted">
              <tr>
                <th class="py-2">Tier</th>
                <th class="py-2 text-right">Rate</th>
                <th class="py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(line, idx) in breakdownLines"
                :key="`bd-${idx}`"
                class="border-b border-default/40 last:border-b-0"
              >
                <td class="py-3 pr-3">
                  {{ line.count }} ×
                  {{ unitLabel(line.unit, line.count) }}
                </td>
                <td class="py-3 text-right">
                  {{ formatCurrency(line.rate, booking.currencyCode) }}
                </td>
                <td class="py-3 text-right font-medium">
                  {{ formatCurrency(line.subtotal, booking.currencyCode) }}
                </td>
              </tr>
              <tr v-if="breakdownLines.length === 0">
                <td colspan="3" class="py-3 text-center italic text-muted">
                  No tiered breakdown recorded.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 space-y-1 border-t border-default pt-4 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">Rental total</span>
            <span>
              {{ formatCurrency(booking.rentalTotal, booking.currencyCode) }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Deposit</span>
            <span>
              {{ formatCurrency(booking.depositAmount, booking.currencyCode) }}
            </span>
          </div>
          <div
            class="flex justify-between border-t border-default pt-2 text-base font-semibold"
          >
            <span>Total due at start</span>
            <span class="text-primary">
              {{
                formatCurrency(
                  booking.rentalTotal + booking.depositAmount,
                  booking.currencyCode,
                )
              }}
            </span>
          </div>
        </div>
      </UCard>

      <AdminBookingChecklists
        v-if="ops"
        :booking-id="bookingId"
        :checklists="ops.checklists"
        :templates="ops.templates"
        @updated="onOpsUpdated"
      />

      <AdminBookingDocuments
        v-if="ops"
        :booking-id="bookingId"
        :documents="ops.documents"
        @updated="onOpsUpdated"
      />
    </template>
  </div>
</template>
