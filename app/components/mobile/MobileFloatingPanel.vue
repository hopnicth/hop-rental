<script setup lang="ts">
const open = defineModel<boolean>("open", { default: false });

const props = withDefaults(
  defineProps<{
    title: string;
    icon?: string;
    buttonLabel?: string;
    active?: boolean;
  }>(),
  {
    icon: "bx:filter-alt",
    buttonLabel: "Open",
    active: false,
  },
);
</script>

<template>
  <UDrawer
    v-model:open="open"
    :title="props.title"
    direction="bottom"
    :ui="{
      content: 'max-h-[85vh]',
      body: 'overflow-y-auto pb-6',
    }"
  >
    <div class="fixed bottom-4 right-4 z-40 lg:hidden">
      <UButton
        :icon="props.icon"
        :label="props.buttonLabel"
        :color="props.active ? 'secondary' : 'primary'"
        size="lg"
        class="rounded-full border shadow-lg transition-all"
        :class="
          props.active
            ? 'border-secondary ring-2 ring-secondary/40 shadow-secondary/25'
            : 'border-default'
        "
      />

      <span
        v-if="props.active"
        class="absolute -right-1 -top-1 size-3 rounded-full bg-secondary ring-2 ring-default"
      />
    </div>

    <template #body>
      <slot />
    </template>
  </UDrawer>
</template>
