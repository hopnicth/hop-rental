import type { MaybeRefOrGetter } from "vue";

export type FilterType = "checkbox" | "dropdown" | "number_range";
export type MatchLogic = "or" | "and";

export type FilterOption = {
  id: string;
  groupId: string;
  key: string;
  labelTh: string;
  labelEn: string;
  isActive: boolean;
  sortOrder: number;
};

export type FilterGroup = {
  id: string;
  mainCategoryKey: string;
  key: string;
  labelTh: string;
  labelEn: string;
  filterType: FilterType;
  matchLogic: MatchLogic;
  specKey: string | null;
  isActive: boolean;
  sortOrder: number;
  options: FilterOption[];
};

/** Per-group selection: option-id list for checkbox/dropdown, range for number. */
export type DynamicFilterValue =
  | string[]
  | { min: number | null; max: number | null };

/**
 * Fetches active filter_groups (with their active options) for a main category.
 * Caches per `mainCategoryKey` via Nuxt's useFetch key so that switching back to
 * a previously visited category does not trigger a refetch.
 *
 * Pass a falsy `mainCategoryKey` to disable the request entirely (e.g. when the
 * page is on the "all categories" view).
 */
export function useFilterGroups(
  mainCategoryKey: MaybeRefOrGetter<string | null | undefined>,
) {
  const keyRef = computed(() => {
    const value = toValue(mainCategoryKey);
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : "";
  });

  const { data, pending, error, refresh } = useFetch<{ items: FilterGroup[] }>(
    "/api/filter-groups",
    {
      key: computed(() => `filter-groups-${keyRef.value || "none"}`),
      query: computed(() =>
        keyRef.value ? { mainCategory: keyRef.value } : {},
      ),
      immediate: true,
      watch: [keyRef],
      default: () => ({ items: [] }),
      transform: (payload) => ({ items: payload?.items ?? [] }),
    },
  );

  const groups = computed<FilterGroup[]>(() =>
    keyRef.value ? (data.value?.items ?? []) : [],
  );

  return {
    groups,
    pending,
    error,
    refresh,
  };
}
