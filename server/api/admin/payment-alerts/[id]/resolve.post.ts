import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PAYMENT_ALERT_SELECT,
  mapAdminPaymentAlert,
} from "~~/server/utils/admin-alerts";
import type { AdminPaymentAlert } from "~~/app/types/admin-order-detail";

export default defineEventHandler(async (event): Promise<AdminPaymentAlert> => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id required" });
  }

  const { data, error } = await adminClient
    .from("payment_alerts")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", id)
    .eq("audience", "admin")
    .is("resolved_at", null)
    .select(ADMIN_PAYMENT_ALERT_SELECT)
    .maybeSingle();

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Alert not found or already resolved",
    });
  }

  return mapAdminPaymentAlert(data);
});
