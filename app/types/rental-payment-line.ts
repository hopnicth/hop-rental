export type RentalPaymentLineType =
  | "rental_fee"
  | "booking_deposit"
  | "refundable_security_deposit"
  | "delivery_fee"
  | "service_fee"
  | "insurance_fee"
  | "damage_fee"
  | "late_fee";

export type RentalPaymentTaxCategory =
  | "rental_income"
  | "partial_refundable_security_deposit"
  | "refundable_security_deposit"
  | "service_income"
  | "insurance_or_coverage"
  | "damage_compensation"
  | "penalty_income"
  | "non_taxable";

export type RentalPaymentCustomerKind = "individual" | "company" | "unknown";

export type RentalPaymentLineSource =
  | "cart_preview"
  | "pos_booking_create"
  | "pos_v3_draft_quote"
  | "pos_v3_same_day_quote"
  | "server_recompute"
  | "system";

export interface RentalPaymentLine {
  lineType: RentalPaymentLineType;
  taxCategory: RentalPaymentTaxCategory;
  descriptionTh: string;
  descriptionEn: string;
  grossAmount: number;
  whtApplicable: boolean;
  whtRate: number;
  whtAmount: number;
  netPayableAmount: number;
  isRefundable: boolean;
  whtCertificateRequired: boolean;
  appliesToSecurityDeposit: boolean;
  reducesRemainingSecurityDeposit: boolean;
  status: "active" | "voided";
  source: RentalPaymentLineSource;
  metadata: Record<string, unknown>;
}

export interface RentalPaymentLineSummary {
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
}
