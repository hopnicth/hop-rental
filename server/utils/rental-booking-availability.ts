import { createError } from "h3";

type AnyClient = {
  from: (table: string) => any;
};

const BLOCKING_RENTAL_STATUSES = ["confirmed", "picked_up"] as const;
const RENTAL_BOOKING_CONFLICT = "RENTAL_BOOKING_CONFLICT";

export function isRentalBookingConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  const details = typeof record.details === "string" ? record.details : "";

  return (
    code === "23P01" ||
    message.includes(RENTAL_BOOKING_CONFLICT) ||
    details.includes(RENTAL_BOOKING_CONFLICT)
  );
}

export function throwRentalBookingConflict(): never {
  throw createError({
    statusCode: 409,
    statusMessage: RENTAL_BOOKING_CONFLICT,
    message: "Selected rental period is no longer available.",
  });
}

function assertDateString(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} must be YYYY-MM-DD`,
    });
  }
  return value;
}

function assertPositiveRange(startDate: string, endDate: string): void {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw createError({
      statusCode: 422,
      statusMessage: "endDate must be after startDate",
    });
  }
}

export async function assertRentalBookingAvailability(
  client: AnyClient,
  input: {
    assetId?: string | null;
    skuId?: string | null;
    startDate: unknown;
    endDate: unknown;
    excludeBookingId?: string | null;
  },
): Promise<void> {
  const startDate = assertDateString(input.startDate, "startDate");
  const endDate = assertDateString(input.endDate, "endDate");
  assertPositiveRange(startDate, endDate);

  const assetId = typeof input.assetId === "string" ? input.assetId : "";
  const skuId = typeof input.skuId === "string" ? input.skuId : "";
  if (!assetId && !skuId) return;

  let query = client
    .from("rental_bookings")
    .select("id")
    .in("status", [...BLOCKING_RENTAL_STATUSES])
    .lt("start_date", endDate)
    .gt("end_date", startDate)
    .limit(1);

  if (assetId) {
    query = query.eq("asset_id", assetId);
  } else {
    query = query.eq("sku_id", skuId).is("asset_id", null);
  }

  if (input.excludeBookingId) {
    query = query.neq("id", input.excludeBookingId);
  }

  const { data, error } = await query;
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  if ((data ?? []).length > 0) {
    throwRentalBookingConflict();
  }
}
