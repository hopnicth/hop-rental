import { createError, type H3Event } from "h3";
import {
  asPaymentNonEmptyString,
  extractPromptPayQrUrl,
  mapOmiseChargeStatus,
  toGatewayAmount,
  type PaymentAttemptStatus,
} from "~~/server/utils/payment-core";

export interface OmiseChargeResponse extends Record<string, unknown> {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  authorize_uri?: string;
  expires_at?: string;
  failure_code?: string;
  failure_message?: string;
}

export interface NormalizedGatewayCharge {
  gatewayChargeId: string | null;
  gatewaySourceId: string | null;
  status: PaymentAttemptStatus;
  authorizeUri: string | null;
  qrImageUrl: string | null;
  expiresAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  raw: OmiseChargeResponse;
}

function getOmiseSecretKey(event: H3Event): string {
  const config = useRuntimeConfig(event);
  const secretKey =
    asPaymentNonEmptyString(config.omiseSecretKey) ??
    asPaymentNonEmptyString(process.env.OMISE_SECRET_KEY);
  if (!secretKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "OMISE_SECRET_KEY is not configured",
    });
  }
  return secretKey;
}

function formBody(entries: Record<string, string | number | null | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== null && value !== undefined) body.set(key, String(value));
  }
  return body;
}

async function omiseRequest<T>(
  event: H3Event,
  path: string,
  init?: { method?: string; body?: URLSearchParams },
): Promise<T> {
  const secretKey = getOmiseSecretKey(event);
  const response = await fetch(`https://api.omise.co${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      ...(init?.body
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: init?.body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage:
        asPaymentNonEmptyString(payload.message) ??
        "Payment gateway request failed",
      data: payload,
    });
  }
  return payload as T;
}

export function normalizeOmiseCharge(
  charge: OmiseChargeResponse,
): NormalizedGatewayCharge {
  const source =
    typeof charge.source === "object" && charge.source !== null
      ? (charge.source as Record<string, unknown>)
      : null;
  return {
    gatewayChargeId: asPaymentNonEmptyString(charge.id),
    gatewaySourceId: asPaymentNonEmptyString(source?.id),
    status: mapOmiseChargeStatus(charge),
    authorizeUri: asPaymentNonEmptyString(charge.authorize_uri),
    qrImageUrl: extractPromptPayQrUrl(charge),
    expiresAt: asPaymentNonEmptyString(charge.expires_at),
    failureCode: asPaymentNonEmptyString(charge.failure_code),
    failureMessage: asPaymentNonEmptyString(charge.failure_message),
    raw: charge,
  };
}

export async function createOmiseCardCharge(
  event: H3Event,
  input: {
    orderId: string;
    paymentAttemptId: string;
    amount: number;
    currency: string;
    cardToken: string;
    returnUri: string;
  },
): Promise<NormalizedGatewayCharge> {
  const charge = await omiseRequest<OmiseChargeResponse>(event, "/charges", {
    method: "POST",
    body: formBody({
      amount: toGatewayAmount(input.amount),
      currency: input.currency.toLowerCase(),
      card: input.cardToken,
      return_uri: input.returnUri,
      "metadata[order_id]": input.orderId,
      "metadata[payment_attempt_id]": input.paymentAttemptId,
    }),
  });
  return normalizeOmiseCharge(charge);
}

export async function createOmisePromptPayCharge(
  event: H3Event,
  input: {
    orderId: string;
    paymentAttemptId: string;
    amount: number;
    currency: string;
    returnUri: string;
    expiresAt?: string | null;
  },
): Promise<NormalizedGatewayCharge> {
  const source = await omiseRequest<Record<string, unknown>>(
    event,
    "/sources",
    {
      method: "POST",
      body: formBody({
        type: "promptpay",
        amount: toGatewayAmount(input.amount),
        currency: input.currency.toLowerCase(),
      }),
    },
  );
  const sourceId = asPaymentNonEmptyString(source.id);
  if (!sourceId) {
    throw createError({
      statusCode: 502,
      statusMessage: "PromptPay source missing id",
    });
  }
  const charge = await omiseRequest<OmiseChargeResponse>(event, "/charges", {
    method: "POST",
    body: formBody({
      amount: toGatewayAmount(input.amount),
      currency: input.currency.toLowerCase(),
      source: sourceId,
      return_uri: input.returnUri,
      expires_at: input.expiresAt ?? undefined,
      "metadata[order_id]": input.orderId,
      "metadata[payment_attempt_id]": input.paymentAttemptId,
    }),
  });
  return normalizeOmiseCharge(charge);
}

export async function retrieveOmiseCharge(
  event: H3Event,
  gatewayChargeId: string,
): Promise<NormalizedGatewayCharge> {
  const charge = await omiseRequest<OmiseChargeResponse>(
    event,
    `/charges/${encodeURIComponent(gatewayChargeId)}`,
  );
  return normalizeOmiseCharge(charge);
}

export async function expireOmiseCharge(
  event: H3Event,
  gatewayChargeId: string,
): Promise<NormalizedGatewayCharge> {
  const charge = await omiseRequest<OmiseChargeResponse>(
    event,
    `/charges/${encodeURIComponent(gatewayChargeId)}/expire`,
    { method: "POST" },
  );
  return normalizeOmiseCharge(charge);
}
