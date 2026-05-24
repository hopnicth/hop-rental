/**
 * GET /api/partners
 *
 * Public partner directory listing. Only is_public=TRUE profiles are returned.
 * Private fields (kyc_documents, verified_notes, internal_notes) are NEVER
 * included — enforced by the SELECT string, not relying on RLS alone.
 *
 * Query params:
 *   directoryType  — "store" | "service" | "contractor" (omit = all)
 *   category       — main_category_key exact match (omit = all)
 *   serviceArea    — service_areas array contains filter (omit = all)
 *   isVerified     — "true" to show verified only (omit = all)
 *   isFeatured     — "true" to show featured only (omit = all)
 *   page           — 0-based page index (default 0)
 *   pageSize       — items per page (default 20, max 50)
 */
import { createError, defineEventHandler, getQuery } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  PUBLIC_PARTNER_LIST_SELECT,
  mapPublicPartnerCard,
} from "~~/server/utils/admin-partners";

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

  const category =
    typeof q.category === "string" && q.category.trim().length > 0
      ? q.category.trim()
      : null;

  const serviceArea =
    typeof q.serviceArea === "string" && q.serviceArea.trim().length > 0
      ? q.serviceArea.trim()
      : null;

  const verifiedOnly = q.isVerified === "true";
  const featuredOnly = q.isFeatured === "true";

  // service_role bypasses RLS — we enforce is_public manually and use the
  // public SELECT string to ensure no private fields are ever returned.
  let request = client
    .from("partner_profiles")
    .select(PUBLIC_PARTNER_LIST_SELECT)
    .eq("is_public", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (directoryType) request = request.eq("directory_type", directoryType);
  if (category) request = request.eq("main_category_key", category);
  if (serviceArea) request = request.contains("service_areas", [serviceArea]);
  if (verifiedOnly) request = request.eq("is_verified", true);
  if (featuredOnly) request = request.eq("is_featured", true);

  const { data, error } = await request;

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const all = (data ?? []).map((row) =>
    mapPublicPartnerCard(row as Record<string, unknown>),
  );
  const total = all.length;
  const start = page * pageSize;

  return {
    items: all.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  };
});
