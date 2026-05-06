import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  DEFAULT_SUPPORT_LINE_URL,
  DEFAULT_SUPPORT_PHONE,
  isMissingPublicContactSettingsTable,
  mapPublicContactSettings,
  normalizeContactSetting,
} from "~~/server/utils/public-contact-settings";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;
  const payload = {
    id: true,
    support_phone: normalizeContactSetting(body.supportPhone, DEFAULT_SUPPORT_PHONE),
    line_url: normalizeContactSetting(body.lineUrl, DEFAULT_SUPPORT_LINE_URL),
    updated_by: userId,
  };

  const client = adminClient as any;
  const { data, error } = await client
    .from("public_contact_settings")
    .upsert(payload, { onConflict: "id" })
    .select("support_phone, line_url, updated_at")
    .single();

  if (error) {
    if (isMissingPublicContactSettingsTable(error)) {
      throw createError({
        statusCode: 503,
        statusMessage: "Migration 053 is required before saving contact settings",
      });
    }
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { item: mapPublicContactSettings(data as Record<string, unknown>) };
});