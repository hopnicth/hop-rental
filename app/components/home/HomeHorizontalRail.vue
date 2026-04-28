<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    items: unknown[];
    emptyLabel: string;
  }>(),
  {},
);

const carouselItems = computed(() => props.items as never[]);
</script>

<template>
  <div
    v-if="items.length === 0"
    class="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-default bg-(--ui-bg-elevated)/40 px-6 text-center text-sm text-muted"
  >
    {{ emptyLabel }}
  </div>

  <div v-else class="px-1 rounded-3xl py-2">
    <UCarousel
      v-slot="{ item }"
      loop
      arrows
      dots
      :autoplay="{ delay: 4500 }"
      :items="carouselItems"
      :ui="{
        root: 'relative w-full overflow-visible px-1 lg:px-1',
        item: 'basis-1/2 py-2 pe-4 sm:basis-1/3',
        dots: 'mt-3',
        prev: 'hidden lg:inline-flex left-0 z-10 border border-default bg-white/95 shadow-md',
        next: 'hidden lg:inline-flex right-0 z-10 border border-default bg-white/95 shadow-md',
      }"
    >
      <slot name="item" :item="item" />
    </UCarousel>
  </div>
</template>
