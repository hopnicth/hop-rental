/**
 * A single item in the cart.
 *
 * In the future, product details will come from the database.
 * For now we store minimal info needed by the UI.
 */
export interface CartItem {
  /** Product or service ID (from DB) */
  productId: string;
  /** Display name (snapshot at the time of adding) */
  name: string;
  /** Quantity selected */
  quantity: number;
  /** ISO date string when item was added */
  addedAt: string;
}

/**
 * The whole cart stored in localStorage.
 *
 * `cartId` is a UUID generated once per browser session / device.
 * Customers can share this ID with the sales team for reference.
 */
export interface Cart {
  /** Unique cart identifier — used when contacting sales */
  cartId: string;
  /** Items currently in the cart */
  items: CartItem[];
  /** ISO date string of last update */
  updatedAt: string;
}

