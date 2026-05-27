/**
 * Partner Directory — admin types.
 *
 * Extends the public shapes with private admin-only fields.
 * These types must NEVER be returned from public API endpoints.
 */

import type {
  PartnerDirectoryType,
  PartnerEntityType,
  PartnerBusinessHoursPresetKey,
  PartnerContentBlock,
} from "~/types/partner";

/**
 * Single KYC document metadata entry stored in partner_profiles.kyc_documents.
 * Files live in the private kyc-documents bucket; this is metadata only.
 * ADMIN-ONLY — never expose to public or staff.
 */
export interface PartnerKycDocumentMeta {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByUserId: string;
}

/**
 * Typed shape of the kyc_documents JSONB column.
 * DB default: {}  →  safe fallback: { documents: [] }
 */
export interface PartnerKycDocuments {
  documents: PartnerKycDocumentMeta[];
}

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
  /** Square/portrait thumbnail image (card grid). Fallback chain: thumbnailImageUrl → coverImageUrl → mainImageUrl → placeholder. */
  thumbnailImageUrl: string | null;
  /** Wide banner cover image (detail hero). Fallback chain: coverImageUrl → mainImageUrl → placeholder. */
  coverImageUrl: string | null;
  mainCategoryKey: string | null;
  /** Controlled secondary category keys — share the same directoryType prefix as mainCategoryKey. */
  secondaryCategoryKeys: string[];
  /** ADMIN-ONLY: Internal search metadata. Never in public payloads. */
  searchKeywords: string[];
  serviceAreas: string[];
  contactPhone: string | null;
  contactEmail: string | null;
  lineId: string | null;
  lineUrl: string | null;
  mapsUrl: string | null;
  businessHoursText: string | null;
  /** Machine-readable preset key. Null = custom/unspecified. */
  businessHoursPresetKey: PartnerBusinessHoursPresetKey | null;
  /** IANA timezone. MVP: always 'Asia/Bangkok'. */
  businessHoursTimezone: string;
  isVerified: boolean;
  verifiedAt: string | null;
  /** Expiry timestamp for 1-year verification. Public-safe. */
  verifiedUntil: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  sortOrder: number;
  /** ADMIN-ONLY: KYC document metadata. Never in public payloads. */
  kycDocuments: PartnerKycDocuments;
  /** ADMIN-ONLY: Verification decision notes. Never in public payloads. */
  verifiedNotes: string | null;
  /** ADMIN-ONLY: Internal operational notes. Never in public payloads. */
  internalNotes: string | null;
  /** ADMIN-ONLY: super_admin who last verified this partner. */
  verifiedByUserId: string | null;
  /** ADMIN-ONLY: Timestamp when verification was last cancelled. */
  verificationCancelledAt: string | null;
  /** ADMIN-ONLY: super_admin who last cancelled verification. */
  verificationCancelledByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * All content blocks including isVisible=false.
   * Admin can view and edit hidden blocks.
   * Not included in AdminPartnerListItem.
   */
  contentBlocks: PartnerContentBlock[];
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
  | "thumbnailImageUrl"
  | "coverImageUrl"
  | "mainCategoryKey"
  | "secondaryCategoryKeys"
  | "serviceAreas"
  | "businessHoursPresetKey"
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
