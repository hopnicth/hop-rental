import type { Cart, CartItem, GuestCartBuffer } from "~/types/cart";

// ── Constants ───────────────────────────────────────────────
const CART_STORAGE_PREFIX = "hop-rental-cart";
const GUEST_BUFFER_KEY = "hop-rental-cart-guest";
const GUEST_BUFFER_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Helpers ─────────────────────────────────────────────────

function cartStorageKey(userId: string | null): string {
  if (!userId) return "";
  return `${CART_STORAGE_PREFIX}-${userId}`;
}

function generateCartId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function emptyCart(): Cart {
  return { cartId: "", items: [], updatedAt: new Date().toISOString() };
}

function normalizePrice(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeDiscountPercent(
  value: unknown,
  originalUnitPrice: number,
  unitPrice: number,
): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.min(100, Math.max(0, Math.round(parsed)));
  }

  if (originalUnitPrice > unitPrice && originalUnitPrice > 0) {
    return Math.round(
      ((originalUnitPrice - unitPrice) / originalUnitPrice) * 100,
    );
  }

  return 0;
}

function normalizeCartItem(raw: Partial<CartItem>): CartItem {
  const unitPrice = normalizePrice(raw.unitPrice, 0);
  const originalUnitPrice = normalizePrice(raw.originalUnitPrice, unitPrice);

  return {
    productId: raw.productId ?? "",
    skuId: raw.skuId ?? "",
    name: raw.name ?? "",
    thumbnail: raw.thumbnail ?? "",
    unitPrice,
    originalUnitPrice: Math.max(originalUnitPrice, unitPrice),
    discountPercent: normalizeDiscountPercent(
      raw.discountPercent,
      originalUnitPrice,
      unitPrice,
    ),
    quantity: Math.max(1, Number(raw.quantity) || 1),
    addedAt: raw.addedAt ?? new Date().toISOString(),
  };
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Guest Buffer (localStorage with TTL) ────────────────────

function loadGuestBuffer(): CartItem[] {
  if (import.meta.server) return [];
  try {
    const raw = localStorage.getItem(GUEST_BUFFER_KEY);
    if (!raw) return [];
    const buf = JSON.parse(raw) as GuestCartBuffer;
    if (new Date(buf.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(GUEST_BUFFER_KEY);
      return [];
    }
    return (buf.items ?? []).map(normalizeCartItem);
  } catch {
    return [];
  }
}

function saveGuestBuffer(items: CartItem[]): void {
  if (import.meta.server) return;
  try {
    const buf: GuestCartBuffer = {
      items,
      expiresAt: new Date(Date.now() + GUEST_BUFFER_TTL_MS).toISOString(),
    };
    localStorage.setItem(GUEST_BUFFER_KEY, JSON.stringify(buf));
  } catch {
    // storage full — silently ignore
  }
}

function clearGuestBuffer(): void {
  if (import.meta.server) return;
  try {
    localStorage.removeItem(GUEST_BUFFER_KEY);
  } catch {
    // ignore
  }
}

// ── User localStorage (cache layer) ────────────────────────

function loadCartLocal(userId: string | null): Cart {
  if (import.meta.server) return emptyCart();
  const key = cartStorageKey(userId);
  if (!key) return emptyCart();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Cart;
      return {
        cartId: parsed.cartId || generateCartId(),
        userId: parsed.userId ?? userId,
        items: (parsed.items ?? []).map(normalizeCartItem),
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    /* corrupted → fresh */
  }
  return {
    cartId: generateCartId(),
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

function saveCartLocal(userId: string | null, data: Cart): void {
  if (import.meta.server) return;
  const key = cartStorageKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* storage full */
  }
}

function removeCartLocal(userId: string | null): void {
  if (import.meta.server) return;
  const key = cartStorageKey(userId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ── DB helpers (Supabase via RLS) ───────────────────────────

/** Map a DB row → CartItem */
function mapRowToItem(row: Record<string, unknown>): CartItem {
  return normalizeCartItem({
    productId: row.product_id as string,
    skuId: row.sku_id as string,
    name: row.name as string,
    thumbnail: (row.thumbnail as string) ?? "",
    unitPrice: Number(row.unit_price),
    originalUnitPrice: Number(row.original_unit_price ?? row.unit_price),
    discountPercent: Number(row.discount_percent ?? 0),
    quantity: Number(row.quantity),
    addedAt: (row.added_at as string) ?? new Date().toISOString(),
  });
}

/** Merge two item lists: same productId+skuId → sum quantities, else push */
function mergeItems(base: CartItem[], incoming: CartItem[]): CartItem[] {
  const merged = base.map((item) => ({ ...normalizeCartItem(item) }));
  for (const item of incoming.map(normalizeCartItem)) {
    const existing = merged.find(
      (m) => m.productId === item.productId && m.skuId === item.skuId,
    );
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

// ── Shared reactive state (singleton across components) ─────
const cart = ref<Cart>(emptyCart());
const currentUserId = ref<string | null>(null);
/** Prevents duplicate hydration when userId hasn't changed */
const lastHydratedUserId = ref<string | null | undefined>(undefined);

/**
 * Composable for managing the shopping cart.
 *
 * Storage strategy:
 *   - Guest (not logged in) → localStorage guest buffer with 2-hour TTL
 *   - Logged-in user → localStorage (cache) + Supabase DB (source of truth)
 *
 * 5 DB Sync Points:
 *   1. Login Sync        — merge guest buffer into user cart → DB
 *   2. Client Hydration  — bootstrap local cache first, then reconcile with DB
 *   3. Action Sync       — every mutation → save local + upsert DB
 *   4. Validation        — before checkout → re-fetch from DB to confirm
 *   5. Session Cleanup   — logout → persist to DB, clear local, reset state
 */
export function useCart() {
  const user = useSupabaseUser();
  const supabase = useSupabaseClient();
  const { getSaleStockBySku } = useProducts();
  let hydrateRetryTimer: ReturnType<typeof setTimeout> | null = null;

  function clearCartHydrationRetry(): void {
    if (!hydrateRetryTimer) return;
    clearTimeout(hydrateRetryTimer);
    hydrateRetryTimer = null;
  }

  function getEffectiveCartUserId(): string | null {
    return currentUserId.value ?? user.value?.id ?? null;
  }

  function normalizeRequestedQuantity(quantity: number): number {
    const parsed = Math.floor(Number(quantity));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function getCartStockLimit(productId: string, skuId: string): number | null {
    const inStock = getSaleStockBySku(productId, skuId);
    if (inStock == null) return null;
    return Math.max(0, Math.floor(inStock));
  }

  function scheduleCartHydrationRetry(userId: string): void {
    clearCartHydrationRetry();

    hydrateRetryTimer = setTimeout(() => {
      hydrateRetryTimer = null;
      if (
        currentUserId.value === userId &&
        lastHydratedUserId.value !== userId &&
        user.value?.id === userId
      ) {
        void hydrateCart(userId);
      }
    }, 400);
  }

  async function initializeCartHydration(): Promise<void> {
    const rememberedUserId = currentUserId.value ?? user.value?.id ?? null;

    if (rememberedUserId) {
      await hydrateCart(rememberedUserId);
      return;
    }

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    await hydrateCart(authUser?.id ?? null);
  }

  async function awaitAuthenticatedCartUserId(
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
      console.warn("[useCart] auth session not ready:", {
        expectedUserId,
        message: error.message,
        status: error.status,
      });
    }

    return null;
  }

  // ── Computed properties ────────────────────────────────────

  const cartItemCount = computed(() =>
    cart.value.items.reduce((sum, item) => sum + item.quantity, 0),
  );
  const cartId = computed(() => cart.value.cartId);
  const cartItems = computed(() => cart.value.items);
  const cartSubtotal = computed(() =>
    cart.value.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    ),
  );

  // ── DB operations ──────────────────────────────────────────

  /** Ensure a `carts` row exists for the user; return its id. */
  async function ensureDbCart(userId: string): Promise<string | null> {
    try {
      const authenticatedUserId = await awaitAuthenticatedCartUserId(userId);
      if (authenticatedUserId !== userId) {
        return null;
      }

      // Try select first
      const { data: existing, error: selectError } = await supabase
        .from("carts")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (selectError) {
        console.warn(
          "[useCart] ensureDbCart select error:",
          selectError.message,
        );
        return null;
      }

      if (existing) return existing.id as string;

      // Create new
      const { data: created, error: err } = await supabase
        .from("carts")
        .insert({ user_id: userId })
        .select("id")
        .single();
      if (err) {
        console.warn("[useCart] ensureDbCart insert error:", err.message);
        return null;
      }
      return created?.id as string | null;
    } catch {
      console.warn("[useCart] ensureDbCart failed");
      return null;
    }
  }

  /** Fetch cart items from DB for a given user. */
  async function fetchCartFromDb(
    userId: string,
  ): Promise<{ items: CartItem[]; updatedAt: string } | null> {
    try {
      const authenticatedUserId = await awaitAuthenticatedCartUserId(userId);
      if (authenticatedUserId !== userId) {
        throw new Error("AUTH_SESSION_NOT_READY");
      }

      const { data: cartRow, error: cartError } = await supabase
        .from("carts")
        .select("id, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (cartError) {
        console.warn(
          "[useCart] fetchCartFromDb cart error:",
          cartError.message,
        );
        throw cartError;
      }

      if (!cartRow) return null;

      const { data: rows, error: itemsError } = await supabase
        .from("cart_items")
        .select("*")
        .eq("cart_id", cartRow.id);

      if (itemsError) {
        console.warn(
          "[useCart] fetchCartFromDb cart_items error:",
          itemsError.message,
        );
        throw itemsError;
      }

      return {
        items: (rows ?? []).map((r: Record<string, unknown>) =>
          mapRowToItem(r),
        ),
        updatedAt: cartRow.updated_at as string,
      };
    } catch {
      throw new Error("FETCH_CART_FROM_DB_FAILED");
    }
  }

  /** Replace all items in DB with the given list (delete + insert). */
  async function upsertCartToDb(
    userId: string,
    items: CartItem[],
  ): Promise<void> {
    try {
      const authenticatedUserId = await awaitAuthenticatedCartUserId(userId);
      if (authenticatedUserId !== userId) {
        console.warn(
          "[useCart] upsertCartToDb skipped: auth session not ready",
        );
        return;
      }

      const dbCartId = await ensureDbCart(userId);
      if (!dbCartId) return;

      // Delete existing items
      const { error: deleteError } = await supabase
        .from("cart_items")
        .delete()
        .eq("cart_id", dbCartId);

      if (deleteError) {
        console.warn(
          "[useCart] upsertCartToDb delete error:",
          deleteError.message,
        );
        return;
      }

      // Insert current items
      if (items.length > 0) {
        const rows = items.map((item) => ({
          cart_id: dbCartId,
          product_id: item.productId,
          sku_id: item.skuId,
          name: item.name,
          thumbnail: item.thumbnail,
          unit_price: item.unitPrice,
          original_unit_price: item.originalUnitPrice,
          discount_percent: item.discountPercent,
          quantity: item.quantity,
          added_at: item.addedAt,
        }));
        const { error: insertError } = await supabase
          .from("cart_items")
          .insert(rows);

        if (insertError) {
          console.warn(
            "[useCart] upsertCartToDb insert error:",
            insertError.message,
          );
          return;
        }
      }

      // Touch updated_at
      const { error: updateError } = await supabase
        .from("carts")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", dbCartId);

      if (updateError) {
        console.warn(
          "[useCart] upsertCartToDb touch error:",
          updateError.message,
        );
      }
    } catch {
      console.warn("[useCart] upsertCartToDb failed");
    }
  }

  // ── Persist helper (Sync 3 — Action Sync) ─────────────────

  /** Save cart to localStorage + DB (if logged in), or guest buffer. */
  function persistCart(): void {
    cart.value.updatedAt = new Date().toISOString();
    const effectiveUserId = getEffectiveCartUserId();

    if (effectiveUserId) {
      currentUserId.value = effectiveUserId;
      saveCartLocal(effectiveUserId, cart.value);
      // Fire-and-forget DB sync
      void upsertCartToDb(effectiveUserId, cart.value.items);
    } else {
      saveGuestBuffer(cart.value.items);
    }
  }

  // ── Hydration (Sync 1 — Login + Sync 2 — Client bootstrap) ──

  /**
   * (Re-)load cart for the given user.
   *
   * Guest → load from guest buffer (TTL-checked).
   * Logged-in → load local cache immediately, then reconcile with DB
   *             + merge any guest buffer items + clear guest buffer.
   */
  async function hydrateCart(userId: string | null): Promise<void> {
    // Skip if already hydrated for this exact userId
    if (lastHydratedUserId.value === userId) return;
    currentUserId.value = userId;

    if (!userId) {
      // ── Guest mode ──
      const guestItems = loadGuestBuffer();
      cart.value = {
        cartId: cart.value.cartId || generateCartId(),
        items: guestItems,
        updatedAt: new Date().toISOString(),
      };
      lastHydratedUserId.value = userId;
      return;
    }

    // ── Logged-in mode ──

    // 1. Show local cache immediately (fast)
    const localCart = loadCartLocal(userId);
    cart.value = localCart;

    let dbData: { items: CartItem[]; updatedAt: string } | null = null;

    try {
      // 2. Fetch from DB (source of truth)
      dbData = await fetchCartFromDb(userId);
    } catch {
      if (currentUserId.value === userId) {
        lastHydratedUserId.value = undefined;
        scheduleCartHydrationRetry(userId);
      }
      return;
    }

    if (currentUserId.value !== userId) return;

    // 3. Reconcile local vs DB
    //
    // The DB is the canonical source whenever its updated_at is at least as
    // recent as the local snapshot — including the case where the DB was just
    // emptied server-side (e.g. on a paid order). Trusting timestamp alone
    // (instead of "DB has items") prevents stale localStorage from re-uploading
    // cleared items back into the DB on the next page load.
    if (dbData) {
      const dbTime = new Date(dbData.updatedAt).getTime();
      const localTime = new Date(localCart.updatedAt).getTime();
      const hasLocalItems = localCart.items.length > 0;
      const shouldUseDb = !hasLocalItems || dbTime >= localTime;

      if (shouldUseDb) {
        cart.value.items = dbData.items;
        cart.value.updatedAt = dbData.updatedAt;
      }
    }

    // 4. Merge guest buffer if present (Sync 1 — Login Sync)
    const guestItems = loadGuestBuffer();
    if (guestItems.length > 0) {
      cart.value.items = mergeItems(cart.value.items, guestItems);
      cart.value.updatedAt = new Date().toISOString();
      clearGuestBuffer();
    }

    // 5. Persist merged result
    saveCartLocal(userId, cart.value);
    await upsertCartToDb(userId, cart.value.items);
    lastHydratedUserId.value = userId;
  }

  // ── Mutations (Sync 3 — Action Sync) ──────────────────────

  function addToCart(
    productId: string,
    skuId: string,
    name: string,
    thumbnail: string,
    unitPrice: number,
    quantity = 1,
    originalUnitPrice = unitPrice,
    discountPercent = 0,
  ): boolean {
    const requestedQuantity = normalizeRequestedQuantity(quantity);
    if (requestedQuantity <= 0) return false;

    const stockLimit = getCartStockLimit(productId, skuId);
    if (stockLimit === 0) return false;

    const existing = cart.value.items.find(
      (i) => i.productId === productId && i.skuId === skuId,
    );

    if (existing) {
      const nextQuantity =
        stockLimit == null
          ? existing.quantity + requestedQuantity
          : Math.min(existing.quantity + requestedQuantity, stockLimit);

      if (nextQuantity === existing.quantity) {
        return false;
      }

      existing.quantity = nextQuantity;
      existing.originalUnitPrice = Math.max(
        existing.originalUnitPrice,
        originalUnitPrice,
        existing.unitPrice,
      );
      existing.discountPercent = Math.max(
        existing.discountPercent,
        normalizeDiscountPercent(discountPercent, originalUnitPrice, unitPrice),
      );
    } else {
      const initialQuantity =
        stockLimit == null
          ? requestedQuantity
          : Math.min(requestedQuantity, stockLimit);

      if (initialQuantity <= 0) {
        return false;
      }

      cart.value.items.push(
        normalizeCartItem({
          productId,
          skuId,
          name,
          thumbnail,
          unitPrice,
          originalUnitPrice,
          discountPercent,
          quantity: initialQuantity,
          addedAt: new Date().toISOString(),
        }),
      );
    }
    persistCart();
    return true;
  }

  function updateQuantity(
    productId: string,
    skuId: string,
    newQuantity: number,
  ): boolean {
    const existingItem = cart.value.items.find(
      (i) => i.productId === productId && i.skuId === skuId,
    );

    if (!existingItem) return false;

    const requestedQuantity = normalizeRequestedQuantity(newQuantity);
    if (requestedQuantity <= 0) {
      cart.value.items = cart.value.items.filter(
        (i) => !(i.productId === productId && i.skuId === skuId),
      );
      persistCart();
      return true;
    }

    const stockLimit = getCartStockLimit(productId, skuId);
    const nextQuantity =
      stockLimit == null
        ? requestedQuantity
        : Math.min(requestedQuantity, stockLimit);

    if (nextQuantity <= 0) {
      cart.value.items = cart.value.items.filter(
        (i) => !(i.productId === productId && i.skuId === skuId),
      );
      persistCart();
      return true;
    }

    if (existingItem.quantity === nextQuantity) {
      return false;
    }

    existingItem.quantity = nextQuantity;
    persistCart();
    return true;
  }

  function removeFromCart(productId: string, skuId: string): void {
    cart.value.items = cart.value.items.filter(
      (i) => !(i.productId === productId && i.skuId === skuId),
    );
    persistCart();
  }

  function clearCart(): void {
    cart.value.items = [];
    persistCart();
  }

  async function clearCartPersisted(): Promise<void> {
    cart.value.items = [];
    cart.value.updatedAt = new Date().toISOString();

    const effectiveUserId = getEffectiveCartUserId();
    if (effectiveUserId) {
      currentUserId.value = effectiveUserId;
      saveCartLocal(effectiveUserId, cart.value);
      await upsertCartToDb(effectiveUserId, []);
      return;
    }

    saveGuestBuffer([]);
    clearGuestBuffer();
  }

  // ── Validation (Sync 4 — Checkout) ────────────────────────

  /**
   * Re-fetch cart from DB to ensure data is fresh before checkout.
   * Returns true if cart is valid (has items), false otherwise.
   */
  async function validateCart(): Promise<boolean> {
    if (!currentUserId.value) return false;

    let dbData: { items: CartItem[]; updatedAt: string } | null = null;

    try {
      dbData = await fetchCartFromDb(currentUserId.value);
    } catch {
      return cart.value.items.length > 0;
    }

    if (dbData) {
      cart.value.items = dbData.items;
      cart.value.updatedAt = dbData.updatedAt;
      saveCartLocal(currentUserId.value, cart.value);
    }
    return cart.value.items.length > 0;
  }

  // ── Cleanup (Sync 5 — Logout) ─────────────────────────────

  /**
   * Persist final state to DB, then clear localStorage + reset reactive state.
   */
  async function resetCartSession(): Promise<void> {
    const effectiveUserId = getEffectiveCartUserId();

    clearCartHydrationRetry();

    if (effectiveUserId) {
      await upsertCartToDb(effectiveUserId, cart.value.items);
      removeCartLocal(effectiveUserId);
    }
    clearGuestBuffer();
    cart.value = emptyCart();
    currentUserId.value = null;
    lastHydratedUserId.value = undefined;
  }

  // ── Client bootstrap + auth watch ─────────────────────────

  if (import.meta.client) {
    void initializeCartHydration();

    watch(
      () => user.value?.id ?? null,
      (newId, oldId) => {
        if (oldId === undefined) {
          return;
        }

        if (newId !== oldId) {
          // Reset so hydrateCart runs again for the new user
          lastHydratedUserId.value = undefined;
          if (!newId) {
            clearCartHydrationRetry();
          }

          void hydrateCart(newId);
        }
      },
    );
  }

  return {
    cart,
    cartId,
    cartItems,
    cartItemCount,
    cartSubtotal,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    clearCartPersisted,
    validateCart,
    resetCartSession,
  };
}
