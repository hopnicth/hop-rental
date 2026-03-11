import type { BookingItem, BookingStore } from "~/types/booking";

const BOOKING_STORAGE_PREFIX = "hop-rental-bookings";
const BOOKING_CONFIRM_DELAY_MS = 250;

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

function waitForBookingConfirmation(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, BOOKING_CONFIRM_DELAY_MS);
  });
}

/**
 * Read bookings from localStorage (client-side only).
 */
function loadBookings(userId: string | null): BookingStore {
  if (import.meta.server) return emptyBookingStore();

  const key = bookingStorageKey(userId);
  if (!key) return emptyBookingStore();

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as BookingStore;
    }
  } catch {
    // corrupted data — start fresh
  }

  return emptyBookingStore();
}

/**
 * Persist bookings to localStorage (client-side only).
 */
function saveBookings(userId: string | null, bs: BookingStore): void {
  if (import.meta.server) return;

  const key = bookingStorageKey(userId);
  if (!key) return;

  try {
    localStorage.setItem(key, JSON.stringify(bs));
  } catch {
    // storage full or unavailable — silently ignore
  }
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
/** Track which userId the bookings are currently loaded for */
const currentBookingUserId = ref<string | null>(null);

/**
 * Composable for managing rental bookings.
 * State is persisted in localStorage **per user** and shared across all components.
 *
 * - Storage key: `hop-rental-bookings-{userId}`
 * - No login → empty bookings
 * - Logout → `destroyBookings()` removes storage + resets state
 */
export function useBooking() {
  const user = useSupabaseUser();

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

  /**
   * (Re-)load bookings for the given user. Called on mount + when user changes.
   */
  function hydrateBookings(userId: string | null): void {
    currentBookingUserId.value = userId;
    store.value = loadBookings(userId);
  }

  /**
   * Add a new booking (status = "draft").
   */
  function addBooking(params: {
    productId: string;
    skuId: string;
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
  }): BookingItem {
    const item: BookingItem = {
      bookingId: generateBookingId(),
      ...params,
      thumbnail: params.thumbnail,
      hubId: params.hubId ?? null,
      hubName: params.hubName ?? null,
      status: "draft",
      createdAt: new Date().toISOString(),
    };

    store.value.items.push(item);
    store.value.updatedAt = new Date().toISOString();
    saveBookings(currentBookingUserId.value, store.value);

    return item;
  }

  /**
   * Confirm a booking after client-side persistence completes.
   * This keeps the product page UX async-ready until bookings move server-side.
   */
  async function confirmBooking(params: {
    productId: string;
    skuId: string;
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
    const booking = addBooking(params);
    await waitForBookingConfirmation();
    updateBookingStatus(booking.bookingId, "confirmed");
    return getBookingById(booking.bookingId) ?? booking;
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
  ): void {
    const item = store.value.items.find((b) => b.bookingId === bookingId);
    if (item) {
      item.status = status;
      store.value.updatedAt = new Date().toISOString();
      saveBookings(currentBookingUserId.value, store.value);
    }
  }

  /**
   * Update the hub/store selection for a booking.
   */
  function updateHub(bookingId: string, hubId: string, hubName: string): void {
    const item = store.value.items.find((b) => b.bookingId === bookingId);
    if (item) {
      item.hubId = hubId;
      item.hubName = hubName;
      store.value.updatedAt = new Date().toISOString();
      saveBookings(currentBookingUserId.value, store.value);
    }
  }

  /**
   * Remove a booking entirely.
   */
  function removeBooking(bookingId: string): void {
    store.value.items = store.value.items.filter(
      (b) => b.bookingId !== bookingId,
    );
    store.value.updatedAt = new Date().toISOString();
    saveBookings(currentBookingUserId.value, store.value);
  }

  /**
   * Clear all bookings.
   */
  function clearBookings(): void {
    store.value.items = [];
    store.value.updatedAt = new Date().toISOString();
    saveBookings(currentBookingUserId.value, store.value);
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
    store.value = emptyBookingStore();
    currentBookingUserId.value = null;
  }

  /**
   * Destroy bookings completely — removes localStorage entry + resets reactive state.
   * Called on logout.
   */
  function destroyBookings(): void {
    removeBookingStorage(currentBookingUserId.value);
    store.value = emptyBookingStore();
    currentBookingUserId.value = null;
  }

  // ── Hydrate on mount + react to user changes (client-only) ──
  if (import.meta.client) {
    onMounted(() => {
      hydrateBookings(user.value?.id ?? null);
    });

    watch(user, (newUser) => {
      hydrateBookings(newUser?.id ?? null);
    });
  }

  return {
    store,
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
    destroyBookings,
  };
}
