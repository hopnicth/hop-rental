import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentMethod = "credit_card" | "promptpay";
export type PaymentAttemptStatus =
  | "created"
  | "pending"
  | "requires_action"
  | "paid"
  | "finalizing"
  | "finalized"
  | "partial_finalized"
  | "finalization_failed"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";

type AnyRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asPaymentNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function asPaymentMethod(value: unknown): PaymentMethod | null {
  return value === "credit_card" || value === "promptpay" ? value : null;
}

export function normalizeCurrency(value: unknown): string {
  const code = asPaymentNonEmptyString(value)?.toUpperCase() ?? "THB";
  return code.length === 3 ? code : "THB";
}

export function toGatewayAmount(amount: unknown): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

export function isPayableOrderPaymentStatus(status: unknown): boolean {
  return status === "awaiting_payment" || status === "pending_review";
}

export function extractOmiseCharge(payload: unknown): AnyRecord | null {
  if (!isRecord(payload)) return null;
  if (payload.object === "charge") return payload;
  return isRecord(payload.data) && payload.data.object === "charge"
    ? payload.data
    : null;
}

export function mapOmiseChargeStatus(charge: unknown): PaymentAttemptStatus {
  if (!isRecord(charge)) return "pending";
  const status = asPaymentNonEmptyString(charge.status)?.toLowerCase() ?? "";
  if (charge.refunded === true || status === "refunded") return "refunded";
  if (charge.successful === true || status === "successful") return "paid";
  if (status === "expired") return "expired";
  if (status === "failed" || charge.failure_code || charge.failure_message) {
    return "failed";
  }
  if (asPaymentNonEmptyString(charge.authorize_uri)) return "requires_action";
  return "pending";
}

export function extractPromptPayQrUrl(charge: unknown): string | null {
  if (!isRecord(charge) || !isRecord(charge.source)) return null;
  const code = charge.source.scannable_code;
  if (!isRecord(code) || !isRecord(code.image)) return null;
  return asPaymentNonEmptyString(code.image.download_uri);
}

export function verifyOmiseWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  webhookSecret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): boolean {
  const signatureHeader = asPaymentNonEmptyString(input.signatureHeader);
  const timestampHeader = asPaymentNonEmptyString(input.timestampHeader);
  if (!signatureHeader || !timestampHeader || !input.webhookSecret)
    return false;

  const timestampMs = Number(timestampHeader) * 1000;
  const toleranceMs = (input.toleranceSeconds ?? 300) * 1000;
  if (!Number.isFinite(timestampMs)) return false;
  if (Math.abs((input.nowMs ?? Date.now()) - timestampMs) > toleranceMs) {
    return false;
  }

  const signedPayload = `${timestampHeader}.${input.rawBody}`;
  const expected = createHmac(
    "sha256",
    Buffer.from(input.webhookSecret, "base64"),
  )
    .update(signedPayload, "utf8")
    .digest();

  return signatureHeader.split(",").some((signature) => {
    const trimmed = signature.trim();
    if (!/^[a-f0-9]{64}$/i.test(trimmed)) return false;
    const actual = Buffer.from(trimmed, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
}
