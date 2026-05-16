import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { decomposeRentalDuration } from "~~/app/utils/rental-pricing";
import {
  calculateInclusiveRentalDays,
  toExclusiveEndDate,
} from "~~/app/utils/rental-dates";
import type { RentalDepositPaymentMethod } from "~~/app/types/rental-booking";
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
import {
  computeRentalBookingPaymentLines,
  rentalPaymentLineInsertRows,
} from "~~/server/utils/rental-payment-lines";
import {
  buildRentalMoneySummary,
  buildRentalSettlementPreview,
} from "~~/server/utils/rental-money-summary";

interface PosV2RentalBookingPayload {
  userId?: string | null;
  walkInPhone?: string | null;
  bookerName?: string | null;
  bookerPhone?: string | null;
  assetId?: string | null;
  branchId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  depositPaidAmount?: number | null;
  depositPaymentMethod?: RentalDepositPaymentMethod | null;
  checkoutPaidAmount?: number | null;
  checkoutPaymentMethod?: RentalDepositPaymentMethod | null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  return posMoney(value);
}

function parseDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} must be YYYY-MM-DD`,
    });
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} must be a valid date`,
    });
  }
}

function rentalDays(startDate: string, customerReturnDate: string): number {
  parseDate(startDate, "startDate");
  parseDate(customerReturnDate, "endDate");
  const days = calculateInclusiveRentalDays(startDate, customerReturnDate);
  if (days <= 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "endDate must be on or after startDate",
    });
  }
  return days;
}

function assertNoPaymentCollection(body: PosV2RentalBookingPayload): void {
  const hasPaidAmount =
    money(body.depositPaidAmount) > 0 || money(body.checkoutPaidAmount) > 0;
  const hasPaymentMethod =
    Boolean(asText(body.depositPaymentMethod)) ||
    Boolean(asText(body.checkoutPaymentMethod));
  if (!hasPaidAmount && !hasPaymentMethod) return;
  throw createError({
    statusCode: 422,
    statusMessage:
      "POS V2 future booking does not collect payments in this phase",
  });
}

async function assertPosBranchAccess(input: {
  adminClient: any;
  platformRole: string;
  userId: string;
  branchId: string;
}) {
  if (input.platformRole === "super_admin") return;
  const { data, error } = await input.adminClient
    .from("admin_user_branch_access")
    .select("branch_id")
    .eq("user_id", input.userId)
    .eq("branch_id", input.branchId)
    .eq("can_pos", true)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) {
    throw createError({
      statusCode: 403,
      statusMessage: "No POS access for selected branch",
    });
  }
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId: staffUserId, platformRole } =
    await requirePlatformAdmin(event);
  const body = (await readBody<PosV2RentalBookingPayload>(event)) ?? {};

  assertNoPaymentCollection(body);

  const userId = asText(body.userId);
  const walkInPhone = asText(body.walkInPhone || body.bookerPhone);
  const bookerName = asText(body.bookerName);
  const bookerPhone = asText(body.bookerPhone || body.walkInPhone);
  const assetId = asText(body.assetId);
  const branchId = asText(body.branchId);
  const startDate = asText(body.startDate);
  const customerReturnDate = asText(body.endDate);

  if (!userId && !walkInPhone) {
    throw createError({
      statusCode: 422,
      statusMessage: "Select an account customer or enter walk-in phone",
    });
  }
  if (!assetId) {
    throw createError({ statusCode: 422, statusMessage: "Asset is required" });
  }
  if (!branchId) {
    throw createError({ statusCode: 422, statusMessage: "Branch is required" });
  }

  const days = rentalDays(startDate, customerReturnDate);
  if (startDate < todayDateOnly()) {
    throw createError({
      statusCode: 422,
      statusMessage: "startDate cannot be in the past",
    });
  }
  const exclusiveEndDate = toExclusiveEndDate(customerReturnDate);
  if (!exclusiveEndDate) {
    throw createError({ statusCode: 422, statusMessage: "endDate is invalid" });
  }

  await assertPosBranchAccess({
    adminClient,
    platformRole,
    userId: staffUserId,
    branchId,
  });

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
  if (assetError) {
    throw createError({ statusCode: 500, statusMessage: assetError.message });
  }
  if (!asset) {
    throw createError({ statusCode: 404, statusMessage: "Asset not found" });
  }

  const a = asset as AdminPosAssetRow;
  const minDays = Math.max(1, Number(a.min_rental_days ?? 1));
  const maxDays = Math.max(0, Number(a.max_rental_days ?? 0));
  if (days < minDays || (maxDays > 0 && days > maxDays)) {
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
    days,
    dailyRate,
    dailyEnabled: true,
    weeklyRate,
    weeklyEnabled: weeklyRate > 0,
    monthlyRate,
    monthlyEnabled: monthlyRate > 0,
    currencyCode,
  });

  await assertRentalBookingAvailability(adminClient, {
    assetId: a.id,
    startDate,
    endDate: exclusiveEndDate,
  });

  if (walkInPhone) {
    const { error } = await adminClient.from("walk_in_customers").upsert(
      {
        phone: walkInPhone,
        full_name: bookerName || null,
        linked_user_id: userId || null,
        updated_by_user_id: staffUserId,
        created_by_user_id: staffUserId,
      },
      { onConflict: "phone" },
    );
    if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const assetName = a.name_th || a.name_en || a.code || a.id;
  const branchName = String(branch.name_th ?? branch.name_en ?? "");
  const matchedProductId = primaryMatchedProductId(a);
  const { lines: paymentLines, summary: paymentSummary } =
    computeRentalBookingPaymentLines({
      customerKind: "individual",
      rentalDays: days,
      rentalFeeAmount: pricingBreakdown.total,
      depositAmount: money(a.deposit_amount),
      source: "pos_booking_create",
      metadata: {
        bookingChannel: "admin_pos_v2",
        phase: "staff_created_future_booking",
        noPaymentCollected: true,
        posBranchId: String(branch.id),
        posStaffUserId: staffUserId,
      },
    });

  const bookingId = crypto.randomUUID();
  const bookingInsert = {
    id: bookingId,
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
    end_date: exclusiveEndDate,
    rental_days: days,
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
    deposit_paid_amount: 0,
    deposit_payment_method: null,
    deposit_payment_status: "unpaid",
    deposit_refund_status: "not_applicable",
    deposit_paid_at: null,
    deposit_notes: null,
    booking_deposit_payment_status: "unpaid",
    booking_deposit_paid_amount: 0,
    checkout_total_amount: paymentSummary.netPayableTotal,
    checkout_paid_amount: 0,
    checkout_payment_method: null,
    pos_branch_id: String(branch.id),
    pos_branch_code: String(branch.code ?? ""),
    pos_branch_name: branchName,
    pos_staff_user_id: staffUserId,
  };

  const { error: insertError } = await adminClient
    .from("rental_bookings")
    .insert(bookingInsert);
  if (insertError) {
    if (isRentalBookingConflictError(insertError)) throwRentalBookingConflict();
    throw createError({ statusCode: 500, statusMessage: insertError.message });
  }

  const paymentLineRows = rentalPaymentLineInsertRows(bookingId, paymentLines);
  if (paymentLineRows.length > 0) {
    const { error: paymentLinesError } = await adminClient
      .from("rental_booking_payment_lines")
      .insert(paymentLineRows);
    if (paymentLinesError) {
      throw createError({
        statusCode: 500,
        statusMessage: paymentLinesError.message,
      });
    }
  }

  const moneySummary = buildRentalMoneySummary({
    booking: bookingInsert,
    paymentLines: paymentLineRows,
  });
  const settlementPreview = buildRentalSettlementPreview({
    summary: moneySummary,
    paymentLines: paymentLineRows,
  });

  return {
    booking: {
      id: bookingId,
      status: "confirmed",
      assetId: a.id,
      assetCode: a.code,
      assetName,
      branchId: String(branch.id),
      branchName,
      startDate,
      endDate: exclusiveEndDate,
      customerReturnDate,
      rentalDays: days,
      rentalTotal: pricingBreakdown.total,
      checkoutTotalAmount: paymentSummary.netPayableTotal,
      checkoutPaidAmount: 0,
    },
    moneySummary,
    settlementPreview,
  };
});