import { describe, expect, it } from "vitest";
import { calculateRentalPaymentLines } from "../../app/utils/rental-payment-lines";
import { buildAdminRentalPrintFormPayload } from "../../server/utils/admin-rental-print-form";
import type { AdminBookingChecklist } from "../../app/types/admin-booking-ops";
import type { AdminRentalBookingDetail } from "../../app/types/admin-order-detail";

function booking(
  overrides: Partial<AdminRentalBookingDetail> = {},
): AdminRentalBookingDetail {
  return {
    id: "booking-1",
    userId: "user-1",
    walkInPhone: null,
    status: "returned",
    assetId: "asset-1",
    assetCode: "CAM-001",
    assetName: "Camera kit",
    assetThumbnail: null,
    productId: "product-1",
    skuId: "sku-1",
    productName: "Camera",
    matchedProductId: null,
    matchedProductName: null,
    thumbnail: null,
    hubId: null,
    hubName: null,
    startDate: "2026-05-11",
    endDate: "2026-05-12",
    rentalDays: 1,
    pricingModel: "daily",
    currencyCode: "THB",
    dailyRate: 1000,
    weeklyRate: 0,
    monthlyRate: 0,
    rentalTotal: 1000,
    depositAmount: 5000,
    depositPaidAmount: 5000,
    depositPaymentMethod: "cash",
    depositPaymentStatus: "partial_refund",
    depositRefundStatus: "refunded",
    depositRefundAmount: 4500,
    depositRefundNotes: "damage deduction",
    pricingBreakdown: {},
    rentalPaymentLines: [],
    storageBranchId: "b1",
    storageBranchName: "Bangkok",
    bookerName: "Customer One",
    bookerPhone: "0812345678",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    customer: {
      userId: "user-1",
      fullName: "Customer One",
      phone: "0812345678",
      kycStatus: "verified",
      idCardUrl: "users/user-1/id-card/private.png",
    },
    ...overrides,
  };
}

function checklist(): AdminBookingChecklist {
  return {
    id: "chk-1",
    bookingId: "booking-1",
    assetId: "asset-1",
    templateId: null,
    kind: "return",
    templateName: "Return Checklist",
    templateVersion: 1,
    status: "completed",
    performedByUserId: "staff-1",
    completedByUserId: "staff-1",
    startedAt: null,
    completedAt: "2026-05-12T09:00:00.000Z",
    notes: "Returned with minor scratch",
    createdAt: "2026-05-12T08:00:00.000Z",
    updatedAt: "2026-05-12T09:00:00.000Z",
    items: [
      {
        id: "item-1",
        templateItemId: null,
        sortOrder: 1,
        label: "Lens condition",
        instruction: null,
        responseType: "check",
        isRequired: true,
        resultStatus: "failed",
        checked: true,
        responseText: null,
        responseNumber: null,
        photoUrls: [],
        remark: "Scratch",
        checkedAt: null,
        checkedByUserId: "staff-1",
        updatedAt: "2026-05-12T09:00:00.000Z",
      },
    ],
  };
}

describe("buildAdminRentalPrintFormPayload", () => {
  it("includes stored rental payment lines and booking deposit details", () => {
    const payload = buildAdminRentalPrintFormPayload({
      type: "pickup",
      booking: booking({
        status: "confirmed",
        depositPaidAmount: 200,
        depositPaymentStatus: "paid",
        rentalPaymentLines: calculateRentalPaymentLines({
          customerKind: "company",
          rentalDays: 5,
          rentalFeeAmount: 1000,
          depositAmount: 5000,
          source: "server_recompute",
        }),
      }),
      fulfillment: {
        eventType: "pickup",
        signatureUrl: "https://cdn.example/signature.png",
        notes: "Ready for pickup",
        performedByUserId: "staff-1",
        createdAt: "2026-05-11T09:10:00.000Z",
        eventAt: "2026-05-11T09:10:00.000Z",
        branchId: "b1",
        bookingChecklistId: "chk-1",
      },
      checklists: [checklist()],
      documents: [],
      branchName: "Bangkok",
      staffName: "Staff One",
      idEvidenceRef: "users/user-1/id-card/private.png",
      generatedAt: "2026-05-11T09:15:00.000Z",
    });

    expect(payload.money.hasStoredPaymentLines).toBe(true);
    expect(payload.money.paymentLines.map((line) => line.lineType)).toEqual([
      "rental_fee",
      "booking_deposit",
      "refundable_security_deposit",
    ]);
    expect(payload.money.bookingDepositDueNow).toBe(200);
    expect(payload.money.securityDepositRequired).toBe(5000);
    expect(payload.money.remainingSecurityDepositDueAtPickup).toBe(4800);
    expect(payload.money.whtTotal).toBe(50);
    expect(payload.money.netPayableNow).toBe(200);
    // Rental fee deferred to return; netPayableAtPickup = remaining security deposit only.
    expect(payload.money.netPayableAtPickup).toBe(4800);
    expect(payload.booking.qrValue).toBe("booking:booking-1");
  });

  it("includes required booking deposit and refundable security deposit wording", () => {
    const payload = buildAdminRentalPrintFormPayload({
      type: "pickup",
      booking: booking({
        status: "confirmed",
        depositPaidAmount: 200,
        depositPaymentStatus: "paid",
        rentalPaymentLines: calculateRentalPaymentLines({
          customerKind: "individual",
          rentalDays: 5,
          rentalFeeAmount: 1000,
          depositAmount: 5000,
          source: "server_recompute",
        }),
      }),
      fulfillment: null,
      checklists: [],
      documents: [],
      branchName: "Bangkok",
      staffName: "Staff One",
      idEvidenceRef: "users/user-1/id-card/private.png",
    });

    expect(payload.money.notices.bookingDeposit.en).toContain(
      "not a booking fee, service fee, or rental income",
    );
    expect(payload.money.notices.bookingDeposit.th).toContain(
      "ไม่ใช่ค่าจอง ค่าบริการ หรือรายได้ค่าเช่า",
    );
    expect(payload.money.notices.refundableSecurityDeposit.en).toContain(
      "not subject to withholding tax",
    );
    expect(payload.money.notices.refundableSecurityDeposit.th).toContain(
      "ไม่อยู่ภายใต้การหักภาษี ณ ที่จ่าย",
    );
  });

  it("falls back to legacy booking totals when payment lines are missing", () => {
    const payload = buildAdminRentalPrintFormPayload({
      type: "pickup",
      booking: booking({
        rentalTotal: 1500,
        depositAmount: 5000,
        depositPaidAmount: 1000,
        rentalPaymentLines: [],
      }),
      fulfillment: null,
      checklists: [],
      documents: [],
      branchName: "Bangkok",
      staffName: "Staff One",
      idEvidenceRef: "users/user-1/id-card/private.png",
    });

    expect(payload.money.hasStoredPaymentLines).toBe(false);
    expect(payload.money.paymentLines.map((line) => line.lineType)).toEqual([
      "rental_fee",
      "refundable_security_deposit",
    ]);
    expect(payload.money.bookingDepositDueNow).toBe(0);
    expect(payload.money.securityDepositRequired).toBe(5000);
    expect(payload.money.remainingSecurityDepositDueAtPickup).toBe(4000);
    expect(payload.money.netPayableNow).toBe(1000);
    // Rental fee deferred to return; netPayableAtPickup = remaining security deposit only.
    expect(payload.money.netPayableAtPickup).toBe(4000);
  });

  it("netPayableAtPickup equals remaining security deposit — rental fee is NOT included (deferred to return)", () => {
    const payload = buildAdminRentalPrintFormPayload({
      type: "pickup",
      booking: booking({
        status: "confirmed",
        depositPaidAmount: 0,
        depositPaymentStatus: "unpaid",
        rentalPaymentLines: calculateRentalPaymentLines({
          customerKind: "individual",
          rentalDays: 5,
          rentalFeeAmount: 2000,
          depositAmount: 5000,
          source: "server_recompute",
        }),
      }),
      fulfillment: null,
      checklists: [],
      documents: [],
      branchName: null,
      staffName: null,
      idEvidenceRef: null,
    });

    // rentalFeeDue is tracked but must NOT appear in netPayableAtPickup.
    expect(payload.money.rentalFeeDue).toBe(2000);
    // Booking deposit = 200 (5 days × policy), so remaining security deposit = 4800.
    expect(payload.money.remainingSecurityDepositDueAtPickup).toBe(4800);
    // netPayableAtPickup = remaining security deposit only (4800).
    // Must NOT include rental fee (2000) — that is deferred to return.
    expect(payload.money.netPayableAtPickup).toBe(4800);
  });

  it("keeps the operational disclaimer and excludes official receipt fields", () => {
    const payload = buildAdminRentalPrintFormPayload({
      type: "return",
      booking: booking(),
      fulfillment: {
        eventType: "return",
        signatureUrl: "https://cdn.example/signature.png",
        notes: "Returned at counter",
        performedByUserId: "staff-1",
        createdAt: "2026-05-12T09:10:00.000Z",
        eventAt: "2026-05-12T09:10:00.000Z",
        branchId: "b1",
        bookingChecklistId: "chk-1",
      },
      checklists: [checklist()],
      documents: [
        {
          id: "doc-1",
          bookingId: "booking-1",
          bookingChecklistId: "chk-1",
          assetId: "asset-1",
          documentType: "damage_evidence",
          visibility: "internal",
          title: "Damage deduction",
          description: "Minor scratch",
          fileUrl: "https://cdn.example/damage.jpg",
          fileName: "damage.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 123,
          amount: 500,
          currencyCode: "THB",
          issuedAt: null,
          storageBucket: "catalog-media",
          storagePath: "damage.jpg",
          createdByUserId: "staff-1",
          createdAt: "2026-05-12T09:05:00.000Z",
          updatedAt: "2026-05-12T09:05:00.000Z",
        },
      ],
      branchName: "Bangkok",
      staffName: "Staff One",
      idEvidenceRef: "users/user-1/id-card/private.png",
      generatedAt: "2026-05-12T09:15:00.000Z",
    });

    expect(payload.type).toBe("return");
    expect(payload.event.signatureUrl).toContain("signature");
    expect(payload.checklist).toMatchObject({
      failedItems: 1,
      requiredAnswered: 1,
    });
    expect(payload.money.totalDeductions).toBe(500);
    expect(payload.money.refundAmount).toBe(4500);
    expect(payload.disclaimer.en).toContain("not an official receipt");
    expect(payload.disclaimer.en).toContain("not a tax invoice");
    expect(payload.disclaimer.th).toContain("ไม่ใช่ใบเสร็จรับเงิน");
    expect(payload.disclaimer.th).toContain("ไม่ใช่ใบกำกับภาษี");
    expect(JSON.stringify(payload)).not.toContain("officialDocument");
    expect(JSON.stringify(payload)).not.toContain("paymentAllocation");
  });
});
