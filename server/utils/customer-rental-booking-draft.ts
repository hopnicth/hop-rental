/**
 * Customer rental booking draft creation (server-side, authoritative).
 *
 * Replaces the previous client-side direct PostgREST insert into
 * `rental_bookings` (which sent `asset_id: null` and was rejected by the
 * CHECK `rental_bookings_root_chk`). The caller passes an authenticated
 * `userId` (from the session — never from the request body) and the raw
 * booking input; this util validates the asset + dates, computes pricing
 * from the asset (never trusts client amounts), and inserts a `draft` row
 * with `asset_id` set to the real asset id.
 *
 * Mirrors the field set the customer flow produced via
 * `mapBookingToInsert` (app/composables/useBooking.ts), minus the POS-only
 * columns. Evidence-only: the row stays `draft` (no confirmation, no
 * held-balance, no inventory) until the manual-payment-request flow picks
 * it up.
 *
 * Throws `createError` with typed status codes: 404 (asset), 422 (input /
 * business rule), 409 (duplicate), 500 (DB).
 */
import { createError } from "h3";
import {
  calculateInclusiveRentalDays,
  toExclusiveEndDate,
} from "~~/app/utils/rental-dates";
import { decomposeRentalDuration } from "~~/app/utils/rental-pricing";
import { toBangkokLocalDate } from "~~/server/utils/rental-cancellation-policy";

/** Columns required to validate the asset and build the draft snapshot. */
export const CUSTOMER_RENTAL_DRAFT_ASSET_SELECT =
  "id, code, slug, name_th, name_en, thumbnail_url, brand, category_keys, daily_rate, weekly_rate, monthly_rate, deposit_amount, min_rental_days, max_rental_days, buffer_days, currency_code, daily_enabled, weekly_enabled, monthly_enabled, status, is_hidden, storage_branch_id";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CustomerRentalDraftInput {
  assetId?: string | null;
  /** Customer-facing inclusive start date (YYYY-MM-DD). */
  startDate?: string | null;
  /** Customer-facing inclusive return date (YYYY-MM-DD). */
  returnDate?: string | null;
  bookerName?: string | null;
  bookerPhone?: string | null;
  productId?: string | null;
  skuId?: string | null;
  matchedProductId?: string | null;
  matchedProductName?: string | null;
  /** Optional — the customer form has no branch picker today. */
  branchId?: string | null;
}

type AnyRecord = Record<string, unknown>;

type MinimalClient = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): {
          eq(col: string, val: unknown): {
            maybeSingle(): Promise<{ data: AnyRecord | null; error: unknown }>;
          };
          maybeSingle(): Promise<{ data: AnyRecord | null; error: unknown }>;
        };
      };
    };
    insert(payload: AnyRecord): {
      select(cols: string): {
        single(): Promise<{
          data: AnyRecord | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
  };
};

function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Validate + insert a customer rental booking draft. `userId` MUST come from
 * the authenticated session (the caller enforces auth).
 */
export async function createCustomerRentalBookingDraft(
  client: MinimalClient,
  params: { userId: string; input: CustomerRentalDraftInput },
): Promise<AnyRecord> {
  const { userId, input } = params;

  const assetId = asText(input.assetId);
  const startDate = asText(input.startDate);
  const returnDate = asText(input.returnDate);

  if (!assetId) {
    throw createError({ statusCode: 422, statusMessage: "assetId is required" });
  }
  if (!startDate || !DATE_ONLY_RE.test(startDate)) {
    throw createError({
      statusCode: 422,
      statusMessage: "startDate is required (YYYY-MM-DD)",
    });
  }
  if (!returnDate || !DATE_ONLY_RE.test(returnDate)) {
    throw createError({
      statusCode: 422,
      statusMessage: "returnDate is required (YYYY-MM-DD)",
    });
  }

  const days = calculateInclusiveRentalDays(startDate, returnDate);
  if (days < 1) {
    throw createError({
      statusCode: 422,
      statusMessage: "returnDate must be on or after startDate",
    });
  }
  const exclusiveEndDate = toExclusiveEndDate(returnDate);
  if (!exclusiveEndDate) {
    throw createError({
      statusCode: 422,
      statusMessage: "returnDate is invalid",
    });
  }
  // Bangkok-local (UTC+7) date semantics, matching the customer date picker.
  const todayBangkok = toBangkokLocalDate(new Date());
  if (startDate < todayBangkok) {
    throw createError({
      statusCode: 422,
      statusMessage: "startDate cannot be in the past",
    });
  }

  const { data: asset, error: assetError } = await client
    .from("assets")
    .select(CUSTOMER_RENTAL_DRAFT_ASSET_SELECT)
    .eq("id", assetId)
    .eq("status", "active")
    .eq("is_hidden", false)
    .maybeSingle();
  if (assetError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to load asset",
    });
  }
  if (!asset) {
    throw createError({
      statusCode: 404,
      statusMessage: "Asset not found or unavailable",
    });
  }

  const minDays = Math.max(1, Number(asset.min_rental_days ?? 1));
  const maxDays = Math.max(0, Number(asset.max_rental_days ?? 0));
  if (days < minDays || (maxDays > 0 && days > maxDays)) {
    throw createError({
      statusCode: 422,
      statusMessage: `Rental duration must be ${minDays}-${maxDays || "∞"} days`,
    });
  }

  const dailyRate = asset.daily_enabled === false ? 0 : money(asset.daily_rate);
  if (dailyRate <= 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "Selected asset has no rental daily rate",
    });
  }
  const weeklyRate =
    asset.weekly_enabled === false ? 0 : money(asset.weekly_rate);
  const monthlyRate =
    asset.monthly_enabled === false ? 0 : money(asset.monthly_rate);
  const currencyCode = String(asset.currency_code ?? "THB").toUpperCase();
  const pricingBreakdown = decomposeRentalDuration({
    days,
    dailyRate,
    dailyEnabled: true,
    weeklyRate,
    weeklyEnabled: weeklyRate > 0,
    monthlyRate,
    monthlyEnabled: monthlyRate > 0,
    currencyCode,
  });

  // Optional branch validation (no customer branch picker today).
  let hubId: string | null = null;
  let hubName: string | null = null;
  const branchId = asText(input.branchId);
  if (branchId) {
    const { data: branch } = await client
      .from("store_branches")
      .select("id, name_th, name_en, is_active")
      .eq("id", branchId)
      .eq("is_active", true)
      .maybeSingle();
    if (!branch) {
      throw createError({
        statusCode: 422,
        statusMessage: "branchId must reference an active branch",
      });
    }
    if (
      asset.storage_branch_id &&
      String(asset.storage_branch_id) !== String(branch.id)
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: "Selected asset is not stored at the selected branch",
      });
    }
    hubId = String(branch.id);
    hubName = String(branch.name_th ?? branch.name_en ?? "");
  }

  const assetName = String(
    asset.name_th || asset.name_en || asset.code || asset.id,
  );
  const thumbnail = (asText(asset.thumbnail_url) as string | null) ?? null;
  const depositAmount = money(asset.deposit_amount);

  const bookingInsert: AnyRecord = {
    id: crypto.randomUUID(),
    user_id: userId,
    walk_in_phone: null,
    product_id: asText(input.productId),
    sku_id: asText(input.skuId),
    asset_id: String(asset.id),
    asset_code: asset.code ?? null,
    asset_slug: asset.slug ?? null,
    asset_name: assetName,
    asset_thumbnail: thumbnail,
    asset_snapshot: {
      id: String(asset.id),
      code: asset.code ?? null,
      slug: asset.slug ?? null,
      name: assetName,
      thumbnailUrl: thumbnail,
      brand: asset.brand ?? null,
      categoryKeys: Array.isArray(asset.category_keys)
        ? asset.category_keys
        : [],
      dailyRate,
      weeklyRate,
      monthlyRate,
      depositAmount,
      minDays,
      maxDays,
      bufferDays: Number(asset.buffer_days ?? 0),
    },
    matched_product_id: asText(input.matchedProductId) ?? asText(input.productId),
    matched_product_name: asText(input.matchedProductName) ?? assetName,
    product_name: assetName,
    thumbnail,
    hub_id: hubId,
    hub_name: hubName,
    start_date: startDate,
    end_date: exclusiveEndDate,
    rental_days: days,
    pricing_model: "daily",
    currency_code: currencyCode,
    daily_rate: dailyRate,
    weekly_rate: weeklyRate,
    monthly_rate: monthlyRate,
    rental_total: pricingBreakdown.total,
    deposit_amount: depositAmount,
    pricing_breakdown: pricingBreakdown,
    booker_name: asText(input.bookerName),
    booker_phone: asText(input.bookerPhone),
    status: "draft",
  };

  const { data, error: insertError } = await client
    .from("rental_bookings")
    .insert(bookingInsert)
    .select("*")
    .single();
  if (insertError || !data) {
    throw createError({
      statusCode: insertError?.code === "23505" ? 409 : 500,
      statusMessage: insertError?.message ?? "Failed to create booking draft",
    });
  }

  return data;
}
