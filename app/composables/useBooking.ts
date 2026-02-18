import type { BookingItem, BookingStore } from "~/types/booking";

const BOOKING_STORAGE_KEY = "hop-rental-bookings";

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

/**
 * Read bookings from localStorage (client-side only).
 */
function loadBookings(): BookingStore {
  if (import.meta.server) {
    return { items: [], updatedAt: new Date().toISOString() };
  }

  try {
    const raw = localStorage.getItem(BOOKING_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as BookingStore;
    }
  } catch {
    // corrupted data — start fresh
  }

  return { items: [], updatedAt: new Date().toISOString() };
}

/**
 * Persist bookings to localStorage (client-side only).
 */
function saveBookings(store: BookingStore): void {
  if (import.meta.server) return;

  try {
    localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

// ── Shared reactive state (singleton across components) ──
const store = ref<BookingStore>(loadBookings());

/**
 * Composable for managing rental bookings.
 * State is persisted in localStorage and shared across all components.
 *
 * TODO: Add server sync when API is ready.
 */
export function useBooking() {
  /** All booking items */
  const bookingItems = computed(() => store.value.items);

  /** Total number of bookings (all statuses) */
  const bookingCount = computed(() => store.value.items.length);

  /** Only active (non-cancelled) bookings */
  const activeBookings = computed(() =>
    store.value.items.filter((b) => b.status !== "cancelled"),
  );

  /**
   * Add a new booking (status = "draft").
   */
  function addBooking(params: {
    productId: string;
    skuId: string;
    productName: string;
    startDate: string;
    numDays: number;
    returnDate: string;
    dailyRate: number;
    totalCost: number;
    deposit: number;
  }): BookingItem {
    const item: BookingItem = {
      bookingId: generateBookingId(),
      ...params,
      status: "draft",
      createdAt: new Date().toISOString(),
    };

    store.value.items.push(item);
    store.value.updatedAt = new Date().toISOString();
    saveBookings(store.value);

    return item;
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
      saveBookings(store.value);
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
    saveBookings(store.value);
  }

  /**
   * Clear all bookings.
   */
  function clearBookings(): void {
    store.value.items = [];
    store.value.updatedAt = new Date().toISOString();
    saveBookings(store.value);
  }

  // ── Hydrate from localStorage on client mount ──
  if (import.meta.client) {
    onMounted(() => {
      store.value = loadBookings();
    });
  }

  return {
    store,
    bookingItems,
    bookingCount,
    activeBookings,
    addBooking,
    getBookingById,
    updateBookingStatus,
    removeBooking,
    clearBookings,
  };
}

