import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";

type BlockingBookingRow = {
  id: string;
  asset_id: string | null;
  sku_id: string | null;
  start_date: string;
  end_date: string;
  status: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  const { adminClient } = await requirePlatformAdminReadAccess(event);
  const query = getQuery(event);
  const assetId = asText(query.assetId);
  const skuId = asText(query.skuId);

  if (!assetId && !skuId) return { items: [] };

  let bookingQuery = adminClient
    .from("rental_bookings")
    .select("id, asset_id, sku_id, start_date, end_date, status")
    .in("status", ["confirmed", "picked_up"])
    .order("start_date", { ascending: true })
    .limit(500);

  bookingQuery = assetId
    ? bookingQuery.eq("asset_id", assetId)
    : bookingQuery.eq("sku_id", skuId).is("asset_id", null);

  const { data, error } = await bookingQuery;
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return {
    items: ((data ?? []) as BlockingBookingRow[]).map((row) => ({
      bookingId: row.id,
      assetId: row.asset_id ?? undefined,
      skuId: row.sku_id ?? undefined,
      startDate: row.start_date,
      returnDate: row.end_date,
      status: row.status,
    })),
  };
});
