import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

type Row = Record<string, unknown>;

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

  let rentalsQuery = adminClient
    .from("rental_bookings")
    .select(
      "id, created_at, walk_in_phone, user_id, asset_code, asset_name, rental_days, rental_total, deposit_paid_amount, deposit_payment_method, checkout_total_amount, checkout_paid_amount, checkout_payment_method, pos_branch_id, pos_branch_code, pos_branch_name",
    )
    .order("created_at", { ascending: false })
    .limit(2000);

  if (dateFrom) {
    ordersQuery = ordersQuery.gte("created_at", dateFrom);
    rentalsQuery = rentalsQuery.gte("created_at", dateFrom);
  }
  if (dateTo) {
    ordersQuery = ordersQuery.lte("created_at", `${dateTo}T23:59:59`);
    rentalsQuery = rentalsQuery.lte("created_at", `${dateTo}T23:59:59`);
  }
  if (branchId) {
    ordersQuery = ordersQuery.eq("pos_branch_id", branchId);
    rentalsQuery = rentalsQuery.eq("pos_branch_id", branchId);
  }

  const [ordersResult, rentalsResult] = await Promise.all([ordersQuery, rentalsQuery]);
  if (ordersResult.error) {
    throw createError({ statusCode: 500, statusMessage: ordersResult.error.message });
  }
  if (rentalsResult.error) {
    throw createError({ statusCode: 500, statusMessage: rentalsResult.error.message });
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
      ]);
    }
  }

  for (const rental of (rentalsResult.data ?? []) as Row[]) {
    const total = money(rental.checkout_total_amount) || money(rental.rental_total);
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
      money(rental.checkout_paid_amount || rental.deposit_paid_amount).toFixed(2),
      asText(rental.checkout_payment_method || rental.deposit_payment_method),
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