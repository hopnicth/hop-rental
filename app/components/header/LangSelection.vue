<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { LocaleCode } from "~/types/locale";
import {
  LEGACY_I18N_COOKIE_NAME,
  LOCALE_COOKIE_NAME,
} from "~/utils/i18n-locale";

const { locale, setLocale } = useI18n();
const LANG_COOKIE_OPTS = {
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
const localeCookie = useCookie<LocaleCode | null>(
  LOCALE_COOKIE_NAME,
  LANG_COOKIE_OPTS,
);
const legacyLocaleCookie = useCookie<string | null>(
  LEGACY_I18N_COOKIE_NAME,
  LANG_COOKIE_OPTS,
);

const flagMap: Record<string, string> = {
  th: "circle-flags:th",
  en: "circle-flags:en",
  cn: "circle-flags:cn",
  jp: "circle-flags:jp",
};

const currentFlag = computed(() => flagMap[locale.value] ?? "bx:world");

async function chooseLocale(next: LocaleCode): Promise<void> {
  localeCookie.value = next;
  legacyLocaleCookie.value = next;
  await setLocale(next);
}

const items = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: "TH",
      icon: "circle-flags:th",
      onSelect: () => chooseLocale("th"),
    },
    {
      label: "EN",
      icon: "circle-flags:en",
      onSelect: () => chooseLocale("en"),
    },
    {
      label: "CN",
      icon: "circle-flags:cn",
      onSelect: () => chooseLocale("cn"),
    },
    {
      label: "JP",
      icon: "circle-flags:jp",
      onSelect: () => chooseLocale("jp"),
    },
  ],
]);
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton :icon="currentFlag" color="neutral" variant="soft" />
  </UDropdownMenu>
</template>
