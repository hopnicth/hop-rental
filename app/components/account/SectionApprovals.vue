<script setup lang="ts">
/**
 * Approvals — placeholder section (organization admin only).
 * Coming soon UI for pending approvals workflow.
 */
const { t } = useI18n();
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">
          {{ t("user.pendingApprovals") }}
        </h2>
      </template>

      <div class="rounded-lg border border-dashed p-8 text-center">
        <UIcon
          name="bx:check-double"
          class="mx-auto mb-3 text-4xl text-muted"
        />
        <p class="text-lg font-medium text-muted">
          {{ t("user.comingSoon") }}
        </p>
        <p class="mt-1 text-sm text-muted">{{ t("user.pendingApprovals") }}</p>
      </div>
    </UCard>
  </div>
</template>
