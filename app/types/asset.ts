import type { LocalizedString } from "~/types/locale";

export type AssetStatus = "draft" | "active" | "archived";
export type AssetPricingModel = "daily";
export type RentalServiceCycleUnit = "day" | "week" | "month" | "year";

export type AssetDetailBlockDocumentKind =
  | "manual"
  | "catalog"
  | "datasheet"
  | "guide"
  | "report"
  | "other";

export interface AssetDetailBlockImage {
  id: string;
  url: string;
  variants?: { thumbnail?: string; card?: string; large?: string };
  caption?: string;
  altText?: string;
}

export interface AssetDetailBlockDocument {
  id: string;
  url: string;
  kind: AssetDetailBlockDocumentKind;
  title: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface AssetDetailBlock {
  key: string;
  title?: LocalizedString;
  body?: LocalizedString;
  items?: string[];
  images?: AssetDetailBlockImage[];
  documents?: AssetDetailBlockDocument[];
}

export interface AssetPricing {
  model: AssetPricingModel;
  currencyCode: string;
  daily: number;
  weekly: number;
  monthly: number;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  deposit: number;
}

export interface AssetRules {
  minDays: number;
  maxDays: number;
  bufferDays: number;
}

export interface AssetServiceCycle {
  value: number;
  unit?: RentalServiceCycleUnit;
  lastServicedAt?: string;
  nextServiceDueAt?: string;
}

export interface AssetMatchedProduct {
  id: string;
  slug: string;
  categoryKey: string;
  name: LocalizedString;
  thumbnail: string;
}

export interface AssetMatch {
  productId: string;
  matchType: string;
  sortOrder: number;
}

export interface Asset {
  id: string;
  code: string;
  slug: string;
  status: AssetStatus;
  name: LocalizedString;
  description: LocalizedString;
  categories: string[];
  mainCategoryKey?: string;
  tagKeys: string[];
  filterKeys: string[];
  brand?: string;
  thumbnail: string;
  images: string[];
  specSummary: Record<string, unknown>;
  pricing: AssetPricing;
  rentalRules: AssetRules;
  storageLocationCode?: string;
  storageLocationNote?: string;
  serviceCycle: AssetServiceCycle;
  viewCount: number;
  rentalCount: number;
  lastRentedAt?: string;
  sortOrder: number;
  isHidden: boolean;
  matchedProductIds: string[];
  matches: AssetMatch[];
  matchedProducts: AssetMatchedProduct[];
  detailBlocks: AssetDetailBlock[];
  createdAt?: string;
  updatedAt?: string;
}
