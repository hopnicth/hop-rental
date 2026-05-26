import type { PartnerCard } from "~/types/partner";

/**
 * useHomePartners — fetches the Home Partner Network section data.
 *
 * Calls GET /api/partners/home which returns a daily-shuffled sample of
 * public partner profiles (featured first). Thin wrapper around useAsyncData;
 * does NOT reuse usePublicPartners because that composable carries interactive
 * directory filter state (q, directoryType, category, serviceArea, pagination)
 * which is irrelevant on the Home page.
 *
 * searchKeywords is intentionally absent: it is a server-side-only filter field
 * and is never present in PartnerCard or any public API response.
 */

const HOME_PARTNERS_CARDS_KEY = "home:partner-cards";
const DEFAULT_LIMIT = 15;

export function useHomePartners(limit = DEFAULT_LIMIT) {
  const { data, pending, error, refresh } = useAsyncData<{
    items: PartnerCard[];
  }>(
    HOME_PARTNERS_CARDS_KEY,
    () =>
      $fetch<{ items: PartnerCard[] }>("/api/partners/home", {
        query: { limit },
      }),
    {
      default: () => ({ items: [] as PartnerCard[] }),
    },
  );

  const partners = computed<PartnerCard[]>(() => data.value?.items ?? []);

  return {
    partners,
    pending,
    error,
    refresh,
  };
}
