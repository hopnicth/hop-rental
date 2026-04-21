import type { LocalizedString } from "~/types/locale";

export type RentalAccessStatus = "draft" | "active" | "archived";
export type RentalAccessPricingModel = "daily";
export type RentalServiceCycleUnit = "day" | "week" | "month" | "year";

export interface RentalAccessPricing {
  model: RentalAccessPricingModel;
  currencyCode: string;
  daily: number;
  weekly: number;
  monthly: number;
  deposit: number;
}

export interface RentalAccessRules {
  minDays: number;
  maxDays: number;
  bufferDays: number;
}

export interface RentalAccessServiceCycle {
  value: number;
  unit?: RentalServiceCycleUnit;
  lastServicedAt?: string;
  nextServiceDueAt?: string;
}

export interface RentalAccessMatchedProduct {
  id: string;
  slug: string;
  categoryKey: string;
  name: LocalizedString;
  thumbnail: string;
}

export interface RentalAccess {
  id: string;
  code: string;
  slug: string;
  status: RentalAccessStatus;
  name: LocalizedString;
  description: LocalizedString;
  categories: string[];
  brand?: string;
  thumbnail: string;
  images: string[];
  specSummary: Record<string, unknown>;
  pricing: RentalAccessPricing;
  rentalRules: RentalAccessRules;
  storageLocationCode?: string;
  storageLocationNote?: string;
  serviceCycle: RentalAccessServiceCycle;
  viewCount: number;
  rentalCount: number;
  lastRentedAt?: string;
  sortOrder: number;
  isHidden: boolean;
  matchedProductIds: string[];
  matchedProducts: RentalAccessMatchedProduct[];
  createdAt?: string;
  updatedAt?: string;
}
