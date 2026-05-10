import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_RENTAL_BOOKING_LIST_SELECT,
  mapAdminRentalBookingRow,
} from "~~/server/utils/admin-orders";
import { decomposeRentalDuration } from "~~/app/utils/rental-pricing";
import type { AdminRentalBookingRow } from "~~/app/types/admin-order";
import type {
  RentalDepositPaymentMethod,
  RentalDepositPaymentStatus,
} from "~~/app/types/rental-booking";
import {
  ADMIN_POS_ASSET_SELECT,
  buildPosAssetSnapshot,
  posMoney,
  primaryMatchedProductId,
  type AdminPosAssetRow,
} from "~~/server/utils/admin-pos";
import {
  assertRentalBookingAvailability,
  isRentalBookingConflictError,
  throwRentalBookingConflict,
} from "~~/server/utils/rental-booking-availability";

interface PosBookingPayload {
  userId?: string | null;
  walkInPhone?: string | null;
  bookerName?: string | null;
  bookerPhone?: string | null;
  assetId?: string;
  productId?: string;
  skuId?: string;
  branchId?: string | null;
  startDate?: string;
  endDate?: string;
  checkoutTotalAmount?: number;
  checkoutPaidAmount?: number;
  checkoutPaymentMethod?: RentalDepositPaymentMethod | null;
  depositPaidAmount?: number;
  depositPaymentMethod?: RentalDepositPaymentMethod | null;
  depositPaymentStatus?: RentalDepositPaymentStatus | null;
  depositNotes?: string | null;
  depositAdjustmentReason?: string | null;
}

const PAYMENT_METHODS = new Set([
  "cash",
  "qr_transfer",
  "bank_transfer",
  "card",
  "other",
]);
const PAYMENT_STATUSES = new Set([
  "unpaid",
  "pending_review",
  "paid",
  "refunded",
  "partial_refund",
]);

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  return posMoney(value);
}

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} must be YYYY-MM-DD`,
    });
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function diffDays(startDate: string, endDate: string): number {
  const start = parseDate(startDate, "startDate");
  const end = parseDate(endDate, "endDate");
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days <= 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "endDate must be after startDate",
    });
  }
  return days;
}

export default defineEventHandler(
  async (event): Promise<{ booking: AdminRentalBookingRow }> => {
    const { adminClient, userId: adminUserId } =
      await requirePlatformAdmin(event);
    const body = (await readBody<PosBookingPayload>(event)) ?? {};

    const userId = asText(body.userId);
    const walkInPhone = asText(body.walkInPhone || body.bookerPhone);
    const bookerName = asText(body.bookerName);
    const bookerPhone = asText(body.bookerPhone || body.walkInPhone);
    const assetId = asText(body.assetId || body.skuId || body.productId);
    const branchId = asText(body.branchId);
    const startDate = asText(body.startDate);
    const endDate = asText(body.endDate);

    if (!userId && !walkInPhone) {
      throw createError({
        statusCode: 422,
        statusMessage: "Select an account customer or enter walk-in phone",
      });
    }
    if (!assetId) {
      throw createError({
        statusCode: 422,
        statusMessage: "Asset is required",
      });
    }
    if (!branchId) {
      throw createError({
        statusCode: 422,
        statusMessage: "Branch is required",
      });
    }
    const rentalDays = diffDays(startDate, endDate);

    const { data: branch, error: branchError } = await adminClient
      .from("store_branches")
      .select("id, code, name_th, name_en, is_active")
      .eq("id", branchId)
      .eq("is_active", true)
      .single();
    if (branchError || !branch) {
      throw createError({
        statusCode: 422,
        statusMessage: "branchId must reference an active branch",
      });
    }

    const { data: asset, error: assetError } = await adminClient
      .from("assets")
      .select(ADMIN_POS_ASSET_SELECT)
      .eq("id", assetId)
      .eq("status", "active")
      .eq("is_hidden", false)
      .maybeSingle();
    if (assetError)
      throw createError({
        statusCode: 500,
        statusMessage: assetError.message,
      });
    if (!asset)
      throw createError({
        statusCode: 404,
        statusMessage: "Asset not found",
      });

    const a = asset as AdminPosAssetRow;
    const minDays = Math.max(1, Number(a.min_rental_days ?? 1));
    const maxDays = Math.max(0, Number(a.max_rental_days ?? 0));
    if (rentalDays < minDays || (maxDays > 0 && rentalDays > maxDays)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Rental duration must be ${minDays}-${maxDays || "∞"} days`,
      });
    }

    const dailyRate = a.daily_enabled === false ? 0 : money(a.daily_rate);
    if (dailyRate <= 0) {
      throw createError({
        statusCode: 422,
        statusMessage: "Selected asset has no rental daily rate",
      });
    }
    const weeklyRate = a.weekly_enabled === false ? 0 : money(a.weekly_rate);
    const monthlyRate = a.monthly_enabled === false ? 0 : money(a.monthly_rate);
    const currencyCode = a.currency_code ?? "THB";
    const pricingBreakdown = decomposeRentalDuration({
      days: rentalDays,
      dailyRate,
      dailyEnabled: true,
      weeklyRate,
      weeklyEnabled: weeklyRate > 0,
      monthlyRate,
      monthlyEnabled: monthlyRate > 0,
      currencyCode,
    });

    if (walkInPhone) {
      const { error } = await adminClient.from("walk_in_customers").upsert(
        {
          phone: walkInPhone,
          full_name: bookerName || null,
          linked_user_id: userId || null,
          updated_by_user_id: adminUserId,
          created_by_user_id: adminUserId,
        },
        { onConflict: "phone" },
      );
      if (error)
        throw createError({ statusCode: 500, statusMessage: error.message });
    }

    const paidAmount = money(body.depositPaidAmount);
    const method = asText(body.depositPaymentMethod);
    const depositPaymentMethod = PAYMENT_METHODS.has(method)
      ? (method as RentalDepositPaymentMethod)
      : null;
    const requestedStatus = asText(body.depositPaymentStatus);
    const depositPaymentStatus = PAYMENT_STATUSES.has(requestedStatus)
      ? (requestedStatus as RentalDepositPaymentStatus)
      : paidAmount > 0
        ? "paid"
        : "unpaid";
    const assetName = a.name_th || a.name_en || a.code || a.id;
    const matchedProductId = primaryMatchedProductId(a);
    const branchName = String(branch.name_th ?? branch.name_en ?? "");
    const checkoutTotalAmount = money(body.checkoutTotalAmount);
    const checkoutPaidAmount = money(body.checkoutPaidAmount);
    const checkoutMethod = asText(body.checkoutPaymentMethod);
    const checkoutPaymentMethod = PAYMENT_METHODS.has(checkoutMethod)
      ? (checkoutMethod as RentalDepositPaymentMethod)
      : depositPaymentMethod;

    await assertRentalBookingAvailability(adminClient, {
      assetId: a.id,
      startDate,
      endDate,
    });

    const { data: inserted, error: insertError } = await adminClient
      .from("rental_bookings")
      .insert({
        user_id: userId || null,
        walk_in_phone: userId ? null : walkInPhone,
        product_id: null,
        sku_id: null,
        asset_id: a.id,
        asset_code: a.code,
        asset_slug: a.slug,
        asset_name: assetName,
        asset_thumbnail: a.thumbnail_url,
        asset_snapshot: buildPosAssetSnapshot(a),
        matched_product_id: matchedProductId,
        matched_product_name: matchedProductId ? assetName : null,
        product_name: assetName,
        thumbnail: a.thumbnail_url,
        hub_id: String(branch.id),
        hub_name: branchName,
        start_date: startDate,
        end_date: endDate,
        rental_days: rentalDays,
        pricing_model: "daily",
        currency_code: currencyCode,
        daily_rate: dailyRate,
        weekly_rate: weeklyRate,
        monthly_rate: monthlyRate,
        rental_total: pricingBreakdown.total,
        deposit_amount: money(a.deposit_amount),
        pricing_breakdown: pricingBreakdown,
        booker_name: bookerName || null,
        booker_phone: bookerPhone || walkInPhone || null,
        status: "confirmed",
        deposit_paid_amount: paidAmount,
        deposit_payment_method: depositPaymentMethod,
        deposit_payment_status: depositPaymentStatus,
        deposit_refund_status:
          paidAmount > 0 ? "not_refunded" : "not_applicable",
        deposit_paid_at: paidAmount > 0 ? new Date().toISOString() : null,
        deposit_notes: asText(body.depositNotes) || null,
        checkout_total_amount:
          checkoutTotalAmount || pricingBreakdown.total + paidAmount,
        checkout_paid_amount: checkoutPaidAmount || paidAmount,
        checkout_payment_method: checkoutPaymentMethod,
        pos_branch_id: String(branch.id),
        pos_branch_code: String(branch.code ?? ""),
        pos_branch_name: branchName,
        pos_staff_user_id: adminUserId,
      })
      .select(ADMIN_RENTAL_BOOKING_LIST_SELECT)
      .single();
    if (insertError) {
      if (isRentalBookingConflictError(insertError)) {
        throwRentalBookingConflict();
      }
      throw createError({
        statusCode: 500,
        statusMessage: insertError.message,
      });
    }

    const defaultDepositAmount = money(a.deposit_amount);
    if (paidAmount !== defaultDepositAmount) {
      const { error: logError } = await adminClient
        .from("rental_booking_deposit_action_logs")
        .insert({
          booking_id: inserted.id,
          action: "pos_create_override",
          staff_user_id: adminUserId,
          branch_id: String(branch.id),
          old_values: {
            depositAmount: defaultDepositAmount,
            depositPaidAmount: defaultDepositAmount,
            depositPaymentMethod: null,
            depositPaymentStatus:
              defaultDepositAmount > 0 ? "unpaid" : "unpaid",
          },
          new_values: {
            depositAmount: defaultDepositAmount,
            depositPaidAmount: paidAmount,
            depositPaymentMethod,
            depositPaymentStatus,
            checkoutTotalAmount:
              checkoutTotalAmount || pricingBreakdown.total + paidAmount,
            checkoutPaidAmount: checkoutPaidAmount || paidAmount,
          },
          change_summary: `POS booking deposit override ${defaultDepositAmount} -> ${paidAmount}`,
          reason: asText(body.depositAdjustmentReason) || null,
        });
      if (logError) {
        throw createError({ statusCode: 500, statusMessage: logError.message });
      }
    }

    return { booking: mapAdminRentalBookingRow(inserted) };
  },
);
