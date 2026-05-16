import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  buildRentalMoneySummary,
  buildRentalSettlementPreview,
  loadRentalMoneySummaryInput,
} from "~~/server/utils/rental-money-summary";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }

  const input = await loadRentalMoneySummaryInput({ adminClient, bookingId });
  const moneySummary = buildRentalMoneySummary(input);
  const settlementPreview = buildRentalSettlementPreview({
    summary: moneySummary,
    paymentLines: input.paymentLines,
  });

  return {
    moneySummary,
    settlementPreview,
  };
});