<script setup lang="ts">
import HopHeader from "~/components/HopHeader.vue";
import { formatPlatformRole } from "~/utils/role-display";

const route = useRoute();
const { profile, loading, ensureProfileLoaded } = useUserProfile();

const navItems = [
  { label: "Overview", to: "/admin" },
  { label: "Products", to: "/admin/products" },
  { label: "Rental Accesses", to: "/admin/rental-accesses" },
  { label: "Matches", to: "/admin/matches" },
];

const roleLabel = computed(() => {
  if (profile.value?.platformRole) {
    return formatPlatformRole(profile.value.platformRole);
  }

  if (loading.value) {
    return "Loading role...";
  }

  return "Admin session";
});

if (import.meta.client) {
  void ensureProfileLoaded();
}
</script>

<template>
  <HopHeader />
  <UMain class="min-h-screen bg-[var(--ui-bg-elevated)]/30">
    <UContainer class="py-6">
      <div
        class="mb-6 rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
      >
        <div
          class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ui-primary)]"
            >
              Admin MVP
            </p>
            <h1 class="text-2xl font-semibold text-[var(--ui-text)]">
              Catalog & rental backoffice
            </h1>
            <p class="text-sm text-[var(--ui-text-muted)]">
              Lightweight internal area for products, rental packages, and
              matching.
            </p>
          </div>

          <UBadge color="warning" variant="soft" size="lg">
            {{ roleLabel }}
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
