<script setup lang="ts">
/**
 * Hopnic company bank-transfer details for manual payment (rental deposits +
 * sale orders). Reads the single central config (utils/payment-account) — no
 * hard-coded bank details. Business-friendly display only: bank, account name,
 * account number with a copy button, branch, and a company trust block (legal
 * name, tax id, VAT). No passbook/PDF, no download links.
 */
import {
  HOPNIC_PAYMENT_ACCOUNT,
  HOPNIC_COMPANY_INFO,
  HOPNIC_PAYMENT_ACCOUNT_IS_PLACEHOLDER,
  type LocalizedText,
} from "~/utils/payment-account";

const { t, locale } = useI18n();
const toast = useToast();
const copied = ref(false);

function localized(value: LocalizedText): string {
  return locale.value === "en" ? value.en : value.th;
}

async function copyAccountNumber(): Promise<void> {
  try {
    if (import.meta.client && navigator.clipboard) {
      await navigator.clipboard.writeText(HOPNIC_PAYMENT_ACCOUNT.accountNumber);
      copied.value = true;
      toast.add({ title: t("paymentBank.copied"), color: "success" });
      setTimeout(() => (copied.value = false), 2000);
    }
  } catch {
    // clipboard unavailable — silent; the number is visible to copy manually.
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">{{ t("paymentBank.title") }}</h2>
    </template>
    <div class="space-y-2 text-sm">
      <UAlert
        color="warning"
        variant="soft"
        icon="bx:shield"
        :description="t('paymentBank.transferOnlyNote')"
      />
      <div class="flex justify-between gap-3">
        <span class="text-muted">{{ t("paymentBank.bankName") }}</span>
        <span class="font-medium">{{ localized(HOPNIC_PAYMENT_ACCOUNT.bankName) }}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">{{ t("paymentBank.accountName") }}</span>
        <span class="font-medium">{{ localized(HOPNIC_PAYMENT_ACCOUNT.accountName) }}</span>
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-muted">{{ t("paymentBank.accountNumber") }}</span>
        <span class="flex items-center gap-2">
          <span class="font-mono font-medium">{{
            HOPNIC_PAYMENT_ACCOUNT.accountNumber
          }}</span>
          <UButton
            size="xs"
            variant="soft"
            :icon="copied ? 'bx:check' : 'bx:copy'"
            :aria-label="t('paymentBank.copy')"
            @click="copyAccountNumber"
          />
        </span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">{{ t("paymentBank.branch") }}</span>
        <span class="font-medium">{{ localized(HOPNIC_PAYMENT_ACCOUNT.branch) }}</span>
      </div>

      <div class="space-y-1 border-t pt-2">
        <div class="flex justify-between gap-3">
          <span class="text-muted">{{ t("paymentBank.companyName") }}</span>
          <span class="font-medium">{{ localized(HOPNIC_COMPANY_INFO.legalName) }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span class="text-muted">{{ t("paymentBank.taxId") }}</span>
          <span class="font-mono font-medium">{{ HOPNIC_COMPANY_INFO.taxId }}</span>
        </div>
        <div v-if="HOPNIC_COMPANY_INFO.vatRegistered" class="text-xs text-muted">
          {{ t("paymentBank.vatRegistered") }}
        </div>
      </div>

      <UAlert
        color="info"
        variant="soft"
        icon="bx:info-circle"
        class="mt-2"
        :description="t('paymentBank.afterTransferNote')"
      />
      <UAlert
        v-if="HOPNIC_PAYMENT_ACCOUNT_IS_PLACEHOLDER"
        color="warning"
        variant="soft"
        icon="bx:error"
        class="mt-2"
        :description="t('paymentBank.placeholderWarning')"
      />
    </div>
  </UCard>
</template>
