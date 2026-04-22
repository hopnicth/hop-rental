<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

const sections = [
  {
    title: "Products",
    description: "Prepare sale catalog rows and basic product metadata.",
    to: "/admin/products",
  },
  {
    title: "Rental Accesses",
    description: "Manage rental packages/sets exposed to the storefront.",
    to: "/admin/rental-accesses",
  },
  {
    title: "Matches",
    description: "Link rental access packages to products for booking compatibility.",
    to: "/admin/matches",
  },
];
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Admin entry point</h2>
          <p class="text-sm text-[var(--ui-text-muted)]">
            Phase 1 is scaffolded. Next step is wiring real CRUD forms and storage upload.
          </p>
        </div>
      </template>

      <div class="grid gap-4 md:grid-cols-3">
        <UCard v-for="section in sections" :key="section.to" variant="subtle">
          <div class="space-y-3">
            <div>
              <h3 class="font-medium">{{ section.title }}</h3>
              <p class="text-sm text-[var(--ui-text-muted)]">
                {{ section.description }}
              </p>
            </div>
            <UButton :to="section.to" variant="soft" color="primary" size="sm">
              Open
            </UButton>
          </div>
        </UCard>
      </div>
    </UCard>

    <UAlert
      color="info"
      variant="soft"
      title="Current scope"
      description="This admin MVP currently provides routing, layout, and access control. CRUD screens are scaffolded next."
    />
  </div>
</template>
