/**
 * Server util for rental-booking ops (checklists + documents).
 * Used by endpoints under `/api/admin/rental-bookings/[id]/...`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminBookingChecklist,
  AdminBookingChecklistItem,
  AdminBookingDocument,
  AdminBookingOpsPayload,
  AssetChecklistTemplateSummary,
  RentalChecklistItemResponseType,
  RentalChecklistItemResult,
  RentalChecklistKind,
  RentalChecklistStatus,
  AssetDocumentVisibility,
  RentalBookingDocumentType,
} from "~~/app/types/admin-booking-ops";
import { mapIssuedDocumentSummary } from "~~/server/utils/admin-documents";
import {
  FORFEITURE_RECEIPT_DOCUMENT_TYPE,
  NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
} from "~~/server/utils/rental-booking-no-show-documents";

export const BOOKING_DOCS_BUCKET = "catalog-media";

const CHECKLIST_SELECT =
  "id, booking_id, asset_id, template_id, kind, template_name, template_version, status, performed_by_user_id, completed_by_user_id, started_at, completed_at, notes, created_at, updated_at";

const CHECKLIST_ITEM_SELECT =
  "id, booking_checklist_id, template_item_id, sort_order, label, instruction, response_type, is_required, result_status, checked, response_text, response_number, photo_urls, remark, checked_at, checked_by_user_id, updated_at";

const DOCUMENT_SELECT =
  "id, booking_id, booking_checklist_id, asset_id, document_type, visibility, title, description, file_url, file_name, mime_type, file_size_bytes, amount, currency_code, issued_at, storage_bucket, storage_path, created_by_user_id, created_at, updated_at";

function toStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toStrOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapChecklistItem(
  r: Record<string, unknown>,
): AdminBookingChecklistItem {
  return {
    id: toStr(r.id),
    templateItemId: toStrOrNull(r.template_item_id),
    sortOrder: Number(r.sort_order ?? 0),
    label: toStr(r.label),
    instruction: toStrOrNull(r.instruction),
    responseType: (toStr(r.response_type) ||
      "check") as RentalChecklistItemResponseType,
    isRequired: Boolean(r.is_required),
    resultStatus: (toStr(r.result_status) ||
      "pending") as RentalChecklistItemResult,
    checked: typeof r.checked === "boolean" ? (r.checked as boolean) : null,
    responseText: toStrOrNull(r.response_text),
    responseNumber: toNumOrNull(r.response_number),
    photoUrls: Array.isArray(r.photo_urls)
      ? (r.photo_urls as unknown[]).map((u) => toStr(u)).filter(Boolean)
      : [],
    remark: toStrOrNull(r.remark),
    checkedAt: toStrOrNull(r.checked_at),
    checkedByUserId: toStrOrNull(r.checked_by_user_id),
    updatedAt: toStr(r.updated_at),
  };
}

export function mapChecklist(
  r: Record<string, unknown>,
  items: AdminBookingChecklistItem[],
): AdminBookingChecklist {
  return {
    id: toStr(r.id),
    bookingId: toStr(r.booking_id),
    assetId: toStr(r.asset_id),
    templateId: toStrOrNull(r.template_id),
    kind: (toStr(r.kind) || "pickup") as RentalChecklistKind,
    templateName: toStrOrNull(r.template_name),
    templateVersion: toNumOrNull(r.template_version),
    status: (toStr(r.status) || "draft") as RentalChecklistStatus,
    performedByUserId: toStrOrNull(r.performed_by_user_id),
    completedByUserId: toStrOrNull(r.completed_by_user_id),
    startedAt: toStrOrNull(r.started_at),
    completedAt: toStrOrNull(r.completed_at),
    notes: toStrOrNull(r.notes),
    createdAt: toStr(r.created_at),
    updatedAt: toStr(r.updated_at),
    items: items.sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function mapBookingDocument(
  r: Record<string, unknown>,
): AdminBookingDocument {
  return {
    id: toStr(r.id),
    bookingId: toStr(r.booking_id),
    bookingChecklistId: toStrOrNull(r.booking_checklist_id),
    assetId: toStrOrNull(r.asset_id),
    documentType: (toStr(r.document_type) ||
      "other") as RentalBookingDocumentType,
    visibility: (toStr(r.visibility) || "internal") as AssetDocumentVisibility,
    title: toStr(r.title),
    description: toStrOrNull(r.description),
    fileUrl: toStr(r.file_url),
    fileName: toStrOrNull(r.file_name),
    mimeType: toStrOrNull(r.mime_type),
    fileSizeBytes: toNumOrNull(r.file_size_bytes),
    amount: toNumOrNull(r.amount),
    currencyCode: toStr(r.currency_code) || "THB",
    issuedAt: toStrOrNull(r.issued_at),
    storageBucket: toStrOrNull(r.storage_bucket),
    storagePath: toStrOrNull(r.storage_path),
    createdByUserId: toStrOrNull(r.created_by_user_id),
    createdAt: toStr(r.created_at),
    updatedAt: toStr(r.updated_at),
  };
}

export { CHECKLIST_SELECT, CHECKLIST_ITEM_SELECT, DOCUMENT_SELECT };

export async function fetchBookingChecklists(
  adminClient: SupabaseClient,
  bookingId: string,
): Promise<AdminBookingChecklist[]> {
  const { data: lists, error } = await adminClient
    .from("rental_booking_checklists")
    .select(CHECKLIST_SELECT)
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const ids = (lists ?? []).map((l: Record<string, unknown>) => toStr(l.id));
  let itemsByList: Record<string, AdminBookingChecklistItem[]> = {};
  if (ids.length > 0) {
    const { data: items, error: itemsErr } = await adminClient
      .from("rental_booking_checklist_items")
      .select(CHECKLIST_ITEM_SELECT)
      .in("booking_checklist_id", ids);
    if (itemsErr) throw new Error(itemsErr.message);
    itemsByList = (items ?? []).reduce(
      (acc: Record<string, AdminBookingChecklistItem[]>, raw: unknown) => {
        const r = raw as Record<string, unknown>;
        const cid = toStr(r.booking_checklist_id);
        if (!acc[cid]) acc[cid] = [];
        acc[cid].push(mapChecklistItem(r));
        return acc;
      },
      {},
    );
  }

  return (lists ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return mapChecklist(r, itemsByList[toStr(r.id)] ?? []);
  });
}

export async function fetchBookingDocuments(
  adminClient: SupabaseClient,
  bookingId: string,
): Promise<AdminBookingDocument[]> {
  const { data, error } = await adminClient
    .from("rental_booking_documents")
    .select(DOCUMENT_SELECT)
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) =>
    mapBookingDocument(raw as Record<string, unknown>),
  );
}

export async function fetchAssetChecklistTemplates(
  adminClient: SupabaseClient,
  assetId: string,
): Promise<AssetChecklistTemplateSummary[]> {
  const { data, error } = await adminClient
    .from("asset_checklist_templates")
    .select(
      "id, asset_id, kind, name, description, version, is_active, asset_checklist_template_items(count)",
    )
    .eq("asset_id", assetId)
    .eq("is_active", true)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const itemsArr = r.asset_checklist_template_items as
      | Array<{ count: number }>
      | undefined;
    return {
      id: toStr(r.id),
      assetId: toStr(r.asset_id),
      kind: (toStr(r.kind) || "pickup") as RentalChecklistKind,
      name: toStr(r.name),
      description: toStrOrNull(r.description),
      version: Number(r.version ?? 1),
      isActive: Boolean(r.is_active),
      itemCount: Array.isArray(itemsArr) ? Number(itemsArr[0]?.count ?? 0) : 0,
    };
  });
}

export async function fetchIssuedOperationalDocuments(
  adminClient: SupabaseClient,
  bookingId: string,
) {
  const { data, error } = await adminClient
    .from("official_documents")
    .select(
      "id, document_type, document_no, status, branch_id, source_type, source_id, issued_at, subtotal, vat_amount, total_amount, currency_code, template_key, template_version, snapshot, print_count, last_printed_at, created_at, updated_at",
    )
    .eq("source_type", "rental_booking")
    .eq("source_id", bookingId)
    .in("document_type", ["rental_pickup_form", "rental_return_form"])
    .order("issued_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) =>
    mapIssuedDocumentSummary(raw as Record<string, unknown>),
  );
}

export async function fetchIssuedNoShowForfeitureDocuments(
  adminClient: SupabaseClient,
  bookingId: string,
) {
  const { data: noShowEvents, error: noShowError } = await adminClient
    .from("rental_booking_no_show_events")
    .select("id")
    .eq("booking_id", bookingId);
  if (noShowError) throw new Error(noShowError.message);
  const noShowIds = (noShowEvents ?? [])
    .map((row: Record<string, unknown>) => toStr(row.id))
    .filter(Boolean);

  const { data: dispositions, error: dispositionError } = await adminClient
    .from("rental_booking_deposit_disposition_events")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("source_event_type", "no_show");
  if (dispositionError) throw new Error(dispositionError.message);
  const dispositionIds = (dispositions ?? [])
    .map((row: Record<string, unknown>) => toStr(row.id))
    .filter(Boolean);

  let recognitionIds: string[] = [];
  if (dispositionIds.length > 0) {
    const { data: recognitions, error: recognitionError } = await adminClient
      .from("financial_recognition_events")
      .select("id")
      .eq("source_type", "rental_booking_deposit_disposition_event")
      .eq("recognition_type", "booking_deposit_forfeiture_income")
      .in("source_id", dispositionIds);
    if (recognitionError) throw new Error(recognitionError.message);
    recognitionIds = (recognitions ?? [])
      .map((row: Record<string, unknown>) => toStr(row.id))
      .filter(Boolean);
  }

  const results: Record<string, unknown>[] = [];
  if (noShowIds.length > 0) {
    const { data, error } = await adminClient
      .from("official_documents")
      .select(
        "id, document_type, document_no, status, branch_id, source_type, source_id, issued_at, subtotal, vat_amount, total_amount, currency_code, template_key, template_version, snapshot, print_count, last_printed_at, created_at, updated_at",
      )
      .eq("source_type", "rental_booking_no_show_event")
      .eq("document_type", NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE)
      .in("source_id", noShowIds);
    if (error) throw new Error(error.message);
    results.push(...((data ?? []) as Record<string, unknown>[]));
  }
  if (recognitionIds.length > 0) {
    const { data, error } = await adminClient
      .from("official_documents")
      .select(
        "id, document_type, document_no, status, branch_id, source_type, source_id, issued_at, subtotal, vat_amount, total_amount, currency_code, template_key, template_version, snapshot, print_count, last_printed_at, created_at, updated_at",
      )
      .eq("source_type", "financial_recognition_event")
      .eq("document_type", FORFEITURE_RECEIPT_DOCUMENT_TYPE)
      .in("source_id", recognitionIds);
    if (error) throw new Error(error.message);
    results.push(...((data ?? []) as Record<string, unknown>[]));
  }
  return results
    .sort((a, b) => toStr(b.issued_at).localeCompare(toStr(a.issued_at)))
    .map((raw) => mapIssuedDocumentSummary(raw));
}

export async function fetchBookingFulfillmentStatus(
  adminClient: SupabaseClient,
  bookingId: string,
) {
  const { data, error } = await adminClient
    .from("rental_booking_fulfillments")
    .select("event_type")
    .eq("booking_id", bookingId)
    .in("event_type", ["pickup", "return"]);
  if (error) throw new Error(error.message);
  const eventTypes = new Set(
    (data ?? []).map((row: Record<string, unknown>) => toStr(row.event_type)),
  );
  return {
    pickupExists: eventTypes.has("pickup"),
    returnExists: eventTypes.has("return"),
  };
}

export async function loadBookingOpsPayload(
  adminClient: SupabaseClient,
  bookingId: string,
  assetId: string | null,
): Promise<AdminBookingOpsPayload> {
  const [
    checklists,
    documents,
    templates,
    issuedDocuments,
    noShowForfeitureDocuments,
    fulfillmentStatus,
  ] = await Promise.all([
    fetchBookingChecklists(adminClient, bookingId),
    fetchBookingDocuments(adminClient, bookingId),
    assetId
      ? fetchAssetChecklistTemplates(adminClient, assetId)
      : Promise.resolve([] as AssetChecklistTemplateSummary[]),
    fetchIssuedOperationalDocuments(adminClient, bookingId),
    fetchIssuedNoShowForfeitureDocuments(adminClient, bookingId),
    fetchBookingFulfillmentStatus(adminClient, bookingId),
  ]);
  return {
    checklists,
    documents,
    issuedDocuments,
    noShowForfeitureDocuments,
    fulfillmentStatus,
    templates,
  };
}

export function buildBookingDocumentPath(
  bookingId: string,
  documentId: string,
  ext: string,
): string {
  return `bookings/${bookingId}/documents/${documentId}.${ext}`;
}

export function buildBookingChecklistPhotoPath(
  bookingId: string,
  checklistId: string,
  itemId: string,
  photoId: string,
  ext: string,
): string {
  return `bookings/${bookingId}/checklists/${checklistId}/items/${itemId}/${photoId}.${ext}`;
}
