import type { LocalizedString } from "./locale";

/**
 * A physical store / hub / branch where customers can pick up rental equipment.
 *
 * Referenced by:
 * - `RentalConfig.storeLocationIds` — which hubs stock a product
 * - `BookingItem.hubId` — which hub the customer chose for pickup
 */
export interface StoreLocation {
  /** Unique identifier (e.g. "store-001") */
  id: string;
  /** Display name — localized */
  name: LocalizedString;
  /** Short label for dropdown / badge (e.g. "BKK") */
  shortCode: string;
  /** Full address — localized */
  address: LocalizedString;
  /** Phone number */
  phone: string;
  /** Operating hours text — localized */
  operatingHours: LocalizedString;
  /** Google Maps embed / link URL */
  mapUrl: string;
  /** Whether this hub is currently active */
  isActive: boolean;
}

