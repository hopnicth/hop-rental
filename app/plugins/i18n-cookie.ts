import { isRef, watch, type Ref } from "vue";
import {
  DEFAULT_LOCALE,
  LEGACY_I18N_COOKIE_NAME,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
} from "~/utils/i18n-locale";
import type { LocaleCode } from "~/types/locale";

type I18nRuntime = {
  locale: Ref<string> | string;
  setLocale?: (locale: LocaleCode) => Promise<void> | void;
};

const LOCALE_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  path: "/",
};

function getRuntimeLocale(i18n: I18nRuntime): string {
  return isRef(i18n.locale) ? i18n.locale.value : i18n.locale;
}

async function applyRuntimeLocale(
  i18n: I18nRuntime,
  locale: LocaleCode,
): Promise<void> {
  if (getRuntimeLocale(i18n) === locale) return;
  if (typeof i18n.setLocale === "function") {
    await i18n.setLocale(locale);
    return;
  }
  if (isRef(i18n.locale)) i18n.locale.value = locale;
}

/**
 * Locale persistence contract:
 * - Thai is the default unless the user has explicitly selected another locale.
 * - Browser Accept-Language must not override Thai on first visit.
 * - `hop_locale` is the canonical cookie. Legacy `i18n_redirected` is not
 *   trusted on initial load because it may contain browser-detected stale
 *   values; it is overwritten for compatibility after the locale is resolved.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  const i18n = nuxtApp.$i18n as unknown as I18nRuntime | undefined;
  if (!i18n) return;

  const localeCookie = useCookie<LocaleCode | null>(
    LOCALE_COOKIE_NAME,
    LOCALE_COOKIE_OPTIONS,
  );
  const legacyCookie = useCookie<string | null>(
    LEGACY_I18N_COOKIE_NAME,
    LOCALE_COOKIE_OPTIONS,
  );

  const selected = normalizeLocale(localeCookie.value) ?? DEFAULT_LOCALE;

  localeCookie.value = selected;
  legacyCookie.value = selected;
  await applyRuntimeLocale(i18n, selected);

  if (import.meta.client) {
    watch(
      () => normalizeLocale(getRuntimeLocale(i18n)) ?? DEFAULT_LOCALE,
      (next) => {
        localeCookie.value = next;
        legacyCookie.value = next;
      },
      { immediate: true },
    );
  }
});
