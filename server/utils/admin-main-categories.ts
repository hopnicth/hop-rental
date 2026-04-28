import { createError } from "h3";
import {
  asNonEmptyString,
  asNumber,
  asOptionalString,
} from "~~/server/utils/admin-catalog";

export const ADMIN_MAIN_CATEGORY_SELECT =
  "key, label_th, label_en, icon, description_th, description_en, entity_types, is_active, sort_order, created_at, updated_at";

export const MAIN_CATEGORY_ENTITY_TYPES = [
  "product",
  "asset",
  "service",
  "promotion",
  "blog",
  "review",
] as const;

export type MainCategoryEntityType =
  (typeof MAIN_CATEGORY_ENTITY_TYPES)[number];

function fail422(message: string): never {
  throw createError({
    statusCode: 422,
    statusMessage: message,
  });
}

export function asCategoryKey(value: unknown, field: string): string {
  const normalized = asNonEmptyString(value, field)
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  if (!/^[a-z0-9_]+$/.test(normalized)) {
    fail422(
      `${field} must contain only lowercase letters, numbers, or underscores`,
    );
  }

  return normalized;
}

export function asMainCategoryEntityType(
  value: unknown,
): MainCategoryEntityType | null {
  return MAIN_CATEGORY_ENTITY_TYPES.includes(value as MainCategoryEntityType)
    ? (value as MainCategoryEntityType)
    : null;
}

export function asMainCategoryEntityTypes(
  value: unknown,
): MainCategoryEntityType[] {
  const raw = Array.isArray(value) ? value : ["product"];
  const types = raw
    .map((item) => asMainCategoryEntityType(item))
    .filter((item): item is MainCategoryEntityType => item !== null);
  const unique = [...new Set(types)];
  return unique.length > 0 ? unique : ["product"];
}

export function buildMainCategoryPayload(body: Record<string, unknown>) {
  return {
    key: asCategoryKey(body.key, "key"),
    label_th: asNonEmptyString(body.labelTh, "labelTh"),
    label_en: asNonEmptyString(body.labelEn, "labelEn"),
    icon: asOptionalString(body.icon),
    description_th: asOptionalString(body.descriptionTh),
    description_en: asOptionalString(body.descriptionEn),
    entity_types: asMainCategoryEntityTypes(body.entityTypes),
    is_active: body.isActive !== false,
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
  };
}

export function mapAdminMainCategoryItem(row: Record<string, unknown>) {
  return {
    key: String(row.key ?? ""),
    labelTh: String(row.label_th ?? ""),
    labelEn: String(row.label_en ?? ""),
    icon: typeof row.icon === "string" ? row.icon : "",
    descriptionTh:
      typeof row.description_th === "string" ? row.description_th : "",
    descriptionEn:
      typeof row.description_en === "string" ? row.description_en : "",
    entityTypes: asMainCategoryEntityTypes(row.entity_types),
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}
