/**
 * Partner Directory — public-facing types.
 *
 * These types are safe to use in public pages and public API responses.
 * Private admin fields (kyc_documents, verified_notes, internal_notes)
 * are NEVER present here.
 */

export type PartnerDirectoryType = "store" | "service" | "contractor";
export type PartnerEntityType = "individual" | "organization";

/**
 * Lightweight card shape — used in directory listing pages and the
 * Home Partner Network section.
 */
export interface PartnerCard {
  id: string;
  slug: string;
  directoryType: PartnerDirectoryType;
  entityType: PartnerEntityType;
  nameTh: string;
  nameEn: string | null;
  taglineTh: string | null;
  taglineEn: string | null;
  mainImageUrl: string | null;
  mainCategoryKey: string | null;
  serviceAreas: string[];
  isVerified: boolean;
  verifiedAt: string | null;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Full detail shape — used on the public Partner Landing Page.
 * Extends PartnerCard with contact info, descriptions, and map/hours.
 */
export interface PartnerDetail extends PartnerCard {
  descriptionTh: string | null;
  descriptionEn: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  lineId: string | null;
  lineUrl: string | null;
  mapsUrl: string | null;
  businessHoursText: string | null;
}

/** Paginated listing response for the public directory. */
export interface PartnerListResponse {
  items: PartnerCard[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
