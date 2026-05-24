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
 * Machine-readable business hours preset keys.
 * Mirrors the DB CHECK constraint on partner_profiles.business_hours_preset_key (migration 098).
 * NULL means custom free text, unspecified, or legacy text-only row — excluded from Open Now.
 */
export const BUSINESS_HOURS_PRESET_KEYS = [
  "open_24h",
  "by_appointment",
  "everyday_0900_1800",
  "mon_fri_0900_1800",
  "mon_sat_0900_1800",
  "sat_sun_0900_1800",
] as const;

export type PartnerBusinessHoursPresetKey =
  (typeof BUSINESS_HOURS_PRESET_KEYS)[number];

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
  /** Machine-readable preset key. Null = custom/unspecified. Exposed for future Open Now badge. */
  businessHoursPresetKey: PartnerBusinessHoursPresetKey | null;
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
  /** Display-only free text. NEVER used for Open Now logic. */
  businessHoursText: string | null;
  /** IANA timezone for business hours. MVP: always 'Asia/Bangkok'. */
  businessHoursTimezone: string;
}

/** Paginated listing response for the public directory. */
export interface PartnerListResponse {
  items: PartnerCard[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
