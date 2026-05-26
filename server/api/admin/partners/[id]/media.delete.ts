/**
 * DELETE /api/admin/partners/:id/media
 *
 * Remove a partner's thumbnail or cover image.
 *
 * Body: { kind: "thumbnail" | "cover" }
 *
 * Behaviour:
 *   1. Fetches the current image URL for the given kind.
 *   2. Removes the storage object (best-effort; does not fail if already gone).
 *   3. Sets thumbnail_image_url or cover_image_url to NULL.
 *   4. The main (gallery) image column is never modified.
 *
 * Returns: { item: AdminPartnerRow, ok: true }
 */
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_DETAIL_SELECT,
  mapAdminPartnerDetail,
} from "~~/server/utils/admin-partners";
import {
  asPartnerUploadKind,
  removePartnerMediaByPublicUrl,
} from "~~/server/utils/partner-media";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const body = (await readBody<{ kind?: unknown }>(event)) ?? {};
  const kind = asPartnerUploadKind(body.kind);

  // ── Fetch current image URL ────────────────────────────────────────────
  const { data: existing, error: fetchError } = await adminClient
    .from("partner_profiles")
    .select("id, thumbnail_image_url, cover_image_url")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message });
  }
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "Partner profile not found",
    });
  }

  // ── Best-effort storage removal ────────────────────────────────────────
  const currentUrl =
    kind === "thumbnail"
      ? existing.thumbnail_image_url
      : existing.cover_image_url;

  await removePartnerMediaByPublicUrl(adminClient, currentUrl, id);

  // ── Null out the column (main gallery image is never touched) ────────────
  const updateField =
    kind === "thumbnail" ? "thumbnail_image_url" : "cover_image_url";

  const { data: updated, error: updateError } = await adminClient
    .from("partner_profiles")
    .update({ [updateField]: null })
    .eq("id", id)
    .select(ADMIN_PARTNER_DETAIL_SELECT)
    .single();

  if (updateError || !updated) {
    throw createError({
      statusCode: 500,
      statusMessage: updateError?.message ?? "Failed to update partner profile",
    });
  }

  return {
    item: mapAdminPartnerDetail(updated as Record<string, unknown>),
    ok: true,
  };
});
