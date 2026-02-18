<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const { locale, setLocale } = useI18n();

const flagMap: Record<string, string> = {
  th: "circle-flags:th",
  en: "circle-flags:en",
  cn: "circle-flags:cn",
  jp: "circle-flags:jp",
};

const currentFlag = computed(() => flagMap[locale.value] ?? "bx:world");

const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: "TH", icon: "circle-flags:th", onSelect: () => setLocale("th") },
    { label: "EN", icon: "circle-flags:en", onSelect: () => setLocale("en") },
    { label: "CN", icon: "circle-flags:cn", onSelect: () => setLocale("cn") },
    { label: "JP", icon: "circle-flags:jp", onSelect: () => setLocale("jp") },
  ],
]);
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton :icon="currentFlag" color="neutral" variant="soft" />
  </UDropdownMenu>
</template>
