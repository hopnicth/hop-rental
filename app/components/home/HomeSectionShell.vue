<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <section class="space-y-3">
    <div
      class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-1">
        <h2 class="text-xl font-semibold text-[var(--ui-text)] sm:text-2xl">
          {{ title }}
        </h2>
        <p
          v-if="description"
          class="max-w-3xl text-sm text-[var(--ui-text-muted)]"
        >
          {{ description }}
        </p>
      </div>

      <slot name="action" />
    </div>

    <slot />
  </section>
</template>
