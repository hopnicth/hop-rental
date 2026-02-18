/**
 * Main category — hardcoded, changed only by developers.
 * Each main category has a unique `key` used to relate with sub-categories.
 */
export interface MainCategory {
  /** Unique identifier, e.g. "safety_equipment" */
  key: string;
  /** i18n translation key, e.g. "categories.main.safetyEquipment" */
  labelKey: string;
  /** Icon name (Boxicons) */
  icon?: string;
}

/**
 * Sub-category — will come from database in the future.
 * Currently served from mock data.
 */
export interface SubCategory {
  /** Unique identifier */
  id: string;
  /** References MainCategory.key */
  mainCategoryKey: string;
  /** i18n translation key, e.g. "categories.sub.highWork" */
  labelKey: string;
}

/**
 * A single category selection — one main category paired with its chosen sub-category.
 */
export interface CategorySelection {
  mainCategoryKey: string;
  subCategoryId: string;
}

/**
 * Payload sent to the API when user clicks Search.
 */
export interface CategorySearchPayload {
  selections: CategorySelection[];
}

/**
 * A single result item returned from the search API.
 * Placeholder — adjust fields when real API is ready.
 */
export interface CategorySearchResult {
  /** Product or item id */
  id: string;
  /** Display name */
  name: string;
  /** Which main category this result belongs to */
  mainCategoryKey: string;
  /** Which sub-category this result belongs to */
  subCategoryId: string;
}
