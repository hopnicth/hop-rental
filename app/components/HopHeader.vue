<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import HopLogo from "./header/HopLogo.vue";
import LangSelection from "./header/LangSelection.vue";
import MobileMenu from "./header/MobileMenu.vue";
import NavMenu from "./header/NavMenu.vue";
import UserDropdown from "./header/UserDropdown.vue";
import HopSearch from "./header/HopSearch.vue";

const { t } = useI18n();
const route = useRoute();
const isMobileSearchOpen = ref(false);

watch(
  () => route.fullPath,
  () => {
    isMobileSearchOpen.value = false;
  },
);

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
  <UHeader
    :toggle="false"
    :ui="{
      left: 'flex items-center gap-2',
      center: 'hidden',
      right: 'flex items-center justify-end gap-1.5',
    }"
  >
    <template #left>
      <div class="flex items-center gap-2">
        <NuxtLink to="/" class="flex shrink-0 items-center gap-1">
          <HopLogo />
          <span class="hidden text-lg font-bold sm:inline">HOPNIC</span>
        </NuxtLink>

        <HopSearch class="ml-1 hidden w-72 lg:block" />
      </div>
    </template>

    <template #right>
      <NavMenu :items="navItems" class="hidden lg:flex" />
      <UDrawer
        v-model:open="isMobileSearchOpen"
        :title="t('search.title')"
        direction="top"
        :ui="{
          content: 'h-[50vh] flex-col overflow-hidden rounded-b-2xl',
          container: 'flex h-full w-full flex-col overflow-hidden',
          header: 'px-4 pt-4',
          body: 'flex-1 overflow-y-auto px-4 pb-4',
        }"
      >
        <UButton
          icon="bx:search"
          color="neutral"
          variant="soft"
          class="lg:hidden"
        />

        <template #body>
          <HopSearch
            v-if="isMobileSearchOpen"
            autofocus
            class="w-full max-w-none"
          />
        </template>
      </UDrawer>
      <MobileMenu :items="navItems" class="lg:hidden" />
      <LangSelection />
      <UserDropdown />
    </template>
  </UHeader>
</template>
