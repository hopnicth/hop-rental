<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string | null;
    size?: number;
    inline?: boolean;
  }>(),
  {
    label: null,
    size: 72,
    inline: false,
  },
);

const { t } = useI18n();
const gifSrc = "/loading-cat.gif";
</script>

<template>
  <div
    :class="[
      inline
        ? 'inline-flex items-center gap-2'
        : 'flex flex-col items-center justify-center gap-2 py-6 text-center',
    ]"
    role="status"
    aria-live="polite"
  >
    <img
      :src="gifSrc"
      :alt="label ?? t('common.loading')"
      :width="size"
      :height="size"
      :style="{ width: `${size}px`, height: `${size}px` }"
      class="select-none"
      draggable="false"
    />
    <span class="text-sm text-muted">
      {{ label ?? t("common.loading") }}
    </span>
  </div>
</template>
