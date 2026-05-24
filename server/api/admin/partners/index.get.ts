/**
 * GET /api/admin/partners
 *
 * Admin partner directory listing with optional filters and pagination.
 *
 * Query params:
 *   directoryType  — "store" | "service" | "contractor" (omit = all)
 *   isPublic       — "true" | "false" (omit = all)
 *   isVerified     — "true" | "false" (omit = all)
 *   search         — plain-text search on name_th / name_en / slug
 *   page           — 0-based page index (default 0)
 *   pageSize       — items per page (default 20, max 100)
 */
import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_LIST_SELECT,
  mapAdminPartnerListItem,
} from "~~/server/utils/admin-partners";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
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

  const isPublicFilter =
    q.isPublic === "true" ? true : q.isPublic === "false" ? false : null;

  const isVerifiedFilter =
    q.isVerified === "true" ? true : q.isVerified === "false" ? false : null;

  const search =
    typeof q.search === "string" && q.search.trim().length > 0
      ? q.search.trim()
      : null;

  let request = adminClient
    .from("partner_profiles")
    .select(ADMIN_PARTNER_LIST_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (directoryType) request = request.eq("directory_type", directoryType);
  if (isPublicFilter !== null) request = request.eq("is_public", isPublicFilter);
  if (isVerifiedFilter !== null) request = request.eq("is_verified", isVerifiedFilter);
  if (search) {
    request = request.or(
      `name_th.ilike.%${search}%,name_en.ilike.%${search}%,slug.ilike.%${search}%`,
    );
  }

  const { data, error } = await request;

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const all = (data ?? []).map((row) =>
    mapAdminPartnerListItem(row as Record<string, unknown>),
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
