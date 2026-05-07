<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string | null;
    imageSrc: string;
    imageAlt: string;
    to?: string | null;
    cardClass?: string;
    imageClass?: string;
    clickable?: boolean;
  }>(),
  {
    subtitle: undefined,
    to: null,
    cardClass: "",
    imageClass: "block aspect-square w-full object-cover",
    clickable: false,
  },
);

function handleCardClick(event: MouseEvent) {
  if (!props.to) return;

  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.closest(
      "a, button, input, textarea, select, summary, [role='button']",
    )
  ) {
    return;
  }

  void navigateTo(props.to);
}
</script>

<template>
  <UCard
    :class="[
      'h-full overflow-hidden',
      props.clickable && 'cursor-pointer transition-all hover:-translate-y-0.5',
      props.cardClass,
    ]"
    @click="handleCardClick"
  >
    <template #header>
      <div class="flex min-h-14 flex-col justify-start gap-1">
        <p v-if="props.subtitle" class="text-xs text-gray-400">
          {{ props.subtitle }}
        </p>
        <h3 class="line-clamp-2 text-sm font-semibold">
          {{ props.title }}
        </h3>
      </div>
    </template>

    <div class="relative overflow-hidden rounded-lg bg-muted">
      <NuxtImg
        :src="props.imageSrc"
        :alt="props.imageAlt"
        loading="lazy"
        :class="props.imageClass"
      />
      <div
        v-if="$slots.overlay"
        class="absolute right-2 top-2 z-10 flex items-center gap-2"
      >
        <slot name="overlay" />
      </div>
    </div>

    <div class="mt-3 flex min-h-60 flex-col gap-3">
      <div class="min-h-10">
        <slot name="description" />
      </div>

      <div class="min-h-14">
        <slot name="details" />
      </div>

      <div class="mt-auto space-y-3">
        <div class="min-h-8">
          <slot name="tags" />
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap gap-2">
            <slot name="badges" />
          </div>
          <div class="flex items-center gap-2">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
