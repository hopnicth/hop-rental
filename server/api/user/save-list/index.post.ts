import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  groupSaveListItems,
  isMissingSaveListTable,
  mapSaveListItems,
  requireSaveListItemId,
  requireSaveListItemType,
} from "~~/server/utils/user-save-list";

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
  const itemType = requireSaveListItemType(body.itemType);
  const itemId = requireSaveListItemId(body.itemId);
  const client = serverSupabaseServiceRole(event);

  if (itemType === "asset") {
    const { data: asset, error } = await client
      .from("assets")
      .select("id, status, is_hidden")
      .eq("id", itemId)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    if (!asset || asset.status !== "active" || asset.is_hidden === true) {
      throw createError({ statusCode: 404, statusMessage: "Asset not found" });
    }
  } else {
    const { data: service, error } = await client
      .from("content_pages")
      .select("id, content_type, is_active")
      .eq("id", itemId)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    if (
      !service ||
      service.content_type !== "service" ||
      service.is_active !== true
    ) {
      throw createError({
        statusCode: 404,
        statusMessage: "Service not found",
      });
    }
  }

  const idColumn = itemType === "asset" ? "asset_id" : "service_id";
  const { data: existing, error: existingError } = await client
    .from("user_save_list")
    .select("item_type, asset_id, service_id")
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq(idColumn, itemId)
    .maybeSingle();

  if (existingError) {
    if (isMissingSaveListTable(existingError)) {
      throw createError({
        statusCode: 503,
        statusMessage: "Migration 055 is required",
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: existingError.message,
    });
  }

  const saved = !existing;
  const mutation = existing
    ? await client
        .from("user_save_list")
        .delete()
        .eq("user_id", userId)
        .eq("item_type", itemType)
        .eq(idColumn, itemId)
    : await client.from("user_save_list").insert({
        user_id: userId,
        item_type: itemType,
        asset_id: itemType === "asset" ? itemId : null,
        service_id: itemType === "service" ? itemId : null,
      });

  if (mutation.error) {
    throw createError({
      statusCode: 500,
      statusMessage: mutation.error.message,
    });
  }

  const { data: rows } = await client
    .from("user_save_list")
    .select("item_type, asset_id, service_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return {
    itemType,
    itemId,
    saved,
    ...groupSaveListItems(mapSaveListItems(rows)),
  };
});
