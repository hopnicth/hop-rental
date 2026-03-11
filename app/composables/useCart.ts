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
    return buf.items;
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
    if (raw) return JSON.parse(raw) as Cart;
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
  return {
    productId: row.product_id as string,
    skuId: row.sku_id as string,
    name: row.name as string,
    thumbnail: (row.thumbnail as string) ?? "",
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    addedAt: (row.added_at as string) ?? new Date().toISOString(),
  };
}

/** Merge two item lists: same productId+skuId → sum quantities, else push */
function mergeItems(base: CartItem[], incoming: CartItem[]): CartItem[] {
  const merged = [...base];
  for (const item of incoming) {
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
 *   1. Login Sync   — merge guest buffer into user cart → DB
 *   2. Hydration    — onMounted: load local cache first, then reconcile with DB
 *   3. Action Sync  — every mutation → save local + upsert DB
 *   4. Validation   — before checkout → re-fetch from DB to confirm
 *   5. Cleanup      — logout → persist to DB, clear local, reset state
 */
export function useCart() {
  const user = useSupabaseUser();
  const supabase = useSupabaseClient();

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
      // Try select first
      const { data: existing } = await supabase
        .from("carts")
        .select("id")
        .eq("user_id", userId)
        .single();
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
      return null;
    }
  }

  /** Fetch cart items from DB for a given user. */
  async function fetchCartFromDb(
    userId: string,
  ): Promise<{ items: CartItem[]; updatedAt: string } | null> {
    try {
      const { data: cartRow } = await supabase
        .from("carts")
        .select("id, updated_at")
        .eq("user_id", userId)
        .single();
      if (!cartRow) return null;

      const { data: rows } = await supabase
        .from("cart_items")
        .select("*")
        .eq("cart_id", cartRow.id);

      return {
        items: (rows ?? []).map((r: Record<string, unknown>) =>
          mapRowToItem(r),
        ),
        updatedAt: cartRow.updated_at as string,
      };
    } catch {
      return null;
    }
  }

  /** Replace all items in DB with the given list (delete + insert). */
  async function upsertCartToDb(
    userId: string,
    items: CartItem[],
  ): Promise<void> {
    try {
      const dbCartId = await ensureDbCart(userId);
      if (!dbCartId) return;

      // Delete existing items
      await supabase.from("cart_items").delete().eq("cart_id", dbCartId);

      // Insert current items
      if (items.length > 0) {
        const rows = items.map((item) => ({
          cart_id: dbCartId,
          product_id: item.productId,
          sku_id: item.skuId,
          name: item.name,
          thumbnail: item.thumbnail,
          unit_price: item.unitPrice,
          quantity: item.quantity,
          added_at: item.addedAt,
        }));
        await supabase.from("cart_items").insert(rows);
      }

      // Touch updated_at
      await supabase
        .from("carts")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", dbCartId);
    } catch {
      console.warn("[useCart] upsertCartToDb failed");
    }
  }

  /** Delete cart + items from DB entirely. */
  async function deleteCartFromDb(userId: string): Promise<void> {
    try {
      await supabase.from("carts").delete().eq("user_id", userId);
    } catch {
      // ignore
    }
  }

  // ── Persist helper (Sync 3 — Action Sync) ─────────────────

  /** Save cart to localStorage + DB (if logged in), or guest buffer. */
  function persistCart(): void {
    cart.value.updatedAt = new Date().toISOString();
    if (currentUserId.value) {
      saveCartLocal(currentUserId.value, cart.value);
      // Fire-and-forget DB sync
      upsertCartToDb(currentUserId.value, cart.value.items);
    } else {
      saveGuestBuffer(cart.value.items);
    }
  }

  // ── Hydration (Sync 1 — Login + Sync 2 — Mount) ──────────

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
    lastHydratedUserId.value = userId;
    currentUserId.value = userId;

    if (!userId) {
      // ── Guest mode ──
      const guestItems = loadGuestBuffer();
      cart.value = {
        cartId: cart.value.cartId || generateCartId(),
        items: guestItems,
        updatedAt: new Date().toISOString(),
      };
      return;
    }

    // ── Logged-in mode ──

    // 1. Show local cache immediately (fast)
    const localCart = loadCartLocal(userId);
    cart.value = localCart;

    // 2. Fetch from DB (source of truth)
    const dbData = await fetchCartFromDb(userId);

    // 3. Reconcile local vs DB
    if (dbData) {
      const dbNewer =
        new Date(dbData.updatedAt).getTime() >
        new Date(localCart.updatedAt).getTime();
      if (dbNewer) {
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
  }

  // ── Mutations (Sync 3 — Action Sync) ──────────────────────

  function addToCart(
    productId: string,
    skuId: string,
    name: string,
    thumbnail: string,
    unitPrice: number,
    quantity = 1,
  ): void {
    const existing = cart.value.items.find(
      (i) => i.productId === productId && i.skuId === skuId,
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.value.items.push({
        productId,
        skuId,
        name,
        thumbnail,
        unitPrice,
        quantity,
        addedAt: new Date().toISOString(),
      });
    }
    persistCart();
  }

  function updateQuantity(
    productId: string,
    skuId: string,
    newQuantity: number,
  ): void {
    if (newQuantity <= 0) {
      cart.value.items = cart.value.items.filter(
        (i) => !(i.productId === productId && i.skuId === skuId),
      );
    } else {
      const item = cart.value.items.find(
        (i) => i.productId === productId && i.skuId === skuId,
      );
      if (item) item.quantity = newQuantity;
    }
    persistCart();
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

  // ── Validation (Sync 4 — Checkout) ────────────────────────

  /**
   * Re-fetch cart from DB to ensure data is fresh before checkout.
   * Returns true if cart is valid (has items), false otherwise.
   */
  async function validateCart(): Promise<boolean> {
    if (!currentUserId.value) return false;
    const dbData = await fetchCartFromDb(currentUserId.value);
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
    if (currentUserId.value) {
      await upsertCartToDb(currentUserId.value, cart.value.items);
      removeCartLocal(currentUserId.value);
    }
    clearGuestBuffer();
    cart.value = emptyCart();
    currentUserId.value = null;
    lastHydratedUserId.value = undefined;
  }

  /**
   * Persist final state to DB, then clear localStorage + reset reactive state.
   */
  async function destroyCart(): Promise<void> {
    await resetCartSession();
  }

  // ── Lifecycle (client-only) ───────────────────────────────

  if (import.meta.client) {
    onMounted(() => {
      hydrateCart(user.value?.id ?? null);
    });

    watch(user, (newUser, oldUser) => {
      const newId = newUser?.id ?? null;
      const oldId = oldUser?.id ?? null;
      if (newId !== oldId) {
        // Reset so hydrateCart runs again for the new user
        lastHydratedUserId.value = undefined;
        hydrateCart(newId);
      }
    });
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
    validateCart,
    resetCartSession,
    destroyCart,
  };
}
