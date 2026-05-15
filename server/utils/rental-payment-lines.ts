import type { RentalPaymentLine } from "~~/app/types/rental-payment-line";
import {
  calculateRentalPaymentLines,
  summarizeRentalPaymentLines,
  type CalculateRentalPaymentLinesInput,
} from "~~/app/utils/rental-payment-lines";

export function computeRentalBookingPaymentLines(
  input: CalculateRentalPaymentLinesInput,
) {
  const lines = calculateRentalPaymentLines({
    customerKind: input.customerKind ?? "unknown",
    source: input.source ?? "server_recompute",
    ...input,
  });
  return { lines, summary: summarizeRentalPaymentLines(lines) };
}

export function rentalPaymentLineInsertRows(
  bookingId: string,
  lines: readonly RentalPaymentLine[],
) {
  return lines.map((line) => ({
    booking_id: bookingId,
    line_type: line.lineType,
    tax_category: line.taxCategory,
    description_th: line.descriptionTh,
    description_en: line.descriptionEn,
    gross_amount: line.grossAmount,
    wht_applicable: line.whtApplicable,
    wht_rate: line.whtRate,
    wht_amount: line.whtAmount,
    net_payable_amount: line.netPayableAmount,
    is_refundable: line.isRefundable,
    wht_certificate_required: line.whtCertificateRequired,
    applies_to_security_deposit: line.appliesToSecurityDeposit,
    reduces_remaining_security_deposit: line.reducesRemainingSecurityDeposit,
    status: line.status,
    source: line.source,
    metadata: line.metadata,
  }));
}

export function isMissingRentalPaymentLinesTable(error: unknown): boolean {
  const err = error as { code?: string | null; message?: string | null } | null;
  return (
    err?.code === "42P01" ||
    /rental_booking_payment_lines/i.test(err?.message ?? "") ||
    /applies_to_security_deposit|reduces_remaining_security_deposit/i.test(
      err?.message ?? "",
    )
  );
}
