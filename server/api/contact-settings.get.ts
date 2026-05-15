import { defineEventHandler } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  isMissingPublicContactSettingsTable,
  mapPublicContactSettings,
  publicContactFallback,
} from "~~/server/utils/public-contact-settings";

export default defineEventHandler(async (event) => {
  const client = serverSupabaseServiceRole(event);
  const { data, error } = await client
    .from("public_contact_settings")
    .select("support_phone, line_url, updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (isMissingPublicContactSettingsTable(error)) {
      return publicContactFallback();
    }
    return publicContactFallback();
  }

  return mapPublicContactSettings(data as Record<string, unknown> | null);
});
