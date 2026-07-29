import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_RENTAL_BOOKING_DETAIL_SELECT,
  fetchAdminCustomerProfile,
  isMissingRentalBookingColumn,
  mapAdminRentalBookingDetail,
} from "~~/server/utils/admin-orders";
import type { AdminRentalBookingDetail } from "~~/app/types/admin-order-detail";

const ADMIN_RENTAL_BOOKING_DETAIL_SELECT_WITHOUT_REFUND_FIELDS =
  "id, user_id, walk_in_phone, status, asset_id, asset_code, asset_name, asset_thumbnail, asset_snapshot, product_id, sku_id, product_name, matched_product_id, matched_product_name, thumbnail, hub_id, hub_name, start_date, end_date, rental_days, pricing_model, currency_code, daily_rate, weekly_rate, monthly_rate, rental_total, deposit_amount, deposit_paid_amount, deposit_payment_method, deposit_payment_status, deposit_refund_status, pricing_breakdown, booker_name, booker_phone, created_at, updated_at, asset:assets(storage_branch_id, store_branches(id, code, name_th, name_en))";

export default defineEventHandler(
  async (event): Promise<AdminRentalBookingDetail> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const id = getRouterParam(event, "id");

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Booking id is required",
      });
    }

    const buildQuery = (select: string) =>
      adminClient
        .from("rental_bookings")
        .select(select)
        .eq("id", id)
        .maybeSingle();

    let result = await buildQuery(ADMIN_RENTAL_BOOKING_DETAIL_SELECT);
    if (
      result.error &&
      isMissingRentalBookingColumn(result.error, [
        "rental_bookings.deposit_refund_amount",
        "deposit_refund_amount",
        "rental_bookings.deposit_refund_notes",
        "deposit_refund_notes",
      ])
    ) {
      result = await buildQuery(
        ADMIN_RENTAL_BOOKING_DETAIL_SELECT_WITHOUT_REFUND_FIELDS,
      );
    }

    const { data: row, error } = result;

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    if (!row) {
      throw createError({
        statusCode: 404,
        statusMessage: "Rental booking not found",
      });
    }

    const customer = await fetchAdminCustomerProfile(
      adminClient,
      String((row as Record<string, unknown>).user_id ?? ""),
    );

    // [batch-1] Deposit regime, server-authoritative (f_deposits_enabled, mig
    // 135), fail-closed. The page uses it to hide deposit-era actions — the
    // manual no-show button — rather than deleting them (hide-not-delete).
    const { data: depositsEnabled } = await adminClient.rpc(
      "f_deposits_enabled",
    );

    return {
      ...mapAdminRentalBookingDetail(row, customer),
      depositsEnabled: depositsEnabled === true,
    };
  },
);
