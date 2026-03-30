/**
 * Auth session composable with idle timeout.
 *
 * Wraps Supabase auth composables and adds:
 * - Idle timeout (auto-logout after 5 hours of inactivity)
 * - Reactive auth state helpers
 * - Logout method with toast feedback
 *
 * Uses event listeners (mousemove, keydown, click, touchstart, scroll)
 * to detect activity. SSR-safe — listeners are only attached on the client.
 */

const IDLE_TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "click",
  "touchstart",
  "scroll",
] as const;
const LAST_ACTIVITY_KEY = "hop-rental-last-activity";

/**
 * Persist last activity timestamp to localStorage so it survives page reloads.
 */
function saveLastActivity(ts: number): void {
  if (import.meta.server) return;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
  } catch {
    // storage unavailable — ignore
  }
}

function loadLastActivity(): number {
  if (import.meta.server) return Date.now();
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (raw) return Number(raw);
  } catch {
    // ignore
  }
  return Date.now();
}

export function useAuthSession() {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const { profile } = useUserProfile();
  const { t } = useI18n();
  const toast = useToast();

  // ── Reactive helpers ──
  const isLoggedIn = computed(() => !!user.value);
  const displayName = computed(() => {
    if (!user.value) return "";
    const meta = user.value.user_metadata;

    return (
      profile.value?.fullName ||
      meta?.full_name ||
      meta?.name ||
      user.value.email ||
      ""
    );
  });
  const avatarUrl = computed(() => {
    if (!user.value) return "";

    return (
      profile.value?.avatarUrl || user.value.user_metadata?.avatar_url || ""
    );
  });
  const userEmail = computed(() => user.value?.email || "");

  // ── Idle timeout machinery (client-only) ──
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let activityThrottle: ReturnType<typeof setTimeout> | null = null;

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!user.value) return; // no session — nothing to expire

    idleTimer = setTimeout(async () => {
      // Session expired due to inactivity
      await logout(true);
    }, IDLE_TIMEOUT_MS);
  }

  function onUserActivity() {
    // Throttle writes to localStorage (max once per 30 seconds)
    if (activityThrottle) return;
    activityThrottle = setTimeout(() => {
      activityThrottle = null;
    }, 30_000);

    saveLastActivity(Date.now());
    resetIdleTimer();
  }

  function startActivityTracking() {
    ACTIVITY_EVENTS.forEach((evt) => {
      document.addEventListener(evt, onUserActivity, { passive: true });
    });
    resetIdleTimer();
  }

  function stopActivityTracking() {
    ACTIVITY_EVENTS.forEach((evt) => {
      document.removeEventListener(evt, onUserActivity);
    });
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (activityThrottle) {
      clearTimeout(activityThrottle);
      activityThrottle = null;
    }
  }

  // ── Logout ──
  async function logout(sessionExpired = false) {
    stopActivityTracking();

    // Clear UI state immediately, but keep recoverable user data for next login.
    const { resetCartSession } = useCart();
    const { resetBookingSession } = useBooking();
    await resetCartSession();
    resetBookingSession();

    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.add({
        title: t("auth.loginError"),
        description: error.message,
        icon: "bx:error-circle",
        color: "error",
      });
      return;
    }

    if (sessionExpired) {
      toast.add({
        title: t("auth.sessionExpired"),
        description: t("auth.sessionExpiredMessage"),
        icon: "bx:time-five",
        color: "warning",
      });
    } else {
      toast.add({
        title: t("auth.loggingOut"),
        icon: "bx:check-circle",
        color: "success",
      });
    }

    navigateTo("/user/login");
  }

  // ── Lifecycle (client-only) ──
  if (import.meta.client) {
    // Check if session already expired on page load
    onMounted(() => {
      const lastActivity = loadLastActivity();
      const elapsed = Date.now() - lastActivity;

      if (user.value && elapsed >= IDLE_TIMEOUT_MS) {
        // Already expired — log out immediately
        logout(true);
        return;
      }

      if (user.value) {
        startActivityTracking();
      }
    });

    // Watch for auth state changes
    watch(user, (newUser) => {
      if (newUser) {
        saveLastActivity(Date.now());
        startActivityTracking();
      } else {
        stopActivityTracking();
      }
    });

    onUnmounted(() => {
      stopActivityTracking();
    });
  }

  return {
    user,
    isLoggedIn,
    displayName,
    avatarUrl,
    userEmail,
    logout,
  };
}
