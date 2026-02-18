<script setup lang="ts">
/**
 * ProductGallery — Main image + thumbnail strip with lazy loading.
 *
 * Props:
 *  - images: string[]   — full list of product images
 *  - thumbnail: string  — fallback thumbnail if images is empty
 *  - altText: string     — alt text for accessibility
 */

const props = defineProps<{
  images: string[];
  thumbnail: string;
  altText: string;
}>();

// ── Internal selected index ──
const selectedIndex = ref(0);

// Merge: if images is empty, show thumbnail as the only image
const displayImages = computed(() =>
  props.images.length > 0 ? props.images : [props.thumbnail],
);

const currentImage = computed(
  () => displayImages.value[selectedIndex.value] || props.thumbnail,
);

// Reset index if images change (e.g. SKU switch)
watch(
  () => props.images,
  () => {
    selectedIndex.value = 0;
  },
);
</script>

<template>
  <!-- Main Image -->
  <div class="aspect-square overflow-hidden rounded-lg bg-gray-100">
    <NuxtImg
      :src="currentImage"
      :alt="altText"
      loading="lazy"
      class="h-full w-full object-cover"
    />
  </div>

  <!-- Thumbnail strip -->
  <div
    v-if="displayImages.length > 1"
    class="mt-3 flex gap-2 overflow-x-auto"
  >
    <button
      v-for="(img, idx) in displayImages"
      :key="idx"
      class="h-16 w-16 shrink-0 overflow-hidden rounded border-2 transition-all"
      :class="
        idx === selectedIndex
          ? 'border-primary'
          : 'border-transparent opacity-60 hover:opacity-100'
      "
      @click="selectedIndex = idx"
    >
      <NuxtImg
        :src="img"
        :alt="`${altText} ${idx + 1}`"
        loading="lazy"
        class="h-full w-full object-cover"
      />
    </button>
  </div>
</template>

