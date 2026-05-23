import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminRentalBookingDetail } from "~~/app/types/admin-order-detail";
import type {
  AdminRentalPrintFormPayload,
  AdminRentalPrintFormType,
} from "~~/app/types/admin-rental-print-form";
import {
  ADMIN_RENTAL_BOOKING_DETAIL_SELECT,
  fetchAdminCustomerProfile,
  isMissingRentalBookingColumn,
  mapAdminRentalBookingDetail,
} from "~~/server/utils/admin-orders";
import { loadBookingOpsPayload } from "~~/server/utils/admin-bookings-ops";
import { isMissingRentalPaymentLinesTable } from "~~/server/utils/rental-payment-lines";
import {
  buildAdminRentalPrintFormPayload,
  type AdminRentalPrintFulfillmentRow,
} from "~~/server/utils/admin-rental-print-form";

const DETAIL_SELECT_WITHOUT_REFUND_FIELDS =
  "id, user_id, walk_in_phone, status, asset_id, asset_code, asset_name, asset_thumbnail, asset_snapshot, product_id, sku_id, product_name, matched_product_id, matched_product_name, thumbnail, hub_id, hub_name, start_date, end_date, rental_days, pricing_model, currency_code, daily_rate, weekly_rate, monthly_rate, rental_total, deposit_amount, deposit_paid_amount, deposit_payment_method, deposit_payment_status, deposit_refund_status, pricing_breakdown, booker_name, booker_phone, created_at, updated_at, asset:assets(storage_branch_id, store_branches(id, code, name_th, name_en))";
const PAYMENT_LINES_SELECT =
  "rental_payment_lines:rental_booking_payment_lines(line_type, tax_category, description_th, description_en, gross_amount, wht_applicable, wht_rate, wht_amount, net_payable_amount, is_refundable, wht_certificate_required, applies_to_security_deposit, reduces_remaining_security_deposit, status, source, metadata)";
const DETAIL_SELECT_WITH_PAYMENT_LINES = `${ADMIN_RENTAL_BOOKING_DETAIL_SELECT}, ${PAYMENT_LINES_SELECT}`;
const DETAIL_SELECT_WITHOUT_REFUND_FIELDS_WITH_PAYMENT_LINES = `${DETAIL_SELECT_WITHOUT_REFUND_FIELDS}, ${PAYMENT_LINES_SELECT}`;
const FULFILLMENT_SELECT =
  "id, booking_id, event_type, status_after, signature_url, signature_storage_path, notes, performed_by_user_id, created_at, booking_checklist_id, branch_id, event_at";
const FULFILLMENT_SELECT_LEGACY =
  "id, booking_id, event_type, status_after, signature_url, signature_storage_path, notes, performed_by_user_id, created_at";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isMissingColumn(error: unknown, columns: readonly string[]): boolean {
  return isMissingRentalBookingColumn(error, columns);
}

function isMissingPaymentLines(error: unknown): boolean {
  const err = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
  const text = [err?.message, err?.details, err?.hint]
    .filter(Boolean)
    .join(" ");
  return (
    isMissingRentalPaymentLinesTable(error) ||
    ((err?.code === "PGRST200" || err?.code === "PGRST204") &&
      /rental_booking_payment_lines|rental_payment_lines/i.test(text)) ||
    (/rental_booking_payment_lines|rental_payment_lines/i.test(text) &&
      /does not exist|could not find|relationship|column/i.test(text))
  );
}

function mapFulfillment(
  row: Record<string, unknown>,
): AdminRentalPrintFulfillmentRow {
  return {
    eventType: String(row.event_type ?? "pickup") as AdminRentalPrintFormType,
    signatureUrl: asString(row.signature_url),
    notes: asString(row.notes),
    performedByUserId: asString(row.performed_by_user_id),
    createdAt: asString(row.created_at),
    eventAt: asString(row.event_at),
    branchId: asString(row.branch_id),
    bookingChecklistId: asString(row.booking_checklist_id),
  };
}

export async function loadAdminRentalBookingPrintDetail(
  adminClient: SupabaseClient,
  bookingId: string,
): Promise<AdminRentalBookingDetail> {
  const buildQuery = (select: string) =>
    adminClient
      .from("rental_bookings")
      .select(select)
      .eq("id", bookingId)
      .maybeSingle();
  let result = await buildQuery(DETAIL_SELECT_WITH_PAYMENT_LINES);
  if (
    result.error &&
    isMissingColumn(result.error, [
      "rental_bookings.deposit_refund_amount",
      "deposit_refund_amount",
      "rental_bookings.deposit_refund_notes",
      "deposit_refund_notes",
    ])
  ) {
    result = await buildQuery(
      DETAIL_SELECT_WITHOUT_REFUND_FIELDS_WITH_PAYMENT_LINES,
    );
  }
  if (result.error && isMissingPaymentLines(result.error)) {
    result = await buildQuery(ADMIN_RENTAL_BOOKING_DETAIL_SELECT);
    if (
      result.error &&
      isMissingColumn(result.error, [
        "rental_bookings.deposit_refund_amount",
        "deposit_refund_amount",
        "rental_bookings.deposit_refund_notes",
        "deposit_refund_notes",
      ])
    ) {
      result = await buildQuery(DETAIL_SELECT_WITHOUT_REFUND_FIELDS);
    }
  }
  if (result.error)
    throw createError({ statusCode: 500, statusMessage: result.error.message });
  if (!result.data)
    throw createError({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  const customer = await fetchAdminCustomerProfile(
    adminClient,
    String((result.data as Record<string, unknown>).user_id ?? ""),
  );
  return mapAdminRentalBookingDetail(result.data, customer);
}

/**
 * Loads the most recent fulfillment row for the given booking and event type.
 * Returns null when no fulfillment exists yet (e.g. Confirm Pickup not yet done).
 * Callers must handle the null case gracefully — do NOT throw here.
 */
export async function loadAdminRentalFulfillmentForPrint(
  adminClient: SupabaseClient,
  bookingId: string,
  type: AdminRentalPrintFormType,
): Promise<AdminRentalPrintFulfillmentRow | null> {
  const buildQuery = (select: string) =>
    adminClient
      .from("rental_booking_fulfillments")
      .select(select)
      .eq("booking_id", bookingId)
      .eq("event_type", type)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  let result = await buildQuery(FULFILLMENT_SELECT);
  if (
    result.error &&
    isMissingColumn(result.error, [
      "rental_booking_fulfillments.booking_checklist_id",
      "booking_checklist_id",
      "rental_booking_fulfillments.branch_id",
      "branch_id",
      "rental_booking_fulfillments.event_at",
      "event_at",
    ])
  ) {
    result = await buildQuery(FULFILLMENT_SELECT_LEGACY);
  }
  if (result.error)
    throw createError({ statusCode: 500, statusMessage: result.error.message });
  if (!result.data) return null;
  return mapFulfillment(result.data as Record<string, unknown>);
}

async function loadStaffName(
  adminClient: SupabaseClient,
  userId: string | null,
) {
  if (!userId) return null;
  const { data, error } = await adminClient
    .from("users")
    .select("id, full_name, phone")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  const row = (data ?? {}) as Record<string, unknown>;
  return asString(row.full_name) ?? asString(row.phone) ?? userId;
}

async function loadBranchName(
  adminClient: SupabaseClient,
  branchId: string | null,
) {
  if (!branchId) return null;
  const { data, error } = await adminClient
    .from("store_branches")
    .select("id, code, name_th, name_en")
    .eq("id", branchId)
    .maybeSingle();
  if (error) return null;
  const row = (data ?? {}) as Record<string, unknown>;
  return asString(row.name_th) ?? asString(row.name_en) ?? asString(row.code);
}

async function loadWalkInEvidence(
  adminClient: SupabaseClient,
  phone: string | null,
) {
  if (!phone) return null;
  const { data, error } = await adminClient
    .from("walk_in_customers")
    .select("phone, id_card_storage_path, id_card_url")
    .eq("phone", phone)
    .maybeSingle();
  if (error) return null;
  const row = (data ?? {}) as Record<string, unknown>;
  return asString(row.id_card_storage_path) ?? asString(row.id_card_url);
}

export async function loadAdminRentalPrintFormData(input: {
  adminClient: SupabaseClient;
  bookingId: string;
  type: AdminRentalPrintFormType;
  generatedAt?: string;
}): Promise<{
  booking: AdminRentalBookingDetail;
  fulfillment: AdminRentalPrintFulfillmentRow | null;
  payload: AdminRentalPrintFormPayload;
}> {
  const booking = await loadAdminRentalBookingPrintDetail(
    input.adminClient,
    input.bookingId,
  );
  const [ops, fulfillment] = await Promise.all([
    loadBookingOpsPayload(input.adminClient, input.bookingId, booking.assetId),
    loadAdminRentalFulfillmentForPrint(
      input.adminClient,
      input.bookingId,
      input.type,
    ),
  ]);
  // When no fulfillment yet (pre-confirm-pickup), fall back to booking's branch.
  const branchIdForName =
    fulfillment?.branchId ?? booking.storageBranchId ?? null;
  const [staffName, branchName, walkInEvidence] = await Promise.all([
    loadStaffName(input.adminClient, fulfillment?.performedByUserId ?? null),
    loadBranchName(input.adminClient, branchIdForName),
    loadWalkInEvidence(input.adminClient, booking.walkInPhone),
  ]);
  return {
    booking,
    fulfillment,
    payload: buildAdminRentalPrintFormPayload({
      type: input.type,
      booking,
      fulfillment,
      checklists: ops.checklists,
      documents: ops.documents,
      branchName,
      staffName,
      idEvidenceRef: booking.customer.idCardUrl ?? walkInEvidence,
      generatedAt: input.generatedAt,
    }),
  };
}
