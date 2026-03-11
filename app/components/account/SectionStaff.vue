<script setup lang="ts">
/**
 * B2B Staff Management — placeholder section.
 *
 * Lists company members from useCompanyContext().memberships.
 * Full invite/remove functionality will be added later.
 */
const { t } = useI18n();
const { currentCompany, memberships } = useCompanyContext();

// Filter members of current company
const companyMembers = computed(() => {
  if (!currentCompany.value) return [];
  return memberships.value.filter(
    (m) => m.company.id === currentCompany.value!.id,
  );
});
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ t("user.staffManagement") }}</h2>
          <UButton
            :label="t('user.inviteStaff')"
            icon="bx:user-plus"
            size="sm"
            color="primary"
            variant="soft"
            disabled
          />
        </div>
      </template>

      <!-- No company context -->
      <div v-if="!currentCompany" class="py-8 text-center">
        <UIcon name="bx:group" class="mx-auto mb-2 text-4xl text-muted" />
        <p class="text-muted">{{ t("user.comingSoon") }}</p>
      </div>

      <!-- Members list -->
      <div v-else-if="companyMembers.length" class="space-y-3">
        <div
          v-for="m in companyMembers"
          :key="m.member.id"
          class="flex items-center justify-between rounded-lg border p-3"
        >
          <div class="flex items-center gap-3">
            <UIcon name="bx:user" class="text-xl text-muted" />
            <div>
              <p class="text-sm font-medium">{{ m.member.userId }}</p>
              <p class="text-xs text-muted">
                {{ t("user.role") }}: {{ m.member.role }}
              </p>
            </div>
          </div>
          <div class="text-right">
            <UBadge
              :label="m.member.role"
              :color="m.member.role === 'b2b_admin' ? 'primary' : 'neutral'"
              variant="subtle"
              size="xs"
            />
            <p v-if="m.member.joinedAt" class="mt-1 text-xs text-muted">
              {{ t("user.joinedDate") }}:
              {{ new Date(m.member.joinedAt).toLocaleDateString() }}
            </p>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="py-8 text-center">
        <UIcon name="bx:group" class="mx-auto mb-2 text-4xl text-muted" />
        <p class="text-muted">{{ t("user.noStaff") }}</p>
      </div>

      <!-- Coming soon note -->
      <div class="mt-4 rounded-lg border border-dashed p-4 text-center">
        <UIcon name="bx:wrench" class="mx-auto mb-2 text-2xl text-muted" />
        <p class="text-sm text-muted">{{ t("user.comingSoon") }}</p>
      </div>
    </UCard>
  </div>
</template>

