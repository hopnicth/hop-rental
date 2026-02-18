import { mockBannerSlides } from '~/mock/banners';

/**
 * Composable for loading banner slides.
 * Currently uses mock data — replace with useFetch() when Admin dashboard / API is ready.
 */
export function useBanners() {
  // ── TODO: replace with useFetch('/api/banners') when API is ready ──
  const allSlides = ref(mockBannerSlides);

  /** Active slides sorted by sortOrder (ready for display) */
  const bannerSlides = computed(() =>
    allSlides.value
      .filter((slide) => slide.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  return {
    bannerSlides,
  };
}

