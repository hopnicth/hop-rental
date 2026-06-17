/**
 * Central manual payment request — domain logic.
 *
 * A manual_payment_requests row is ONE bank-transfer amount the customer pays now,
 * allocated across the sale order and/or rental booking deposit(s) it covers
 * (manual_payment_request_items), with ONE slip-evidence trail
 * (manual_payment_request_slips).
 *
 * Covers:
 *  - SELECT strings + safe mappers (header / item)
 *  - createManualPaymentRequestFromTargets — build/reuse a request from the
 *    sale order + draft booking targets the cart already created. Authoritative
 *    amounts computed server-side; client amounts never trusted.
 *  - assembleManualPaymentRequestDetail — owner-scoped detail (items, slips,
 *    related target summaries, bank-account config).
 *  - listManualPaymentRequests — owner-scoped (or admin) list.
 *  - reviewManualPaymentRequest / rejectManualPaymentRequest — admin evidence
 *    decisions ONLY.
 *
 * INVARIANTS — this module is EVIDENCE ONLY. It NEVER marks an order paid, NEVER
 * confirms a booking, NEVER deducts inventory, NEVER writes a rental held-balance
 * event, NEVER touches Omise/KYC. Admin confirms the sale/booking via the EXISTING
 * admin actions; review/reject here only advance payment-request/slip status.
 */
import { createError } from "h3";
import { calculateBookingDepositDueNow } from "~/utils/rental-payment-lines";
import {
  HOPNIC_PAYMENT_ACCOUNT,
  HOPNIC_PAYMENT_ACCOUNT_IS_PLACEHOLDER,
} from "~/utils/payment-account";
import {
  MANUAL_PAYMENT_SLIP_SAFE_SELECT,
  toSafeManualPaymentSlip,
  asUuidOrNull,
} from "~~/server/utils/manual-payment-request-slip-evidence";

type Row = Record<string, unknown>;
type AnyClient = { from(table: string): any };

// ── Status sets ────────────────────────────────────────────────────────────────

/** A request whose customer can still pay / upload (no terminal state). */
export const REQUEST_ACTIVE_STATUSES = ["awaiting_payment", "pending_review"] as const;
/** A request a slip can (still) be uploaded against (incl. re-upload after reject). */
export const REQUEST_UPLOADABLE_STATUSES = [
  "awaiting_payment",
  "pending_review",
  "rejected",
] as const;

export type ManualPaymentSourceType = "sale_only" | "booking_only" | "mixed";

// ── SELECT strings ───────────────────────────────────────────────────────────

export const MANUAL_PAYMENT_REQUEST_SELECT =
  "id, customer_id, source_type, status, payment_method, currency, total_amount_due, customer_note, admin_note, submitted_at, reviewed_at, reviewed_by, rejected_at, rejected_by, rejected_reason, created_at, updated_at";

export const MANUAL_PAYMENT_REQUEST_ITEM_SELECT =
  "id, payment_request_id, target_type, target_id, amount_due, label, description, metadata, created_at";

// ── Mappers ─────────────────────────────────────────────────────────────────

export interface ManualPaymentRequestSummary {
  id: string;
  customerId: string;
  sourceType: string;
  status: string;
  paymentMethod: string;
  currency: string;
  totalAmountDue: number;
  customerNote: string | null;
  adminNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mapManualPaymentRequest(row: Row): ManualPaymentRequestSummary {
  return {
    id: String(row.id ?? ""),
    customerId: String(row.customer_id ?? ""),
    sourceType: String(row.source_type ?? ""),
    status: String(row.status ?? ""),
    paymentMethod: String(row.payment_method ?? "bank_transfer"),
    currency: String(row.currency ?? "THB"),
    totalAmountDue: Number(row.total_amount_due ?? 0),
    customerNote: typeof row.customer_note === "string" ? row.customer_note : null,
    adminNote: typeof row.admin_note === "string" ? row.admin_note : null,
    submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : null,
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    rejectedAt: typeof row.rejected_at === "string" ? row.rejected_at : null,
    rejectedReason:
      typeof row.rejected_reason === "string" ? row.rejected_reason : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export interface ManualPaymentRequestItem {
  id: string;
  targetType: string;
  targetId: string;
  amountDue: number;
  label: string;
  description: string | null;
  metadata: Record<string, unknown>;
}

export function mapManualPaymentRequestItem(row: Row): ManualPaymentRequestItem {
  return {
    id: String(row.id ?? ""),
    targetType: String(row.target_type ?? ""),
    targetId: String(row.target_id ?? ""),
    amountDue: Number(row.amount_due ?? 0),
    label: String(row.label ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

// ── Create / reuse ─────────────────────────────────────────────────────────────

export interface CreateManualPaymentRequestInput {
  userId: string;
  orderId?: string | null;
  bookingIds?: string[];
  customerNote?: string | null;
}

interface PlannedItem {
  target_type: "sale_order" | "rental_booking_deposit";
  target_id: string;
  amount_due: number;
  label: string;
  description: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Build (or reuse) a manual payment request from targets the cart already created:
 * an unpaid sale order and/or draft rental booking(s). Amounts are authoritative
 * (read from the targets). Ownership + eligibility are enforced before any write.
 *
 * Reuse: if an ACTIVE request owned by this customer already covers EXACTLY the
 * same target set, it is returned instead of creating a duplicate (safe re-checkout).
 *
 * NEVER marks the order paid / confirms a booking / deducts inventory.
 */
export async function createManualPaymentRequestFromTargets(
  client: AnyClient,
  input: CreateManualPaymentRequestInput,
): Promise<{ paymentRequestId: string; reused: boolean }> {
  const userId = asUuidOrNull(input.userId);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }
  const orderId = asUuidOrNull(input.orderId ?? null);
  const bookingIds = Array.from(
    new Set(
      (input.bookingIds ?? [])
        .map((b) => asUuidOrNull(b))
        .filter((b): b is string => Boolean(b)),
    ),
  );
  if (!orderId && bookingIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "NO_PAYMENT_TARGETS" });
  }

  const planned: PlannedItem[] = [];
  let currency = "THB";

  // ── Sale order target ────────────────────────────────────────────────────
  if (orderId) {
    const { data: order, error } = await client
      .from("orders")
      .select(
        "id, user_id, order_number, payment_status, grand_total, shipping_cost, currency_code",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) {
      throw createError({ statusCode: 500, statusMessage: "ORDER_READ_FAILED" });
    }
    if (!order) {
      throw createError({ statusCode: 404, statusMessage: "Order not found" });
    }
    if (String(order.user_id ?? "") !== userId) {
      throw createError({ statusCode: 403, statusMessage: "Access denied" });
    }
    if (
      !["awaiting_payment", "pending_review"].includes(
        String(order.payment_status ?? ""),
      )
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: "ORDER_NOT_ELIGIBLE_FOR_PAYMENT_REQUEST",
      });
    }
    currency = String(order.currency_code ?? currency);
    const amount = money(order.grand_total);
    if (amount <= 0) {
      throw createError({
        statusCode: 422,
        statusMessage: "ORDER_TOTAL_NOT_POSITIVE",
      });
    }
    const orderNumber = String(order.order_number ?? "");
    planned.push({
      target_type: "sale_order",
      target_id: orderId,
      amount_due: amount,
      label: orderNumber ? `Order ${orderNumber}` : "Products & shipping",
      description: null,
      metadata: { shipping: money(order.shipping_cost), orderNumber },
    });
  }

  // ── Rental booking deposit targets ─────────────────────────────────────────
  for (const bookingId of bookingIds) {
    const { data: booking, error } = await client
      .from("rental_bookings")
      .select(
        "id, user_id, status, rental_days, deposit_amount, currency_code, asset_name, matched_product_name, product_name",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "BOOKING_READ_FAILED",
      });
    }
    if (!booking) {
      throw createError({ statusCode: 404, statusMessage: "Booking not found" });
    }
    if (String(booking.user_id ?? "") !== userId) {
      throw createError({ statusCode: 403, statusMessage: "Access denied" });
    }
    if (String(booking.status ?? "") !== "draft") {
      throw createError({
        statusCode: 422,
        statusMessage: "BOOKING_NOT_ELIGIBLE_FOR_PAYMENT_REQUEST",
      });
    }
    currency = String(booking.currency_code ?? currency);
    const deposit = calculateBookingDepositDueNow({
      rentalDays: Number(booking.rental_days ?? 0),
      requiredSecurityDepositAmount: money(booking.deposit_amount),
    });
    if (deposit <= 0) {
      // Same-day / no deposit due — nothing to collect for this booking.
      continue;
    }
    const name =
      String(booking.asset_name ?? "") ||
      String(booking.matched_product_name ?? "") ||
      String(booking.product_name ?? "") ||
      "Booking Deposit";
    planned.push({
      target_type: "rental_booking_deposit",
      target_id: bookingId,
      amount_due: deposit,
      label: name,
      description: null,
      metadata: {
        rentalDays: Number(booking.rental_days ?? 0),
        securityDepositTotal: money(booking.deposit_amount),
      },
    });
  }

  if (planned.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "NO_AMOUNT_DUE_FOR_TARGETS",
    });
  }

  const total =
    Math.round(planned.reduce((sum, p) => sum + p.amount_due, 0) * 100) / 100;
  const hasSale = planned.some((p) => p.target_type === "sale_order");
  const hasBooking = planned.some(
    (p) => p.target_type === "rental_booking_deposit",
  );
  const sourceType: ManualPaymentSourceType =
    hasSale && hasBooking ? "mixed" : hasSale ? "sale_only" : "booking_only";

  // ── Reuse: an active request covering EXACTLY this target set ──────────────
  const requestedTargets = new Set(planned.map((p) => p.target_id));
  const reusedId = await findReusableRequestId(
    client,
    userId,
    requestedTargets,
  );
  if (reusedId) {
    return { paymentRequestId: reusedId, reused: true };
  }

  // ── Insert header + items ──────────────────────────────────────────────────
  const { data: header, error: headerError } = await client
    .from("manual_payment_requests")
    .insert({
      customer_id: userId,
      source_type: sourceType,
      status: "awaiting_payment",
      payment_method: "bank_transfer",
      currency,
      total_amount_due: total,
      customer_note:
        typeof input.customerNote === "string" && input.customerNote.trim()
          ? input.customerNote.trim().slice(0, 1000)
          : null,
    })
    .select("id")
    .single();
  if (headerError || !header?.id) {
    console.error("[payments] request insert failed", headerError?.message);
    throw createError({
      statusCode: 500,
      statusMessage: "PAYMENT_REQUEST_CREATE_FAILED",
    });
  }
  const paymentRequestId = String(header.id);

  const { error: itemsError } = await client
    .from("manual_payment_request_items")
    .insert(
      planned.map((p) => ({ payment_request_id: paymentRequestId, ...p })),
    );
  if (itemsError) {
    console.error("[payments] request items insert failed", itemsError.message);
    throw createError({
      statusCode: 500,
      statusMessage: "PAYMENT_REQUEST_ITEMS_FAILED",
    });
  }

  return { paymentRequestId, reused: false };
}

/**
 * Return the id of an active (awaiting_payment | pending_review) request owned by
 * this customer whose item target-set is exactly `requestedTargets`, else null.
 */
async function findReusableRequestId(
  client: AnyClient,
  userId: string,
  requestedTargets: Set<string>,
): Promise<string | null> {
  const targetList = [...requestedTargets];
  const { data: matchingItems, error } = await client
    .from("manual_payment_request_items")
    .select("payment_request_id, target_id")
    .in("target_id", targetList);
  if (error || !matchingItems?.length) return null;

  const candidateIds = Array.from(
    new Set(
      (matchingItems as Row[]).map((r) => String(r.payment_request_id ?? "")),
    ),
  ).filter(Boolean);
  if (candidateIds.length === 0) return null;

  const { data: requests } = await client
    .from("manual_payment_requests")
    .select("id, customer_id, status")
    .in("id", candidateIds);
  const activeOwned = ((requests ?? []) as Row[]).filter(
    (r) =>
      String(r.customer_id ?? "") === userId &&
      (REQUEST_ACTIVE_STATUSES as readonly string[]).includes(
        String(r.status ?? ""),
      ),
  );
  if (activeOwned.length === 0) return null;

  for (const req of activeOwned) {
    const reqId = String(req.id);
    const { data: items } = await client
      .from("manual_payment_request_items")
      .select("target_id")
      .eq("payment_request_id", reqId);
    const ids = new Set(
      ((items ?? []) as Row[]).map((r) => String(r.target_id ?? "")),
    );
    if (
      ids.size === requestedTargets.size &&
      [...requestedTargets].every((t) => ids.has(t))
    ) {
      return reqId;
    }
  }
  return null;
}

// ── Detail assembly ─────────────────────────────────────────────────────────

export interface ManualPaymentRequestDetailOptions {
  /** When true, ownership is NOT enforced (admin path). */
  admin?: boolean;
  /** Customer id that must own the request (customer path). */
  ownerUserId?: string;
}

/**
 * Load a request + items + slips (+ related target summaries + bank config).
 * Customer path enforces ownership (403 on mismatch); admin path skips it.
 */
export async function assembleManualPaymentRequestDetail(
  client: AnyClient,
  paymentRequestId: string,
  options: ManualPaymentRequestDetailOptions,
) {
  const id = asUuidOrNull(paymentRequestId);
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_PAYMENT_REQUEST_ID",
    });
  }

  const { data: header, error } = await client
    .from("manual_payment_requests")
    .select(MANUAL_PAYMENT_REQUEST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw createError({ statusCode: 500, statusMessage: "PAYMENT_REQUEST_READ_FAILED" });
  }
  if (!header) {
    throw createError({ statusCode: 404, statusMessage: "Payment request not found" });
  }
  const request = mapManualPaymentRequest(header as Row);
  if (!options.admin) {
    if (!options.ownerUserId || request.customerId !== options.ownerUserId) {
      throw createError({ statusCode: 403, statusMessage: "Access denied" });
    }
  }

  const [{ data: itemRows }, { data: slipRows }] = await Promise.all([
    client
      .from("manual_payment_request_items")
      .select(MANUAL_PAYMENT_REQUEST_ITEM_SELECT)
      .eq("payment_request_id", id)
      .order("created_at", { ascending: true }),
    client
      .from("manual_payment_request_slips")
      .select(MANUAL_PAYMENT_SLIP_SAFE_SELECT)
      .eq("payment_request_id", id)
      .order("uploaded_at", { ascending: false }),
  ]);

  const items = ((itemRows ?? []) as Row[]).map(mapManualPaymentRequestItem);
  const slips = ((slipRows ?? []) as Row[]).map(toSafeManualPaymentSlip);

  const orderIds = items
    .filter((i) => i.targetType === "sale_order")
    .map((i) => i.targetId);
  const bookingIds = items
    .filter((i) => i.targetType === "rental_booking_deposit")
    .map((i) => i.targetId);

  const saleOrders = orderIds.length
    ? await loadSaleOrderSummaries(client, orderIds)
    : [];
  const bookings = bookingIds.length
    ? await loadBookingSummaries(client, bookingIds)
    : [];

  return {
    paymentRequest: request,
    items,
    slips,
    saleOrders,
    bookings,
    bankAccount: {
      accountName: HOPNIC_PAYMENT_ACCOUNT.accountName,
      bankName: HOPNIC_PAYMENT_ACCOUNT.bankName,
      accountNumber: HOPNIC_PAYMENT_ACCOUNT.accountNumber,
      isPlaceholder: HOPNIC_PAYMENT_ACCOUNT_IS_PLACEHOLDER,
    },
  };
}

async function loadSaleOrderSummaries(client: AnyClient, orderIds: string[]) {
  const { data } = await client
    .from("orders")
    .select(
      "id, order_number, status, payment_status, grand_total, shipping_cost, currency_code, created_at",
    )
    .in("id", orderIds);
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id ?? ""),
    orderNumber: String(r.order_number ?? ""),
    status: String(r.status ?? ""),
    paymentStatus: String(r.payment_status ?? ""),
    grandTotal: Number(r.grand_total ?? 0),
    shippingCost: Number(r.shipping_cost ?? 0),
    currencyCode: String(r.currency_code ?? "THB"),
    createdAt: String(r.created_at ?? ""),
  }));
}

async function loadBookingSummaries(client: AnyClient, bookingIds: string[]) {
  const { data } = await client
    .from("rental_bookings")
    .select(
      "id, status, booking_deposit_payment_status, asset_name, matched_product_name, product_name, start_date, hub_name, currency_code",
    )
    .in("id", bookingIds);
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id ?? ""),
    status: String(r.status ?? ""),
    depositPaymentStatus: String(r.booking_deposit_payment_status ?? "unpaid"),
    itemName:
      String(r.asset_name ?? "") ||
      String(r.matched_product_name ?? "") ||
      String(r.product_name ?? ""),
    startDate: String(r.start_date ?? ""),
    hubName: String(r.hub_name ?? ""),
    currencyCode: String(r.currency_code ?? "THB"),
  }));
}

// ── List ────────────────────────────────────────────────────────────────────

export interface ListManualPaymentRequestsInput {
  ownerUserId?: string; // customer path: restrict to this customer
  status?: string | null;
  sourceType?: string | null;
  customerId?: string | null; // admin filter
  page?: number;
  pageSize?: number;
}

/**
 * List payment requests (newest first) with a lightweight item summary and a
 * slipExists flag. ownerUserId restricts to one customer (customer path).
 */
export async function listManualPaymentRequests(
  client: AnyClient,
  input: ListManualPaymentRequestsInput,
) {
  const page = Math.max(0, Number(input.page ?? 0));
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));

  let query = client
    .from("manual_payment_requests")
    .select(MANUAL_PAYMENT_REQUEST_SELECT)
    .order("created_at", { ascending: false });

  if (input.ownerUserId) query = query.eq("customer_id", input.ownerUserId);
  if (input.customerId) query = query.eq("customer_id", input.customerId);
  if (input.status) query = query.eq("status", input.status);
  if (input.sourceType) query = query.eq("source_type", input.sourceType);

  const { data, error } = await query;
  if (error) {
    throw createError({ statusCode: 500, statusMessage: "PAYMENT_REQUEST_LIST_FAILED" });
  }
  const all = ((data ?? []) as Row[]).map(mapManualPaymentRequest);
  const start = page * pageSize;
  const pageItems = all.slice(start, start + pageSize);
  const ids = pageItems.map((r) => r.id);

  const itemSummariesByRequest = new Map<string, ManualPaymentRequestItem[]>();
  const slipExistsByRequest = new Set<string>();
  if (ids.length) {
    const [{ data: itemRows }, { data: slipRows }] = await Promise.all([
      client
        .from("manual_payment_request_items")
        .select(MANUAL_PAYMENT_REQUEST_ITEM_SELECT)
        .in("payment_request_id", ids),
      client
        .from("manual_payment_request_slips")
        .select("payment_request_id")
        .in("payment_request_id", ids),
    ]);
    for (const row of (itemRows ?? []) as Row[]) {
      const reqId = String(row.payment_request_id ?? "");
      const list = itemSummariesByRequest.get(reqId) ?? [];
      list.push(mapManualPaymentRequestItem(row));
      itemSummariesByRequest.set(reqId, list);
    }
    for (const row of (slipRows ?? []) as Row[]) {
      slipExistsByRequest.add(String(row.payment_request_id ?? ""));
    }
  }

  return {
    items: pageItems.map((r) => ({
      ...r,
      items: itemSummariesByRequest.get(r.id) ?? [],
      slipExists: slipExistsByRequest.has(r.id),
      link: `/user/payments/${r.id}`,
    })),
    total: all.length,
    page,
    pageSize,
    hasMore: start + pageSize < all.length,
  };
}

// ── Related-request lookup (for order / rental detail pages) ─────────────────

/**
 * Find the most recent payment request (owner-scoped) that includes a given
 * target (sale_order or rental_booking_deposit). Returns a minimal summary +
 * link, or null. Used by order/rental detail pages to show a "related payment
 * request" card without duplicating the central upload UX.
 */
export async function findCustomerRequestByTarget(
  client: AnyClient,
  ownerUserId: string,
  targetType: "sale_order" | "rental_booking_deposit",
  targetId: string,
): Promise<{
  id: string;
  status: string;
  sourceType: string;
  totalAmountDue: number;
  currency: string;
  link: string;
} | null> {
  const tId = asUuidOrNull(targetId);
  const uId = asUuidOrNull(ownerUserId);
  if (!tId || !uId) return null;

  const { data: items } = await client
    .from("manual_payment_request_items")
    .select("payment_request_id")
    .eq("target_type", targetType)
    .eq("target_id", tId);
  const requestIds = Array.from(
    new Set(((items ?? []) as Row[]).map((r) => String(r.payment_request_id ?? ""))),
  ).filter(Boolean);
  if (requestIds.length === 0) return null;

  const { data: requests } = await client
    .from("manual_payment_requests")
    .select(MANUAL_PAYMENT_REQUEST_SELECT)
    .in("id", requestIds)
    .eq("customer_id", uId)
    .order("created_at", { ascending: false });
  const rows = (requests ?? []) as Row[];
  if (rows.length === 0) return null;

  const r = mapManualPaymentRequest(rows[0]!);
  return {
    id: r.id,
    status: r.status,
    sourceType: r.sourceType,
    totalAmountDue: r.totalAmountDue,
    currency: r.currency,
    link: `/user/payments/${r.id}`,
  };
}

// ── Admin evidence decisions (status only) ───────────────────────────────────

/**
 * Mark the payment EVIDENCE reviewed. Sets request.status = reviewed and the
 * latest pending slip → reviewed. Does NOT mark the order paid or confirm the
 * booking — admin still uses the existing sale/rental admin actions.
 */
export async function reviewManualPaymentRequest(
  client: AnyClient,
  paymentRequestId: string,
  reviewedBy: string,
  adminNote?: string | null,
) {
  const id = asUuidOrNull(paymentRequestId);
  if (!id) throw createError({ statusCode: 400, statusMessage: "INVALID_PAYMENT_REQUEST_ID" });
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("manual_payment_requests")
    .update({
      status: "reviewed",
      reviewed_at: nowIso,
      reviewed_by: reviewedBy,
      ...(typeof adminNote === "string" ? { admin_note: adminNote.slice(0, 2000) } : {}),
    })
    .eq("id", id)
    .select(MANUAL_PAYMENT_REQUEST_SELECT)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) throw createError({ statusCode: 404, statusMessage: "Payment request not found" });

  await client
    .from("manual_payment_request_slips")
    .update({ status: "reviewed", reviewed_at: nowIso, reviewed_by: reviewedBy })
    .eq("payment_request_id", id)
    .eq("status", "pending_review");

  return mapManualPaymentRequest(data as Row);
}

/**
 * Reject the payment EVIDENCE. Sets request.status = rejected (+ reason) and the
 * latest pending slip → rejected. Does NOT cancel the order/booking.
 */
export async function rejectManualPaymentRequest(
  client: AnyClient,
  paymentRequestId: string,
  rejectedBy: string,
  reason: string,
) {
  const id = asUuidOrNull(paymentRequestId);
  if (!id) throw createError({ statusCode: 400, statusMessage: "INVALID_PAYMENT_REQUEST_ID" });
  const trimmed = (reason ?? "").trim();
  if (!trimmed) {
    throw createError({ statusCode: 400, statusMessage: "REJECT_REASON_REQUIRED" });
  }
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("manual_payment_requests")
    .update({
      status: "rejected",
      rejected_at: nowIso,
      rejected_by: rejectedBy,
      rejected_reason: trimmed.slice(0, 2000),
    })
    .eq("id", id)
    .select(MANUAL_PAYMENT_REQUEST_SELECT)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) throw createError({ statusCode: 404, statusMessage: "Payment request not found" });

  await client
    .from("manual_payment_request_slips")
    .update({
      status: "rejected",
      rejected_at: nowIso,
      rejected_by: rejectedBy,
      rejected_reason: trimmed.slice(0, 2000),
    })
    .eq("payment_request_id", id)
    .eq("status", "pending_review");

  return mapManualPaymentRequest(data as Row);
}
