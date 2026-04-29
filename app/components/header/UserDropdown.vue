<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { formatCompanyRole, formatPlatformRole } from "~/utils/role-display";

const { t } = useI18n();
const { isLoggedIn, displayName, avatarUrl, userEmail, logout } =
  useAuthSession();
const { profile } = useUserProfile();
const { activeContext, currentCompany, memberships } = useCompanyContext();

const currentRoleIcon = computed(() => {
  if (activeContext.value.role === "b2b_admin") return "bx:shield";
  if (activeContext.value.role === "b2b_user") return "bx:briefcase";
  if (memberships.value[0]?.member.role === "b2b_admin") return "bx:shield";
  if (memberships.value[0]?.member.role === "b2b_user") return "bx:briefcase";
  if (profile.value?.platformRole === "super_admin") return "bx:crown";
  if (profile.value?.platformRole === "staff") return "bx:id-card";
  return "bx:user";
});

const companyRoleLabel = computed(() => {
  if (activeContext.value.role)
    return formatCompanyRole(activeContext.value.role);
  return memberships.value.length > 0
    ? formatCompanyRole(memberships.value[0]!.member.role)
    : "—";
});

const currentCompanyLabel = computed(
  () =>
    currentCompany.value?.name ??
    activeContext.value.companyName ??
    memberships.value[0]?.company.name ??
    null,
);

// ── Dropdown items: Logged-in (Phase A generic) ──
const loggedInItems = computed<DropdownMenuItem[][]>(() => {
  const summaryItems: DropdownMenuItem[] = [
    {
      label: displayName.value || userEmail.value,
      icon: "bx:user",
      disabled: true,
    },
    {
      label: `HOPNIC Role: ${formatPlatformRole(profile.value?.platformRole)}`,
      icon: "bx:id-card",
      disabled: true,
    },
    {
      label: `Organization Role: ${companyRoleLabel.value}`,
      icon: currentRoleIcon.value,
      disabled: true,
    },
  ];

  if (currentCompanyLabel.value) {
    summaryItems.push({
      label: `Company: ${currentCompanyLabel.value}`,
      icon: "bx:buildings",
      disabled: true,
    });
  }

  return [
    summaryItems,
    [
      {
        label: t("user.activeRentals"),
        icon: "bx:box",
        to: "/user/rentals",
      },
      {
        label: t("user.orders"),
        icon: "bx:history",
        to: "/user/orders",
      },
    ],
    [
      {
        label: t("user.account"),
        icon: "bx:user-circle",
        to: "/user/account",
      },
      {
        label: t("user.settings"),
        icon: "bx:cog",
      },
    ],
    [
      {
        label: t("user.logout"),
        icon: "bx:log-out",
        color: "error" as const,
        onSelect: () => logout(),
      },
    ],
  ];
});

// ── Dropdown items: Not logged-in ──
const guestItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t("user.signIn"),
      icon: "bx:log-in",
      to: "/user/login",
    },
    {
      label: t("user.signUp"),
      icon: "bx:user-plus",
      to: "/user/login",
    },
  ],
]);
</script>

<template>
  <!-- Always icon-only button → dropdown -->
  <UDropdownMenu :items="isLoggedIn ? loggedInItems : guestItems">
    <UButton color="neutral" variant="ghost" class="gap-2 rounded-full">
      <UAvatar
        v-if="isLoggedIn && avatarUrl"
        :src="avatarUrl"
        :alt="displayName"
        size="2xs"
      />
      <UIcon v-else name="bx:user" class="size-5" />
    </UButton>
  </UDropdownMenu>
</template>
