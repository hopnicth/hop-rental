import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import type {
  RentalDepositPaymentMethod,
  RentalDepositPaymentStatus,
} from "~~/app/types/rental-booking";

interface DepositUpdatePayload {
  depositPaidAmount?: number;
  depositPaymentMethod?: RentalDepositPaymentMethod | null;
  depositPaymentStatus?: RentalDepositPaymentStatus | null;
  depositNotes?: string | null;
  reason?: string | null;
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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId: staffUserId } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "booking id required" });
  }

  const body = ((await readBody(event)) ?? {}) as DepositUpdatePayload;
  const amount = money(body.depositPaidAmount);
  const methodValue = text(body.depositPaymentMethod);
  const statusValue = text(body.depositPaymentStatus);
  const paymentMethod = PAYMENT_METHODS.has(methodValue)
    ? (methodValue as RentalDepositPaymentMethod)
    : null;
  const paymentStatus = PAYMENT_STATUSES.has(statusValue)
    ? (statusValue as RentalDepositPaymentStatus)
    : amount > 0
      ? "paid"
      : "unpaid";

  if (amount > 0 && !paymentMethod) {
    throw createError({
      statusCode: 422,
      statusMessage: "Payment method is required when deposit amount is paid",
    });
  }

  const { data: current, error: currentError } = await adminClient
    .from("rental_bookings")
    .select(
      "id, rental_total, deposit_amount, deposit_paid_amount, deposit_payment_method, deposit_payment_status, deposit_notes, checkout_total_amount, checkout_paid_amount, checkout_payment_method, pos_branch_id",
    )
    .eq("id", bookingId)
    .single();

  if (currentError || !current) {
    throw createError({
      statusCode: 404,
      statusMessage: currentError?.message ?? "Booking not found",
    });
  }

  const rentalTotal = money(current.rental_total);
  const checkoutTotal = rentalTotal + amount;
  const payload = {
    deposit_paid_amount: amount,
    deposit_payment_method: paymentMethod,
    deposit_payment_status: paymentStatus,
    deposit_refund_status: amount > 0 ? "not_refunded" : "not_applicable",
    deposit_paid_at: amount > 0 ? new Date().toISOString() : null,
    deposit_notes: text(body.depositNotes) || null,
    checkout_total_amount: checkoutTotal,
    checkout_paid_amount: checkoutTotal,
    checkout_payment_method: paymentMethod,
  };

  const oldValues = {
    depositAmount: money(current.deposit_amount),
    depositPaidAmount: money(current.deposit_paid_amount),
    depositPaymentMethod: text(current.deposit_payment_method) || null,
    depositPaymentStatus: text(current.deposit_payment_status) || "unpaid",
    depositNotes: text(current.deposit_notes) || null,
    checkoutTotalAmount: money(current.checkout_total_amount),
    checkoutPaidAmount: money(current.checkout_paid_amount),
    checkoutPaymentMethod: text(current.checkout_payment_method) || null,
  };

  const { data: updated, error: updateError } = await adminClient
    .from("rental_bookings")
    .update(payload)
    .eq("id", bookingId)
    .select(
      "id, deposit_amount, deposit_paid_amount, deposit_payment_method, deposit_payment_status, deposit_notes, checkout_total_amount, checkout_paid_amount, checkout_payment_method",
    )
    .single();

  if (updateError || !updated) {
    throw createError({
      statusCode: 500,
      statusMessage: updateError?.message ?? "Deposit update failed",
    });
  }

  const newValues = {
    depositAmount: money(updated.deposit_amount),
    depositPaidAmount: money(updated.deposit_paid_amount),
    depositPaymentMethod: text(updated.deposit_payment_method) || null,
    depositPaymentStatus: text(updated.deposit_payment_status) || "unpaid",
    depositNotes: text(updated.deposit_notes) || null,
    checkoutTotalAmount: money(updated.checkout_total_amount),
    checkoutPaidAmount: money(updated.checkout_paid_amount),
    checkoutPaymentMethod: text(updated.checkout_payment_method) || null,
  };

  const { error: logError } = await adminClient
    .from("rental_booking_deposit_action_logs")
    .insert({
      booking_id: bookingId,
      action: "manual_update",
      staff_user_id: staffUserId,
      branch_id: text(current.pos_branch_id) || null,
      old_values: oldValues,
      new_values: newValues,
      change_summary: `Deposit paid amount ${oldValues.depositPaidAmount} -> ${newValues.depositPaidAmount}`,
      reason: text(body.reason) || null,
    });

  if (logError) {
    throw createError({ statusCode: 500, statusMessage: logError.message });
  }

  return { booking: updated, log: { action: "manual_update" } };
});