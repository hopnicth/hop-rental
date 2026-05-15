import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  isMissingCustomerTaxProfilesTable,
  mapCustomerTaxProfile,
  requireCustomerTaxProfileInput,
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

  const body = (await readBody(event)) as Record<string, unknown>;
  const payload = requireCustomerTaxProfileInput(body);
  const client = serverSupabaseServiceRole(event);

  const { data: existing, error: existingError } = await client
    .from("customer_tax_profiles")
    .select("id")
    .eq("customer_user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  if (existingError) {
    if (isMissingCustomerTaxProfilesTable(existingError)) {
      throw createError({
        statusCode: 503,
        statusMessage: "Migration 068 is required",
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: existingError.message,
    });
  }

  const dbPayload = {
    customer_user_id: userId,
    company_id: null,
    walk_in_phone: null,
    customer_kind: payload.customerKind,
    legal_name: payload.legalName,
    tax_id: payload.taxId,
    tax_id_normalized: payload.taxIdNormalized,
    branch_type: payload.branchType,
    branch_code: payload.branchCode,
    billing_address: payload.billingAddress,
    phone: payload.phone,
    email: payload.email,
    review_status: "draft",
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: "",
    is_default: true,
    updated_by: userId,
  };

  const mutation = existing?.id
    ? await client
        .from("customer_tax_profiles")
        .update(dbPayload)
        .eq("id", existing.id)
        .eq("customer_user_id", userId)
        .eq("is_default", true)
    : await client.from("customer_tax_profiles").insert({
        ...dbPayload,
        created_by: userId,
      });

  if (mutation.error) {
    throw createError({
      statusCode: 500,
      statusMessage: mutation.error.message,
    });
  }

  const { data: saved, error: savedError } = await client
    .from("customer_tax_profiles")
    .select(USER_TAX_PROFILE_SELECT)
    .eq("customer_user_id", userId)
    .eq("is_default", true)
    .single();

  if (savedError) {
    throw createError({ statusCode: 500, statusMessage: savedError.message });
  }

  return { available: true, profile: mapCustomerTaxProfile(saved) };
});
