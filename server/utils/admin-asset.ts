import { createError } from "h3";

export const ADMIN_ASSET_LIST_SELECT =
  "id, code, slug, status, name_th, name_en, name_cn, name_jp, brand, thumbnail_url, main_category_key, tag_keys, category_keys, search_keywords, daily_rate, weekly_rate, monthly_rate, daily_enabled, weekly_enabled, monthly_enabled, deposit_amount, currency_code, min_rental_days, max_rental_days, buffer_days, storage_location_code, storage_branch_id, storage_inventory_id, is_hidden, sort_order, updated_at, matches:asset_matches(product_id)";

export const ADMIN_ASSET_LIST_SELECT_LEGACY =
  "id, code, slug, status, name_th, name_en, name_cn, name_jp, brand, thumbnail_url, main_category_key, tag_keys, category_keys, daily_rate, weekly_rate, monthly_rate, daily_enabled, weekly_enabled, monthly_enabled, deposit_amount, currency_code, min_rental_days, max_rental_days, buffer_days, storage_location_code, storage_branch_id, storage_inventory_id, is_hidden, sort_order, updated_at, matches:asset_matches(product_id)";

export const ADMIN_ASSET_DETAIL_SELECT =
  "id, code, slug, status, name_th, name_en, name_cn, name_jp, description_th, description_en, description_cn, description_jp, main_category_key, tag_keys, category_keys, search_keywords, brand, thumbnail_url, image_urls, spec_summary, detail_blocks, pricing_model, currency_code, daily_rate, weekly_rate, monthly_rate, daily_enabled, weekly_enabled, monthly_enabled, deposit_amount, min_rental_days, max_rental_days, buffer_days, storage_location_code, storage_location_note, storage_branch_id, storage_inventory_id, service_cycle_value, service_cycle_unit, last_serviced_at, next_service_due_at, view_count, rental_count, last_rented_at, sort_order, is_hidden, created_at, updated_at";

export const ADMIN_ASSET_DETAIL_SELECT_LEGACY =
  "id, code, slug, status, name_th, name_en, name_cn, name_jp, description_th, description_en, description_cn, description_jp, main_category_key, tag_keys, category_keys, brand, thumbnail_url, image_urls, spec_summary, detail_blocks, pricing_model, currency_code, daily_rate, weekly_rate, monthly_rate, daily_enabled, weekly_enabled, monthly_enabled, deposit_amount, min_rental_days, max_rental_days, buffer_days, storage_location_code, storage_location_note, storage_branch_id, storage_inventory_id, service_cycle_value, service_cycle_unit, last_serviced_at, next_service_due_at, view_count, rental_count, last_rented_at, sort_order, is_hidden, created_at, updated_at";

export function isMissingAssetSearchKeywordsColumn(
  error:
    | {
        code?: string | null;
        message?: string | null;
      }
    | null
    | undefined,
) {
  return (
    error?.code === "42703" ||
    error?.message?.includes("assets.search_keywords") === true ||
    error?.message?.includes("search_keywords") === true
  );
}

export function stripAssetSearchKeywords(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  delete next.search_keywords;
  return next;
}

const DOCUMENT_KINDS = new Set([
  "manual",
  "catalog",
  "datasheet",
  "guide",
  "report",
  "other",
]);

const LOCALE_KEYS = ["th", "en", "cn", "jp"] as const;

function normalizeLocalized(
  value: unknown,
  field: string,
): Record<string, string> | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    fail422(`${field} must be a localized object`);
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of LOCALE_KEYS) {
    const entry = source[key];
    if (typeof entry === "string" && entry.length > 0) {
      result[key] = entry;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function normalizeBlockImage(item: unknown, index: number) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    fail422(`detailBlocks.images[${index}] must be an object`);
  }
  const raw = item as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) fail422(`detailBlocks.images[${index}].id is required`);
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url) fail422(`detailBlocks.images[${index}].url is required`);
  const variantsRaw =
    raw.variants &&
    typeof raw.variants === "object" &&
    !Array.isArray(raw.variants)
      ? (raw.variants as Record<string, unknown>)
      : null;
  const variants = variantsRaw
    ? Object.fromEntries(
        Object.entries(variantsRaw).filter(
          ([, v]) => typeof v === "string" && v.length > 0,
        ),
      )
    : undefined;
  const caption =
    typeof raw.caption === "string" && raw.caption.trim().length > 0
      ? raw.caption.trim()
      : undefined;
  const altText =
    typeof raw.altText === "string" && raw.altText.trim().length > 0
      ? raw.altText.trim()
      : undefined;
  return {
    id,
    url,
    ...(variants && Object.keys(variants).length > 0 ? { variants } : {}),
    ...(caption ? { caption } : {}),
    ...(altText ? { altText } : {}),
  };
}

function normalizeBlockDocument(item: unknown, index: number) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    fail422(`detailBlocks.documents[${index}] must be an object`);
  }
  const raw = item as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) fail422(`detailBlocks.documents[${index}].id is required`);
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url) fail422(`detailBlocks.documents[${index}].url is required`);
  const kindRaw = typeof raw.kind === "string" ? raw.kind.trim() : "other";
  const kind = DOCUMENT_KINDS.has(kindRaw) ? kindRaw : "other";
  const title =
    typeof raw.title === "string" && raw.title.trim().length > 0
      ? raw.title.trim()
      : `Document ${index + 1}`;
  const filename =
    typeof raw.filename === "string" && raw.filename.trim().length > 0
      ? raw.filename.trim()
      : undefined;
  const mimeType =
    typeof raw.mimeType === "string" && raw.mimeType.trim().length > 0
      ? raw.mimeType.trim()
      : undefined;
  const sizeBytes =
    typeof raw.sizeBytes === "number" && Number.isFinite(raw.sizeBytes)
      ? raw.sizeBytes
      : undefined;
  return {
    id,
    url,
    kind,
    title,
    ...(filename ? { filename } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(sizeBytes != null ? { sizeBytes } : {}),
  };
}

export function normalizeAssetDetailBlocks(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail422("detailBlocks must be a JSON array");
  const usedKeys = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      fail422(`detailBlocks[${index}] must be an object`);
    }
    const raw = entry as Record<string, unknown>;
    const rawKey =
      typeof raw.key === "string" && raw.key.trim().length > 0
        ? raw.key.trim()
        : `block-${index + 1}`;
    let key = rawKey;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${rawKey}-${suffix++}`;
    usedKeys.add(key);
    const title = normalizeLocalized(raw.title, `detailBlocks[${index}].title`);
    const body = normalizeLocalized(raw.body, `detailBlocks[${index}].body`);
    const items = Array.isArray(raw.items)
      ? raw.items
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0)
      : [];
    const images = Array.isArray(raw.images)
      ? raw.images.map((img, i) => normalizeBlockImage(img, i))
      : [];
    const documents = Array.isArray(raw.documents)
      ? raw.documents.map((doc, i) => normalizeBlockDocument(doc, i))
      : [];
    return {
      key,
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
      ...(items.length > 0 ? { items } : {}),
      ...(images.length > 0 ? { images } : {}),
      ...(documents.length > 0 ? { documents } : {}),
    };
  });
}

const SERVICE_CYCLE_UNITS = new Set(["day", "week", "month", "year"]);
const STATUS_VALUES = new Set(["draft", "active", "archived"]);

function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail422(`${field} is required`);
  }
  return (value as string).trim();
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    fail422("specSummary must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function asOptionalDate(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string")
    fail422(`${field} must be a YYYY-MM-DD string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed))
    fail422(`${field} must be a YYYY-MM-DD string`);
  return trimmed;
}

function asServiceCycleUnit(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (!SERVICE_CYCLE_UNITS.has(trimmed))
    fail422("serviceCycleUnit must be one of day|week|month|year");
  return trimmed;
}

export type AssetPayloadMode = "create" | "update";

export function buildAssetPayload(
  body: Record<string, unknown>,
  mode: AssetPayloadMode,
): Record<string, unknown> {
  const required = mode === "create";
  const payload: Record<string, unknown> = {};

  const setIf = <T>(key: string, value: T | undefined) => {
    if (value !== undefined) payload[key] = value;
  };

  if (required || body.code !== undefined)
    payload.code = asNonEmptyString(body.code, "code");
  if (required || body.slug !== undefined)
    payload.slug = asNonEmptyString(body.slug, "slug");
  if (required || body.nameTh !== undefined)
    payload.name_th = asNonEmptyString(body.nameTh, "nameTh");
  if (required || body.nameEn !== undefined)
    payload.name_en = asNonEmptyString(body.nameEn, "nameEn");
  if (required || body.descriptionTh !== undefined)
    payload.description_th = asNonEmptyString(
      body.descriptionTh,
      "descriptionTh",
    );
  if (required || body.descriptionEn !== undefined)
    payload.description_en = asNonEmptyString(
      body.descriptionEn,
      "descriptionEn",
    );

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUS_VALUES.has(body.status))
      fail422("status must be one of draft|active|archived");
    payload.status = body.status;
  } else if (required) {
    payload.status = "draft";
  }

  if (body.nameCn !== undefined)
    setIf("name_cn", asOptionalString(body.nameCn));
  if (body.nameJp !== undefined)
    setIf("name_jp", asOptionalString(body.nameJp));
  if (body.descriptionCn !== undefined)
    setIf("description_cn", asOptionalString(body.descriptionCn));
  if (body.descriptionJp !== undefined)
    setIf("description_jp", asOptionalString(body.descriptionJp));
  if (body.brand !== undefined) setIf("brand", asOptionalString(body.brand));
  if (body.thumbnailUrl !== undefined)
    setIf("thumbnail_url", asOptionalString(body.thumbnailUrl));
  if (body.storageLocationCode !== undefined)
    setIf("storage_location_code", asOptionalString(body.storageLocationCode));
  if (body.storageLocationNote !== undefined)
    setIf("storage_location_note", asOptionalString(body.storageLocationNote));
  if (body.storageBranchId !== undefined)
    setIf("storage_branch_id", asOptionalString(body.storageBranchId));
  if (body.storageInventoryId !== undefined)
    setIf("storage_inventory_id", asOptionalString(body.storageInventoryId));
  if (body.lastServicedAt !== undefined)
    setIf(
      "last_serviced_at",
      asOptionalDate(body.lastServicedAt, "lastServicedAt"),
    );
  if (body.nextServiceDueAt !== undefined)
    setIf(
      "next_service_due_at",
      asOptionalDate(body.nextServiceDueAt, "nextServiceDueAt"),
    );

  if (body.mainCategoryKey !== undefined)
    setIf("main_category_key", asOptionalString(body.mainCategoryKey));
  if (body.tagKeys !== undefined)
    payload.tag_keys = asStringArray(body.tagKeys);
  if (body.categoryKeys !== undefined)
    payload.category_keys = asStringArray(body.categoryKeys);
  if (body.searchKeywords !== undefined)
    payload.search_keywords = asStringArray(body.searchKeywords);
  if (body.imageUrls !== undefined)
    payload.image_urls = asStringArray(body.imageUrls);
  if (body.specSummary !== undefined)
    payload.spec_summary = asJsonObject(body.specSummary);
  if (body.detailBlocks !== undefined)
    payload.detail_blocks = normalizeAssetDetailBlocks(body.detailBlocks);

  if (body.dailyRate !== undefined)
    payload.daily_rate = Math.max(0, asNumber(body.dailyRate, 0));
  if (body.weeklyRate !== undefined)
    payload.weekly_rate = Math.max(0, asNumber(body.weeklyRate, 0));
  if (body.monthlyRate !== undefined)
    payload.monthly_rate = Math.max(0, asNumber(body.monthlyRate, 0));
  if (body.dailyEnabled !== undefined)
    payload.daily_enabled = body.dailyEnabled === true;
  if (body.weeklyEnabled !== undefined)
    payload.weekly_enabled = body.weeklyEnabled === true;
  if (body.monthlyEnabled !== undefined)
    payload.monthly_enabled = body.monthlyEnabled === true;
  if (body.depositAmount !== undefined)
    payload.deposit_amount = Math.max(0, asNumber(body.depositAmount, 0));
  if (body.minRentalDays !== undefined)
    payload.min_rental_days = Math.max(1, asNumber(body.minRentalDays, 1));
  if (body.maxRentalDays !== undefined)
    payload.max_rental_days = Math.max(0, asNumber(body.maxRentalDays, 0));
  if (body.bufferDays !== undefined)
    payload.buffer_days = Math.max(0, asNumber(body.bufferDays, 0));
  if (body.sortOrder !== undefined)
    payload.sort_order = asNumber(body.sortOrder, 0);
  if (body.isHidden !== undefined) payload.is_hidden = body.isHidden === true;

  if (body.serviceCycleValue !== undefined)
    payload.service_cycle_value = Math.max(
      0,
      asNumber(body.serviceCycleValue, 0),
    );
  if (body.serviceCycleUnit !== undefined)
    payload.service_cycle_unit = asServiceCycleUnit(body.serviceCycleUnit);

  const minDays =
    typeof payload.min_rental_days === "number"
      ? payload.min_rental_days
      : null;
  const maxDays =
    typeof payload.max_rental_days === "number"
      ? payload.max_rental_days
      : null;
  if (minDays != null && maxDays != null && maxDays > 0 && maxDays < minDays) {
    fail422("maxRentalDays must be 0 or greater than minRentalDays");
  }

  const cycleValue =
    typeof payload.service_cycle_value === "number"
      ? payload.service_cycle_value
      : null;
  const cycleUnit =
    typeof payload.service_cycle_unit === "string"
      ? payload.service_cycle_unit
      : payload.service_cycle_unit === null
        ? null
        : undefined;
  if (cycleValue != null && cycleUnit !== undefined) {
    if (cycleValue === 0 && cycleUnit !== null) {
      payload.service_cycle_unit = null;
    } else if (cycleValue > 0 && cycleUnit === null) {
      fail422("serviceCycleUnit is required when serviceCycleValue > 0");
    }
  }

  return payload;
}

export function mapAssetListItem(row: Record<string, unknown>) {
  const matches = Array.isArray(row.matches) ? row.matches : [];
  return {
    id: row.id as string,
    code: row.code as string,
    slug: row.slug as string,
    status: row.status as string,
    nameTh: (row.name_th as string) ?? "",
    nameEn: (row.name_en as string) ?? "",
    nameCn: (row.name_cn as string) ?? "",
    nameJp: (row.name_jp as string) ?? "",
    brand: (row.brand as string) ?? "",
    thumbnailUrl: (row.thumbnail_url as string) ?? "",
    mainCategoryKey: (row.main_category_key as string) ?? "",
    tagKeys: Array.isArray(row.tag_keys) ? (row.tag_keys as string[]) : [],
    categoryKeys: Array.isArray(row.category_keys)
      ? (row.category_keys as string[])
      : [],
    searchKeywords: Array.isArray(row.search_keywords)
      ? (row.search_keywords as string[])
      : [],
    dailyRate: Number(row.daily_rate ?? 0),
    weeklyRate: Number(row.weekly_rate ?? 0),
    monthlyRate: Number(row.monthly_rate ?? 0),
    dailyEnabled: row.daily_enabled !== false,
    weeklyEnabled: row.weekly_enabled !== false,
    monthlyEnabled: row.monthly_enabled !== false,
    depositAmount: Number(row.deposit_amount ?? 0),
    currencyCode: (row.currency_code as string) ?? "THB",
    minRentalDays: Number(row.min_rental_days ?? 1),
    maxRentalDays: Number(row.max_rental_days ?? 0),
    bufferDays: Number(row.buffer_days ?? 0),
    storageLocationCode: (row.storage_location_code as string) ?? "",
    storageBranchId: (row.storage_branch_id as string) ?? "",
    storageInventoryId: (row.storage_inventory_id as string) ?? "",
    isHidden: row.is_hidden === true,
    sortOrder: Number(row.sort_order ?? 0),
    updatedAt: row.updated_at as string | undefined,
    matchCount: matches.length,
  };
}

export function mapAssetDetail(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    code: row.code as string,
    slug: row.slug as string,
    status: row.status as string,
    nameTh: (row.name_th as string) ?? "",
    nameEn: (row.name_en as string) ?? "",
    nameCn: (row.name_cn as string) ?? "",
    nameJp: (row.name_jp as string) ?? "",
    descriptionTh: (row.description_th as string) ?? "",
    descriptionEn: (row.description_en as string) ?? "",
    descriptionCn: (row.description_cn as string) ?? "",
    descriptionJp: (row.description_jp as string) ?? "",
    mainCategoryKey: (row.main_category_key as string) ?? "",
    tagKeys: Array.isArray(row.tag_keys) ? (row.tag_keys as string[]) : [],
    categoryKeys: Array.isArray(row.category_keys)
      ? (row.category_keys as string[])
      : [],
    searchKeywords: Array.isArray(row.search_keywords)
      ? (row.search_keywords as string[])
      : [],
    brand: (row.brand as string) ?? "",
    thumbnailUrl: (row.thumbnail_url as string) ?? "",
    imageUrls: Array.isArray(row.image_urls)
      ? (row.image_urls as string[])
      : [],
    specSummary:
      row.spec_summary &&
      typeof row.spec_summary === "object" &&
      !Array.isArray(row.spec_summary)
        ? (row.spec_summary as Record<string, unknown>)
        : {},
    detailBlocks: Array.isArray(row.detail_blocks)
      ? (row.detail_blocks as Record<string, unknown>[])
      : [],
    pricingModel: (row.pricing_model as string) ?? "daily",
    currencyCode: (row.currency_code as string) ?? "THB",
    dailyRate: Number(row.daily_rate ?? 0),
    weeklyRate: Number(row.weekly_rate ?? 0),
    monthlyRate: Number(row.monthly_rate ?? 0),
    dailyEnabled: row.daily_enabled !== false,
    weeklyEnabled: row.weekly_enabled !== false,
    monthlyEnabled: row.monthly_enabled !== false,
    depositAmount: Number(row.deposit_amount ?? 0),
    minRentalDays: Number(row.min_rental_days ?? 1),
    maxRentalDays: Number(row.max_rental_days ?? 0),
    bufferDays: Number(row.buffer_days ?? 0),
    storageLocationCode: (row.storage_location_code as string) ?? "",
    storageLocationNote: (row.storage_location_note as string) ?? "",
    storageBranchId: (row.storage_branch_id as string) ?? "",
    storageInventoryId: (row.storage_inventory_id as string) ?? "",
    serviceCycleValue: Number(row.service_cycle_value ?? 0),
    serviceCycleUnit: (row.service_cycle_unit as string) ?? "",
    lastServicedAt: (row.last_serviced_at as string) ?? "",
    nextServiceDueAt: (row.next_service_due_at as string) ?? "",
    viewCount: Number(row.view_count ?? 0),
    rentalCount: Number(row.rental_count ?? 0),
    lastRentedAt: (row.last_rented_at as string) ?? "",
    sortOrder: Number(row.sort_order ?? 0),
    isHidden: row.is_hidden === true,
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  };
}
