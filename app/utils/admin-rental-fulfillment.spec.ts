import { describe, expect, it, vi } from "vitest";
import {
  buildPosRentalFulfillmentPayload,
  normalizePosRentalFulfillmentError,
  requiresReturnRefundProof,
} from "./admin-rental-fulfillment";

describe("admin rental fulfillment helpers", () => {
  it("requires refund proof when return refund is positive or marked refunded", () => {
    expect(requiresReturnRefundProof(200, "pending")).toBe(true);
    expect(requiresReturnRefundProof(0, "refunded")).toBe(true);
    expect(requiresReturnRefundProof(0, "forfeited")).toBe(false);
  });

  it("builds pickup and return payloads with branch and refund metadata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T04:30:00.000Z"));

    expect(
      buildPosRentalFulfillmentPayload({
        bookingId: "booking-1",
        eventType: "pickup",
        signatureDataUrl: "data:image/png;base64,pickup",
        notes: "  pickup ok  ",
        branchId: " branch-a ",
      }),
    ).toMatchObject({
      signatureDataUrl: "data:image/png;base64,pickup",
      notes: "pickup ok",
      branchId: "branch-a",
      idempotencyKey: "pickup:booking-1:1778473800000",
    });

    expect(
      buildPosRentalFulfillmentPayload({
        bookingId: "booking-2",
        eventType: "return",
        signatureDataUrl: "data:image/png;base64,return",
        refundAmount: 250,
        refundStatus: "refunded",
        refundNotes: "  refunded via transfer ",
        refundProofUrl: " https://proof.example/refund ",
      }),
    ).toMatchObject({
      refundAmount: 250,
      refundStatus: "refunded",
      refundNotes: "refunded via transfer",
      refundProofUrl: "https://proof.example/refund",
      idempotencyKey: "return:booking-2:1778473800000",
    });

    vi.useRealTimers();
  });

  it("maps backend validation errors into staff-friendly messages", () => {
    expect(
      normalizePosRentalFulfillmentError(
        { data: { statusCode: 422, statusMessage: "Pickup requires verified customer KYC" } },
        "pickup",
      ),
    ).toEqual({
      message: "ลูกค้าบัญชีนี้ต้องผ่าน KYC ก่อนจึงจะทำ Pickup ได้",
      statusCode: 422,
    });

    expect(
      normalizePosRentalFulfillmentError(
        { data: { statusCode: 422, statusMessage: "Return refund requires uploaded refund proof" } },
        "return",
      ),
    ).toEqual({
      message: "ต้องแนบและอัปโหลดหลักฐานการคืนเงินก่อน Confirm Return",
      statusCode: 422,
    });
  });
});