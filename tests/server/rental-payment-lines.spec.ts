import { describe, expect, it } from "vitest";
import {
  calculateRentalPaymentLines,
  summarizeRentalPaymentLines,
} from "../../app/utils/rental-payment-lines";
import { rentalPaymentLineInsertRows } from "../../server/utils/rental-payment-lines";

describe("rental payment lines", () => {
  it("does not apply WHT to an individual rental fee or deposit", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "individual",
      rentalFeeAmount: 10000,
      depositAmount: 5000,
      source: "cart_preview",
    });
    expect(summarizeRentalPaymentLines(lines)).toMatchObject({
      grossTotal: 15000,
      whtTotal: 0,
      netPayableTotal: 15000,
      refundableDepositTotal: 5000,
    });
  });

  it("applies 5% WHT to company rental fee but never to deposit", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "company",
      rentalFeeAmount: 10000,
      depositAmount: 5000,
    });
    const rental = lines.find((line) => line.lineType === "rental_fee");
    const deposit = lines.find(
      (line) => line.lineType === "refundable_security_deposit",
    );
    expect(rental).toMatchObject({
      taxCategory: "rental_income",
      whtApplicable: true,
      whtRate: 0.05,
      whtAmount: 500,
      netPayableAmount: 9500,
      whtCertificateRequired: true,
    });
    expect(deposit).toMatchObject({
      taxCategory: "refundable_security_deposit",
      whtApplicable: false,
      whtRate: 0,
      whtAmount: 0,
      netPayableAmount: 5000,
      isRefundable: true,
      whtCertificateRequired: false,
    });
  });

  it("keeps service and delivery WHT disabled by default in Phase 1", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "company",
      deliveryFeeAmount: 1000,
      serviceFeeAmount: 2000,
    });
    expect(summarizeRentalPaymentLines(lines)).toMatchObject({
      grossTotal: 3000,
      whtTotal: 0,
      netPayableTotal: 3000,
    });
  });

  it("supports configurable 3% company WHT for service and delivery", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "company",
      deliveryFeeAmount: 1000,
      serviceFeeAmount: 2000,
      policy: {
        deliveryCompanyWhtEnabled: true,
        serviceCompanyWhtEnabled: true,
      },
    });
    expect(summarizeRentalPaymentLines(lines)).toMatchObject({
      grossTotal: 3000,
      whtTotal: 90,
      netPayableTotal: 2910,
    });
  });

  it("adds a 200 THB booking deposit for rentals up to 30 days", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "individual",
      rentalDays: 30,
      rentalFeeAmount: 3500,
      depositAmount: 5000,
    });
    const bookingDeposit = lines.find(
      (line) => line.lineType === "booking_deposit",
    );
    expect(bookingDeposit).toMatchObject({
      taxCategory: "partial_refundable_security_deposit",
      grossAmount: 200,
      whtApplicable: false,
      whtRate: 0,
      whtAmount: 0,
      isRefundable: true,
      whtCertificateRequired: false,
      appliesToSecurityDeposit: true,
      reducesRemainingSecurityDeposit: true,
    });
    expect(summarizeRentalPaymentLines(lines)).toMatchObject({
      securityDepositRequired: 5000,
      bookingDepositDueNow: 200,
      remainingSecurityDepositDueAtPickup: 4800,
      netPayableNow: 200,
      netPayableAtPickup: 8300,
    });
  });

  it("adds a 1000 THB booking deposit for rentals over 30 days", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "individual",
      rentalDays: 31,
      rentalFeeAmount: 3500,
      depositAmount: 5000,
    });
    expect(summarizeRentalPaymentLines(lines)).toMatchObject({
      securityDepositRequired: 5000,
      bookingDepositDueNow: 1000,
      remainingSecurityDepositDueAtPickup: 4000,
      netPayableNow: 1000,
      netPayableAtPickup: 7500,
    });
  });

  it("keeps booking deposit WHT 0 for company customers while rental WHT applies", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "company",
      rentalDays: 5,
      rentalFeeAmount: 10000,
      depositAmount: 5000,
    });
    const rental = lines.find((line) => line.lineType === "rental_fee");
    const bookingDeposit = lines.find(
      (line) => line.lineType === "booking_deposit",
    );
    expect(rental).toMatchObject({ whtAmount: 500, netPayableAmount: 9500 });
    expect(bookingDeposit).toMatchObject({
      whtApplicable: false,
      whtRate: 0,
      whtAmount: 0,
      netPayableAmount: 200,
      whtCertificateRequired: false,
    });
  });

  it("does not allow remaining security deposit to go below zero", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "individual",
      rentalDays: 5,
      depositAmount: 100,
    });
    expect(summarizeRentalPaymentLines(lines)).toMatchObject({
      securityDepositRequired: 100,
      bookingDepositDueNow: 200,
      remainingSecurityDepositDueAtPickup: 0,
      netPayableNow: 200,
      netPayableAtPickup: 0,
    });
  });

  it("maps lines to snake_case insert rows for server storage", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "company",
      rentalFeeAmount: 1000,
      depositAmount: 500,
      source: "pos_booking_create",
    });
    const rows = rentalPaymentLineInsertRows("booking-1", lines);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      booking_id: "booking-1",
      line_type: "refundable_security_deposit",
      tax_category: "refundable_security_deposit",
      wht_applicable: false,
      wht_rate: 0,
      wht_amount: 0,
      is_refundable: true,
      wht_certificate_required: false,
    });
  });

  it("maps booking deposit security deposit flags to snake_case insert rows", () => {
    const lines = calculateRentalPaymentLines({
      customerKind: "individual",
      rentalDays: 5,
      depositAmount: 5000,
      source: "pos_booking_create",
    });
    const rows = rentalPaymentLineInsertRows("booking-1", lines);
    const bookingDeposit = rows.find(
      (row) => row.line_type === "booking_deposit",
    );
    expect(bookingDeposit).toMatchObject({
      booking_id: "booking-1",
      line_type: "booking_deposit",
      tax_category: "partial_refundable_security_deposit",
      gross_amount: 200,
      wht_applicable: false,
      wht_rate: 0,
      wht_amount: 0,
      is_refundable: true,
      wht_certificate_required: false,
      applies_to_security_deposit: true,
      reduces_remaining_security_deposit: true,
    });
  });
});
