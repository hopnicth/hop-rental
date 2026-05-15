import type {
  RentalPaymentLine,
  RentalPaymentLineSummary,
} from "~/types/rental-payment-line";
import type { RentalDepositRefundStatus } from "~/types/rental-booking";

export type AdminRentalPrintFormType = "pickup" | "return";

export interface AdminRentalPrintChecklistItem {
  label: string;
  resultStatus: string;
  checked: boolean | null;
  remark: string | null;
}

export interface AdminRentalPrintChecklistSummary {
  name: string;
  status: string;
  completedAt: string | null;
  totalItems: number;
  requiredItems: number;
  requiredAnswered: number;
  passedItems: number;
  failedItems: number;
  notes: string | null;
  items: AdminRentalPrintChecklistItem[];
}

export interface AdminRentalPrintMoneyLine extends RentalPaymentLine {
  isLegacyFallback: boolean;
}

export interface AdminRentalPrintMoneyNotice {
  label: string;
  en: string;
  th: string;
}

export interface AdminRentalPrintFormPayload {
  type: AdminRentalPrintFormType;
  generatedAt: string;
  company: { name: string; logoUrl: string | null };
  booking: {
    id: string;
    code: string;
    status: string;
    startDate: string;
    endDate: string;
    rentalDays: number;
    qrValue: string;
  };
  customer: {
    name: string;
    phone: string | null;
    type: "user" | "walk_in" | "company";
    companyName: string | null;
    companyTaxId: string | null;
    kycStatus: string | null;
    idEvidenceRef: string | null;
  };
  branch: { name: string | null; id: string | null };
  event: {
    label: string;
    at: string | null;
    signatureUrl: string | null;
    staffName: string | null;
    notes: string | null;
  };
  items: Array<{
    name: string;
    assetCode: string | null;
    skuId: string | null;
    quantity: number;
  }>;
  checklist: AdminRentalPrintChecklistSummary | null;
  money: {
    currencyCode: string;
    paymentLines: AdminRentalPrintMoneyLine[];
    hasStoredPaymentLines: boolean;
    whtRateDisplay: string;
    grossTotal: number;
    whtTotal: number;
    netPayableTotal: number;
    refundableDepositTotal: number;
    securityDepositRequired: number;
    bookingDepositDueNow: number;
    remainingSecurityDepositDueAtPickup: number;
    rentalFeeDue: number;
    netPayableNow: number;
    netPayableAtPickup: number;
    rentalFee: number;
    deposit: number;
    depositPaid: number;
    paymentMethod: string | null;
    paymentStatus: string;
    coverage: number | null;
    totalDeductions: number;
    refundAmount: number;
    additionalChargeAmount: number;
    refundStatus: RentalDepositRefundStatus;
    refundMethod: string | null;
    summary: RentalPaymentLineSummary;
    notices: {
      bookingDeposit: AdminRentalPrintMoneyNotice;
      refundableSecurityDeposit: AdminRentalPrintMoneyNotice;
    };
  };
  deductions: Array<{ label: string; amount: number; notes: string | null }>;
  returnConditionNotes: string | null;
  disclaimer: { th: string; en: string };
}
