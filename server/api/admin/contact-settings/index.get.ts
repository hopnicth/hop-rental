import { createError, defineEventHandler } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  isMissingPublicContactSettingsTable,
  mapPublicContactSettings,
  publicContactFallback,
} from "~~/server/utils/public-contact-settings";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const client = adminClient as any;
  const { data, error } = await client
    .from("public_contact_settings")
    .select("support_phone, line_url, updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (isMissingPublicContactSettingsTable(error)) {
      return { item: publicContactFallback(), migrationRequired: true };
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return {
    item: mapPublicContactSettings(data as Record<string, unknown> | null),
    migrationRequired: false,
  };
});
