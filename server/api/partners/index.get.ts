/**
 * GET /api/partners
 *
 * Public partner directory listing. Only is_public=TRUE profiles are returned.
 * Private fields (kyc_documents, verified_notes, internal_notes, search_keywords)
 * are NEVER included in the response — enforced by the SELECT string and mapper.
 *
 * Uses the service-role client (server-side only) so that search_keywords can be
 * used as a filter target without being granted to the public anon role.
 * search_keywords is NOT present in PUBLIC_PARTNER_LIST_SELECT and is NOT mapped
 * into the response — it is filter-only, internal metadata.
 *
 * Query params:
 *   directoryType  — "store" | "service" | "contractor" (omit = all)
 *   category       — LEGACY: matches main_category_key OR secondary_category_keys (omit = all)
 *   taxCategory    — taxonomy level-0 slug filter (partner_category_assignments); omit = all
 *   taxSubcategory — taxonomy level-1 slug; only effective with a matching parent taxCategory
 *   serviceArea    — service_areas array contains filter (omit = all)
 *   isVerified     — "true" to show verified only (omit = all)
 *   isFeatured     — "true" to show featured only (omit = all)
 *   q              — text search across name_th, name_en, tagline_th, search_keywords
 *   page           — 0-based page index (default 0)
 *   pageSize       — items per page (default 20, max 50)
 *
 * `category` (legacy) and `taxCategory`/`taxSubcategory` are independent filters:
 * when both are present they compose with AND. Legacy behaviour is unchanged.
 */
import { createError, defineEventHandler, getQuery } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  PUBLIC_PARTNER_LIST_SELECT,
  mapPublicPartnerCard,
  sanitisePublicCategoryParam,
  sanitisePublicSearchQuery,
  buildPublicCategoryOrFilter,
  buildPublicTextSearchOrFilter,
} from "~~/server/utils/admin-partners";
import {
  fetchPublicTaxonomyForPartners,
  resolvePartnerIdsForTaxonomy,
} from "~~/server/utils/admin-partner-categories";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export default defineEventHandler(async (event) => {
  const client = serverSupabaseServiceRole(event);
  const q = getQuery(event);

  const page = Math.max(0, Number(q.page ?? 0));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(q.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  const directoryType =
    typeof q.directoryType === "string" &&
    ["store", "service", "contractor"].includes(q.directoryType)
      ? q.directoryType
      : null;

  // sanitisePublicCategoryParam accepts only [a-z0-9_] — prevents PostgREST injection.
  const category = sanitisePublicCategoryParam(q.category);

  const serviceArea =
    typeof q.serviceArea === "string" && q.serviceArea.trim().length > 0
      ? q.serviceArea.trim()
      : null;

  const verifiedOnly = q.isVerified === "true";
  const featuredOnly = q.isFeatured === "true";

  // sanitisePublicSearchQuery strips PostgREST syntax chars and trims whitespace.
  const searchQuery = sanitisePublicSearchQuery(q.q);

  // service_role bypasses RLS — we enforce is_public manually and use the
  // public SELECT string to ensure no private fields are ever returned.
  // search_keywords is NOT in PUBLIC_PARTNER_LIST_SELECT so it never reaches
  // the client, but the service-role client can still filter on it server-side.
  let request = client
    .from("partner_profiles")
    .select(PUBLIC_PARTNER_LIST_SELECT)
    .eq("is_public", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (directoryType) request = request.eq("directory_type", directoryType);
  // LEGACY category — matches main_category_key OR secondary_category_keys contains the value.
  if (category) request = request.or(buildPublicCategoryOrFilter(category));
  if (serviceArea) request = request.contains("service_areas", [serviceArea]);
  if (verifiedOnly) request = request.eq("is_verified", true);
  if (featuredOnly) request = request.eq("is_featured", true);
  // Text search across name fields + server-side search_keywords (not exposed in response).
  if (searchQuery)
    request = request.or(buildPublicTextSearchOrFilter(searchQuery));

  // Taxonomy filter (independent of legacy category; composes with AND).
  // null → no filter; [] → no match (empty result); [ids] → restrict to those partners.
  // The `.eq("is_public", true)` above still applies, so non-public partners cannot
  // leak even if a service-role assignment read matched their id.
  const taxonomyPartnerIds = await resolvePartnerIdsForTaxonomy(client, {
    taxCategory: q.taxCategory,
    taxSubcategory: q.taxSubcategory,
  });
  if (taxonomyPartnerIds !== null) {
    request = request.in("id", taxonomyPartnerIds);
  }

  const { data, error } = await request;

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const all = (data ?? []).map((row) =>
    mapPublicPartnerCard(row as Record<string, unknown>),
  );
  const total = all.length;
  const start = page * pageSize;
  const items = all.slice(start, start + pageSize);

  // Attach display-only taxonomy to the paginated page items only (bounded cost).
  // All items are already is_public partners; helper filters to active/public categories.
  const taxonomyByPartner = await fetchPublicTaxonomyForPartners(
    client,
    items.map((item) => item.id),
  );
  for (const item of items) {
    item.taxonomy = taxonomyByPartner.get(item.id) ?? [];
  }

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  };
});
