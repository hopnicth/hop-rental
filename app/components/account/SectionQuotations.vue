<script setup lang="ts">
/**
 * Quotations — placeholder section.
 * Coming soon UI for quotation management.
 */
const { t } = useI18n();
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t("user.quotations") }}</h2>
      </template>

      <div class="rounded-lg border border-dashed p-8 text-center">
        <UIcon name="bx:file" class="mx-auto mb-3 text-4xl text-muted" />
        <p class="text-lg font-medium text-muted">
          {{ t("user.comingSoon") }}
        </p>
        <p class="mt-1 text-sm text-muted">{{ t("user.quotations") }}</p>
      </div>
    </UCard>
  </div>
</template>

