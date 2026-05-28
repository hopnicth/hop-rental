# Mappers — HOPNIC

> Rules for every file in `app/mappers/`. Read before creating or editing any mapper.

---

## Purpose

Transform raw Supabase row → typed domain object used by composables and components.

---

## Location

```
app/mappers/[domain].ts
```

One mapper file per domain.

---

## Naming convention

```ts
export function mapPartner(row: RawRow): Partner
export function mapAsset(row: RawRow): Asset
```

- Input: raw DB row type from `database.types.ts`
- Output: domain type from `app/types/[domain].ts`

---

## Rule

Never access a raw Supabase row outside a mapper.
Composables receive mapped types only.

---

## Prohibited

- ❌ Never add business logic to a mapper
- ❌ Never call API inside a mapper
- ❌ Never return partial types — map all fields or explicitly mark optional
