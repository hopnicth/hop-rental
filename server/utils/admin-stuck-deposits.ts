/**
 * B-M1 recovery surface (design §A, T3 walk 6): stuck paid_confirm_failed
 * bookings — money captured, confirmation stranded
 * (rental-booking-deposit-payment.ts markBookingDepositConfirmFailed;
 * mixed-checkout-finalization.ts:396-406).
 *
 * Two exits per ruling 4:
 *  - retry-confirm (here): T2 resume shape — VERIFY the stored money state
 *    first (ledger collection intact for the booking's payment source),
 *    re-execute ONLY the non-money half (confirmRentalBooking), then restore
 *    the 'paid' marker. A persisting conflict surfaces as 409 — retry never
 *    force-confirms over a real availability conflict. Not money-destructive
 *    → no §F operation (ruling: the log covers money-destructive ops).
 *  - refund: hands the booking to the walk-3 company-cancel machinery
 *    (super_admin, §F company_cancel) — proven there; the surface only
 *    routes to it.
 *
 * The list is a read surface → requirePlatformAdmin at the endpoint; the
 * ACTIONS carry their own gates (retry: platform admin; refund: super_admin
 * inside companyCancelRentalBooking).
 */
import { createError } from "h3";
import { asUuidOrNull } from "~~/server/utils/kyc-documents";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";

type Row = Record<string, unknown>;
type AnyClient = { from(table: string): any };

const STUCK_SELECT =
  "id, user_id, status, product_name, start_date, end_date, currency_code, booking_deposit_paid_amount, deposit_paid_amount, booking_deposit_payment_status, booking_deposit_confirm_failed_at, booking_deposit_confirm_failure_reason, booking_deposit_payment_attempt_id, booking_deposit_mixed_allocation_id";

const HELD_COLLECTION_TYPES = new Set([
  "booking_deposit_collection",
  "pickup_held_balance_collection",
  "same_day_held_balance_collection",
  "remaining_security_deposit_collection",
  "settlement_additional_collection",
]);

async function ledgerNetHeld(client: AnyClient, bookingId: string): Promise<number> {
  const { data, error } = await client
    .from("rental_held_balance_events")
    .select("event_type, amount, status")
    .eq("rental_booking_id", bookingId);
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return ((data ?? []) as Row[]).reduce((sum, row) => {
    if (row.status !== "posted") return sum;
    const amount = Number(row.amount ?? 0);
    return HELD_COLLECTION_TYPES.has(String(row.event_type))
      ? sum + amount
      : sum - amount;
  }, 0);
}

export interface StuckDepositBooking {
  id: string;
  productName: string;
  startDate: string;
  status: string;
  capturedAmount: number;
  ledgerHeld: number;
  currencyCode: string;
  failedAt: string | null;
  failureReason: string | null;
  paymentSource: "rental_booking_payment_attempt" | "mixed_payment_allocation" | "unresolved";
}

export async function listStuckDepositBookings(
  client: AnyClient,
): Promise<StuckDepositBooking[]> {
  // Stuck = money captured, confirmation stranded, AND the booking still
  // live. A cancelled booking has exited via the refund path (company
  // cancel keeps the paid_confirm_failed marker as payment history).
  const { data, error } = await client
    .from("rental_bookings")
    .select(STUCK_SELECT)
    .eq("booking_deposit_payment_status", "paid_confirm_failed")
    .in("status", ["draft", "confirmed"])
    .order("booking_deposit_confirm_failed_at", { ascending: true });
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  const rows = (data ?? []) as Row[];
  const items: StuckDepositBooking[] = [];
  for (const row of rows) {
    const id = String(row.id);
    items.push({
      id,
      productName: String(row.product_name ?? ""),
      startDate: String(row.start_date ?? ""),
      status: String(row.status ?? ""),
      capturedAmount:
        Number(row.booking_deposit_paid_amount ?? 0) ||
        Number(row.deposit_paid_amount ?? 0),
      ledgerHeld: await ledgerNetHeld(client, id),
      currencyCode: String(row.currency_code ?? "THB"),
      failedAt: (row.booking_deposit_confirm_failed_at as string) ?? null,
      failureReason:
        (row.booking_deposit_confirm_failure_reason as string) ?? null,
      paymentSource: row.booking_deposit_payment_attempt_id
        ? "rental_booking_payment_attempt"
        : row.booking_deposit_mixed_allocation_id
          ? "mixed_payment_allocation"
          : "unresolved",
    });
  }
  return items;
}

export async function retryConfirmStuckBooking(input: {
  client: AnyClient;
  rawBookingId: unknown;
  actorUserId: string;
}) {
  const bookingId = asUuidOrNull(input.rawBookingId);
  if (!bookingId)
    throw createError({ statusCode: 404, statusMessage: "Booking not found" });

  const { data: booking, error } = await input.client
    .from("rental_bookings")
    .select(STUCK_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!booking)
    throw createError({ statusCode: 404, statusMessage: "Booking not found" });
  const row = booking as Row;

  // Idempotent: an already-recovered booking is a no-op success.
  if (
    row.status === "confirmed" &&
    row.booking_deposit_payment_status === "paid"
  ) {
    return { ok: true, alreadyRecovered: true, bookingId };
  }
  if (row.booking_deposit_payment_status !== "paid_confirm_failed")
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_NOT_STUCK: nothing to retry",
    });

  // T2 resume shape — verify the STORED MONEY STATE before touching anything.
  const attemptId = String(row.booking_deposit_payment_attempt_id ?? "");
  const allocationId = String(row.booking_deposit_mixed_allocation_id ?? "");
  const sourceType = attemptId
    ? "rental_booking_payment_attempt"
    : allocationId
      ? "mixed_payment_allocation"
      : null;
  const sourceId = attemptId || allocationId;
  if (!sourceType)
    throw createError({
      statusCode: 409,
      statusMessage: "STUCK_PAYMENT_SOURCE_UNRESOLVED",
    });
  const held = await ledgerNetHeld(input.client, bookingId);
  if (held <= 0)
    throw createError({
      statusCode: 409,
      statusMessage: "STUCK_MONEY_STATE_MISSING: no held collection on the ledger",
    });

  // Re-execute ONLY the non-money half — same requirement shape as the
  // original call (rental-booking-deposit-payment.ts): the held-balance
  // event for this exact source must exist. A persisting availability
  // conflict throws 409 here — never force-confirmed.
  await confirmRentalBooking({
    adminClient: input.client as any,
    bookingId,
    userId: String(row.user_id ?? ""),
    requireBookingDepositPaid: false,
    requireBookingDepositHeldBalanceEvent: {
      sourceType,
      sourceId,
    },
    skipUserOwnershipCheck: true,
  });

  // Confirm succeeded → restore the 'paid' marker and clear failure fields.
  const { error: restoreError } = await input.client
    .from("rental_bookings")
    .update({
      booking_deposit_payment_status: "paid",
      booking_deposit_confirm_failed_at: null,
      booking_deposit_confirm_failure_reason: null,
    })
    .eq("id", bookingId)
    .eq("booking_deposit_payment_status", "paid_confirm_failed");
  if (restoreError)
    throw createError({ statusCode: 500, statusMessage: restoreError.message });

  return { ok: true, alreadyRecovered: false, bookingId, ledgerHeld: held };
}
