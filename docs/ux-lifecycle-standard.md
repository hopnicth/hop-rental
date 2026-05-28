# HOP-RENTAL — UX & Lifecycle Hook Standard

> **Stack:** Nuxt 4 · Vue 3 · TypeScript · @nuxt/ui · Supabase  
> **Audience:** ทุก developer ที่เขียน page/component ใน project นี้  
> Last updated: 2026-05-22

---

## 1. Button Action Pattern (กด → Load → Action → Response → Error)

ทุก action ที่ต้องรอ async ต้องทำตาม pattern นี้เสมอ

```ts
// ✅ STANDARD
const loading = ref(false)

async function handleSubmit() {
  if (loading.value) return          // ป้องกัน double-submit
  loading.value = true
  try {
    await doSomething()
    toast.add({ title: 'สำเร็จ', color: 'success', icon: 'bx:check-circle' })
  } catch (err) {
    toast.add({ title: 'เกิดข้อผิดพลาด', description: String(err), color: 'error', icon: 'bx:error-circle' })
  } finally {
    loading.value = false             // ปลด lock ทุกกรณี
  }
}
```

```html
<!-- ✅ TEMPLATE — ปิด button ระหว่าง loading เสมอ -->
<UButton
  :loading="loading"
  :disabled="loading || !canSubmit"
  @click="handleSubmit"
/>
```

**กฎ:**
- `loading = true` ก่อน await, คืนค่าใน `finally` เสมอ — ห้าม set false ใน try/catch แยก
- Button ต้องมี `:loading` **และ** `:disabled="loading"` ป้องกัน double-tap (mobile)
- Error ต้องขึ้นทั้ง **inline `UAlert`** (อยู่ใน form) + **toast** (feedback ฉับพลัน)
- Critical write action (ลบ, ชำระเงิน, ยืนยัน) ต้องมี `window.confirm()` ก่อนเสมอ

---

## 2. Form Validation Standard

### 2.1 Field Error — แสดงหลัง blur หรือ submit attempt เท่านั้น

```ts
// ✅ STANDARD — touched pattern
const touched = reactive({ name: false, phone: false })
const submitAttempted = ref(false)

const nameError = computed(() => {
  if (!touched.name && !submitAttempted.value) return null
  return !name.value.trim() ? 'กรุณากรอกชื่อ' : null
})

function markAllTouched() {
  touched.name = true
  touched.phone = true
}

async function onSubmit() {
  if (loading.value) return
  markAllTouched()
  submitAttempted.value = true
  if (nameError.value || phoneError.value) return  // หยุดก่อน scroll ไปช่องผิด
  // ...
}
```

```html
<UFormField :label="'ชื่อ'" :error="nameError ?? undefined">
  <UInput v-model="name" @blur="touched.name = true" />
</UFormField>
```

### 2.2 Numeric Input — ห้ามใช้ text field ธรรมดากับตัวเลข

```html
<!-- ✅ ตัวเลขทุกชนิด -->
<UInput v-model.number="quantity" type="number" min="1" step="1" />

<!-- ✅ ราคา/ทศนิยม -->
<UInput v-model.number="price" type="number" min="0" step="0.01" />

<!-- ✅ เบอร์โทร (ต้องการ leading zero) -->
<UInput v-model="phone" type="tel" inputmode="numeric" />
```

**กฎ:** ใช้ `v-model.number` + `type="number"` ทุกครั้งที่ค่าเป็นตัวเลข ยกเว้นเบอร์โทร/รหัส ZIP ให้ใช้ `type="tel"` + `inputmode="numeric"` แทน

---

## 3. Loading State & Skeleton Pattern

### 3.1 List / Grid

```html
<!-- ✅ STANDARD — ใช้เสมอสำหรับ list/grid -->
<template v-if="items.length">
  <LazyProductsProductCard v-for="p in items" :key="p.id" :product-id="p.id" />
</template>
<template v-else-if="loading">
  <CommonLoadingCat />
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
    <ProductsCatalogCardSkeleton v-for="i in 6" :key="i" />
  </div>
</template>
<UAlert v-else color="neutral" variant="soft" title="ไม่พบข้อมูล" />
```

### 3.2 Page-level loading

```html
<CommonLoadingCat v-if="loading" />
<UAlert v-else-if="error" color="error" variant="soft" :title="error" />
<div v-else> ... content ... </div>
```

**กฎ:**
- ห้ามใช้ spinner/text "Loading..." เอง — ใช้ `<CommonLoadingCat />` เสมอ
- ใช้ `Lazy` prefix กับ card/heavy component ใน list เสมอ (`LazyProductsAssetCard`)
- Skeleton ต้องมีขนาดใกล้เคียง real card เพื่อไม่ให้ layout shift

---

## 4. Form Persistence — ห้ามข้อมูลหายเมื่อ refresh

ทุก form ที่ user กรอกข้อมูลสำคัญ (POS, booking, checkout) ต้อง persist ลง `localStorage`

```ts
// ✅ STANDARD
const DRAFT_KEY = 'hop:pos:draft'

const draft = reactive({ name: '', phone: '', note: '' })

function persistDraft() {
  if (!import.meta.client) return
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }))
}

function restoreDraft() {
  if (!import.meta.client) return
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return
  try { Object.assign(draft, JSON.parse(raw)) }
  catch { localStorage.removeItem(DRAFT_KEY) }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

// Auto-save ทุกครั้งที่ draft เปลี่ยน
watch(draft, persistDraft, { deep: true })

onMounted(() => restoreDraft())

// ล้าง draft หลัง submit สำเร็จ
async function onSubmit() {
  // ...
  clearDraft()
}
```

**กฎ:**
- Admin POS / checkout form ต้อง persist ทุก field
- Key format: `hop:<section>:<purpose>` เช่น `hop:pos:draft`, `hop:booking:form`
- ต้อง clear draft หลัง submit สำเร็จ
- ถ้า draft มี sensitive data (card number) → ห้าม persist

---

## 5. Lazy Load + User Data Pattern

### 5.1 Composable ที่ embed user data

```ts
// ✅ STANDARD — composable ต้องมี loading/error state ครบเสมอ
export function useBooking() {
  const loading = useState<boolean>('booking:loading', () => false)
  const error = useState<string | null>('booking:error', () => null)
  const items = useState<BookingItem[]>('booking:items', () => [])

  async function fetchBookings() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const data = await $fetch('/api/bookings')
      items.value = data.items
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  onServerPrefetch(fetchBookings)   // SSR prefetch
  if (import.meta.client) onMounted(() => void fetchBookings())

  return { loading, error, items, fetchBookings }
}
```

**กฎ:**
- `useState` แทน `ref` ทุกครั้งที่ state แชร์ข้าม component (ป้องกัน hydration mismatch)
- ต้องมี `loading` + `error` + `data` ทุก composable ที่ fetch
- ใช้ `onServerPrefetch` สำหรับ SSR และ `import.meta.client` guard สำหรับ client-only

---

## 6. Auth Guard Pattern

```ts
// ✅ STANDARD — ทุก user-only / admin-only page
const { isLoggedIn } = useAuthSession()
const route = useRoute()

watchEffect(() => {
  if (import.meta.client && !isLoggedIn.value) {
    navigateTo(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`)
  }
})
```

**กฎ:**
- ใช้ `watchEffect` ไม่ใช่ `watch` เพราะต้องการ immediate evaluation
- ส่ง `?redirect=` ไปด้วยเสมอเพื่อ UX ที่ดี (กลับมา page เดิมหลัง login)
- Admin route ใช้ `definePageMeta({ middleware: ['role'], platformRoles: ['staff', 'super_admin'] })`

---

## 7. Event Listener Cleanup

```ts
// ✅ STANDARD — ล้าง listener ทุกตัวใน onUnmounted
function syncStatus() { isOnline.value = navigator.onLine }

onMounted(() => {
  window.addEventListener('online', syncStatus)
  window.addEventListener('offline', syncStatus)
  document.addEventListener('visibilitychange', onVisible)
})

onUnmounted(() => {
  window.removeEventListener('online', syncStatus)
  window.removeEventListener('offline', syncStatus)
  document.removeEventListener('visibilitychange', onVisible)
})
```

**กฎ:** ทุก `addEventListener` ต้องมีคู่ `removeEventListener` ใน `onUnmounted` เสมอ

---

## 8. Page Visibility Refresh

สำหรับ page ที่ data เปลี่ยนบ่อย (cart, booking status, POS) ต้อง refresh เมื่อ user กลับมา

```ts
// ✅ STANDARD
const handleVisible = () => {
  if (document.visibilityState === 'visible') void refresh({ force: true })
}
const handleFocus = () => void refresh()

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisible)
  window.addEventListener('focus', handleFocus)
  window.addEventListener('pageshow', handleVisible)  // iOS Safari back/forward cache
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisible)
  window.removeEventListener('focus', handleFocus)
  window.removeEventListener('pageshow', handleVisible)
})
```

---

## 9. Toast & Inline Error — เลือกใช้ถูกที่

| Situation | Component | Color |
|-----------|-----------|-------|
| Action สำเร็จ | `toast` | `success` + `bx:check-circle` |
| Action ล้มเหลว | `toast` + inline `UAlert` | `error` + `bx:error-circle` |
| Warning / ยังทำไม่ได้ | `UAlert` inline | `warning` + `bx:error-circle` |
| Info / คำแนะนำ | `UAlert` inline | `info` + `bx:info-circle` |
| Form field error | `UFormField :error` | — |

```ts
// ✅ SUCCESS
toast.add({ title: 'บันทึกสำเร็จ', color: 'success', icon: 'bx:check-circle' })

// ✅ ERROR
toast.add({ title: 'บันทึกไม่สำเร็จ', description: err.message, color: 'error', icon: 'bx:error-circle' })
```

---

## 10. Destructive Action Confirm

```ts
// ✅ STANDARD — ก่อนลบ/ยกเลิก/ทำลาย data
async function deleteItem(id: string) {
  if (!confirm('ยืนยันลบรายการนี้? ไม่สามารถกู้คืนได้')) return
  busy.value = true
  try {
    await $fetch(`/api/items/${id}`, { method: 'DELETE' })
    toast.add({ title: 'ลบสำเร็จ', color: 'success', icon: 'bx:trash' })
  } catch (e) {
    toast.add({ title: 'ลบไม่สำเร็จ', color: 'error', icon: 'bx:error-circle' })
  } finally {
    busy.value = false
  }
}
```

---

## 11. SSR / Client Guard

```ts
// ✅ STANDARD
if (import.meta.client) {
  // code ที่ใช้ window/document/localStorage เท่านั้น
}

function doClientThing() {
  if (!import.meta.client) return   // early return บน server
  // ...
}
```

**กฎ:** ห้ามใช้ `window`, `document`, `localStorage`, `navigator` โดยตรงที่ top-level script — ต้องอยู่ใน `onMounted`, `import.meta.client` guard, หรือ `process.client` guard เสมอ

---

## Quick Reference Checklist

| Check | Pattern |
|-------|---------|
| ☐ Button กด duplicate ไม่ได้ | `:disabled="loading"` + guard `if (loading.value) return` |
| ☐ Error แสดงหลัง submit เท่านั้น | `submitAttempted` + `touched` object |
| ☐ Numeric field ถูก type | `type="number"` + `v-model.number` |
| ☐ List มี skeleton | `CommonLoadingCat` + shape-matched skeleton |
| ☐ Form ไม่หายเมื่อ refresh | `watch(draft, persistDraft, { deep: true })` + `onMounted(restoreDraft)` |
| ☐ User data lazy load ครบ | `useState` + `loading`/`error`/`data` trio |
| ☐ Auth guard ครบ | `watchEffect` + `navigateTo` + `?redirect=` |
| ☐ Event listener ถูก cleanup | `onUnmounted` removes all listeners |
| ☐ Page refresh เมื่อกลับมา | `visibilitychange` + `focus` + `pageshow` |
| ☐ Destructive มี confirm | `window.confirm()` ก่อนทุกครั้ง |
| ☐ SSR safe | `import.meta.client` guard ทุก browser API |
