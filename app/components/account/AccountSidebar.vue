<script setup lang="ts">
/**
 * Dynamic sidebar menu for Account Management.
 * Uses @click emit instead of route navigation (Dynamic Page pattern).
 * "Orders" item redirects to /user/orders (separate page).
 *
 * Reuses:
 *  - useCompanyContext() → isB2C, isB2BAdmin
 *  - i18n keys: user.*
 */

interface SidebarItem {
  /** Section identifier */
  id: string;
  label: string;
  icon: string;
  /** If set, navigates to this route instead of emitting select */
  to?: string;
}

interface SidebarGroup {
  header?: string;
  items: SidebarItem[];
}

const props = defineProps<{
  /** Currently active section ID */
  activeSection: string;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
}>();

const { t } = useI18n();
const { isB2C, isB2BAdmin } = useCompanyContext();
const router = useRouter();

const availablePaths = computed(
  () => new Set(router.getRoutes().map((route) => route.path)),
);

/** Handle item click — redirect or switch section */
function handleClick(item: SidebarItem) {
  if (item.to) {
    navigateTo(item.to);
  } else {
    emit("select", item.id);
  }
}

/** Build sidebar groups dynamically based on role */
const groups = computed<SidebarGroup[]>(() => {
  const result: SidebarGroup[] = [];

  // ── Group 1: Personal (ALL roles) ──
  const personalItems: SidebarItem[] = [
    { id: "profile", label: t("user.personalInfo"), icon: "bx:user" },
  ];

  // B2C only: KYC verification
  if (isB2C.value) {
    personalItems.push({
      id: "kyc",
      label: t("user.kyc"),
      icon: "bx:id-card",
    });
  }

  personalItems.push(
    { id: "addresses", label: t("user.addresses"), icon: "bx:map" },
    {
      id: "orders",
      label: t("user.orders"),
      icon: "bx:history",
      to: "/user/orders",
    },
    {
      id: "points",
      label: t("user.pointsRewards"),
      icon: "bx:gift",
    },
  );

  result.push({ items: personalItems });

  // ── Group 2: Company Hub (B2B Admin + User) ──
  if (!isB2C.value) {
    const companyItems: SidebarItem[] = [
      {
        id: "company",
        label: t("user.companyProfile"),
        icon: "bx:buildings",
      },
      {
        id: "credit",
        label: t("user.creditBilling"),
        icon: "bx:credit-card",
      },
      { id: "quotations", label: t("user.quotations"), icon: "bx:file" },
    ];

    if (isB2BAdmin.value) {
      companyItems.push(
        {
          id: "company-kyc",
          label: t("user.companyKyc"),
          icon: "bx:folder-open",
        },
        { id: "staff", label: t("user.manageStaff"), icon: "bx:group" },
      );
    }

    result.push({ header: t("user.companyHub"), items: companyItems });

    // ── Group 3: Transactions (B2B Admin only) ──
    if (isB2BAdmin.value) {
      result.push({
        header: t("user.transactions"),
        items: [
          {
            id: "approvals",
            label: t("user.pendingApprovals"),
            icon: "bx:check-shield",
          },
          {
            id: "company-orders",
            label: t("user.companyOrders"),
            icon: "bx:receipt",
            to: "/user/orders",
          },
        ],
      });
    }
  }

  return result
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.to || availablePaths.value.has(item.to),
      ),
    }))
    .filter((group) => group.items.length > 0);
});
</script>

<template>
  <nav :aria-label="t('user.accountMenu')">
    <div v-for="(group, gi) in groups" :key="gi" class="mb-4">
      <p
        v-if="group.header"
        class="mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase"
      >
        {{ group.header }}
      </p>

      <ul class="space-y-0.5">
        <li v-for="item in group.items" :key="item.id">
          <UButton
            :icon="item.icon"
            :label="item.label"
            variant="ghost"
            color="neutral"
            block
            class="justify-start"
            :class="{
              'bg-elevated': props.activeSection === item.id,
            }"
            @click="handleClick(item)"
          />
        </li>
      </ul>
    </div>
  </nav>
</template>
