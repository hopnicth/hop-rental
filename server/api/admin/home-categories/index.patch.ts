import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import { asNonEmptyString } from "~~/server/utils/admin-catalog";
import {
  buildHomeCategoryGroupPayload,
  buildHomeCategoryOptionPayload,
} from "~~/server/utils/home-categories";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;
  const resource = body.resource;
  const id = asNonEmptyString(body.id, "id");

  if (resource === "group") {
    const { error } = await adminClient
      .from("home_category_groups")
      .update(buildHomeCategoryGroupPayload(body))
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    return { ok: true };
  }

  if (resource === "option") {
    const { error } = await adminClient
      .from("home_category_options")
      .update(buildHomeCategoryOptionPayload(body))
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message });
    }
    return { ok: true };
  }

  throw createError({ statusCode: 422, statusMessage: "Unsupported resource" });
});