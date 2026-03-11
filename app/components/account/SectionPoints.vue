<script setup lang="ts">
/**
 * Points & Rewards — placeholder section.
 * Shows mock point balance and coming-soon UI.
 */
const { t } = useI18n();
const { profile } = useUserProfile();

// Mock data for demo
const mockPoints = 1_250;
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t("user.pointsRewards") }}</h2>
      </template>

      <!-- Points balance -->
      <div class="flex items-center gap-4 rounded-lg bg-primary/5 p-6">
        <UIcon name="bx:coin-stack" class="text-4xl text-primary" />
        <div>
          <p class="text-sm text-muted">{{ t("user.totalPoints") }}</p>
          <p class="text-3xl font-bold">{{ mockPoints.toLocaleString() }}</p>
        </div>
      </div>

      <!-- Membership badge -->
      <div v-if="profile?.membershipLevel" class="mt-4 flex items-center gap-2">
        <UIcon name="bx:medal" class="text-lg" />
        <span class="text-sm font-medium">{{ t("user.membershipLevel") }}:</span>
        <UBadge
          :label="t(`user.member${profile.membershipLevel.charAt(0).toUpperCase() + profile.membershipLevel.slice(1)}`)"
          :color="profile.membershipLevel === 'gold' ? 'warning' : profile.membershipLevel === 'silver' ? 'neutral' : 'info'"
          variant="subtle"
        />
      </div>

      <!-- Coming soon -->
      <div class="mt-6 rounded-lg border border-dashed p-8 text-center">
        <UIcon name="bx:gift" class="mx-auto mb-3 text-4xl text-muted" />
        <p class="text-lg font-medium text-muted">{{ t("user.comingSoon") }}</p>
        <p class="mt-1 text-sm text-muted">{{ t("user.redeemPoints") }}</p>

        <UButton
          :label="t('user.redeemPoints')"
          icon="bx:gift"
          color="primary"
          variant="outline"
          class="mt-4"
          disabled
        />
      </div>
    </UCard>
  </div>
</template>

