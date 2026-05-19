import type { AdminRentalPrintFormPayload } from "~/types/admin-rental-print-form";

export type OperationalRentalDocumentType =
  | "rental_pickup_form"
  | "rental_return_form";

export type AdminDocumentEventType = "printed" | "reprinted";

export type AdminOfficialDocumentStatus =
  | "draft"
  | "issued"
  | "printed"
  | "voided"
  | "replaced";

export interface AdminIssuedDocumentSummary {
  id: string;
  documentType: string;
  documentNo: string | null;
  status: AdminOfficialDocumentStatus;
  issuedAt: string | null;
  printCount: number;
  lastPrintedAt: string | null;
}

export interface AdminBookingFulfillmentStatus {
  pickupExists: boolean;
  returnExists: boolean;
}

export interface OperationalDocumentUiState {
  canPreview: boolean;
  canIssue: boolean;
  helperText: string;
}

export interface AdminDocumentHeaderSnapshot {
  companyNameTh: string;
  companyNameEn: string;
  displayName: string;
  taxId: string;
  branchTaxCode: string;
  addressTh: string;
  addressEn: string;
  phone: string;
  email: string;
  logoPath: string | null;
  stampPath: string | null;
  footerNote: string;
}

export interface AdminOperationalRentalDocumentSnapshot {
  schema_version: 1;
  document: {
    document_type: OperationalRentalDocumentType;
    document_number: string;
    issued_at: string;
    template_key: string;
    template_version: 1;
  };
  source: { source_type: "rental_booking"; source_id: string };
  header: AdminDocumentHeaderSnapshot;
  payload: AdminRentalPrintFormPayload;
  issue_context: {
    issued_by: string;
    branch_id: string | null;
  };
  disclaimer: { th: string; en: string };
}

export interface AdminOfficialDocumentDetail extends AdminIssuedDocumentSummary {
  branchId: string | null;
  sourceType: string;
  sourceId: string;
  currencyCode: string;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  templateKey: string;
  templateVersion: number;
  snapshot: AdminOperationalRentalDocumentSnapshot | Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDocumentPreviewResponse {
  documentType: OperationalRentalDocumentType;
  sourceType: "rental_booking";
  sourceId: string;
  payload: AdminRentalPrintFormPayload;
  snapshotPreview: Omit<AdminOperationalRentalDocumentSnapshot, "document"> & {
    document: Omit<
      AdminOperationalRentalDocumentSnapshot["document"],
      "document_number" | "issued_at"
    > & {
      document_number: null;
      issued_at: null;
    };
  };
}

export interface AdminDocumentIssueResponse {
  document: AdminOfficialDocumentDetail;
  alreadyIssued: boolean;
  printUrl: string;
}

// ── Booking Deposit Confirmation (BDC) document read model ────────────────────

export type BookingDepositConfirmationDocumentState =
  | "issued"
  | "failed"
  | "pending"
  | "missing"
  | "not_applicable";

export interface AdminBookingDepositConfirmationDocument {
  /** Derived state from the pos_document_issuance_tasks row. */
  state: BookingDepositConfirmationDocumentState;
  /** official_documents.id — present when state === 'issued'. */
  officialDocumentId: string | null;
  /** Human-readable document number (e.g. "BDC-202605-0001"). */
  documentNo: string | null;
  /** ISO string from official_documents.issued_at. */
  issuedAt: string | null;
  /** Print count from official_documents. */
  printCount: number;
  /** Error code stored on the task row when state === 'failed'. */
  errorCode: string | null;
  /** True when state is 'failed', 'missing', or 'pending'. */
  canRetry: boolean;
}
