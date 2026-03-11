/**
 * A single rental booking entry.
 *
 * Stored in localStorage for now — will sync to server in the future.
 */
export interface BookingItem {
  /** Unique booking identifier (UUID) */
  bookingId: string;
  /** Product ID being rented */
  productId: string;
  /** SKU ID of the selected variant */
  skuId: string;
  /** Display name snapshot at the time of booking */
  productName: string;
  /** Thumbnail image URL — snapshot for cart display */
  thumbnail: string;
  /** ISO date string — rental start date (YYYY-MM-DD) */
  startDate: string;
  /** Number of rental days */
  numDays: number;
  /** ISO date string — calculated return date (YYYY-MM-DD) */
  returnDate: string;
  /** Daily rental rate at the time of booking */
  dailyRate: number;
  /** Total rental cost (dailyRate × numDays) */
  totalCost: number;
  /** Deposit amount at the time of booking */
  deposit: number;
  /** Selected hub/store ID for pickup (null = not yet selected) */
  hubId: string | null;
  /** Selected hub/store display name snapshot */
  hubName: string | null;
  /** Booking status */
  status: BookingStatus;
  /** ISO date string — when booking was created */
  createdAt: string;
}

/**
 * Booking status lifecycle.
 */
export type BookingStatus = "draft" | "confirmed" | "cancelled";

/**
 * The whole bookings store persisted in localStorage.
 */
export interface BookingStore {
  /** All booking entries */
  items: BookingItem[];
  /** ISO date string of last update */
  updatedAt: string;
}
