/**
 * POST /api/user/checkout-payment/slip
 *
 * Combined manual bank-transfer slip upload for a MIXED checkout: one customer
 * upload action that records pending_review payment evidence for the relevant
 * targets — the sale order and/or each rental booking deposit — using the SAME
 * uploaded file.
 *
 * There is no payment_group / combined-slip backend. The single upload is
 * represented as separate, per-target pending_review rows (mirrors the
 * single-target endpoints): one `sale_order_payment_slips` row for the order
 * and one `rental_booking_deposit_slips` row per booking, each storing the same
 * bytes in its own private bucket. This keeps sale vs booking-deposit
 * accounting/status distinct while the customer experiences one upload.
 *
 * Auth:    serverSupabaseUser + ownership on the order and every booking.
 * Input:   multipart/form-data — one file part + `orderId?` and/or
 *          `bookingIds` (comma-separated) text parts.
 * Returns: { sale: SafeSaleOrderPaymentSlip | null, rentals: SafeRentalDepositSlip[] }
 * Errors:  400 | 401 | 403 | 404 | 413 | 415 | 422 | 500
 *
 * Evidence-only. NEVER marks the order paid, NEVER confirms a booking, NEVER
 * deducts inventory, NEVER writes a rental held-balance event. Admin review is
 * the only path that advances state.
 */
import {
  createError,
  defineEventHandler,
  readMultipartFormData,
} from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  asUuidOrNull as asSaleUuid,
  uploadSaleOrderPaymentSlipEvidence,
  type SaleOrderPaymentSlipClient,
  type SafeSaleOrderPaymentSlip,
} from "~~/server/utils/sale-order-payment-slip-evidence";
import {
  uploadRentalDepositSlipEvidence,
  type RentalDepositSlipClient,
  type SafeRentalDepositSlip,
} from "~~/server/utils/rental-deposit-slip-evidence";

function readTextPart(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
): string {
  const raw = parts?.find((p) => p.name === name && !p.filename)?.data;
  return raw ? Buffer.from(raw).toString("utf8").trim() : "";
}

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const parts = await readMultipartFormData(event);
  const file = parts?.find((p) => p.filename && p.data);
  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: "SLIP_FILE_REQUIRED" });
  }
  const fileBytes = Buffer.from(file.data);
  const originalFilename = file.filename;

  const orderId = asSaleUuid(readTextPart(parts, "orderId"));
  const bookingIds = Array.from(
    new Set(
      readTextPart(parts, "bookingIds")
        .split(",")
        .map((s) => asSaleUuid(s))
        .filter((s): s is string => Boolean(s)),
    ),
  );

  if (!orderId && bookingIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "NO_PAYMENT_TARGETS",
    });
  }

  const client = serverSupabaseServiceRole(event);

  // ── Ownership + eligibility checks BEFORE any upload ──────────────────────
  if (orderId) {
    const { data: order, error } = await client
      .from("orders")
      .select("id, user_id, payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (error) {
      console.error("[checkout-payment] order read failed", error.message);
      throw createError({ statusCode: 500, statusMessage: "ORDER_READ_FAILED" });
    }
    if (!order) {
      throw createError({ statusCode: 404, statusMessage: "Order not found" });
    }
    if (String(order.user_id ?? "") !== String(userId)) {
      throw createError({ statusCode: 403, statusMessage: "Access denied" });
    }
    if (
      !["awaiting_payment", "pending_review"].includes(
        String(order.payment_status ?? ""),
      )
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: "ORDER_NOT_ELIGIBLE_FOR_SLIP_UPLOAD",
      });
    }
  }

  for (const bookingId of bookingIds) {
    const { data: booking, error } = await client
      .from("rental_bookings")
      .select("id, user_id, status")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) {
      console.error("[checkout-payment] booking read failed", error.message);
      throw createError({ statusCode: 500, statusMessage: "BOOKING_READ_FAILED" });
    }
    if (!booking) {
      throw createError({ statusCode: 404, statusMessage: "Booking not found" });
    }
    if (String(booking.user_id ?? "") !== String(userId)) {
      throw createError({ statusCode: 403, statusMessage: "Access denied" });
    }
    if (String(booking.status ?? "") !== "draft") {
      throw createError({
        statusCode: 422,
        statusMessage: "BOOKING_NOT_ELIGIBLE_FOR_SLIP_UPLOAD",
      });
    }
  }

  // ── Fan-out: same file → one pending_review row per target ────────────────
  let sale: SafeSaleOrderPaymentSlip | null = null;
  if (orderId) {
    sale = await uploadSaleOrderPaymentSlipEvidence(
      client as unknown as SaleOrderPaymentSlipClient,
      { orderId, uploadedBy: String(userId), fileBytes, originalFilename },
    );
    // Advance to pending_review (guarded → idempotent). Never marks paid.
    await client
      .from("orders")
      .update({ payment_status: "pending_review" })
      .eq("id", orderId)
      .eq("payment_status", "awaiting_payment");
  }

  const rentals: SafeRentalDepositSlip[] = [];
  for (const bookingId of bookingIds) {
    const slip = await uploadRentalDepositSlipEvidence(
      client as unknown as RentalDepositSlipClient,
      { bookingId, uploadedBy: String(userId), fileBytes, originalFilename },
    );
    rentals.push(slip);
  }

  return { sale, rentals };
});
