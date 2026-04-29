import type { CookieRef } from "#app";

// ── Constants ───────────────────────────────────────────────
const CONSENT_COOKIE_NAME = "hop-rental-cookie-consent";
const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_DAYS = 180;

// ── Types ───────────────────────────────────────────────────
export type CookieCategory =
  | "necessary"
  | "analytics"
  | "preferences"
  | "marketing";

export type CookieCategoryState = Record<CookieCategory, boolean>;

export type CookieConsentRecord = {
  v: number;
  ts: string;
  categories: CookieCategoryState;
};

const NON_NECESSARY_CATEGORIES: CookieCategory[] = [
  "analytics",
  "preferences",
  "marketing",
];

function defaultCategories(): CookieCategoryState {
  return {
    necessary: true,
    analytics: false,
    preferences: false,
    marketing: false,
  };
}

function isValidRecord(value: unknown): value is CookieConsentRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CookieConsentRecord>;
  if (record.v !== CONSENT_VERSION) return false;
  if (typeof record.ts !== "string") return false;
  const cats = record.categories;
  if (!cats || typeof cats !== "object") return false;
  return (
    typeof cats.necessary === "boolean" &&
    typeof cats.analytics === "boolean" &&
    typeof cats.preferences === "boolean" &&
    typeof cats.marketing === "boolean"
  );
}

// ── Composable ──────────────────────────────────────────────
export function useCookieConsent() {
  const consentCookie = useCookie<CookieConsentRecord | null>(
    CONSENT_COOKIE_NAME,
    {
      maxAge: 60 * 60 * 24 * CONSENT_MAX_AGE_DAYS,
      sameSite: "lax",
      secure: true,
      path: "/",
      default: () => null,
    },
  ) as CookieRef<CookieConsentRecord | null>;

  // Drop stale records (e.g. older policy version)
  if (consentCookie.value && !isValidRecord(consentCookie.value)) {
    consentCookie.value = null;
  }

  const isPreferencesOpen = useState<boolean>(
    "cookie-consent:preferences-open",
    () => false,
  );

  const hasResponded = computed<boolean>(
    () => isValidRecord(consentCookie.value),
  );

  const categories = computed<CookieCategoryState>(() => {
    const stored = consentCookie.value;
    if (stored && isValidRecord(stored)) {
      return { ...stored.categories, necessary: true };
    }
    return defaultCategories();
  });

  function persist(next: CookieCategoryState) {
    consentCookie.value = {
      v: CONSENT_VERSION,
      ts: new Date().toISOString(),
      categories: { ...next, necessary: true },
    };
  }

  function acceptAll() {
    persist({
      necessary: true,
      analytics: true,
      preferences: true,
      marketing: true,
    });
    isPreferencesOpen.value = false;
  }

  function rejectNonEssential() {
    persist(defaultCategories());
    isPreferencesOpen.value = false;
  }

  function savePreferences(next: Partial<CookieCategoryState>) {
    persist({
      ...defaultCategories(),
      ...categories.value,
      ...next,
      necessary: true,
    });
    isPreferencesOpen.value = false;
  }

  function openPreferences() {
    isPreferencesOpen.value = true;
  }

  function closePreferences() {
    isPreferencesOpen.value = false;
  }

  function isAllowed(category: CookieCategory): boolean {
    if (category === "necessary") return true;
    return categories.value[category] === true;
  }

  return {
    hasResponded,
    categories,
    isPreferencesOpen,
    nonNecessaryCategories: NON_NECESSARY_CATEGORIES,
    acceptAll,
    rejectNonEssential,
    savePreferences,
    openPreferences,
    closePreferences,
    isAllowed,
  };
}
