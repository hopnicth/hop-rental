/**
 * Central display config for the Hopnic company bank account that customers
 * transfer manual bank-transfer payments to (rental booking deposits + sale
 * orders). Single source of truth — never hard-code bank details in pages.
 *
 * Display-only, business-friendly fields. Do NOT add passbook/PDF images or
 * document download links here.
 *
 * TODO(payment): the values below are PLACEHOLDERS. Replace with Hopnic's real
 * company bank account before launch (or wire to runtimeConfig if the team
 * prefers env-managed values). Do not guess the real account number.
 */
export interface HopnicPaymentAccount {
  /** Company account holder name shown to customers. */
  accountName: string;
  /** Bank name shown to customers. */
  bankName: string;
  /** Account number shown to customers (with a copy button in the UI). */
  accountNumber: string;
}

export const HOPNIC_PAYMENT_ACCOUNT: HopnicPaymentAccount = {
  accountName: "[TODO: Hopnic company account name]",
  bankName: "[TODO: Bank name]",
  accountNumber: "[TODO: Account number]",
};

/** True while the account is still a placeholder (real value not yet set). */
export const HOPNIC_PAYMENT_ACCOUNT_IS_PLACEHOLDER =
  HOPNIC_PAYMENT_ACCOUNT.accountNumber.startsWith("[TODO");
