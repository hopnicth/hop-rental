import type {
  CategorySearchPayload,
  CategorySearchResult,
} from "~/types/category";
import { mainCategories, mockSubCategories } from "~/mock/categories";

/**
 * Composable for loading and filtering categories.
 * Currently uses mock data — replace with useFetch() when API is ready.
 */
export function useCategories() {
  const subCategories = ref(mockSubCategories);

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
    getSubCategories,
    isSearching,
    searchResults,
    searchByCategories,
  };
}
