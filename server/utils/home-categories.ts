import { createError } from "h3";
import {
  asNonEmptyString,
  asNumber,
  asOptionalString,
} from "~~/server/utils/admin-catalog";

export const HOME_CATEGORY_OPTION_SELECT =
  "id, group_id, option_key, label_th, label_en, label_cn, label_jp, search_query_th, search_query_en, search_query_cn, search_query_jp, sort_order, is_active, created_at, updated_at";

export const HOME_CATEGORY_GROUP_SELECT = `id, main_category_key, label_th, label_en, label_cn, label_jp, icon, sort_order, is_active, created_at, updated_at, options:home_category_options(${HOME_CATEGORY_OPTION_SELECT})`;

function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

function normalizeKey(value: unknown, field: string): string {
  const raw = asNonEmptyString(value, field);
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) fail422(`${field} is required`);
  return key;
}

export function buildHomeCategoryGroupPayload(body: Record<string, unknown>) {
  return {
    main_category_key: normalizeKey(body.mainCategoryKey, "mainCategoryKey"),
    label_th: asNonEmptyString(body.labelTh, "labelTh"),
    label_en: asNonEmptyString(body.labelEn, "labelEn"),
    label_cn: asOptionalString(body.labelCn),
    label_jp: asOptionalString(body.labelJp),
    icon: asOptionalString(body.icon),
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
    is_active: body.isActive !== false,
  };
}

export function buildHomeCategoryOptionPayload(body: Record<string, unknown>) {
  return {
    option_key: normalizeKey(body.optionKey, "optionKey"),
    label_th: asNonEmptyString(body.labelTh, "labelTh"),
    label_en: asNonEmptyString(body.labelEn, "labelEn"),
    label_cn: asOptionalString(body.labelCn),
    label_jp: asOptionalString(body.labelJp),
    search_query_th: asOptionalString(body.searchQueryTh),
    search_query_en: asOptionalString(body.searchQueryEn),
    search_query_cn: asOptionalString(body.searchQueryCn),
    search_query_jp: asOptionalString(body.searchQueryJp),
    sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
    is_active: body.isActive !== false,
  };
}

export function mapHomeCategoryOption(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    groupId: String(row.group_id ?? ""),
    optionKey: String(row.option_key ?? ""),
    labelTh: String(row.label_th ?? ""),
    labelEn: String(row.label_en ?? ""),
    labelCn: typeof row.label_cn === "string" ? row.label_cn : "",
    labelJp: typeof row.label_jp === "string" ? row.label_jp : "",
    searchQueryTh:
      typeof row.search_query_th === "string" ? row.search_query_th : "",
    searchQueryEn:
      typeof row.search_query_en === "string" ? row.search_query_en : "",
    searchQueryCn:
      typeof row.search_query_cn === "string" ? row.search_query_cn : "",
    searchQueryJp:
      typeof row.search_query_jp === "string" ? row.search_query_jp : "",
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
  };
}

export function mapHomeCategoryGroup(row: Record<string, unknown>) {
  const options = Array.isArray(row.options) ? row.options : [];
  return {
    id: String(row.id ?? ""),
    mainCategoryKey: String(row.main_category_key ?? ""),
    labelTh: String(row.label_th ?? ""),
    labelEn: String(row.label_en ?? ""),
    labelCn: typeof row.label_cn === "string" ? row.label_cn : "",
    labelJp: typeof row.label_jp === "string" ? row.label_jp : "",
    icon: typeof row.icon === "string" ? row.icon : "",
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
    options: options
      .map((opt) => mapHomeCategoryOption(opt as Record<string, unknown>))
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.labelTh.localeCompare(b.labelTh),
      ),
  };
}
