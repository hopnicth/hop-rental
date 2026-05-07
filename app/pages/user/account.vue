<script setup lang="ts">
/**
 * Account Management — Dynamic Page (SPA-like).
 *
 * URL stays at /user/account. Clicking sidebar items switches
 * the active section without changing the route.
 *
 * Reuses:
 *  - useAuthSession() → isLoggedIn
 *  - AccountSidebar (emits "select")
 *  - Section components via <component :is>
 */
import type { Component } from "vue";
import AccountSidebar from "~/components/account/AccountSidebar.vue";
import SectionProfile from "~/components/account/SectionProfile.vue";
import SectionKyc from "~/components/account/SectionKyc.vue";
import SectionAddresses from "~/components/account/SectionAddresses.vue";
import SectionPoints from "~/components/account/SectionPoints.vue";
import SectionCompany from "~/components/account/SectionCompany.vue";
import SectionCredit from "~/components/account/SectionCredit.vue";
import SectionCompanyKyc from "~/components/account/SectionCompanyKyc.vue";
import SectionStaff from "~/components/account/SectionStaff.vue";
import SectionQuotations from "~/components/account/SectionQuotations.vue";
import SectionApprovals from "~/components/account/SectionApprovals.vue";
import {
  formatCompanyRole,
  formatContextMode,
  formatPlatformRole,
} from "~/utils/role-display";

const { isLoggedIn } = useAuthSession();
const route = useRoute();
const { t } = useI18n();
const { profile } = useUserProfile();
const {
  activeContext,
  memberships,
  currentCompany,
  loading: companyContextLoading,
  error: companyContextError,
  fetchMemberships,
  syncContextWithMemberships,
} = useCompanyContext();

const fallbackMembership = computed(() => memberships.value[0] ?? null);

const platformRoleLabel = computed(() =>
  formatPlatformRole(profile.value?.platformRole),
);

const companyRoleLabel = computed(() => {
  if (activeContext.value.role)
    return formatCompanyRole(activeContext.value.role);
  return formatCompanyRole(fallbackMembership.value?.member.role);
});

const activeCompanyLabel = computed(
  () =>
    currentCompany.value?.name ??
    activeContext.value.companyName ??
    fallbackMembership.value?.company.name ??
    "Personal customer account",
);

const contextModeLabel = computed(() =>
  formatContextMode(
    Boolean(currentCompany.value),
    Boolean(fallbackMembership.value),
  ),
);

async function ensureCompanyContext() {
  if (import.meta.server || !isLoggedIn.value) return;

  await fetchMemberships();
  syncContextWithMemberships();
}

// ── Auth guard — redirect if not logged in ──
watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`);
  }
});

watch(
  () => isLoggedIn.value,
  (loggedIn) => {
    if (loggedIn) {
      void ensureCompanyContext();
    }
  },
  { immediate: true },
);

// ── Section registry ──
const sectionMap: Record<string, Component> = {
  profile: markRaw(SectionProfile),
  kyc: markRaw(SectionKyc),
  addresses: markRaw(SectionAddresses),
  points: markRaw(SectionPoints),
  company: markRaw(SectionCompany),
  credit: markRaw(SectionCredit),
  "company-kyc": markRaw(SectionCompanyKyc),
  team: markRaw(SectionStaff),
  quotations: markRaw(SectionQuotations),
  approvals: markRaw(SectionApprovals),
};

// ── Active section state ──
const activeSection = ref("profile");

const currentComponent = computed(() => sectionMap[activeSection.value]);

function handleSelect(id: string) {
  activeSection.value = id;
}
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <!-- Page heading -->
    <h1 class="mb-6 text-2xl font-bold">{{ t("user.account") }}</h1>

    <UCard class="mb-6">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">Account Context</h2>
            <p class="text-sm text-muted">{{ contextModeLabel }}</p>
          </div>
          <UBadge
            v-if="currentCompany?.kycStatus"
            :label="`Company KYC: ${currentCompany.kycStatus}`"
            color="neutral"
            variant="subtle"
          />
        </div>
      </template>

      <div class="grid gap-4 sm:grid-cols-3">
        <div class="rounded-lg border p-4">
          <p class="text-xs font-medium tracking-wide text-muted uppercase">
            HOPNIC Role
          </p>
          <p class="mt-1 font-semibold">{{ platformRoleLabel }}</p>
        </div>

        <div class="rounded-lg border p-4">
          <p class="text-xs font-medium tracking-wide text-muted uppercase">
            Organization Role
          </p>
          <p class="mt-1 font-semibold">{{ companyRoleLabel }}</p>
        </div>

        <div class="rounded-lg border p-4">
          <p class="text-xs font-medium tracking-wide text-muted uppercase">
            Active Company
          </p>
          <p class="mt-1 font-semibold">{{ activeCompanyLabel }}</p>
        </div>
      </div>

      <p v-if="companyContextLoading" class="mt-4 text-sm text-muted">
        Syncing organization memberships...
      </p>
      <p v-else-if="companyContextError" class="mt-4 text-sm text-error">
        Organization membership sync error: {{ companyContextError }}
      </p>
    </UCard>

    <div class="grid grid-cols-12 gap-6">
      <!-- ── Desktop Sidebar (3 cols) ── -->
      <aside class="hidden lg:block lg:col-span-3">
        <UCard>
          <AccountSidebar
            :active-section="activeSection"
            @select="handleSelect"
          />
        </UCard>
      </aside>

      <!-- ── Mobile Sidebar ── -->
      <div class="col-span-12 lg:hidden">
        <UCard>
          <AccountSidebar
            :active-section="activeSection"
            @select="handleSelect"
          />
        </UCard>
      </div>

      <!-- ── Content Area (9 cols) — dynamic section ── -->
      <main class="col-span-12 lg:col-span-9">
        <component v-if="currentComponent" :is="currentComponent" />
        <UCard v-else>
          <div class="py-12 text-center">
            <UIcon name="bx:time" class="mx-auto mb-3 text-4xl text-muted" />
            <p class="text-lg font-medium text-muted">
              {{ t("user.comingSoon") }}
            </p>
          </div>
        </UCard>
      </main>
    </div>
  </UContainer>
</template>
