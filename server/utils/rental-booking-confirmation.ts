import { createError } from "h3";
import {
  assertRentalBookingAvailability,
  isRentalBookingConflictError,
  throwRentalBookingConflict,
} from "~~/server/utils/rental-booking-availability";
import { decomposeRentalDuration } from "~~/app/utils/rental-pricing";

type AnyRecord = Record<string, unknown>;

type QueryResult<T = AnyRecord> = PromiseLike<{
  data: T | null;
  error: { message?: string; code?: string } | null;
}>;
type AnyClient = {
  from(table: string): {
    select(columns: string): any;
    update(payload: Record<string, unknown>): any;
  };
};

export const RENTAL_CONFIRM_BOOKING_SELECT =
  "id, user_id, status, asset_id, sku_id, start_date, end_date, rental_days, hub_id, daily_rate, weekly_rate, monthly_rate, rental_total, deposit_amount, currency_code, pricing_breakdown, booking_deposit_payment_status, booking_deposit_paid_amount, booking_deposit_paid_at";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function assertMoneyMatches(
  field: string,
  actual: unknown,
  expected: unknown,
): void {
  if (Math.abs(asMoney(actual) - asMoney(expected)) > 0.01) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} no longer matches current rental pricing`,
    });
  }
}

function diffCalendarDays(startDate: string, endDate: string): number {
  // DB stores end_date as the internal exclusive boundary for [start_date, end_date).
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

async function assertActiveBranch(
  adminClient: AnyClient,
  hubId: string,
): Promise<void> {
  const { data, error } = await adminClient
    .from("store_branches")
    .select("id, is_active")
    .eq("id", hubId)
    .maybeSingle();

  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data || data.is_active !== true) {
    throw createError({
      statusCode: 422,
      statusMessage: "Active pickup branch is required",
    });
  }
}

function assertDateAndDuration(current: AnyRecord): number {
  const startDate = asString(current.start_date);
  const endDate = asString(current.end_date);
  if (!startDate || !endDate) {
    throw createError({
      statusCode: 422,
      statusMessage: "Booking dates are required",
    });
  }

  const days = diffCalendarDays(startDate, endDate);
  if (days <= 0 || Number(current.rental_days) !== days) {
    throw createError({
      statusCode: 422,
      statusMessage: "Booking rental days do not match selected dates",
    });
  }
  return days;
}

function assertBookingPricing(
  current: AnyRecord,
  source: {
    dailyRate: unknown;
    weeklyRate: unknown;
    monthlyRate: unknown;
    depositAmount: unknown;
    dailyEnabled?: unknown;
    weeklyEnabled?: unknown;
    monthlyEnabled?: unknown;
    currencyCode?: unknown;
  },
  days: number,
): void {
  const expected = decomposeRentalDuration({
    days,
    dailyRate: asMoney(source.dailyRate),
    dailyEnabled: source.dailyEnabled !== false,
    weeklyRate: asMoney(source.weeklyRate),
    weeklyEnabled: source.weeklyEnabled !== false,
    monthlyRate: asMoney(source.monthlyRate),
    monthlyEnabled: source.monthlyEnabled !== false,
    currencyCode: asString(source.currencyCode) ?? "THB",
  });

  assertMoneyMatches("daily_rate", current.daily_rate, source.dailyRate);
  assertMoneyMatches("weekly_rate", current.weekly_rate, source.weeklyRate);
  assertMoneyMatches("monthly_rate", current.monthly_rate, source.monthlyRate);
  assertMoneyMatches(
    "deposit_amount",
    current.deposit_amount,
    source.depositAmount,
  );
  assertMoneyMatches("rental_total", current.rental_total, expected.total);
}

async function assertAssetOrSkuPricing(
  adminClient: AnyClient,
  current: AnyRecord,
  days: number,
): Promise<void> {
  const assetId = asString(current.asset_id);
  if (assetId) {
    const { data: asset, error } = await adminClient
      .from("assets")
      .select(
        "id, status, is_hidden, currency_code, daily_rate, weekly_rate, monthly_rate, daily_enabled, weekly_enabled, monthly_enabled, deposit_amount, min_rental_days, max_rental_days",
      )
      .eq("id", assetId)
      .maybeSingle();

    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    if (!asset || asset.status !== "active" || asset.is_hidden === true) {
      throw createError({
        statusCode: 422,
        statusMessage: "Rental asset is not available",
      });
    }
    if (days < Number(asset.min_rental_days || 1)) {
      throw createError({
        statusCode: 422,
        statusMessage: "Rental period is below minimum days",
      });
    }
    if (
      Number(asset.max_rental_days || 0) > 0 &&
      days > Number(asset.max_rental_days)
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: "Rental period exceeds maximum days",
      });
    }
    assertBookingPricing(
      current,
      {
        dailyRate: asset.daily_rate,
        weeklyRate: asset.weekly_rate,
        monthlyRate: asset.monthly_rate,
        depositAmount: asset.deposit_amount,
        dailyEnabled: asset.daily_enabled,
        weeklyEnabled: asset.weekly_enabled,
        monthlyEnabled: asset.monthly_enabled,
        currencyCode: asset.currency_code,
      },
      days,
    );
    return;
  }

  const skuId = asString(current.sku_id);
  if (!skuId)
    throw createError({
      statusCode: 422,
      statusMessage: "Asset or SKU is required",
    });

  const { data: sku, error } = await adminClient
    .from("product_skus")
    .select(
      "id, rental_daily, rental_weekly, rental_monthly, rental_deposit, products(is_hidden)",
    )
    .eq("id", skuId)
    .maybeSingle();

  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  const product = sku?.products as AnyRecord | null | undefined;
  if (!sku || product?.is_hidden === true) {
    throw createError({
      statusCode: 422,
      statusMessage: "Rental SKU is not available",
    });
  }
  assertBookingPricing(
    current,
    {
      dailyRate: sku.rental_daily,
      weeklyRate: sku.rental_weekly,
      monthlyRate: sku.rental_monthly,
      depositAmount: sku.rental_deposit,
      weeklyEnabled: asMoney(sku.rental_weekly) > 0,
      monthlyEnabled: asMoney(sku.rental_monthly) > 0,
    },
    days,
  );
}

export async function loadRentalBookingForConfirmation(
  adminClient: AnyClient,
  bookingId: string,
): Promise<AnyRecord> {
  const { data, error } = (await adminClient
    .from("rental_bookings")
    .select(RENTAL_CONFIRM_BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle()) as Awaited<QueryResult>;
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  return data;
}

export async function validateRentalBookingForConfirmation(input: {
  adminClient: AnyClient;
  booking: AnyRecord;
  userId: string;
  allowedStatuses?: string[];
  requireBookingDepositPaid?: boolean;
  bypassBookingDepositRequirement?: boolean;
}): Promise<void> {
  const { adminClient, booking, userId } = input;
  if (String(booking.user_id ?? "") !== String(userId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Booking access denied",
    });
  }
  const allowedStatuses = input.allowedStatuses ?? ["draft"];
  if (!allowedStatuses.includes(String(booking.status ?? ""))) {
    throw createError({
      statusCode: 422,
      statusMessage: "Only draft bookings can be confirmed",
    });
  }
  if (!booking.hub_id) {
    throw createError({
      statusCode: 422,
      statusMessage: "Pickup hub is required",
    });
  }
  if (
    input.requireBookingDepositPaid &&
    !input.bypassBookingDepositRequirement
  ) {
    const paymentStatus = String(
      booking.booking_deposit_payment_status ?? "unpaid",
    );
    if (
      paymentStatus !== "paid" ||
      asMoney(booking.booking_deposit_paid_amount) <= 0
    ) {
      throw createError({
        statusCode: 402,
        statusMessage: "BOOKING_DEPOSIT_PAYMENT_REQUIRED",
      });
    }
  }

  const days = assertDateAndDuration(booking);
  await assertActiveBranch(adminClient, String(booking.hub_id));
  await assertAssetOrSkuPricing(adminClient, booking, days);
  await assertRentalBookingAvailability(adminClient as never, {
    assetId: booking.asset_id as string | null,
    skuId: booking.sku_id as string | null,
    startDate: booking.start_date,
    endDate: booking.end_date,
    excludeBookingId: String(booking.id),
  });
}

export async function confirmRentalBooking(input: {
  adminClient: AnyClient;
  bookingId: string;
  userId: string;
  allowedStatuses?: string[];
  requireBookingDepositPaid?: boolean;
  bypassBookingDepositRequirement?: boolean;
}): Promise<AnyRecord> {
  const booking = await loadRentalBookingForConfirmation(
    input.adminClient,
    input.bookingId,
  );
  await validateRentalBookingForConfirmation({ ...input, booking });

  const { data: updated, error } = await input.adminClient
    .from("rental_bookings")
    .update({ status: "confirmed" })
    .eq("id", input.bookingId)
    .in("status", input.allowedStatuses ?? ["draft"])
    .select("*")
    .maybeSingle();

  if (error) {
    if (isRentalBookingConflictError(error)) throwRentalBookingConflict();
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  if (!updated) {
    throw createError({
      statusCode: 409,
      statusMessage: "Booking is no longer available for confirmation",
    });
  }
  return updated as AnyRecord;
}
