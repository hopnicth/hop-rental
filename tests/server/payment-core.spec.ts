import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  extractPromptPayQrUrl,
  mapOmiseChargeStatus,
  toGatewayAmount,
  verifyOmiseWebhookSignature,
} from "../../server/utils/payment-core";

describe("payment-core", () => {
  it("maps Omise charge states to internal payment attempt statuses", () => {
    expect(mapOmiseChargeStatus({ successful: true })).toBe("paid");
    expect(mapOmiseChargeStatus({ status: "failed" })).toBe("failed");
    expect(mapOmiseChargeStatus({ status: "pending", authorize_uri: "https://3ds" })).toBe("requires_action");
    expect(mapOmiseChargeStatus({ status: "expired" })).toBe("expired");
  });

  it("converts THB amount to Omise smallest-unit amount", () => {
    expect(toGatewayAmount(1590)).toBe(159000);
    expect(toGatewayAmount("10.25")).toBe(1025);
  });

  it("extracts PromptPay QR image URL from Omise charge payload", () => {
    expect(
      extractPromptPayQrUrl({
        source: { scannable_code: { image: { download_uri: "https://qr" } } },
      }),
    ).toBe("https://qr");
  });

  it("verifies Omise webhook HMAC signatures", () => {
    const secret = Buffer.from("secret").toString("base64");
    const timestamp = "1758696391";
    const rawBody = JSON.stringify({ id: "evnt_test", key: "charge.complete" });
    const signature = createHmac("sha256", Buffer.from(secret, "base64"))
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    expect(
      verifyOmiseWebhookSignature({
        rawBody,
        signatureHeader: signature,
        timestampHeader: timestamp,
        webhookSecret: secret,
        nowMs: Number(timestamp) * 1000,
      }),
    ).toBe(true);
  });
});