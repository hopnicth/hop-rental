<script setup lang="ts">
/**
 * Admin order QR scanner.
 *
 * Opens a modal with the device camera and decodes HOPNIC QR/barcode payloads:
 *   - `order:<orderNumber>`       → sale order lookup
 *   - `booking:<bookingId>`       → rental booking lookup
 *   - `customer:<userId|phone>`   → customer lookup
 *   - `customer-phone:<phone>`    → walk-in/customer phone lookup
 *   - `asset:<code|id>`           → POS rental asset lookup
 *   - `sku:<code|id>`             → POS sale SKU lookup
 *   - `product:<id>`              → POS sale product lookup
 *   - `barcode:<code>`            → raw barcode lookup
 *
 * Anything else is forwarded as a raw search term so callers can
 * fall back to free-text search.
 */
import type QrScannerType from "qr-scanner";

type ScannerPayloadKind =
  | "order"
  | "booking"
  | "customer"
  | "asset"
  | "sku"
  | "product"
  | "barcode"
  | "unknown";

interface BarcodeDetectorResultLike {
  rawValue?: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResultLike[]>;
}

interface BarcodeDetectorConstructorLike {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
  }>(),
  {
    title: "Scan QR / barcode",
    description:
      "Point the camera at a customer QR, booking QR, product QR, or barcode.",
  },
);

const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  decoded: [
    payload: {
      raw: string;
      kind: ScannerPayloadKind;
      value: string;
    },
  ];
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const scanner = ref<QrScannerType | null>(null);
const zxingControls = ref<{ stop: () => void } | null>(null);
const mediaStream = ref<MediaStream | null>(null);
const detectFrame = ref<number | null>(null);
const starting = ref(false);
const errorMessage = ref<string | null>(null);
const activeEngine = ref<"barcode-detector" | "zxing" | "qr-scanner" | null>(
  null,
);

const BARCODE_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
];

function parsePayload(raw: string) {
  const trimmed = raw.trim();
  const urlMatch =
    /^https?:\/\/[^/]+\/(?:admin\/)?(?:orders|rentals|customers)\/(.+)$/i.exec(
      trimmed,
    );
  if (urlMatch) {
    return {
      raw: trimmed,
      kind: "unknown" as const,
      value: urlMatch[1].trim(),
    };
  }

  const match =
    /^(order|booking|customer|customer-phone|asset|sku|product|barcode):(.+)$/i.exec(
      trimmed,
    );
  if (match) {
    const normalizedKind =
      match[1].toLowerCase() === "customer-phone"
        ? "customer"
        : match[1].toLowerCase();
    return {
      raw: trimmed,
      kind: normalizedKind as ScannerPayloadKind,
      value: match[2].trim(),
    };
  }
  return { raw: trimmed, kind: "unknown" as const, value: trimmed };
}

function emitDecoded(raw: string) {
  const payload = parsePayload(raw);
  emit("decoded", payload);
  open.value = false;
}

function barcodeDetectorCtor(): BarcodeDetectorConstructorLike | null {
  if (!import.meta.client) return null;
  const candidate = (window as unknown as { BarcodeDetector?: unknown })
    .BarcodeDetector;
  return typeof candidate === "function"
    ? (candidate as BarcodeDetectorConstructorLike)
    : null;
}

async function startBarcodeDetector() {
  const Ctor = barcodeDetectorCtor();
  if (!Ctor || !videoRef.value) return false;

  const supported = Ctor.getSupportedFormats
    ? await Ctor.getSupportedFormats().catch(() => BARCODE_FORMATS)
    : BARCODE_FORMATS;
  const formats = BARCODE_FORMATS.filter((format) =>
    supported.includes(format),
  );
  if (formats.length === 0) return false;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
  mediaStream.value = stream;
  videoRef.value.srcObject = stream;
  await videoRef.value.play();

  const detector = new Ctor({ formats });
  activeEngine.value = "barcode-detector";
  const tick = async () => {
    if (!open.value || !videoRef.value) return;
    try {
      const [result] = await detector.detect(videoRef.value);
      if (result?.rawValue) {
        emitDecoded(result.rawValue);
        return;
      }
    } catch {
      // Keep scanning; transient decode errors are normal frame-by-frame.
    }
    detectFrame.value = requestAnimationFrame(tick);
  };
  detectFrame.value = requestAnimationFrame(tick);
  return true;
}

async function startZxingScanner() {
  if (!videoRef.value) return false;
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromVideoDevice(
    undefined,
    videoRef.value,
    (result) => {
      const raw = result?.getText?.();
      if (raw) emitDecoded(raw);
    },
  );
  zxingControls.value = controls;
  activeEngine.value = "zxing";
  return true;
}

async function startScanner() {
  if (!import.meta.client || !videoRef.value || starting.value) return;
  starting.value = true;
  errorMessage.value = null;

  try {
    const nativeStarted = await startBarcodeDetector().catch(() => false);
    if (nativeStarted) return;

    const zxingStarted = await startZxingScanner().catch(() => false);
    if (zxingStarted) return;

    const QrScannerCtor = (await import("qr-scanner")).default;
    const instance = new QrScannerCtor(
      videoRef.value,
      (result) => emitDecoded(result.data),
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: "environment",
      },
    );
    await instance.start();
    activeEngine.value = "qr-scanner";
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
  if (detectFrame.value != null) {
    cancelAnimationFrame(detectFrame.value);
    detectFrame.value = null;
  }
  if (videoRef.value) videoRef.value.srcObject = null;
  mediaStream.value?.getTracks().forEach((track) => track.stop());
  mediaStream.value = null;
  zxingControls.value?.stop();
  zxingControls.value = null;
  const instance = scanner.value;
  if (instance) {
    try {
      instance.stop();
      instance.destroy();
    } catch {
      /* noop */
    }
  }
  scanner.value = null;
  activeEngine.value = null;
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
  <UModal v-model:open="open" :title="props.title" :dismissible="true">
    <template #body>
      <div class="flex flex-col items-center gap-3">
        <p class="text-sm text-muted">{{ props.description }}</p>

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
          Engine: {{ activeEngine || "auto" }} · Supports payloads:
          <code>order:&lt;number&gt;</code>, <code>booking:&lt;uuid&gt;</code>,
          <code>customer:&lt;uuid/phone&gt;</code>,
          <code>asset:&lt;code&gt;</code>, <code>sku:&lt;code&gt;</code>,
          <code>barcode:&lt;code&gt;</code>.
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
