type SavedPartnersListResponse = { partnerIds: string[] };
type SavedPartnersToggleResponse = {
  partnerId: string;
  saved: boolean;
  partnerIds: string[];
};
type AuthUserLike = { id?: string; sub?: string } | null;

function getSavedPartnersUserId(user: AuthUserLike): string | null {
  if (!user) return null;
  if (typeof user.id === "string" && user.id.length > 0) return user.id;
  if (typeof user.sub === "string" && user.sub.length > 0) return user.sub;
  return null;
}

export function useSavedPartners() {
  const user = useSupabaseUser();
  const partnerIds = useState<string[]>("savedPartners:partnerIds", () => []);
  const loading = useState<boolean>("savedPartners:loading", () => false);
  const loadedForUser = useState<string | null>(
    "savedPartners:loadedForUser",
    () => null,
  );
  const togglingIds = useState<string[]>("savedPartners:togglingIds", () => []);

  const userId = computed(() =>
    getSavedPartnersUserId(user.value as AuthUserLike),
  );

  function setPartnerState(partnerId: string, saved: boolean) {
    const current = new Set(partnerIds.value);
    if (saved) current.add(partnerId);
    else current.delete(partnerId);
    partnerIds.value = Array.from(current);
  }

  async function refreshSavedPartners(options: { force?: boolean } = {}) {
    if (!userId.value) {
      partnerIds.value = [];
      loadedForUser.value = null;
      return;
    }
    if (!options.force && loadedForUser.value === userId.value) return;

    loading.value = true;
    try {
      const result = await $fetch<SavedPartnersListResponse>(
        "/api/user/saved-partners/ids",
      );
      partnerIds.value = result.partnerIds ?? [];
      loadedForUser.value = userId.value;
    } finally {
      loading.value = false;
    }
  }

  async function toggleSavedPartner(partnerId: string): Promise<boolean> {
    if (!userId.value) throw new Error("AUTH_REQUIRED");
    if (togglingIds.value.includes(partnerId)) {
      return partnerIds.value.includes(partnerId);
    }

    const wasSaved = partnerIds.value.includes(partnerId);
    togglingIds.value = [...togglingIds.value, partnerId];
    setPartnerState(partnerId, !wasSaved);

    try {
      const result = await $fetch<SavedPartnersToggleResponse>(
        "/api/user/saved-partners",
        { method: "POST", body: { partnerId } },
      );
      partnerIds.value = result.partnerIds ?? partnerIds.value;
      loadedForUser.value = userId.value;
      return result.saved;
    } catch (error) {
      setPartnerState(partnerId, wasSaved);
      throw error;
    } finally {
      togglingIds.value = togglingIds.value.filter((id) => id !== partnerId);
    }
  }

  function isPartnerSaved(partnerId: string) {
    return computed(() => partnerIds.value.includes(partnerId));
  }

  function isToggling(partnerId: string) {
    return computed(() => togglingIds.value.includes(partnerId));
  }

  if (import.meta.client) {
    watch(
      userId,
      (nextUserId) => {
        if (nextUserId) void refreshSavedPartners();
        else {
          partnerIds.value = [];
          loadedForUser.value = null;
        }
      },
      { immediate: true },
    );
  }

  return {
    savedPartnerIds: computed(() => partnerIds.value),
    pending: computed(() => loading.value),
    refreshSavedPartners,
    isPartnerSaved,
    isToggling,
    toggleSavedPartner,
  };
}
