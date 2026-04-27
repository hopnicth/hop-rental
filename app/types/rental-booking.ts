/** Rental booking lifecycle status. */
export type RentalBookingStatus = "draft" | "confirmed" | "cancelled";

/** Current rental pricing calculation model kept with the booking snapshot. */
export type RentalPricingModel = "daily";

/** Persisted shape of the tiered pricing breakdown column. */
export interface RentalPricingBreakdownLineRow {
  unit: "month" | "week" | "day";
  count: number;
  rate: number;
  subtotal: number;
}

export interface RentalPricingBreakdownRow {
  totalDays: number;
  currencyCode: string;
  lines: RentalPricingBreakdownLineRow[];
  total: number;
}

/** Display fields preserved with the DB booking row. */
export interface RentalBookingDisplaySnapshot {
  product_name: string;
  thumbnail: string;
  hub_name: string | null;
  asset_code?: string | null;
  asset_slug?: string | null;
  asset_name?: string | null;
  asset_thumbnail?: string | null;
  matched_product_name?: string | null;
}

/** Rental period fields preserved with the DB booking row. */
export interface RentalBookingPeriodSnapshot {
  start_date: string;
  end_date: string;
  rental_days: number;
}

/** Monetary fields preserved with the DB booking row. */
export interface RentalBookingPricingSnapshot {
  pricing_model: RentalPricingModel;
  currency_code: string;
  daily_rate: number;
  weekly_rate: number;
  monthly_rate: number;
  rental_total: number;
  deposit_amount: number;
  pricing_breakdown: RentalPricingBreakdownRow | Record<string, never>;
}

/**
 * DB-oriented rental booking record.
 * Separate from the UI/localStorage booking snapshot type.
 *
 * This record should preserve the user-visible display snapshot and the
 * monetary inputs used to calculate the booking, so later catalog changes do
 * not rewrite historical booking meaning.
 */
export interface RentalBooking
  extends
    RentalBookingDisplaySnapshot,
    RentalBookingPeriodSnapshot,
    RentalBookingPricingSnapshot {
  id: string;
  user_id: string;
  /** NULL for asset-only bookings (no matched product/SKU). */
  product_id: string | null;
  /** NULL for asset-only bookings (no matched product/SKU). */
  sku_id: string | null;
  asset_id?: string | null;
  asset_snapshot?: Record<string, unknown>;
  matched_product_id?: string | null;
  hub_id: string | null;
  status: RentalBookingStatus;
  created_at: string;
  updated_at: string;
}

/** Insert payload for a future DB-backed rental booking flow. */
export type RentalBookingInsert = Omit<
  RentalBooking,
  "id" | "created_at" | "updated_at"
>;
