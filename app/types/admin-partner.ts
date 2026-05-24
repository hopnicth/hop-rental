/**
 * Partner Directory — admin types.
 *
 * Extends the public shapes with private admin-only fields.
 * These types must NEVER be returned from public API endpoints.
 */

import type { PartnerDirectoryType, PartnerEntityType } from "~/types/partner";

/**
 * Full admin row — includes private fields that are column-level revoked
 * from anon/authenticated roles in the DB (migration 096).
 */
export interface AdminPartnerRow {
  id: string;
  slug: string;
  directoryType: PartnerDirectoryType;
  entityType: PartnerEntityType;
  nameTh: string;
  nameEn: string | null;
  taglineTh: string | null;
  taglineEn: string | null;
  descriptionTh: string | null;
  descriptionEn: string | null;
  mainImageUrl: string | null;
  mainCategoryKey: string | null;
  serviceAreas: string[];
  contactPhone: string | null;
  contactEmail: string | null;
  lineId: string | null;
  lineUrl: string | null;
  mapsUrl: string | null;
  businessHoursText: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  sortOrder: number;
  /** ADMIN-ONLY: KYC document metadata. Never in public payloads. */
  kycDocuments: Record<string, unknown>;
  /** ADMIN-ONLY: Verification decision notes. Never in public payloads. */
  verifiedNotes: string | null;
  /** ADMIN-ONLY: Internal operational notes. Never in public payloads. */
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight list item — omits expensive/private detail fields. */
export type AdminPartnerListItem = Pick<
  AdminPartnerRow,
  | "id"
  | "slug"
  | "directoryType"
  | "entityType"
  | "nameTh"
  | "nameEn"
  | "taglineTh"
  | "mainImageUrl"
  | "mainCategoryKey"
  | "serviceAreas"
  | "isVerified"
  | "isPublic"
  | "isFeatured"
  | "sortOrder"
  | "createdAt"
  | "updatedAt"
>;

/** Paginated admin listing response. */
export interface AdminPartnerListResponse {
  items: AdminPartnerListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Query filter params for the admin list endpoint. */
export interface AdminPartnerFilterParams {
  directoryType?: PartnerDirectoryType | null;
  isPublic?: boolean | null;
  isVerified?: boolean | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}
