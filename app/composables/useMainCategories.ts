import type {
  MainCategoryEntityType,
  StorefrontMainCategory,
} from "~/types/category";
import type { MaybeRefOrGetter } from "vue";

export function useMainCategories(
  entityType: MaybeRefOrGetter<MainCategoryEntityType> = "product",
) {
  const entityTypeRef = computed(() => toValue(entityType));

  const { data, pending, error, refresh } = useFetch<{
    items: StorefrontMainCategory[];
  }>("/api/main-categories", {
    key: computed(() => `main-categories-${entityTypeRef.value}`),
    query: computed(() => ({ entityType: entityTypeRef.value })),
    watch: [entityTypeRef],
    default: () => ({ items: [] }),
    transform: (payload) => ({ items: payload?.items ?? [] }),
  });

  const categories = computed(() => data.value?.items ?? []);

  return {
    categories,
    pending,
    error,
    refresh,
  };
}
