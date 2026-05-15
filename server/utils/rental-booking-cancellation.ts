import { createError } from "h3";
import {
  BOOKING_DEPOSIT_REFUND_POLICY_VERSION,
  EXCESSIVE_CANCELLATION_RESTRICTION_REASON,
  RENTAL_BOOKING_RESTRICTION_MESSAGE_TH,
  countQualifyingCustomerCancellations,
  evaluateBookingDepositRefundEligibility,
  rollingCancellationWindowStart,
  shouldRestrictForExcessiveCancellations,
} from "~~/server/utils/rental-cancellation-policy";
import {
  OFFICIAL_DOCUMENT_SELECT,
  documentPeriod,
  mapOfficialDocumentRow,
  resolveDocumentHeaderSnapshot,
} from "~~/server/utils/admin-documents";

type Row = Record<string, unknown>;
type QueryError = { message?: string; code?: string; details?: string } | null;
type AnyClient = {
  from(table: string): any;
  rpc?: (
    name: string,
    params: Row,
  ) => Promise<{ data: unknown; error: QueryError }>;
};

export const CUSTOMER_CANCELLATION_DOCUMENT_TYPE =
  "rental_booking_cancellation_confirmation";
export const CUSTOMER_CANCELLATION_DOCUMENT_TEMPLATE =
  "rental_booking_cancellation_confirmation_v1";

const BOOKING_SELECT =
  "id, user_id, status, start_date, end_date, rental_days, hub_id, booker_name, booker_phone, currency_code, booking_deposit_payment_status, booking_deposit_paid_amount, booking_deposit_payment_attempt_id, booking_deposit_mixed_allocation_id, cancelled_at, cancellation_source_event_id";
const DIRECT_ATTEMPT_SELECT =
  "id, booking_id, user_id, gateway, method, status, amount, currency_code, gateway_charge_id, gateway_source_id, created_at";
const MIXED_ALLOCATION_SELECT =
  "id, mixed_checkout_session_id, mixed_payment_attempt_id, user_id, allocation_type, rental_booking_id, amount, currency_code, status, paid_at";
const MIXED_ATTEMPT_SELECT =
  "id, mixed_checkout_session_id, user_id, gateway, method, status, amount, currency_code, gateway_charge_id, gateway_source_id, created_at";
const MIXED_SESSION_SELECT =
  "id, user_id, status, checkout_kind, currency_code, amount_total, booking_deposit_total_amount";
const CANCELLATION_EVENT_SELECT =
  "id, booking_id, user_id, cancellation_initiator, cancellation_source, cancelled_at, pickup_date_snapshot, cancellation_local_date_snapshot, refund_cutoff_date_snapshot, refund_policy_version, refund_timezone, refund_eligible, refund_amount_due, qualifying_cancellation_count_after, restriction_window_started_at";
const REFUND_SELECT =
  "id, status, refund_amount, currency_code, cancellation_event_id";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null {
  const text = clean(value);
  return text.length > 0 ? text : null;
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : 0;
}

function isUniqueViolation(error: QueryError): boolean {
  return error?.code === "23505";
}

function normalizeDigits(value: unknown): string {
  return clean(value).replace(/[\s\-()+.]/g, "");
}

export function validateCustomerCancellationPayload(body: Row) {
  const refundBankName = clean(body.refundBankName);
  const refundBankAccountNumber = normalizeDigits(body.refundBankAccountNumber);
  const refundBankAccountName = clean(body.refundBankAccountName);
  const refundContactPhone = normalizeDigits(body.refundContactPhone);
  if (!refundBankName)
    throw createError({
      statusCode: 422,
      statusMessage: "REFUND_BANK_NAME_REQUIRED",
    });
  if (!/^[0-9]{6,25}$/.test(refundBankAccountNumber))
    throw createError({
      statusCode: 422,
      statusMessage: "REFUND_BANK_ACCOUNT_NUMBER_INVALID",
    });
  if (!refundBankAccountName)
    throw createError({
      statusCode: 422,
      statusMessage: "REFUND_BANK_ACCOUNT_NAME_REQUIRED",
    });
  if (!/^[0-9]{9,15}$/.test(refundContactPhone))
    throw createError({
      statusCode: 422,
      statusMessage: "REFUND_CONTACT_PHONE_INVALID",
    });
  if (body.confirmRefundDestinationAccuracy !== true)
    throw createError({
      statusCode: 422,
      statusMessage: "REFUND_DESTINATION_CONFIRMATION_REQUIRED",
    });
  return {
    refundBankName,
    refundBankAccountNumber,
    refundBankAccountName,
    refundContactPhone,
    refundCustomerNote: optionalText(body.refundCustomerNote),
    cancellationReasonCode: optionalText(body.cancellationReasonCode),
    cancellationReasonNote: optionalText(body.cancellationReasonNote),
  };
}

async function loadBooking(client: AnyClient, bookingId: string): Promise<Row> {
  const { data, error } = await client
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({ statusCode: 404, statusMessage: "BOOKING_NOT_FOUND" });
  return data as Row;
}

function assertCustomerCanCancel(booking: Row, userId: string) {
  if (String(booking.user_id ?? "") !== userId)
    throw createError({
      statusCode: 403,
      statusMessage: "BOOKING_ACCESS_DENIED",
    });
  const status = String(booking.status ?? "");
  if (status === "cancelled") return;
  if (status === "draft")
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_NOT_CONFIRMED",
    });
  if (status === "picked_up" || status === "returned")
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_ALREADY_FULFILLED",
    });
  if (status !== "confirmed")
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_NOT_CANCELLABLE",
    });
  if (String(booking.booking_deposit_payment_status ?? "") !== "paid")
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_DEPOSIT_NOT_PAID",
    });
}

async function maybeSinglePaidAttempt(client: AnyClient, bookingId: string) {
  const { data, error } = await client
    .from("rental_booking_payment_attempts")
    .select(DIRECT_ATTEMPT_SELECT)
    .eq("booking_id", bookingId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return (data ?? null) as Row | null;
}

function sameIfPresent(value: unknown, expected: unknown): boolean {
  const actual = clean(value);
  return !actual || actual === String(expected ?? "");
}

function isPaidDirectAttemptForBooking(attempt: Row | null, booking: Row) {
  return (
    !!attempt &&
    String(attempt.status) === "paid" &&
    String(attempt.booking_id ?? "") === String(booking.id) &&
    sameIfPresent(attempt.user_id, booking.user_id)
  );
}

function isFinalizedBookingDepositAllocationForBooking(
  allocation: Row | null,
  booking: Row,
) {
  return (
    !!allocation &&
    String(allocation.status) === "finalized" &&
    String(allocation.allocation_type) === "booking_deposit" &&
    String(allocation.rental_booking_id ?? "") === String(booking.id) &&
    sameIfPresent(allocation.user_id, booking.user_id)
  );
}

function isPaidMixedAttemptForAllocation(attempt: Row | null, allocation: Row) {
  return (
    !!attempt &&
    isResolvedMixedPaymentStatus(attempt.status) &&
    sameIfPresent(attempt.user_id, allocation.user_id) &&
    sameIfPresent(
      attempt.mixed_checkout_session_id,
      allocation.mixed_checkout_session_id,
    )
  );
}

function isResolvedMixedSessionForAllocation(
  session: Row | null,
  allocation: Row,
) {
  return (
    !!session &&
    isResolvedMixedPaymentStatus(session.status) &&
    String(session.id ?? "") === String(allocation.mixed_checkout_session_id) &&
    sameIfPresent(session.user_id, allocation.user_id)
  );
}

function isResolvedMixedPaymentStatus(status: unknown) {
  return ["paid", "finalized", "partial_finalized"].includes(
    String(status ?? ""),
  );
}

async function loadById(
  client: AnyClient,
  table: string,
  select: string,
  id: unknown,
) {
  if (!clean(id)) return null;
  const { data, error } = await client
    .from(table)
    .select(select)
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return (data ?? null) as Row | null;
}

async function resolveOriginalPaymentSource(client: AnyClient, booking: Row) {
  const bookingId = String(booking.id);
  const direct =
    (await loadById(
      client,
      "rental_booking_payment_attempts",
      DIRECT_ATTEMPT_SELECT,
      booking.booking_deposit_payment_attempt_id,
    )) ?? (await maybeSinglePaidAttempt(client, bookingId));
  if (isPaidDirectAttemptForBooking(direct, booking)) {
    return {
      type: "rental_booking_payment_attempt",
      directAttemptId: String(direct.id),
      mixedAllocationId: null,
      gateway: direct.gateway ?? null,
      gatewayChargeId: optionalText(direct.gateway_charge_id),
      gatewayPaymentReference: optionalText(direct.gateway_source_id),
      amount:
        money(direct.amount) || money(booking.booking_deposit_paid_amount),
      currencyCode:
        clean(direct.currency_code) || clean(booking.currency_code) || "THB",
    };
  }

  let allocation = await loadById(
    client,
    "mixed_payment_allocations",
    MIXED_ALLOCATION_SELECT,
    booking.booking_deposit_mixed_allocation_id,
  );
  if (!isFinalizedBookingDepositAllocationForBooking(allocation, booking)) {
    allocation = null;
  }
  if (!allocation) {
    const { data, error } = await client
      .from("mixed_payment_allocations")
      .select(MIXED_ALLOCATION_SELECT)
      .eq("rental_booking_id", bookingId)
      .eq("allocation_type", "booking_deposit")
      .eq("status", "finalized")
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    const fallback = (data ?? null) as Row | null;
    allocation = isFinalizedBookingDepositAllocationForBooking(
      fallback,
      booking,
    )
      ? fallback
      : null;
  }
  if (allocation) {
    const attempt = await loadById(
      client,
      "mixed_payment_attempts",
      MIXED_ATTEMPT_SELECT,
      allocation.mixed_payment_attempt_id,
    );
    const session = await loadById(
      client,
      "mixed_checkout_sessions",
      MIXED_SESSION_SELECT,
      allocation.mixed_checkout_session_id,
    );
    if (!isPaidMixedAttemptForAllocation(attempt, allocation))
      throw createError({
        statusCode: 409,
        statusMessage: "ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED",
      });
    if (!isResolvedMixedSessionForAllocation(session, allocation))
      throw createError({
        statusCode: 409,
        statusMessage: "ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED",
      });
    return {
      type: "mixed_payment_allocation",
      directAttemptId: null,
      mixedAllocationId: String(allocation.id),
      gateway: attempt.gateway ?? null,
      gatewayChargeId: optionalText(attempt.gateway_charge_id),
      gatewayPaymentReference: optionalText(attempt.gateway_source_id),
      amount:
        money(allocation.amount) || money(booking.booking_deposit_paid_amount),
      currencyCode:
        clean(allocation.currency_code) ||
        clean(booking.currency_code) ||
        "THB",
    };
  }
  throw createError({
    statusCode: 409,
    statusMessage: "ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED",
  });
}

async function loadExistingCancellationResult(
  client: AnyClient,
  booking: Row,
  input: { userId: string; eventIdOverride?: unknown },
) {
  let eventId =
    clean(input.eventIdOverride) || clean(booking.cancellation_source_event_id);
  let cancellationEvent: Row | null = null;
  if (eventId) {
    const { data: event, error } = await client
      .from("rental_booking_cancellation_events")
      .select(CANCELLATION_EVENT_SELECT)
      .eq("id", eventId)
      .eq("booking_id", booking.id)
      .eq("cancellation_initiator", "customer")
      .eq("cancellation_source", "customer_web")
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    cancellationEvent = (event ?? null) as Row | null;
    eventId = clean(cancellationEvent?.id);
  }
  if (!eventId) {
    const { data: event, error } = await client
      .from("rental_booking_cancellation_events")
      .select(CANCELLATION_EVENT_SELECT)
      .eq("booking_id", booking.id)
      .eq("cancellation_initiator", "customer")
      .eq("cancellation_source", "customer_web")
      .order("cancelled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    cancellationEvent = (event ?? null) as Row | null;
    eventId = clean(cancellationEvent?.id);
  }
  if (!eventId || !cancellationEvent) return null;
  const { data: refund, error: refundError } = await client
    .from("payment_refunds")
    .select(REFUND_SELECT)
    .eq("cancellation_event_id", eventId)
    .maybeSingle();
  if (refundError)
    throw createError({ statusCode: 500, statusMessage: refundError.message });
  const refundRow = (refund ?? null) as Row | null;
  const document = refundRow
    ? await tryIssueCancellationConfirmationDocument({
        client,
        booking,
        event: cancellationEvent,
        refund: refundRow,
        userId: input.userId,
      })
    : { document: null, documentIssueStatus: "missing_refund" };
  const count = Number(
    cancellationEvent.qualifying_cancellation_count_after ?? 0,
  );
  const restricted = shouldRestrictForExcessiveCancellations(count);
  return {
    ok: true,
    alreadyCancelled: true,
    booking: {
      id: booking.id,
      status: "cancelled",
      cancelledAt:
        clean(cancellationEvent.cancelled_at) || clean(booking.cancelled_at),
    },
    cancellation: {
      eventId,
      eligibility: {
        eligible: cancellationEvent.refund_eligible === true,
        timeZone: clean(cancellationEvent.refund_timezone) || "Asia/Bangkok",
        policyVersion:
          clean(cancellationEvent.refund_policy_version) ||
          BOOKING_DEPOSIT_REFUND_POLICY_VERSION,
        pickupLocalDate: clean(cancellationEvent.pickup_date_snapshot),
        cancellationLocalDate: clean(
          cancellationEvent.cancellation_local_date_snapshot,
        ),
        refundCutoffLocalDate: clean(
          cancellationEvent.refund_cutoff_date_snapshot,
        ),
      },
      refundAmountDue: money(cancellationEvent.refund_amount_due),
    },
    cancellationEventId: eventId,
    refundRequest: refundRow
      ? {
          id: refundRow.id,
          status: refundRow.status,
          amount: money(refundRow.refund_amount),
          currencyCode:
            clean(refundRow.currency_code) || clean(booking.currency_code),
        }
      : null,
    restriction: {
      status: restricted ? "restricted" : "none",
      count,
      windowStartedAt: clean(cancellationEvent.restriction_window_started_at),
      messageTh: restricted ? RENTAL_BOOKING_RESTRICTION_MESSAGE_TH : null,
    },
    document: document.document ? documentSummary(document.document) : null,
    documentIssueStatus: document.documentIssueStatus,
    availabilityReleasedByStatus: true,
  };
}

async function fetchExistingCancellationDocument(
  client: AnyClient,
  eventId: unknown,
) {
  const { data, error } = await client
    .from("official_documents")
    .select(OFFICIAL_DOCUMENT_SELECT)
    .eq("source_type", "rental_booking_cancellation_event")
    .eq("source_id", eventId)
    .eq("document_type", CUSTOMER_CANCELLATION_DOCUMENT_TYPE)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return data ? mapOfficialDocumentRow(data as Row) : null;
}

function documentSummary(document: Row) {
  return {
    id: document.id,
    documentType: document.documentType,
    documentNo: document.documentNo,
    status: document.status,
  };
}

async function tryIssueCancellationConfirmationDocument(input: {
  client: AnyClient;
  booking: Row;
  event: Row;
  refund: Row;
  userId: string;
}) {
  try {
    const document = await issueCancellationConfirmationDocument(input);
    return {
      document,
      documentIssueStatus: document ? "available" : "not_attempted",
    };
  } catch {
    return { document: null, documentIssueStatus: "retryable" };
  }
}

async function issueCancellationConfirmationDocument(input: {
  client: AnyClient;
  booking: Row;
  event: Row;
  refund: Row;
  userId: string;
}) {
  const existing = await fetchExistingCancellationDocument(
    input.client,
    input.event.id,
  );
  if (existing) return existing;
  if (!input.client.rpc) return null;
  const issuedAt = new Date();
  const branchId = optionalText(input.booking.hub_id);
  const { data: documentNo, error: numberError } = await input.client.rpc(
    "f_next_document_number",
    {
      p_document_type: CUSTOMER_CANCELLATION_DOCUMENT_TYPE,
      p_branch_id: branchId,
      p_period: documentPeriod(issuedAt),
      p_prefix: "CXL",
    },
  );
  if (numberError)
    throw createError({ statusCode: 500, statusMessage: numberError.message });
  const header = await resolveDocumentHeaderSnapshot({
    adminClient: input.client as never,
    branchId,
  });
  const snapshot = {
    schema_version: 1,
    document: {
      document_type: CUSTOMER_CANCELLATION_DOCUMENT_TYPE,
      document_number: String(documentNo),
      issued_at: issuedAt.toISOString(),
      template_key: CUSTOMER_CANCELLATION_DOCUMENT_TEMPLATE,
      template_version: 1,
    },
    source: {
      source_type: "rental_booking_cancellation_event",
      source_id: input.event.id,
    },
    header,
    booking: {
      id: input.booking.id,
      start_date: input.booking.start_date,
      end_date: input.booking.end_date,
    },
    cancellation: {
      cancelled_at: input.event.cancelled_at,
      pickup_date_snapshot: input.event.pickup_date_snapshot,
      refund_cutoff_date_snapshot: input.event.refund_cutoff_date_snapshot,
      refund_eligible: input.event.refund_eligible,
      refund_amount_due: input.event.refund_amount_due,
    },
    refund: {
      id: input.refund.id,
      status: input.refund.status,
      amount: input.refund.refund_amount,
      currency_code: input.refund.currency_code,
    },
    disclaimer: {
      th: "สร้างคำขอคืนเงินแล้ว แต่ยังไม่ได้คืนเงิน",
      en: "Refund request created; refund has not been completed yet. Not a receipt or tax invoice.",
    },
  };
  const { data, error } = await input.client
    .from("official_documents")
    .insert({
      document_type: CUSTOMER_CANCELLATION_DOCUMENT_TYPE,
      document_no: String(documentNo),
      status: "issued",
      branch_id: branchId,
      source_type: "rental_booking_cancellation_event",
      source_id: input.event.id,
      customer_user_id: input.userId,
      issued_at: issuedAt.toISOString(),
      issued_by: input.userId,
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
      currency_code: input.refund.currency_code,
      template_key: CUSTOMER_CANCELLATION_DOCUMENT_TEMPLATE,
      template_version: 1,
      snapshot,
      idempotency_key: `rental_booking_cancellation_event:${input.event.id}:${CUSTOMER_CANCELLATION_DOCUMENT_TYPE}`,
    })
    .select(OFFICIAL_DOCUMENT_SELECT)
    .maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) {
      return fetchExistingCancellationDocument(input.client, input.event.id);
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  if (!data) return null;
  const document = mapOfficialDocumentRow(data as Row);
  const { error: eventError } = await input.client
    .from("document_events")
    .insert({
      document_id: document.id,
      event_type: "issued",
      staff_user_id: input.userId,
      metadata: {
        sourceType: "rental_booking_cancellation_event",
        sourceId: input.event.id,
        documentType: CUSTOMER_CANCELLATION_DOCUMENT_TYPE,
      },
    });
  if (eventError) return document;
  return document;
}

export async function cancelCustomerRentalBooking(input: {
  client: AnyClient;
  bookingId: string;
  userId: string;
  body: Row;
  now?: Date;
  preferTransactionalRpc?: boolean;
}) {
  const now = input.now ?? new Date();
  const cancelledAt = now.toISOString();
  const booking = await loadBooking(input.client, input.bookingId);
  assertCustomerCanCancel(booking, input.userId);
  if (String(booking.status) === "cancelled") {
    const existing = await loadExistingCancellationResult(
      input.client,
      booking,
      { userId: input.userId },
    );
    if (existing) return existing;
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_ALREADY_CANCELLED",
    });
  }
  const payload = validateCustomerCancellationPayload(input.body);
  const eligibility = evaluateBookingDepositRefundEligibility({
    pickupDate: booking.start_date as string,
    cancellationAt: now,
  });
  if (!eligibility.eligible)
    throw createError({
      statusCode: 409,
      statusMessage: "CANCELLATION_REFUND_CUTOFF_PASSED",
      data: { supportRequired: true, eligibility },
    });
  const source = await resolveOriginalPaymentSource(input.client, booking);
  if (source.amount <= 0)
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_DEPOSIT_REFUND_AMOUNT_NOT_RESOLVED",
    });
  if (input.preferTransactionalRpc && typeof input.client.rpc === "function") {
    return cancelCustomerRentalBookingViaRpc({
      client: input.client,
      booking,
      userId: input.userId,
      payload,
      source,
      eligibility,
      cancelledAt,
      now,
    });
  }
  const eventPayload = {
    booking_id: booking.id,
    user_id: input.userId,
    actor_user_id: input.userId,
    actor_type: "customer",
    cancelled_at: cancelledAt,
    cancellation_initiator: "customer",
    cancellation_source: "customer_web",
    cancellation_reason_code: payload.cancellationReasonCode,
    cancellation_reason_note: payload.cancellationReasonNote,
    previous_status: booking.status,
    previous_booking_deposit_payment_status:
      booking.booking_deposit_payment_status,
    pickup_date_snapshot: eligibility.pickupLocalDate,
    cancellation_local_date_snapshot: eligibility.cancellationLocalDate,
    refund_cutoff_date_snapshot: eligibility.refundCutoffLocalDate,
    refund_policy_version: BOOKING_DEPOSIT_REFUND_POLICY_VERSION,
    refund_timezone: eligibility.timeZone,
    refund_eligible: true,
    refund_amount_due: source.amount,
    qualifies_for_restriction: true,
    metadata: { originalPaymentSourceType: source.type },
  };
  const { data: event, error: eventError } = await input.client
    .from("rental_booking_cancellation_events")
    .insert(eventPayload)
    .select("*")
    .maybeSingle();
  if (eventError) {
    if (isUniqueViolation(eventError)) {
      const existing = await loadExistingCancellationResult(
        input.client,
        booking,
        { userId: input.userId },
      );
      if (existing?.refundRequest) return existing;
      throw createError({
        statusCode: 409,
        statusMessage: "BOOKING_CANCELLATION_ALREADY_REQUESTED",
      });
    }
    throw createError({ statusCode: 500, statusMessage: eventError.message });
  }
  const cancellationEvent = event as Row;
  const { data: refund, error: refundError } = await input.client
    .from("payment_refunds")
    .insert({
      refund_type: "rental_booking_deposit",
      booking_id: booking.id,
      user_id: input.userId,
      cancellation_event_id: cancellationEvent.id,
      original_payment_source_type: source.type,
      original_rental_booking_payment_attempt_id: source.directAttemptId,
      original_mixed_payment_allocation_id: source.mixedAllocationId,
      gateway: source.gateway,
      gateway_charge_id: source.gatewayChargeId,
      gateway_payment_reference: source.gatewayPaymentReference,
      refund_amount: source.amount,
      currency_code: source.currencyCode,
      refund_bank_name: payload.refundBankName,
      refund_bank_account_number: payload.refundBankAccountNumber,
      refund_bank_account_name: payload.refundBankAccountName,
      refund_contact_phone: payload.refundContactPhone,
      customer_note: payload.refundCustomerNote,
      customer_confirmed_destination_at: cancelledAt,
      status: "pending_admin_review",
      requested_at: cancelledAt,
      metadata: { cancellationPolicyVersion: eligibility.policyVersion },
    })
    .select("*")
    .maybeSingle();
  if (refundError) {
    if (isUniqueViolation(refundError)) {
      const existing = await loadExistingCancellationResult(
        input.client,
        booking,
        { userId: input.userId, eventIdOverride: cancellationEvent.id },
      );
      if (existing?.refundRequest) return existing;
      throw createError({
        statusCode: 409,
        statusMessage: "BOOKING_DEPOSIT_REFUND_ALREADY_REQUESTED",
      });
    }
    throw createError({ statusCode: 500, statusMessage: refundError.message });
  }

  const { data: events } = await input.client
    .from("rental_booking_cancellation_events")
    .select("*")
    .eq("user_id", input.userId)
    .eq("qualifies_for_restriction", true)
    .gte("cancelled_at", rollingCancellationWindowStart(now).toISOString());
  const countResult = countQualifyingCustomerCancellations({
    events: (events ?? []) as Row[],
    asOf: now,
    userId: input.userId,
  });
  await input.client
    .from("rental_booking_cancellation_events")
    .update({
      qualifying_cancellation_count_after: countResult.count,
      restriction_window_started_at: countResult.windowStartedAt,
    })
    .eq("id", cancellationEvent.id);
  let restrictionStatus = "none";
  if (shouldRestrictForExcessiveCancellations(countResult.count)) {
    restrictionStatus = "restricted";
    await input.client
      .from("users")
      .update({
        rental_booking_restriction_status: "restricted",
        rental_booking_restriction_applied_at: cancelledAt,
        rental_booking_restriction_reason:
          EXCESSIVE_CANCELLATION_RESTRICTION_REASON,
        rental_booking_restriction_source_event_id: cancellationEvent.id,
        rental_booking_restriction_cancellation_count: countResult.count,
        rental_booking_restriction_window_started_at:
          countResult.windowStartedAt,
      })
      .eq("id", input.userId);
  }

  const { data: updatedBooking, error: bookingUpdateError } = await input.client
    .from("rental_bookings")
    .update({
      status: "cancelled",
      cancelled_at: cancelledAt,
      cancelled_by_user_id: input.userId,
      cancellation_initiator: "customer",
      cancellation_source: "customer_web",
      cancellation_reason:
        payload.cancellationReasonNote ?? payload.cancellationReasonCode,
      cancellation_source_event_id: cancellationEvent.id,
      cancellation_refund_eligible: true,
      cancellation_refund_amount_due: source.amount,
      cancellation_refund_cutoff_date: eligibility.refundCutoffLocalDate,
    })
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .select(BOOKING_SELECT)
    .maybeSingle();
  if (bookingUpdateError)
    throw createError({
      statusCode: 500,
      statusMessage: bookingUpdateError.message,
    });
  if (!updatedBooking)
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_CANCELLATION_CONFLICT",
    });

  const document = await tryIssueCancellationConfirmationDocument({
    client: input.client,
    booking: updatedBooking as Row,
    event: cancellationEvent,
    refund: refund as Row,
    userId: input.userId,
  });
  return {
    ok: true,
    booking: { id: booking.id, status: "cancelled", cancelledAt },
    cancellation: {
      eventId: cancellationEvent.id,
      eligibility,
      refundAmountDue: source.amount,
    },
    refundRequest: {
      id: (refund as Row).id,
      status: "pending_admin_review",
      amount: source.amount,
      currencyCode: source.currencyCode,
    },
    restriction: {
      status: restrictionStatus,
      count: countResult.count,
      windowStartedAt: countResult.windowStartedAt,
      messageTh:
        restrictionStatus === "restricted"
          ? RENTAL_BOOKING_RESTRICTION_MESSAGE_TH
          : null,
    },
    document: document.document
      ? {
          id: document.document.id,
          documentType: document.document.documentType,
          documentNo: document.document.documentNo,
          status: document.document.status,
        }
      : null,
    documentIssueStatus: document.documentIssueStatus,
    availabilityReleasedByStatus: true,
  };
}

async function cancelCustomerRentalBookingViaRpc(input: {
  client: AnyClient;
  booking: Row;
  userId: string;
  payload: ReturnType<typeof validateCustomerCancellationPayload>;
  source: Row;
  eligibility: ReturnType<typeof evaluateBookingDepositRefundEligibility>;
  cancelledAt: string;
  now: Date;
}) {
  const windowStart = rollingCancellationWindowStart(input.now).toISOString();
  const { data, error } = await input.client.rpc!(
    "f_cancel_customer_rental_booking_refund_request",
    {
      p_booking_id: input.booking.id,
      p_user_id: input.userId,
      p_cancelled_at: input.cancelledAt,
      p_cancellation_reason_code: input.payload.cancellationReasonCode,
      p_cancellation_reason_note: input.payload.cancellationReasonNote,
      p_pickup_local_date: input.eligibility.pickupLocalDate,
      p_cancellation_local_date: input.eligibility.cancellationLocalDate,
      p_refund_cutoff_date: input.eligibility.refundCutoffLocalDate,
      p_refund_policy_version: input.eligibility.policyVersion,
      p_refund_timezone: input.eligibility.timeZone,
      p_refund_amount: input.source.amount,
      p_original_payment_source_type: input.source.type,
      p_original_rental_booking_payment_attempt_id:
        input.source.directAttemptId,
      p_original_mixed_payment_allocation_id: input.source.mixedAllocationId,
      p_gateway: input.source.gateway,
      p_gateway_charge_id: input.source.gatewayChargeId,
      p_gateway_payment_reference: input.source.gatewayPaymentReference,
      p_currency_code: input.source.currencyCode,
      p_refund_bank_name: input.payload.refundBankName,
      p_refund_bank_account_number: input.payload.refundBankAccountNumber,
      p_refund_bank_account_name: input.payload.refundBankAccountName,
      p_refund_contact_phone: input.payload.refundContactPhone,
      p_refund_customer_note: input.payload.refundCustomerNote,
      p_restriction_window_started_at: windowStart,
    },
  );
  if (error) {
    throw createError({
      statusCode: rpcCancellationStatusCode(error.message),
      statusMessage: clean(error.message) || "BOOKING_CANCELLATION_FAILED",
    });
  }
  const result = (data ?? {}) as Row;
  if (result.alreadyCancelled === true) {
    const existing = await loadExistingCancellationResult(
      input.client,
      {
        ...input.booking,
        status: "cancelled",
        cancellation_source_event_id: result.cancellationEventId,
      },
      {
        userId: input.userId,
        eventIdOverride: result.cancellationEventId,
      },
    );
    return existing ?? result;
  }
  const booking = (result.booking ?? {}) as Row;
  const cancellationEvent = (result.cancellationEvent ?? {}) as Row;
  const refund = (result.refund ?? {}) as Row;
  const restriction = (result.restriction ?? {}) as Row;
  const document = await tryIssueCancellationConfirmationDocument({
    client: input.client,
    booking,
    event: cancellationEvent,
    refund,
    userId: input.userId,
  });
  const restrictionStatus = clean(restriction.status) || "none";
  return {
    ok: true,
    booking: {
      id: booking.id,
      status: "cancelled",
      cancelledAt: input.cancelledAt,
    },
    cancellation: {
      eventId: cancellationEvent.id,
      eligibility: input.eligibility,
      refundAmountDue: input.source.amount,
    },
    refundRequest: {
      id: refund.id,
      status: refund.status,
      amount: money(refund.refund_amount),
      currencyCode: clean(refund.currency_code) || input.source.currencyCode,
    },
    restriction: {
      status: restrictionStatus,
      count: Number(restriction.count ?? 0),
      windowStartedAt: clean(restriction.windowStartedAt),
      messageTh:
        restrictionStatus === "restricted"
          ? RENTAL_BOOKING_RESTRICTION_MESSAGE_TH
          : null,
    },
    document: document.document
      ? {
          id: document.document.id,
          documentType: document.document.documentType,
          documentNo: document.document.documentNo,
          status: document.document.status,
        }
      : null,
    documentIssueStatus: document.documentIssueStatus,
    availabilityReleasedByStatus: true,
  };
}

function rpcCancellationStatusCode(message: unknown): number {
  const text = clean(message);
  if (text === "BOOKING_ACCESS_DENIED") return 403;
  if (text === "BOOKING_NOT_FOUND") return 404;
  if (text.includes("BOOKING_DEPOSIT_NOT_PAID")) return 409;
  if (text.includes("BOOKING_NOT_CONFIRMED")) return 409;
  if (text.includes("BOOKING_ALREADY_FULFILLED")) return 409;
  if (text.includes("BOOKING_NOT_CANCELLABLE")) return 409;
  if (text.includes("ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED")) return 409;
  if (text.includes("BOOKING_DEPOSIT_REFUND_AMOUNT_NOT_RESOLVED")) return 409;
  if (text.includes("BOOKING_CANCELLATION_CONFLICT")) return 409;
  if (text.includes("CANCELLATION_REFUND_CUTOFF_PASSED")) return 409;
  return 500;
}
