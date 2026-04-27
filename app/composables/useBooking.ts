import type { BookingItem, BookingStore } from "~/types/booking";
import type { RentalBookingInsert } from "~/types/rental-booking";
import {
  normalizeRentalPricingBreakdown,
  type RentalPricingBreakdown,
} from "~/utils/rental-pricing";

const BOOKING_STORAGE_PREFIX = "hop-rental-bookings";

interface CreateBookingParams {
  userId?: string;
  /** Optional — empty/undefined for asset-only bookings */
  productId?: string;
  /** Optional — empty/undefined for asset-only bookings */
  skuId?: string;
  assetId?: string;
  assetCode?: string;
  assetSlug?: string;
  assetName?: string;
  assetThumbnail?: string;
  assetSnapshot?: Record<string, unknown>;
  matchedProductId?: string;
  matchedProductName?: string;
  productName: string;
  thumbnail: string;
  startDate: string;
  numDays: number;
  returnDate: string;
  dailyRate: number;
  weeklyRate?: number;
  monthlyRate?: number;
  totalCost: number;
  deposit: number;
  pricingBreakdown?: RentalPricingBreakdown;
  hubId?: string | null;
  hubName?: string | null;
  bookerName?: string | null;
  bookerPhone?: string | null;
}

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

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function normalizeAssetId(value: unknown): string | undefined {
  return isUuid(value) ? value : undefined;
}

function normalizeBookingItem(raw: Partial<BookingItem>): BookingItem {
  const createdAt = raw.createdAt ?? new Date().toISOString();

  return {
    bookingId: raw.bookingId ?? generateBookingId(),
    productId: raw.productId ?? "",
    skuId: raw.skuId ?? "",
    assetId: normalizeAssetId(raw.assetId),
    assetCode: raw.assetCode,
    assetSlug: raw.assetSlug,
    assetName: raw.assetName,
    assetThumbnail: raw.assetThumbnail,
    assetSnapshot: normalizeRecord(raw.assetSnapshot),
    matchedProductId: raw.matchedProductId,
    matchedProductName: raw.matchedProductName,
    productName: raw.productName ?? "",
    thumbnail: raw.thumbnail ?? "",
    startDate: raw.startDate ?? "",
    numDays: Math.max(1, Number(raw.numDays) || 1),
    returnDate: raw.returnDate ?? raw.startDate ?? "",
    dailyRate: normalizeMoney(raw.dailyRate),
    weeklyRate: normalizeMoney(raw.weeklyRate),
    monthlyRate: normalizeMoney(raw.monthlyRate),
    totalCost: normalizeMoney(raw.totalCost),
    deposit: normalizeMoney(raw.deposit),
    pricingBreakdown: raw.pricingBreakdown,
    hubId: raw.hubId ?? null,
    hubName: raw.hubName ?? null,
    bookerName: raw.bookerName ?? null,
    bookerPhone: raw.bookerPhone ?? null,
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

function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
  column: string,
): boolean {
  return (
    error?.code === "PGRST204" &&
    typeof error.message === "string" &&
    error.message.includes(`'${column}'`)
  );
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapRowToBooking(
  row: Record<string, unknown>,
  fallback?: Partial<BookingItem>,
): BookingItem {
  const numDays = Number(row.rental_days);
  const dailyRate = Number(row.daily_rate);
  const weeklyRate = Number(row.weekly_rate);
  const monthlyRate = Number(row.monthly_rate);
  const totalCost = Number(row.rental_total);
  const deposit = Number(row.deposit_amount);
  const pricingBreakdown =
    normalizeRentalPricingBreakdown(row.pricing_breakdown) ??
    fallback?.pricingBreakdown;

  return normalizeBookingItem({
    bookingId: (row.id as string) ?? fallback?.bookingId,
    productId: (row.product_id as string) ?? fallback?.productId,
    skuId: (row.sku_id as string) ?? fallback?.skuId,
    assetId: (row.asset_id as string) ?? fallback?.assetId ?? undefined,
    assetCode: (row.asset_code as string) ?? fallback?.assetCode ?? undefined,
    assetSlug: (row.asset_slug as string) ?? fallback?.assetSlug ?? undefined,
    assetName: (row.asset_name as string) ?? fallback?.assetName ?? undefined,
    assetThumbnail:
      (row.asset_thumbnail as string) ?? fallback?.assetThumbnail ?? undefined,
    assetSnapshot:
      normalizeRecord(row.asset_snapshot) ??
      fallback?.assetSnapshot ??
      undefined,
    matchedProductId:
      (row.matched_product_id as string) ??
      fallback?.matchedProductId ??
      undefined,
    matchedProductName:
      (row.matched_product_name as string) ??
      fallback?.matchedProductName ??
      undefined,
    productName:
      (row.asset_name as string) ??
      (row.product_name as string) ??
      fallback?.productName,
    thumbnail:
      (row.asset_thumbnail as string) ??
      (row.thumbnail as string) ??
      fallback?.thumbnail ??
      "",
    startDate: (row.start_date as string) ?? fallback?.startDate,
    numDays: Number.isFinite(numDays) ? numDays : fallback?.numDays,
    returnDate: (row.end_date as string) ?? fallback?.returnDate,
    dailyRate: Number.isFinite(dailyRate) ? dailyRate : fallback?.dailyRate,
    weeklyRate: Number.isFinite(weeklyRate) ? weeklyRate : fallback?.weeklyRate,
    monthlyRate: Number.isFinite(monthlyRate)
      ? monthlyRate
      : fallback?.monthlyRate,
    totalCost: Number.isFinite(totalCost) ? totalCost : fallback?.totalCost,
    deposit: Number.isFinite(deposit) ? deposit : fallback?.deposit,
    pricingBreakdown,
    hubId: (row.hub_id as string) ?? fallback?.hubId ?? null,
    hubName: (row.hub_name as string) ?? fallback?.hubName ?? null,
    bookerName: (row.booker_name as string) ?? fallback?.bookerName ?? null,
    bookerPhone: (row.booker_phone as string) ?? fallback?.bookerPhone ?? null,
    status: (row.status as BookingItem["status"]) ?? fallback?.status,
    createdAt:
      (row.created_at as string) ??
      fallback?.createdAt ??
      new Date().toISOString(),
  });
}

function mapBookingToInsert(
  userId: string,
  booking: BookingItem,
): RentalBookingInsert {
  const assetId = normalizeAssetId(booking.assetId);

  return {
    user_id: userId,
    product_id: booking.productId || null,
    sku_id: booking.skuId || null,
    asset_id: assetId ?? null,
    hub_id: booking.hubId,
    product_name: booking.productName,
    thumbnail: booking.thumbnail,
    hub_name: booking.hubName,
    asset_code: booking.assetCode ?? null,
    asset_slug: booking.assetSlug ?? null,
    asset_name: booking.assetName ?? null,
    asset_thumbnail: booking.assetThumbnail ?? null,
    asset_snapshot: booking.assetSnapshot ?? {},
    matched_product_id: booking.matchedProductId || booking.productId || null,
    matched_product_name: booking.matchedProductName ?? booking.productName,
    start_date: booking.startDate,
    end_date: booking.returnDate,
    rental_days: booking.numDays,
    pricing_model: "daily",
    currency_code: "THB",
    daily_rate: booking.dailyRate,
    weekly_rate: booking.weeklyRate,
    monthly_rate: booking.monthlyRate,
    rental_total: booking.totalCost,
    deposit_amount: booking.deposit,
    pricing_breakdown: booking.pricingBreakdown ?? {},
    booker_name: booking.bookerName ?? null,
    booker_phone: booking.bookerPhone ?? null,
    status: booking.status,
  };
}

function mapBookingToLegacyInsert(
  userId: string,
  booking: BookingItem,
): Pick<
  RentalBookingInsert,
  | "user_id"
  | "product_id"
  | "sku_id"
  | "hub_id"
  | "product_name"
  | "thumbnail"
  | "hub_name"
  | "start_date"
  | "end_date"
  | "rental_days"
  | "pricing_model"
  | "currency_code"
  | "daily_rate"
  | "rental_total"
  | "deposit_amount"
  | "status"
> {
  return {
    user_id: userId,
    product_id: booking.productId || null,
    sku_id: booking.skuId || null,
    hub_id: booking.hubId,
    product_name: booking.productName,
    thumbnail: booking.thumbnail,
    hub_name: booking.hubName,
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
  const supportsExtendedBookingSchema = useState<boolean | null>(
    "booking:supports-extended-schema",
    () => null,
  );

  async function insertBookingWithSchemaFallback(
    booking: BookingItem,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const fullPayload = {
      id: booking.bookingId,
      ...mapBookingToInsert(userId, booking),
    };
    const legacyPayload = {
      id: booking.bookingId,
      ...mapBookingToLegacyInsert(userId, booking),
    };

    if (supportsExtendedBookingSchema.value === false) {
      const { data, error } = await supabase
        .from("rental_bookings")
        .insert(legacyPayload)
        .select("*")
        .single();

      if (error) {
        console.warn("[useBooking] legacy createBooking insert error:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          payload: legacyPayload,
        });
        throw new Error(formatSupabaseError(error));
      }

      return data as Record<string, unknown>;
    }

    const { data, error } = await supabase
      .from("rental_bookings")
      .insert(fullPayload)
      .select("*")
      .single();

    if (!error) {
      supportsExtendedBookingSchema.value = true;
      return data as Record<string, unknown>;
    }

    const missingExtendedColumn = [
      "matched_product_id",
      "matched_product_name",
      "asset_id",
      "asset_code",
      "asset_slug",
      "asset_name",
      "asset_thumbnail",
      "asset_snapshot",
      "weekly_rate",
      "monthly_rate",
      "pricing_breakdown",
      "booker_name",
      "booker_phone",
    ].some((column) => isMissingColumnError(error, column));

    if (!missingExtendedColumn) {
      console.warn("[useBooking] createBooking insert error:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload: fullPayload,
      });
      throw new Error(formatSupabaseError(error));
    }

    supportsExtendedBookingSchema.value = false;

    const { data: legacyData, error: legacyError } = await supabase
      .from("rental_bookings")
      .insert(legacyPayload)
      .select("*")
      .single();

    if (legacyError) {
      console.warn("[useBooking] legacy createBooking insert error:", {
        code: legacyError.code,
        message: legacyError.message,
        details: legacyError.details,
        hint: legacyError.hint,
        payload: legacyPayload,
      });
      throw new Error(formatSupabaseError(legacyError));
    }

    return legacyData as Record<string, unknown>;
  }

  async function upsertBookingsWithSchemaFallback(
    items: BookingItem[],
    userId: string,
  ): Promise<boolean> {
    const fullRows = items.map((item) => ({
      id: item.bookingId,
      ...mapBookingToInsert(userId, item),
      created_at: item.createdAt,
      updated_at: item.createdAt,
    }));
    const legacyRows = items.map((item) => ({
      id: item.bookingId,
      ...mapBookingToLegacyInsert(userId, item),
      created_at: item.createdAt,
      updated_at: item.createdAt,
    }));

    if (supportsExtendedBookingSchema.value === false) {
      const { error } = await supabase
        .from("rental_bookings")
        .upsert(legacyRows, { onConflict: "id" });
      if (error) {
        console.warn(
          "[useBooking] legacy migrateLegacyBookingsToDb error:",
          error.message,
        );
        return false;
      }
      return true;
    }

    const { error } = await supabase
      .from("rental_bookings")
      .upsert(fullRows, { onConflict: "id" });

    if (!error) {
      supportsExtendedBookingSchema.value = true;
      return true;
    }

    const missingExtendedColumn = [
      "matched_product_id",
      "matched_product_name",
      "asset_id",
      "asset_code",
      "asset_slug",
      "asset_name",
      "asset_thumbnail",
      "asset_snapshot",
      "weekly_rate",
      "monthly_rate",
      "pricing_breakdown",
      "booker_name",
      "booker_phone",
    ].some((column) => isMissingColumnError(error, column));

    if (!missingExtendedColumn) {
      console.warn(
        "[useBooking] migrateLegacyBookingsToDb error:",
        error.message,
      );
      return false;
    }

    supportsExtendedBookingSchema.value = false;

    const { error: legacyError } = await supabase
      .from("rental_bookings")
      .upsert(legacyRows, { onConflict: "id" });

    if (legacyError) {
      console.warn(
        "[useBooking] legacy migrateLegacyBookingsToDb error:",
        legacyError.message,
      );
      return false;
    }

    return true;
  }

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

  /** Draft bookings staged in cart before final submission */
  const draftBookings = computed(() =>
    store.value.items.filter((b) => b.status === "draft"),
  );

  /** Only confirmed bookings */
  const confirmedBookings = computed(() =>
    store.value.items.filter((b) => b.status === "confirmed"),
  );

  /** Bookings that should still block availability */
  const blockingBookings = computed(() =>
    store.value.items.filter((b) => b.status !== "cancelled"),
  );

  /** Total number of confirmed bookings */
  const bookingCount = computed(() => confirmedBookings.value.length);

  /** Draft bookings currently shown in cart/checkout */
  const activeBookings = computed(() => draftBookings.value);

  /** Total deposit amount across all confirmed bookings */
  const bookingTotalDeposit = computed(() =>
    confirmedBookings.value.reduce((sum, b) => sum + b.deposit, 0),
  );

  /** Total rental cost across all confirmed bookings */
  const bookingTotalRental = computed(() =>
    confirmedBookings.value.reduce((sum, b) => sum + b.totalCost, 0),
  );

  /** Total deposit amount across all draft cart bookings */
  const activeBookingTotalDeposit = computed(() =>
    activeBookings.value.reduce((sum, b) => sum + b.deposit, 0),
  );

  /** Total rental cost across all draft cart bookings */
  const activeBookingTotalRental = computed(() =>
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

    try {
      const ok = await upsertBookingsWithSchemaFallback(
        legacyStore.items,
        userId,
      );

      if (!ok) {
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
    params: CreateBookingParams,
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

    const data = await insertBookingWithSchemaFallback(item, userId);
    const booking = mapRowToBooking(data, item);
    replaceStoreBooking(booking);
    return booking;
  }

  /**
   * Add a new booking (status = "draft").
   */
  function addBooking(params: CreateBookingParams): Promise<BookingItem> {
    return createBooking(params, "draft");
  }

  /**
   * Confirm a booking by writing the final confirmed row to Supabase.
   */
  async function confirmBooking(
    params: CreateBookingParams,
  ): Promise<BookingItem> {
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

        replaceStoreBooking(
          mapRowToBooking(
            data as Record<string, unknown>,
            getBookingById(bookingId),
          ),
        );
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

        replaceStoreBooking(
          mapRowToBooking(
            data as Record<string, unknown>,
            getBookingById(bookingId),
          ),
        );
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
    return blockingBookings.value.filter((b) => b.skuId === skuId).length;
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
    draftBookings,
    confirmedBookings,
    blockingBookings,
    bookingCount,
    activeBookings,
    bookingTotalDeposit,
    bookingTotalRental,
    activeBookingTotalDeposit,
    activeBookingTotalRental,
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
