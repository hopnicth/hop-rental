<script setup lang="ts">
withDefaults(
  defineProps<{
    items: unknown[];
    emptyLabel: string;
  }>(),
  {},
);
</script>

<template>
  <div
    v-if="items.length === 0"
    class="flex h-[22rem] items-center justify-center rounded-3xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg-elevated)]/40 px-6 text-center text-sm text-[var(--ui-text-muted)]"
  >
    {{ emptyLabel }}
  </div>

  <div v-else class="rounded-3xl px-2 py-2 sm:px-3 lg:px-4">
    <UCarousel
      v-slot="{ item }"
      arrows
      dots
      :items="items"
      :ui="{
        root: 'relative w-full overflow-visible px-8 lg:px-10',
        item: 'basis-[88%] py-2 pe-4 sm:basis-[48%] lg:basis-[34%] xl:basis-[26%]',
        dots: 'mt-3',
        prev: 'hidden lg:inline-flex left-0 z-10 border border-default bg-white/95 shadow-md',
        next: 'hidden lg:inline-flex right-0 z-10 border border-default bg-white/95 shadow-md',
      }"
    >
      <slot name="item" :item="item" />
    </UCarousel>
  </div>
</template>
