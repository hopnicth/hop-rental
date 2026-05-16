import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  assertPickupReadinessBranchAccess,
  loadRentalPickupReadiness,
} from "~~/server/utils/rental-pickup-readiness";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const bookingId = getRouterParam(event, "id");
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "Booking id is required" });
  }

  const readiness = await loadRentalPickupReadiness({ adminClient, bookingId });
  await assertPickupReadinessBranchAccess({
    adminClient,
    userId,
    platformRole,
    branchId: readiness.rental.branchId,
  });

  return { readiness };
});