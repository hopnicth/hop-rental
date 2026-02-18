<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import HopLogo from "./header/HopLogo.vue";
import LangSelection from "./header/LangSelection.vue";
import MobileMenu from "./header/MobileMenu.vue";
import NavMenu from "./header/NavMenu.vue";
import UserDropdown from "./header/UserDropdown.vue";
import HopSearch from "./header/HopSearch.vue";

const { t } = useI18n();

const navItems = computed<NavigationMenuItem[]>(() => [
  {
    label: t("nav.product"),
    icon: "bxs-package",
    to: "/product-all",
    children: [
      {
        label: t("nav.toolsSet"),
        to: "/product",
        description: t("nav.toolsSetDesc"),
      },
      {
        label: t("nav.tools"),
        to: "/product",
        description: t("nav.toolsDesc"),
      },
      {
        label: t("nav.measurement"),
        to: "/",
        description: t("nav.measurementDesc"),
      },
    ],
  },
  {
    label: t("nav.rental"),
    icon: "bxs-package",
    children: [
      {
        label: t("nav.toolsSet"),
        to: "/rental",
        description: t("nav.toolsSetDesc"),
      },
      { label: t("nav.tools"), to: "/rental", description: t("nav.toolsDesc") },
      {
        label: t("nav.measurement"),
        to: "/",
        description: t("nav.measurementDesc"),
      },
    ],
  },
  { label: t("nav.about"), icon: "bxs-package", to: "/about" },
  { label: t("nav.contact"), icon: "bxs-package", to: "/contact" },
  { label: t("nav.blog"), icon: "bxs-package", to: "/blog" },
]);
</script>

<template>
  <UHeader :toggle="false">
    <template #title>
      <HopLogo />
      <span class="hidden text-lg font-bold sm:inline">HOPNIC</span>
      <span>
        <HopSearch class="ml-4" />
      </span>
    </template>

    <template #right>
      <NavMenu :items="navItems" class="hidden lg:flex" />
      <MobileMenu :items="navItems" class="lg:hidden" />
      <LangSelection />
      <UserDropdown class="hidden lg:flex" />
    </template>
  </UHeader>
</template>
