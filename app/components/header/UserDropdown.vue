<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const { t } = useI18n();
const { isLoggedIn, displayName, avatarUrl, userEmail, logout } =
  useAuthSession();

// ── Dropdown items: Logged-in (Phase A generic) ──
const loggedInItems = computed<DropdownMenuItem[][]>(() => [
  // Header — name + email (non-clickable)
  [
    {
      label: displayName.value || userEmail.value,
      icon: "bx:user",
      disabled: true,
    },
  ],
  // Group 1 — Core Transactions
  [
    {
      label: t("user.activeRentals"),
      icon: "bx:box",
    },
    {
      label: t("user.orders"),
      icon: "bx:history",
    },
  ],
  // Group 2 — Account Management
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
  // Group 3 — Action
  [
    {
      label: t("user.logout"),
      icon: "bx:log-out",
      color: "error" as const,
      onSelect: () => logout(),
    },
  ],
]);

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
    <UButton color="neutral" variant="ghost" class="rounded-full">
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
