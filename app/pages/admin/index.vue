<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

const { profile } = useUserProfile();

const sections = computed(() => {
  const items = [
    {
      title: "Products",
      description:
        "Manage catalog products, main category, tags, JSONB specs, and SKU albums.",
      to: "/admin/products",
    },
    {
      title: "Assets",
      description: "Manage asset packages/sets exposed to the storefront.",
      to: "/admin/assets",
    },
    {
      title: "Branch & Inventory",
      description:
        "Manage store branches and inventory stock per branch. Branch editing is super-admin only.",
      to: "/admin/branches-inventory",
    },
  ];

  if (profile.value?.platformRole === "super_admin") {
    items.push(
      {
        title: "Main Categories",
        description:
          "Create and control the primary categories that product forms are allowed to use.",
        to: "/admin/main-categories",
      },
      {
        title: "Home Content",
        description:
          "Manage homepage banners, link cards, and curated featured rails.",
        to: "/admin/home-content",
      },
    );
  }

  return items;
});
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Admin entry point</h2>
          <p class="text-sm text-muted">
            Admin now covers catalog, assets, inventory, and super-admin
            content/category tools. Product matches are managed inline from each
            asset.
          </p>
        </div>
      </template>

      <div class="grid gap-4 md:grid-cols-3">
        <UCard v-for="section in sections" :key="section.to" variant="subtle">
          <div class="space-y-3">
            <div>
              <h3 class="font-medium">{{ section.title }}</h3>
              <p class="text-sm text-muted">
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
      description="Use Main Categories first, then create/update Products with strict primary category selection, flexible tags, JSONB spec/detail fields, and SKU-level albums/attributes."
    />
  </div>
</template>
