<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    items: unknown[];
    emptyLabel: string;
    loading?: boolean;
    skeletonCount?: number;
  }>(),
  {
    loading: false,
    skeletonCount: 3,
  },
);

const carouselItems = computed(() => props.items as never[]);
const skeletonItems = computed(() =>
  Array.from({ length: props.skeletonCount }, (_, index) => index),
);
</script>

<template>
  <div v-if="loading && items.length === 0" class="space-y-3">
    <CommonLoadingCat inline />
    <div class="px-1 py-2">
      <div class="flex gap-4 overflow-hidden">
        <div
          v-for="index in skeletonItems"
          :key="index"
          class="basis-1/2 shrink-0 sm:basis-1/3"
        >
          <slot name="skeleton">
            <ProductsCatalogCardSkeleton />
          </slot>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else-if="items.length === 0"
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
        item: 'basis-1/2 py-2 pe-0 sm:basis-1/3',
        dots: 'mt-3',
        prev: 'hidden lg:inline-flex left-0 z-10 border border-default bg-white/95 shadow-md',
        next: 'hidden lg:inline-flex right-0 z-10 border border-default bg-white/95 shadow-md',
      }"
    >
      <slot name="item" :item="item" />
    </UCarousel>
  </div>
</template>
