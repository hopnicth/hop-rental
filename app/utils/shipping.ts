/**
 * Shipping cost calculation — greedy bin-packing in free-unit space.
 *
 * Algorithm:
 *   1. Convert each line (size × quantity) to free-units.
 *   2. Pack the total free-units into the largest boxes first (xl → free).
 *   3. Sum each bin × its rate.
 *
 * Pure functions — safe to import in both client and server.
 */
import {
  DEFAULT_SHIPPING_SIZE,
  SHIPPING_RATES,
  SHIPPING_SIZE_IN_FREE_UNITS,
  type ShippingSize,
} from "~/config/shipping";

export interface ShippingLine {
  shippingSize?: ShippingSize | null;
  quantity: number;
}

export interface ShippingBreakdown {
  xl: number;
  l: number;
  m: number;
  s: number;
  free: number;
  /** Total free-units across all lines, for audit / display. */
  totalFreeUnits: number;
}

export interface ShippingResult {
  cost: number;
  breakdown: ShippingBreakdown;
}

const EMPTY_BREAKDOWN: ShippingBreakdown = {
  xl: 0,
  l: 0,
  m: 0,
  s: 0,
  free: 0,
  totalFreeUnits: 0,
};

export function resolveShippingSize(
  size: ShippingSize | null | undefined,
): ShippingSize {
  if (size === "free" || size === "s" || size === "m" || size === "l" || size === "xl") {
    return size;
  }
  return DEFAULT_SHIPPING_SIZE;
}

export function toFreeUnits(
  size: ShippingSize | null | undefined,
  quantity: number,
): number {
  const safeSize = resolveShippingSize(size);
  const safeQty = Math.max(0, Math.floor(Number(quantity) || 0));
  return SHIPPING_SIZE_IN_FREE_UNITS[safeSize] * safeQty;
}

/**
 * Calculate shipping cost for a list of order lines.
 * Returns 0 cost + zero-breakdown when no lines.
 */
export function calculateShipping(lines: ShippingLine[]): ShippingResult {
  const totalFreeUnits = lines.reduce(
    (sum, line) => sum + toFreeUnits(line.shippingSize, line.quantity),
    0,
  );

  if (totalFreeUnits <= 0) {
    return { cost: 0, breakdown: { ...EMPTY_BREAKDOWN } };
  }

  let remaining = totalFreeUnits;
  const xl = Math.floor(remaining / SHIPPING_SIZE_IN_FREE_UNITS.xl);
  remaining -= xl * SHIPPING_SIZE_IN_FREE_UNITS.xl;
  const l = Math.floor(remaining / SHIPPING_SIZE_IN_FREE_UNITS.l);
  remaining -= l * SHIPPING_SIZE_IN_FREE_UNITS.l;
  const m = Math.floor(remaining / SHIPPING_SIZE_IN_FREE_UNITS.m);
  remaining -= m * SHIPPING_SIZE_IN_FREE_UNITS.m;
  const s = Math.floor(remaining / SHIPPING_SIZE_IN_FREE_UNITS.s);
  remaining -= s * SHIPPING_SIZE_IN_FREE_UNITS.s;
  const free = remaining;

  const cost =
    xl * SHIPPING_RATES.xl +
    l * SHIPPING_RATES.l +
    m * SHIPPING_RATES.m +
    s * SHIPPING_RATES.s +
    free * SHIPPING_RATES.free;

  return {
    cost,
    breakdown: { xl, l, m, s, free, totalFreeUnits },
  };
}

export function emptyShippingBreakdown(): ShippingBreakdown {
  return { ...EMPTY_BREAKDOWN };
}
