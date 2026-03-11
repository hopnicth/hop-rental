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

const { isLoggedIn } = useAuthSession();
const { t } = useI18n();

// ── Auth guard — redirect if not logged in ──
watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo("/user/login");
  }
});

// ── Section registry ──
const sectionMap: Record<string, Component> = {
  profile: markRaw(SectionProfile),
  kyc: markRaw(SectionKyc),
  addresses: markRaw(SectionAddresses),
  points: markRaw(SectionPoints),
  company: markRaw(SectionCompany),
  credit: markRaw(SectionCredit),
  "company-kyc": markRaw(SectionCompanyKyc),
  staff: markRaw(SectionStaff),
  quotations: markRaw(SectionQuotations),
  approvals: markRaw(SectionApprovals),
};

// ── Active section state ──
const activeSection = ref("profile");

const currentComponent = computed(() => sectionMap[activeSection.value]);

function handleSelect(id: string) {
  activeSection.value = id;
  mobileMenuOpen.value = false;
}

// ── Mobile sidebar toggle ──
const mobileMenuOpen = ref(false);
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <!-- Page heading -->
    <h1 class="mb-6 text-2xl font-bold">{{ t("user.account") }}</h1>

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

      <!-- ── Mobile Sidebar Toggle ── -->
      <div class="col-span-12 lg:hidden">
        <UButton
          block
          color="neutral"
          variant="soft"
          icon="bx:menu"
          :label="t('user.accountMenu')"
          @click="mobileMenuOpen = !mobileMenuOpen"
        />
        <UCard v-if="mobileMenuOpen" class="mt-2">
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
