/**
 * Pure helpers for matching products against the dynamic-filter selections
 * shown by SearchFilters.vue. Extracted so they can be unit-tested without
 * pulling in Vue/Nuxt runtime.
 */
import type {
  DynamicFilterValue,
  FilterGroup,
} from "~/composables/useFilterGroups";

/** Lightweight subset of Product needed by the matcher. */
export interface DynamicFilterProductLike {
  filterKeys: string[];
  spec?: Record<string, string | undefined>;
}

/**
 * Extract the first numeric token from a free-form spec string.
 * "10w" → 10, "2.5kg" → 2.5, "-3.2 V" → -3.2, "abc" / "" / undefined → null.
 */
export function parseSpecNumber(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/-?[0-9]+(\.[0-9]+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when `product` satisfies every group selection in `selections`.
 * Empty `selections` → always true. A group whose selection is empty
 * (no option ids / both range bounds null) is treated as inactive.
 *
 * Pass `options.excludeGroupId` to skip a single group during matching —
 * used by the facet-count pipeline to compute "products that match every
 * OTHER active filter" for a target group (Lazada/Shopee-style counts).
 */
export function productMatchesDynamicFilters(
  product: DynamicFilterProductLike,
  selections: Record<string, DynamicFilterValue>,
  groupsById: Map<string, FilterGroup>,
  options: { excludeGroupId?: string } = {},
): boolean {
  const entries = Object.entries(selections);
  if (entries.length === 0) return true;

  for (const [groupId, value] of entries) {
    if (options.excludeGroupId === groupId) continue;
    const group = groupsById.get(groupId);
    if (!group) continue;

    if (group.filterType === "number_range") {
      const range = Array.isArray(value) ? null : value;
      if (!range) continue;
      const hasMin =
        typeof range.min === "number" && Number.isFinite(range.min);
      const hasMax =
        typeof range.max === "number" && Number.isFinite(range.max);
      if (!hasMin && !hasMax) continue;
      const specVal = group.specKey
        ? parseSpecNumber(product.spec?.[group.specKey])
        : null;
      if (specVal === null) return false;
      if (hasMin && specVal < (range.min as number)) return false;
      if (hasMax && specVal > (range.max as number)) return false;
      continue;
    }

    // checkbox / dropdown — selection is option-id list
    const selectedIds = Array.isArray(value) ? value : [];
    if (selectedIds.length === 0) continue;
    const expectedKeys = group.options
      .filter((o) => selectedIds.includes(o.id))
      .map((o) => `${group.key}__${o.key}`);
    if (expectedKeys.length === 0) return false;

    if (group.matchLogic === "and") {
      for (const k of expectedKeys) {
        if (!product.filterKeys.includes(k)) return false;
      }
    } else {
      // "or" — single-select dropdown also falls under this branch
      const hit = expectedKeys.some((k) => product.filterKeys.includes(k));
      if (!hit) return false;
    }
  }
  return true;
}
