/**
 * Public storefront branches list — used by the cart hub selector
 * to replace the legacy mockStores list.
 */

export interface PublicBranch {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  addressTh: string;
  addressEn: string;
  phone: string;
  isActive: boolean;
  sortOrder: number;
}

export function useBranches() {
  const branches = useState<PublicBranch[]>("public:branches", () => []);
  const loaded = useState<boolean>("public:branches:loaded", () => false);
  const loading = useState<boolean>("public:branches:loading", () => false);

  async function fetchBranches(): Promise<void> {
    if (loading.value) return;
    loading.value = true;

    try {
      const data = await $fetch<{ items: PublicBranch[] }>("/api/branches");
      branches.value = data?.items ?? [];
      loaded.value = true;
    } catch (error) {
      console.warn("[useBranches] fetchBranches failed:", error);
    } finally {
      loading.value = false;
    }
  }

  async function ensureBranchesLoaded(): Promise<void> {
    if (loaded.value) return;
    await fetchBranches();
  }

  return {
    branches,
    loading,
    loaded,
    fetchBranches,
    ensureBranchesLoaded,
  };
}
