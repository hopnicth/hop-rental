import { createError } from "h3";
import {
  OFFICIAL_DOCUMENT_SELECT,
  documentPeriod,
  mapOfficialDocumentRow,
  resolveDocumentHeaderSnapshot,
} from "~~/server/utils/admin-documents";

type Row = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc?: (name: string, params: Row) => Promise<{ data: unknown; error: any }>;
};

export const FORFEITURE_RECEIPT_DOCUMENT_TYPE =
  "booking_deposit_forfeiture_ordinary_receipt";
export const NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE =
  "rental_booking_no_show_forfeiture_notice";

const BOOKING_SELECT =
  "id, user_id, status, asset_id, asset_code, asset_name, product_name, matched_product_name, start_date, end_date, rental_days, hub_id, hub_name, booker_name, booker_phone, currency_code, booking_deposit_paid_amount, booking_deposit_terms_accepted_at, booking_deposit_terms_version, no_show_source_event_id";
const NO_SHOW_SELECT =
  "id, booking_id, admin_user_id, marked_at, pickup_date_snapshot, deposit_outcome, reason";
const DISPOSITION_SELECT =
  "id, booking_id, user_id, source_event_type, no_show_event_id, actor_user_id, actor_type, occurred_at, disposition, forfeited_amount, currency_code, agreement_version_id, agreement_acceptance_log_id, accepted_terms_version, terms_accepted_at, policy_version, reason, metadata";
const RECOGNITION_SELECT =
  "id, recognition_type, source_type, source_id, booking_id, recognized_at, recognized_amount, currency_code, revenue_category, tax_treatment, vat_rate, vat_amount, wht_treatment, wht_rate, wht_amount, status, related_document_id, metadata";
const AGREEMENT_SELECT =
  "id, agreement_version_id, agreement_acceptance_log_id, accepted_terms_version, accepted_at, content_hash, rendered_text_hash, metadata";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function nullable(value: unknown): string | null {
  const clean = text(value);
  return clean || null;
}
function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : 0;
}
function isUniqueViolation(error: any): boolean {
  return error?.code === "23505";
}
function documentSummary(document: ReturnType<typeof mapOfficialDocumentRow>) {
  return {
    id: document.id,
    documentType: document.documentType,
    documentNo: document.documentNo,
    status: document.status,
    issuedAt: document.issuedAt,
  };
}

async function maybeOne(
  client: AnyClient,
  table: string,
  select: string,
  key: string,
  value: unknown,
) {
  const { data, error } = await client
    .from(table)
    .select(select)
    .eq(key, value)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return (data ?? null) as Row | null;
}

async function listByBooking(
  client: AnyClient,
  table: string,
  select: string,
  bookingId: string,
) {
  const { data, error } = await client
    .from(table)
    .select(select)
    .eq("booking_id", bookingId);
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return ((data ?? []) as Row[])[0] ?? null;
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
  return data ? (data as Row) : null;
}

async function nextDocumentNumber(
  client: AnyClient,
  documentType: string,
  branchId: string | null,
  prefix: string,
  issuedAt: Date,
) {
  if (!client.rpc)
    throw createError({
      statusCode: 500,
      statusMessage: "Document numbering unavailable",
    });
  const { data, error } = await client.rpc("f_next_document_number", {
    p_document_type: documentType,
    p_branch_id: branchId,
    p_period: documentPeriod(issuedAt),
    p_prefix: prefix,
  });
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return text(data);
}

async function resolveTerms(client: AnyClient, booking: Row, disposition: Row) {
  const bookingId = text(booking.id);
  const agreement = await listByBooking(
    client,
    "rental_booking_deposit_agreements",
    AGREEMENT_SELECT,
    bookingId,
  );
  const dispositionHasCanonical = Boolean(
    nullable(disposition.agreement_version_id) ||
    nullable(disposition.agreement_acceptance_log_id),
  );
  return {
    resolution_source: dispositionHasCanonical
      ? "deposit_disposition_event"
      : agreement
        ? "rental_booking_deposit_agreement"
        : "legacy_booking_terms_snapshot",
    agreement_version_id:
      nullable(disposition.agreement_version_id) ??
      nullable(agreement?.agreement_version_id),
    agreement_acceptance_log_id:
      nullable(disposition.agreement_acceptance_log_id) ??
      nullable(agreement?.agreement_acceptance_log_id),
    accepted_terms_version:
      nullable(disposition.accepted_terms_version) ??
      nullable(agreement?.accepted_terms_version) ??
      nullable(booking.booking_deposit_terms_version),
    terms_accepted_at:
      nullable(disposition.terms_accepted_at) ??
      nullable(agreement?.accepted_at) ??
      nullable(booking.booking_deposit_terms_accepted_at),
    fallback_used: !dispositionHasCanonical,
    booking_deposit_agreement_id: nullable(agreement?.id),
    content_hash: nullable(agreement?.content_hash),
    rendered_text_hash: nullable(agreement?.rendered_text_hash),
  };
}

async function loadChain(client: AnyClient, bookingId: string) {
  const booking = await maybeOne(
    client,
    "rental_bookings",
    BOOKING_SELECT,
    "id",
    bookingId,
  );
  if (!booking)
    throw createError({
      statusCode: 404,
      statusMessage: "RENTAL_BOOKING_NOT_FOUND",
    });
  if (text(booking.status) !== "no_show") {
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_NOT_NO_SHOW",
    });
  }
  const noShow = nullable(booking.no_show_source_event_id)
    ? await maybeOne(
        client,
        "rental_booking_no_show_events",
        NO_SHOW_SELECT,
        "id",
        booking.no_show_source_event_id,
      )
    : await maybeOne(
        client,
        "rental_booking_no_show_events",
        NO_SHOW_SELECT,
        "booking_id",
        bookingId,
      );
  if (!noShow)
    throw createError({
      statusCode: 409,
      statusMessage: "NO_SHOW_EVENT_NOT_FOUND",
    });
  const disposition = await maybeOne(
    client,
    "rental_booking_deposit_disposition_events",
    DISPOSITION_SELECT,
    "no_show_event_id",
    noShow.id,
  );
  if (!disposition || text(disposition.source_event_type) !== "no_show") {
    throw createError({
      statusCode: 409,
      statusMessage: "DEPOSIT_DISPOSITION_NOT_FOUND",
    });
  }
  const recognition = await maybeOne(
    client,
    "financial_recognition_events",
    RECOGNITION_SELECT,
    "source_id",
    disposition.id,
  );
  if (
    !recognition ||
    text(recognition.source_type) !==
      "rental_booking_deposit_disposition_event" ||
    text(recognition.recognition_type) !== "booking_deposit_forfeiture_income"
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: "FINANCIAL_RECOGNITION_NOT_FOUND",
    });
  }
  const user = nullable(booking.user_id)
    ? await maybeOne(
        client,
        "users",
        "id, full_name, phone",
        "id",
        booking.user_id,
      )
    : null;
  const terms = await resolveTerms(client, booking, disposition);
  return { booking, noShow, disposition, recognition, user, terms };
}

function commonSnapshots(chain: Awaited<ReturnType<typeof loadChain>>) {
  const booking = chain.booking;
  const branchId = nullable(booking.hub_id);
  const itemName =
    text(booking.asset_name) ||
    text(booking.matched_product_name) ||
    text(booking.product_name);
  return {
    branchId,
    booking: {
      id: text(booking.id),
      reference: text(booking.id),
      status: text(booking.status),
      item_name: itemName,
      asset_code: nullable(booking.asset_code),
      scheduled_pickup_date: text(booking.start_date),
      start_date: text(booking.start_date),
      end_date: text(booking.end_date),
      rental_days: Number(booking.rental_days ?? 0),
      hub_id: nullable(booking.hub_id),
      hub_name: nullable(booking.hub_name),
    },
    customer: {
      user_id: nullable(booking.user_id),
      display_name: text(chain.user?.full_name) || text(booking.booker_name),
      booker_name: nullable(booking.booker_name),
      phone: nullable(booking.booker_phone) ?? nullable(chain.user?.phone),
      email: null,
    },
  };
}

async function insertDocument(input: {
  client: AnyClient;
  documentType: string;
  sourceType: string;
  sourceId: string;
  prefix: string;
  branchId: string | null;
  userId: string;
  customerUserId: string | null;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  currencyCode: string;
  snapshotBuilder: (documentNo: string, issuedAt: Date) => Promise<Row>;
}) {
  const existing = await loadDocumentBySource(
    input.client,
    input.sourceType,
    input.sourceId,
    input.documentType,
  );
  if (existing)
    return { document: mapOfficialDocumentRow(existing), alreadyIssued: true };
  const issuedAt = new Date();
  const documentNo = await nextDocumentNumber(
    input.client,
    input.documentType,
    input.branchId,
    input.prefix,
    issuedAt,
  );
  const snapshot = await input.snapshotBuilder(documentNo, issuedAt);
  const { data, error } = await input.client
    .from("official_documents")
    .insert({
      document_type: input.documentType,
      document_no: documentNo,
      status: "issued",
      branch_id: input.branchId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      customer_user_id: input.customerUserId,
      issued_at: issuedAt.toISOString(),
      issued_by: input.userId,
      subtotal: input.subtotal,
      vat_amount: input.vatAmount,
      total_amount: input.totalAmount,
      currency_code: input.currencyCode,
      template_key: `${input.documentType}_v1`,
      template_version: 1,
      snapshot,
      idempotency_key: `${input.sourceType}:${input.sourceId}:${input.documentType}`,
    })
    .select(OFFICIAL_DOCUMENT_SELECT)
    .maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) {
      const doc = await loadDocumentBySource(
        input.client,
        input.sourceType,
        input.sourceId,
        input.documentType,
      );
      if (doc)
        return { document: mapOfficialDocumentRow(doc), alreadyIssued: true };
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  const document = mapOfficialDocumentRow(data as Row);
  const { error: eventError } = await input.client
    .from("document_events")
    .insert({
      document_id: document.id,
      event_type: "issued",
      staff_user_id: input.userId,
      metadata: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        documentType: input.documentType,
      },
    })
    .select("id")
    .maybeSingle();
  if (eventError)
    throw createError({ statusCode: 500, statusMessage: eventError.message });
  return { document, alreadyIssued: false };
}

export async function ensureNoShowForfeitureDocuments(input: {
  client: AnyClient;
  bookingId: string;
  adminUserId: string;
}) {
  const chain = await loadChain(input.client, input.bookingId);
  const common = commonSnapshots(chain);
  const header = await resolveDocumentHeaderSnapshot({
    adminClient: input.client as never,
    branchId: common.branchId,
  });
  const recognitionId = text(chain.recognition.id);
  const noShowId = text(chain.noShow.id);
  const dispositionId = text(chain.disposition.id);
  const currencyCode = text(chain.recognition.currency_code) || "THB";
  const recognizedAmount = money(chain.recognition.recognized_amount);
  const tax = {
    tax_treatment: text(chain.recognition.tax_treatment),
    vat_rate: money(chain.recognition.vat_rate),
    vat_amount: money(chain.recognition.vat_amount),
    wht_treatment: text(chain.recognition.wht_treatment),
    wht_rate: money(chain.recognition.wht_rate),
    wht_amount: money(chain.recognition.wht_amount),
    is_tax_invoice: false,
    tax_invoice_convertible: false,
  };

  const receipt = await insertDocument({
    client: input.client,
    documentType: FORFEITURE_RECEIPT_DOCUMENT_TYPE,
    sourceType: "financial_recognition_event",
    sourceId: recognitionId,
    prefix: "BDFR",
    branchId: common.branchId,
    userId: input.adminUserId,
    customerUserId: nullable(chain.booking.user_id),
    subtotal: recognizedAmount,
    vatAmount: 0,
    totalAmount: recognizedAmount,
    currencyCode,
    snapshotBuilder: async (documentNo, issuedAt) => ({
      schema_version: 1,
      document: {
        document_type: FORFEITURE_RECEIPT_DOCUMENT_TYPE,
        document_number: documentNo,
        issued_at: issuedAt.toISOString(),
        template_key: `${FORFEITURE_RECEIPT_DOCUMENT_TYPE}_v1`,
        template_version: 1,
      },
      source: {
        source_type: "financial_recognition_event",
        source_id: recognitionId,
      },
      header,
      booking: common.booking,
      customer: common.customer,
      financial_recognition: {
        financial_recognition_event_id: recognitionId,
        recognition_type: text(chain.recognition.recognition_type),
        recognized_at: text(chain.recognition.recognized_at),
        recognized_amount: recognizedAmount,
        currency_code: currencyCode,
        revenue_category: text(chain.recognition.revenue_category),
        ...tax,
      },
      deposit_disposition: {
        rental_booking_deposit_disposition_event_id: dispositionId,
        disposition: text(chain.disposition.disposition),
        forfeited_amount: money(chain.disposition.forfeited_amount),
        currency_code: text(chain.disposition.currency_code) || currencyCode,
      },
      no_show: {
        rental_booking_no_show_event_id: noShowId,
        marked_at: text(chain.noShow.marked_at),
        pickup_date_snapshot: text(chain.noShow.pickup_date_snapshot),
        reason: nullable(chain.noShow.reason),
      },
      terms: chain.terms,
      tax,
      issue_context: {
        issued_by: input.adminUserId,
        branch_id: common.branchId,
      },
      disclaimer: {
        th: "ใบเสร็จรับเงินธรรมดาสำหรับเงินมัดจำจองที่ถูกริบ ไม่ใช่ใบกำกับภาษี",
        en: "Non-tax ordinary receipt for forfeited Booking Deposit. Not a tax invoice and not convertible to a tax invoice.",
      },
    }),
  });

  if (text(chain.recognition.related_document_id) !== receipt.document.id) {
    const { error } = await input.client
      .from("financial_recognition_events")
      .update({ related_document_id: receipt.document.id })
      .eq("id", recognitionId)
      .select("id")
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const notice = await insertDocument({
    client: input.client,
    documentType: NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
    sourceType: "rental_booking_no_show_event",
    sourceId: noShowId,
    prefix: "NSFN",
    branchId: common.branchId,
    userId: input.adminUserId,
    customerUserId: nullable(chain.booking.user_id),
    subtotal: 0,
    vatAmount: 0,
    totalAmount: 0,
    currencyCode,
    snapshotBuilder: async (documentNo, issuedAt) => ({
      schema_version: 1,
      document: {
        document_type: NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
        document_number: documentNo,
        issued_at: issuedAt.toISOString(),
        template_key: `${NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE}_v1`,
        template_version: 1,
      },
      source: {
        source_type: "rental_booking_no_show_event",
        source_id: noShowId,
      },
      header,
      booking: common.booking,
      customer: common.customer,
      no_show: {
        rental_booking_no_show_event_id: noShowId,
        marked_at: text(chain.noShow.marked_at),
        marked_by_user_id: nullable(chain.noShow.admin_user_id),
        pickup_date_snapshot: text(chain.noShow.pickup_date_snapshot),
        deposit_outcome: text(chain.noShow.deposit_outcome),
        reason: nullable(chain.noShow.reason),
      },
      deposit_disposition: {
        rental_booking_deposit_disposition_event_id: dispositionId,
        disposition: text(chain.disposition.disposition),
        forfeited_amount: money(chain.disposition.forfeited_amount),
        currency_code: text(chain.disposition.currency_code) || currencyCode,
        occurred_at: text(chain.disposition.occurred_at),
        policy_version: text(chain.disposition.policy_version),
        reason: nullable(chain.disposition.reason),
      },
      financial_recognition: {
        financial_recognition_event_id: recognitionId,
        recognition_type: text(chain.recognition.recognition_type),
        recognized_amount: recognizedAmount,
        currency_code: currencyCode,
        tax_treatment: text(chain.recognition.tax_treatment),
        wht_treatment: text(chain.recognition.wht_treatment),
      },
      terms: chain.terms,
      issue_context: {
        issued_by: input.adminUserId,
        branch_id: common.branchId,
      },
      disclaimer: {
        th: "หนังสือแจ้งการไม่มารับสินค้าและการริบเงินมัดจำจอง ไม่ใช่ใบเสร็จรับเงินหรือใบกำกับภาษี",
        en: "No-show forfeiture notice only. Not a receipt and not a tax invoice.",
      },
    }),
  });

  return {
    receipt: { ...receipt, summary: documentSummary(receipt.document) },
    notice: { ...notice, summary: documentSummary(notice.document) },
  };
}
