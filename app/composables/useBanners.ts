import type { BannerSlide } from "~/types/banner";

const HOME_BANNERS_ONCE_KEY = "home:banners";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function localized(
  th: unknown,
  en: unknown,
  cn: unknown,
  jp: unknown,
  fallback: string,
) {
  const thValue = toString(th) ?? toString(en) ?? fallback;
  const enValue = toString(en) ?? toString(th) ?? fallback;

  return {
    th: thValue,
    en: enValue,
    cn: toString(cn) ?? enValue,
    jp: toString(jp) ?? enValue,
  };
}

function normalizeBannerRow(row: unknown) {
  if (!isRecord(row)) return null;

  const id = toString(row.id);
  const imageUrl = toString(row.image_url);
  const linkUrl = toString(row.link_url);
  if (!id || !imageUrl || !linkUrl) return null;

  const fallback = toString(row.title_en) ?? toString(row.title_th) ?? id;

  return {
    id,
    title: localized(
      row.title_th,
      row.title_en,
      row.title_cn,
      row.title_jp,
      fallback,
    ),
    subtitle: localized(
      row.subtitle_th,
      row.subtitle_en,
      row.subtitle_cn,
      row.subtitle_jp,
      fallback,
    ),
    ctaLabel: localized(
      row.cta_label_th,
      row.cta_label_en,
      row.cta_label_cn,
      row.cta_label_jp,
      "Learn more",
    ),
    imageUrl,
    mobileImageUrl: toString(row.mobile_image_url),
    linkUrl,
    linkTarget: row.link_target === "_blank" ? "_blank" : "_self",
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
  };
}

function isMissingHomeBannerSchemaError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
  const details =
    typeof error === "object" && error !== null && "details" in error
      ? String(error.details)
      : "";
  const hint =
    typeof error === "object" && error !== null && "hint" in error
      ? String(error.hint)
      : "";
  const combined = `${message} ${details} ${hint}`.toLowerCase();

  return (
    combined.includes("home_banners") &&
    (combined.includes("schema cache") ||
      combined.includes("does not exist") ||
      combined.includes("404"))
  );
}

/**
 * Composable for loading banner slides from `home_banners`.
 * Initial state is empty so the storefront never ships placeholder mock images.
 */
export function useBanners() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const allSlides = useState<BannerSlide[]>("home:banners:slides", () => []);
  const hasRemoteSlides = useState("home:banners:remote", () => false);
  const loading = useState<boolean>("home:banners:loading", () => false);
  const availablePaths = computed(
    () => new Set(router.getRoutes().map((route) => route.path)),
  );

  async function fetchBanners(): Promise<void> {
    loading.value = true;
    try {
      const { data, error } = await supabase
        .from("home_banners")
        .select(
          "id, title_th, title_en, title_cn, title_jp, subtitle_th, subtitle_en, subtitle_cn, subtitle_jp, cta_label_th, cta_label_en, cta_label_cn, cta_label_jp, image_url, mobile_image_url, link_url, link_target, sort_order, is_active",
        )
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;

      allSlides.value = ((data ?? []) as unknown[])
        .map(normalizeBannerRow)
        .filter(
          (item): item is NonNullable<ReturnType<typeof normalizeBannerRow>> =>
            !!item,
        );
      hasRemoteSlides.value = true;
    } catch (fetchError) {
      if (isMissingHomeBannerSchemaError(fetchError)) {
        hasRemoteSlides.value = false;
        return;
      }

      console.warn("[useBanners] Failed to fetch home banners:", fetchError);
    } finally {
      loading.value = false;
    }
  }

  async function ensureBannersLoaded(): Promise<void> {
    await callOnce(HOME_BANNERS_ONCE_KEY, fetchBanners);
  }

  onServerPrefetch(ensureBannersLoaded);

  if (import.meta.client) {
    void ensureBannersLoaded();
  }

  function hasRoute(linkUrl: string) {
    if (!linkUrl.startsWith("/")) return true;

    if (availablePaths.value.has(linkUrl)) return true;

    const resolved = router.resolve(linkUrl);
    return resolved.matched.length > 0;
  }

  /** Active slides sorted by sortOrder (ready for display) */
  const bannerSlides = computed(() =>
    allSlides.value
      .filter((slide) => slide.isActive && hasRoute(slide.linkUrl))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  return {
    bannerSlides,
    loading,
  };
}
