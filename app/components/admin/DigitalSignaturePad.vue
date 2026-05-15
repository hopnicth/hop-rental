<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    hint?: string;
  }>(),
  {
    hint: "ให้ลูกค้าเซ็นรับของบนหน้าจอนี้",
  },
);

const model = defineModel<string | null>({ default: null });

const canvasRef = ref<HTMLCanvasElement | null>(null);
const drawing = ref(false);
const hasInk = ref(false);

function setupCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "#111827";
}

function point(event: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function start(event: PointerEvent) {
  const ctx = canvasRef.value?.getContext("2d");
  if (!ctx) return;
  drawing.value = true;
  hasInk.value = true;
  const p = point(event);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
}

function move(event: PointerEvent) {
  if (!drawing.value) return;
  const ctx = canvasRef.value?.getContext("2d");
  if (!ctx) return;
  const p = point(event);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  model.value = canvasRef.value?.toDataURL("image/png") ?? null;
}

function stop() {
  drawing.value = false;
  model.value = hasInk.value
    ? (canvasRef.value?.toDataURL("image/png") ?? null)
    : null;
}

function clear() {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasInk.value = false;
  model.value = null;
}

onMounted(() => {
  setupCanvas();
  window.addEventListener("resize", setupCanvas);
});
onBeforeUnmount(() => window.removeEventListener("resize", setupCanvas));
</script>

<template>
  <div class="space-y-2">
    <div class="h-44 rounded-xl border border-default bg-white p-1">
      <canvas
        ref="canvasRef"
        class="h-full w-full touch-none rounded-lg"
        @pointerdown.prevent="start"
        @pointermove.prevent="move"
        @pointerup.prevent="stop"
        @pointerleave.prevent="stop"
      />
    </div>
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs text-muted">{{ props.hint }}</p>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="bx:eraser"
        label="ล้างลายเซ็น"
        @click="clear"
      />
    </div>
  </div>
</template>
