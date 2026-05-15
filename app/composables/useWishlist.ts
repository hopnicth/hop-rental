type WishlistListResponse = { productIds: string[] };
type WishlistToggleResponse = {
  productId: string;
  wishlisted: boolean;
  productIds: string[];
};
type AuthUserLike = { id?: string; sub?: string } | null;

function getAuthUserId(user: AuthUserLike): string | null {
  if (!user) return null;
  if (typeof user.id === "string" && user.id.length > 0) return user.id;
  if (typeof user.sub === "string" && user.sub.length > 0) return user.sub;
  return null;
}

export function useWishlist() {
  const user = useSupabaseUser();
  const productIds = useState<string[]>("wishlist:productIds", () => []);
  const loading = useState<boolean>("wishlist:loading", () => false);
  const loadedForUser = useState<string | null>(
    "wishlist:loadedForUser",
    () => null,
  );
  const togglingIds = useState<string[]>("wishlist:togglingIds", () => []);

  const userId = computed(() => getAuthUserId(user.value as AuthUserLike));
  const count = computed(() => productIds.value.length);

  function setProductState(productId: string, wishlisted: boolean) {
    const current = new Set(productIds.value);
    if (wishlisted) current.add(productId);
    else current.delete(productId);
    productIds.value = Array.from(current);
  }

  async function loadWishlist(options: { force?: boolean } = {}) {
    if (!userId.value) {
      productIds.value = [];
      loadedForUser.value = null;
      return;
    }
    if (!options.force && loadedForUser.value === userId.value) return;

    loading.value = true;
    try {
      const result = await $fetch<WishlistListResponse>("/api/user/wishlist");
      productIds.value = result.productIds ?? [];
      loadedForUser.value = userId.value;
    } finally {
      loading.value = false;
    }
  }

  async function toggleWishlist(productId: string) {
    if (!userId.value) throw new Error("AUTH_REQUIRED");
    if (togglingIds.value.includes(productId)) {
      return productIds.value.includes(productId);
    }

    const wasWishlisted = productIds.value.includes(productId);
    togglingIds.value = [...togglingIds.value, productId];
    setProductState(productId, !wasWishlisted);

    try {
      const result = await $fetch<WishlistToggleResponse>(
        "/api/user/wishlist",
        {
          method: "POST",
          body: { productId },
        },
      );
      productIds.value = result.productIds ?? productIds.value;
      loadedForUser.value = userId.value;
      return result.wishlisted;
    } catch (error) {
      setProductState(productId, wasWishlisted);
      throw error;
    } finally {
      togglingIds.value = togglingIds.value.filter((id) => id !== productId);
    }
  }

  function isWishlisted(productId: string) {
    return computed(() => productIds.value.includes(productId));
  }

  function isToggling(productId: string) {
    return computed(() => togglingIds.value.includes(productId));
  }

  if (import.meta.client) {
    watch(
      userId,
      (nextUserId) => {
        if (nextUserId) void loadWishlist();
        else {
          productIds.value = [];
          loadedForUser.value = null;
        }
      },
      { immediate: true },
    );
  }

  return {
    productIds: computed(() => productIds.value),
    count,
    loading: computed(() => loading.value),
    loadWishlist,
    toggleWishlist,
    isWishlisted,
    isToggling,
  };
}
