import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminDocumentEventType,
  AdminDocumentHeaderSnapshot,
  AdminOfficialDocumentDetail,
  AdminOfficialDocumentStatus,
  AdminIssuedDocumentSummary,
  OperationalRentalDocumentType,
} from "~~/app/types/admin-documents";
import {
  OPERATIONAL_RENTAL_DOCUMENT_PREFIXES,
  OPERATIONAL_RENTAL_DOCUMENT_TEMPLATES,
  isOperationalRentalDocumentType,
} from "~~/app/utils/admin-documents";

type Row = Record<string, unknown>;

const OFFICIAL_DOCUMENT_SELECT =
  "id, document_type, document_no, status, branch_id, source_type, source_id, issued_at, subtotal, vat_amount, total_amount, currency_code, template_key, template_version, snapshot, print_count, last_printed_at, created_at, updated_at";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value: unknown): string | null {
  const clean = text(value);
  return clean.length > 0 ? clean : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeOperationalRentalDocumentType(
  value: unknown,
): OperationalRentalDocumentType {
  if (!isOperationalRentalDocumentType(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Unsupported operational rental document type",
    });
  }
  return value;
}

export function documentPeriod(date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}${mm}`;
}

export function mapOfficialDocumentRow(row: Row): AdminOfficialDocumentDetail {
  return {
    id: text(row.id),
    documentType: text(row.document_type),
    documentNo: textOrNull(row.document_no),
    status: (text(row.status) || "draft") as AdminOfficialDocumentStatus,
    issuedAt: textOrNull(row.issued_at),
    printCount: numberValue(row.print_count),
    lastPrintedAt: textOrNull(row.last_printed_at),
    branchId: textOrNull(row.branch_id),
    sourceType: text(row.source_type),
    sourceId: text(row.source_id),
    currencyCode: text(row.currency_code) || "THB",
    subtotal: numberValue(row.subtotal),
    vatAmount: numberValue(row.vat_amount),
    totalAmount: numberValue(row.total_amount),
    templateKey: text(row.template_key),
    templateVersion: numberValue(row.template_version) || 1,
    snapshot:
      row.snapshot && typeof row.snapshot === "object"
        ? (row.snapshot as Record<string, unknown>)
        : {},
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function mapIssuedDocumentSummary(row: Row): AdminIssuedDocumentSummary {
  const detail = mapOfficialDocumentRow(row);
  return {
    id: detail.id,
    documentType: detail.documentType,
    documentNo: detail.documentNo,
    status: detail.status,
    issuedAt: detail.issuedAt,
    printCount: detail.printCount,
    lastPrintedAt: detail.lastPrintedAt,
  };
}

export async function assertDocumentBranchAccess(input: {
  adminClient: Pick<SupabaseClient, "from">;
  userId: string;
  platformRole: string;
  branchId: string | null;
}): Promise<void> {
  if (!input.branchId || input.platformRole === "super_admin") return;
  const { data, error } = await input.adminClient
    .from("admin_user_branch_access")
    .select("user_id")
    .eq("user_id", input.userId)
    .eq("branch_id", input.branchId)
    .eq("can_pos", true)
    .maybeSingle();
  if (error) {
    const message = text((error as { message?: string }).message);
    if (/admin_user_branch_access/i.test(message)) return;
    throw createError({ statusCode: 500, statusMessage: message });
  }
  if (!data) {
    throw createError({
      statusCode: 403,
      statusMessage: "Document branch access required",
    });
  }
}

async function loadSystemCompanyProfile(
  adminClient: Pick<SupabaseClient, "from">,
) {
  const { data, error } = await adminClient
    .from("system_configs")
    .select("key, value")
    .eq("key", "document_company_profile")
    .maybeSingle();
  if (error) return {} as Row;
  const value = (data as Row | null)?.value;
  return value && typeof value === "object" ? (value as Row) : {};
}

async function loadBranchDocumentSettings(
  adminClient: Pick<SupabaseClient, "from">,
  branchId: string | null,
) {
  if (!branchId) return {} as Row;
  const { data, error } = await adminClient
    .from("branch_document_settings")
    .select(
      "branch_id, logo_path, stamp_path, company_name_th, company_name_en, tax_id, branch_tax_code, address_th, address_en, phone, email, footer_note",
    )
    .eq("branch_id", branchId)
    .maybeSingle();
  if (error || !data) return {} as Row;
  return data as Row;
}

export async function resolveDocumentHeaderSnapshot(input: {
  adminClient: Pick<SupabaseClient, "from">;
  branchId: string | null;
  fallbackCompanyName?: string | null;
}): Promise<AdminDocumentHeaderSnapshot> {
  const [global, branch] = await Promise.all([
    loadSystemCompanyProfile(input.adminClient),
    loadBranchDocumentSettings(input.adminClient, input.branchId),
  ]);
  const companyNameTh =
    text(branch.company_name_th) || text(global.companyNameTh);
  const companyNameEn =
    text(branch.company_name_en) || text(global.companyNameEn);
  const fallback = text(input.fallbackCompanyName) || "HOPNIC";
  return {
    companyNameTh,
    companyNameEn,
    displayName: companyNameTh || companyNameEn || fallback,
    taxId: text(branch.tax_id) || text(global.taxId),
    branchTaxCode:
      text(branch.branch_tax_code) || text(global.branchTaxCode) || "00000",
    addressTh: text(branch.address_th) || text(global.addressTh),
    addressEn: text(branch.address_en) || text(global.addressEn),
    phone: text(branch.phone) || text(global.phone),
    email: text(branch.email) || text(global.email),
    logoPath: textOrNull(branch.logo_path) ?? textOrNull(global.logoPath),
    stampPath: textOrNull(branch.stamp_path) ?? textOrNull(global.stampPath),
    footerNote: text(branch.footer_note) || text(global.footerNote),
  };
}

export async function nextOperationalDocumentNumber(input: {
  adminClient: Pick<SupabaseClient, "rpc">;
  documentType: OperationalRentalDocumentType;
  branchId: string | null;
  issuedAt?: Date;
}): Promise<string> {
  const prefix = OPERATIONAL_RENTAL_DOCUMENT_PREFIXES[input.documentType];
  const { data, error } = await input.adminClient.rpc(
    "f_next_document_number",
    {
      p_document_type: input.documentType,
      p_branch_id: input.branchId,
      p_period: documentPeriod(input.issuedAt),
      p_prefix: prefix,
    },
  );
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  const documentNo = text(data);
  if (!documentNo)
    throw createError({
      statusCode: 500,
      statusMessage: "Document number allocation failed",
    });
  return documentNo;
}

export async function loadOfficialDocument(input: {
  adminClient: Pick<SupabaseClient, "from">;
  documentId: string;
}): Promise<AdminOfficialDocumentDetail> {
  const { data, error } = await input.adminClient
    .from("official_documents")
    .select(OFFICIAL_DOCUMENT_SELECT)
    .eq("id", input.documentId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({ statusCode: 404, statusMessage: "Document not found" });
  return mapOfficialDocumentRow(data as Row);
}

export async function recordDocumentPrintEvent(input: {
  adminClient: Pick<SupabaseClient, "from">;
  document: AdminOfficialDocumentDetail;
  eventType: AdminDocumentEventType;
  staffUserId: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<AdminOfficialDocumentDetail> {
  const reason = textOrNull(input.reason);
  if (input.eventType === "reprinted" && !reason) {
    throw createError({
      statusCode: 400,
      statusMessage: "Reprint reason is required",
    });
  }
  if (input.eventType === "printed" && input.document.printCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: "Document already printed; use reprint",
    });
  }
  const now = new Date().toISOString();
  const { error: eventError } = await input.adminClient
    .from("document_events")
    .insert({
      document_id: input.document.id,
      event_type: input.eventType,
      staff_user_id: input.staffUserId,
      reason,
      metadata: input.metadata ?? {},
    });
  if (eventError)
    throw createError({ statusCode: 500, statusMessage: eventError.message });
  const { data, error } = await input.adminClient
    .from("official_documents")
    .update({
      status: "printed",
      print_count: input.document.printCount + 1,
      last_printed_at: now,
    })
    .eq("id", input.document.id)
    .select(OFFICIAL_DOCUMENT_SELECT)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({ statusCode: 404, statusMessage: "Document not found" });
  return mapOfficialDocumentRow(data as Row);
}

export { OFFICIAL_DOCUMENT_SELECT, OPERATIONAL_RENTAL_DOCUMENT_TEMPLATES };
