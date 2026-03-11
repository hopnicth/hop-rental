<script setup lang="ts">
/**
 * B2B Credit & Billing section — read-only display.
 * Shows credit_limit, credit_used, remaining, credit_term_days, billing_cycle.
 */
const { t } = useI18n();
const { currentCompany, creditRemaining } = useCompanyContext();

function formatCurrency(val: number): string {
  return val.toLocaleString("th-TH", { style: "currency", currency: "THB" });
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t("user.creditBilling") }}</h2>
      </template>

      <!-- No company context -->
      <div v-if="!currentCompany" class="py-8 text-center">
        <UIcon name="bx:credit-card" class="mx-auto mb-2 text-4xl text-muted" />
        <p class="text-muted">{{ t("user.comingSoon") }}</p>
      </div>

      <div v-else class="space-y-6">
        <!-- Credit gauge -->
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="rounded-lg bg-primary/5 p-4 text-center">
            <p class="text-xs text-muted">Credit Limit</p>
            <p class="text-xl font-bold">{{ formatCurrency(currentCompany.creditLimit) }}</p>
          </div>
          <div class="rounded-lg bg-error/5 p-4 text-center">
            <p class="text-xs text-muted">Used</p>
            <p class="text-xl font-bold text-error">{{ formatCurrency(currentCompany.creditUsed) }}</p>
          </div>
          <div class="rounded-lg bg-success/5 p-4 text-center">
            <p class="text-xs text-muted">Remaining</p>
            <p class="text-xl font-bold text-success">{{ formatCurrency(creditRemaining) }}</p>
          </div>
        </div>

        <!-- Usage bar -->
        <div>
          <div class="mb-1 flex justify-between text-xs text-muted">
            <span>0%</span>
            <span>{{ currentCompany.creditLimit > 0 ? Math.round((currentCompany.creditUsed / currentCompany.creditLimit) * 100) : 0 }}% used</span>
          </div>
          <UProgress
            :model-value="currentCompany.creditLimit > 0 ? (currentCompany.creditUsed / currentCompany.creditLimit) * 100 : 0"
            :color="currentCompany.creditUsed / currentCompany.creditLimit > 0.8 ? 'error' : 'primary'"
          />
        </div>

        <!-- Terms -->
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <p class="text-xs text-muted">Credit Term</p>
            <p class="font-medium">
              {{ currentCompany.creditTermDays === 0 ? "Cash" : `${currentCompany.creditTermDays} days` }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">Billing Cycle</p>
            <p class="font-medium capitalize">{{ currentCompany.billingCycle }}</p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

