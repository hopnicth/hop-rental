import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const { error } = await adminClient
    .from("assets")
    .delete()
    .eq("id", id);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { ok: true };
});
