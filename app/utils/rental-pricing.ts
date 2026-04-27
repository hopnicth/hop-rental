/**
 * Tiered rental pricing utilities.
 *
 * The rental cost for a given number of days is decomposed greedily into
 * months → weeks → days using fixed conversion constants. Each tier is only
 * consumed when the asset has the matching rate enabled and the rate is > 0.
 * Any leftover days fall through to the daily tier.
 *
 * Example: 39 days with all tiers enabled → 1 month + 1 week + 2 days.
 */

export const DAYS_PER_MONTH = 30;
export const DAYS_PER_WEEK = 7;

export type RentalPricingUnit = "month" | "week" | "day";

export interface RentalPricingLine {
  unit: RentalPricingUnit;
  count: number;
  rate: number;
  subtotal: number;
}

export interface RentalPricingBreakdown {
  totalDays: number;
  currencyCode: string;
  lines: RentalPricingLine[];
  total: number;
}

export interface DecomposeRentalDurationInput {
  days: number;
  dailyRate: number;
  dailyEnabled?: boolean;
  weeklyRate?: number;
  weeklyEnabled?: boolean;
  monthlyRate?: number;
  monthlyEnabled?: boolean;
  currencyCode?: string;
}

function normalizeRate(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Greedy decomposition of a rental duration into month / week / day tiers.
 *
 * - Months and weeks are only used when the corresponding flag is enabled
 *   and the rate is > 0.
 * - Daily tier is always used as the leftover bucket so any positive day
 *   count produces at least one line.
 */
export function decomposeRentalDuration(
  input: DecomposeRentalDurationInput,
): RentalPricingBreakdown {
  const totalDays = Math.max(0, Math.floor(Number(input.days) || 0));
  const currencyCode = input.currencyCode ?? "THB";

  const dailyRate = normalizeRate(input.dailyRate);
  const weeklyRate = normalizeRate(input.weeklyRate);
  const monthlyRate = normalizeRate(input.monthlyRate);

  const monthlyAvailable =
    (input.monthlyEnabled ?? monthlyRate > 0) && monthlyRate > 0;
  const weeklyAvailable =
    (input.weeklyEnabled ?? weeklyRate > 0) && weeklyRate > 0;

  const lines: RentalPricingLine[] = [];
  let remaining = totalDays;

  if (monthlyAvailable && remaining >= DAYS_PER_MONTH) {
    const months = Math.floor(remaining / DAYS_PER_MONTH);
    if (months > 0) {
      lines.push({
        unit: "month",
        count: months,
        rate: monthlyRate,
        subtotal: months * monthlyRate,
      });
      remaining -= months * DAYS_PER_MONTH;
    }
  }

  if (weeklyAvailable && remaining >= DAYS_PER_WEEK) {
    const weeks = Math.floor(remaining / DAYS_PER_WEEK);
    if (weeks > 0) {
      lines.push({
        unit: "week",
        count: weeks,
        rate: weeklyRate,
        subtotal: weeks * weeklyRate,
      });
      remaining -= weeks * DAYS_PER_WEEK;
    }
  }

  if (remaining > 0) {
    lines.push({
      unit: "day",
      count: remaining,
      rate: dailyRate,
      subtotal: remaining * dailyRate,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);

  return {
    totalDays,
    currencyCode,
    lines,
    total,
  };
}

/** Permissive parser for breakdown JSON loaded from DB / localStorage. */
export function normalizeRentalPricingBreakdown(
  value: unknown,
): RentalPricingBreakdown | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const linesRaw = Array.isArray(raw.lines) ? raw.lines : [];

  const lines: RentalPricingLine[] = [];
  for (const entry of linesRaw) {
    if (!entry || typeof entry !== "object") continue;
    const line = entry as Record<string, unknown>;
    const unit = line.unit;
    if (unit !== "month" && unit !== "week" && unit !== "day") continue;
    const count = Math.max(0, Math.floor(Number(line.count) || 0));
    const rate = normalizeRate(line.rate);
    const subtotal = Number(line.subtotal);
    if (count <= 0) continue;
    lines.push({
      unit,
      count,
      rate,
      subtotal: Number.isFinite(subtotal) ? subtotal : count * rate,
    });
  }

  if (lines.length === 0) return undefined;

  const totalDays = Math.max(0, Math.floor(Number(raw.totalDays) || 0));
  const currencyCode =
    typeof raw.currencyCode === "string" && raw.currencyCode.trim().length > 0
      ? raw.currencyCode
      : "THB";
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);

  return { totalDays, currencyCode, lines, total };
}
