import { createError, defineEventHandler } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  isMissingCustomerTaxProfilesTable,
  mapCustomerTaxProfile,
  USER_TAX_PROFILE_SELECT,
} from "~~/server/utils/user-tax-profile";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const client = serverSupabaseServiceRole(event);
  const { data, error } = await client
    .from("customer_tax_profiles")
    .select(USER_TAX_PROFILE_SELECT)
    .eq("customer_user_id", userId)
    .eq("is_default", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    if (isMissingCustomerTaxProfilesTable(error)) {
      return { available: false, profile: null };
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return {
    available: true,
    profile: mapCustomerTaxProfile(Array.isArray(data) ? data[0] : null),
  };
});
