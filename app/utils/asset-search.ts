type LocalizedSearchText = {
  th?: string;
  en?: string;
  cn?: string;
  jp?: string;
};

export type AssetSearchLike = {
  code?: string;
  name?: LocalizedSearchText;
  description?: LocalizedSearchText;
  brand?: string;
  mainCategoryKey?: string;
  categories?: string[];
  tagKeys?: string[];
  searchKeywords?: string[];
  filterKeys?: string[];
  specSummary?: Record<string, unknown>;
};

function searchableValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function compactSearchText(value: string): string {
  return value.replace(/[\s_-]+/g, "");
}

export function assetMatchesSearchText(
  asset: AssetSearchLike,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    asset.code,
    asset.name?.th,
    asset.name?.en,
    asset.name?.cn,
    asset.name?.jp,
    asset.description?.th,
    asset.description?.en,
    asset.description?.cn,
    asset.description?.jp,
    asset.brand,
    asset.mainCategoryKey,
    ...(asset.categories ?? []),
    ...(asset.tagKeys ?? []),
    ...(asset.searchKeywords ?? []),
    ...(asset.filterKeys ?? []),
    ...Object.values(asset.specSummary ?? {}).map(searchableValue),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes(query) ||
    compactSearchText(haystack).includes(compactSearchText(query))
  );
}
