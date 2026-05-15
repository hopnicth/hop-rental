<script setup lang="ts">
defineProps<{
  lastScanSummary: string | null;
}>();

const emit = defineEmits<{
  scanLookup: [];
  scanCatalog: [];
}>();
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <h2 class="text-lg font-semibold">Scan panel</h2>
        <p class="text-sm text-muted">
          Reuses the existing QR / barcode scanner component without introducing new backend behavior.
        </p>
      </div>
    </template>

    <div class="space-y-4">
      <div class="grid gap-2 sm:grid-cols-2">
        <UButton icon="bx:qr-scan" color="primary" @click="emit('scanLookup')">
          Scan booking / customer
        </UButton>
        <UButton icon="bx:barcode-reader" variant="soft" color="primary" @click="emit('scanCatalog')">
          Scan asset / SKU
        </UButton>
      </div>

      <div class="rounded-2xl border border-dashed border-default p-4 text-sm text-muted">
        Accepts `booking:*`, `customer:*`, `asset:*`, `sku:*`, `product:*`, and raw barcode values.
      </div>

      <UAlert
        :color="lastScanSummary ? 'success' : 'neutral'"
        variant="soft"
        :title="lastScanSummary ? 'Latest scan captured' : 'No scan captured yet'"
        :description="lastScanSummary ?? 'Use scan actions above to test the reused scanner from POS V1.'"
      />
    </div>
  </UCard>
</template>