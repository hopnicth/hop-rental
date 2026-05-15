import { createError, defineEventHandler, getQuery } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { isMissingRentalBookingColumn } from "~~/server/utils/admin-orders";

type Row = Record<string, unknown>;

const POS_RENTAL_HISTORY_SELECT =
  "id, created_at, walk_in_phone, user_id, booker_name, booker_phone, status, rental_total, deposit_paid_amount, deposit_payment_method, deposit_payment_status, deposit_refund_status, deposit_refund_amount, checkout_total_amount, checkout_paid_amount, checkout_payment_method, pos_branch_id, pos_branch_code, pos_branch_name";

const POS_RENTAL_HISTORY_SELECT_WITHOUT_REFUND_AMOUNT =
  "id, created_at, walk_in_phone, user_id, booker_name, booker_phone, status, rental_total, deposit_paid_amount, deposit_payment_method, deposit_payment_status, deposit_refund_status, checkout_total_amount, checkout_paid_amount, checkout_payment_method, pos_branch_id, pos_branch_code, pos_branch_name";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function isIsoDate(value: string): boolean {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value);
}

function bangkokDayRange(date: string) {
  const start = new Date(`${date}T00:00:00.000+07:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function customerLabel(row: Row) {
  const snapshot = row.address_snapshot;
  const snapshotRow =
    snapshot && typeof snapshot === "object" ? (snapshot as Row) : {};
  return (
    asText(row.booker_name) ||
    asText(snapshotRow.contactName) ||
    asText(row.walk_in_phone) ||
    asText(row.booker_phone) ||
    asText(row.user_id) ||
    "Walk-in"
  );
}

function paymentStatus(row: Row, fallback = "unknown") {
  return (
    asText(row.payment_status) || asText(row.deposit_payment_status) || fallback
  );
}

function isMissingRefundAmountColumn(error: unknown): boolean {
  return isMissingRentalBookingColumn(error, [
    "rental_bookings.deposit_refund_amount",
    "deposit_refund_amount",
  ]);
}

async function allowedBranchIdsForUser(
  adminClient: Pick<SupabaseClient, "from">,
  userId: string,
  platformRole: string,
) {
  if (platformRole === "super_admin") return null;
  const { data, error } = await adminClient
    .from("admin_user_branch_access")
    .select("branch_id")
    .eq("user_id", userId)
    .eq("can_pos", true);

  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return (data ?? [])
    .map((row: { branch_id?: unknown }) => String(row.branch_id ?? ""))
    .filter(Boolean);
}

export default defineEventHandler(async (event) => {
  const { adminClient, platformRole, userId } =
    await requirePlatformAdmin(event);
  const query = getQuery(event);
  const requestedDate = asText(query.date) || todayBangkok();
  const branchId = asText(query.branchId);

  if (!isIsoDate(requestedDate)) {
    throw createError({
      statusCode: 422,
      statusMessage: "date must be YYYY-MM-DD",
    });
  }

  const allowedBranchIds = await allowedBranchIdsForUser(
    adminClient,
    userId,
    platformRole,
  );
  if (allowedBranchIds && branchId && !allowedBranchIds.includes(branchId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "No POS access to this branch",
    });
  }
  if (allowedBranchIds && !branchId && allowedBranchIds.length === 0) {
    return {
      date: requestedDate,
      branchId: null,
      items: [],
      summary: {
        totalAmount: 0,
        totalSales: 0,
        totalRentals: 0,
        transactionCount: 0,
        paymentBreakdown: {},
      },
    };
  }

  const { startIso, endIso } = bangkokDayRange(requestedDate);
  let ordersQuery = adminClient
    .from("orders")
    .select(
      "id, order_number, status, created_at, walk_in_phone, user_id, address_snapshot, grand_total, pos_paid_amount, pos_payment_method, payment_status, pos_branch_id, pos_branch_code, pos_branch_name",
    )
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .not("pos_branch_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  const buildRentalsQuery = (select: string) => {
    let rentalsQuery = adminClient
      .from("rental_bookings")
      .select(select)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .not("pos_branch_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (branchId) {
      rentalsQuery = rentalsQuery.eq("pos_branch_id", branchId);
    } else if (allowedBranchIds) {
      rentalsQuery = rentalsQuery.in("pos_branch_id", allowedBranchIds);
    }
    return rentalsQuery;
  };

  if (branchId) {
    ordersQuery = ordersQuery.eq("pos_branch_id", branchId);
  } else if (allowedBranchIds) {
    ordersQuery = ordersQuery.in("pos_branch_id", allowedBranchIds);
  }

  const [ordersResult, initialRentalsResult] = await Promise.all([
    ordersQuery,
    buildRentalsQuery(POS_RENTAL_HISTORY_SELECT),
  ]);
  let rentalsResult = initialRentalsResult;
  if (rentalsResult.error && isMissingRefundAmountColumn(rentalsResult.error)) {
    rentalsResult = await buildRentalsQuery(
      POS_RENTAL_HISTORY_SELECT_WITHOUT_REFUND_AMOUNT,
    );
  }
  if (ordersResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: ordersResult.error.message,
    });
  }
  if (rentalsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: rentalsResult.error.message,
    });
  }

  const saleItems = ((ordersResult.data ?? []) as Row[]).map((row) => {
    const amount = money(row.pos_paid_amount) || money(row.grand_total);
    return {
      id: asText(row.id),
      type: "sale" as const,
      documentNo: asText(row.order_number) || asText(row.id),
      status: asText(row.status) || "unknown",
      createdAt: asText(row.created_at),
      customerName: customerLabel(row),
      amount,
      paymentStatus: paymentStatus(row),
      paymentMethod: asText(row.pos_payment_method) || "unknown",
      branchId: asText(row.pos_branch_id),
      branchName: asText(row.pos_branch_name) || asText(row.pos_branch_code),
    };
  });

  const rentalItems = ((rentalsResult.data ?? []) as Row[]).map((row) => {
    const amount =
      money(row.checkout_paid_amount) ||
      money(row.checkout_total_amount) ||
      money(row.deposit_paid_amount) ||
      money(row.rental_total);
    return {
      id: asText(row.id),
      type: "rental" as const,
      documentNo: asText(row.id),
      status: asText(row.status) || "unknown",
      createdAt: asText(row.created_at),
      customerName: customerLabel(row),
      amount,
      rentalTotal: money(row.rental_total),
      depositPaidAmount: money(row.deposit_paid_amount),
      depositRefundStatus: asText(row.deposit_refund_status) || "not_refunded",
      depositRefundAmount: money(row.deposit_refund_amount),
      paymentStatus: paymentStatus(row, asText(row.status) || "unknown"),
      paymentMethod:
        asText(row.checkout_payment_method) ||
        asText(row.deposit_payment_method) ||
        "unknown",
      depositPaymentMethod: asText(row.deposit_payment_method) || null,
      branchId: asText(row.pos_branch_id),
      branchName: asText(row.pos_branch_name) || asText(row.pos_branch_code),
    };
  });

  const items = [...saleItems, ...rentalItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const paymentBreakdown: Record<string, { count: number; amount: number }> =
    {};
  for (const item of items) {
    const key = item.paymentMethod || "unknown";
    paymentBreakdown[key] ??= { count: 0, amount: 0 };
    paymentBreakdown[key].count += 1;
    paymentBreakdown[key].amount += item.amount;
  }

  return {
    date: requestedDate,
    branchId: branchId || null,
    items,
    summary: {
      totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
      totalSales: saleItems.reduce((sum, item) => sum + item.amount, 0),
      totalRentals: rentalItems.reduce((sum, item) => sum + item.amount, 0),
      transactionCount: items.length,
      paymentBreakdown,
    },
  };
});
