import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getMixedCheckoutUserId } from "~~/server/utils/mixed-checkout";
import { loadCustomerOfficialDocument } from "~~/server/utils/customer-rental-booking-detail";

export default defineEventHandler(async (event) => {
  const userId = getMixedCheckoutUserId(await serverSupabaseUser(event));
  if (!userId)
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  const documentId = getRouterParam(event, "id");
  if (!documentId)
    throw createError({ statusCode: 400, statusMessage: "Document id is required" });
  const document = await loadCustomerOfficialDocument(
    serverSupabaseServiceRole(event),
    documentId,
    userId,
  );
  return { document };
});