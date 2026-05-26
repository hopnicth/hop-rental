/**
 * GET /api/partners/home
 *
 * Public endpoint — returns a daily-shuffled sample of public partner profiles
 * for the Home Partner Network section.
 *
 * Query params:
 *   limit — number of partners to return (default 15, max 30)
 *
 * Private fields are never selected — enforced by PUBLIC_PARTNER_LIST_SELECT.
 *
 * Shuffle strategy:
 *   - Featured partners shuffle among themselves (always appear first)
 *   - Remaining partners shuffle after
 *   - Seed = current UTC date YYYY-MM-DD → stable for the whole day
 *   - Server-side deterministic hash shuffle; no DB random calls
 */
import { createError, defineEventHandler, getQuery } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  PUBLIC_PARTNER_LIST_SELECT,
  mapPublicPartnerCard,
} from "~~/server/utils/admin-partners";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;

function hashText(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function deterministicShuffle<T>(
  items: T[],
  seed: string,
  getKey: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const scoreA = hashText(`${seed}:${getKey(a)}`);
    const scoreB = hashText(`${seed}:${getKey(b)}`);
    return scoreA !== scoreB
      ? scoreA - scoreB
      : getKey(a).localeCompare(getKey(b));
  });
}

export default defineEventHandler(async (event) => {
  const client = serverSupabaseServiceRole(event);
  const q = getQuery(event);

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(q.limit ?? DEFAULT_LIMIT)),
  );

  const { data, error } = await client
    .from("partner_profiles")
    .select(PUBLIC_PARTNER_LIST_SELECT)
    .eq("is_public", true)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const all = (data ?? []).map((row) =>
    mapPublicPartnerCard(row as Record<string, unknown>),
  );

  // Server-side deterministic daily shuffle, seeded by UTC date (YYYY-MM-DD).
  // Featured partners shuffle among themselves first; non-featured follow.
  // Same seed for the entire day → SSR and client hydration always agree.
  const seed = new Date().toISOString().slice(0, 10);

  const featured = all.filter((p) => p.isFeatured);
  const rest = all.filter((p) => !p.isFeatured);

  const shuffled = [
    ...deterministicShuffle(featured, seed, (p) => p.id),
    ...deterministicShuffle(rest, seed, (p) => p.id),
  ];

  return { items: shuffled.slice(0, limit) };
});
