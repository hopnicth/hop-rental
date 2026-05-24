<script setup lang="ts">
import HopHeader from "~/components/HopHeader.vue";
import { formatPlatformRole } from "~/utils/role-display";

interface AdminNavItem {
  label: string;
  to: string;
  badge?: string | null;
}

interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

const route = useRoute();
const { profile } = useUserProfile();
const { unresolvedTotal, refreshUnresolvedCount, subscribe, unsubscribe } =
  useAdminPaymentAlerts();
const {
  refundWorkSummary,
  refreshRefundWorkSummary,
  subscribeRefundWork,
  unsubscribeRefundWork,
} = useAdminRefundWork();

onMounted(() => {
  subscribe();
  subscribeRefundWork();
  void refreshUnresolvedCount();
  void refreshRefundWorkSummary();
});
onBeforeUnmount(() => {
  unsubscribe();
  unsubscribeRefundWork();
});

const alertsBadge = computed(() => {
  if (!unresolvedTotal.value) return null;
  return unresolvedTotal.value > 99 ? "99+" : String(unresolvedTotal.value);
});
const refundsBadge = computed(() => {
  const total = refundWorkSummary.value.unresolved_total;
  if (!total) return null;
  return total > 99 ? "99+" : String(total);
});

function isActiveNavItem(item: AdminNavItem): boolean {
  return route.path === item.to || route.path.startsWith(`${item.to}/`);
}

const navGroups = computed<AdminNavGroup[]>(() => {
  const groups: AdminNavGroup[] = [
    {
      label: "Main",
      items: [{ label: "Overview", to: "/admin" }],
    },
    {
      label: "Catalog",
      items: [
        { label: "Products", to: "/admin/products" },
        { label: "Assets", to: "/admin/assets" },
      ],
    },
    {
      label: "Rental & ops",
      items: [
        { label: "Branch & Inventory", to: "/admin/branches-inventory" },
        { label: "Orders", to: "/admin/orders" },
        { label: "Booking Manager", to: "/admin/rental-bookings" },
        { label: "POS", to: "/admin/pos" },
        { label: "POS V3", to: "/admin/pos-v3" },
        { label: "Refunds", to: "/admin/refunds", badge: refundsBadge.value },
        { label: "Alerts", to: "/admin/alerts", badge: alertsBadge.value },
        { label: "Messages", to: "/admin/messages" },
      ],
    },
    {
      label: "Partners",
      items: [{ label: "Partner Directory", to: "/admin/partners" }],
    },
  ];

  if (profile.value?.platformRole === "super_admin") {
    groups.push(
      {
        label: "Taxonomy",
        items: [
          { label: "Main Categories", to: "/admin/main-categories" },
          { label: "Filter Groups", to: "/admin/filter-groups" },
        ],
      },
      {
        label: "Content",
        items: [
          { label: "Content", to: "/admin/content" },
          { label: "Home Content", to: "/admin/home-content" },
          { label: "Home Categories", to: "/admin/home-categories" },
          { label: "Settings", to: "/admin/settings" },
        ],
      },
    );
  }

  return groups;
});
</script>

<template>
  <div>
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

            <div class="flex flex-wrap items-center gap-2">
              <UButton
                to="/admin/pos"
                icon="bx:store"
                label="เปิด POS หน้าร้าน"
                color="primary"
                size="lg"
                class="shadow-sm"
              />
              <UBadge color="warning" variant="soft" size="lg">
                {{ formatPlatformRole(profile?.platformRole) }}
              </UBadge>
            </div>
          </div>

          <div class="mt-5 space-y-3">
            <div
              v-for="group in navGroups"
              :key="group.label"
              class="rounded-xl border border-default bg-(--ui-bg-elevated)/40 p-3"
            >
              <p
                class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
              >
                {{ group.label }}
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="item in group.items"
                  :key="item.to"
                  :to="item.to"
                  :variant="isActiveNavItem(item) ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  class="justify-start"
                >
                  {{ item.label }}
                  <UBadge
                    v-if="item.badge"
                    color="error"
                    variant="solid"
                    size="xs"
                    class="ml-1"
                  >
                    {{ item.badge }}
                  </UBadge>
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <slot />
      </UContainer>
    </UMain>
  </div>
</template>
