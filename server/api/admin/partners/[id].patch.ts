/**
 * PATCH /api/admin/partners/:id
 *
 * Partial update of a partner profile — only keys present in body are changed.
 *
 * Handles special toggles:
 *   isPublic    — visibility gate (true = published, false = archived)
 *   isVerified  — auto-stamps verified_at=now() on true; nulls it on false
 *
 * Returns: { item: AdminPartnerRow }
 * Errors:  400 if id missing, 404 if not found, 409 on slug conflict,
 *          422 on validation failure, 500 on DB error
 */
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_DETAIL_SELECT,
  buildPartnerUpdatePayload,
  mapAdminPartnerDetail,
  validateCategoryKeyForDirectoryType,
} from "~~/server/utils/admin-partners";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const payload = buildPartnerUpdatePayload(body);

  // Category-prefix cross-validation: if main_category_key is being changed,
  // validate it against the effective directory_type (from payload or DB).
  if ("main_category_key" in payload) {
    const effectiveDirectoryType =
      typeof payload.directory_type === "string"
        ? (payload.directory_type as "store" | "service" | "contractor")
        : null;

    if (effectiveDirectoryType) {
      // directory_type also in this PATCH — validate immediately
      validateCategoryKeyForDirectoryType(
        effectiveDirectoryType,
        payload.main_category_key as string | null,
      );
    } else {
      // directory_type NOT in this PATCH — fetch current value from DB
      const { data: current, error: fetchErr } = await adminClient
        .from("partner_profiles")
        .select("directory_type")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) {
        throw createError({ statusCode: 500, statusMessage: fetchErr.message });
      }
      if (!current) {
        throw createError({
          statusCode: 404,
          statusMessage: "Partner profile not found",
        });
      }
      validateCategoryKeyForDirectoryType(
        current.directory_type as "store" | "service" | "contractor",
        payload.main_category_key as string | null,
      );
    }
  }

  const { data, error } = await adminClient
    .from("partner_profiles")
    .update(payload)
    .eq("id", id)
    .select(ADMIN_PARTNER_DETAIL_SELECT)
    .maybeSingle();

  if (error) {
    throw createError({
      statusCode: error.code === "23505" ? 409 : 500,
      statusMessage:
        error.code === "23505"
          ? "Slug is already taken by another partner profile"
          : error.message,
    });
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Partner profile not found",
    });
  }

  return {
    item: mapAdminPartnerDetail(data as Record<string, unknown>),
  };
});
