import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  HOME_CATEGORY_GROUP_SELECT,
  HOME_CATEGORY_OPTION_SELECT,
  buildHomeCategoryGroupPayload,
  buildHomeCategoryOptionPayload,
  mapHomeCategoryGroup,
  mapHomeCategoryOption,
} from "~~/server/utils/home-categories";
import { asNonEmptyString } from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;
  const resource = body.resource;

  if (resource === "group") {
    const { data, error } = await adminClient
      .from("home_category_groups")
      .insert(buildHomeCategoryGroupPayload(body))
      .select(HOME_CATEGORY_GROUP_SELECT)
      .single();

    if (error) {
      throw createError({
        statusCode: error.code === "23505" ? 409 : 500,
        statusMessage: error.message,
      });
    }

    return { item: mapHomeCategoryGroup(data as Record<string, unknown>) };
  }

  if (resource === "option") {
    const groupId = asNonEmptyString(body.groupId, "groupId");
    const { data, error } = await adminClient
      .from("home_category_options")
      .insert({ group_id: groupId, ...buildHomeCategoryOptionPayload(body) })
      .select(HOME_CATEGORY_OPTION_SELECT)
      .single();

    if (error) {
      throw createError({
        statusCode: error.code === "23505" ? 409 : 500,
        statusMessage: error.message,
      });
    }

    return { item: mapHomeCategoryOption(data as Record<string, unknown>) };
  }

  throw createError({ statusCode: 422, statusMessage: "Unsupported resource" });
});
