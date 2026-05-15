import type { CustomerTaxProfile, CustomerTaxProfileInput } from "~/types/user";

type TaxProfileResponse = {
  available: boolean;
  profile: CustomerTaxProfile | null;
};
type AuthUserLike = { id?: string; sub?: string } | null;

function getAuthUserId(user: AuthUserLike): string | null {
  if (!user) return null;
  if (typeof user.id === "string" && user.id.length > 0) return user.id;
  if (typeof user.sub === "string" && user.sub.length > 0) return user.sub;
  return null;
}

export function useTaxProfile() {
  const user = useSupabaseUser();
  const profile = useState<CustomerTaxProfile | null>(
    "tax-profile:profile",
    () => null,
  );
  const available = useState<boolean>("tax-profile:available", () => true);
  const loading = useState<boolean>("tax-profile:loading", () => false);
  const saving = useState<boolean>("tax-profile:saving", () => false);
  const loadedForUser = useState<string | null>(
    "tax-profile:loaded-for-user",
    () => null,
  );
  const error = useState<string | null>("tax-profile:error", () => null);

  const userId = computed(() => getAuthUserId(user.value as AuthUserLike));

  async function loadTaxProfile(options: { force?: boolean } = {}) {
    if (!userId.value) {
      profile.value = null;
      available.value = true;
      loadedForUser.value = null;
      error.value = null;
      return;
    }
    if (!options.force && loadedForUser.value === userId.value) return;

    loading.value = true;
    error.value = null;
    try {
      const result = await $fetch<TaxProfileResponse>("/api/user/tax-profile");
      profile.value = result.profile ?? null;
      available.value = result.available !== false;
      loadedForUser.value = userId.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Unknown error";
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function saveTaxProfile(input: CustomerTaxProfileInput) {
    if (!userId.value) throw new Error("AUTH_REQUIRED");

    saving.value = true;
    error.value = null;
    try {
      const result = await $fetch<TaxProfileResponse>("/api/user/tax-profile", {
        method: "PUT",
        body: input,
      });
      profile.value = result.profile;
      available.value = result.available !== false;
      loadedForUser.value = userId.value;
      return result.profile;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Unknown error";
      throw err;
    } finally {
      saving.value = false;
    }
  }

  if (import.meta.client) {
    watch(
      userId,
      (nextUserId) => {
        if (nextUserId) void loadTaxProfile();
        else {
          profile.value = null;
          available.value = true;
          loadedForUser.value = null;
          error.value = null;
        }
      },
      { immediate: true },
    );
  }

  return {
    profile: computed(() => profile.value),
    available: computed(() => available.value),
    loading: computed(() => loading.value),
    saving: computed(() => saving.value),
    error: computed(() => error.value),
    loadTaxProfile,
    saveTaxProfile,
  };
}
