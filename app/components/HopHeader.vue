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
  },
  {
    label: t("nav.rental"),
    icon: "bxs-package",
    to: "/product-rental",
  },
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
      <UserDropdown />
    </template>
  </UHeader>
</template>
