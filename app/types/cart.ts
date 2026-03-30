/** Display fields locked at the time an item enters the cart. */
export interface CartItemDisplaySnapshot {
  /** Display name (snapshot at the time of adding) */
  name: string;
  /** Thumbnail image URL — snapshot for cart display */
  thumbnail: string;
}

/** Money fields locked at the time an item enters the cart. */
export interface CartItemPricingSnapshot {
  /** Unit price at the time of adding (final price after discount) */
  unitPrice: number;
  /** Unit price before discount, kept for pricing explanation/history */
  originalUnitPrice: number;
  /** Percentage discount applied when the item entered the cart */
  discountPercent: number;
}

/**
 * A single item in the cart (sale / consumable items).
 *
 * Product details are snapshotted at add time so the cart UI can render
 * consistently and retain the commercial value that the user saw.
 */
export interface CartItem
  extends CartItemDisplaySnapshot, CartItemPricingSnapshot {
  /** Product or service ID (from catalog) */
  productId: string;
  /** SKU ID of the selected variant */
  skuId: string;
  /** Quantity selected */
  quantity: number;
  /** ISO date string when item was added */
  addedAt: string;
}

/**
 * The whole cart — persisted in localStorage (all users) and
 * mirrored to Supabase `carts` + `cart_items` for logged-in users.
 *
 * `cartId` is a UUID generated once per browser session / device.
 * Customers can share this ID with the sales team for reference.
 */
export interface Cart {
  /** Unique cart identifier — used when contacting sales */
  cartId: string;
  /** Owner's user ID (null for guest carts) */
  userId?: string | null;
  /** Items currently in the cart */
  items: CartItem[];
  /** ISO date string of last update */
  updatedAt: string;
}

/**
 * Guest cart buffer stored in localStorage with a TTL.
 * When the guest logs in, items are merged into the user's cart
 * and the buffer is cleared.
 */
export interface GuestCartBuffer {
  /** Cart items added while not logged in */
  items: CartItem[];
  /** ISO date string — buffer expires after this timestamp */
  expiresAt: string;
}
