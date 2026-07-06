/**
 * Central display config for the Hopnic company bank account that customers
 * transfer manual bank-transfer payments to (rental booking deposits + sale
 * orders). Single source of truth — never hard-code bank details in pages.
 *
 * Display-only, business-friendly fields. Do NOT add passbook/PDF images or
 * document download links here. Locale-sensitive fields carry th/en variants;
 * the account number and tax id are locale-neutral.
 */
export interface LocalizedText {
  th: string;
  en: string;
}

export interface HopnicPaymentAccount {
  /** Bank name shown to customers. */
  bankName: LocalizedText;
  /** Company account holder name shown to customers. */
  accountName: LocalizedText;
  /** Account number shown to customers (with a copy button in the UI). */
  accountNumber: string;
  /** Branch name shown to customers. */
  branch: LocalizedText;
}

export interface HopnicCompanyInfo {
  /** Registered legal company name. */
  legalName: LocalizedText;
  /** Juristic person ID / Tax ID (13 digits). */
  taxId: string;
  /** Whether the company is VAT-registered. */
  vatRegistered: boolean;
}

export const HOPNIC_PAYMENT_ACCOUNT: HopnicPaymentAccount = {
  bankName: { th: "ธนาคารกสิกรไทย", en: "KASIKORNBANK" },
  accountName: { th: "บจก. ฮอปนิค", en: "HOPNIC CO., LTD." },
  accountNumber: "127-8-56077-1",
  branch: { th: "สาขาพนมสารคาม", en: "Phanom Sarakham Branch" },
};

export const HOPNIC_COMPANY_INFO: HopnicCompanyInfo = {
  legalName: { th: "บริษัท ฮอปนิค จำกัด", en: "Hopnic Co., Ltd." },
  taxId: "0105564155415",
  vatRegistered: true,
};

/**
 * True while the account is still unconfigured. A real account number is digits
 * and dashes only; anything else (e.g. an unset/sentinel value) flips the flag so
 * the UI can show a "not configured" warning instead of looking launch-ready.
 */
export const HOPNIC_PAYMENT_ACCOUNT_IS_PLACEHOLDER =
  !/^[0-9-]{8,}$/.test(HOPNIC_PAYMENT_ACCOUNT.accountNumber);
