/**
 * Shipping pricing configuration.
 *
 * Items are tagged with a `shippingSize` (free / s / m / l / xl). At checkout
 * the cart is converted to "free-units" using SHIPPING_SIZE_IN_FREE_UNITS, then
 * greedily packed from the largest box (xl) down to free remainders. Larger
 * boxes are cheaper per free-unit, so consolidating items can reduce the total
 * shipping cost.
 *
 * Conversion ratios (per requirement):
 *   10 free  = 1 s
 *   5  s     = 1 m
 *   3  m     = 1 l
 *   2  l     = 1 xl
 *
 * Per-box rates (THB):
 *   free = 0, s = 50, m = 100, l = 150, xl = 200
 */

export type ShippingSize = "free" | "s" | "m" | "l" | "xl";

export const SHIPPING_SIZES: readonly ShippingSize[] = [
  "free",
  "s",
  "m",
  "l",
  "xl",
] as const;

export const SHIPPING_RATES: Record<ShippingSize, number> = {
  free: 0,
  s: 50,
  m: 100,
  l: 150,
  xl: 200,
};

/** Each size expressed in the smallest unit ("free"). */
export const SHIPPING_SIZE_IN_FREE_UNITS: Record<ShippingSize, number> = {
  free: 1,
  s: 10, // 10 free = 1 s
  m: 50, // 5 s   = 1 m
  l: 150, // 3 m  = 1 l
  xl: 300, // 2 l  = 1 xl
};

export const DEFAULT_SHIPPING_SIZE: ShippingSize = "s";
