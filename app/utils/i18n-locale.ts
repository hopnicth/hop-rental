import type { LocaleCode } from "~/types/locale";

export const DEFAULT_LOCALE: LocaleCode = "th";
export const SUPPORTED_LOCALE_CODES = ["th", "en", "cn", "jp"] as const;

/**
 * Locales that are actually selectable in the UI right now. `cn`/`jp` remain
 * registered in nuxt.config + have locale JSON, but are temporarily disabled:
 * any stored/aliased cn/jp value is folded back to DEFAULT_LOCALE below.
 */
export const ENABLED_LOCALE_CODES: readonly LocaleCode[] = ["th", "en"];

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
  const base = normalized.split("-")[0] ?? "";
  const resolved =
    normalized in LOCALE_ALIASES
      ? LOCALE_ALIASES[normalized]
      : (LOCALE_ALIASES[base] ?? null);
  if (resolved === null) return null;
  // Fold disabled locales (cn/jp) back to the default so stale cookies or
  // Accept-Language hints can't select a hidden locale.
  return ENABLED_LOCALE_CODES.includes(resolved) ? resolved : DEFAULT_LOCALE;
}
