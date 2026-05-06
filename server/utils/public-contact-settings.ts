export const DEFAULT_SUPPORT_PHONE = "+66 95-479-2333";
export const DEFAULT_SUPPORT_LINE_URL =
  "https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url";

export type PublicContactSettings = {
  supportPhone: string;
  lineUrl: string;
  updatedAt: string | null;
};

export function publicContactFallback(): PublicContactSettings {
  return {
    supportPhone: DEFAULT_SUPPORT_PHONE,
    lineUrl: DEFAULT_SUPPORT_LINE_URL,
    updatedAt: null,
  };
}

export function mapPublicContactSettings(
  row: Record<string, unknown> | null | undefined,
): PublicContactSettings {
  return {
    supportPhone:
      typeof row?.support_phone === "string" && row.support_phone.trim()
        ? row.support_phone.trim()
        : DEFAULT_SUPPORT_PHONE,
    lineUrl:
      typeof row?.line_url === "string" && row.line_url.trim()
        ? row.line_url.trim()
        : DEFAULT_SUPPORT_LINE_URL,
    updatedAt: typeof row?.updated_at === "string" ? row.updated_at : null,
  };
}

export function isMissingPublicContactSettingsTable(error: unknown) {
  const err = error as { code?: string | null; message?: string | null } | null;
  return err?.code === "42P01" || err?.message?.includes("public_contact_settings") === true;
}

export function normalizeContactSetting(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}