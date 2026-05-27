import { createError, defineEventHandler } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  ADMIN_STORE_BRANCH_SELECT,
  mapAdminStoreBranchItem,
} from "~~/server/utils/admin-branches";

/**
 * Public storefront branches list — used by the cart hub selector.
 *
 * Returns only active branches with the localized display fields needed by
 * the booking pickup UI. No admin-only details are exposed.
 */
export default defineEventHandler(async (event) => {
  const adminClient = serverSupabaseServiceRole(event);

  const { data, error } = await adminClient
    .from("store_branches")
    .select(ADMIN_STORE_BRANCH_SELECT)
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order", { ascending: true })
    .order("name_th", { ascending: true });

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  const items = (data ?? []).map((row) => {
    const item = mapAdminStoreBranchItem(row);
    return {
      id: item.id,
      code: item.code,
      nameTh: item.nameTh,
      nameEn: item.nameEn,
      addressTh: item.addressTh,
      addressEn: item.addressEn,
      phone: item.phone,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    };
  });

  return { items };
});
