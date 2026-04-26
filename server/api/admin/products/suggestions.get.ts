import { createError, defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

type SuggestionItem = {
  value: string;
  label: string;
  source: "existing_tag" | "existing_keyword";
  sourceLabel: "existing tag" | "existing keyword";
};

function normalizeTagValue(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeKeywordValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildSuggestionsFromProducts(
  products: Array<Record<string, unknown>>,
): {
  tagSuggestions: SuggestionItem[];
  searchKeywordSuggestions: SuggestionItem[];
} {
  const tagSuggestions = new Map<string, string>();
  const searchKeywordSuggestions = new Map<string, string>();

  for (const row of products) {
    for (const rawTag of Array.isArray(row.tag_keys) ? row.tag_keys : []) {
      if (typeof rawTag !== "string") continue;
      const normalized = normalizeTagValue(rawTag);
      if (!normalized || tagSuggestions.has(normalized)) continue;
      tagSuggestions.set(normalized, normalized);
    }

    for (const rawKeyword of Array.isArray(row.search_keywords)
      ? row.search_keywords
      : []) {
      if (typeof rawKeyword !== "string") continue;
      const normalized = normalizeKeywordValue(rawKeyword);
      const compareKey = normalized.toLowerCase();
      if (!normalized || searchKeywordSuggestions.has(compareKey)) continue;
      searchKeywordSuggestions.set(compareKey, normalized);
    }
  }

  return {
    tagSuggestions: Array.from(tagSuggestions.values()).map((value) => ({
      value,
      label: value,
      source: "existing_tag",
      sourceLabel: "existing tag",
    })),
    searchKeywordSuggestions: Array.from(searchKeywordSuggestions.values()).map(
      (value) => ({
        value,
        label: value,
        source: "existing_keyword",
        sourceLabel: "existing keyword",
      }),
    ),
  };
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);

  const { data: catalogTerms, error: catalogTermsError } = await adminClient
    .from("catalog_terms")
    .select("kind, normalized_value, display_value")
    .eq("is_active", true)
    .order("display_value", { ascending: true });

  if (!catalogTermsError) {
    return {
      tagSuggestions: (catalogTerms ?? [])
        .filter((row) => row.kind === "tag")
        .map((row) => ({
          value:
            typeof row.normalized_value === "string"
              ? row.normalized_value
              : "",
          label:
            typeof row.display_value === "string"
              ? row.display_value
              : typeof row.normalized_value === "string"
                ? row.normalized_value
                : "",
          source: "existing_tag" as const,
          sourceLabel: "existing tag" as const,
        }))
        .filter((row) => row.value.length > 0),
      searchKeywordSuggestions: (catalogTerms ?? [])
        .filter((row) => row.kind === "search_keyword")
        .map((row) => ({
          value: typeof row.display_value === "string" ? row.display_value : "",
          label:
            typeof row.display_value === "string"
              ? row.display_value
              : typeof row.normalized_value === "string"
                ? row.normalized_value
                : "",
          source: "existing_keyword" as const,
          sourceLabel: "existing keyword" as const,
        }))
        .filter((row) => row.value.length > 0),
    };
  }

  if (catalogTermsError.code !== "42P01") {
    throw createError({
      statusCode: 500,
      statusMessage: catalogTermsError.message,
    });
  }

  const { data: products, error: productsError } = await adminClient
    .from("products")
    .select("tag_keys, search_keywords");

  if (productsError) {
    throw createError({
      statusCode: 500,
      statusMessage: productsError.message,
    });
  }

  return buildSuggestionsFromProducts(
    (products ?? []) as Array<Record<string, unknown>>,
  );
});
