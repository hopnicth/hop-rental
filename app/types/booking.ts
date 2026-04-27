import type { RentalBookingStatus } from "~/types/rental-booking";
import type { RentalPricingBreakdown } from "~/utils/rental-pricing";

/** Display fields locked at the time the booking is created. */
export interface BookingDisplaySnapshot {
  /** Display name snapshot at the time of booking */
  productName: string;
  /** Thumbnail image URL — snapshot for cart/review display */
  thumbnail: string;
  /** Selected hub/store display name snapshot */
  hubName: string | null;
}

/** Rental period fields locked at the time the booking is created. */
export interface BookingPeriodSnapshot {
  /** ISO date string — rental start date (YYYY-MM-DD) */
  startDate: string;
  /** Number of rental days */
  numDays: number;
  /** ISO date string — calculated return date (YYYY-MM-DD) */
  returnDate: string;
}

/** Pricing fields locked at the time the booking is created. */
export interface BookingPricingSnapshot {
  /** Daily rental rate at the time of booking */
  dailyRate: number;
  /** Weekly rental rate snapshot (0 when not enabled) */
  weeklyRate: number;
  /** Monthly rental rate snapshot (0 when not enabled) */
  monthlyRate: number;
  /** Total rental cost — sum of breakdown subtotals */
  totalCost: number;
  /** Deposit amount at the time of booking */
  deposit: number;
  /** Tiered duration breakdown used to produce totalCost */
  pricingBreakdown?: RentalPricingBreakdown;
}

/**
 * A single rental booking entry.
 *
 * UI-facing booking snapshot.
 * This must retain the display + pricing values used to explain and
 * calculate the booking shown to the customer, regardless of storage layer.
 */
export interface BookingItem
  extends
    BookingDisplaySnapshot,
    BookingPeriodSnapshot,
    BookingPricingSnapshot {
  /** Unique booking identifier (UUID) */
  bookingId: string;
  /** Product ID being rented */
  productId: string;
  /** SKU ID of the selected variant */
  skuId: string;
  /** Asset ID when the booking is rooted at the asset layer */
  assetId?: string;
  /** Asset business code snapshot */
  assetCode?: string;
  /** Asset slug snapshot */
  assetSlug?: string;
  /** Asset name snapshot */
  assetName?: string;
  /** Asset thumbnail snapshot */
  assetThumbnail?: string;
  /** Flexible asset snapshot blob */
  assetSnapshot?: Record<string, unknown>;
  /** Product attribution snapshot kept during the transition */
  matchedProductId?: string;
  /** Product attribution display snapshot */
  matchedProductName?: string;
  /** Selected hub/store ID for pickup (null = not yet selected) */
  hubId: string | null;
  /** Contact name of the person making the booking */
  bookerName?: string | null;
  /** Contact phone of the person making the booking */
  bookerPhone?: string | null;
  /** Booking status */
  status: BookingStatus;
  /** ISO date string — when booking was created */
  createdAt: string;
}

/**
 * Booking status lifecycle.
 */
export type BookingStatus = RentalBookingStatus;

/**
 * In-memory booking store shared across the UI.
 */
export interface BookingStore {
  /** All booking entries */
  items: BookingItem[];
  /** ISO date string of last update */
  updatedAt: string;
}
