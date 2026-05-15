import { createError } from "h3";
import {
  documentPeriod,
  mapOfficialDocumentRow,
  resolveDocumentHeaderSnapshot,
  OFFICIAL_DOCUMENT_SELECT,
} from "~~/server/utils/admin-documents";
import { evaluateBookingDepositRefundEligibility } from "~~/server/utils/rental-cancellation-policy";
import {
  FORFEITURE_RECEIPT_DOCUMENT_TYPE,
  NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
} from "~~/server/utils/rental-booking-no-show-documents";

type Row = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  storage?: {
    from(bucket: string): {
      createSignedUrl: (
        path: string,
        ttlSeconds: number,
      ) => Promise<{
        data: { signedUrl?: string } | null;
        error: { message?: string } | null;
      }>;
    };
  };
  rpc?: (
    name: string,
    params: Row,
  ) => Promise<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};

export const CUSTOMER_RENTAL_DOCUMENT_TYPES = [
  "rental_booking_confirmation",
  "rental_booking_deposit_payment_confirmation",
] as const;
export type CustomerRentalDocumentType =
  (typeof CUSTOMER_RENTAL_DOCUMENT_TYPES)[number];
export const CUSTOMER_SAFE_DOCUMENT_TYPES = [
  ...CUSTOMER_RENTAL_DOCUMENT_TYPES,
  "rental_booking_cancellation_confirmation",
  "rental_booking_deposit_refund_confirmation",
  FORFEITURE_RECEIPT_DOCUMENT_TYPE,
  NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
] as const;

const BOOKING_SELECT =
  "id, user_id, status, product_name, thumbnail, asset_code, asset_name, asset_thumbnail, matched_product_name, start_date, end_date, rental_days, hub_id, hub_name, booker_name, booker_phone, rental_total, deposit_amount, daily_rate, weekly_rate, monthly_rate, currency_code, pricing_breakdown, booking_deposit_payment_status, booking_deposit_paid_amount, booking_deposit_paid_at, booking_deposit_payment_attempt_id, created_at, updated_at, cancelled_at, cancellation_source_event_id, cancellation_refund_eligible, cancellation_refund_amount_due, cancellation_refund_cutoff_date, no_show_source_event_id";
const ATTEMPT_SELECT =
  "id, method, status, amount, currency_code, gateway_charge_id, gateway_source_id, created_at, updated_at";
const EVENT_SELECT =
  "id, booking_id, user_id, cancelled_at, cancellation_initiator, cancellation_source, cancellation_reason_code, cancellation_reason_note, refund_cutoff_date_snapshot, refund_eligible, refund_amount_due";
const REFUND_SELECT =
  "id, booking_id, user_id, cancellation_event_id, status, refund_amount, currency_code, requested_at, refunded_at, customer_confirmed_destination_at, refund_proof_id";
const NO_SHOW_EVENT_SELECT = "id, booking_id, marked_at";
const NO_SHOW_DISPOSITION_SELECT =
  "id, booking_id, source_event_type, no_show_event_id";
const NO_SHOW_RECOGNITION_SELECT =
  "id, booking_id, source_type, source_id, recognition_type";
const REFUND_PROOF_SELECT_CUSTOMER =
  "id, booking_id, proof_kind, storage_bucket, storage_path, mime_type, file_size_bytes, created_at";
const REFUND_PROOF_SIGNED_URL_TTL_SECONDS = 60;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
function toCustomerEndDate(value: unknown): string {
  const d = text(value);
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}
function isCustomerSafeDocumentType(value: unknown): boolean {
  return CUSTOMER_SAFE_DOCUMENT_TYPES.includes(
    value as (typeof CUSTOMER_SAFE_DOCUMENT_TYPES)[number],
  );
}

export function normalizeCustomerRentalDocumentType(
  value: unknown,
): CustomerRentalDocumentType {
  if (
    CUSTOMER_RENTAL_DOCUMENT_TYPES.includes(value as CustomerRentalDocumentType)
  )
    return value as CustomerRentalDocumentType;
  throw createError({
    statusCode: 400,
    statusMessage: "Unsupported customer rental document type",
  });
}

export async function loadCustomerRentalBookingRow(
  client: AnyClient,
  bookingId: string,
  userId: string,
): Promise<Row> {
  const { data, error } = await client
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({ statusCode: 404, statusMessage: "BOOKING_NOT_FOUND" });
  if (String((data as Row).user_id ?? "") !== userId)
    throw createError({
      statusCode: 403,
      statusMessage: "BOOKING_ACCESS_DENIED",
    });
  return data as Row;
}

async function loadLatestPaymentAttempt(client: AnyClient, booking: Row) {
  const attemptId = text(booking.booking_deposit_payment_attempt_id);
  let query = client
    .from("rental_booking_payment_attempts")
    .select(ATTEMPT_SELECT);
  query = attemptId
    ? query.eq("id", attemptId)
    : query
        .eq("booking_id", booking.id)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1);
  const { data, error } = await query.maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return (data ?? null) as Row | null;
}

async function loadCancellationState(client: AnyClient, booking: Row) {
  let event: Row | null = null;
  const eventId = text(booking.cancellation_source_event_id);
  if (eventId) {
    const result = await client
      .from("rental_booking_cancellation_events")
      .select(EVENT_SELECT)
      .eq("id", eventId)
      .maybeSingle();
    if (result.error)
      throw createError({
        statusCode: 500,
        statusMessage: result.error.message,
      });
    event = (result.data ?? null) as Row | null;
  }
  if (!event && String(booking.status) === "cancelled") {
    const result = await client
      .from("rental_booking_cancellation_events")
      .select(EVENT_SELECT)
      .eq("booking_id", booking.id)
      .eq("cancellation_initiator", "customer")
      .eq("cancellation_source", "customer_web")
      .order("cancelled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error)
      throw createError({
        statusCode: 500,
        statusMessage: result.error.message,
      });
    event = (result.data ?? null) as Row | null;
  }
  let refund: Row | null = null;
  let refundProof: Row | null = null;
  let cancellationDocument = null;
  let refundDocument = null;
  if (event?.id) {
    const refundResult = await client
      .from("payment_refunds")
      .select(REFUND_SELECT)
      .eq("cancellation_event_id", event.id)
      .maybeSingle();
    if (refundResult.error)
      throw createError({
        statusCode: 500,
        statusMessage: refundResult.error.message,
      });
    refund = (refundResult.data ?? null) as Row | null;
    if (refund?.refund_proof_id) {
      const proofResult = await client
        .from("rental_booking_deposit_proofs")
        .select(REFUND_PROOF_SELECT_CUSTOMER)
        .eq("id", refund.refund_proof_id)
        .maybeSingle();
      if (proofResult.error)
        throw createError({
          statusCode: 500,
          statusMessage: proofResult.error.message,
        });
      const proof = (proofResult.data ?? null) as Row | null;
      if (
        proof &&
        text(proof.booking_id) === text(booking.id) &&
        text(proof.proof_kind) === "refund"
      ) {
        refundProof = proof;
      }
    }
    cancellationDocument = await loadDocumentBySource(
      client,
      "rental_booking_cancellation_event",
      String(event.id),
      "rental_booking_cancellation_confirmation",
    );
    if (
      refund?.id &&
      refundConfirmationIsCustomerAvailable(refund, refundProof)
    ) {
      refundDocument = await loadDocumentBySource(
        client,
        "payment_refund",
        text(refund.id),
        "rental_booking_deposit_refund_confirmation",
      );
    }
  }
  return { event, refund, refundProof, cancellationDocument, refundDocument };
}

async function loadDocumentBySource(
  client: AnyClient,
  sourceType: string,
  sourceId: string,
  documentType: string,
) {
  const { data, error } = await client
    .from("official_documents")
    .select(OFFICIAL_DOCUMENT_SELECT)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("document_type", documentType)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return data ? mapOfficialDocumentRow(data as Row) : null;
}

async function loadNoShowForfeitureState(client: AnyClient, booking: Row) {
  if (text(booking.status) !== "no_show") {
    return { receiptDocument: null, noticeDocument: null };
  }
  const bookingId = text(booking.id);
  const noShowId = text(booking.no_show_source_event_id);
  let noShowEvent: Row | null = null;
  if (noShowId) {
    const { data, error } = await client
      .from("rental_booking_no_show_events")
      .select(NO_SHOW_EVENT_SELECT)
      .eq("id", noShowId)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    noShowEvent = (data ?? null) as Row | null;
  }
  if (!noShowEvent) {
    const { data, error } = await client
      .from("rental_booking_no_show_events")
      .select(NO_SHOW_EVENT_SELECT)
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    noShowEvent = (data ?? null) as Row | null;
  }
  if (!noShowEvent?.id) return { receiptDocument: null, noticeDocument: null };

  const { data: disposition, error: dispositionError } = await client
    .from("rental_booking_deposit_disposition_events")
    .select(NO_SHOW_DISPOSITION_SELECT)
    .eq("no_show_event_id", noShowEvent.id)
    .maybeSingle();
  if (dispositionError)
    throw createError({
      statusCode: 500,
      statusMessage: dispositionError.message,
    });
  let recognition: Row | null = null;
  if (
    disposition &&
    text((disposition as Row).source_event_type) === "no_show"
  ) {
    const { data, error } = await client
      .from("financial_recognition_events")
      .select(NO_SHOW_RECOGNITION_SELECT)
      .eq("source_id", (disposition as Row).id)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    const row = (data ?? null) as Row | null;
    if (
      row &&
      text(row.source_type) === "rental_booking_deposit_disposition_event" &&
      text(row.recognition_type) === "booking_deposit_forfeiture_income"
    ) {
      recognition = row;
    }
  }

  const [noticeDocument, receiptDocument] = await Promise.all([
    loadDocumentBySource(
      client,
      "rental_booking_no_show_event",
      text(noShowEvent.id),
      NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
    ),
    recognition?.id
      ? loadDocumentBySource(
          client,
          "financial_recognition_event",
          text(recognition.id),
          FORFEITURE_RECEIPT_DOCUMENT_TYPE,
        )
      : Promise.resolve(null),
  ]);
  return { receiptDocument, noticeDocument };
}

function documentSummary(document: Row | null) {
  return document
    ? {
        id: document.id,
        documentType: document.documentType,
        documentNo: document.documentNo,
        status: document.status,
        issuedAt: document.issuedAt,
      }
    : null;
}

function customerRefundProofSummary(proof: Row | null) {
  return proof
    ? {
        exists: true,
        id: text(proof.id),
        mimeType: text(proof.mime_type) || null,
        fileSizeBytes: Number(proof.file_size_bytes ?? 0),
        createdAt: text(proof.created_at) || null,
      }
    : { exists: false };
}

function refundConfirmationIsCustomerAvailable(
  refund: Row | null,
  proof: Row | null,
) {
  return (
    text(refund?.status) === "refunded" &&
    Boolean(text(refund?.refund_proof_id)) &&
    Boolean(proof) &&
    text(proof?.proof_kind) === "refund"
  );
}

function historyDocumentSummary(document: Row | null) {
  return document
    ? {
        id: text(document.id),
        status: text(document.status) || null,
        documentNo: text(document.document_no) || null,
        issuedAt: text(document.issued_at) || null,
      }
    : null;
}

export async function getCustomerRentalBookingDetail(
  client: AnyClient,
  bookingId: string,
  userId: string,
  now = new Date(),
) {
  const booking = await loadCustomerRentalBookingRow(client, bookingId, userId);
  const [paymentAttempt, cancellation, bookingDoc, paymentDoc, noShowDocs] =
    await Promise.all([
      loadLatestPaymentAttempt(client, booking),
      loadCancellationState(client, booking),
      loadDocumentBySource(
        client,
        "rental_booking",
        bookingId,
        "rental_booking_confirmation",
      ),
      loadDocumentBySource(
        client,
        "rental_booking",
        bookingId,
        "rental_booking_deposit_payment_confirmation",
      ),
      loadNoShowForfeitureState(client, booking),
    ]);
  const currencyCode = text(booking.currency_code) || "THB";
  const depositPaid = money(booking.booking_deposit_paid_amount);
  const depositTotal = money(booking.deposit_amount);
  const rentalFee = money(booking.rental_total);
  const eligibility =
    String(booking.status) === "confirmed" &&
    String(booking.booking_deposit_payment_status) === "paid"
      ? evaluateBookingDepositRefundEligibility({
          pickupDate: text(booking.start_date),
          cancellationAt: now,
        })
      : null;
  return {
    booking: {
      id: text(booking.id),
      reference: text(booking.id),
      status: text(booking.status),
      bookingDepositPaymentStatus:
        text(booking.booking_deposit_payment_status) || "unpaid",
      createdAt: text(booking.created_at),
      updatedAt: text(booking.updated_at),
      cancelledAt: text(booking.cancelled_at),
      startDate: text(booking.start_date),
      endDate: toCustomerEndDate(booking.end_date),
      rentalDays: Number(booking.rental_days ?? 0),
      hubName: text(booking.hub_name),
      hubId: text(booking.hub_id) || null,
      bookerName: text(booking.booker_name),
      bookerPhone: text(booking.booker_phone),
      itemName:
        text(booking.asset_name) ||
        text(booking.matched_product_name) ||
        text(booking.product_name),
      assetCode: text(booking.asset_code),
      thumbnail: text(booking.asset_thumbnail) || text(booking.thumbnail),
      qrValue: `booking:${booking.id}`,
    },
    money: {
      currencyCode,
      bookingDepositPaid: depositPaid,
      bookingDepositDueNow: depositPaid || money(paymentAttempt?.amount),
      rentalFeeDueAtPickup: rentalFee,
      remainingRefundableSecurityDepositDueAtPickup: Math.max(
        0,
        depositTotal - depositPaid,
      ),
      totalDueAtPickup: rentalFee + Math.max(0, depositTotal - depositPaid),
      securityDepositTotal: depositTotal,
    },
    payment: {
      attemptId: text(paymentAttempt?.id),
      method: text(paymentAttempt?.method),
      paidAt:
        text(booking.booking_deposit_paid_at) ||
        text(paymentAttempt?.updated_at),
      reference:
        text(paymentAttempt?.gateway_charge_id) ||
        text(paymentAttempt?.gateway_source_id),
    },
    cancellation: cancellation.event
      ? {
          eventId: cancellation.event.id,
          cancelledAt: cancellation.event.cancelled_at,
          refundEligible: cancellation.event.refund_eligible === true,
          refundAmountDue: money(cancellation.event.refund_amount_due),
          refundCutoffDate:
            text(cancellation.event.refund_cutoff_date_snapshot) ||
            text(booking.cancellation_refund_cutoff_date),
          reasonCode: cancellation.event.cancellation_reason_code,
          reasonNote: cancellation.event.cancellation_reason_note,
        }
      : null,
    refundRequest: cancellation.refund
      ? {
          id: cancellation.refund.id,
          status: cancellation.refund.status,
          amount: money(cancellation.refund.refund_amount),
          currencyCode: text(cancellation.refund.currency_code) || currencyCode,
          requestedAt: cancellation.refund.requested_at,
          refundedAt: text(cancellation.refund.refunded_at) || null,
        }
      : null,
    refundProof: customerRefundProofSummary(cancellation.refundProof),
    eligibility,
    documents: {
      bookingConfirmation: documentSummary(bookingDoc as Row | null),
      bookingDepositPaymentConfirmation: documentSummary(
        paymentDoc as Row | null,
      ),
      cancellationConfirmation: documentSummary(
        cancellation.cancellationDocument as Row | null,
      ),
      refundConfirmation: documentSummary(
        refundConfirmationIsCustomerAvailable(
          cancellation.refund,
          cancellation.refundProof,
        )
          ? (cancellation.refundDocument as Row | null)
          : null,
      ),
      bookingDepositForfeitureReceipt: documentSummary(
        noShowDocs.receiptDocument as Row | null,
      ),
      noShowForfeitureNotice: documentSummary(
        noShowDocs.noticeDocument as Row | null,
      ),
    },
  };
}

export async function issueCustomerRentalDocument(input: {
  client: AnyClient;
  bookingId: string;
  userId: string;
  documentType: unknown;
}) {
  const documentType = normalizeCustomerRentalDocumentType(input.documentType);
  const booking = await loadCustomerRentalBookingRow(
    input.client,
    input.bookingId,
    input.userId,
  );
  if (
    documentType === "rental_booking_confirmation" &&
    (String(booking.status) !== "confirmed" ||
      String(booking.booking_deposit_payment_status) !== "paid")
  )
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_CONFIRMATION_DOCUMENT_NOT_AVAILABLE",
    });
  if (
    documentType === "rental_booking_deposit_payment_confirmation" &&
    String(booking.booking_deposit_payment_status) !== "paid"
  )
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_DEPOSIT_PAYMENT_DOCUMENT_NOT_AVAILABLE",
    });
  const existing = await loadDocumentBySource(
    input.client,
    "rental_booking",
    input.bookingId,
    documentType,
  );
  if (existing)
    return {
      document: existing,
      alreadyIssued: true,
      printUrl: `/user/documents/${existing.id}/print`,
    };
  const detail = await getCustomerRentalBookingDetail(
    input.client,
    input.bookingId,
    input.userId,
  );
  const issuedAt = new Date();
  const prefix = documentType === "rental_booking_confirmation" ? "RBK" : "BDP";
  const { data: documentNo, error: numberError } = await input.client.rpc!(
    "f_next_document_number",
    {
      p_document_type: documentType,
      p_branch_id: detail.booking.hubId,
      p_period: documentPeriod(issuedAt),
      p_prefix: prefix,
    },
  );
  if (numberError)
    throw createError({ statusCode: 500, statusMessage: numberError.message });
  const snapshot = {
    schema_version: 1,
    document: {
      document_type: documentType,
      document_number: String(documentNo),
      issued_at: issuedAt.toISOString(),
      template_key: `${documentType}_v1`,
      template_version: 1,
    },
    source: { source_type: "rental_booking", source_id: input.bookingId },
    header: await resolveDocumentHeaderSnapshot({
      adminClient: input.client as never,
      branchId: detail.booking.hubId,
    }),
    booking: detail.booking,
    money: detail.money,
    payment: detail.payment,
    disclaimer: {
      th: "เอกสารยืนยันนี้ไม่ใช่ใบเสร็จรับเงินหรือใบกำกับภาษี",
      en: "Confirmation only. Not a receipt or tax invoice.",
    },
  };
  const { data, error } = await input.client
    .from("official_documents")
    .insert({
      document_type: documentType,
      document_no: String(documentNo),
      status: "issued",
      branch_id: detail.booking.hubId,
      source_type: "rental_booking",
      source_id: input.bookingId,
      customer_user_id: input.userId,
      issued_at: issuedAt.toISOString(),
      issued_by: input.userId,
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
      currency_code: detail.money.currencyCode,
      template_key: `${documentType}_v1`,
      template_version: 1,
      snapshot,
      idempotency_key: `rental_booking:${input.bookingId}:${documentType}`,
    })
    .select(OFFICIAL_DOCUMENT_SELECT)
    .maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) {
      const doc = await loadDocumentBySource(
        input.client,
        "rental_booking",
        input.bookingId,
        documentType,
      );
      if (doc)
        return {
          document: doc,
          alreadyIssued: true,
          printUrl: `/user/documents/${doc.id}/print`,
        };
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  const document = mapOfficialDocumentRow(data as Row);
  await input.client.from("document_events").insert({
    document_id: document.id,
    event_type: "issued",
    staff_user_id: input.userId,
    metadata: {
      sourceType: "rental_booking",
      sourceId: input.bookingId,
      documentType,
    },
  });
  return {
    document,
    alreadyIssued: false,
    printUrl: `/user/documents/${document.id}/print`,
  };
}

export async function getCustomerRefundProofAccess(input: {
  client: AnyClient;
  bookingId: string;
  userId: string;
}) {
  const booking = await loadCustomerRentalBookingRow(
    input.client,
    input.bookingId,
    input.userId,
  );
  const { data: refund, error: refundError } = await input.client
    .from("payment_refunds")
    .select(
      "id, booking_id, user_id, refund_type, refund_proof_id, requested_at",
    )
    .eq("booking_id", booking.id)
    .eq("refund_type", "rental_booking_deposit")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (refundError)
    throw createError({ statusCode: 500, statusMessage: refundError.message });
  const refundRow = (refund ?? null) as Row | null;
  if (!refundRow?.refund_proof_id || text(refundRow.user_id) !== input.userId) {
    throw createError({
      statusCode: 404,
      statusMessage: "REFUND_PROOF_NOT_FOUND",
    });
  }
  const { data: proof, error: proofError } = await input.client
    .from("rental_booking_deposit_proofs")
    .select(REFUND_PROOF_SELECT_CUSTOMER)
    .eq("id", refundRow.refund_proof_id)
    .maybeSingle();
  if (proofError)
    throw createError({ statusCode: 500, statusMessage: proofError.message });
  const proofRow = (proof ?? null) as Row | null;
  if (
    !proofRow ||
    text(proofRow.booking_id) !== text(booking.id) ||
    text(proofRow.proof_kind) !== "refund"
  ) {
    throw createError({
      statusCode: 404,
      statusMessage: "REFUND_PROOF_NOT_FOUND",
    });
  }
  const bucket = text(proofRow.storage_bucket);
  const path = text(proofRow.storage_path);
  if (!bucket || !path || !input.client.storage) {
    throw createError({
      statusCode: 404,
      statusMessage: "REFUND_PROOF_NOT_FOUND",
    });
  }
  const { data, error } = await input.client.storage
    .from(bucket)
    .createSignedUrl(path, REFUND_PROOF_SIGNED_URL_TTL_SECONDS);
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data?.signedUrl)
    throw createError({
      statusCode: 500,
      statusMessage: "REFUND_PROOF_SIGNED_URL_UNAVAILABLE",
    });
  return {
    proof: customerRefundProofSummary(proofRow),
    signedUrl: data.signedUrl,
    expiresIn: REFUND_PROOF_SIGNED_URL_TTL_SECONDS,
  };
}

export async function listCustomerRefundProofStatuses(input: {
  client: AnyClient;
  bookingIds: string[];
  userId: string;
}) {
  const bookingIds = [...new Set(input.bookingIds.filter(Boolean))].slice(
    0,
    50,
  );
  if (bookingIds.length === 0) return { items: [] };
  const { data: bookings, error: bookingError } = await input.client
    .from("rental_bookings")
    .select("id, user_id")
    .in("id", bookingIds)
    .eq("user_id", input.userId);
  if (bookingError)
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  const ownedIds = ((bookings ?? []) as Row[]).map((row) => text(row.id));
  if (ownedIds.length === 0) return { items: [] };
  const { data: refunds, error: refundError } = await input.client
    .from("payment_refunds")
    .select("booking_id, refund_proof_id")
    .in("booking_id", ownedIds)
    .eq("refund_type", "rental_booking_deposit");
  if (refundError)
    throw createError({ statusCode: 500, statusMessage: refundError.message });
  const proofBookingIds = new Set(
    ((refunds ?? []) as Row[])
      .filter((row) => Boolean(row.refund_proof_id))
      .map((row) => text(row.booking_id)),
  );
  return {
    items: ownedIds.map((id) => ({
      bookingId: id,
      exists: proofBookingIds.has(id),
    })),
  };
}

export async function listCustomerRefundTrackingStatuses(input: {
  client: AnyClient;
  bookingIds: string[];
  userId: string;
}) {
  const bookingIds = [...new Set(input.bookingIds.filter(Boolean))].slice(
    0,
    50,
  );
  if (bookingIds.length === 0) return { items: [] };
  const { data: bookings, error: bookingError } = await input.client
    .from("rental_bookings")
    .select("id, user_id")
    .in("id", bookingIds)
    .eq("user_id", input.userId);
  if (bookingError)
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  const ownedIds = ((bookings ?? []) as Row[]).map((row) => text(row.id));
  if (ownedIds.length === 0) return { items: [] };

  const { data: events, error: eventError } = await input.client
    .from("rental_booking_cancellation_events")
    .select("id, booking_id, cancelled_at")
    .in("booking_id", ownedIds)
    .order("cancelled_at", { ascending: false });
  if (eventError)
    throw createError({ statusCode: 500, statusMessage: eventError.message });
  const eventByBookingId = new Map<string, Row>();
  for (const event of (events ?? []) as Row[]) {
    const bookingId = text(event.booking_id);
    if (bookingId && !eventByBookingId.has(bookingId)) {
      eventByBookingId.set(bookingId, event);
    }
  }

  const { data: refunds, error: refundError } = await input.client
    .from("payment_refunds")
    .select(
      "id, booking_id, cancellation_event_id, status, requested_at, refunded_at, refund_proof_id",
    )
    .in("booking_id", ownedIds)
    .eq("refund_type", "rental_booking_deposit")
    .order("requested_at", { ascending: false });
  if (refundError)
    throw createError({ statusCode: 500, statusMessage: refundError.message });
  const refundByBookingId = new Map<string, Row>();
  for (const refund of (refunds ?? []) as Row[]) {
    const bookingId = text(refund.booking_id);
    if (bookingId && !refundByBookingId.has(bookingId)) {
      refundByBookingId.set(bookingId, refund);
    }
  }

  const proofIds = [...refundByBookingId.values()]
    .map((refund) => text(refund.refund_proof_id))
    .filter(Boolean);
  const proofBookingIds = new Set<string>();
  if (proofIds.length > 0) {
    const { data: proofs, error: proofError } = await input.client
      .from("rental_booking_deposit_proofs")
      .select("id, booking_id, proof_kind")
      .in("id", proofIds);
    if (proofError)
      throw createError({ statusCode: 500, statusMessage: proofError.message });
    for (const proof of (proofs ?? []) as Row[]) {
      if (text(proof.proof_kind) === "refund") {
        proofBookingIds.add(text(proof.booking_id));
      }
    }
  }

  const sourceIds = [
    ...[...eventByBookingId.values()].map((event) => text(event.id)),
    ...[...refundByBookingId.values()].map((refund) => text(refund.id)),
  ].filter(Boolean);
  const cancellationDocumentByEventId = new Map<string, Row>();
  const refundDocumentByRefundId = new Map<string, Row>();
  if (sourceIds.length > 0) {
    const { data: documents, error: documentError } = await input.client
      .from("official_documents")
      .select(
        "id, source_type, source_id, document_type, status, document_no, issued_at",
      )
      .in("source_id", sourceIds)
      .in("document_type", [
        "rental_booking_cancellation_confirmation",
        "rental_booking_deposit_refund_confirmation",
      ]);
    if (documentError)
      throw createError({
        statusCode: 500,
        statusMessage: documentError.message,
      });
    for (const document of (documents ?? []) as Row[]) {
      if (
        text(document.source_type) === "rental_booking_cancellation_event" &&
        text(document.document_type) ===
          "rental_booking_cancellation_confirmation"
      ) {
        cancellationDocumentByEventId.set(text(document.source_id), document);
      }
      if (
        text(document.source_type) === "payment_refund" &&
        text(document.document_type) ===
          "rental_booking_deposit_refund_confirmation"
      ) {
        refundDocumentByRefundId.set(text(document.source_id), document);
      }
    }
  }

  return {
    items: ownedIds.map((bookingId) => {
      const event = eventByBookingId.get(bookingId) ?? null;
      const refund = refundByBookingId.get(bookingId) ?? null;
      const hasRefundProof = proofBookingIds.has(bookingId);
      const canShowRefundConfirmation =
        text(refund?.status) === "refunded" &&
        Boolean(text(refund?.refund_proof_id)) &&
        hasRefundProof;
      return {
        bookingId,
        refundRequest: refund
          ? {
              status: text(refund.status),
              refundedAt: text(refund.refunded_at) || null,
            }
          : null,
        documents: {
          cancellationConfirmation: historyDocumentSummary(
            event
              ? (cancellationDocumentByEventId.get(text(event.id)) ?? null)
              : null,
          ),
          refundConfirmation: historyDocumentSummary(
            refund && canShowRefundConfirmation
              ? (refundDocumentByRefundId.get(text(refund.id)) ?? null)
              : null,
          ),
        },
        refundProof: { exists: hasRefundProof },
      };
    }),
  };
}

export async function loadCustomerOfficialDocument(
  client: AnyClient,
  documentId: string,
  userId: string,
) {
  const { data, error } = await client
    .from("official_documents")
    .select(OFFICIAL_DOCUMENT_SELECT)
    .eq("id", documentId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({ statusCode: 404, statusMessage: "Document not found" });
  const row = data as Row;
  if (!isCustomerSafeDocumentType(row.document_type))
    throw createError({
      statusCode: 403,
      statusMessage: "Document access denied",
    });
  if (text(row.source_type) === "payment_refund") {
    const { data: refund, error: refundError } = await client
      .from("payment_refunds")
      .select("booking_id, status, refund_proof_id")
      .eq("id", row.source_id)
      .maybeSingle();
    if (refundError)
      throw createError({
        statusCode: 500,
        statusMessage: refundError.message,
      });
    if (refund) {
      const refundRow = refund as Row;
      if (
        text(refundRow.status) !== "refunded" ||
        !text(refundRow.refund_proof_id)
      ) {
        throw createError({
          statusCode: 403,
          statusMessage: "Refund confirmation is not available yet",
        });
      }
      await loadCustomerRentalBookingRow(
        client,
        text(refundRow.booking_id),
        userId,
      );
      const { data: proof, error: proofError } = await client
        .from("rental_booking_deposit_proofs")
        .select("id, booking_id, proof_kind")
        .eq("id", refundRow.refund_proof_id)
        .maybeSingle();
      if (proofError)
        throw createError({
          statusCode: 500,
          statusMessage: proofError.message,
        });
      if (
        !proof ||
        text((proof as Row).booking_id) !== text(refundRow.booking_id) ||
        text((proof as Row).proof_kind) !== "refund"
      ) {
        throw createError({
          statusCode: 403,
          statusMessage: "Refund confirmation is not available yet",
        });
      }
      return mapOfficialDocumentRow(row);
    }
  }
  if (
    text(row.source_type) === "financial_recognition_event" &&
    text(row.document_type) === FORFEITURE_RECEIPT_DOCUMENT_TYPE
  ) {
    const { data: recognition, error: recognitionError } = await client
      .from("financial_recognition_events")
      .select("id, booking_id")
      .eq("id", row.source_id)
      .maybeSingle();
    if (recognitionError)
      throw createError({
        statusCode: 500,
        statusMessage: recognitionError.message,
      });
    if (recognition) {
      await loadCustomerRentalBookingRow(
        client,
        text((recognition as Row).booking_id),
        userId,
      );
      return mapOfficialDocumentRow(row);
    }
  }
  if (
    text(row.source_type) === "rental_booking_no_show_event" &&
    text(row.document_type) === NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE
  ) {
    const { data: noShowEvent, error: noShowError } = await client
      .from("rental_booking_no_show_events")
      .select("id, booking_id")
      .eq("id", row.source_id)
      .maybeSingle();
    if (noShowError)
      throw createError({
        statusCode: 500,
        statusMessage: noShowError.message,
      });
    if (noShowEvent) {
      await loadCustomerRentalBookingRow(
        client,
        text((noShowEvent as Row).booking_id),
        userId,
      );
      return mapOfficialDocumentRow(row);
    }
  }
  if (text(row.customer_user_id) === userId) return mapOfficialDocumentRow(row);
  if (text(row.source_type) === "rental_booking") {
    await loadCustomerRentalBookingRow(client, text(row.source_id), userId);
    return mapOfficialDocumentRow(row);
  }
  if (text(row.source_type) === "rental_booking_cancellation_event") {
    const { data: event } = await client
      .from("rental_booking_cancellation_events")
      .select("booking_id")
      .eq("id", row.source_id)
      .maybeSingle();
    if (event) {
      await loadCustomerRentalBookingRow(
        client,
        text((event as Row).booking_id),
        userId,
      );
      return mapOfficialDocumentRow(row);
    }
  }
  throw createError({
    statusCode: 403,
    statusMessage: "Document access denied",
  });
}
