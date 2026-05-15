import { createError } from "h3";
import type { NormalizedGatewayCharge } from "~~/server/utils/omise";
import {
  toGatewayAmount,
  normalizeCurrency,
} from "~~/server/utils/payment-core";
import {
  recordPaymentAlert,
  shouldExpireAttempt,
} from "~~/server/utils/payments";
import {
  confirmRentalBooking,
  loadRentalBookingForConfirmation,
  validateRentalBookingForConfirmation,
} from "~~/server/utils/rental-booking-confirmation";
import {
  computeRentalBookingPaymentLines,
  rentalPaymentLineInsertRows,
} from "~~/server/utils/rental-payment-lines";

type AnyRecord = Record<string, unknown>;
type QueryChain<T = AnyRecord> = {
  select(columns: string): QueryChain<T>;
  insert(payload: unknown): QueryChain<T>;
  update(payload: Record<string, unknown>): QueryChain<T>;
  eq(column: string, value: unknown): QueryChain<T>;
  neq(column: string, value: unknown): QueryChain<T>;
  order(column: string, options?: Record<string, unknown>): QueryChain<T>;
  maybeSingle(): Promise<{
    data: T | null;
    error: { message?: string; code?: string } | null;
  }>;
  single(): Promise<{
    data: T | null;
    error: { message?: string; code?: string } | null;
  }>;
};
type AnyClient = {
  from(table: string): QueryChain;
  rpc?: (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};

export const BOOKING_DEPOSIT_AGREEMENT_TYPE = "booking_deposit_terms";
export const BOOKING_DEPOSIT_TERMS_VERSION = "booking_deposit_terms_v1";
export const BOOKING_DEPOSIT_TERMS_TITLE_TH = "Booking Deposit Terms";
export const BOOKING_DEPOSIT_POLICY_VERSION = "fixed_booking_deposit_v1";
export const BOOKING_DEPOSIT_TERMS_TH =
  "เงินมัดจำจองนี้เป็นส่วนหนึ่งของเงินมัดจำประกันที่คืนได้ ไม่ใช่ค่าจอง ค่าบริการ หรือรายได้ค่าเช่า ณ เวลาที่รับชำระ และจะนำไปหักจากเงินมัดจำประกันที่ต้องชำระในวันรับสินค้า หากยกเลิกก่อนวันเริ่มเช่าไม่น้อยกว่า 3 วัน บริษัทจะคืนเงินมัดจำจองให้แก่ผู้เช่า หากยกเลิกน้อยกว่า 3 วัน หรือไม่มารับสินค้าตามวันที่กำหนดโดยไม่แจ้งล่วงหน้า บริษัทขอสงวนสิทธิ์ในการไม่คืนเงินมัดจำจองทั้งหมดหรือบางส่วน";

export const RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT =
  "id, booking_id, user_id, gateway, method, status, amount, currency_code, idempotency_key, gateway_charge_id, gateway_source_id, gateway_authorize_uri, qr_image_url, expires_at, failure_code, failure_message, metadata, raw_gateway_response, created_at, updated_at";

const BOOKING_PAYMENT_SELECT = `${"id, user_id, status, asset_id, sku_id, start_date, end_date, rental_days, hub_id, daily_rate, weekly_rate, monthly_rate, rental_total, deposit_amount, currency_code, pricing_breakdown"}, booking_deposit_payment_status, booking_deposit_paid_amount, booking_deposit_paid_at, booking_deposit_payment_attempt_id`;

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstRow(value: unknown): AnyRecord | null {
  if (Array.isArray(value)) return (value[0] as AnyRecord | undefined) ?? null;
  return value && typeof value === "object" ? (value as AnyRecord) : null;
}

function uniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export type BookingDepositTermsResolution = {
  agreementVersionId: string | null;
  acceptedTermsVersion: string;
  title: string;
  termsSnapshot: string;
  contentHash: string;
  renderedTextHash: string;
  canonical: boolean;
};

export async function resolveActiveBookingDepositTerms(
  client: AnyClient,
  acceptedAt?: string,
): Promise<BookingDepositTermsResolution> {
  const fallback = {
    agreementVersionId: null,
    acceptedTermsVersion: BOOKING_DEPOSIT_TERMS_VERSION,
    title: BOOKING_DEPOSIT_TERMS_TITLE_TH,
    termsSnapshot: BOOKING_DEPOSIT_TERMS_TH,
    contentHash: "",
    renderedTextHash: "",
    canonical: false,
  };
  if (!client.rpc) return fallback;
  const { data, error } = await client.rpc("f_get_active_agreement_version", {
    p_agreement_type: BOOKING_DEPOSIT_AGREEMENT_TYPE,
    p_as_of: acceptedAt ?? new Date().toISOString(),
  });
  if (error) return fallback;
  const row = firstRow(data);
  if (!row) return fallback;
  const version = text(row.version);
  const body = text(row.content_body);
  if (!version || !body) return fallback;
  return {
    agreementVersionId: text(row.id) || null,
    acceptedTermsVersion: version,
    title: text(row.title) || BOOKING_DEPOSIT_TERMS_TITLE_TH,
    termsSnapshot: body,
    contentHash: text(row.content_hash),
    renderedTextHash: text(row.rendered_text_hash),
    canonical: true,
  };
}

export async function recordBookingDepositAgreementAcceptance(input: {
  client: AnyClient;
  bookingId: string;
  userId: string;
  paymentAttemptId: string;
  acceptedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const terms = await resolveActiveBookingDepositTerms(
    input.client,
    input.acceptedAt,
  );
  let acceptanceLogId: string | null = null;
  const canCreateCanonicalLog = Boolean(
    terms.agreementVersionId &&
    terms.contentHash &&
    terms.renderedTextHash &&
    input.ipAddress &&
    input.userAgent,
  );
  if (canCreateCanonicalLog) {
    const acceptancePayload = {
      agreement_version_id: terms.agreementVersionId,
      agreement_type: BOOKING_DEPOSIT_AGREEMENT_TYPE,
      agreement_version: terms.acceptedTermsVersion,
      agreement_title: terms.title,
      content_hash: terms.contentHash,
      rendered_text_hash: terms.renderedTextHash,
      customer_user_id: input.userId,
      booking_id: input.bookingId,
      source_type: "rental_booking_payment_attempt",
      source_id: input.paymentAttemptId,
      accepted_channel: "web",
      consent_action: "checkbox",
      customer_confirmation_method: "web_checkbox",
      accepted_at: input.acceptedAt,
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
      evidence_snapshot: {
        paymentAttemptId: input.paymentAttemptId,
        bookingId: input.bookingId,
      },
      metadata: { paymentSurface: "booking_deposit_payment" },
    };
    const { data, error } = await input.client
      .from("agreement_acceptance_logs")
      .insert(acceptancePayload)
      .select("id")
      .maybeSingle();
    if (error && !uniqueViolation(error)) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    acceptanceLogId = text((data as AnyRecord | null)?.id) || null;
    if (!acceptanceLogId && error && uniqueViolation(error)) {
      const { data: existing } = await input.client
        .from("agreement_acceptance_logs")
        .select("id")
        .eq("agreement_version_id", terms.agreementVersionId)
        .eq("source_type", "rental_booking_payment_attempt")
        .eq("source_id", input.paymentAttemptId)
        .eq("customer_user_id", input.userId)
        .eq("status", "accepted")
        .maybeSingle();
      acceptanceLogId = text((existing as AnyRecord | null)?.id) || null;
    }
  }

  const { error: agreementError } = await input.client
    .from("rental_booking_deposit_agreements")
    .insert({
      booking_id: input.bookingId,
      user_id: input.userId,
      payment_attempt_id: input.paymentAttemptId,
      agreement_version_id: terms.agreementVersionId,
      agreement_acceptance_log_id: acceptanceLogId,
      accepted_terms_version: terms.acceptedTermsVersion,
      terms_snapshot: terms.termsSnapshot,
      content_hash: terms.contentHash,
      rendered_text_hash: terms.renderedTextHash,
      accepted_at: input.acceptedAt,
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
      metadata: { canonicalAgreement: terms.canonical },
    });
  if (agreementError && !uniqueViolation(agreementError)) {
    throw createError({
      statusCode: 500,
      statusMessage: agreementError.message,
    });
  }
  return { ...terms, acceptanceLogId };
}

export function mapRentalBookingPaymentAttemptResponse(attempt: AnyRecord) {
  return {
    paymentAttemptId: String(attempt.id),
    bookingId: String(attempt.booking_id),
    method: attempt.method,
    status: attempt.status,
    amount: Number(attempt.amount) || 0,
    currency: normalizeCurrency(attempt.currency_code),
    redirectUrl: attempt.gateway_authorize_uri ?? null,
    qrImageUrl: attempt.qr_image_url ?? null,
    expiresAt: attempt.expires_at ?? null,
  };
}

export function buildRentalBookingPaymentReturnUri(
  event: { node: { req: { headers: Record<string, string | undefined> } } },
  bookingId: string,
): string {
  const proto = event.node.req.headers["x-forwarded-proto"] ?? "http";
  const host =
    event.node.req.headers["x-forwarded-host"] ?? event.node.req.headers.host;
  return `${proto}://${host}/rental-booking-payment/result?bookingId=${encodeURIComponent(bookingId)}`;
}

export function bookingDepositMethodToLegacyDepositMethod(
  method: unknown,
): string {
  return method === "credit_card" ? "card" : "qr_transfer";
}

export function assertBookingDepositAgreementAccepted(value: unknown): void {
  if (value !== true) {
    throw createError({
      statusCode: 422,
      statusMessage: "BOOKING_DEPOSIT_TERMS_REQUIRED",
      message: "Booking Deposit agreement must be accepted before payment.",
    });
  }
}

export async function loadRentalBookingForDepositPayment(
  client: AnyClient,
  bookingId: string,
): Promise<AnyRecord> {
  const { data, error } = await client
    .from("rental_bookings")
    .select(BOOKING_PAYMENT_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  return data as AnyRecord;
}

export function computeBookingDepositLinesFromBooking(input: {
  booking: AnyRecord;
}) {
  const { lines, summary } = computeRentalBookingPaymentLines({
    customerKind: "individual",
    rentalDays: Number(input.booking.rental_days ?? 0),
    rentalFeeAmount: money(input.booking.rental_total),
    depositAmount: money(input.booking.deposit_amount),
    source: "server_recompute",
    metadata: { paymentSurface: "booking_deposit_payment" },
  });
  const bookingDeposit = lines.find(
    (line) => line.lineType === "booking_deposit",
  );
  if (!bookingDeposit || bookingDeposit.grossAmount <= 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "BOOKING_DEPOSIT_NOT_DUE",
    });
  }
  return { lines, summary, bookingDeposit };
}

export async function computeAndStoreBookingDepositLines(input: {
  client: AnyClient;
  booking: AnyRecord;
}) {
  const result = computeBookingDepositLinesFromBooking({
    booking: input.booking,
  });

  await input.client
    .from("rental_booking_payment_lines")
    .update({ status: "voided" })
    .eq("booking_id", input.booking.id)
    .eq("source", "server_recompute")
    .eq("status", "active");
  const { error } = await input.client
    .from("rental_booking_payment_lines")
    .insert(
      rentalPaymentLineInsertRows(String(input.booking.id), result.lines),
    );
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return result;
}

export async function assertBookingDepositPaymentEligible(input: {
  client: AnyClient;
  booking: AnyRecord;
  userId: string;
}) {
  if (String(input.booking.user_id ?? "") !== String(input.userId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Booking access denied",
    });
  }
  if (String(input.booking.status ?? "") !== "draft") {
    throw createError({
      statusCode: 422,
      statusMessage: "Only draft bookings can be paid",
    });
  }
  if (input.booking.booking_deposit_payment_status === "paid") {
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_DEPOSIT_ALREADY_PAID",
    });
  }
  await validateRentalBookingForConfirmation({
    adminClient: input.client,
    booking: input.booking,
    userId: input.userId,
  });
}

export function canRetryBookingDepositPayment(input: {
  booking: AnyRecord;
  latestAttempt?: AnyRecord | null;
}): boolean {
  const bookingStatus = String(input.booking.status ?? "");
  const depositStatus = String(
    input.booking.booking_deposit_payment_status ?? "unpaid",
  );
  const latestAttemptStatus = String(input.latestAttempt?.status ?? "");

  return (
    bookingStatus === "draft" &&
    depositStatus !== "paid" &&
    depositStatus !== "paid_confirm_failed" &&
    (latestAttemptStatus === "expired" || latestAttemptStatus === "failed")
  );
}

export function assertGatewayAmountMatchesBookingDeposit(
  expectedAmount: number,
  currencyCode: string,
  charge: AnyRecord,
): void {
  const expected = toGatewayAmount(expectedAmount);
  const actual = Number(charge.amount);
  const expectedCurrency = normalizeCurrency(currencyCode);
  const actualCurrency = normalizeCurrency(charge.currency);
  if (actual !== expected || actualCurrency !== expectedCurrency) {
    throw createError({
      statusCode: 409,
      statusMessage: "PAYMENT_AMOUNT_MISMATCH",
    });
  }
}

async function markBookingDepositConfirmFailed(input: {
  client: AnyClient;
  bookingId: string;
  attemptId: string;
  reason: string;
}) {
  await input.client
    .from("rental_bookings")
    .update({
      booking_deposit_payment_status: "paid_confirm_failed",
      booking_deposit_confirm_failed_at: new Date().toISOString(),
      booking_deposit_confirm_failure_reason: input.reason,
    })
    .eq("id", input.bookingId);
  await recordPaymentAlert(input.client, {
    bookingId: input.bookingId,
    rentalBookingPaymentAttemptId: input.attemptId,
    kind: "booking_deposit_confirm_failed",
    audience: "admin",
    severity: "critical",
    message:
      "Booking Deposit payment was received, but booking confirmation failed. Manual review/refund required.",
    metadata: { reason: input.reason },
  });
}

export async function applyRentalBookingDepositGatewayResult(input: {
  client: AnyClient;
  event?: unknown;
  booking: AnyRecord;
  attempt: AnyRecord;
  result: NormalizedGatewayCharge;
}) {
  const status = input.result.status;
  const { data: updated, error } = await input.client
    .from("rental_booking_payment_attempts")
    .update({
      status,
      gateway_charge_id: input.result.gatewayChargeId,
      gateway_source_id: input.result.gatewaySourceId,
      gateway_authorize_uri: input.result.authorizeUri,
      qr_image_url: input.result.qrImageUrl,
      expires_at: input.result.expiresAt ?? input.attempt.expires_at ?? null,
      failure_code: input.result.failureCode,
      failure_message: input.result.failureMessage,
      raw_gateway_response: input.result.raw,
    })
    .eq("id", input.attempt.id)
    .select(RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT)
    .single();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });

  if (
    status === "paid" &&
    input.booking.booking_deposit_payment_status !== "paid"
  ) {
    await input.client
      .from("rental_bookings")
      .update({
        booking_deposit_payment_status: "paid",
        booking_deposit_paid_amount: Number(input.attempt.amount),
        booking_deposit_paid_at: new Date().toISOString(),
        booking_deposit_payment_attempt_id: input.attempt.id,
        deposit_paid_amount: Number(input.attempt.amount),
        deposit_payment_method: bookingDepositMethodToLegacyDepositMethod(
          input.attempt.method,
        ),
        booking_deposit_confirm_failed_at: null,
        booking_deposit_confirm_failure_reason: null,
      })
      .eq("id", input.booking.id);
    try {
      await confirmRentalBooking({
        adminClient: input.client,
        bookingId: String(input.booking.id),
        userId: String(input.booking.user_id),
        requireBookingDepositPaid: true,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "CONFIRM_FAILED";
      await markBookingDepositConfirmFailed({
        client: input.client,
        bookingId: String(input.booking.id),
        attemptId: String(input.attempt.id),
        reason,
      });
    }
  }

  if (status === "failed" || status === "expired" || status === "cancelled") {
    await input.client
      .from("rental_bookings")
      .update({ booking_deposit_payment_status: status })
      .eq("id", input.booking.id)
      .neq("booking_deposit_payment_status", "paid");
  }
  return updated as AnyRecord;
}

export async function normalizeRentalBookingAttempts(input: {
  client: AnyClient;
  bookingId: string;
  attempts: AnyRecord[];
}) {
  const normalized = [];
  for (const attempt of input.attempts) {
    if (shouldExpireAttempt(attempt)) {
      const { data: expired } = await input.client
        .from("rental_booking_payment_attempts")
        .update({ status: "expired" })
        .eq("id", attempt.id)
        .neq("status", "paid")
        .select(RENTAL_BOOKING_PAYMENT_ATTEMPT_SELECT)
        .single();
      normalized.push(
        mapRentalBookingPaymentAttemptResponse(expired ?? attempt),
      );
    } else {
      normalized.push(mapRentalBookingPaymentAttemptResponse(attempt));
    }
  }
  return normalized;
}

export async function reloadBookingForConfirm(
  client: AnyClient,
  bookingId: string,
) {
  return await loadRentalBookingForConfirmation(client, bookingId);
}
