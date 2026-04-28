<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";

const props = defineProps<{
  items: NavigationMenuItem[];
}>();

const dropdownItems = computed<DropdownMenuItem[][]>(() => {
  const navGroup: DropdownMenuItem[] = props.items
    .filter((item) => item.label)
    .map((item) => ({
      label: item.label!,
      icon: item.icon as string | undefined,
      to: item.to as string | undefined,
    }));

  return [navGroup];
});
</script>

<template>
  <UDropdownMenu :items="dropdownItems">
    <UButton icon="bx:menu" color="neutral" variant="soft" />
  </UDropdownMenu>
</template>
