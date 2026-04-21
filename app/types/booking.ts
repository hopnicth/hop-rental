import type { RentalBookingStatus } from "~/types/rental-booking";

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
  /** Total rental cost (dailyRate × numDays) */
  totalCost: number;
  /** Deposit amount at the time of booking */
  deposit: number;
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
  /** Rental access ID when the booking is rooted at the rental access layer */
  rentalAccessId?: string;
  /** Rental access business code snapshot */
  rentalAccessCode?: string;
  /** Rental access slug snapshot */
  rentalAccessSlug?: string;
  /** Rental access name snapshot */
  rentalAccessName?: string;
  /** Rental access thumbnail snapshot */
  rentalAccessThumbnail?: string;
  /** Flexible rental access snapshot blob */
  rentalAccessSnapshot?: Record<string, unknown>;
  /** Product attribution snapshot kept during the transition */
  matchedProductId?: string;
  /** Product attribution display snapshot */
  matchedProductName?: string;
  /** Selected hub/store ID for pickup (null = not yet selected) */
  hubId: string | null;
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
