import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminDocumentPreviewResponse,
  AdminOfficialDocumentDetail,
  AdminOperationalRentalDocumentSnapshot,
  OperationalRentalDocumentType,
} from "~~/app/types/admin-documents";
import {
  documentTypeToPrintFormType,
  isOperationalRentalDocumentType,
} from "~~/app/utils/admin-documents";
import {
  OFFICIAL_DOCUMENT_SELECT,
  OPERATIONAL_RENTAL_DOCUMENT_TEMPLATES,
  assertDocumentBranchAccess,
  mapOfficialDocumentRow,
  nextOperationalDocumentNumber,
  resolveDocumentHeaderSnapshot,
} from "~~/server/utils/admin-documents";
import { loadAdminRentalPrintFormData } from "~~/server/utils/admin-rental-print-form-loader";

type Row = Record<string, unknown>;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateSource(sourceType: unknown, sourceId: unknown): string {
  if (sourceType !== "rental_booking") {
    throw createError({
      statusCode: 400,
      statusMessage: "sourceType must be rental_booking",
    });
  }
  const id = clean(sourceId);
  if (!id)
    throw createError({
      statusCode: 400,
      statusMessage: "sourceId is required",
    });
  return id;
}

function validateDocumentType(value: unknown): OperationalRentalDocumentType {
  if (!isOperationalRentalDocumentType(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid documentType",
    });
  }
  return value;
}

function assertIssueState(input: {
  documentType: OperationalRentalDocumentType;
  bookingStatus: string;
}): void {
  if (
    input.documentType === "rental_pickup_form" &&
    !["picked_up", "returned"].includes(input.bookingStatus)
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: "Pickup form can be issued only after pickup fulfillment",
    });
  }
  if (
    input.documentType === "rental_return_form" &&
    input.bookingStatus !== "returned"
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: "Return form can be issued only after return fulfillment",
    });
  }
}

export function operationalDocumentIdempotencyKey(
  bookingId: string,
  documentType: OperationalRentalDocumentType,
): string {
  return `rental_booking:${bookingId}:${documentType}`;
}

async function findExistingOperationalDocument(input: {
  adminClient: Pick<SupabaseClient, "from">;
  bookingId: string;
  documentType: OperationalRentalDocumentType;
}): Promise<AdminOfficialDocumentDetail | null> {
  const { data, error } = await input.adminClient
    .from("official_documents")
    .select(OFFICIAL_DOCUMENT_SELECT)
    .eq("source_type", "rental_booking")
    .eq("source_id", input.bookingId)
    .eq("document_type", input.documentType)
    .in("status", ["issued", "printed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return data ? mapOfficialDocumentRow(data as Row) : null;
}

export async function previewOperationalRentalDocument(input: {
  adminClient: SupabaseClient;
  sourceType: unknown;
  sourceId: unknown;
  documentType: unknown;
  userId?: string;
  platformRole?: string;
}): Promise<AdminDocumentPreviewResponse> {
  const bookingId = validateSource(input.sourceType, input.sourceId);
  const documentType = validateDocumentType(input.documentType);
  const formType = documentTypeToPrintFormType(documentType);
  const { booking, payload } = await loadAdminRentalPrintFormData({
    adminClient: input.adminClient,
    bookingId,
    type: formType,
  });
  const branchId = payload.branch.id ?? booking.storageBranchId;
  if (input.userId && input.platformRole) {
    await assertDocumentBranchAccess({
      adminClient: input.adminClient,
      userId: input.userId,
      platformRole: input.platformRole,
      branchId,
    });
  }
  const header = await resolveDocumentHeaderSnapshot({
    adminClient: input.adminClient,
    branchId,
    fallbackCompanyName: payload.company.name,
  });
  return {
    documentType,
    sourceType: "rental_booking",
    sourceId: bookingId,
    payload,
    snapshotPreview: {
      schema_version: 1,
      document: {
        document_type: documentType,
        document_number: null,
        issued_at: null,
        template_key: OPERATIONAL_RENTAL_DOCUMENT_TEMPLATES[documentType],
        template_version: 1,
      },
      source: { source_type: "rental_booking", source_id: bookingId },
      header,
      payload,
      issue_context: { issued_by: "preview", branch_id: branchId },
      disclaimer: payload.disclaimer,
    },
  };
}

export async function issueOperationalRentalDocument(input: {
  adminClient: SupabaseClient;
  userId: string;
  sourceType: unknown;
  sourceId: unknown;
  documentType: unknown;
  issueNote?: string | null;
  platformRole?: string;
}): Promise<{ document: AdminOfficialDocumentDetail; alreadyIssued: boolean }> {
  const bookingId = validateSource(input.sourceType, input.sourceId);
  const documentType = validateDocumentType(input.documentType);
  const existing = await findExistingOperationalDocument({
    adminClient: input.adminClient,
    bookingId,
    documentType,
  });
  if (existing) return { document: existing, alreadyIssued: true };

  const formType = documentTypeToPrintFormType(documentType);
  const { booking, payload } = await loadAdminRentalPrintFormData({
    adminClient: input.adminClient,
    bookingId,
    type: formType,
  });
  assertIssueState({ documentType, bookingStatus: booking.status });
  const branchId = payload.branch.id ?? booking.storageBranchId;
  if (input.platformRole) {
    await assertDocumentBranchAccess({
      adminClient: input.adminClient,
      userId: input.userId,
      platformRole: input.platformRole,
      branchId,
    });
  }
  const issuedAt = new Date();
  const documentNo = await nextOperationalDocumentNumber({
    adminClient: input.adminClient,
    documentType,
    branchId,
    issuedAt,
  });
  const header = await resolveDocumentHeaderSnapshot({
    adminClient: input.adminClient,
    branchId,
    fallbackCompanyName: payload.company.name,
  });
  const templateKey = OPERATIONAL_RENTAL_DOCUMENT_TEMPLATES[documentType];
  const snapshot: AdminOperationalRentalDocumentSnapshot = {
    schema_version: 1,
    document: {
      document_type: documentType,
      document_number: documentNo,
      issued_at: issuedAt.toISOString(),
      template_key: templateKey,
      template_version: 1,
    },
    source: { source_type: "rental_booking", source_id: bookingId },
    header,
    payload,
    issue_context: { issued_by: input.userId, branch_id: branchId },
    disclaimer: payload.disclaimer,
  };
  const { data, error } = await input.adminClient
    .from("official_documents")
    .insert({
      document_type: documentType,
      document_no: documentNo,
      status: "issued",
      branch_id: branchId,
      source_type: "rental_booking",
      source_id: bookingId,
      customer_user_id: booking.userId || null,
      walk_in_phone: booking.walkInPhone || null,
      issued_at: issuedAt.toISOString(),
      issued_by: input.userId,
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
      currency_code: booking.currencyCode || "THB",
      template_key: templateKey,
      template_version: 1,
      snapshot,
      idempotency_key: operationalDocumentIdempotencyKey(
        bookingId,
        documentType,
      ),
    })
    .select(OFFICIAL_DOCUMENT_SELECT)
    .maybeSingle();
  if (error) {
    const message = clean(error.message);
    if ((error as { code?: string }).code === "23505") {
      const duplicate = await findExistingOperationalDocument({
        adminClient: input.adminClient,
        bookingId,
        documentType,
      });
      if (duplicate) return { document: duplicate, alreadyIssued: true };
    }
    throw createError({ statusCode: 500, statusMessage: message });
  }
  if (!data)
    throw createError({
      statusCode: 500,
      statusMessage: "Document insert failed",
    });
  const document = mapOfficialDocumentRow(data as Row);
  const { error: eventError } = await input.adminClient
    .from("document_events")
    .insert({
      document_id: document.id,
      event_type: "issued",
      staff_user_id: input.userId,
      reason: clean(input.issueNote) || null,
      metadata: {
        sourceType: "rental_booking",
        sourceId: bookingId,
        documentType,
      },
    });
  if (eventError)
    throw createError({ statusCode: 500, statusMessage: eventError.message });
  return { document, alreadyIssued: false };
}

export async function listIssuedOperationalRentalDocuments(input: {
  adminClient: Pick<SupabaseClient, "from">;
  bookingId: string;
}) {
  const { data, error } = await input.adminClient
    .from("official_documents")
    .select(OFFICIAL_DOCUMENT_SELECT)
    .eq("source_type", "rental_booking")
    .eq("source_id", input.bookingId)
    .in("document_type", ["rental_pickup_form", "rental_return_form"])
    .order("issued_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapOfficialDocumentRow(row as Row));
}
