# Components Guidelines — HOPNIC

> Rules for every Vue component in `app/components/`. Read before creating or editing any component.

---

## 1. Nuxt UI — Component Conventions

Use `@nuxt/ui` components exclusively. Do **not** write raw `<button>`, `<input>`, or `<select>` HTML elements.

### Allowed component list (most-used)

| Use case             | Component                             |
| -------------------- | ------------------------------------- |
| Card container       | `UCard`                               |
| Status / label chips | `UBadge`                              |
| Buttons & links      | `UButton`                             |
| Dialogs              | `UModal`                              |
| Dropdowns            | `UDropdownMenu`                       |
| Tooltips             | `UTooltip`                            |
| Notifications        | `useToast()`                          |
| Icons                | `UIcon` (prefix `bx:` from BoxIcons)  |
| Images               | `NuxtImg` (never `<img>`)             |
| Internal links       | `NuxtLink` or `:to` prop on `UButton` |

### UBadge color semantics — use consistently across all cards

| Color       | Meaning                            |
| ----------- | ---------------------------------- |
| `primary`   | Sale / store type                  |
| `secondary` | Rental / asset                     |
| `success`   | Verified / available / in-stock    |
| `error`     | Unverified / out-of-stock / danger |
| `warning`   | Featured / caution                 |
| `info`      | Service type                       |
| `neutral`   | Generic tag / category chip        |

### UButton size & variant standards

- Card action buttons: `size="sm"`, `square`, `variant="soft"`
- Full-width CTA inside card footer: `size="xs"`, `variant="outline"`, `block`
- Overlay buttons (top-right of image): `size="sm"`, `square`, `backdrop-blur`, `shadow-sm`

---

## 2. Card Size — ใช้ให้เท่ากันทุก Card

ทุก card ในระบบต้องมีขนาด **เท่ากัน** เพื่อให้ grid alignment ไม่เพี้ยน

### หลักการ: ใช้ `min-h-*` แทน fixed height ใน content zone

```vue
<!-- ✅ ถูก: anchor content zones ด้วย min-h -->
<div class="flex min-h-60 flex-col gap-3">
  <div class="min-h-10"><!-- description --></div>
  <div class="min-h-14"><!-- details/badges --></div>
  <div class="min-h-8"><!-- tags --></div>
</div>

<!-- ❌ ผิด: ใช้ flex-col โดยไม่มี anchor -->
<div class="flex flex-col">...</div>
```

### UCard header — min-h-14 เสมอ

```vue
<template #header>
  <div class="flex min-h-14 flex-col justify-start gap-1">
    <!-- badge row -->
    <!-- h3 title: line-clamp-2 text-sm font-semibold -->
  </div>
</template>
```

### Image — aspect-square เสมอ

```vue
<NuxtImg
  :src="imageUrl"
  :alt="altText"
  loading="lazy"
  class="block aspect-square w-full object-cover"
/>
```

### CatalogCardShell — ใช้สำหรับ ProductCard และ AssetCard

`ProductCard` และ `AssetCard` ต้องใช้ `CatalogCardShell` เป็น base — ห้าม re-implement UCard โดยตรง

### PartnerCard — ใช้โครงสร้าง min-h เดียวกัน

```
header:  min-h-14  (badge row + name)
image:   aspect-square
content: min-h-32  (tagline min-h-8 + categories min-h-10 + service areas)
footer:  mt-auto   (detail button ติดด้านล่างเสมอ)
```

---

## 3. Chip / Badge Overflow — บังคับใช้ cap + overflow count

ห้ามแสดง chips/badges แบบ unbounded เพราะจะทำให้ card สูงไม่เท่ากัน

**Pattern บังคับ:**

```ts
const visibleItems = computed(() => items.value.slice(0, N));
const remainingCount = computed(() => Math.max(0, items.value.length - N));
```

```vue
<UBadge
  v-for="item in visibleItems"
  :key="item"
  color="neutral"
  variant="outline"
  size="xs"
>
  {{ label(item) }}
</UBadge>
<UBadge v-if="remainingCount > 0" color="neutral" variant="outline" size="xs">
  +{{ remainingCount }}
</UBadge>
```

**Cap มาตรฐานที่ใช้ในโปรเจกต์:**
| Zone | Cap |
|------|-----|
| Category chips (PartnerCard) | **3** |
| Service area chips (PartnerCard) | **2** |
| Matched products (AssetCard) | **2** |

---

## 4. i18n — บังคับทุก string ที่ user เห็น

```vue
<script setup lang="ts">
const { t, locale } = useI18n();
</script>
```

- ห้าม hardcode ข้อความในภาษาใดใน template — ใช้ `t('key')` เสมอ
- ยกเว้น: สัญลักษณ์สกุลเงิน `฿`, ตัวเลข, icon ที่ไม่ใช่ภาษา
- เมื่อเพิ่ม key ใหม่ ต้องเพิ่มใน **ทั้ง 4 ไฟล์**: `th.json`, `en.json`, `cn.json`, `jp.json`
- Key pattern: `componentName.subSection.key` เช่น `partners.card.verified`

### ชื่อที่มีหลายภาษา (nameTh / nameEn)

```ts
const displayName = computed(() =>
  locale.value === "en" && props.item.nameEn
    ? props.item.nameEn
    : props.item.nameTh,
);
```

---

## 5. Lazy Loading — NuxtImg

ทุก image ใน card และ list ต้องใช้ `loading="lazy"`:

```vue
<NuxtImg
  :src="src"
  :alt="alt"
  loading="lazy"
  class="block aspect-square w-full object-cover"
/>
```

**ยกเว้น**: รูปที่อยู่ above the fold (hero banner, first visible card) → ใช้ `loading="eager"` หรือ `fetchpriority="high"`

---

## 6. Overlay Button — Top-Right Pattern

ปุ่ม action ที่ซ้อนบนรูป (wishlist, bookmark, save) ใช้ pattern เดียวกันเสมอ:

```vue
<div class="absolute right-2 top-2 z-10">
  <UTooltip :text="label" :popper="{ placement: 'top' }">
    <UButton
      :icon="icon"
      :color="active ? 'primary' : 'neutral'"
      :variant="active ? 'solid' : 'soft'"
      size="sm" square
      :loading="isLoading"
      class="shadow-sm backdrop-blur transition-all duration-200 hover:scale-110 hover:shadow-md"
      :aria-label="label"
      @click.stop.prevent="handleToggle"
    />
  </UTooltip>
</div>
```

---

## 7. Card Hover Effect — ใช้ pattern เดียวกัน

```
Sale product  → hover:ring-2 hover:ring-primary
Rental asset  → hover:ring-2 hover:ring-secondary
Partner card  → hover:ring-2 hover:ring-primary
Base class    → h-full overflow-hidden transition-all hover:-translate-y-0.5
```

---

## 8. ห้ามทำ

- ❌ ห้าม hardcode ข้อความภาษาใน template (ต้องผ่าน `t()`)
- ❌ ห้ามใช้ `<img>` แทน `NuxtImg`
- ❌ ห้ามแสดง chip/badge แบบไม่จำกัดจำนวน
- ❌ ห้าม UCard โดยไม่มี `h-full` — จะทำให้ grid row สูงไม่เท่ากัน
- ❌ ห้ามใช้ fixed height (`h-48`) ใน content zone — ใช้ `min-h-*` แทน
- ❌ ห้าม re-implement card shell ใหม่ — ใช้ `CatalogCardShell` สำหรับ product/asset
- ❌ ห้ามเพิ่ม i18n key แค่ไฟล์เดียว — ต้องครบ 4 ภาษาเสมอ
