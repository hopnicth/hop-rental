import type { RentalDepositRefundStatus } from "~/types/rental-booking";

export type PosRentalFulfillmentEventType = "pickup" | "return";

type FetchLikeError = {
  status?: number;
  statusCode?: number;
  statusMessage?: string;
  data?: { statusCode?: number; statusMessage?: string; message?: string };
  response?: {
    status?: number;
    _data?: { statusCode?: number; statusMessage?: string; message?: string };
  };
  message?: string;
};

export interface PosRentalFulfillmentPayload {
  signatureDataUrl: string;
  notes?: string | null;
  branchId?: string | null;
  idempotencyKey?: string | null;
  refundAmount?: number;
  refundStatus?: RentalDepositRefundStatus;
  refundNotes?: string | null;
  refundProofUrl?: string | null;
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function rawErrorMessage(error: unknown): string | null {
  const candidate = (typeof error === "object" && error !== null
    ? error
    : null) as FetchLikeError | null;
  return (
    cleanText(candidate?.data?.statusMessage) ??
    cleanText(candidate?.response?._data?.statusMessage) ??
    cleanText(candidate?.statusMessage) ??
    cleanText(candidate?.data?.message) ??
    cleanText(candidate?.response?._data?.message) ??
    (error instanceof Error ? cleanText(error.message) : null)
  );
}

export function requiresReturnRefundProof(
  refundAmount: number,
  refundStatus: RentalDepositRefundStatus,
): boolean {
  return money(refundAmount) > 0 || refundStatus === "refunded";
}

export function buildPosRentalFulfillmentPayload(input: {
  bookingId: string;
  eventType: PosRentalFulfillmentEventType;
  signatureDataUrl: string;
  notes?: string | null;
  branchId?: string | null;
  refundAmount?: number;
  refundStatus?: RentalDepositRefundStatus;
  refundNotes?: string | null;
  refundProofUrl?: string | null;
}): PosRentalFulfillmentPayload {
  return {
    signatureDataUrl: input.signatureDataUrl,
    notes: cleanText(input.notes),
    branchId: cleanText(input.branchId),
    idempotencyKey: `${input.eventType}:${input.bookingId}:${Date.now()}`,
    ...(input.eventType === "return"
      ? {
          refundAmount: money(input.refundAmount),
          refundStatus: input.refundStatus,
          refundNotes: cleanText(input.refundNotes),
          refundProofUrl: cleanText(input.refundProofUrl),
        }
      : {}),
  };
}

export function normalizePosRentalFulfillmentError(
  error: unknown,
  eventType: PosRentalFulfillmentEventType,
): { message: string; statusCode: number | null } {
  const candidate = (typeof error === "object" && error !== null
    ? error
    : null) as FetchLikeError | null;
  const statusCode =
    candidate?.data?.statusCode ??
    candidate?.response?.status ??
    candidate?.statusCode ??
    candidate?.status ??
    null;
  const rawMessage = rawErrorMessage(error);
  const lower = rawMessage?.toLowerCase() ?? "";

  const actionLabel = eventType === "pickup" ? "Pickup" : "Return";
  const signatureLabel = eventType === "pickup" ? "ลายเซ็นรับสินค้า" : "ลายเซ็นคืนสินค้า";

  if (lower.includes("verified customer kyc")) {
    return { message: "ลูกค้าบัญชีนี้ต้องผ่าน KYC ก่อนจึงจะทำ Pickup ได้", statusCode };
  }
  if (lower.includes("walk-in id evidence") || lower.includes("customer identity evidence")) {
    return { message: "ต้องมีหลักฐานยืนยันตัวตนลูกค้าก่อนทำ Pickup", statusCode };
  }
  if (lower.includes("requires a completed checklist") || lower.includes("checklist has unanswered required items")) {
    return { message: `ต้องทำ ${actionLabel} Checklist ให้ Complete และตอบรายการบังคับให้ครบ`, statusCode };
  }
  if (lower.includes("signature is required")) {
    return { message: `ต้องมี${signatureLabel}ก่อนยืนยันรายการ`, statusCode };
  }
  if (lower.includes("branch access required")) {
    return { message: "บัญชีพนักงานนี้ไม่มีสิทธิ์ทำรายการที่สาขานี้", statusCode };
  }
  if (lower.includes("refund requires uploaded refund proof")) {
    return { message: "ต้องแนบและอัปโหลดหลักฐานการคืนเงินก่อน Confirm Return", statusCode };
  }
  if (lower.includes("refund amount cannot exceed deposit paid amount")) {
    return { message: "ยอดคืนมัดจำต้องไม่เกินยอดมัดจำที่รับจริง", statusCode };
  }
  if (lower.includes("requires paid deposit/payment status")) {
    return { message: "ต้องชำระมัดจำ/ค่าเช่าให้เป็น paid ก่อนจึงจะทำ Pickup ได้", statusCode };
  }
  if (lower.includes("already recorded") || lower.includes("already processed")) {
    return { message: `รายการนี้ถูก${actionLabel}ไปแล้วหรือมีการบันทึกซ้ำ`, statusCode };
  }
  if (rawMessage) return { message: rawMessage, statusCode };

  return {
    message:
      eventType === "pickup"
        ? "ไม่สามารถยืนยัน Pickup ได้ กรุณาลองใหม่"
        : "ไม่สามารถยืนยัน Return ได้ กรุณาลองใหม่",
    statusCode,
  };
}