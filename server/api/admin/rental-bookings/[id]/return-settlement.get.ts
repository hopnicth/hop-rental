/**
 * GET /api/admin/rental-bookings/:id/return-settlement
 *
 * Preview data for the T2 return-settlement panel: the LEDGER-true held
 * total (same source the migration-125 RPC uses as writer authority) plus
 * any existing settlement row. Display-only — the RPC recomputes.
 *
 * Auth: requirePlatformAdmin.
 * Returns: { heldTotal, currencyCode, settlement: {...} | null }
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  RENTAL_HELD_BALANCE_EVENT_SELECT,
} from "~~/server/utils/rental-held-balance-events";
import { buildRentalHeldBalanceSummary } from "~~/server/utils/rental-held-balance-summary";

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

  return {
    heldTotal: summary.currentHeldBalanceAvailableAmount,
    currencyCode: summary.currencyCode ?? "THB",
    settlement: settlement ?? null,
    returnChecklistComplete: !!checklist,
  };
});
