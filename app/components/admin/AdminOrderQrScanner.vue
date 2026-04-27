<script setup lang="ts">
/**
 * Admin order QR scanner.
 *
 * Opens a modal with the device camera and decodes HOPNIC QR payloads:
 *   - `order:<orderNumber>` → sale order lookup
 *   - `booking:<bookingId>` → rental booking lookup
 *   - `customer:<userId>`   → customer lookup
 *
 * Anything else is forwarded as a raw search term so callers can
 * fall back to free-text search.
 */
import type QrScannerType from "qr-scanner";

const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  decoded: [
    payload: {
      raw: string;
      kind: "order" | "booking" | "customer" | "unknown";
      value: string;
    },
  ];
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const scanner = ref<QrScannerType | null>(null);
const starting = ref(false);
const errorMessage = ref<string | null>(null);

function parsePayload(raw: string) {
  const trimmed = raw.trim();
  const match = /^(order|booking|customer):(.+)$/i.exec(trimmed);
  if (match) {
    return {
      raw: trimmed,
      kind: match[1].toLowerCase() as "order" | "booking" | "customer",
      value: match[2].trim(),
    };
  }
  return { raw: trimmed, kind: "unknown" as const, value: trimmed };
}

async function startScanner() {
  if (!import.meta.client || !videoRef.value || starting.value) return;
  starting.value = true;
  errorMessage.value = null;

  try {
    const QrScannerCtor = (await import("qr-scanner")).default;
    const instance = new QrScannerCtor(
      videoRef.value,
      (result) => {
        const payload = parsePayload(result.data);
        emit("decoded", payload);
        open.value = false;
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: "environment",
      },
    );
    await instance.start();
    scanner.value = instance;
  } catch (err) {
    errorMessage.value =
      err instanceof Error
        ? err.message
        : "Unable to access camera. Check browser permissions.";
  } finally {
    starting.value = false;
  }
}

function stopScanner() {
  const instance = scanner.value;
  if (!instance) return;
  try {
    instance.stop();
    instance.destroy();
  } catch {
    /* noop */
  }
  scanner.value = null;
}

watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    await startScanner();
  } else {
    stopScanner();
  }
});

onBeforeUnmount(() => {
  stopScanner();
});
</script>

<template>
  <UModal v-model:open="open" title="Scan customer QR" :dismissible="true">
    <template #body>
      <div class="flex flex-col items-center gap-3">
        <p class="text-sm text-muted">
          Point the camera at the customer's order, booking, or profile QR
          code.
        </p>

        <div
          class="relative aspect-square w-full max-w-sm overflow-hidden rounded-xl border border-default bg-black"
        >
          <video
            ref="videoRef"
            class="h-full w-full object-cover"
            playsinline
            muted
          />
          <div
            v-if="starting"
            class="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white"
          >
            Starting camera…
          </div>
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="bx:error-circle"
          :title="errorMessage"
        />

        <p class="text-xs text-muted">
          Supports payloads:
          <code>order:&lt;number&gt;</code>,
          <code>booking:&lt;uuid&gt;</code>,
          <code>customer:&lt;uuid&gt;</code>.
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          label="Close"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
      </div>
    </template>
  </UModal>
</template>
