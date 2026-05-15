/** Rental booking lifecycle status. */
export type RentalBookingStatus =
  | "draft"
  | "confirmed"
  | "picked_up"
  | "returned"
  | "cancelled"
  | "no_show";

export type RentalDepositPaymentMethod =
  | "cash"
  | "qr_transfer"
  | "bank_transfer"
  | "card"
  | "other";

export type RentalDepositPaymentStatus =
  | "unpaid"
  | "pending_review"
  | "paid"
  | "refunded"
  | "partial_refund";

export type RentalBookingDepositPaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "paid_confirm_failed";

export type RentalDepositRefundStatus =
  | "not_refunded"
  | "pending"
  | "refunded"
  | "forfeited"
  | "not_applicable";

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
  user_id: string | null;
  walk_in_phone?: string | null;
  /** NULL for asset-only bookings (no matched product/SKU). */
  product_id: string | null;
  /** NULL for asset-only bookings (no matched product/SKU). */
  sku_id: string | null;
  asset_id?: string | null;
  asset_snapshot?: Record<string, unknown>;
  matched_product_id?: string | null;
  hub_id: string | null;
  /** Contact name of the person making the booking */
  booker_name?: string | null;
  /** Contact phone of the person making the booking */
  booker_phone?: string | null;
  deposit_paid_amount?: number;
  deposit_payment_method?: RentalDepositPaymentMethod | null;
  deposit_payment_status?: RentalDepositPaymentStatus;
  deposit_refund_status?: RentalDepositRefundStatus;
  deposit_refund_amount?: number;
  deposit_paid_at?: string | null;
  deposit_refunded_at?: string | null;
  deposit_refund_notes?: string | null;
  deposit_notes?: string | null;
  booking_deposit_payment_status?: RentalBookingDepositPaymentStatus;
  booking_deposit_paid_amount?: number;
  booking_deposit_paid_at?: string | null;
  booking_deposit_payment_attempt_id?: string | null;
  booking_deposit_policy_version?: string | null;
  booking_deposit_terms_accepted_at?: string | null;
  booking_deposit_terms_version?: string | null;
  booking_deposit_confirm_failed_at?: string | null;
  booking_deposit_confirm_failure_reason?: string | null;
  status: RentalBookingStatus;
  created_at: string;
  updated_at: string;
}

/** Insert payload for a future DB-backed rental booking flow. */
export type RentalBookingInsert = Omit<
  RentalBooking,
  "id" | "created_at" | "updated_at"
>;
