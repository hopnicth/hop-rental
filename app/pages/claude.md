# Pages — HOPNIC

> Rules for every file in `app/pages/`. Read before creating or editing any page.

---

## Route naming (Nuxt 4 file-based)

- `[param]` = dynamic segment
- `index.vue` = list page
- `[id].vue` = detail page
- `print.vue` = print layout (no header/footer)

---

## Auth middleware — always use definePageMeta

Admin pages:
```ts
definePageMeta({ middleware: 'role', layout: 'admin' })
```

User pages:
```ts
definePageMeta({ middleware: 'auth' })
```

Public pages: no middleware

---

## Page data pattern

- Use `useAsyncData` for SSR-safe fetching
- Use `useFetch` for client-only reactive data
- Never call composables conditionally

---

## Layouts

- `default` → storefront pages
- `admin` → all `/admin/*` pages
- No layout override unless printing

---

## Prohibited

- ❌ Never add inline styles to page root
- ❌ Never fetch inside `setup()` without `useAsyncData` or `useFetch`
- ❌ Never duplicate logic that belongs in a composable
