<script setup lang="ts">
import AdminOrderQrScanner from "~/components/admin/AdminOrderQrScanner.vue";

type ScannerPayloadKind =
  | "order"
  | "booking"
  | "customer"
  | "asset"
  | "sku"
  | "product"
  | "barcode"
  | "unknown";

interface ResolverNotice {
  color: "info" | "warning" | "error" | "success" | "neutral";
  title: string;
  description?: string;
}

defineProps<{
  loading?: boolean;
  lastResolved?: string | null;
  notice?: ResolverNotice | null;
}>();

const emit = defineEmits<{
  resolveBooking: [value: string];
  resolveUser: [value: string];
  scannerDecoded: [payload: { raw: string; kind: ScannerPayloadKind; value: string }];
}>();

const scannerOpen = ref(false);
const bookingInput = ref("");
const userInput = ref("");
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">QR / manual resolver</h2>
          <p class="text-sm text-muted">
            Scan-first entry for booking QR and existing customer User QR.
          </p>
        </div>
        <UButton icon="bx:qr-scan" color="primary" @click="scannerOpen = true">
          Scan QR
        </UButton>
      </div>
    </template>

    <div class="space-y-4">
      <div class="grid gap-3 md:grid-cols-2">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted">
            Booking resolver
          </label>
          <div class="flex gap-2">
            <UInput
              v-model="bookingInput"
              icon="bx:barcode-reader"
              class="flex-1"
              placeholder="booking:<id> or booking ID"
              @keyup.enter="emit('resolveBooking', bookingInput)"
            />
            <UButton
              icon="bx:search"
              :loading="loading"
              @click="emit('resolveBooking', bookingInput)"
            />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted">
            User resolver
          </label>
          <div class="flex gap-2">
            <UInput
              v-model="userInput"
              icon="bx:user"
              class="flex-1"
              placeholder="customer:<userId> or user ID"
              @keyup.enter="emit('resolveUser', userInput)"
            />
            <UButton
              icon="bx:search"
              :loading="loading"
              @click="emit('resolveUser', userInput)"
            />
          </div>
        </div>
      </div>

      <UAlert
        v-if="notice"
        :color="notice.color"
        variant="soft"
        :title="notice.title"
        :description="notice.description"
      />
      <UAlert
        v-else
        color="neutral"
        variant="soft"
        title="Resolver ready"
        :description="lastResolved || 'Scan booking:<id> or customer:<userId>; raw UUIDs are only accepted in the matching manual field.'"
      />
    </div>

    <AdminOrderQrScanner
      v-model:open="scannerOpen"
      title="Scan POS V3 QR"
      description="Accepts existing booking:<id> and customer:<userId> QR payloads for POS V3 Phase 1."
      @decoded="emit('scannerDecoded', $event)"
    />
  </UCard>
</template>