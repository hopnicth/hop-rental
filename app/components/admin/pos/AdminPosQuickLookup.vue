<script setup lang="ts">
interface LookupCustomer {
  userId?: string | null;
  fullName: string | null;
  phone: string | null;
  kind: "account" | "walk_in";
  kycStatus?: string | null;
}

interface LookupBooking {
  id: string;
  status: string;
  productName?: string | null;
  assetName?: string | null;
  startDate: string;
  endDate: string;
}

interface LookupResponse {
  customer: LookupCustomer | null;
  bookings: LookupBooking[];
}

const props = defineProps<{
  modelValue: string;
  loading?: boolean;
  branchLabel: string;
  result: LookupResponse | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
  scan: [];
}>();

const searchValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});

function bookingTitle(booking: LookupBooking) {
  return booking.assetName || booking.productName || booking.id;
}

function bookingStatusColor(status: string) {
  if (status === "picked_up") return "success";
  if (status === "confirmed") return "warning";
  if (status === "returned") return "neutral";
  return "info";
}

function formatDateRange(startDate: string, endDate: string) {
  return `${startDate || "—"} → ${endDate || "—"}`;
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Quick lookup</h2>
          <p class="text-sm text-muted">
            Search with the existing customer lookup API. Good for booking QR, phone number, or customer detail triage.
          </p>
        </div>
        <UBadge color="primary" variant="soft">{{ branchLabel }}</UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <div class="flex flex-col gap-2 md:flex-row">
        <UInput
          v-model="searchValue"
          icon="bx:search"
          class="flex-1"
          placeholder="Search phone, booking no., customer name, company, tax ID"
          @keyup.enter="emit('submit')"
        />
        <UButton :loading="loading" icon="bx:search" color="primary" @click="emit('submit')">
          Search
        </UButton>
        <UButton icon="bx:barcode-reader" variant="soft" @click="emit('scan')">
          Scan QR
        </UButton>
      </div>

      <div class="grid gap-2 text-sm text-muted md:grid-cols-2">
        <div class="rounded-xl border border-default p-3">Supports booking QR, phone lookup, and customer triage.</div>
        <div class="rounded-xl border border-default p-3">Future company / tax-ID search will sit on top of this shell.</div>
      </div>

      <template v-if="result">
        <div v-if="result.customer" class="rounded-2xl border border-default p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="font-medium text-default">
                {{ result.customer.fullName || "Unnamed customer" }}
              </p>
              <p class="text-sm text-muted">{{ result.customer.phone || "No phone" }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge color="primary" variant="soft">
                {{ result.customer.kind === 'account' ? 'Registered' : 'Walk-in' }}
              </UBadge>
              <UBadge v-if="result.customer.kycStatus" color="info" variant="soft">
                KYC: {{ result.customer.kycStatus }}
              </UBadge>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-medium text-default">Bookings</h3>
            <UBadge color="neutral" variant="soft">
              {{ result.bookings.length }} found
            </UBadge>
          </div>

          <div v-if="result.bookings.length" class="grid gap-3">
            <div
              v-for="booking in result.bookings"
              :key="booking.id"
              class="rounded-2xl border border-default p-4"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-medium text-default">{{ bookingTitle(booking) }}</p>
                  <p class="text-sm text-muted">
                    {{ formatDateRange(booking.startDate, booking.endDate) }}
                  </p>
                </div>
                <UBadge :color="bookingStatusColor(booking.status)" variant="soft">
                  {{ booking.status }}
                </UBadge>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <UButton :to="`/admin/rental-bookings/${booking.id}`" size="sm" color="primary">
                  Open booking
                </UButton>
                <UButton to="/admin/pos" size="sm" variant="soft" color="primary">
                  Continue in legacy POS
                </UButton>
              </div>
            </div>
          </div>

          <UAlert
            v-else
            color="neutral"
            variant="soft"
            title="No bookings found"
            description="The shell is ready, but detailed pickup/return flows still continue in legacy POS for now."
          />
        </div>
      </template>
    </div>
  </UCard>
</template>