import type {
  AdminBookingChecklist,
  AdminBookingDocument,
} from "~~/app/types/admin-booking-ops";
import type { AdminRentalBookingDetail } from "~~/app/types/admin-order-detail";
import type {
  AdminRentalPrintMoneyLine,
  AdminRentalPrintFormPayload,
  AdminRentalPrintFormType,
} from "~~/app/types/admin-rental-print-form";
import type {
  RentalPaymentLine,
  RentalPaymentLineSummary,
} from "~~/app/types/rental-payment-line";
import { summarizeRentalPaymentLines } from "~~/app/utils/rental-payment-lines";

export interface AdminRentalPrintFulfillmentRow {
  eventType: AdminRentalPrintFormType;
  signatureUrl: string | null;
  notes: string | null;
  performedByUserId: string | null;
  createdAt: string | null;
  eventAt: string | null;
  branchId: string | null;
  bookingChecklistId: string | null;
}

export const RENTAL_OPERATIONAL_DISCLAIMER = {
  th: "เอกสารนี้เป็นเอกสารประกอบการรับ-คืนสินค้าเช่าเพื่อการปฏิบัติงานเท่านั้น ไม่ใช่ใบเสร็จรับเงิน และไม่ใช่ใบกำกับภาษี",
  en: "This document is an operational rental handover/return form only. It is not an official receipt and not a tax invoice.",
};

export const BOOKING_DEPOSIT_NOTICE = {
  label: "Booking Deposit / เงินมัดจำจอง",
  en: "This amount is part of the refundable security deposit. It is not a booking fee, service fee, or rental income at the time of receipt. It will be applied toward the refundable security deposit when the customer picks up the item.",
  th: "เงินมัดจำจองนี้เป็นส่วนหนึ่งของเงินมัดจำประกันที่คืนได้ ไม่ใช่ค่าจอง ค่าบริการ หรือรายได้ค่าเช่า ณ เวลาที่รับชำระ และจะนำไปหักจากเงินมัดจำประกันที่ต้องชำระในวันรับสินค้า",
};

export const REFUNDABLE_SECURITY_DEPOSIT_NOTICE = {
  label: "Refundable Security Deposit / เงินมัดจำประกันที่คืนได้",
  en: "This amount is held as rental security only. It is not rental income, is not subject to withholding tax, and does not require a withholding tax certificate.",
  th: "เงินมัดจำประกันที่คืนได้ — จำนวนเงินนี้เป็นเงินมัดจำประกันเพื่อค้ำประกันการเช่าเท่านั้น ไม่ถือเป็นรายได้ค่าเช่า ไม่อยู่ภายใต้การหักภาษี ณ ที่จ่าย และไม่ต้องออกหนังสือรับรองหัก ณ ที่จ่ายสำหรับรายการนี้",
};

const PAYMENT_LINE_ORDER: RentalPaymentLine["lineType"][] = [
  "rental_fee",
  "booking_deposit",
  "refundable_security_deposit",
  "delivery_fee",
  "service_fee",
  "insurance_fee",
  "damage_fee",
  "late_fee",
];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function percent(value: number): string {
  const formatted = Number((value * 100).toFixed(2));
  return `${formatted}%`;
}

function summarizeChecklist(checklist: AdminBookingChecklist | null) {
  if (!checklist) return null;
  const requiredItems = checklist.items.filter((item) => item.isRequired);
  return {
    name: checklist.templateName || `${checklist.kind} checklist`,
    status: checklist.status,
    completedAt: checklist.completedAt,
    totalItems: checklist.items.length,
    requiredItems: requiredItems.length,
    requiredAnswered: requiredItems.filter(
      (item) => item.checked === true || item.resultStatus !== "pending",
    ).length,
    passedItems: checklist.items.filter(
      (item) => item.resultStatus === "passed",
    ).length,
    failedItems: checklist.items.filter(
      (item) => item.resultStatus === "failed",
    ).length,
    notes: checklist.notes,
    items: [...checklist.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        label: item.label,
        instruction: item.instruction,
        resultStatus: item.resultStatus,
        checked: item.checked,
        remark: item.remark,
      })),
  };
}

function deductionLabel(documentType: string): string {
  if (documentType === "damage_evidence") return "Damage";
  if (documentType === "repair") return "Repair";
  if (documentType === "fine") return "Fine / late / missing";
  return "Other";
}

function toMoneyLine(
  line: RentalPaymentLine,
  isLegacyFallback: boolean,
): AdminRentalPrintMoneyLine {
  return { ...line, isLegacyFallback };
}

function sortPaymentLines(lines: readonly RentalPaymentLine[]) {
  return [...lines].sort(
    (a, b) =>
      PAYMENT_LINE_ORDER.indexOf(a.lineType) -
      PAYMENT_LINE_ORDER.indexOf(b.lineType),
  );
}

function buildLegacyPaymentLines(
  booking: AdminRentalBookingDetail,
): AdminRentalPrintMoneyLine[] {
  const rentalFee = money(booking.rentalTotal);
  const securityDepositRequired = money(booking.depositAmount);

  return sortPaymentLines(
    [
      rentalFee > 0
        ? {
            lineType: "rental_fee",
            taxCategory: "rental_income",
            descriptionTh: "ค่าเช่าอุปกรณ์",
            descriptionEn: "Equipment rental fee",
            grossAmount: rentalFee,
            whtApplicable: false,
            whtRate: 0,
            whtAmount: 0,
            netPayableAmount: rentalFee,
            isRefundable: false,
            whtCertificateRequired: false,
            appliesToSecurityDeposit: false,
            reducesRemainingSecurityDeposit: false,
            status: "active",
            source: "system",
            metadata: { legacyFallback: true },
          }
        : null,
      securityDepositRequired > 0
        ? {
            lineType: "refundable_security_deposit",
            taxCategory: "refundable_security_deposit",
            descriptionTh: "เงินมัดจำประกันที่คืนได้",
            descriptionEn: "Refundable Security Deposit",
            grossAmount: securityDepositRequired,
            whtApplicable: false,
            whtRate: 0,
            whtAmount: 0,
            netPayableAmount: securityDepositRequired,
            isRefundable: true,
            whtCertificateRequired: false,
            appliesToSecurityDeposit: true,
            reducesRemainingSecurityDeposit: false,
            status: "active",
            source: "system",
            metadata: { legacyFallback: true },
          }
        : null,
    ].filter((line): line is RentalPaymentLine => Boolean(line)),
  ).map((line) => toMoneyLine(line, true));
}

function buildLegacySummary(
  booking: AdminRentalBookingDetail,
): RentalPaymentLineSummary {
  const rentalFee = money(booking.rentalTotal);
  const securityDepositRequired = money(booking.depositAmount);
  const depositPaid = money(booking.depositPaidAmount);
  const remainingSecurityDepositDueAtPickup = money(
    Math.max(0, securityDepositRequired - depositPaid),
  );
  return {
    grossTotal: money(rentalFee + securityDepositRequired),
    whtTotal: 0,
    netPayableTotal: money(rentalFee + securityDepositRequired),
    refundableDepositTotal: securityDepositRequired,
    securityDepositRequired,
    bookingDepositDueNow: 0,
    remainingSecurityDepositDueAtPickup,
    rentalFeeDue: rentalFee,
    netPayableNow: depositPaid,
    // Rental fee is deferred to return (Phase 2E-B2+).
    // Only the remaining security deposit is due at pickup.
    netPayableAtPickup: remainingSecurityDepositDueAtPickup,
  };
}

function whtRateDisplay(lines: readonly RentalPaymentLine[]): string {
  const rates = [...new Set(lines.map((line) => percent(line.whtRate)))];
  return rates.length > 0 ? rates.join(" / ") : "0%";
}

function buildMoneySection(booking: AdminRentalBookingDetail) {
  const storedLines = sortPaymentLines(
    booking.rentalPaymentLines.filter((line) => line.status !== "voided"),
  );
  const hasStoredPaymentLines = storedLines.length > 0;
  const paymentLines = hasStoredPaymentLines
    ? storedLines.map((line) => toMoneyLine(line, false))
    : buildLegacyPaymentLines(booking);
  const summary = hasStoredPaymentLines
    ? summarizeRentalPaymentLines(storedLines)
    : buildLegacySummary(booking);

  return {
    currencyCode: booking.currencyCode,
    paymentLines,
    hasStoredPaymentLines,
    whtRateDisplay: whtRateDisplay(paymentLines),
    grossTotal: summary.grossTotal,
    whtTotal: summary.whtTotal,
    netPayableTotal: summary.netPayableTotal,
    refundableDepositTotal: summary.refundableDepositTotal,
    securityDepositRequired: summary.securityDepositRequired,
    bookingDepositDueNow: summary.bookingDepositDueNow,
    remainingSecurityDepositDueAtPickup:
      summary.remainingSecurityDepositDueAtPickup,
    rentalFeeDue: summary.rentalFeeDue,
    netPayableNow: summary.netPayableNow,
    netPayableAtPickup: summary.netPayableAtPickup,
    rentalFee: money(booking.rentalTotal),
    deposit: money(booking.depositAmount),
    depositPaid: money(booking.depositPaidAmount),
    paymentMethod: booking.depositPaymentMethod,
    paymentStatus: booking.depositPaymentStatus,
    coverage: null,
    totalDeductions: 0,
    refundAmount: 0,
    additionalChargeAmount: 0,
    refundStatus: booking.depositRefundStatus,
    refundMethod: booking.depositPaymentMethod,
    summary,
    notices: {
      bookingDeposit: BOOKING_DEPOSIT_NOTICE,
      refundableSecurityDeposit: REFUNDABLE_SECURITY_DEPOSIT_NOTICE,
    },
  };
}

export function buildAdminRentalPrintFormPayload(input: {
  type: AdminRentalPrintFormType;
  booking: AdminRentalBookingDetail;
  fulfillment: AdminRentalPrintFulfillmentRow | null;
  checklists: AdminBookingChecklist[];
  documents: AdminBookingDocument[];
  branchName: string | null;
  staffName: string | null;
  idEvidenceRef: string | null;
  generatedAt?: string;
}): AdminRentalPrintFormPayload {
  const { booking, type } = input;
  const fulfillmentChecklist = input.fulfillment?.bookingChecklistId
    ? input.checklists.find(
        (c) => c.id === input.fulfillment?.bookingChecklistId,
      )
    : null;
  const checklist =
    fulfillmentChecklist ??
    input.checklists.find((c) => c.kind === type && c.status === "completed") ??
    input.checklists.find((c) => c.kind === type) ??
    null;
  const deductions = input.documents
    .filter((doc) =>
      ["damage_evidence", "repair", "fine"].includes(doc.documentType),
    )
    .map((doc) => ({
      label: doc.title || deductionLabel(doc.documentType),
      amount: money(doc.amount),
      notes: doc.description,
    }));
  const totalDeductions = deductions.reduce((sum, row) => sum + row.amount, 0);
  const refundAmount =
    type === "return" ? money(booking.depositRefundAmount) : 0;
  const additionalChargeAmount = Math.max(
    0,
    totalDeductions - money(booking.depositPaidAmount),
  );
  const moneySection = buildMoneySection(booking);
  const customerName =
    text(booking.customer.fullName) ??
    text(booking.bookerName) ??
    "Walk-in customer";
  const customerPhone =
    text(booking.customer.phone) ??
    text(booking.bookerPhone) ??
    text(booking.walkInPhone);

  return {
    type,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    company: { name: "HOPNIC", logoUrl: null },
    booking: {
      id: booking.id,
      code: booking.assetCode || booking.id,
      status: booking.status,
      startDate: booking.startDate,
      endDate: booking.endDate,
      rentalDays: booking.rentalDays,
      qrValue: `booking:${booking.id}`,
    },
    customer: {
      name: customerName,
      phone: customerPhone,
      type: booking.userId ? "user" : "walk_in",
      companyName: null,
      companyTaxId: null,
      kycStatus: booking.customer.kycStatus ?? null,
      idEvidenceRef: input.idEvidenceRef,
    },
    branch: {
      id: input.fulfillment?.branchId ?? booking.storageBranchId,
      name: input.branchName ?? booking.storageBranchName,
    },
    event: {
      label: type === "pickup" ? "Pickup / Handover" : "Return",
      at: input.fulfillment?.eventAt ?? input.fulfillment?.createdAt ?? null,
      signatureUrl: input.fulfillment?.signatureUrl ?? null,
      staffName: input.staffName,
      notes: input.fulfillment?.notes ?? null,
    },
    items: [
      {
        name: booking.assetName || booking.productName,
        assetCode: booking.assetCode,
        skuId: booking.skuId,
        quantity: 1,
      },
    ],
    checklist: summarizeChecklist(checklist),
    money: {
      ...moneySection,
      totalDeductions,
      refundAmount,
      additionalChargeAmount,
    },
    deductions,
    returnConditionNotes:
      type === "return"
        ? (checklist?.notes ?? input.fulfillment?.notes ?? null)
        : null,
    disclaimer: RENTAL_OPERATIONAL_DISCLAIMER,
  };
}
