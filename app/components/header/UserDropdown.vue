<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const { t } = useI18n();

const items = computed<DropdownMenuItem[]>(() => [
  {
    label: t("user.profile"),
    icon: "bx:user",
  },
]);
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton icon="bx:user" color="neutral" variant="soft" />
  </UDropdownMenu>
</template>
