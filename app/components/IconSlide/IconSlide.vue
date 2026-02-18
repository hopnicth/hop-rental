<script setup lang="ts">
import { NuxtLink } from "#components";
import type { IconSlideItem } from "~/types/iconSlide";

const props = withDefaults(
  defineProps<{
    /** Array of items to display in the marquee */
    items: IconSlideItem[];
    /** Animation duration in seconds (lower = faster) */
    speed?: number;
    /** Height of the marquee container */
    height?: string;
  }>(),
  {
    speed: 30,
    height: "100px",
  },
);

const trackRef = ref<HTMLElement | null>(null);
const isPaused = ref(false);
/** Current translateX when paused — in px */
const pausedX = ref(0);
/** Measured width of one set of items (px) — used as loop distance */
const oneSetWidth = ref(0);

/**
 * Measure real width of one item-set so the loop distance is pixel-perfect.
 * Uses ResizeObserver to recalculate when images load or window resizes.
 */
onMounted(() => {
  if (!trackRef.value) return;

  function measure() {
    if (trackRef.value) {
      oneSetWidth.value = trackRef.value.scrollWidth / 2;
      trackRef.value.style.setProperty(
        "--marquee-distance",
        `-${oneSetWidth.value}px`,
      );
    }
  }

  const ro = new ResizeObserver(measure);
  ro.observe(trackRef.value);
  measure(); // initial

  onUnmounted(() => ro.disconnect());
});

/**
 * Read the live translateX value from the running CSS animation.
 */
function getCurrentTranslateX(): number {
  if (!trackRef.value) return 0;
  const style = getComputedStyle(trackRef.value);
  const matrix = new DOMMatrix(style.transform);
  return matrix.m41; // translateX in px
}

/**
 * Hover-in: capture the animated translateX, stop animation,
 * and apply the same position as inline style → NO visual shift.
 */
function onMouseEnter() {
  if (!trackRef.value) return;
  pausedX.value = getCurrentTranslateX();
  isPaused.value = true;
}

/**
 * Hover-out: calculate animation-delay so the animation resumes
 * from approximately the same position → no jump.
 */
function onMouseLeave() {
  if (!trackRef.value) return;

  const setW = oneSetWidth.value || trackRef.value.scrollWidth / 2;
  if (setW > 0) {
    const currentOffset = Math.abs(pausedX.value) % setW;
    const progress = currentOffset / setW;
    // Negative delay = start animation partway through
    trackRef.value.style.animationDelay = `${-(progress * props.speed)}s`;
  }

  isPaused.value = false;
  pausedX.value = 0;
}

/**
 * Mouse wheel → shift the track while paused.
 * ×3 multiplier for noticeably faster scroll.
 */
function onWheel(e: WheelEvent) {
  if (!isPaused.value) return;
  e.preventDefault();
  pausedX.value -= e.deltaY * 3;
}

/**
 * Duplicate items to create seamless infinite loop.
 * We render the list twice so when the first set scrolls out,
 * the second set is already visible — creating an endless loop.
 */
const duplicatedItems = computed(() => [...props.items, ...props.items]);
</script>

<template>
  <div
    class="marquee-container overflow-hidden"
    :style="{ height }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @wheel.prevent="onWheel"
  >
    <div
      ref="trackRef"
      class="marquee-track flex items-center gap-8"
      :class="{ 'marquee-animate': !isPaused }"
      :style="{
        '--marquee-speed': `${speed}s`,
        transform: isPaused ? `translateX(${pausedX}px)` : undefined,
      }"
    >
      <template
        v-for="(item, index) in duplicatedItems"
        :key="`${item.id}-${index}`"
      >
        <component
          :is="item.linkUrl ? NuxtLink : 'div'"
          :to="item.linkUrl || undefined"
          :target="item.linkTarget || '_self'"
          class="marquee-item shrink-0 cursor-pointer transition-opacity hover:opacity-80"
        >
          <img
            :src="item.imageUrl"
            :alt="item.alt"
            class="h-full max-h-16 w-auto object-contain"
            loading="lazy"
          />
        </component>
      </template>
    </div>
  </div>
</template>

<style scoped>
.marquee-container {
  display: flex;
  align-items: center;
  width: 100%;
}

.marquee-track {
  display: flex;
  align-items: center;
  white-space: nowrap;
  will-change: transform;
}

/* Animation only when NOT paused */
.marquee-animate {
  animation: marquee-scroll var(--marquee-speed, 30s) linear infinite;
}

@keyframes marquee-scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    /* pixel-perfect distance measured by ResizeObserver — fallback to -50% */
    transform: translateX(var(--marquee-distance, -50%));
  }
}

.marquee-item {
  flex-shrink: 0;
  padding: 0 0.75rem;
}
</style>
