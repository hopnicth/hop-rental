<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import QrcodeVue from "qrcode.vue";
import { formatCompanyRole, formatPlatformRole } from "~/utils/role-display";

const { t } = useI18n();
const { isLoggedIn, displayName, avatarUrl, userEmail, logout } =
  useAuthSession();
const {
  profile,
  loading: profileLoading,
  ensureProfileLoaded,
} = useUserProfile();
const { activeContext, currentCompany, memberships } = useCompanyContext();
const isQrModalOpen = ref(false);
const isQrProfileResolving = ref(false);

const customerQrPayload = computed(() =>
  profile.value?.id ? `customer:${profile.value.id}` : "",
);

const isCustomerQrLoading = computed(
  () =>
    !customerQrPayload.value &&
    (isQrProfileResolving.value || profileLoading.value),
);

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

async function openCustomerQrModal() {
  if (customerQrPayload.value) {
    isQrModalOpen.value = true;
    return;
  }

  isQrModalOpen.value = true;
  isQrProfileResolving.value = true;

  try {
    await ensureProfileLoaded(null, { force: true });
  } finally {
    isQrProfileResolving.value = false;
  }
}

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
        label: "QR Code ของฉัน",
        icon: "bx:qr",
        onSelect: () => {
          void openCustomerQrModal();
        },
      },
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
      {
        label: t("user.wishlist"),
        icon: "bx:heart",
        to: "/user/wishlist",
      },
      {
        label: t("user.saveList"),
        icon: "bx:bookmark",
        to: "/user/save-list",
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

  <UModal v-model:open="isQrModalOpen" title="QR Code ของฉัน">
    <template #body>
      <div
        v-if="isCustomerQrLoading"
        class="flex flex-col items-center gap-3 px-2 py-6 text-center text-sm text-muted"
      >
        <UIcon name="bx:loader-alt" class="size-6 animate-spin" />
        <p>กำลังโหลดข้อมูลผู้ใช้สำหรับสร้าง QR Code...</p>
      </div>

      <div
        v-else-if="customerQrPayload"
        class="flex flex-col items-center gap-4 px-2 py-4 text-center"
      >
        <div class="rounded-2xl border bg-white p-4 shadow-sm">
          <QrcodeVue :value="customerQrPayload" :size="220" level="H" />
        </div>

        <div class="space-y-1">
          <p class="text-sm font-semibold text-highlighted">
            {{ profile?.fullName || userEmail }}
          </p>
          <p class="font-mono text-xs text-muted">
            {{ profile?.id }}
          </p>
        </div>
      </div>

      <div v-else class="py-6 text-center text-sm text-muted">
        ยังไม่พบข้อมูลผู้ใช้สำหรับสร้าง QR Code
      </div>
    </template>
  </UModal>
</template>
