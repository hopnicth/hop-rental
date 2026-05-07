/**
 * Composable for managing the current user's profile from `public.users`.
 *
 * - Fetches profile on auth state change
 * - Provides reactive profile data
 * - Exposes update method
 *
 * SSR-safe — DB queries only run on client when user is authenticated.
 */
import type { UserProfile } from "~/types/user";

// ── Singleton reactive state (shared across components) ──
const profile = ref<UserProfile | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let isUserProfileInitialized = false;
let profileRequest: Promise<void> | null = null;

/**
 * Map Supabase snake_case row to camelCase UserProfile.
 */
function mapRow(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    fullName: (row.full_name as string) ?? null,
    phone: (row.phone as string) ?? null,
    avatarUrl: (row.avatar_url as string) ?? null,
    platformRole:
      (row.platform_role as UserProfile["platformRole"]) ?? "customer",
    membershipLevel:
      (row.membership_level as UserProfile["membershipLevel"]) ?? "bronze",
    kycStatus: (row.kyc_status as UserProfile["kycStatus"]) ?? "pending",
    idCardUrl: (row.id_card_url as string) ?? null,
    pdpaConsentUrl: (row.pdpa_consent_url as string) ?? null,
    pdpaConsentedAt: (row.pdpa_consented_at as string) ?? null,
    kycRejectionReason: (row.kyc_rejection_reason as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function useUserProfile() {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();

  async function resolveUserId(): Promise<string | null> {
    if (typeof user.value?.id === "string" && user.value.id.length > 0) {
      return user.value.id;
    }

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    return authUser?.id ?? null;
  }

  // ── Fetch profile from DB ──
  async function fetchProfile(force = false): Promise<void> {
    if (!force && profileRequest) {
      return profileRequest;
    }

    profileRequest = (async () => {
      const userId = await resolveUserId();
      if (!userId) {
        profile.value = null;
        error.value = null;
        return;
      }

      loading.value = true;
      error.value = null;

      try {
        const { data, error: dbError } = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .single();

        if (dbError) {
          error.value = dbError.message;
          profile.value = null;
          return;
        }

        profile.value = data ? mapRow(data as Record<string, unknown>) : null;
      } catch (e) {
        error.value = e instanceof Error ? e.message : "Unknown error";
        profile.value = null;
      } finally {
        loading.value = false;
      }
    })();

    try {
      await profileRequest;
    } finally {
      profileRequest = null;
    }
  }

  async function ensureProfileLoaded(
    expectedUserId?: string | null,
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (options.force) {
      await fetchProfile(true);
      return;
    }

    if (
      expectedUserId &&
      profile.value?.id === expectedUserId &&
      profile.value.platformRole
    ) {
      return;
    }

    if (!expectedUserId && profile.value?.platformRole) {
      return;
    }

    await fetchProfile();
  }

  // ── Update profile (partial) ──
  async function updateProfile(
    updates: Partial<Pick<UserProfile, "fullName" | "phone" | "avatarUrl">>,
  ): Promise<boolean> {
    if (!user.value) return false;

    // Map camelCase → snake_case for DB
    const dbUpdates: Record<string, unknown> = {};
    if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.avatarUrl !== undefined)
      dbUpdates.avatar_url = updates.avatarUrl;

    const { error: dbError } = await supabase
      .from("users")
      .update(dbUpdates)
      .eq("id", user.value.id);

    if (dbError) {
      error.value = dbError.message;
      return false;
    }

    // Re-fetch to get updated data
    await fetchProfile();
    return true;
  }

  // ── Auto-fetch on auth state change (client-only) ──
  if (import.meta.client && !isUserProfileInitialized) {
    isUserProfileInitialized = true;

    watch(
      () => user.value?.id ?? null,
      (userId, previousUserId) => {
        if (userId) {
          void fetchProfile(true);
        } else if (previousUserId) {
          profile.value = null;
          error.value = null;
        }
      },
      { immediate: true },
    );
  }

  return {
    /** Current user profile (null if not loaded or not logged in) */
    profile: computed(() => profile.value),
    /** Whether profile is currently being fetched */
    loading: computed(() => loading.value),
    /** Error message if fetch/update failed */
    error: computed(() => error.value),
    /** Re-fetch profile from database */
    fetchProfile,
    /** Ensure the current auth user's profile is available before guarded UI checks */
    ensureProfileLoaded,
    /** Update profile fields (fullName, phone, avatarUrl) */
    updateProfile,
  };
}
