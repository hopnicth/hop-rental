import { mockBannerSlides } from "~/mock/banners";

/**
 * Composable for loading banner slides.
 * Currently uses mock data — replace with useFetch() when Admin dashboard / API is ready.
 */
export function useBanners() {
  const router = useRouter();
  const availablePaths = computed(
    () => new Set(router.getRoutes().map((route) => route.path)),
  );

  // ── TODO: replace with useFetch('/api/banners') when API is ready ──
  const allSlides = ref(mockBannerSlides);

  function hasRoute(linkUrl: string) {
    if (!linkUrl.startsWith("/")) return true;

    return availablePaths.value.has(linkUrl);
  }

  /** Active slides sorted by sortOrder (ready for display) */
  const bannerSlides = computed(() =>
    allSlides.value
      .filter((slide) => slide.isActive && hasRoute(slide.linkUrl))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  return {
    bannerSlides,
  };
}
