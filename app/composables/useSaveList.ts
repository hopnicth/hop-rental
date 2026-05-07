type SaveListItemType = "asset" | "service";
type SaveListItem = { itemType: SaveListItemType; itemId: string };
type SaveListResponse = { items: SaveListItem[]; assetIds: string[]; serviceIds: string[] };
type SaveListToggleResponse = SaveListResponse & {
  itemType: SaveListItemType;
  itemId: string;
  saved: boolean;
};

function saveListKey(itemType: SaveListItemType, itemId: string) {
  return `${itemType}:${itemId}`;
}

export function useSaveList() {
  const user = useSupabaseUser();
  const items = useState<SaveListItem[]>("save-list:items", () => []);
  const loading = useState<boolean>("save-list:loading", () => false);
  const loadedForUser = useState<string | null>("save-list:loadedForUser", () => null);
  const togglingKeys = useState<string[]>("save-list:togglingKeys", () => []);

  const userId = computed(() => user.value?.id ?? (user.value as any)?.sub ?? null);
  const assetIds = computed(() => items.value.filter((item) => item.itemType === "asset").map((item) => item.itemId));
  const serviceIds = computed(() => items.value.filter((item) => item.itemType === "service").map((item) => item.itemId));
  const count = computed(() => items.value.length);

  function setItemState(itemType: SaveListItemType, itemId: string, saved: boolean) {
    const key = saveListKey(itemType, itemId);
    const current = new Map(items.value.map((item) => [saveListKey(item.itemType, item.itemId), item]));
    if (saved) current.set(key, { itemType, itemId });
    else current.delete(key);
    items.value = Array.from(current.values());
  }

  async function loadSaveList(options: { force?: boolean } = {}) {
    if (!userId.value) {
      items.value = [];
      loadedForUser.value = null;
      return;
    }
    if (!options.force && loadedForUser.value === userId.value) return;

    loading.value = true;
    try {
      const result = await $fetch<SaveListResponse>("/api/user/save-list");
      items.value = result.items ?? [];
      loadedForUser.value = userId.value;
    } finally {
      loading.value = false;
    }
  }

  async function toggleSaveList(itemType: SaveListItemType, itemId: string) {
    if (!userId.value) throw new Error("AUTH_REQUIRED");
    const key = saveListKey(itemType, itemId);
    if (togglingKeys.value.includes(key)) {
      return items.value.some((item) => saveListKey(item.itemType, item.itemId) === key);
    }

    const wasSaved = items.value.some((item) => saveListKey(item.itemType, item.itemId) === key);
    togglingKeys.value = [...togglingKeys.value, key];
    setItemState(itemType, itemId, !wasSaved);

    try {
      const result = await $fetch<SaveListToggleResponse>("/api/user/save-list", {
        method: "POST",
        body: { itemType, itemId },
      });
      items.value = result.items ?? items.value;
      loadedForUser.value = userId.value;
      return result.saved;
    } catch (error) {
      setItemState(itemType, itemId, wasSaved);
      throw error;
    } finally {
      togglingKeys.value = togglingKeys.value.filter((item) => item !== key);
    }
  }

  function isSaved(itemType: SaveListItemType, itemId: string) {
    return computed(() => items.value.some((item) => item.itemType === itemType && item.itemId === itemId));
  }

  function isToggling(itemType: SaveListItemType, itemId: string) {
    return computed(() => togglingKeys.value.includes(saveListKey(itemType, itemId)));
  }

  if (import.meta.client) {
    watch(
      userId,
      (nextUserId) => {
        if (nextUserId) void loadSaveList();
        else {
          items.value = [];
          loadedForUser.value = null;
        }
      },
      { immediate: true },
    );
  }

  return { items: computed(() => items.value), assetIds, serviceIds, count, loading: computed(() => loading.value), loadSaveList, toggleSaveList, isSaved, isToggling };
}