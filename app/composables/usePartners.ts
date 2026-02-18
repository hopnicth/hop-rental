import { mockPartners } from '~/mock/partners';

/**
 * Composable for loading partner brand items.
 * Currently uses mock data — replace with useFetch() when API is ready.
 *
 * Future flow:
 *   1. Fetch partner IDs from API
 *   2. For each ID, fetch image URL + link URL
 *   3. Return as IconSlideItem[]
 */
export function usePartners() {
  // ── TODO: replace with useFetch('/api/partners') when API is ready ──
  const partnerItems = ref(mockPartners);

  return {
    partnerItems,
  };
}

