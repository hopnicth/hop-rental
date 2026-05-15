import type {
  AdminBookingFulfillmentStatus,
  AdminIssuedDocumentSummary,
} from "~/types/admin-documents";

/**
 * Admin types for rental-booking checklists & documents (P5.5).
 * Used by `/admin/rental-bookings/[id]` page and the
 * `/api/admin/rental-bookings/[id]/(checklists|documents)/*` endpoints.
 */

export type RentalChecklistKind =
  | "pickup"
  | "return"
  | "inspection"
  | "service";

export type RentalChecklistStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "cancelled";

export type RentalChecklistItemResponseType = "check" | "text" | "number";

export type RentalChecklistItemResult =
  | "pending"
  | "passed"
  | "failed"
  | "not_applicable";

export type RentalBookingDocumentType =
  | "repair"
  | "fine"
  | "damage_evidence"
  | "handover"
  | "other";

export type AssetDocumentVisibility =
  | "public"
  | "customer_after_booking"
  | "internal";

export interface AdminBookingChecklistItem {
  id: string;
  templateItemId: string | null;
  sortOrder: number;
  label: string;
  instruction: string | null;
  responseType: RentalChecklistItemResponseType;
  isRequired: boolean;
  resultStatus: RentalChecklistItemResult;
  checked: boolean | null;
  responseText: string | null;
  responseNumber: number | null;
  photoUrls: string[];
  remark: string | null;
  checkedAt: string | null;
  checkedByUserId: string | null;
  updatedAt: string;
}

export interface AdminBookingChecklist {
  id: string;
  bookingId: string;
  assetId: string;
  templateId: string | null;
  kind: RentalChecklistKind;
  templateName: string | null;
  templateVersion: number | null;
  status: RentalChecklistStatus;
  performedByUserId: string | null;
  completedByUserId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: AdminBookingChecklistItem[];
}

export interface AdminBookingDocument {
  id: string;
  bookingId: string;
  bookingChecklistId: string | null;
  assetId: string | null;
  documentType: RentalBookingDocumentType;
  visibility: AssetDocumentVisibility;
  title: string;
  description: string | null;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  amount: number | null;
  currencyCode: string;
  issuedAt: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetChecklistTemplateSummary {
  id: string;
  assetId: string;
  kind: RentalChecklistKind;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  itemCount: number;
}

export interface AdminBookingOpsPayload {
  checklists: AdminBookingChecklist[];
  documents: AdminBookingDocument[];
  issuedDocuments: AdminIssuedDocumentSummary[];
  noShowForfeitureDocuments: AdminIssuedDocumentSummary[];
  fulfillmentStatus: AdminBookingFulfillmentStatus;
  templates: AssetChecklistTemplateSummary[];
}

export interface CreateChecklistFromTemplatePayload {
  templateId: string;
}

export interface CreateChecklistAdHocPayload {
  kind: RentalChecklistKind;
  name: string;
}

export interface UpdateChecklistPayload {
  status?: RentalChecklistStatus;
  notes?: string | null;
}

export interface UpdateChecklistItemPayload {
  checked?: boolean | null;
  responseText?: string | null;
  responseNumber?: number | null;
  resultStatus?: RentalChecklistItemResult;
  remark?: string | null;
  removePhotoUrl?: string;
}

export interface UploadBookingDocumentMeta {
  documentType: RentalBookingDocumentType;
  visibility: AssetDocumentVisibility;
  title: string;
  description?: string | null;
  amount?: number | null;
  issuedAt?: string | null;
}
