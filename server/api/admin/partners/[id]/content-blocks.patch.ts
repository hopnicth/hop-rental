/**
 * PATCH /api/admin/partners/:id/content-blocks
 *
 * Replace the full content_blocks array for a partner profile.
 *
 * Body: { contentBlocks: PartnerContentBlock[] }
 *
 * Behaviour:
 *   - Validates the full array with validatePartnerContentBlocks().
 *   - Replaces content_blocks atomically — no partial merging.
 *   - Does NOT modify any other column (basic info, media, KYC, etc.).
 *
 * Returns: { item: AdminPartnerRow }
 * Errors:  400 if id missing, 404 if partner not found,
 *          422 if validation fails, 500 on DB error
 */
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_DETAIL_SELECT,
  mapAdminPartnerDetail,
  validatePartnerContentBlocks,
} from "~~/server/utils/admin-partners";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const body = (await readBody<{ contentBlocks?: unknown }>(event)) ?? {};

  // ── Validate ───────────────────────────────────────────────────────────
  const contentBlocks = validatePartnerContentBlocks(
    body.contentBlocks ?? [],
  );

  // ── Verify partner exists ──────────────────────────────────────────────
  const { data: existing, error: fetchError } = await adminClient
    .from("partner_profiles")
    .select("id")
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

  // ── Update content_blocks only ─────────────────────────────────────────
  const { data: updated, error: updateError } = await adminClient
    .from("partner_profiles")
    .update({ content_blocks: contentBlocks })
    .eq("id", id)
    .select(ADMIN_PARTNER_DETAIL_SELECT)
    .single();

  if (updateError || !updated) {
    throw createError({
      statusCode: 500,
      statusMessage:
        updateError?.message ?? "Failed to update partner content blocks",
    });
  }

  return {
    item: mapAdminPartnerDetail(updated as Record<string, unknown>),
  };
});
