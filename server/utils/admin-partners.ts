import { createError } from "h3";
import {
  asNonEmptyString,
  asOptionalBoolean,
  asOptionalString,
  asNumber,
  asStringArray,
} from "~~/server/utils/admin-catalog";
import {
  BUSINESS_HOURS_PRESET_KEYS,
  type PartnerBusinessHoursPresetKey,
} from "~/types/partner";

// ── SELECT strings ────────────────────────────────────────────────────────────

/** Admin list — lightweight, no private fields, no descriptions. */
export const ADMIN_PARTNER_LIST_SELECT =
  "id, slug, directory_type, entity_type, name_th, name_en, tagline_th, main_image_url, main_category_key, secondary_category_keys, service_areas, business_hours_preset_key, is_verified, is_public, is_featured, sort_order, created_at, updated_at";

/** Admin detail — full row including private admin-only columns. */
export const ADMIN_PARTNER_DETAIL_SELECT =
  "id, slug, directory_type, entity_type, name_th, name_en, tagline_th, tagline_en, description_th, description_en, main_image_url, main_category_key, secondary_category_keys, search_keywords, service_areas, contact_phone, contact_email, line_id, line_url, maps_url, business_hours_text, business_hours_preset_key, business_hours_timezone, is_verified, verified_at, is_public, is_featured, sort_order, kyc_documents, verified_notes, internal_notes, created_at, updated_at";

/** Public list — no private fields, no descriptions. */
export const PUBLIC_PARTNER_LIST_SELECT =
  "id, slug, directory_type, entity_type, name_th, name_en, tagline_th, tagline_en, main_image_url, main_category_key, secondary_category_keys, service_areas, business_hours_preset_key, is_verified, verified_at, is_featured, sort_order, created_at, updated_at";

/** Public detail — no private fields (kyc_documents, verified_notes, internal_notes, search_keywords excluded). */
export const PUBLIC_PARTNER_DETAIL_SELECT =
  "id, slug, directory_type, entity_type, name_th, name_en, tagline_th, tagline_en, description_th, description_en, main_image_url, main_category_key, secondary_category_keys, service_areas, contact_phone, contact_email, line_id, line_url, maps_url, business_hours_text, business_hours_preset_key, business_hours_timezone, is_verified, verified_at, is_featured, sort_order, created_at, updated_at";

// ── Validation helpers ────────────────────────────────────────────────────────

const DIRECTORY_TYPES = ["store", "service", "contractor"] as const;
const ENTITY_TYPES = ["individual", "organization"] as const;

const RESERVED_SLUGS = new Set([
  "stores",
  "services",
  "contractors",
  "admin",
  "new",
  "edit",
  "create",
  "delete",
  "update",
  "list",
  "index",
  "api",
  "partners",
  "partner",
  "search",
  "filter",
  "verified",
  "all",
  "featured",
]);

function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

export function asPartnerDirectoryType(value: unknown) {
  if (!DIRECTORY_TYPES.includes(value as (typeof DIRECTORY_TYPES)[number])) {
    fail422("directoryType must be store, service, or contractor");
  }
  return value as "store" | "service" | "contractor";
}

export function asPartnerEntityType(value: unknown) {
  if (!ENTITY_TYPES.includes(value as (typeof ENTITY_TYPES)[number])) {
    fail422("entityType must be individual or organization");
  }
  return value as "individual" | "organization";
}

export function asPartnerSlug(value: unknown): string {
  const slug = asNonEmptyString(value, "slug").toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail422(
      "slug must be lowercase alphanumeric + hyphens, no leading/trailing hyphens",
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    fail422(`slug "${slug}" is reserved`);
  }
  return slug;
}

/**
 * Validates and normalises a Line contact URL.
 * Allowed HTTPS hosts: line.me, lin.ee, *.line.me
 * Mirrors content-pages.ts asLineUrl and migration 066/096 DB constraint exactly.
 * Returns null for empty/null input; throws 422 for invalid/unsafe values.
 */
export function asPartnerLineUrl(value: unknown): string | null {
  const raw = asOptionalString(value);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail422("lineUrl must be a valid URL");
  }
  const host = url.hostname.toLowerCase();
  const isAllowedHost =
    host === "line.me" || host === "lin.ee" || host.endsWith(".line.me");
  if (url.protocol !== "https:" || !isAllowedHost) {
    fail422("lineUrl must be an HTTPS line.me or lin.ee URL");
  }
  return url.toString();
}

/**
 * Validates and normalises a Google Maps CTA URL.
 * Allowed HTTPS hosts (mirrors migration 096 CHECK constraint exactly):
 *   maps.google.com, www.google.com/maps, maps.app.goo.gl
 * goo.gl generic shortener is intentionally excluded.
 * Returns null for empty/null input; throws 422 for invalid/unsafe values.
 */
export function asPartnerMapsUrl(value: unknown): string | null {
  const raw = asOptionalString(value);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail422("mapsUrl must be a valid URL");
  }
  if (url.protocol !== "https:") {
    fail422("mapsUrl must use HTTPS");
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const isMapsGoogleCom = host === "maps.google.com";
  const isGoogleComMaps = host === "www.google.com" && path.startsWith("/maps");
  const isMapsAppGooGl = host === "maps.app.goo.gl";
  if (!isMapsGoogleCom && !isGoogleComMaps && !isMapsAppGooGl) {
    fail422(
      "mapsUrl must be a Google Maps URL (maps.google.com, www.google.com/maps, or maps.app.goo.gl)",
    );
  }
  return url.toString();
}

/**
 * Validates a business_hours_preset_key value.
 * - null | undefined | "" → null (clear / unset)
 * - valid preset key       → that key
 * - any other value        → throws 422
 *
 * Mirrors the DB CHECK constraint in migration 098.
 * Does NOT accept Thai display strings — preset keys are machine-readable only.
 */
export function asPartnerBusinessHoursPresetKey(
  value: unknown,
): PartnerBusinessHoursPresetKey | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    !BUSINESS_HOURS_PRESET_KEYS.includes(value as PartnerBusinessHoursPresetKey)
  ) {
    fail422(
      `businessHoursPresetKey must be one of: ${BUSINESS_HOURS_PRESET_KEYS.join(", ")} — or null to clear`,
    );
  }
  return value as PartnerBusinessHoursPresetKey;
}

/**
 * Validates that a main_category_key's prefix matches the directory_type.
 * Enforces: store_ | service_ | contractor_ prefix convention from migration 097.
 *
 * @param directoryType - the resolved directory type for this profile
 * @param categoryKey   - the raw main_category_key value (may be null/undefined)
 */
export function validateCategoryKeyForDirectoryType(
  directoryType: "store" | "service" | "contractor",
  categoryKey: string | null,
): void {
  if (!categoryKey) return; // null = no category, always valid
  const expected = `${directoryType}_`;
  if (!categoryKey.startsWith(expected)) {
    fail422(
      `mainCategoryKey "${categoryKey}" is not valid for directoryType "${directoryType}". ` +
        `Expected a key beginning with "${expected}"`,
    );
  }
}

// ── Secondary-category and search-keyword helpers ────────────────────────────

const MAX_SEARCH_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 50;

/**
 * Normalises and validates secondary category keys.
 * - Delegates trim / empty-strip / dedup to asStringArray.
 * - All keys must start with `${directoryType}_`.
 * - No key may equal mainCategoryKey.
 */
export function asPartnerSecondaryCategoryKeys(
  value: unknown,
  directoryType: "store" | "service" | "contractor",
  mainCategoryKey: string | null,
): string[] {
  const arr = asStringArray(value);
  const expected = `${directoryType}_`;
  for (const key of arr) {
    if (!key.startsWith(expected)) {
      fail422(
        `secondaryCategoryKey "${key}" is not valid for directoryType "${directoryType}". ` +
          `Expected a key beginning with "${expected}"`,
      );
    }
    if (key === mainCategoryKey) {
      fail422(
        `secondaryCategoryKeys must not include mainCategoryKey "${key}"`,
      );
    }
  }
  return arr;
}

/**
 * Normalises and validates admin-only search keywords.
 * - Delegates trim / empty-strip / dedup to asStringArray.
 * - Max MAX_SEARCH_KEYWORDS entries.
 * - Each entry max MAX_KEYWORD_LENGTH characters.
 */
export function asPartnerSearchKeywords(value: unknown): string[] {
  const arr = asStringArray(value);
  if (arr.length > MAX_SEARCH_KEYWORDS) {
    fail422(`searchKeywords must have at most ${MAX_SEARCH_KEYWORDS} entries`);
  }
  for (const kw of arr) {
    if (kw.length > MAX_KEYWORD_LENGTH) {
      fail422(
        `searchKeyword "${kw}" exceeds maximum length of ${MAX_KEYWORD_LENGTH} characters`,
      );
    }
  }
  return arr;
}
// ── Payload builders ──────────────────────────────────────────────────────────

/** Full payload for INSERT. All required fields must be present. */
export function buildPartnerCreatePayload(body: Record<string, unknown>) {
  const directory_type = asPartnerDirectoryType(body.directoryType);
  const main_category_key = asOptionalString(body.mainCategoryKey);

  // Category key must match the directoryType prefix (store_ / service_ / contractor_)
  validateCategoryKeyForDirectoryType(directory_type, main_category_key);

  return {
    slug: asPartnerSlug(body.slug),
    directory_type,
    entity_type: asPartnerEntityType(body.entityType ?? "organization"),
    name_th: asNonEmptyString(body.nameTh, "nameTh"),
    name_en: asOptionalString(body.nameEn),
    tagline_th: asOptionalString(body.taglineTh),
    tagline_en: asOptionalString(body.taglineEn),
    description_th: asOptionalString(body.descriptionTh),
    description_en: asOptionalString(body.descriptionEn),
    main_image_url: asOptionalString(body.mainImageUrl),
    main_category_key,
    secondary_category_keys: asPartnerSecondaryCategoryKeys(
      body.secondaryCategoryKeys,
      directory_type,
      main_category_key,
    ),
    search_keywords: asPartnerSearchKeywords(body.searchKeywords),
    service_areas: asStringArray(body.serviceAreas),
    contact_phone: asOptionalString(body.contactPhone),
    contact_email: asOptionalString(body.contactEmail),
    line_id: asOptionalString(body.lineId),
    line_url: asPartnerLineUrl(body.lineUrl),
    maps_url: asPartnerMapsUrl(body.mapsUrl),
    business_hours_text: asOptionalString(body.businessHoursText),
    business_hours_preset_key: asPartnerBusinessHoursPresetKey(
      body.businessHoursPresetKey,
    ),
    is_public: asOptionalBoolean(body.isPublic, false),
    is_featured: asOptionalBoolean(body.isFeatured, false),
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
    verified_notes: asOptionalString(body.verifiedNotes),
    internal_notes: asOptionalString(body.internalNotes),
  };
}

/** Partial payload for UPDATE — only keys present in body are included. */
export function buildPartnerUpdatePayload(body: Record<string, unknown>) {
  const p: Record<string, unknown> = {};

  if ("slug" in body) p.slug = asPartnerSlug(body.slug);
  if ("directoryType" in body)
    p.directory_type = asPartnerDirectoryType(body.directoryType);
  if ("entityType" in body)
    p.entity_type = asPartnerEntityType(body.entityType);
  if ("nameTh" in body) p.name_th = asNonEmptyString(body.nameTh, "nameTh");
  if ("nameEn" in body) p.name_en = asOptionalString(body.nameEn);
  if ("taglineTh" in body) p.tagline_th = asOptionalString(body.taglineTh);
  if ("taglineEn" in body) p.tagline_en = asOptionalString(body.taglineEn);
  if ("descriptionTh" in body)
    p.description_th = asOptionalString(body.descriptionTh);
  if ("descriptionEn" in body)
    p.description_en = asOptionalString(body.descriptionEn);
  if ("mainImageUrl" in body)
    p.main_image_url = asOptionalString(body.mainImageUrl);
  if ("mainCategoryKey" in body)
    p.main_category_key = asOptionalString(body.mainCategoryKey);
  if ("secondaryCategoryKeys" in body) {
    // If directoryType is also in this patch, validate prefix immediately.
    // Otherwise, only normalise (endpoint is responsible for cross-validation).
    const effectiveDirectoryType =
      typeof p.directory_type === "string"
        ? (p.directory_type as "store" | "service" | "contractor")
        : null;
    const effectiveMainKey =
      "main_category_key" in p && typeof p.main_category_key === "string"
        ? p.main_category_key
        : null;
    if (effectiveDirectoryType) {
      p.secondary_category_keys = asPartnerSecondaryCategoryKeys(
        body.secondaryCategoryKeys,
        effectiveDirectoryType,
        effectiveMainKey,
      );
    } else {
      p.secondary_category_keys = asStringArray(body.secondaryCategoryKeys);
    }
  }
  if ("searchKeywords" in body)
    p.search_keywords = asPartnerSearchKeywords(body.searchKeywords);
  if ("serviceAreas" in body)
    p.service_areas = asStringArray(body.serviceAreas);
  if ("contactPhone" in body)
    p.contact_phone = asOptionalString(body.contactPhone);
  if ("contactEmail" in body)
    p.contact_email = asOptionalString(body.contactEmail);
  if ("lineId" in body) p.line_id = asOptionalString(body.lineId);
  if ("lineUrl" in body) p.line_url = asPartnerLineUrl(body.lineUrl);
  if ("mapsUrl" in body) p.maps_url = asPartnerMapsUrl(body.mapsUrl);
  if ("businessHoursText" in body)
    p.business_hours_text = asOptionalString(body.businessHoursText);
  if ("businessHoursPresetKey" in body)
    p.business_hours_preset_key = asPartnerBusinessHoursPresetKey(
      body.businessHoursPresetKey,
    );
  if ("isPublic" in body) p.is_public = asOptionalBoolean(body.isPublic, false);
  if ("isFeatured" in body)
    p.is_featured = asOptionalBoolean(body.isFeatured, false);
  if ("sortOrder" in body)
    p.sort_order = Math.max(0, asNumber(body.sortOrder, 0));
  if ("verifiedNotes" in body)
    p.verified_notes = asOptionalString(body.verifiedNotes);
  if ("internalNotes" in body)
    p.internal_notes = asOptionalString(body.internalNotes);

  // Verification toggle: clearing is_verified must null out verified_at.
  // Setting is_verified=true auto-stamps verified_at unless caller provides one.
  if ("isVerified" in body) {
    const verified = body.isVerified === true;
    p.is_verified = verified;
    if (!verified) {
      // Explicitly unverifying — always clear verified_at regardless of any
      // verifiedAt field in the body (prevents DB constraint violation:
      // CHECK (verified_at IS NULL OR is_verified = TRUE)).
      p.verified_at = null;
    } else if (!("verifiedAt" in body)) {
      p.verified_at = new Date().toISOString();
    }
  }
  // Only apply a caller-supplied verifiedAt when we are NOT simultaneously
  // setting isVerified=false (that branch already forced null above).
  if ("verifiedAt" in body && p.is_verified !== false) {
    p.verified_at = asOptionalString(body.verifiedAt);
  }

  if (Object.keys(p).length === 0) {
    fail422("No updatable fields supplied");
  }

  return p;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Admin list item — lightweight, no private fields, no descriptions. */
export function mapAdminPartnerListItem(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    slug: String(row.slug ?? ""),
    directoryType: String(row.directory_type ?? "") as
      | "store"
      | "service"
      | "contractor",
    entityType: String(row.entity_type ?? "") as "individual" | "organization",
    nameTh: String(row.name_th ?? ""),
    nameEn: str(row.name_en),
    taglineTh: str(row.tagline_th),
    mainImageUrl: str(row.main_image_url),
    mainCategoryKey: str(row.main_category_key),
    secondaryCategoryKeys: Array.isArray(row.secondary_category_keys)
      ? (row.secondary_category_keys as string[])
      : [],
    serviceAreas: Array.isArray(row.service_areas)
      ? (row.service_areas as string[])
      : [],
    businessHoursPresetKey: str(
      row.business_hours_preset_key,
    ) as PartnerBusinessHoursPresetKey | null,
    isVerified: row.is_verified === true,
    isPublic: row.is_public === true,
    isFeatured: row.is_featured === true,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/** Admin detail — full row including private admin-only fields. */
export function mapAdminPartnerDetail(row: Record<string, unknown>) {
  return {
    ...mapAdminPartnerListItem(row),
    taglineEn: str(row.tagline_en),
    descriptionTh: str(row.description_th),
    descriptionEn: str(row.description_en),
    contactPhone: str(row.contact_phone),
    contactEmail: str(row.contact_email),
    lineId: str(row.line_id),
    lineUrl: str(row.line_url),
    mapsUrl: str(row.maps_url),
    businessHoursText: str(row.business_hours_text),
    businessHoursTimezone: String(
      row.business_hours_timezone ?? "Asia/Bangkok",
    ),
    verifiedAt: str(row.verified_at),
    // Admin-only array fields
    searchKeywords: Array.isArray(row.search_keywords)
      ? (row.search_keywords as string[])
      : [],
    // Private admin-only fields
    kycDocuments:
      row.kyc_documents &&
      typeof row.kyc_documents === "object" &&
      !Array.isArray(row.kyc_documents)
        ? (row.kyc_documents as Record<string, unknown>)
        : {},
    verifiedNotes: str(row.verified_notes),
    internalNotes: str(row.internal_notes),
  };
}

/** Public card — no private fields, no descriptions. Safe for public listing. */
export function mapPublicPartnerCard(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    slug: String(row.slug ?? ""),
    directoryType: String(row.directory_type ?? "") as
      | "store"
      | "service"
      | "contractor",
    entityType: String(row.entity_type ?? "") as "individual" | "organization",
    nameTh: String(row.name_th ?? ""),
    nameEn: str(row.name_en),
    taglineTh: str(row.tagline_th),
    taglineEn: str(row.tagline_en),
    mainImageUrl: str(row.main_image_url),
    mainCategoryKey: str(row.main_category_key),
    secondaryCategoryKeys: Array.isArray(row.secondary_category_keys)
      ? (row.secondary_category_keys as string[])
      : [],
    serviceAreas: Array.isArray(row.service_areas)
      ? (row.service_areas as string[])
      : [],
    businessHoursPresetKey: str(
      row.business_hours_preset_key,
    ) as PartnerBusinessHoursPresetKey | null,
    isVerified: row.is_verified === true,
    verifiedAt: str(row.verified_at),
    isFeatured: row.is_featured === true,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/** Public detail — contact + hours added. Still no private fields. */
export function mapPublicPartnerDetail(row: Record<string, unknown>) {
  return {
    ...mapPublicPartnerCard(row),
    descriptionTh: str(row.description_th),
    descriptionEn: str(row.description_en),
    contactPhone: str(row.contact_phone),
    contactEmail: str(row.contact_email),
    lineId: str(row.line_id),
    lineUrl: str(row.line_url),
    mapsUrl: str(row.maps_url),
    businessHoursText: str(row.business_hours_text),
    businessHoursTimezone: String(
      row.business_hours_timezone ?? "Asia/Bangkok",
    ),
  };
}
