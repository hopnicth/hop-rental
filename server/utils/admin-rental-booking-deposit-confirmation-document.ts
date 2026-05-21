import { createError } from "h3";
import {
  OFFICIAL_DOCUMENT_SELECT,
  documentPeriod,
  mapOfficialDocumentRow,
  resolveDocumentHeaderSnapshot,
} from "~~/server/utils/admin-documents";

// ── Constants ─────────────────────────────────────────────────────────────────
export const BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE =
  "rental_booking_deposit_confirmation" as const;
const DOCUMENT_PREFIX = "BDC";
const TEMPLATE_KEY = `${BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE}_v1`;

/** Customer-facing document title (locked — must not be changed). */
export const BOOKING_DEPOSIT_CONFIRMATION_TITLE_TH =
  "เอกสารยืนยันการรับเงินมัดจำการจอง";

// ── Internal types ─────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc(name: string, params: Row): Promise<{ data: unknown; error: any }>;
};

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function nullable(v: unknown): string | null {
  const s = text(v);
  return s || null;
}
function money(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505";
}

// ── Idempotency lookup ────────────────────────────────────────────────────────
async function findExistingConfirmationDocument(
  client: AnyClient,
  heldBalanceEventId: string,
) {
  const { data, error } = await client
    .from("official_documents")
    .select(OFFICIAL_DOCUMENT_SELECT)
    .eq("source_type", "rental_held_balance_event")
    .eq("source_id", heldBalanceEventId)
    .eq("document_type", BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return data ? mapOfficialDocumentRow(data as Row) : null;
}

// ── Document number generator ─────────────────────────────────────────────────
async function nextConfirmationDocumentNumber(
  client: AnyClient,
  branchId: string | null,
  issuedAt: Date,
): Promise<string> {
  const { data, error } = await client.rpc("f_next_document_number", {
    p_document_type: BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
    p_branch_id: branchId,
    p_period: documentPeriod(issuedAt),
    p_prefix: DOCUMENT_PREFIX,
  });
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  const no = text(data);
  if (!no)
    throw createError({
      statusCode: 500,
      statusMessage: "Document number allocation failed",
    });
  return no;
}

// ── Public interface ──────────────────────────────────────────────────────────
export interface BookingDepositConfirmationDocumentInput {
  client: AnyClient;
  /** rental_held_balance_events row — canonical financial source for the document */
  heldBalanceEvent: Row;
  /** rental_bookings row — for customer/booking context in the immutable snapshot */
  booking: Row;
  /** Staff user who is processing the issuance */
  staffUserId: string;
  /** POS branch where payment was collected */
  branchId: string | null;
}

/**
 * Issues an immutable "เอกสารยืนยันการรับเงินมัดจำการจอง" official document.
 *
 * Canonical source: rental_held_balance_event (NOT pos_rental_payment_attempt).
 * Amount is anchored to heldBalanceEvent.amount — not recalculated from booking.
 *
 * Idempotent: returns the existing document if one already exists for
 * (source_type=rental_held_balance_event, source_id, document_type).
 *
 * Does NOT touch: rental_bookings, pos_rental_payment_attempts,
 * pos_document_issuance_tasks, finalizePosRentalBookingDeposit().
 */
export async function issueBookingDepositConfirmationDocument(
  input: BookingDepositConfirmationDocumentInput,
): Promise<{
  document: ReturnType<typeof mapOfficialDocumentRow>;
  alreadyIssued: boolean;
}> {
  const { client, heldBalanceEvent, booking, staffUserId, branchId } = input;

  const eventId = text(heldBalanceEvent.id);
  if (!eventId)
    throw createError({
      statusCode: 422,
      statusMessage: "heldBalanceEvent.id is required",
    });

  // ── Step 1: Duplicate guard ──────────────────────────────────────────────
  const existing = await findExistingConfirmationDocument(client, eventId);
  if (existing) return { document: existing, alreadyIssued: true };

  // ── Step 2: Resolve branding header at issuance time ────────────────────
  const header = await resolveDocumentHeaderSnapshot({
    adminClient: client as never,
    branchId,
  });

  // ── Step 3: Allocate document number ────────────────────────────────────
  const issuedAt = new Date();
  const documentNo = await nextConfirmationDocumentNumber(
    client,
    branchId,
    issuedAt,
  );

  // ── Step 4: Build immutable snapshot ────────────────────────────────────
  // Amount is read from the held-balance event — NOT from booking quote fields.
  const eventAmount = money(heldBalanceEvent.amount);
  const currencyCode =
    text(heldBalanceEvent.currency_code) ||
    text(booking.currency_code) ||
    "THB";

  const snapshot: Row = {
    schema_version: 1,
    document: {
      document_type: BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
      document_title: BOOKING_DEPOSIT_CONFIRMATION_TITLE_TH,
      document_number: documentNo,
      issued_at: issuedAt.toISOString(),
      template_key: TEMPLATE_KEY,
      template_version: 1,
    },
    source: {
      source_type: "rental_held_balance_event",
      source_id: eventId,
    },
    held_balance_event: {
      rental_held_balance_event_id: eventId,
      event_type: text(heldBalanceEvent.event_type),
      amount: eventAmount,
      currency_code: currencyCode,
      occurred_at: text(heldBalanceEvent.occurred_at),
      source_type: text(heldBalanceEvent.source_type),
      source_id: text(heldBalanceEvent.source_id),
      payment_method: nullable(heldBalanceEvent.payment_method),
    },
    booking: {
      id: text(booking.id),
      reference: text(booking.id),
      qr_value: `booking:${text(booking.id)}`,
      start_date: text(booking.start_date),
      end_date: text(booking.end_date),
      rental_days: Number(booking.rental_days ?? 0),
      hub_id: nullable(booking.hub_id) ?? nullable(booking.pos_branch_id),
    },
    booked_item: {
      asset_id: nullable(booking.asset_id),
      asset_name: nullable(booking.asset_name),
    },
    customer: {
      user_id: nullable(booking.user_id),
      walk_in_phone: nullable(booking.walk_in_phone),
      display_name: nullable(booking.booker_name),
    },
    header,
    issue_context: { issued_by: staffUserId, branch_id: branchId },
    disclaimer: {
      th: "ไม่ใช่ใบกำกับภาษี ไม่ใช่ใบเสร็จรับเงินสุดท้าย เงินมัดจำจะถูกนำมาหักกับยอดชำระค่าเช่าเมื่อคืนสินค้า",
      en: "Not a tax invoice. Not a final payment receipt. Held deposit will be applied to rental settlement at return.",
    },
  };

  // ── Step 5: Persist official document record ─────────────────────────────
  const { data, error } = await client
    .from("official_documents")
    .insert({
      document_type: BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
      document_no: documentNo,
      status: "issued",
      branch_id: branchId,
      source_type: "rental_held_balance_event",
      source_id: eventId,
      customer_user_id: nullable(booking.user_id),
      walk_in_phone: nullable(booking.walk_in_phone),
      issued_at: issuedAt.toISOString(),
      issued_by: staffUserId || null,
      subtotal: eventAmount,
      vat_amount: 0,
      total_amount: eventAmount,
      currency_code: currencyCode,
      template_key: TEMPLATE_KEY,
      template_version: 1,
      snapshot,
      idempotency_key: `rental_held_balance_event:${eventId}:${BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE}`,
    })
    .select(OFFICIAL_DOCUMENT_SELECT)
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      const dup = await findExistingConfirmationDocument(client, eventId);
      if (dup) return { document: dup, alreadyIssued: true };
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  if (!data)
    throw createError({
      statusCode: 500,
      statusMessage: "Document insert failed",
    });

  const document = mapOfficialDocumentRow(data as Row);

  // ── Step 6: Record issuance event ────────────────────────────────────────
  const { error: evtErr } = await client
    .from("document_events")
    .insert({
      document_id: document.id,
      event_type: "issued",
      staff_user_id: staffUserId || null,
      metadata: {
        sourceType: "rental_held_balance_event",
        sourceId: eventId,
        documentType: BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
      },
    })
    .select("id")
    .maybeSingle();
  if (evtErr)
    throw createError({ statusCode: 500, statusMessage: evtErr.message });

  return { document, alreadyIssued: false };
}
