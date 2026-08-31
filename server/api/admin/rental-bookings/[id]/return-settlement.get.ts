/**
 * GET /api/admin/rental-bookings/:id/return-settlement
 *
 * Preview data for the T2 return-settlement panel: the LEDGER-true held
 * total (same source the migration-125 RPC uses as writer authority) plus
 * any existing settlement row. Display-only — the RPC recomputes.
 *
 * [146] Also carries the two things the LAUNCH panel cannot know on its own:
 *   depositsEnabled — the server-authoritative deposit regime flag
 *                     (f_deposits_enabled, mig 135). The panel hides the
 *                     deposit-era inputs and the held-balance arithmetic behind
 *                     it: DISPLAY is gated, data is untouched (decisions.md
 *                     2026-07-26 addendum, deposit DATA vs deposit DISPLAY).
 *   preview         — the booked rental (the ONLY money item the web collects,
 *                     decisions.md 2026-07-27) plus the overdue days as a FACT.
 *                     No late charge is computed here or anywhere. Display only;
 *                     the RPC recomputes from the row it locks.
 *
 * Auth: requirePlatformAdmin.
 * Returns: { heldTotal, currencyCode, settlement, returnChecklistComplete,
 *            paymentState, depositsEnabled, preview }
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  RENTAL_HELD_BALANCE_EVENT_SELECT,
} from "~~/server/utils/rental-held-balance-events";
import { buildRentalHeldBalanceSummary } from "~~/server/utils/rental-held-balance-summary";
import { buildLaunchSettlementPreview } from "~~/server/utils/rental-return-settlement";
import { toBangkokLocalDate } from "~~/server/utils/rental-cancellation-policy";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const { data: events, error } = await adminClient
    .from("rental_held_balance_events")
    .select(RENTAL_HELD_BALANCE_EVENT_SELECT)
    .eq("rental_booking_id", bookingId);
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  const summary = buildRentalHeldBalanceSummary({
    rentalBookingId: bookingId,
    events: events ?? [],
  });

  const { data: settlement, error: settlementError } = await adminClient
    .from("rental_booking_settlements")
    .select(
      "id, held_total, penalty_lines, penalty_total, special_discount_amount, special_discount_note, settlement_applied_amount, refund_amount, additional_collection_amount, created_at",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (settlementError) {
    throw createError({
      statusCode: 500,
      statusMessage: settlementError.message,
    });
  }

  // Prereq surfacing: the fulfillment half requires a COMPLETED return
  // checklist — tell the panel so staff see the gate before submitting.
  const { data: checklist, error: checklistError } = await adminClient
    .from("rental_booking_checklists")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("kind", "return")
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();
  if (checklistError) {
    throw createError({ statusCode: 500, statusMessage: checklistError.message });
  }

  // [§8.9 half 2] Payment state (migration 133) — display-only, so the panel
  // can show the outstanding amount and gate the super-admin waive action.
  const { data: paymentState, error: paymentStateError } = await adminClient
    .from("rental_settlement_payment_states")
    .select("id, state, amount_due, amount_paid, currency_code, waived_at, waive_reason")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (paymentStateError) {
    throw createError({
      statusCode: 500,
      statusMessage: paymentStateError.message,
    });
  }

  // [146] Deposit regime — read through the RPC so the FAIL-CLOSED reader
  // (mig 135: absent or malformed config = GATED) stays the single authority.
  // An error here must not open the deposit surfaces, so it falls back to OFF.
  const { data: depositsEnabledRaw } = await adminClient.rpc(
    "f_deposits_enabled",
  );
  const depositsEnabled = depositsEnabledRaw === true;

  // [146] Launch preview inputs, derived server-side from the booking row.
  const { data: booking, error: bookingError } = await adminClient
    .from("rental_bookings")
    .select("rental_total, daily_rate, end_date")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  }
  const bookingRow = (booking ?? {}) as Record<string, unknown>;
  const preview = buildLaunchSettlementPreview({
    rentalTotal: bookingRow.rental_total,
    dailyRate: bookingRow.daily_rate,
    endDate:
      typeof bookingRow.end_date === "string" ? bookingRow.end_date : null,
    todayBangkok: toBangkokLocalDate(new Date()),
  });

  return {
    heldTotal: summary.currentHeldBalanceAvailableAmount,
    currencyCode: summary.currencyCode ?? "THB",
    settlement: settlement ?? null,
    returnChecklistComplete: !!checklist,
    paymentState: paymentState ?? null,
    depositsEnabled,
    preview,
  };
});
