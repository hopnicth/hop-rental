import type { LocaleCode } from "~/types/locale";

export const DEFAULT_LOCALE: LocaleCode = "th";
export const SUPPORTED_LOCALE_CODES = ["th", "en", "cn", "jp"] as const;
export const LOCALE_COOKIE_NAME = "hop_locale";

/** Nuxt i18n's default cookie name; keep overwriting it so stale values stop winning. */
export const LEGACY_I18N_COOKIE_NAME = "i18n_redirected";

const LOCALE_ALIASES: Record<string, LocaleCode> = {
  th: "th",
  "th-th": "th",
  en: "en",
  "en-us": "en",
  "en-gb": "en",
  cn: "cn",
  zh: "cn",
  "zh-cn": "cn",
  "zh-hans": "cn",
  jp: "jp",
  ja: "jp",
  "ja-jp": "jp",
};

export function normalizeLocale(value: unknown): LocaleCode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  if (!normalized) return null;
  if (normalized in LOCALE_ALIASES) return LOCALE_ALIASES[normalized];
  const base = normalized.split("-")[0] ?? "";
  return LOCALE_ALIASES[base] ?? null;
}
