import type {
  RentalPaymentCustomerKind,
  RentalPaymentLine,
  RentalPaymentLineSource,
  RentalPaymentLineSummary,
  RentalPaymentLineType,
  RentalPaymentTaxCategory,
} from "~/types/rental-payment-line";

export interface RentalPaymentTaxPolicy {
  rentalCompanyWhtRate?: number;
  serviceCompanyWhtEnabled?: boolean;
  serviceCompanyWhtRate?: number;
  deliveryCompanyWhtEnabled?: boolean;
  deliveryCompanyWhtRate?: number;
}

export interface CalculateRentalPaymentLinesInput {
  customerKind?: RentalPaymentCustomerKind;
  rentalDays?: number;
  rentalFeeAmount?: number;
  depositAmount?: number;
  bookingDepositPolicy?: "standard" | "not_applicable_same_day";
  bookingDepositOverrideAmount?: number;
  bookingDepositOverrideReason?: string | null;
  deliveryFeeAmount?: number;
  serviceFeeAmount?: number;
  insuranceFeeAmount?: number;
  source?: RentalPaymentLineSource;
  policy?: RentalPaymentTaxPolicy;
  metadata?: Record<string, unknown>;
}

const DEFAULT_POLICY = {
  rentalCompanyWhtRate: 0.05,
  serviceCompanyWhtEnabled: false,
  serviceCompanyWhtRate: 0.03,
  deliveryCompanyWhtEnabled: false,
  deliveryCompanyWhtRate: 0.03,
} satisfies Required<RentalPaymentTaxPolicy>;

const LABELS: Record<
  RentalPaymentLineType,
  { th: string; en: string; taxCategory: RentalPaymentTaxCategory }
> = {
  rental_fee: {
    th: "ค่าเช่าอุปกรณ์",
    en: "Equipment rental fee",
    taxCategory: "rental_income",
  },
  booking_deposit: {
    th: "เงินมัดจำจอง",
    en: "Booking Deposit",
    taxCategory: "partial_refundable_security_deposit",
  },
  refundable_security_deposit: {
    th: "เงินมัดจำประกันที่คืนได้",
    en: "Refundable Security Deposit",
    taxCategory: "refundable_security_deposit",
  },
  delivery_fee: {
    th: "ค่าขนส่ง",
    en: "Delivery fee",
    taxCategory: "service_income",
  },
  service_fee: {
    th: "ค่าบริการ/ติดตั้ง",
    en: "Service / installation fee",
    taxCategory: "service_income",
  },
  insurance_fee: {
    th: "ค่าประกัน/ความคุ้มครอง",
    en: "Insurance / coverage fee",
    taxCategory: "insurance_or_coverage",
  },
  damage_fee: {
    th: "ค่าเสียหาย",
    en: "Damage fee",
    taxCategory: "damage_compensation",
  },
  late_fee: {
    th: "ค่าปรับคืนล่าช้า",
    en: "Late fee",
    taxCategory: "penalty_income",
  },
};

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function rate(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 1_000_000) / 1_000_000;
}

function buildLine(input: {
  lineType: RentalPaymentLineType;
  amount: number;
  whtRate: number;
  source: RentalPaymentLineSource;
  metadata: Record<string, unknown>;
  appliesToSecurityDeposit?: boolean;
  reducesRemainingSecurityDeposit?: boolean;
}): RentalPaymentLine | null {
  const grossAmount = money(input.amount);
  if (grossAmount <= 0) return null;
  const isDeposit =
    input.lineType === "refundable_security_deposit" ||
    input.lineType === "booking_deposit";
  const safeWhtRate = isDeposit ? 0 : rate(input.whtRate);
  const whtAmount = isDeposit ? 0 : money(grossAmount * safeWhtRate);
  const label = LABELS[input.lineType];
  return {
    lineType: input.lineType,
    taxCategory: label.taxCategory,
    descriptionTh: label.th,
    descriptionEn: label.en,
    grossAmount,
    whtApplicable: !isDeposit && safeWhtRate > 0 && whtAmount > 0,
    whtRate: safeWhtRate,
    whtAmount,
    netPayableAmount: money(grossAmount - whtAmount),
    isRefundable: isDeposit,
    whtCertificateRequired: !isDeposit && whtAmount > 0,
    appliesToSecurityDeposit: Boolean(input.appliesToSecurityDeposit),
    reducesRemainingSecurityDeposit: Boolean(
      input.reducesRemainingSecurityDeposit,
    ),
    status: "active",
    source: input.source,
    metadata: input.metadata,
  };
}

export function calculateBookingDepositDueNow(input: {
  rentalDays?: number;
  overrideAmount?: number;
  requiredSecurityDepositAmount?: number;
}): number {
  const rentalDays = Math.max(0, Math.ceil(Number(input.rentalDays ?? 0)) || 0);
  if (rentalDays <= 0) return 0;
  // Owner policy 2026-07-10 (3-tier): <15 → 200, 15–29 → 500, ≥30 → 1000.
  const fixedAmount = rentalDays >= 30 ? 1000 : rentalDays >= 15 ? 500 : 200;
  const policyCalculatedAmount = Math.max(
    fixedAmount,
    money(input.overrideAmount),
  );
  const requiredSecurityDepositAmount = money(
    input.requiredSecurityDepositAmount,
  );
  return Math.min(policyCalculatedAmount, requiredSecurityDepositAmount);
}

export function calculateRentalPaymentLines(
  input: CalculateRentalPaymentLinesInput,
): RentalPaymentLine[] {
  const customerKind = input.customerKind ?? "unknown";
  const isCompany = customerKind === "company";
  const policy = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
  const securityDepositRequired = money(input.depositAmount ?? 0);
  const bookingDepositPolicy = input.bookingDepositPolicy ?? "standard";
  const bookingDepositDueNow =
    bookingDepositPolicy === "not_applicable_same_day"
      ? 0
      : calculateBookingDepositDueNow({
          rentalDays: input.rentalDays,
          overrideAmount: input.bookingDepositOverrideAmount,
          requiredSecurityDepositAmount: securityDepositRequired,
        });
  const remainingSecurityDepositDueAtPickup = money(
    Math.max(0, securityDepositRequired - bookingDepositDueNow),
  );
  const baseMetadata = {
    customerKind,
    policy,
    bookingDepositPolicy,
    ...(input.metadata ?? {}),
  };
  const source = input.source ?? "system";
  const candidates = [
    buildLine({
      lineType: "rental_fee",
      amount: input.rentalFeeAmount ?? 0,
      whtRate: isCompany ? policy.rentalCompanyWhtRate : 0,
      source,
      metadata: baseMetadata,
    }),
    bookingDepositPolicy === "not_applicable_same_day"
      ? null
      : buildLine({
          lineType: "booking_deposit",
          amount: bookingDepositDueNow,
          whtRate: 0,
          source,
          metadata: {
            ...baseMetadata,
            refundable: true,
            notRentalIncome: true,
            notServiceIncome: true,
            appliesToSecurityDeposit: true,
            reducesRemainingSecurityDeposit: true,
            securityDepositRequired,
            remainingSecurityDepositDueAtPickup,
            bookingDepositOverrideReason:
              input.bookingDepositOverrideReason ?? null,
          },
          appliesToSecurityDeposit: true,
          reducesRemainingSecurityDeposit: true,
        }),
    buildLine({
      lineType: "refundable_security_deposit",
      amount: remainingSecurityDepositDueAtPickup,
      whtRate: 0,
      source,
      metadata: {
        ...baseMetadata,
        refundable: true,
        notRentalIncome: true,
        securityDepositRequired,
        bookingDepositDueNow,
        remainingSecurityDepositDueAtPickup,
      },
      appliesToSecurityDeposit: true,
    }),
    buildLine({
      lineType: "delivery_fee",
      amount: input.deliveryFeeAmount ?? 0,
      whtRate:
        isCompany && policy.deliveryCompanyWhtEnabled
          ? policy.deliveryCompanyWhtRate
          : 0,
      source,
      metadata: baseMetadata,
    }),
    buildLine({
      lineType: "service_fee",
      amount: input.serviceFeeAmount ?? 0,
      whtRate:
        isCompany && policy.serviceCompanyWhtEnabled
          ? policy.serviceCompanyWhtRate
          : 0,
      source,
      metadata: baseMetadata,
    }),
    buildLine({
      lineType: "insurance_fee",
      amount: input.insuranceFeeAmount ?? 0,
      whtRate: 0,
      source,
      metadata: baseMetadata,
    }),
  ];
  return candidates.filter((line): line is RentalPaymentLine => Boolean(line));
}

export function summarizeRentalPaymentLines(
  lines: readonly RentalPaymentLine[],
): RentalPaymentLineSummary {
  const securityDepositContribution = (line: RentalPaymentLine) => {
    if (line.lineType === "booking_deposit") {
      return money(line.metadata.securityDepositRequired);
    }
    if (line.lineType === "refundable_security_deposit") {
      return money(line.metadata.bookingDepositDueNow) > 0
        ? 0
        : line.grossAmount;
    }
    return 0;
  };

  return lines.reduce<RentalPaymentLineSummary>(
    (summary, line) => ({
      grossTotal: money(summary.grossTotal + line.grossAmount),
      whtTotal: money(summary.whtTotal + line.whtAmount),
      netPayableTotal: money(summary.netPayableTotal + line.netPayableAmount),
      refundableDepositTotal: money(
        summary.refundableDepositTotal +
          (line.isRefundable ? line.grossAmount : 0),
      ),
      securityDepositRequired: money(
        summary.securityDepositRequired + securityDepositContribution(line),
      ),
      bookingDepositDueNow: money(
        summary.bookingDepositDueNow +
          (line.lineType === "booking_deposit" ? line.grossAmount : 0),
      ),
      remainingSecurityDepositDueAtPickup: money(
        summary.remainingSecurityDepositDueAtPickup +
          (line.lineType === "refundable_security_deposit"
            ? line.grossAmount
            : 0),
      ),
      rentalFeeDue: money(
        summary.rentalFeeDue +
          (line.lineType === "rental_fee" ? line.grossAmount : 0),
      ),
      netPayableNow: money(
        summary.netPayableNow +
          (line.lineType === "booking_deposit" ? line.netPayableAmount : 0),
      ),
      // Rental fee is deferred to return (Phase 2E-B2+); only refundable security
      // deposit lines are counted as due at pickup.
      netPayableAtPickup: money(
        summary.netPayableAtPickup +
          (line.lineType !== "booking_deposit" && line.lineType !== "rental_fee"
            ? line.netPayableAmount
            : 0),
      ),
    }),
    {
      grossTotal: 0,
      whtTotal: 0,
      netPayableTotal: 0,
      refundableDepositTotal: 0,
      securityDepositRequired: 0,
      bookingDepositDueNow: 0,
      remainingSecurityDepositDueAtPickup: 0,
      rentalFeeDue: 0,
      netPayableNow: 0,
      netPayableAtPickup: 0,
    },
  );
}

export const REFUNDABLE_SECURITY_DEPOSIT_LABEL =
  "Refundable Security Deposit / เงินมัดจำประกันที่คืนได้";

export const BOOKING_DEPOSIT_LABEL = "Booking Deposit / เงินมัดจำจอง";
