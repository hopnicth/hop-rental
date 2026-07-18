import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { isMissingRentalBookingColumn } from "~~/server/utils/admin-orders";

type Row = Record<string, unknown>;

const POS_RENTAL_EXPORT_SELECT =
  "id, created_at, walk_in_phone, user_id, asset_code, asset_name, rental_days, rental_total, deposit_paid_amount, deposit_payment_method, deposit_refund_status, deposit_refund_amount, checkout_total_amount, checkout_paid_amount, checkout_payment_method, pos_branch_id, pos_branch_code, pos_branch_name";

const POS_RENTAL_EXPORT_SELECT_WITHOUT_REFUND_AMOUNT =
  "id, created_at, walk_in_phone, user_id, asset_code, asset_name, rental_days, rental_total, deposit_paid_amount, deposit_payment_method, deposit_refund_status, checkout_total_amount, checkout_paid_amount, checkout_payment_method, pos_branch_id, pos_branch_code, pos_branch_name";

const CSV_HEADERS = [
  "Date",
  "Branch",
  "Document Type",
  "Document No",
  "Customer",
  "SKU/Asset",
  "Description",
  "Quantity/Days",
  "Unit Price",
  "VAT 7%",
  "WHT",
  "Total Amount",
  "Paid Amount",
  "Payment Method",
  "Refund Status",
  "Refund Amount",
  "Additional Collection",
  "Settlement Ref",
];

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function csv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function vatIncluded(total: number): number {
  return Math.round(((total * 7) / 107) * 100) / 100;
}

function isMissingRefundAmountColumn(error: unknown): boolean {
  return isMissingRentalBookingColumn(error, [
    "rental_bookings.deposit_refund_amount",
    "deposit_refund_amount",
  ]);
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const query = getQuery(event);
  const dateFrom = asText(query.dateFrom);
  const dateTo = asText(query.dateTo);
  const branchId = asText(query.branchId);

  let ordersQuery = adminClient
    .from("orders")
    .select(
      "id, order_number, created_at, walk_in_phone, user_id, grand_total, pos_paid_amount, pos_payment_method, pos_branch_id, pos_branch_code, pos_branch_name, order_items(sku_id, name, quantity, unit_price, line_total)",
    )
    .order("created_at", { ascending: false })
    .limit(2000);

  const buildRentalsQuery = (select: string) => {
    let rentalsQuery = adminClient
      .from("rental_bookings")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (dateFrom) rentalsQuery = rentalsQuery.gte("created_at", dateFrom);
    if (dateTo)
      rentalsQuery = rentalsQuery.lte("created_at", `${dateTo}T23:59:59`);
    if (branchId) rentalsQuery = rentalsQuery.eq("pos_branch_id", branchId);
    return rentalsQuery;
  };

  if (dateFrom) {
    ordersQuery = ordersQuery.gte("created_at", dateFrom);
  }
  if (dateTo) {
    ordersQuery = ordersQuery.lte("created_at", `${dateTo}T23:59:59`);
  }
  if (branchId) {
    ordersQuery = ordersQuery.eq("pos_branch_id", branchId);
  }

  const [ordersResult, initialRentalsResult] = await Promise.all([
    ordersQuery,
    buildRentalsQuery(POS_RENTAL_EXPORT_SELECT),
  ]);
  let rentalsResult = initialRentalsResult;
  if (rentalsResult.error && isMissingRefundAmountColumn(rentalsResult.error)) {
    rentalsResult = await buildRentalsQuery(
      POS_RENTAL_EXPORT_SELECT_WITHOUT_REFUND_AMOUNT,
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

  const lines: unknown[][] = [CSV_HEADERS];
  for (const order of (ordersResult.data ?? []) as Row[]) {
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    for (const item of items as Row[]) {
      const total = money(item.line_total);
      lines.push([
        asText(order.created_at).slice(0, 10),
        asText(order.pos_branch_name) || asText(order.pos_branch_code),
        "POS Sale",
        asText(order.order_number) || asText(order.id),
        asText(order.walk_in_phone) || asText(order.user_id),
        asText(item.sku_id),
        asText(item.name),
        money(item.quantity),
        money(item.unit_price).toFixed(2),
        vatIncluded(total).toFixed(2),
        "0.00",
        total.toFixed(2),
        money(order.pos_paid_amount || order.grand_total).toFixed(2),
        asText(order.pos_payment_method),
        "",
        "0.00",
        "0.00",
        "",
      ]);
    }
  }

  // T2 settlement-first read (decisions.md §b addendum): for settled
  // bookings the settlement row is the money truth; legacy deposit_refund_*
  // stays authoritative ONLY for bookings without a settlement (pre-T2 /
  // POS v1 flows, where those columns are accurate).
  const rentalRows = (rentalsResult.data ?? []) as Row[];
  const settlementsByBooking = new Map<string, Row>();
  if (rentalRows.length > 0) {
    const { data: settlementRows, error: settlementError } = await adminClient
      .from("rental_booking_settlements")
      .select(
        "id, booking_id, refund_amount, additional_collection_amount, settlement_applied_amount",
      )
      .in(
        "booking_id",
        rentalRows.map((r) => asText(r.id)).filter(Boolean),
      );
    if (settlementError) {
      throw createError({
        statusCode: 500,
        statusMessage: settlementError.message,
      });
    }
    for (const row of (settlementRows ?? []) as Row[]) {
      settlementsByBooking.set(asText(row.booking_id), row);
    }
  }

  for (const rental of rentalRows) {
    const total =
      money(rental.checkout_total_amount) || money(rental.rental_total);
    const settlement = settlementsByBooking.get(asText(rental.id)) ?? null;
    const refundStatus = settlement
      ? money(settlement.refund_amount) > 0
        ? "refunded"
        : money(settlement.additional_collection_amount) > 0
          ? "collected_additional"
          : "settled_even"
      : asText(rental.deposit_refund_status);
    const refundAmount = settlement
      ? money(settlement.refund_amount)
      : money(rental.deposit_refund_amount);
    lines.push([
      asText(rental.created_at).slice(0, 10),
      asText(rental.pos_branch_name) || asText(rental.pos_branch_code),
      "POS Rental",
      asText(rental.id),
      asText(rental.walk_in_phone) || asText(rental.user_id),
      asText(rental.asset_code),
      asText(rental.asset_name),
      money(rental.rental_days),
      money(rental.rental_total).toFixed(2),
      vatIncluded(total).toFixed(2),
      "0.00",
      total.toFixed(2),
      money(rental.checkout_paid_amount || rental.deposit_paid_amount).toFixed(
        2,
      ),
      asText(rental.checkout_payment_method || rental.deposit_payment_method),
      refundStatus,
      refundAmount.toFixed(2),
      settlement
        ? money(settlement.additional_collection_amount).toFixed(2)
        : "0.00",
      settlement ? asText(settlement.id) : "",
    ]);
  }

  setHeader(event, "content-type", "text/csv; charset=utf-8");
  setHeader(
    event,
    "content-disposition",
    `attachment; filename="pos-accounting-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  return `\uFEFF${lines.map((line) => line.map(csv).join(",")).join("\n")}`;
});
