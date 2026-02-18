import type { Cart, CartItem } from '~/types/cart';

const CART_STORAGE_KEY = 'hop-rental-cart';

/**
 * Generate a simple UUID v4.
 * In production you might use `crypto.randomUUID()` (available in modern browsers).
 */
function generateCartId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for SSR or older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Read cart from localStorage (client-side only).
 */
function loadCart(): Cart {
  if (import.meta.server) {
    return { cartId: '', items: [], updatedAt: new Date().toISOString() };
  }

  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Cart;
    }
  } catch {
    // corrupted data — start fresh
  }

  // First visit — create new cart with UUID
  return {
    cartId: generateCartId(),
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Persist cart to localStorage (client-side only).
 */
function saveCart(cart: Cart): void {
  if (import.meta.server) return;

  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

// ── Shared reactive state (singleton across components) ──
const cart = ref<Cart>(loadCart());

/**
 * Composable for managing the shopping cart.
 * State is persisted in localStorage and shared across all components.
 */
export function useCart() {
  /** Total number of items (sum of quantities) */
  const cartItemCount = computed(() =>
    cart.value.items.reduce((sum, item) => sum + item.quantity, 0),
  );

  /** The unique cart ID for sales reference */
  const cartId = computed(() => cart.value.cartId);

  /** Reactive items list */
  const cartItems = computed(() => cart.value.items);

  /**
   * Add an item to the cart.
   * If the product already exists, increment quantity.
   */
  function addToCart(productId: string, name: string, quantity = 1): void {
    const existing = cart.value.items.find((i) => i.productId === productId);

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.value.items.push({
        productId,
        name,
        quantity,
        addedAt: new Date().toISOString(),
      });
    }

    cart.value.updatedAt = new Date().toISOString();
    saveCart(cart.value);
  }

  /**
   * Remove an item from the cart entirely.
   */
  function removeFromCart(productId: string): void {
    cart.value.items = cart.value.items.filter((i) => i.productId !== productId);
    cart.value.updatedAt = new Date().toISOString();
    saveCart(cart.value);
  }

  /**
   * Clear all items from the cart (keeps the same cartId).
   */
  function clearCart(): void {
    cart.value.items = [];
    cart.value.updatedAt = new Date().toISOString();
    saveCart(cart.value);
  }

  // ── Hydrate from localStorage on client mount ──
  if (import.meta.client) {
    onMounted(() => {
      cart.value = loadCart();
    });
  }

  return {
    cart,
    cartId,
    cartItems,
    cartItemCount,
    addToCart,
    removeFromCart,
    clearCart,
  };
}

