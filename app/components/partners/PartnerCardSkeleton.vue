<script setup lang="ts">
withDefaults(
  defineProps<{
    cardClass?: string;
  }>(),
  {
    cardClass: "",
  },
);
</script>

<template>
  <UCard :class="['h-full overflow-hidden', cardClass]">
    <!-- Header skeleton: badge row + name — mirrors PartnerCard #header min-h-14 -->
    <template #header>
      <div class="flex min-h-14 flex-col justify-start gap-1">
        <div class="flex gap-1">
          <USkeleton class="h-4 w-12 rounded-full" />
        </div>
        <USkeleton class="h-4 w-3/4 rounded" />
      </div>
    </template>

    <!-- Image skeleton — aspect-square matches real card -->
    <USkeleton class="aspect-square w-full rounded-lg" />

    <!-- Content zone skeleton — min-h-32 matches real card -->
    <div class="mt-3 flex min-h-32 flex-col gap-2">
      <!-- Tagline skeleton -->
      <div class="min-h-8 space-y-1.5">
        <USkeleton class="h-3 w-full rounded" />
        <USkeleton class="h-3 w-4/5 rounded" />
      </div>

      <!-- Category chip skeletons -->
      <div class="min-h-10 flex flex-wrap gap-1">
        <USkeleton class="h-4 w-20 rounded-full" />
        <USkeleton class="h-4 w-16 rounded-full" />
      </div>

      <!-- Service area chip skeletons — pinned to bottom -->
      <div class="mt-auto flex flex-wrap gap-1">
        <USkeleton class="h-4 w-14 rounded-full" />
        <USkeleton class="h-4 w-16 rounded-full" />
      </div>
    </div>
  </UCard>
</template>
