import type { PartnerCard, PartnerListResponse } from "~/types/partner";

/**
 * usePublicPartners — reactive composable for GET /api/partners public directory listing.
 *
 * Pass `initial` to pre-seed filter refs (e.g. from route.query) so that
 * useFetch runs with the correct params during SSR, avoiding a double-fetch.
 *
 * searchKeywords is intentionally absent from all filter params, all response
 * types (PartnerCard / PartnerListResponse), and this composable. It is a
 * server-side filter-only field and must never appear in any public payload.
 */

export type PublicPartnerDirectoryTypeFilter =
  | "store"
  | "service"
  | "contractor"
  | "";

export interface PublicPartnerInitial {
  q?: string;
  directoryType?: PublicPartnerDirectoryTypeFilter;
  category?: string;
  serviceArea?: string;
  page?: number;
  pageSize?: number;
}

export function usePublicPartners(initial?: PublicPartnerInitial) {
  const q = ref(initial?.q ?? "");
  const directoryType = ref<PublicPartnerDirectoryTypeFilter>(
    initial?.directoryType ?? "",
  );
  const category = ref(initial?.category ?? "");
  const serviceArea = ref(initial?.serviceArea ?? "");
  const page = ref(initial?.page ?? 0);
  const pageSize = ref(initial?.pageSize ?? 20);

  const query = computed(() => {
    const params: Record<string, string | number> = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (q.value.trim()) params.q = q.value.trim();
    if (directoryType.value) params.directoryType = directoryType.value;
    if (category.value) params.category = category.value;
    if (serviceArea.value) params.serviceArea = serviceArea.value;
    return params;
  });

  // Changing the key forces useFetch to run fresh — not use stale cache.
  const fetchKey = computed(
    () =>
      `public-partners:${directoryType.value || "all"}:${
        category.value || "all"
      }:${serviceArea.value || "all"}:${page.value}:${q.value}`,
  );

  const { data, pending, error, refresh } = useFetch<PartnerListResponse>(
    "/api/partners",
    {
      key: fetchKey,
      query,
      // Explicit watch list mirrors the fetchKey dependencies so useFetch
      // re-runs even if the computed key identity doesn't change in edge cases.
      watch: [q, directoryType, category, serviceArea, page],
      default: () => ({
        items: [] as PartnerCard[],
        total: 0,
        page: 0,
        pageSize: 20,
        hasMore: false,
      }),
    },
  );

  const items = computed<PartnerCard[]>(() => data.value?.items ?? []);
  const total = computed(() => data.value?.total ?? 0);
  const hasMore = computed(() => data.value?.hasMore ?? false);

  return {
    // Filter state — bind these to UI controls
    q,
    directoryType,
    category,
    serviceArea,
    page,
    // Response data
    items,
    total,
    hasMore,
    // Fetch state
    pending,
    error,
    refresh,
  };
}
