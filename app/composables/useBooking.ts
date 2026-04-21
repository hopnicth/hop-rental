import type { BookingItem, BookingStore } from "~/types/booking";
import type { RentalBookingInsert } from "~/types/rental-booking";

const BOOKING_STORAGE_PREFIX = "hop-rental-bookings";

/**
 * Build a user-scoped storage key.
 * Guest users get no bookings (key is empty → nothing stored).
 */
function bookingStorageKey(userId: string | null): string {
  if (!userId) return "";
  return `${BOOKING_STORAGE_PREFIX}-${userId}`;
}

/**
 * Generate a simple UUID v4.
 */
function generateBookingId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function emptyBookingStore(): BookingStore {
  return { items: [], updatedAt: new Date().toISOString() };
}

function normalizeMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeBookingStatus(value: unknown): BookingItem["status"] {
  if (value === "draft" || value === "confirmed" || value === "cancelled") {
    return value;
  }
  return "draft";
}

function normalizeBookingItem(raw: Partial<BookingItem>): BookingItem {
  const createdAt = raw.createdAt ?? new Date().toISOString();

  return {
    bookingId: raw.bookingId ?? generateBookingId(),
    productId: raw.productId ?? "",
    skuId: raw.skuId ?? "",
    rentalAccessId: raw.rentalAccessId,
    rentalAccessCode: raw.rentalAccessCode,
    rentalAccessSlug: raw.rentalAccessSlug,
    rentalAccessName: raw.rentalAccessName,
    rentalAccessThumbnail: raw.rentalAccessThumbnail,
    rentalAccessSnapshot: normalizeRecord(raw.rentalAccessSnapshot),
    matchedProductId: raw.matchedProductId,
    matchedProductName: raw.matchedProductName,
    productName: raw.productName ?? "",
    thumbnail: raw.thumbnail ?? "",
    startDate: raw.startDate ?? "",
    numDays: Math.max(1, Number(raw.numDays) || 1),
    returnDate: raw.returnDate ?? raw.startDate ?? "",
    dailyRate: normalizeMoney(raw.dailyRate),
    totalCost: normalizeMoney(raw.totalCost),
    deposit: normalizeMoney(raw.deposit),
    hubId: raw.hubId ?? null,
    hubName: raw.hubName ?? null,
    status: normalizeBookingStatus(raw.status),
    createdAt,
  };
}

function formatSupabaseError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): string {
  const parts = [error.message, error.details, error.hint].filter(
    (value): value is string => Boolean(value),
  );

  if (error.code) {
    parts.unshift(`[${error.code}]`);
  }

  return parts.join(" — ") || "Unknown Supabase error";
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapRowToBooking(row: Record<string, unknown>): BookingItem {
  return normalizeBookingItem({
    bookingId: row.id as string,
    productId: row.product_id as string,
    skuId: row.sku_id as string,
    rentalAccessId: (row.rental_access_id as string) ?? undefined,
    rentalAccessCode: (row.rental_access_code as string) ?? undefined,
    rentalAccessSlug: (row.rental_access_slug as string) ?? undefined,
    rentalAccessName: (row.rental_access_name as string) ?? undefined,
    rentalAccessThumbnail: (row.rental_access_thumbnail as string) ?? undefined,
    rentalAccessSnapshot: normalizeRecord(row.rental_access_snapshot),
    matchedProductId: (row.matched_product_id as string) ?? undefined,
    matchedProductName: (row.matched_product_name as string) ?? undefined,
    productName:
      (row.rental_access_name as string) ?? (row.product_name as string),
    thumbnail:
      (row.rental_access_thumbnail as string) ??
      (row.thumbnail as string) ??
      "",
    startDate: row.start_date as string,
    numDays: Number(row.rental_days),
    returnDate: row.end_date as string,
    dailyRate: Number(row.daily_rate),
    totalCost: Number(row.rental_total),
    deposit: Number(row.deposit_amount),
    hubId: (row.hub_id as string) ?? null,
    hubName: (row.hub_name as string) ?? null,
    status: row.status as BookingItem["status"],
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  });
}

function mapBookingToInsert(
  userId: string,
  booking: BookingItem,
): RentalBookingInsert {
  return {
    user_id: userId,
    product_id: booking.productId,
    sku_id: booking.skuId,
    rental_access_id: booking.rentalAccessId ?? null,
    hub_id: booking.hubId,
    product_name: booking.productName,
    thumbnail: booking.thumbnail,
    hub_name: booking.hubName,
    rental_access_code: booking.rentalAccessCode ?? null,
    rental_access_slug: booking.rentalAccessSlug ?? null,
    rental_access_name: booking.rentalAccessName ?? null,
    rental_access_thumbnail: booking.rentalAccessThumbnail ?? null,
    rental_access_snapshot: booking.rentalAccessSnapshot ?? {},
    matched_product_id: booking.matchedProductId ?? booking.productId,
    matched_product_name: booking.matchedProductName ?? booking.productName,
    start_date: booking.startDate,
    end_date: booking.returnDate,
    rental_days: booking.numDays,
    pricing_model: "daily",
    currency_code: "THB",
    daily_rate: booking.dailyRate,
    rental_total: booking.totalCost,
    deposit_amount: booking.deposit,
    status: booking.status,
  };
}

/**
 * Read legacy localStorage bookings for one-time migration.
 */
function loadBookings(userId: string | null): BookingStore {
  if (import.meta.server) return emptyBookingStore();

  const key = bookingStorageKey(userId);
  if (!key) return emptyBookingStore();

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as BookingStore;
      return {
        items: (parsed.items ?? []).map(normalizeBookingItem),
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    // corrupted data — start fresh
  }

  return emptyBookingStore();
}

/**
 * Remove bookings data from localStorage entirely.
 */
function removeBookingStorage(userId: string | null): void {
  if (import.meta.server) return;

  const key = bookingStorageKey(userId);
  if (!key) return;

  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ── Shared reactive state (singleton across components) ──
const store = ref<BookingStore>(emptyBookingStore());
const bookingHydrating = ref(false);
/** Track which userId the bookings are currently loaded for */
const currentBookingUserId = ref<string | null>(null);
/** Prevent duplicate hydration when the same user is already loaded */
const lastHydratedBookingUserId = ref<string | null | undefined>(undefined);

/**
 * Composable for managing rental bookings.
 * State is hydrated from Supabase `rental_bookings` and shared across components.
 *
 * - No login → empty bookings
 * - Existing legacy localStorage bookings are migrated once per user
 * - Logout → `resetBookingSession()` clears UI state only
 */
export function useBooking() {
  const user = useSupabaseUser();
  const supabase = useSupabaseClient();
  let hydrateRetryTimer: ReturnType<typeof setTimeout> | null = null;

  function clearBookingHydrationRetry(): void {
    if (!hydrateRetryTimer) return;
    clearTimeout(hydrateRetryTimer);
    hydrateRetryTimer = null;
  }

  function scheduleBookingHydrationRetry(userId: string): void {
    clearBookingHydrationRetry();

    hydrateRetryTimer = setTimeout(() => {
      hydrateRetryTimer = null;
      if (
        currentBookingUserId.value === userId &&
        lastHydratedBookingUserId.value !== userId &&
        user.value?.id === userId
      ) {
        void hydrateBookings(userId);
      }
    }, 400);
  }

  async function initializeBookingHydration(): Promise<void> {
    const rememberedUserId =
      currentBookingUserId.value ?? user.value?.id ?? null;

    if (rememberedUserId) {
      await hydrateBookings(rememberedUserId);
      return;
    }

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    await hydrateBookings(authUser?.id ?? null);
  }

  async function awaitAuthenticatedBookingUserId(
    expectedUserId: string,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const sessionUserId = session?.user?.id ?? null;
      if (sessionUserId === expectedUserId) {
        return sessionUserId;
      }

      await waitForMs(150);
    }

    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (authUser?.id === expectedUserId) {
      return authUser.id;
    }

    if (error) {
      console.warn("[useBooking] auth session not ready for hydrate:", {
        expectedUserId,
        message: error.message,
        status: error.status,
      });
    }

    return null;
  }

  /** All booking items */
  const bookingItems = computed(() => store.value.items);

  /** Only confirmed bookings */
  const confirmedBookings = computed(() =>
    store.value.items.filter((b) => b.status === "confirmed"),
  );

  /** Total number of confirmed bookings */
  const bookingCount = computed(() => confirmedBookings.value.length);

  /** Bookings currently shown in cart/checkout */
  const activeBookings = computed(() => confirmedBookings.value);

  /** Total deposit amount across all active bookings */
  const bookingTotalDeposit = computed(() =>
    activeBookings.value.reduce((sum, b) => sum + b.deposit, 0),
  );

  /** Total rental cost across all active bookings */
  const bookingTotalRental = computed(() =>
    activeBookings.value.reduce((sum, b) => sum + b.totalCost, 0),
  );

  function replaceStoreBooking(booking: BookingItem): void {
    const index = store.value.items.findIndex(
      (item) => item.bookingId === booking.bookingId,
    );

    if (index >= 0) {
      store.value.items.splice(index, 1, booking);
    } else {
      store.value.items.push(booking);
    }

    store.value.updatedAt = new Date().toISOString();
  }

  async function fetchBookingsFromDb(
    userId: string,
  ): Promise<BookingStore | null> {
    try {
      const { data, error } = await supabase
        .from("rental_bookings")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        console.warn("[useBooking] fetchBookingsFromDb error:", error.message);
        return null;
      }

      const rows = (data ?? []) as Record<string, unknown>[];

      return {
        items: rows.map(mapRowToBooking),
        updatedAt:
          (rows.at(-1)?.updated_at as string | undefined) ??
          new Date().toISOString(),
      };
    } catch {
      console.warn("[useBooking] fetchBookingsFromDb failed");
      return null;
    }
  }

  async function migrateLegacyBookingsToDb(userId: string): Promise<void> {
    const legacyStore = loadBookings(userId);
    if (legacyStore.items.length === 0) return;

    const rows = legacyStore.items.map((item) => ({
      id: item.bookingId,
      ...mapBookingToInsert(userId, item),
      created_at: item.createdAt,
      updated_at: item.createdAt,
    }));

    try {
      const { error } = await supabase
        .from("rental_bookings")
        .upsert(rows, { onConflict: "id" });

      if (error) {
        console.warn(
          "[useBooking] migrateLegacyBookingsToDb error:",
          error.message,
        );
        return;
      }

      removeBookingStorage(userId);
    } catch {
      console.warn("[useBooking] migrateLegacyBookingsToDb failed");
    }
  }

  /**
   * (Re-)load bookings for the given user during client bootstrap
   * and when the authenticated user changes.
   */
  async function hydrateBookings(userId: string | null): Promise<void> {
    if (lastHydratedBookingUserId.value === userId) return;

    bookingHydrating.value = true;
    currentBookingUserId.value = userId;

    try {
      if (!userId) {
        store.value = emptyBookingStore();
        lastHydratedBookingUserId.value = userId;
        return;
      }

      const authenticatedUserId = await awaitAuthenticatedBookingUserId(userId);
      if (currentBookingUserId.value !== userId) return;

      if (authenticatedUserId !== userId) {
        lastHydratedBookingUserId.value = undefined;
        scheduleBookingHydrationRetry(userId);
        return;
      }

      await migrateLegacyBookingsToDb(userId);

      const dbStore = await fetchBookingsFromDb(userId);
      if (currentBookingUserId.value !== userId) return;

      if (!dbStore) {
        lastHydratedBookingUserId.value = undefined;
        scheduleBookingHydrationRetry(userId);
        return;
      }

      store.value = dbStore;
      lastHydratedBookingUserId.value = userId;
    } finally {
      if (currentBookingUserId.value === userId) {
        bookingHydrating.value = false;
      }
    }
  }

  async function createBooking(
    params: {
      userId?: string;
      productId: string;
      skuId: string;
      rentalAccessId?: string;
      rentalAccessCode?: string;
      rentalAccessSlug?: string;
      rentalAccessName?: string;
      rentalAccessThumbnail?: string;
      rentalAccessSnapshot?: Record<string, unknown>;
      matchedProductId?: string;
      matchedProductName?: string;
      productName: string;
      thumbnail: string;
      startDate: string;
      numDays: number;
      returnDate: string;
      dailyRate: number;
      totalCost: number;
      deposit: number;
      hubId?: string | null;
      hubName?: string | null;
    },
    status: BookingItem["status"],
  ): Promise<BookingItem> {
    let userId =
      params.userId ?? currentBookingUserId.value ?? user.value?.id ?? null;

    if (!userId) {
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.warn("[useBooking] getUser before createBooking failed:", {
          message: authError.message,
          status: authError.status,
        });
      }

      userId = authUser?.id ?? null;
    }

    if (!userId) {
      throw new Error("Authentication required to create a booking.");
    }

    currentBookingUserId.value = userId;

    const item = normalizeBookingItem({
      bookingId: generateBookingId(),
      ...params,
      hubId: params.hubId ?? null,
      hubName: params.hubName ?? null,
      status,
      createdAt: new Date().toISOString(),
    });

    const insertPayload = {
      id: item.bookingId,
      ...mapBookingToInsert(userId, item),
    };

    const { data, error } = await supabase
      .from("rental_bookings")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      console.warn("[useBooking] createBooking insert error:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload: insertPayload,
      });
      throw new Error(formatSupabaseError(error));
    }

    const booking = mapRowToBooking(data as Record<string, unknown>);
    replaceStoreBooking(booking);
    return booking;
  }

  /**
   * Add a new booking (status = "draft").
   */
  function addBooking(params: {
    userId?: string;
    productId: string;
    skuId: string;
    rentalAccessId?: string;
    rentalAccessCode?: string;
    rentalAccessSlug?: string;
    rentalAccessName?: string;
    rentalAccessThumbnail?: string;
    rentalAccessSnapshot?: Record<string, unknown>;
    matchedProductId?: string;
    matchedProductName?: string;
    productName: string;
    thumbnail: string;
    startDate: string;
    numDays: number;
    returnDate: string;
    dailyRate: number;
    totalCost: number;
    deposit: number;
    hubId?: string | null;
    hubName?: string | null;
  }): Promise<BookingItem> {
    return createBooking(params, "draft");
  }

  /**
   * Confirm a booking by writing the final confirmed row to Supabase.
   */
  async function confirmBooking(params: {
    userId?: string;
    productId: string;
    skuId: string;
    rentalAccessId?: string;
    rentalAccessCode?: string;
    rentalAccessSlug?: string;
    rentalAccessName?: string;
    rentalAccessThumbnail?: string;
    rentalAccessSnapshot?: Record<string, unknown>;
    matchedProductId?: string;
    matchedProductName?: string;
    productName: string;
    thumbnail: string;
    startDate: string;
    numDays: number;
    returnDate: string;
    dailyRate: number;
    totalCost: number;
    deposit: number;
    hubId?: string | null;
    hubName?: string | null;
  }): Promise<BookingItem> {
    return createBooking(params, "confirmed");
  }

  /**
   * Get a booking by its ID.
   */
  function getBookingById(bookingId: string): BookingItem | undefined {
    return store.value.items.find((b) => b.bookingId === bookingId);
  }

  /**
   * Update booking status (e.g. draft → confirmed, or → cancelled).
   */
  function updateBookingStatus(
    bookingId: string,
    status: BookingItem["status"],
  ): Promise<boolean> {
    return (async () => {
      try {
        const { data, error } = await supabase
          .from("rental_bookings")
          .update({ status })
          .eq("id", bookingId)
          .select("*")
          .single();

        if (error) {
          console.warn(
            "[useBooking] updateBookingStatus error:",
            error.message,
          );
          return false;
        }

        replaceStoreBooking(mapRowToBooking(data as Record<string, unknown>));
        return true;
      } catch {
        console.warn("[useBooking] updateBookingStatus failed");
        return false;
      }
    })();
  }

  /**
   * Update the hub/store selection for a booking.
   */
  function updateHub(
    bookingId: string,
    hubId: string,
    hubName: string,
  ): Promise<boolean> {
    return (async () => {
      try {
        const { data, error } = await supabase
          .from("rental_bookings")
          .update({ hub_id: hubId, hub_name: hubName })
          .eq("id", bookingId)
          .select("*")
          .single();

        if (error) {
          console.warn("[useBooking] updateHub error:", error.message);
          return false;
        }

        replaceStoreBooking(mapRowToBooking(data as Record<string, unknown>));
        return true;
      } catch {
        console.warn("[useBooking] updateHub failed");
        return false;
      }
    })();
  }

  /**
   * Remove a booking entirely.
   */
  function removeBooking(bookingId: string): Promise<boolean> {
    return (async () => {
      try {
        const { error } = await supabase
          .from("rental_bookings")
          .delete()
          .eq("id", bookingId);

        if (error) {
          console.warn("[useBooking] removeBooking error:", error.message);
          return false;
        }

        store.value.items = store.value.items.filter(
          (booking) => booking.bookingId !== bookingId,
        );
        store.value.updatedAt = new Date().toISOString();
        return true;
      } catch {
        console.warn("[useBooking] removeBooking failed");
        return false;
      }
    })();
  }

  /**
   * Clear all bookings.
   */
  function clearBookings(): Promise<boolean> {
    return (async () => {
      const userId = currentBookingUserId.value;
      if (!userId) {
        store.value = emptyBookingStore();
        return true;
      }

      try {
        const { error } = await supabase
          .from("rental_bookings")
          .delete()
          .eq("user_id", userId);

        if (error) {
          console.warn("[useBooking] clearBookings error:", error.message);
          return false;
        }

        store.value = emptyBookingStore();
        return true;
      } catch {
        console.warn("[useBooking] clearBookings failed");
        return false;
      }
    })();
  }

  function getConfirmedBookingCountBySku(skuId: string): number {
    return confirmedBookings.value.filter((b) => b.skuId === skuId).length;
  }

  function getRemainingAvailability(
    skuId: string,
    totalAvailable: number,
  ): number {
    return Math.max(totalAvailable - getConfirmedBookingCountBySku(skuId), 0);
  }

  /**
   * Clear in-memory booking state for the current session only.
   * Persisted user data remains available after the next login.
   */
  function resetBookingSession(): void {
    clearBookingHydrationRetry();

    store.value = emptyBookingStore();
    bookingHydrating.value = false;
    currentBookingUserId.value = null;
    lastHydratedBookingUserId.value = undefined;
  }

  // ── Client bootstrap + auth watch ─────────────────────────
  if (import.meta.client) {
    void initializeBookingHydration();

    watch(
      () => user.value?.id ?? null,
      (newId, oldId) => {
        if (oldId === undefined) {
          return;
        }

        if (newId !== oldId) {
          lastHydratedBookingUserId.value = undefined;

          if (!newId) {
            clearBookingHydrationRetry();
          }

          void hydrateBookings(newId);
        }
      },
    );
  }

  return {
    store,
    loading: computed(() => bookingHydrating.value),
    bookingItems,
    confirmedBookings,
    bookingCount,
    activeBookings,
    bookingTotalDeposit,
    bookingTotalRental,
    addBooking,
    confirmBooking,
    getBookingById,
    getConfirmedBookingCountBySku,
    getRemainingAvailability,
    updateBookingStatus,
    updateHub,
    removeBooking,
    clearBookings,
    resetBookingSession,
  };
}
