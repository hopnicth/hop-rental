# Composables Guidelines — HOPNIC

> Rules for every file in `app/composables/`. Read before creating or editing any composable.

---

## 1. Structure & Naming

- ชื่อไฟล์: `useSomething.ts` — camelCase เสมอ
- ฟังก์ชัน export หลัก: `export function useSomething()` — ห้าม `export default`
- ไม่มี state global จาก `reactive()` หรือ module-level `ref()` ที่ share ข้าม instance
  - ยกเว้น: ใช้ `useState('key', () => ...)` เพื่อ SSR-safe shared state (Nuxt)

### Skeleton

```ts
// app/composables/useSomething.ts

export function useSomething() {
  // 1. State — useState สำหรับ shared, ref สำหรับ local-only
  const items = useState<string[]>('something:items', () => [])
  const loading = useState<boolean>('something:loading', () => false)

  // 2. Computed
  const count = computed(() => items.value.length)

  // 3. Actions
  async function fetchItems() { ... }
  async function toggleItem(id: string) { ... }

  // 4. Lifecycle — client-only guard
  if (import.meta.client) {
    watch(userId, (next) => { if (next) void fetchItems() }, { immediate: true })
  }

  // 5. Return — wrap raw state in computed() to prevent external mutation
  return { items: computed(() => items.value), count, loading: computed(() => loading.value), fetchItems, toggleItem }
}
```

---

## 2. SSR Safety — บังคับ

| สิ่งที่ต้องระวัง                  | วิธีป้องกัน                                                                |
| --------------------------------- | -------------------------------------------------------------------------- |
| `localStorage` / `sessionStorage` | guard ด้วย `if (import.meta.client)` หรือ `if (import.meta.server) return` |
| event listeners                   | attach ใน `onMounted` หรือ `if (import.meta.client)` เสมอ                  |
| `document`, `window`              | ห้ามเรียกนอก client guard                                                  |
| `watch` ที่ trigger side effect   | ใส่ใน `if (import.meta.client)`                                            |

### ตัวอย่าง SSR-safe localStorage

```ts
function saveToStorage(key: string, value: string): void {
  if (import.meta.server) return; // ห้ามลืม
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
```

---

## 3. Shared State — `useState` Key Convention

ใช้ `useState` สำหรับ state ที่ต้อง share ระหว่าง SSR → client hydration

```ts
// Key pattern: 'domain:subKey'
const productIds = useState<string[]>("wishlist:productIds", () => []);
const loading = useState<boolean>("wishlist:loading", () => false);
const loadedForUser = useState<string | null>(
  "wishlist:loadedForUser",
  () => null,
);
```

**ห้ามซ้ำ key** ระหว่าง composable ต่างๆ — prefix ด้วยชื่อ domain เสมอ

---

## 4. API Calls — `$fetch` vs `useFetch`

| เมื่อไหร่                                 | ใช้อะไร                                  |
| ----------------------------------------- | ---------------------------------------- |
| Action triggered by user (toggle, submit) | `$fetch`                                 |
| Data ที่ต้องการ SSR + reactive refetch    | `useFetch`                               |
| Load-once on mount                        | `callOnce(key, fn)` + `onServerPrefetch` |

### `$fetch` pattern — optimistic update + rollback

```ts
async function toggleItem(id: string) {
  if (!userId.value) throw new Error("AUTH_REQUIRED");
  if (togglingIds.value.includes(id)) return currentState;

  const previous = items.value.includes(id);
  togglingIds.value = [...togglingIds.value, id];
  setItemState(id, !previous); // optimistic update

  try {
    const result = await $fetch<ToggleResponse>("/api/user/something", {
      method: "POST",
      body: { id },
    });
    items.value = result.ids ?? items.value;
    return result.toggled;
  } catch (error) {
    setItemState(id, previous); // rollback on error
    throw error;
  } finally {
    togglingIds.value = togglingIds.value.filter((x) => x !== id);
  }
}
```

### `useFetch` pattern — reactive query + SSR

```ts
const fetchKey = computed(() => `domain:${filter.value}:${page.value}`);

const { data, pending, error, refresh } = useFetch<ListResponse>(
  "/api/resource",
  {
    key: fetchKey,
    query: computed(() => ({ filter: filter.value, page: page.value })),
    watch: [filter, page],
    default: () => ({ items: [], total: 0, hasMore: false }),
  },
);
```

### `callOnce` + `onServerPrefetch` pattern — load-once

```ts
const ONCE_KEY = 'domain:resource'

async function fetchResource() { ... }
async function ensureLoaded() { await callOnce(ONCE_KEY, fetchResource) }

onServerPrefetch(ensureLoaded)
if (import.meta.client) { void ensureLoaded() }
```

---

## 5. Auth-Aware Composables

```ts
const user = useSupabaseUser();

// Extract userId safely — handles both .id and .sub (JWT claim)
const userId = computed(() => {
  if (!user.value) return null;
  return user.value.id ?? user.value.sub ?? null;
});
```

### Watch user change → clear / reload state

```ts
if (import.meta.client) {
  watch(
    userId,
    (nextUserId) => {
      if (nextUserId) void loadData();
      else {
        items.value = [];
        loadedForUser.value = null;
      }
    },
    { immediate: true },
  );
}
```

### Throw `AUTH_REQUIRED` สำหรับ action ที่ต้องการ auth

```ts
async function toggleItem(id: string) {
  if (!userId.value) throw new Error("AUTH_REQUIRED");
  // ...
}
```

Component จะ catch และแสดง toast ให้ login ได้เอง

---

## 6. Lifecycle Cleanup

```ts
if (import.meta.client) {
  onMounted(() => {
    document.addEventListener("click", handler);
  });
  onUnmounted(() => {
    document.removeEventListener("click", handler);
    if (timer) clearTimeout(timer);
  });
}
```

---

## 7. Return Value Rules

- **ห้าม return raw mutable state** — wrap ด้วย `computed()` เพื่อ readonly
- Helper ที่ return computed per-id ให้ return ฟังก์ชัน ไม่ใช่ computed โดยตรง:

```ts
// ✅ ถูก — per-item computed factory
function isToggling(id: string) {
  return computed(() => togglingIds.value.includes(id))
}

// ❌ ผิด — computed ชุดเดียวที่รับ param ตรงๆ ไม่ได้
const isToggling = computed((id) => ...) // not valid
```

---

## 8. Composables ที่มีอยู่แล้ว — อย่าสร้างซ้ำ

| ต้องการอะไร               | ใช้ composable นี้  |
| ------------------------- | ------------------- |
| Cart (sale)               | `useCart`           |
| Rental booking draft      | `useBooking`        |
| Auth session + logout     | `useAuthSession`    |
| Wishlist                  | `useWishlist`       |
| Save list (asset/product) | `useSaveList`       |
| Saved partners            | `useSavedPartners`  |
| Public partner listing    | `usePublicPartners` |
| Global search             | `useGlobalSearch`   |
| User profile              | `useUserProfile`    |
| Tax profile               | `useTaxProfile`     |

---

## 9. ห้ามทำ

- ❌ ห้ามใช้ `export default` — ใช้ named export เสมอ
- ❌ ห้ามเข้าถึง `localStorage`/`document`/`window` โดยไม่มี client guard
- ❌ ห้าม return raw `ref` โดยไม่ wrap ด้วย `computed()` — จะทำให้ external code mutate state ได้
- ❌ ห้ามสร้าง composable ใหม่ที่ทำงานซ้ำกับ composable ที่มีอยู่แล้ว
- ❌ ห้าม `useState` key ซ้ำกันระหว่างไฟล์
- ❌ ห้าม `console.log` ใน production path — ใช้ `console.warn` เฉพาะ error ที่ต้อง debug
