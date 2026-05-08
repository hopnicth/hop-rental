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
    {
      title: "Orders & Bookings",
      description:
        "Customer-grouped view of sale orders and rental bookings with QR scan, filters, and lazy load.",
      to: "/admin/orders",
    },
    {
      title: "POS & Fulfillment",
      description:
        "Phone-first customer lookup, ID-card capture, pre-booked pick-list, pickup signature, and return flow.",
      to: "/admin/pos",
    },
    {
      title: "Messages",
      description:
        "Support inbox for customer conversations, unread indicators, and admin replies.",
      to: "/admin/messages",
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
        title: "Filter Groups",
        description:
          "Define dynamic product filters per main category (checkbox, dropdown, number range).",
        to: "/admin/filter-groups",
      },
      {
        title: "Home Content",
        description:
          "Manage homepage banners, link cards, and curated featured rails.",
        to: "/admin/home-content",
      },
      {
        title: "Home Categories",
        description:
          "Manage the editable category card groups and dropdown options shown on the homepage.",
        to: "/admin/home-categories",
      },
      {
        title: "Settings",
        description:
          "Manage public contact options used by guest chat support actions.",
        to: "/admin/settings",
      },
      {
        title: "Content Pages",
        description:
          "Manage blog, services, and promotions with reusable content blocks.",
        to: "/admin/content",
      },
    );
  }

  return items;
});
</script>

<template>
  <div class="space-y-6">
    <UCard class="border-primary/30 bg-primary/5">
      <div
        class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-primary">
            Staff shortcut
          </p>
          <h2 class="text-2xl font-bold">POS หน้าร้าน</h2>
          <p class="mt-1 text-sm text-muted">
            สแกน QR, ค้นหาด้วยเบอร์, เก็บบัตรประชาชน, ทำ Pickup/Return
            ได้จากจุดเดียว
          </p>
        </div>
        <UButton
          to="/admin/pos"
          icon="bx:store"
          label="เปิดหน้า POS"
          color="primary"
          size="xl"
          class="justify-center"
        />
      </div>
    </UCard>

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
