/**
 * POST /api/admin/partners
 *
 * Create a new partner profile.
 *
 * Required body fields: slug, directoryType, nameTh
 * Returns: { item: AdminPartnerRow }
 * Errors:  409 on duplicate slug, 422 on validation failure, 500 on DB error
 */
import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_DETAIL_SELECT,
  buildPartnerCreatePayload,
  mapAdminPartnerDetail,
} from "~~/server/utils/admin-partners";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const payload = buildPartnerCreatePayload(body);

  const { data, error } = await adminClient
    .from("partner_profiles")
    .insert(payload)
    .select(ADMIN_PARTNER_DETAIL_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : 500,
      statusMessage:
        error?.code === "23505"
          ? `Slug "${payload.slug}" is already taken`
          : (error?.message ?? "Failed to create partner profile"),
    });
  }

  return {
    item: mapAdminPartnerDetail(data as Record<string, unknown>),
  };
});
