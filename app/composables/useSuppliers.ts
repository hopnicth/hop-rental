import { mockSuppliers } from '~/mock/suppliers';

/**
 * Composable for loading supplier data.
 * Currently uses mock data — replace with useFetch() when API is ready.
 */
export function useSuppliers() {
  // ── TODO: replace with useFetch('/api/suppliers') when API is ready ──
  const suppliers = ref(mockSuppliers);

  /**
   * Get a single supplier by ID.
   * Returns undefined if not found.
   */
  function getSupplierById(id: string) {
    return computed(() =>
      suppliers.value.find((s) => s.id === id),
    );
  }

  /**
   * Get multiple suppliers by an array of IDs.
   * Useful for Product.suppliers[] → display supplier names.
   */
  function getSuppliersByIds(ids: string[]) {
    return computed(() =>
      suppliers.value.filter((s) => ids.includes(s.id)),
    );
  }

  return {
    suppliers,
    getSupplierById,
    getSuppliersByIds,
  };
}

