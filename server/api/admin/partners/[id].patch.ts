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
  asPartnerSecondaryCategoryKeys,
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

  // ── Unified effective-state category cross-validation ────────────────────
  //
  // Runs whenever directoryType, mainCategoryKey, or secondaryCategoryKeys is
  // included in the PATCH. Computes the "effective" post-PATCH values:
  //   effectiveDirectoryType   = body.directoryType   ?? existing.directory_type
  //   effectiveMainCategoryKey = body.mainCategoryKey ?? existing.main_category_key
  //
  // Validates:
  //   1. effectiveMainCategoryKey prefix matches effectiveDirectoryType
  //   2. every secondary key prefix matches effectiveDirectoryType
  //   3. no secondary key equals effectiveMainCategoryKey
  //
  // A single DB fetch is made only when effective values cannot be derived from
  // the payload alone (i.e. either directoryType or mainCategoryKey is absent).
  const hasCategoryPatch =
    "directory_type" in payload ||
    "main_category_key" in payload ||
    "secondary_category_keys" in payload;

  if (hasCategoryPatch) {
    const needsExisting =
      !("directory_type" in payload) || !("main_category_key" in payload);

    let effectiveDirectoryType: "store" | "service" | "contractor";
    let effectiveMainCategoryKey: string | null;

    if (needsExisting) {
      const { data: existing, error: fetchErr } = await adminClient
        .from("partner_profiles")
        .select("directory_type, main_category_key")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) {
        throw createError({ statusCode: 500, statusMessage: fetchErr.message });
      }
      if (!existing) {
        throw createError({
          statusCode: 404,
          statusMessage: "Partner profile not found",
        });
      }

      effectiveDirectoryType = (
        "directory_type" in payload
          ? payload.directory_type
          : existing.directory_type
      ) as "store" | "service" | "contractor";

      effectiveMainCategoryKey = (
        "main_category_key" in payload
          ? payload.main_category_key
          : existing.main_category_key
      ) as string | null;
    } else {
      // Both directoryType and mainCategoryKey are in the payload — no DB fetch needed.
      effectiveDirectoryType = payload.directory_type as
        | "store"
        | "service"
        | "contractor";
      effectiveMainCategoryKey = payload.main_category_key as string | null;
    }

    // 1. Effective mainCategoryKey must be compatible with effective directoryType.
    validateCategoryKeyForDirectoryType(
      effectiveDirectoryType,
      effectiveMainCategoryKey,
    );

    // 2 & 3. Secondary keys must match effective directoryType and not overlap
    //        with effective mainCategoryKey.
    if ("secondary_category_keys" in payload) {
      payload.secondary_category_keys = asPartnerSecondaryCategoryKeys(
        payload.secondary_category_keys,
        effectiveDirectoryType,
        effectiveMainCategoryKey,
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
