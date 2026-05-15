import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminBookingHandoverItem,
  CreateBookingHandoverItemPayload,
  RentalBookingHandoverReturnStatus,
  UpdateBookingHandoverItemPayload,
} from "~~/app/types/admin-booking-handover-items";
import type { RentalBookingStatus } from "~~/app/types/rental-booking";

export const HANDOVER_ITEM_SELECT =
  "id, booking_id, asset_id, item_name, quantity_prepared, sort_order, preparation_note, pickup_checked, quantity_handed_over, pickup_checked_at, pickup_checked_by_user_id, pickup_note, return_status, quantity_returned, return_checked_at, return_checked_by_user_id, return_note, created_by_user_id, updated_by_user_id, created_at, updated_at";

const BOOKING_SELECT =
  "id, status, asset_id, asset_code, asset_name, product_name, matched_product_name";

type BookingRow = {
  id: string;
  status: RentalBookingStatus;
  asset_id: string | null;
  asset_code?: string | null;
  asset_name?: string | null;
  product_name?: string | null;
  matched_product_name?: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapHandoverItem(raw: unknown): AdminBookingHandoverItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    bookingId: String(r.booking_id ?? ""),
    assetId: text(r.asset_id),
    itemName: String(r.item_name ?? ""),
    quantityPrepared: Number(r.quantity_prepared ?? 0),
    sortOrder: Number(r.sort_order ?? 0),
    preparationNote: text(r.preparation_note),
    pickupChecked: Boolean(r.pickup_checked),
    quantityHandedOver: num(r.quantity_handed_over),
    pickupCheckedAt: text(r.pickup_checked_at),
    pickupCheckedByUserId: text(r.pickup_checked_by_user_id),
    pickupNote: text(r.pickup_note),
    returnStatus: String(
      r.return_status ?? "pending",
    ) as RentalBookingHandoverReturnStatus,
    quantityReturned: num(r.quantity_returned),
    returnCheckedAt: text(r.return_checked_at),
    returnCheckedByUserId: text(r.return_checked_by_user_id),
    returnNote: text(r.return_note),
    createdByUserId: text(r.created_by_user_id),
    updatedByUserId: text(r.updated_by_user_id),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export function isHandoverEditableStatus(status: string): boolean {
  return status !== "picked_up" && status !== "returned" && status !== "cancelled";
}

export async function loadHandoverBooking(
  adminClient: SupabaseClient,
  bookingId: string,
): Promise<BookingRow> {
  const { data, error } = await adminClient
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) throw createError({ statusCode: 404, statusMessage: "Booking not found" });
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    status: String(row.status ?? "draft") as RentalBookingStatus,
    asset_id: text(row.asset_id),
    asset_code: text(row.asset_code),
    asset_name: text(row.asset_name),
    product_name: text(row.product_name),
    matched_product_name: text(row.matched_product_name),
  };
}

export function assertHandoverEditable(booking: BookingRow): void {
  if (!isHandoverEditableStatus(booking.status)) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "Handover items are locked after pickup has started or booking is closed",
    });
  }
}

export async function loadHandoverItems(
  adminClient: SupabaseClient,
  bookingId: string,
): Promise<AdminBookingHandoverItem[]> {
  const { data, error } = await adminClient
    .from("rental_booking_handover_items")
    .select(HANDOVER_ITEM_SELECT)
    .eq("booking_id", bookingId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  return (data ?? []).map(mapHandoverItem);
}

export function buildHandoverWritePayload(
  body: CreateBookingHandoverItemPayload | UpdateBookingHandoverItemPayload,
  options: { requireNameAndQty: boolean; userId: string },
): Record<string, unknown> {
  const out: Record<string, unknown> = { updated_by_user_id: options.userId };

  if (body.itemName !== undefined || options.requireNameAndQty) {
    const itemName = text(body.itemName);
    if (!itemName) {
      throw createError({ statusCode: 400, statusMessage: "Item name is required" });
    }
    out.item_name = itemName;
  }

  if (body.quantityPrepared !== undefined || options.requireNameAndQty) {
    const quantity = num(body.quantityPrepared);
    if (quantity === null || quantity <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "Prepared quantity must be greater than 0",
      });
    }
    out.quantity_prepared = quantity;
  }

  if (body.preparationNote !== undefined) {
    out.preparation_note = text(body.preparationNote);
  }
  if (body.assetId !== undefined) {
    out.asset_id = text(body.assetId);
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = num(body.sortOrder);
    out.sort_order = sortOrder === null ? 0 : Math.trunc(sortOrder);
  }

  if (Object.keys(out).length === 1) {
    throw createError({ statusCode: 400, statusMessage: "No updatable fields supplied" });
  }
  return out;
}

export function generatedItemName(booking: BookingRow): string {
  return (
    text(booking.asset_name) ??
    text(booking.matched_product_name) ??
    text(booking.product_name) ??
    text(booking.asset_code) ??
    `Booking ${booking.id}`
  );
}
