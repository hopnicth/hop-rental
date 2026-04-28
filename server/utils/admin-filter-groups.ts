import { createError } from "h3";
import {
  asNonEmptyString,
  asNumber,
  asOptionalString,
} from "~~/server/utils/admin-catalog";
import { asCategoryKey } from "~~/server/utils/admin-main-categories";

export const FILTER_TYPES = ["checkbox", "dropdown", "number_range"] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

export const MATCH_LOGICS = ["or", "and"] as const;
export type MatchLogic = (typeof MATCH_LOGICS)[number];

export const ADMIN_FILTER_GROUP_SELECT =
  "id, main_category_key, key, label_th, label_en, filter_type, match_logic, spec_key, is_active, sort_order, created_at, updated_at, options:filter_options(id, group_id, key, label_th, label_en, is_active, sort_order, created_at, updated_at)";

export const ADMIN_FILTER_OPTION_SELECT =
  "id, group_id, key, label_th, label_en, is_active, sort_order, created_at, updated_at";

function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

function asEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  const raw = asNonEmptyString(value, field);
  if (!(allowed as readonly string[]).includes(raw)) {
    fail422(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return raw as T;
}

/** Build payload for filter_groups INSERT (key must be supplied — immutable). */
export function buildFilterGroupCreatePayload(body: Record<string, unknown>) {
  const filterType = asEnum(body.filterType, "filterType", FILTER_TYPES);
  const specKey = asOptionalString(body.specKey);

  if (filterType === "number_range" && !specKey) {
    fail422("specKey is required when filterType is number_range");
  }

  return {
    main_category_key: asCategoryKey(body.mainCategoryKey, "mainCategoryKey"),
    key: asCategoryKey(body.key, "key"),
    label_th: asNonEmptyString(body.labelTh, "labelTh"),
    label_en: asNonEmptyString(body.labelEn, "labelEn"),
    filter_type: filterType,
    match_logic: asEnum(body.matchLogic ?? "or", "matchLogic", MATCH_LOGICS),
    spec_key: filterType === "number_range" ? specKey : null,
    is_active: body.isActive !== false,
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
  };
}

/**
 * Build payload for filter_groups UPDATE.
 *
 * Renaming `key` is allowed (super-admin only — guarded at the route level).
 * The DB trigger `filter_groups_resync_filter_keys` rebuilds the denormalized
 * products.filter_keys for every affected product when the key changes.
 */
export function buildFilterGroupUpdatePayload(body: Record<string, unknown>) {
  const filterType = asEnum(body.filterType, "filterType", FILTER_TYPES);
  const specKey = asOptionalString(body.specKey);

  if (filterType === "number_range" && !specKey) {
    fail422("specKey is required when filterType is number_range");
  }

  return {
    main_category_key: asCategoryKey(body.mainCategoryKey, "mainCategoryKey"),
    key: asCategoryKey(body.key, "key"),
    label_th: asNonEmptyString(body.labelTh, "labelTh"),
    label_en: asNonEmptyString(body.labelEn, "labelEn"),
    filter_type: filterType,
    match_logic: asEnum(body.matchLogic ?? "or", "matchLogic", MATCH_LOGICS),
    spec_key: filterType === "number_range" ? specKey : null,
    is_active: body.isActive !== false,
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
  };
}

/** Build payload for filter_options INSERT. */
export function buildFilterOptionCreatePayload(
  groupId: string,
  body: Record<string, unknown>,
) {
  return {
    group_id: groupId,
    key: asCategoryKey(body.key, "key"),
    label_th: asNonEmptyString(body.labelTh, "labelTh"),
    label_en: asNonEmptyString(body.labelEn, "labelEn"),
    is_active: body.isActive !== false,
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
  };
}

/**
 * Build payload for filter_options UPDATE.
 *
 * Renaming `key` is allowed (super-admin only — guarded at the route level).
 * The DB trigger `filter_options_resync_filter_keys` rebuilds the denormalized
 * products.filter_keys for every affected product when the key changes.
 */
export function buildFilterOptionUpdatePayload(body: Record<string, unknown>) {
  return {
    key: asCategoryKey(body.key, "key"),
    label_th: asNonEmptyString(body.labelTh, "labelTh"),
    label_en: asNonEmptyString(body.labelEn, "labelEn"),
    is_active: body.isActive !== false,
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
  };
}

export function mapAdminFilterOption(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    groupId: String(row.group_id ?? ""),
    key: String(row.key ?? ""),
    labelTh: String(row.label_th ?? ""),
    labelEn: String(row.label_en ?? ""),
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export function mapAdminFilterGroup(row: Record<string, unknown>) {
  const rawOptions = Array.isArray(row.options) ? row.options : [];
  const options = rawOptions
    .map((opt) => mapAdminFilterOption(opt as Record<string, unknown>))
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.labelTh.localeCompare(b.labelTh),
    );

  return {
    id: String(row.id ?? ""),
    mainCategoryKey: String(row.main_category_key ?? ""),
    key: String(row.key ?? ""),
    labelTh: String(row.label_th ?? ""),
    labelEn: String(row.label_en ?? ""),
    filterType: String(row.filter_type ?? "checkbox") as FilterType,
    matchLogic: String(row.match_logic ?? "or") as MatchLogic,
    specKey: typeof row.spec_key === "string" ? row.spec_key : null,
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
    options,
  };
}
