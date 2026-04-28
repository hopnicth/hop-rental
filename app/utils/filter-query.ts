import type { DynamicFilterValue } from "~/composables/useFilterGroups";

type QueryValue = unknown;
type QueryObject = Record<string, QueryValue>;

export function readQueryString(value: QueryValue): string {
  if (Array.isArray(value)) return readQueryString(value[0]);
  return typeof value === "string" ? value : "";
}

export function readQueryList(value: QueryValue): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readQueryNumber(value: QueryValue): number | null {
  const raw = readQueryString(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readQueryBoolean(value: QueryValue): boolean {
  const raw = readQueryString(value).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === "" || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function activeDynamicFilters(
  filters: Record<string, DynamicFilterValue>,
): Record<string, DynamicFilterValue> {
  const active: Record<string, DynamicFilterValue> = {};
  for (const [groupId, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      const selected = value.filter(Boolean);
      if (selected.length > 0) active[groupId] = selected;
      continue;
    }
    if (value.min !== null || value.max !== null) {
      active[groupId] = { min: value.min, max: value.max };
    }
  }
  return active;
}

export function readDynamicFilters(
  value: QueryValue,
): Record<string, DynamicFilterValue> {
  const raw = readQueryString(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const filters: Record<string, DynamicFilterValue> = {};
    for (const [groupId, entry] of Object.entries(parsed)) {
      if (Array.isArray(entry)) {
        const selected = entry.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        );
        if (selected.length > 0) filters[groupId] = selected;
      } else if (entry && typeof entry === "object") {
        const range = entry as { min?: unknown; max?: unknown };
        const min = finiteOrNull(range.min);
        const max = finiteOrNull(range.max);
        if (min !== null || max !== null) filters[groupId] = { min, max };
      }
    }
    return filters;
  } catch {
    return {};
  }
}

export function writeDynamicFilters(
  filters: Record<string, DynamicFilterValue>,
): string | undefined {
  const active = activeDynamicFilters(filters);
  const entries = Object.entries(active).sort(([a], [b]) => a.localeCompare(b));
  return entries.length > 0 ? JSON.stringify(Object.fromEntries(entries)) : undefined;
}

function normalizedQuery(value: QueryValue): string | string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string => typeof item === "string")
      .filter(Boolean)
      .sort();
    return items.length > 0 ? items : undefined;
  }
  const text = String(value);
  return text ? text : undefined;
}

export function queryObjectsEqual(a: QueryObject, b: QueryObject): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = normalizedQuery(a[key]);
    const bv = normalizedQuery(b[key]);
    if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
  }
  return true;
}