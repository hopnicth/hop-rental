# Pages — HOPNIC

> Rules for every file in `app/pages/`. Read before creating or editing any page.

---

## Route naming (Nuxt 4 file-based)

- `[param]` = dynamic segment
- `index.vue` = list page
- `[id].vue` = detail page
- `print.vue` = print layout (no header/footer)

---

## Auth middleware

Admin pages — use the `role` route middleware (the only registered route middleware, `app/middleware/role.ts`):
```ts
definePageMeta({ middleware: 'role', layout: 'admin' })
```

User pages — do NOT declare a route middleware. There is no `auth` route
middleware; `middleware: 'auth'` throws "Unknown route middleware: 'auth'" at
navigation. Authenticated `/user/*` routes are protected globally by
`@nuxtjs/supabase` `redirectOptions` (login `/user/login`, with a public
`exclude` list in `nuxt.config.ts`) — leave protected user pages without a route
middleware (e.g. `cart.vue`, `user/orders/[orderId].vue`,
`user/rentals/[bookingId].vue`).

Public pages: no middleware (add the path to the supabase `exclude` list).

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
