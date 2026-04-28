<script setup lang="ts">
import HopHeader from "~/components/HopHeader.vue";
import { formatPlatformRole } from "~/utils/role-display";

const route = useRoute();
const { profile } = useUserProfile();

const navItems = computed(() => {
  const items = [
    { label: "Overview", to: "/admin" },
    { label: "Products", to: "/admin/products" },
    { label: "Assets", to: "/admin/assets" },
    { label: "Branch & Inventory", to: "/admin/branches-inventory" },
    { label: "Orders", to: "/admin/orders" },
  ];

  if (profile.value?.platformRole === "super_admin") {
    items.push(
      { label: "Content", to: "/admin/content" },
      { label: "Home Content", to: "/admin/home-content" },
      { label: "Home Categories", to: "/admin/home-categories" },
      { label: "Main Categories", to: "/admin/main-categories" },
      { label: "Filter Groups", to: "/admin/filter-groups" },
    );
  }

  return items;
});
</script>

<template>
  <HopHeader />
  <UMain class="min-h-screen bg-(--ui-bg-elevated)/30">
    <UContainer class="py-6">
      <div
        class="mb-6 rounded-2xl border border-default bg-white p-4 shadow-sm"
      >
        <div
          class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-[0.2em] text-primary"
            >
              Admin MVP
            </p>
            <h1 class="text-2xl font-semibold text-default">
              Catalog & rental backoffice
            </h1>
            <p class="text-sm text-muted">
              Lightweight internal area for products, assets, and inventory.
            </p>
          </div>

          <UBadge color="warning" variant="soft" size="lg">
            {{ formatPlatformRole(profile?.platformRole) }}
          </UBadge>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :variant="route.path === item.to ? 'solid' : 'soft'"
            color="primary"
            size="sm"
          >
            {{ item.label }}
          </UButton>
        </div>
      </div>

      <slot />
    </UContainer>
  </UMain>
</template>
