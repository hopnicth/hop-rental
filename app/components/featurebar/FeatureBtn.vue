<script setup lang="ts">
import { NuxtLink } from "#components";

defineProps<{
  /** Icon name (e.g. streamline-cyber:shopping-cart-3) */
  icon: string;
  /** Small label below the icon */
  label: string;
  /** Optional badge number (e.g. cart item count) — hidden when 0 or undefined */
  badge?: number;
  /** Optional route — if provided, renders as NuxtLink */
  to?: string;
}>();

defineEmits<{
  (e: "click"): void;
}>();
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to || undefined"
    class="relative flex cursor-pointer flex-col items-center gap-1 rounded-lg px-3 py-2 transition-colors hover:bg-gray-100"
    @click="!to && $emit('click')"
  >
    <!-- Icon wrapper (for badge positioning) -->
    <div class="relative">
      <UIcon :name="icon" class="size-8" />

      <!-- Badge — shown only when badge > 0 -->
      <UBadge
        v-if="badge && badge > 0"
        :label="String(badge)"
        color="error"
        size="sm"
        class="absolute -top-2 -right-3 min-w-5 justify-center"
      />
    </div>

    <!-- Label -->
    <span class="text-xs text-gray-600">{{ label }}</span>
  </component>
</template>
