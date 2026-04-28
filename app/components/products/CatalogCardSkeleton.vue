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
    <template #header>
      <div class="flex min-h-14 flex-col justify-start gap-1">
        <USkeleton class="h-3 w-16 rounded" />
        <USkeleton class="h-4 w-3/4 rounded" />
      </div>
    </template>

    <USkeleton class="aspect-square w-full rounded-md" />

    <div class="mt-3 flex min-h-60 flex-col gap-3">
      <div class="min-h-10 space-y-2">
        <USkeleton class="h-3 w-full rounded" />
        <USkeleton class="h-3 w-5/6 rounded" />
      </div>

      <div class="min-h-14 space-y-2">
        <USkeleton class="h-3 w-1/2 rounded" />
        <USkeleton class="h-3 w-2/3 rounded" />
      </div>

      <div class="mt-auto space-y-3">
        <div class="min-h-8 flex flex-wrap gap-2">
          <USkeleton class="h-5 w-14 rounded-full" />
          <USkeleton class="h-5 w-12 rounded-full" />
        </div>

        <div class="flex items-center justify-between gap-2">
          <USkeleton class="h-5 w-20 rounded" />
          <USkeleton class="h-8 w-8 rounded-md" />
        </div>
      </div>
    </div>
  </UCard>
</template>
