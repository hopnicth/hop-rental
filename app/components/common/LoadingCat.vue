<script setup lang="ts">
const props = withDefaults(
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

const loaderHeight = computed(() => `${Math.round(props.size * 0.55)}px`);
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
    <div
      class="loader"
      :style="{ height: loaderHeight }"
      :aria-label="label ?? t('common.loading')"
    />
    <span class="text-sm text-muted">
      {{ label ?? t("common.loading") }}
    </span>
  </div>
</template>

<style scoped>
.loader {
  aspect-ratio: 1.5;
  display: grid;
  color: currentColor;
}
.loader::before,
.loader::after {
  content: "";
  background: currentColor;
  border-radius: 80px 80px 0 0;
  animation: hop-loader 1s infinite alternate both;
}
.loader::after {
  transform: scale(-1);
  animation-delay: 0.2s;
}
@keyframes hop-loader {
  0%,
  10% {
    margin-inline: 0 33%;
  }
  50% {
    margin-inline: 0 0;
  }
  90%,
  100% {
    margin-inline: 33% 0;
  }
}
</style>
