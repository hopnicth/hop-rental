import type {
  CategorySearchPayload,
  CategorySearchResult,
  HomeCategoryCardGroup,
} from "~/types/category";
import { mainCategories, mockSubCategories } from "~/mock/categories";

type HomeCategoryApiOption = {
  id: string;
  groupId: string;
  optionKey: string;
  labelTh: string;
  labelEn: string;
  labelCn: string;
  labelJp: string;
  searchQueryTh: string;
  searchQueryEn: string;
  searchQueryCn: string;
  searchQueryJp: string;
  sortOrder: number;
  isActive: boolean;
};

type HomeCategoryApiGroup = {
  id: string;
  mainCategoryKey: string;
  labelTh: string;
  labelEn: string;
  labelCn: string;
  labelJp: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  options: HomeCategoryApiOption[];
};

/**
 * Composable for loading and filtering categories.
 * Currently uses mock data — replace with useFetch() when API is ready.
 */
export function useCategories() {
  const { t, locale } = useI18n();
  const subCategories = ref(mockSubCategories);

  const { data, pending, error, refresh } = useFetch<{
    items: HomeCategoryApiGroup[];
  }>("/api/home-category-cards", {
    key: "home-category-cards",
    default: () => ({ items: [] }),
  });

  /** Whether a search request is in progress */
  const isSearching = ref(false);

  /** Results returned from the last search */
  const searchResults = ref<CategorySearchResult[]>([]);

  /**
   * Get sub-categories filtered by main category key.
   */
  function getSubCategories(mainCategoryKey: string) {
    return computed(() =>
      subCategories.value.filter(
        (sub) => sub.mainCategoryKey === mainCategoryKey,
      ),
    );
  }

  function localizedValue(
    item: {
      labelTh?: string;
      labelEn?: string;
      labelCn?: string;
      labelJp?: string;
    },
    fallback = "",
  ) {
    if (locale.value === "th") return item.labelTh || item.labelEn || fallback;
    if (locale.value === "cn") return item.labelCn || item.labelEn || fallback;
    if (locale.value === "jp") return item.labelJp || item.labelEn || fallback;
    return item.labelEn || item.labelTh || fallback;
  }

  function localizedSearchQuery(option: HomeCategoryApiOption) {
    if (locale.value === "th")
      return option.searchQueryTh || localizedValue(option);
    if (locale.value === "cn")
      return option.searchQueryCn || localizedValue(option);
    if (locale.value === "jp")
      return option.searchQueryJp || localizedValue(option);
    return option.searchQueryEn || localizedValue(option);
  }

  const fallbackCategoryGroups = computed<HomeCategoryCardGroup[]>(() =>
    mainCategories.map((main) => ({
      id: main.key,
      mainCategoryKey: main.key,
      label: t(main.labelKey),
      icon: main.icon,
      sortOrder: 0,
      isActive: true,
      options: mockSubCategories
        .filter((sub) => sub.mainCategoryKey === main.key)
        .map((sub, index) => ({
          id: sub.id,
          groupId: main.key,
          optionKey: sub.id,
          label: t(sub.labelKey),
          searchQuery: t(sub.labelKey),
          sortOrder: index,
          isActive: true,
        })),
    })),
  );

  const categoryGroups = computed<HomeCategoryCardGroup[]>(() => {
    const remote = data.value?.items ?? [];
    if (remote.length === 0) return fallbackCategoryGroups.value;

    return remote.map((group) => ({
      id: group.id,
      mainCategoryKey: group.mainCategoryKey,
      label: localizedValue(group, group.mainCategoryKey),
      icon: group.icon || undefined,
      sortOrder: group.sortOrder,
      isActive: group.isActive,
      options: group.options.map((option) => ({
        id: option.id,
        groupId: option.groupId,
        optionKey: option.optionKey,
        label: localizedValue(option, option.optionKey),
        searchQuery: localizedSearchQuery(option),
        sortOrder: option.sortOrder,
        isActive: option.isActive,
      })),
    }));
  });

  /**
   * Send selected categories to the API and return results.
   * Currently returns mock data — replace with useFetch() / $fetch() when API is ready.
   */
  async function searchByCategories(
    payload: CategorySearchPayload,
  ): Promise<CategorySearchResult[]> {
    isSearching.value = true;

    try {
      // ── TODO: replace with real API call ──
      // const results = await $fetch('/api/categories/search', {
      //   method: 'POST',
      //   body: payload,
      // });

      console.log("[useCategories] searchByCategories payload:", payload);

      // Mock: simulate network delay + return placeholder results
      await new Promise((resolve) => setTimeout(resolve, 800));

      const mockResults: CategorySearchResult[] = payload.selections.map(
        (sel, i) => ({
          id: `result-${i + 1}`,
          name: `Mock Product ${i + 1}`,
          mainCategoryKey: sel.mainCategoryKey,
          subCategoryId: sel.subCategoryId,
        }),
      );

      searchResults.value = mockResults;
      return mockResults;
    } finally {
      isSearching.value = false;
    }
  }

  return {
    mainCategories,
    subCategories,
    categoryGroups,
    getSubCategories,
    pending,
    error,
    refresh,
    isSearching,
    searchResults,
    searchByCategories,
  };
}
