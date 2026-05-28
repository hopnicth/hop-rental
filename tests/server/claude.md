# Tests — HOPNIC

> Rules for every file in `tests/server/`. Read before creating or editing any spec.

---

## Location

All server tests live in `tests/server/`
Named: `[feature-area].spec.ts`

---

## Test structure pattern

```ts
describe('[feature]', () => {
  it('[expected behavior]', async () => {
    // arrange
    // act
    // assert
  })
})
```

---

## What to test

- Business rule edge cases
- Auth guard rejection (401/403)
- Happy path response shape
- Do NOT test Supabase internals

---

## Mock pattern

- Mock at the util boundary
- Never mock Supabase client directly
- Use `vi.mock('~/server/utils/[file]')`

---

## Naming convention

Feature area matches `server/utils/` name:
```
rental-booking-cancellation.spec.ts
  → tests server/utils/rental-booking-cancellation.ts
```

---

## Prohibited

- ❌ Never write tests that hit real DB
- ❌ Never import from `.nuxt/` or `.output/`
- ❌ Never duplicate an existing spec file
