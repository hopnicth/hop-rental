<script setup lang="ts">
/**
 * B2B Company Profile section — read-only display.
 * Shows company name, tax_id, billing_address, KYC status.
 */
const { t } = useI18n();
const { currentCompany } = useCompanyContext();

const kycColor = computed(() => {
  const s = currentCompany.value?.kycStatus;
  if (s === "verified") return "success";
  if (s === "rejected") return "error";
  return "warning";
});
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ t("user.companyProfile") }}</h2>
          <UBadge
            v-if="currentCompany"
            :label="currentCompany.kycStatus"
            :color="kycColor"
            variant="subtle"
          />
        </div>
      </template>

      <!-- No company context -->
      <div v-if="!currentCompany" class="py-8 text-center">
        <UIcon name="bx:buildings" class="mx-auto mb-2 text-4xl text-muted" />
        <p class="text-muted">{{ t("user.comingSoon") }}</p>
      </div>

      <!-- Company info -->
      <div v-else class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <p class="text-xs text-muted">{{ t("user.companyProfile") }}</p>
            <p class="font-medium">{{ currentCompany.name }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Tax ID</p>
            <p class="font-medium">{{ currentCompany.taxId ?? "—" }}</p>
          </div>
        </div>

        <!-- Billing address -->
        <div v-if="currentCompany.billingAddress">
          <p class="mb-1 text-xs text-muted">{{ t("user.fullAddress") }}</p>
          <p class="text-sm">
            {{ currentCompany.billingAddress.line1 }}
            <template v-if="currentCompany.billingAddress.line2">, {{ currentCompany.billingAddress.line2 }}</template>
            <br />
            {{ currentCompany.billingAddress.subDistrict }},
            {{ currentCompany.billingAddress.district }},
            {{ currentCompany.billingAddress.province }}
            {{ currentCompany.billingAddress.postalCode }}
          </p>
        </div>

        <!-- Rejection reason -->
        <div
          v-if="currentCompany.kycStatus === 'rejected' && currentCompany.kycRejectionReason"
          class="rounded-lg border border-error/30 bg-error/5 p-4"
        >
          <p class="text-sm font-medium text-error">{{ t("user.rejectionReason") }}</p>
          <p class="mt-1 text-sm">{{ currentCompany.kycRejectionReason }}</p>
        </div>
      </div>
    </UCard>
  </div>
</template>

